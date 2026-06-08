/* keyboard.js — Mtheory Keyboard component (Phase 1, self-contained)
 *
 * A playable piano widget for the Content Engine. Renders a configurable octave
 * range, plays notes (built-in Karplus-Strong by default), and emits the locked
 * `note_played` / `key_quizzed` event payloads defined in CONTENT_ENGINE.md §1d.
 *
 * Self-contained on purpose: it carries its own pitch math (matching theory.js
 * conventions) and a tiny synth, so it can be developed/tested without the rest
 * of the engine. To reuse audio.js later, pass `audio: (midi, freq) => ...`.
 *
 * Conventions (must match theory.js / note_system.py):
 *   _CHROM index = pitchClass = midi % 12   (C = 0, G = 7)
 *   noteName     = flat-preferred           (Db, Eb, Ab, Bb, lone F#)
 *   octave       = floor(midi / 12) - 1     (C4 = MIDI 60 = middle C)
 *   wheelIndex   = Circle-of-Fifths order   (C = 0, G = 1) — color/shape only
 */
(function (global) {
  "use strict";

  // --- Pitch tables (mirror theory.js / note_system.py) -------------------
  const CHROM = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const COF = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
  const ENHARMONIC = {
    "C#": "Db", "D#": "Eb", "E#": "F", "G#": "Ab", "A#": "Bb",
    "B#": "C", "Cb": "B", "Fb": "E", "Gb": "F#",
  };
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const BLACK_PCS = [1, 3, 6, 8, 10];       // Db Eb F# Ab Bb

  // Color/shape standard (mirror note_system.py NOTE_SYSTEM). Keyed by canonical
  // flat-preferred name so the keyboard renders the same chips as the fretboard.
  const NOTE_STYLE = {
    "C":  { color: "#ee0043", shape: "square" },
    "G":  { color: "#ff3c00", shape: "circle" },
    "D":  { color: "#ff7b00", shape: "square" },
    "A":  { color: "#ffb700", shape: "circle" },
    "E":  { color: "#f7dd00", shape: "square" },
    "B":  { color: "#9ad100", shape: "circle" },
    "F#": { color: "#00ba35", shape: "square" },
    "Db": { color: "#00ad94", shape: "circle" },
    "Ab": { color: "#0099e3", shape: "square" },
    "Eb": { color: "#2b62b5", shape: "circle" },
    "Bb": { color: "#8c379d", shape: "square" },
    "F":  { color: "#bb0092", shape: "circle" },
  };

  // Pick black/white text for legibility against a given hex fill.
  function readableText(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#15151c" : "#ffffff";
  }

  // --- Pitch helpers ------------------------------------------------------
  function normalizeName(name) {
    if (CHROM.indexOf(name) !== -1) return name;
    return ENHARMONIC[name] || name;
  }
  function pitchClassOf(midi) {
    return ((midi % 12) + 12) % 12;
  }
  // Move `midi` in `dir` (-1 down / +1 up) until it lands on a white key.
  function snapWhite(midi, dir) {
    let m = midi;
    while (WHITE_PCS.indexOf(pitchClassOf(m)) === -1) m += dir;
    return m;
  }
  function octaveOf(midi) {
    return Math.floor(midi / 12) - 1;
  }
  function nameOf(midi) {
    return CHROM[pitchClassOf(midi)];
  }
  function wheelIndexOf(midi) {
    return COF.indexOf(nameOf(midi));
  }
  function sciOf(midi) {
    return nameOf(midi) + octaveOf(midi);
  }
  function freqOf(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  // "C4" / "Db5" / "C#4" -> MIDI, enharmonic-tolerant. Returns null if unparsable.
  function midiOfSci(sci) {
    if (typeof sci !== "string") return null;
    const m = sci.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
    if (!m) return null;
    const name = normalizeName(m[1][0].toUpperCase() + m[1].slice(1));
    const pc = CHROM.indexOf(name);
    if (pc === -1) return null;
    return (parseInt(m[2], 10) + 1) * 12 + pc;
  }

  // Build the absolute-pitch payload shared by all instruments (§1d).
  function notePayload(midi) {
    return {
      midi: midi,
      pitchClass: pitchClassOf(midi),
      noteName: nameOf(midi),
      octave: octaveOf(midi),
      scientificPitch: sciOf(midi),
      frequency: Math.round(freqOf(midi) * 100) / 100,
      wheelIndex: wheelIndexOf(midi),
    };
  }

  // --- Built-in audio (Karplus-Strong pluck) ------------------------------
  let _ctx = null;
  function audioCtx() {
    if (!_ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) _ctx = new AC();
    }
    return _ctx;
  }
  function defaultPluck(midi, freq) {
    const ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const len = Math.floor(sr * 1.4);
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const out = 0.5 * (cur + prev);
      ring[idx] = out * 0.996;
      prev = out;
      data[i] = out;
      idx = (idx + 1) % N;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.55;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  // --- Component ----------------------------------------------------------
  class Keyboard {
    /**
     * @param {HTMLElement|string} container element or selector
     * @param {object} opts
     *   octaves     {number}  full octaves to render (default 3)
     *   startOctave {number}  octave of the leftmost C (default 3)
     *   labels      {string}  'none' | 'naturals' | 'all'  (default 'naturals')
     *   highlight   {string|string[]} note name(s)/sci pitch(es) to mark
     *   quiz        {object}  { target: 'C4' }  — quiz mode, emits key_quizzed
     *   audio       {boolean|function} true (default), false, or (midi, freq) => {}
     *   onEvent     {function} callback receiving every emitted event object
     */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("Keyboard: container not found");

      this.octaves = opts.octaves != null ? opts.octaves : 3;
      this.startOctave = opts.startOctave != null ? opts.startOctave : 3;
      this.labels = opts.labels || "naturals";
      this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : null;
      this.quiz = opts.quiz || null;

      if (opts.audio === false) this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = defaultPluck;

      // Range: explicit low/high note (e.g. "E2".."A4") wins; otherwise the
      // classic full-octaves-from-C layout. Endpoints snap to white keys so the
      // neck always begins and ends on a natural.
      const lo = opts.low != null ? midiOfSci(this._toSci(opts.low)) : null;
      const hi = opts.high != null ? midiOfSci(this._toSci(opts.high)) : null;
      if (lo != null || hi != null) {
        const a = lo != null ? lo : (this.startOctave + 1) * 12;
        const b = hi != null ? hi : a + this.octaves * 12;
        this.startMidi = snapWhite(a, -1);
        this.endMidi = snapWhite(b, +1);
      } else {
        this.startMidi = (this.startOctave + 1) * 12; // C{startOctave}
        this.endMidi = this.startMidi + this.octaves * 12; // inclusive top C
      }
      this.highlightSet = this._toMidiSet(opts.highlight);
      this.quizTargetMidi = this.quiz ? midiOfSci(this._toSci(this.quiz.target)) : null;

      this._keyEls = new Map(); // midi -> element
      this.render();
    }

    // Accept 'C4' | ['C4','E4'] | 'C' (no octave -> all matching pcs in range)
    _toMidiSet(spec) {
      const set = new Set();
      if (spec == null) return set;
      const list = Array.isArray(spec) ? spec : [spec];
      list.forEach((item) => {
        const sci = this._toSci(item);
        const midi = midiOfSci(sci);
        if (midi != null) { set.add(midi); return; }
        // bare note name -> every octave in range
        const name = normalizeName(item);
        const pc = CHROM.indexOf(name);
        if (pc !== -1) {
          for (let m = this.startMidi; m <= this.endMidi; m++) {
            if (pitchClassOf(m) === pc) set.add(m);
          }
        }
      });
      return set;
    }
    _toSci(item) {
      return /\d/.test(item) ? item : item; // passthrough; midiOfSci handles octave-bearing
    }

    render() {
      this.root.classList.add("mk-keyboard");
      this.root.innerHTML = "";

      const whiteRow = document.createElement("div");
      whiteRow.className = "mk-white-row";

      // First pass: white keys define the layout grid.
      const whites = [];
      for (let m = this.startMidi; m <= this.endMidi; m++) {
        if (WHITE_PCS.indexOf(pitchClassOf(m)) !== -1) whites.push(m);
      }
      const whiteIndex = new Map();
      whites.forEach((m, i) => whiteIndex.set(m, i));

      whites.forEach((m) => {
        const key = this._makeKey(m, "white");
        whiteRow.appendChild(key);
      });
      this.root.appendChild(whiteRow);

      // Second pass: black keys, absolutely positioned between whites.
      const blackLayer = document.createElement("div");
      blackLayer.className = "mk-black-layer";
      const unit = 100 / whites.length; // % width of one white key
      // Black key = half a white unit so the white gap between two adjacent
      // black keys (e.g. Db|Eb) is exactly one black-key wide, not a sliver.
      this.root.style.setProperty("--mk-black-w", unit / 2 + "%");
      for (let m = this.startMidi; m <= this.endMidi; m++) {
        if (BLACK_PCS.indexOf(pitchClassOf(m)) === -1) continue;
        const leftWhite = whiteIndex.get(m - 1); // white key just below
        if (leftWhite == null) continue;
        const key = this._makeKey(m, "black");
        key.style.left = (leftWhite + 1) * unit + "%";
        blackLayer.appendChild(key);
      }
      this.root.appendChild(blackLayer);
    }

    _makeKey(midi, color) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mk-key mk-key--" + color;
      el.dataset.midi = String(midi);
      el.dataset.note = sciOf(midi);

      const name = nameOf(midi);
      const style = NOTE_STYLE[name];
      const isHighlight = this.highlightSet.has(midi);
      if (isHighlight) {
        el.classList.add("mk-key--highlight");
        // Tint the highlighted key with the note's own standard color.
        if (style) el.style.setProperty("--mk-note-color", style.color);
      }
      if (this.quizTargetMidi != null) el.classList.add("mk-key--quiz");

      const showLabel =
        this.labels === "all" ||
        (this.labels === "naturals" && color === "white");
      if (showLabel && style) {
        // Colored shape chip — the same color/shape standard as the fretboard.
        const marker = document.createElement("span");
        marker.className = "mk-marker mk-marker--" + style.shape;
        marker.style.background = style.color;
        marker.style.color = readableText(style.color);
        marker.textContent = name;
        el.appendChild(marker);

        // Octave number under each C, kept separate so registers stay legible.
        if (pitchClassOf(midi) === 0) {
          const reg = document.createElement("span");
          reg.className = "mk-reg";
          reg.textContent = String(octaveOf(midi));
          el.appendChild(reg);
        }
      }

      el.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        this._press(midi, el);
      });
      this._keyEls.set(midi, el);
      return el;
    }

    _press(midi, el) {
      this._play(midi, freqOf(midi));
      el.classList.add("mk-key--active");
      setTimeout(() => el.classList.remove("mk-key--active"), 140);

      if (this.quizTargetMidi != null) {
        this._emitQuiz(midi);
      } else {
        this._emit("note_played", notePayload(midi));
      }
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "keyboard", payload: payload };
      // Always log in isolation mode so Phase 1 is visually/console verifiable.
      try { console.log("[Keyboard]", JSON.stringify(evt)); } catch (e) {}
      this.root.dispatchEvent(
        new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
      );
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    _emitQuiz(selectedMidi) {
      const target = this.quizTargetMidi;
      // Naming quizzes are octave-agnostic: compare by pitch class (§1d).
      const isCorrect = pitchClassOf(selectedMidi) === pitchClassOf(target);
      this._emit("key_quizzed", {
        targetPitchClass: pitchClassOf(target),
        selectedPitchClass: pitchClassOf(selectedMidi),
        targetNote: nameOf(target),
        selectedNote: nameOf(selectedMidi),
        isCorrect: isCorrect,
      });
    }

    // --- Public API -------------------------------------------------------
    setHighlight(spec) {
      this.highlightSet = this._toMidiSet(spec);
      this._keyEls.forEach((el, midi) => {
        const on = this.highlightSet.has(midi);
        el.classList.toggle("mk-key--highlight", on);
        const style = NOTE_STYLE[nameOf(midi)];
        if (on && style) el.style.setProperty("--mk-note-color", style.color);
      });
    }
    setQuiz(quiz) {
      this.quiz = quiz || null;
      this.quizTargetMidi = quiz ? midiOfSci(this._toSci(quiz.target)) : null;
      this._keyEls.forEach((el) => {
        el.classList.toggle("mk-key--quiz", this.quizTargetMidi != null);
      });
    }
    // Trigger a note programmatically (e.g. from MIDI input).
    // Fires the same press logic as a pointer click: plays audio, animates,
    // emits note_played / key_quizzed exactly as if the user clicked.
    triggerNote(midi) {
      // Accept any MIDI pitch; find the closest key in our range by pitch class
      // if the exact octave isn't rendered (e.g. MIDI 48 = C3 but range is C4+).
      let el = this._keyEls.get(midi);
      if (!el) {
        const k = global.MtheoryKeyboard;
        const pc = pitchClassOf(midi);
        for (const [m, e] of this._keyEls) {
          if (pitchClassOf(m) === pc) { el = e; midi = m; break; }
        }
      }
      if (!el) return;
      this._press(midi, el);
    }
    destroy() {
      this.root.innerHTML = "";
      this._keyEls.clear();
    }
  }

  // Expose helpers for the engine + tests.
  Keyboard.notePayload = notePayload;
  Keyboard.midiOfSci = midiOfSci;
  Keyboard.pitchClassOf = pitchClassOf;

  // Look up the color/shape standard for a note name (enharmonic-tolerant,
  // octave-agnostic). Returns { color, shape } or null if not a valid note.
  Keyboard.noteStyle = function (name) {
    if (typeof name !== "string" || !name) return null;
    const norm = normalizeName(name[0].toUpperCase() + name.slice(1));
    return NOTE_STYLE[norm] || null;
  };
  Keyboard.readableText = readableText;

  // Shared pitch math + synth, exposed so other instruments (Fretboard,
  // Companion, Recall) speak the exact same §1d contract and sound identical.
  Keyboard.nameOf = nameOf;
  Keyboard.octaveOf = octaveOf;
  Keyboard.sciOf = sciOf;
  Keyboard.freqOf = freqOf;
  Keyboard.pluck = defaultPluck;

  global.MtheoryKeyboard = Keyboard;
})(window);
