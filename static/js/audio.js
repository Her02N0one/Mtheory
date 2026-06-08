/**
 * audio.js — Web Audio API pitch detection module.
 *
 * Public API:
 *   startListening(callback)  → Promise<boolean>
 *   stopListening()
 *
 * The callback receives: { noteName, shape, color, midi }
 *
 * Algorithm: autocorrelation (pitch period estimation).
 * Standard approach used in open-source tuner tools.
 */

// Mirror of Python NOTE_SYSTEM — used for client-side color/shape lookup
const NOTE_SYSTEM = {
  "C":  { shape: "square",  color: "#ee0043" },
  "G":  { shape: "circle",  color: "#ff3c00" },
  "D":  { shape: "square",  color: "#ff7b00" },
  "A":  { shape: "circle",  color: "#ffb700" },
  "E":  { shape: "square",  color: "#f7dd00" },
  "B":  { shape: "circle",  color: "#9ad100" },
  "F#": { shape: "square",  color: "#00ba35" },
  "Db": { shape: "circle",  color: "#00ad94" },
  "Ab": { shape: "square",  color: "#0099e3" },
  "Eb": { shape: "circle",  color: "#2b62b5" },
  "Bb": { shape: "square",  color: "#8c379d" },
  "F":  { shape: "circle",  color: "#bb0092" },
};

const CHROMATIC = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Guitar MIDI range: low E2 = 40, high E4 fret 24 ≈ 88
const GUITAR_MIDI_MIN = 40;
const GUITAR_MIDI_MAX = 88;

// Detection state
let _audioCtx       = null;
let _analyser       = null;
let _source         = null;
let _intervalId     = null;
let _isListening    = false;

// Stability: require the same pitch class N consecutive cycles before firing,
// each detection within ±25 cents of the previous — kills transient glitches.
let _lastPC       = null;   // pitch class 0-11
let _lastCents    = 0;
let _stableCount  = 0;
const STABLE_NEEDED = 4;    // ~120 ms at 30 ms poll interval
const CENTS_TOL     = 25;   // max cent drift between consecutive frames

// Multi-note mode: when set, also check for a second simultaneous pitch
let _multiNotes   = null;  // null | [midiA, midiB] — the two expected MIDI values
let _chordFiredAt = 0;     // timestamp of last chord fire, to debounce

// ---------------------------------------------------------------------------
// Chord / simultaneous-note detection (FORWARD-LOOKING — not yet wired to
// any stage or queue logic).  When the interval-track stages are implemented,
// setMultiNotePair will be called with the lo/hi MIDI values of an interval
// task so the mic can detect both notes ringing at once, not just sequentially.
// ---------------------------------------------------------------------------

/** Set or clear the pair of MIDI notes to listen for simultaneously.
 *  When set, the poll loop will also try detectSimultaneous() before the
 *  normal single-note stability check. */
function setMultiNotePair(midiA, midiB) {
  _multiNotes = (midiA != null && midiB != null) ? [midiA, midiB] : null;
}
function clearMultiNotePair() { _multiNotes = null; }

/**
 * Try to detect whether a second frequency is present in the FFT alongside
 * the primary detected pitch.  Returns true if the second expected note
 * has measurable energy at its fundamental.
 */
function _secondPitchPresent(targetMidi) {
  if (!_analyser) return false;
  const fftSize = 2048;
  const freqData = new Float32Array(fftSize / 2);
  _analyser.getFloatFrequencyData(freqData);
  const sr  = _audioCtx.sampleRate;
  const bin = sr / fftSize;           // Hz per FFT bin
  const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
  const targetBin  = Math.round(targetFreq / bin);
  // Look at ±4 bins (~±86 Hz at 44.1kHz/2048) around the expected fundamental
  let peak = -Infinity;
  for (let b = Math.max(0, targetBin - 4); b <= Math.min(freqData.length - 1, targetBin + 4); b++) {
    if (freqData[b] > peak) peak = freqData[b];
  }
  // dBFS threshold: above -55 dB is audible enough
  return peak > -55;
}

/**
 * Autocorrelation pitch detector.
 * @param {Float32Array} buf        — PCM audio buffer
 * @param {number}       sampleRate
 * @returns {number} Fundamental frequency in Hz, or -1 if no pitch detected.
 */
function autoCorrelate(buf, sampleRate) {
  const N = buf.length;

  // RMS — reject signals that are too quiet (raised threshold vs original 0.012)
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.02) return -1;

  // Trim leading/trailing near-silence to improve period estimation
  let r1 = 0, r2 = N - 1;
  const TRIM = 0.2;
  for (let i = 0; i < N / 2; i++) { if (Math.abs(buf[i]) < TRIM) { r1 = i; break; } }
  for (let i = 1; i < N / 2; i++) { if (Math.abs(buf[N - i]) < TRIM) { r2 = N - i; break; } }

  const trimmed = buf.slice(r1, r2);
  const len     = trimmed.length;
  const c       = new Float32Array(len).fill(0);

  // Compute autocorrelation
  for (let lag = 0; lag < len; lag++) {
    for (let j = 0; j < len - lag; j++) {
      c[lag] += trimmed[j] * trimmed[j + lag];
    }
  }

  // Find first dip (end of initial negative slope) then highest peak
  let d = 0;
  while (d < len - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -Infinity, maxPos = -1;
  for (let i = d; i < len; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  if (maxPos <= 0 || maxPos >= len - 1) return -1;

  // Parabolic interpolation for sub-sample precision
  const x1 = c[maxPos - 1], x2 = c[maxPos], x3 = c[maxPos + 1];
  const denom = 2 * (2 * x2 - x1 - x3);
  if (denom === 0) return -1;
  const refined = maxPos + (x3 - x1) / denom;

  return sampleRate / refined;
}

/**
 * Enumerate available audio input devices.
 * Returns an array of { deviceId, label } objects.
 * Labels are only populated after the user has granted mic permission.
 * @returns {Promise<Array<{deviceId: string, label: string}>>}
 */
async function listAudioInputs() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audioinput')
    .map(d => ({
      deviceId: d.deviceId,
      label:    d.label || `Input ${d.deviceId.slice(0, 8)}…`,
    }));
}

/**
 * Convert a frequency to note information using the NOTE_SYSTEM dictionary.
 * @param {number} freq — Hz
 * @returns {object|null}
 */
function freqToNoteInfo(freq) {
  if (freq <= 0) return null;
  const midiExact = 12 * Math.log2(freq / 440) + 69;
  const midi      = Math.round(midiExact);
  if (midi < GUITAR_MIDI_MIN || midi > GUITAR_MIDI_MAX) return null;
  const noteName = CHROMATIC[((midi % 12) + 12) % 12];
  const meta     = NOTE_SYSTEM[noteName];
  if (!meta) return null;
  const centsOff = Math.round((midiExact - midi) * 100);
  return { midi, noteName, centsOff, ...meta };
}

// Semitone offset from C within an octave (for MIDI calculation)
const _NOTE_SEMITONE = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
  "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
  "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
};

// ---------------------------------------------------------------------------
// Karplus-Strong playback
// ---------------------------------------------------------------------------
// A SINGLE persistent AudioContext is shared by every playback path (single
// notes AND progressions).  Spinning up a fresh context per pluck the way the
// original code did breaks for chords/progressions: a ii-V-I demo is 9+ plucks
// and browsers cap concurrent contexts (~6 in Chrome).  One context + scheduled
// start() times lets us strum and sequence freely.

let _playCtx = null;

/** Lazily create (and resume) the shared playback AudioContext. */
function _getPlayCtx() {
  if (!_playCtx || _playCtx.state === 'closed') {
    _playCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_playCtx.state === 'suspended') _playCtx.resume();
  return _playCtx;
}

/**
 * Render a Karplus-Strong guitar pluck into an offline AudioBuffer.
 * Pure DSP — no scheduling, no node graph.  Shared by every playback path.
 * @param {number} freq  — fundamental frequency in Hz
 * @param {AudioContext} ctx
 * @param {number} [dur] — buffer length in seconds (default 3.0)
 * @returns {AudioBuffer}
 */
function _renderPluckBuffer(freq, ctx, dur) {
  dur = dur || 3.0;
  const sr       = ctx.sampleRate;
  const nSamples = Math.floor(sr * dur);
  const N        = Math.max(1, Math.round(sr / freq));  // delay line = one period

  // Damping: lower notes sustain longer, higher notes damp faster
  const g = freq < 110 ? 0.9998 : freq < 220 ? 0.9996 : freq < 440 ? 0.9993 : 0.999;

  // Seed delay line with band-limited noise (softer than pure white)
  const delayLine = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    delayLine[i] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  // Karplus-Strong: recirculate through averaging (low-pass) filter
  const outData = new Float32Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    const idx  = i % N;
    const next = (idx + 1) % N;
    outData[i]     = delayLine[idx];
    delayLine[idx] = g * 0.5 * (outData[i] + delayLine[next]);
  }

  // Short fade-in to avoid a click on attack
  const FADE_IN = Math.min(64, N);
  for (let i = 0; i < FADE_IN; i++) outData[i] *= i / FADE_IN;

  const buf = ctx.createBuffer(1, nSamples, sr);
  buf.copyToChannel(outData, 0);
  return buf;
}

/**
 * Schedule a single pluck of a MIDI note at absolute context time `when`.
 * @param {AudioContext} ctx
 * @param {number} midi
 * @param {number} when    — ctx.currentTime-based start time (seconds)
 * @param {number} [dur]   — ring length (default 3.0 s)
 * @param {number} [gain]  — peak gain (default 0.55)
 */
function _schedulePluck(ctx, midi, when, dur, gain) {
  dur  = dur  || 3.0;
  gain = gain != null ? gain : 0.55;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const buf  = _renderPluckBuffer(freq, ctx, dur);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, when);
  gainNode.gain.exponentialRampToValueAtTime(0.001, when + dur - 0.1);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start(when);
}

/**
 * Play a single Karplus-Strong note ("Hear it" button).
 * @param {string} noteName  — e.g. "C", "F#", "Bb"
 * @param {number} [octave]  — default 4
 */
function playReferenceNote(noteName, octave = 4) {
  const semitone = _NOTE_SEMITONE[noteName];
  if (semitone === undefined) return;
  const midiNum = (octave + 1) * 12 + semitone;
  const ctx     = _getPlayCtx();
  _schedulePluck(ctx, midiNum, ctx.currentTime, 3.0, 0.72);
}

/**
 * Strum one voicing as a chord starting at context time `when`.
 * The strum always sweeps from the LOWEST string index to the highest
 * (a downstroke), independent of how the notes are pitch-sorted — so the
 * physical low-to-high E→e attack order is preserved.
 * @param {Array} voicing — entries shaped {si, note:{midi}} (a task.voicing)
 * @param {number} [when] — ctx start time (default: now)
 * @param {number} [strumMs] — per-string stagger in ms (default 30)
 * @returns {number} the `when` time used (seconds)
 */
function playVoicing(voicing, when, strumMs) {
  const ctx = _getPlayCtx();
  if (when == null)    when = ctx.currentTime;
  if (strumMs == null) strumMs = 30;
  // Sweep by physical string index (si), low → high = downstroke.
  const ordered = voicing.slice().sort(function(a, b) { return a.si - b.si; });
  ordered.forEach(function(v, i) {
    _schedulePluck(ctx, v.note.midi, when + (i * strumMs) / 1000, 3.0, 0.55);
  });
  return when;
}

/**
 * Schedule a sequence of voicings, each strummed, spaced by chordGapMs.
 * Generic — any chord stage (voice_lead / chord_shape / box_chords) can use it.
 * @param {Array<Array>} voicings — array of task.voicing arrays, in play order
 * @param {object} [opts]
 *   opts.strumMs    — per-string strum stagger (default 30)
 *   opts.chordGapMs — onset-to-onset spacing between chords (default 550)
 *   opts.onChord    — fn(index) fired (via setTimeout) as each chord strikes,
 *                     for UI sync (e.g. highlighting the chord on the fretboard)
 * @returns {number} total scheduled duration in ms (for re-enabling UI)
 */
function playProgression(voicings, opts) {
  opts = opts || {};
  const strumMs    = opts.strumMs    != null ? opts.strumMs    : 30;
  const chordGapMs = opts.chordGapMs != null ? opts.chordGapMs : 550;
  const onChord    = opts.onChord;
  const ctx = _getPlayCtx();
  const t0  = ctx.currentTime + 0.05;   // small lead-in so the first chord isn't clipped

  voicings.forEach(function(voi, idx) {
    const when = t0 + (idx * chordGapMs) / 1000;
    playVoicing(voi, when, strumMs);
    if (typeof onChord === 'function') {
      const delayMs = (when - ctx.currentTime) * 1000;
      setTimeout(function() { onChord(idx); }, Math.max(0, delayMs));
    }
  });
  return voicings.length * chordGapMs;
}

/**
 * Start microphone capture and pitch detection.
 * @param {function} onNoteDetected — called with noteInfo when a stable note is found
 * @param {string}   [deviceId]     — optional audio input device ID
 * @returns {Promise<boolean>} true if microphone was granted
 */
async function startListening(onNoteDetected, deviceId) {
  if (_isListening) return true;

  // Build audio constraints — request the specific device if provided
  const audioConstraints = deviceId
    ? { deviceId: { exact: deviceId }, echoCancellation: false,
        autoGainControl: false, noiseSuppression: false }
    : { echoCancellation: false, autoGainControl: false, noiseSuppression: false };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  } catch (_) {
    return false;
  }

  _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  _analyser = _audioCtx.createAnalyser();
  _analyser.fftSize = 2048;
  _source = _audioCtx.createMediaStreamSource(stream);
  _source.connect(_analyser);

  const buffer = new Float32Array(_analyser.fftSize);
  _isListening = true;

  _intervalId = setInterval(() => {
    _analyser.getFloatTimeDomainData(buffer);
    const freq     = autoCorrelate(buffer, _audioCtx.sampleRate);
    const noteInfo = freqToNoteInfo(freq);

    // Chord mode: if both expected notes have FFT energy, fire immediately without
    // waiting for autocorrelation stability (autocorrelator often locks on one pitch)
    if (_multiNotes) {
      const [mA, mB] = _multiNotes;
      const now = Date.now();
      if (now - _chordFiredAt > 800 && _secondPitchPresent(mA) && _secondPitchPresent(mB)) {
        _chordFiredAt = now;
        const loMidi  = Math.min(mA, mB);
        const loName  = CHROMATIC[((loMidi % 12) + 12) % 12];
        const loMeta  = NOTE_SYSTEM[loName] || {};
        onNoteDetected({ midi: loMidi, noteName: loName, centsOff: 0, chord: true,
                         chordPartner: Math.max(mA, mB), ...loMeta });
        return;
      }
    }

    if (noteInfo) {
      const pc = ((noteInfo.midi % 12) + 12) % 12;
      const centDrift = Math.abs((noteInfo.centsOff || 0) - _lastCents);
      if (pc === _lastPC && centDrift <= CENTS_TOL) {
        _stableCount++;
      } else {
        _lastPC      = pc;
        _lastCents   = noteInfo.centsOff || 0;
        _stableCount = 1;
      }
      if (_stableCount >= STABLE_NEEDED) {
        _stableCount = 0;
        onNoteDetected(noteInfo);
      }
    }
  }, 30);  // poll every 30 ms

  return true;
}

/**
 * Reset last-note tracking state without stopping the mic.
 * Call this when advancing to a new target so the stability counter restarts.
 */
function resetLastNote() {
  _lastPC      = null;
  _lastCents   = 0;
  _stableCount = 0;
}

/**
 * Stop microphone capture and clean up Audio API resources.
 */
function stopListening() {
  if (_intervalId)  { clearInterval(_intervalId); _intervalId = null; }
  if (_source)      { _source.disconnect(); _source = null; }
  if (_audioCtx)    { _audioCtx.close(); _audioCtx = null; }
  _isListening  = false;
  _lastNote     = null;
  _stableCount  = 0;
  _chordFiredAt = 0;
}
