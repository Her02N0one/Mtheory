// theory.js — Pure music-theory helpers and task builders.
// No DOM access, no global mutable state.
// Depends on: NOTE_SYSTEM, NOTES, ROOT_NOTE_NAME (globals set before this script)

// -- Guitar tuning ------------------------------------------------------------
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const _CHROM = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

// The seven natural notes (no sharp/flat) vs the five accidentals. Used by the
// name_fret recall mode to optionally restrict quizzed positions to one group.
const _NATURALS    = ['C','D','E','F','G','A','B'];
const _ACCIDENTALS = ['Db','Eb','F#','Ab','Bb'];

// Enharmonic twins — the "other name" for each of the five accidental pitches.
// Used by the recall task type (Lesson 1.1) to drill "one sound, two names".
const _ENHARMONIC = {
  'Db':'C#', 'C#':'Db', 'Eb':'D#', 'D#':'Eb', 'F#':'Gb', 'Gb':'F#',
  'Ab':'G#', 'G#':'Ab', 'Bb':'A#', 'A#':'Bb',
};

// Small array helpers (recall task generation only).
function _shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function _sample(arr, n) { return _shuffle(arr).slice(0, n); }

// -- Labels -------------------------------------------------------------------
const INTERVAL_FULL = [
  'Root (unison)', 'minor 2nd', 'Major 2nd', 'minor 3rd', 'Major 3rd',
  'Perfect 4th', 'Tritone', 'Perfect 5th',
  'minor 6th', 'Major 6th', 'minor 7th', 'Major 7th', 'Octave',
];

const COF_ORDER   = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const CHROM_ORDER = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

const QS_LABELS = {
  scale_up:        '\u2191 Scale Up',
  scale_down:      '\u2193 Scale Down',
  scale_horizontal:'\u2261 Single-String Scale',
  chromatic_walk:  '\u2192 Chromatic Crawl',
  step_intervals:  '\u2194 Step Intervals',
  orbit:           '\u25ef Orbit',
  intervals:       '\u2195 Diatonic Intervals',
  arpeggio:        '\u25c7 Triads',
  quartal:         '\u25c6 Quartal / Quintal',
  random:          '\u007e Free Play',
  string_interval: '\u2195 String Intervals',
  chord_shape:     '\u2b22 Chord Shapes',
  box_chords:      '\u2b22 Box Chords',
  voice_lead:      '\u21dd Voice Leading',
  recall:          '\u003f Name It',
};

const _SEMI_TO_ROMAN = {0:'I',2:'II',3:'III',4:'III',5:'IV',7:'V',8:'VI',9:'VI',10:'VII',11:'VII'};

function intervalLabel(semitones) {
  return INTERVAL_FULL[semitones] || (semitones + ' semitones');
}

function triadQuality(i3, i5) {
  if (i3 === 4 && i5 === 7)  return { symbol: '',         full: 'major' };
  if (i3 === 3 && i5 === 7)  return { symbol: 'm',        full: 'minor' };
  if (i3 === 3 && i5 === 6)  return { symbol: '\u00b0',  full: 'dim' };
  if (i3 === 4 && i5 === 8)  return { symbol: '+',        full: 'aug' };
  if (i3 === 2 && i5 === 7)  return { symbol: 'sus2',     full: 'sus2' };
  if (i3 === 5 && i5 === 7)  return { symbol: 'sus4',     full: 'sus4' };
  if (i3 === 5 && i5 === 10) return { symbol: '(4)',      full: 'quartal' };
  if (i3 === 7 && i5 === 14) return { symbol: '(5)',      full: 'quintal' };
  // Pentatonic stacked-thirds shapes
  if (i3 === 4 && i5 === 9)  return { symbol: 'add6',    full: 'add 6' };
  if (i3 === 3 && i5 === 9)  return { symbol: 'madd6',   full: 'minor add 6' };
  if (i3 === 5 && i5 === 9)  return { symbol: '(4+6)',   full: 'fourth add 6' };
  return { symbol: '?', full: 'unknown' };
}

function chordRoman(rootMidi, chordRootMidi, qualitySymbol) {
  const semi  = ((chordRootMidi - rootMidi) % 12 + 12) % 12;
  const roman = _SEMI_TO_ROMAN[semi] || (semi + 1).toString();
  return (qualitySymbol === 'm' || qualitySymbol === '\u00b0')
    ? roman.toLowerCase() + qualitySymbol
    : roman + qualitySymbol;
}

// -- Note enumeration ---------------------------------------------------------

function getTargetsInRange(noteNames, fretMin, fretMax) {
  const seen    = new Set();
  const targets = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretMin; f <= fretMax; f++) {
      const midi   = STANDARD_TUNING_MIDI[s] + f;
      const name   = _CHROM[((midi % 12) + 12) % 12];
      const octave = Math.floor(midi / 12) - 1;
      if (noteNames.includes(name)) {
        const key = name + octave;
        if (!seen.has(key)) { seen.add(key); targets.push({ name, octave, midi }); }
      }
    }
  }
  targets.sort((a, b) => a.midi - b.midi);
  return targets;
}

function getPinsForTarget(name, octave, fretMin, fretMax) {
  const pins = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretMin; f <= fretMax; f++) {
      const midi  = STANDARD_TUNING_MIDI[s] + f;
      const nName = _CHROM[((midi % 12) + 12) % 12];
      const nOct  = Math.floor(midi / 12) - 1;
      if (nName === name && nOct === octave) pins.push(s + ':' + f);
    }
  }
  return pins.join(',');
}

// -- Triad builders ----------------------------------------------------------
// Internal helpers called only by buildQueueTasks() below.
// Not part of the public API — do not call from render.js or stage.js.

function buildTriads(scaleTargets) {
  const triads = [];
  for (let i = 0; i + 4 < scaleTargets.length; i++)
    triads.push([scaleTargets[i], scaleTargets[i + 2], scaleTargets[i + 4]]);
  return triads;
}

// Each element of scaleTargets is a { name, octave, midi } note object.
// Quartal triads stack perfect 4ths (every 3rd scale degree).
function buildQuartalTriads(scaleTargets) {
  const triads = [];
  for (let i = 0; i + 6 < scaleTargets.length; i++)
    triads.push([scaleTargets[i], scaleTargets[i + 3], scaleTargets[i + 6]]);
  return triads;
}


// -- Chord voicing search ----------------------------------------------------
// Finds all guitar voicings of a chord on a specific set of adjacent strings.
//
// chordPCs   : absolute pitch classes (0-11) of every chord tone,
//              e.g. [0, 4, 7] for Cmaj (C=0, E=4, G=7).
// strings    : array of string indices (0=E2 … 5=e4).  Must be adjacent.
// fretMin/fretMax : search window (inclusive).
//
// Returns: array of voicings.  Each voicing is an array parallel to `strings`:
//   { si, fret, pc, toneIdx, note: {name, octave, midi} }
//
// A voicing is valid only when:
//   • every chord tone appears at least once
//   • non-open frets span ≤ MAX_STRETCH semitones (playable in one hand position)
function buildChordVoicings(chordPCs, strings, fretMin, fretMax) {
  const MAX_STRETCH = 4;
  const perStr = strings.map(function(si) {
    var opts = [];
    for (var f = fretMin; f <= fretMax; f++) {
      var midi = STANDARD_TUNING_MIDI[si] + f;
      var pc   = ((midi % 12) + 12) % 12;
      var ti   = chordPCs.indexOf(pc);
      if (ti >= 0) opts.push({
        si, fret: f, pc, toneIdx: ti,
        note: { name: _CHROM[pc], octave: Math.floor(midi / 12) - 1, midi }
      });
    }
    return opts;
  });

  var voicings = [];
  function go(idx, cur, pcs) {
    if (idx === strings.length) {
      if (pcs.size < chordPCs.length) return;   // not all tones covered
      var nonOpen = cur.map(function(c) { return c.fret; }).filter(function(f) { return f > 0; });
      if (nonOpen.length && Math.max.apply(null,nonOpen) - Math.min.apply(null,nonOpen) > MAX_STRETCH) return;
      voicings.push(cur.slice());
      return;
    }
    perStr[idx].forEach(function(opt) {
      var np = new Set(pcs); np.add(opt.pc);
      go(idx + 1, cur.concat([opt]), np);
    });
  }
  go(0, [], new Set());
  return voicings;
}

// -- Voice-leading cost (used by the 'voice_lead' pattern) -------------------
// A voicing's "hand position" is defined purely by its fretted notes (fret>0).
// Open strings are ignored: an open string places no constraint on where the
// fretting hand sits, so it never counts toward movement cost.

// Returns a map { si: fret } for fretted notes only (fret > 0).
function _frettedMap(voicing) {
  var m = {};
  voicing.forEach(function(n) { if (n.fret > 0) m[n.si] = n.fret; });
  return m;
}

// Penalty for a string fretted in exactly one of two consecutive voicings
// (a finger lifted or newly planted).  ≈ 3.5 makes adding/dropping a string
// roughly as costly as a 3–4 fret slide, strongly favouring common-tone /
// adjacent-string voice leading.
var VOICE_LEAD_STRING_PENALTY = 3.5;

// Physical cost of moving the fretting hand from prevVoicing to candVoicing:
//   • a string fretted in BOTH contributes |Δfret| (the finger slide distance)
//   • a string fretted in exactly ONE contributes VOICE_LEAD_STRING_PENALTY
// Open strings on either side are ignored entirely (see _frettedMap).
function voiceLeadingCost(prevVoicing, candVoicing) {
  var a = _frettedMap(prevVoicing);
  var b = _frettedMap(candVoicing);
  var cost = 0, si;
  for (si in a) {
    if (b.hasOwnProperty(si)) cost += Math.abs(b[si] - a[si]);  // string slid
    else                      cost += VOICE_LEAD_STRING_PENALTY; // string dropped
  }
  for (si in b) {
    if (!a.hasOwnProperty(si)) cost += VOICE_LEAD_STRING_PENALTY; // string added
  }
  return cost;
}

// Anchor cost for the FIRST chord of a progression — there is no previous
// voicing, so fall back to the absolute preference used elsewhere in this file:
// root-position first, then closed (no open strings), then lowest bass.
function voiceLeadSeedCost(voicing, chordPCs) {
  var lo   = Math.min.apply(null, voicing.map(function(n){ return n.note.midi; }));
  var bass = voicing.filter(function(n){ return n.note.midi === lo; })[0];
  var isRoot  = bass && bass.pc === chordPCs[0] ? 0 : 10;
  var hasOpen = voicing.some(function(n){ return n.fret === 0; }) ? 2 : 0;
  return isRoot + hasOpen + lo * 0.01;
}

// Viterbi: pick one voicing per chord minimising TOTAL fretting-hand travel
// across the whole sequence (a greedy nearest-neighbour walk can trap itself
// into an expensive jump later, so we solve the full path optimally).
//   layers       : array of voicing-arrays, one per chord (none may be empty)
//   chordPCsList : parallel array of chord pitch-class sets, for the seed cost
// Returns the chosen voicing for each chord (parallel to layers), or [].
function pickVoiceLedProgression(layers, chordPCsList) {
  var n = layers.length;
  if (!n) return [];
  for (var g = 0; g < n; g++) if (!layers[g].length) return [];

  var dp   = [];   // dp[i][k]   = min total cost to reach voicing k of chord i
  var back = [];   // back[i][k] = best predecessor index in layer i-1

  dp[0]   = layers[0].map(function(v){ return voiceLeadSeedCost(v, chordPCsList[0]); });
  back[0] = layers[0].map(function(){ return -1; });

  for (var i = 1; i < n; i++) {
    dp[i] = []; back[i] = [];
    for (var k = 0; k < layers[i].length; k++) {
      var bestCost = Infinity, bestJ = 0;
      for (var j = 0; j < layers[i-1].length; j++) {
        var c = dp[i-1][j] + voiceLeadingCost(layers[i-1][j], layers[i][k]);
        if (c < bestCost) { bestCost = c; bestJ = j; }
      }
      dp[i][k]   = bestCost;
      back[i][k] = bestJ;
    }
  }

  var last = n - 1, bestK = 0, bestEnd = Infinity;
  for (var t = 0; t < dp[last].length; t++) {
    if (dp[last][t] < bestEnd) { bestEnd = dp[last][t]; bestK = t; }
  }

  var chosen = new Array(n);
  for (var b = last; b >= 0; b--) { chosen[b] = layers[b][bestK]; bestK = back[b][bestK]; }
  return chosen;
}

// -- Scale anchor -------------------------------------------------------------

// Returns { all, sc, startIdx } where sc starts at the lowest root that has
// a matching root an octave above (the "completeable octave" anchor).
function findScaleAnchor(fMin, fMax) {
  const all   = getTargetsInRange(NOTES, fMin, fMax);
  const roots = all.filter(t => t.name === ROOT_NOTE_NAME);
  let startIdx = 0;
  for (const rt of roots) {
    if (roots.some(r => r.midi === rt.midi + 12)) { startIdx = all.indexOf(rt); break; }
  }
  if (!startIdx && roots.length) startIdx = all.indexOf(roots[0]);
  return { all, sc: all.slice(startIdx), startIdx };
}

// Returns sc trimmed to a single root-to-root span (inclusive on both ends).
// If no second root exists in sc, returns all of sc.
function rootToRoot(sc) {
  for (let i = 1; i < sc.length; i++) {
    if (sc[i].name === ROOT_NOTE_NAME) return sc.slice(0, i + 1);
  }
  return sc.slice();
}

// -- Task types ---------------------------------------------------------------
// Every task carries:
//   kind:        'note' | 'interval' | 'chord'
//   currentNote: the note the user must play to advance
//   segmentId:   which segment this task belongs to (for strip/label grouping)
//   ...kind-specific context used by render/hint functions
//
// Kind: 'note'
//   note:        the target note object (same as currentNote)
//
// Kind: 'interval'
//   lo, hi:      the two notes of the interval
//   semis:       hi.midi - lo.midi
//   label:       e.g. 'Perfect 4th'
//   stepIdx:     0 = playing lo, 1 = playing hi
//   repIdx:      which repetition (0-based)
//   totalReps:   how many times this pair repeats
//   pairIdx:     which pair within the segment
//   totalPairs:  total pairs in this segment
//
// Kind: 'chord'
//   notes:       [root, third, fifth]
//   quality:     { symbol, full }
//   roman:       e.g. 'V'
//   stepIdx:     0 | 1 | 2 — which note within the chord
//   chordIdx:    which chord in the segment
//   totalChords: total chords in this segment
//   style:       'arpeggio' | 'quartal'

function _noteTask(note, segmentId) {
  return { kind: 'note', currentNote: note, segmentId, note };
}

function _intervalTask(lo, hi, stepIdx, repIdx, totalReps, pairIdx, totalPairs, segmentId) {
  return {
    kind:        'interval',
    currentNote: stepIdx === 0 ? lo : hi,
    segmentId,
    lo, hi,
    semis:       hi.midi - lo.midi,
    label:       intervalLabel(hi.midi - lo.midi),
    stepIdx,
    repIdx,
    totalReps,
    pairIdx,
    totalPairs,
  };
}

function _chordTask(notes, stepIdx, chordIdx, totalChords, quality, roman, style, segmentId) {
  return {
    kind:        'chord',
    currentNote: notes[stepIdx],
    segmentId,
    notes,
    quality,
    roman,
    stepIdx,
    chordIdx,
    totalChords,
    style,
  };
}

// -- Queue builder ------------------------------------------------------------
// Returns an array of task objects.
//
// Pattern entries (in PHASES[i].patterns) — two forms accepted:
//   string:   'scale_up' | 'scale_down' | 'intervals' | 'arpeggio' | 'quartal'
//             'scale_horizontal' — single-string scale walk (reads phase.single_string)
//             'string_interval'  — chromatic interval drill on specific string pairs
//   object:   { type: 'intervals', reps: 2 }
//             { type: 'arpeggio' }
//             { random: N }   (pick N random notes from the full range)
//
// phase (optional 4th arg): the full phase dict from PHASES[currentPhase].
// Required for 'string_interval' which reads phase.interval_semis_list and
// phase.string_subset.  All other patterns ignore it.

function buildQueueTasks(patterns, fretMin, fretMax, phase) {
  const { all, sc, startIdx } = findScaleAnchor(fretMin, fretMax);
  // string_interval doesn't need scale targets, but return early only if
  // neither scale-based nor string-interval patterns are present.
  const hasStringInterval = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'string_interval'
  );
  const hasChordShape = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'chord_shape'
  );
  const hasVoiceLead = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'voice_lead'
  );
  const hasScaleHorizontal = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'scale_horizontal'
  );
  const hasChromaticWalk = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'chromatic_walk'
  );
  const hasRecall = patterns.some(p =>
    (typeof p === 'string' ? p : (p.type || '')) === 'recall'
  );
  if (!sc.length && !hasStringInterval && !hasChordShape && !hasVoiceLead && !hasScaleHorizontal && !hasChromaticWalk && !hasRecall) return [];

  // Root MIDI for chord roman numeral labels
  const rootMidi = (function() {
    const roots = all.filter(t => t.name === ROOT_NOTE_NAME);
    for (const r of roots) {
      if (roots.some(x => x.midi === r.midi + 12)) return r.midi;
    }
    return roots.length ? roots[0].midi : null;
  })();

  const tasks = [];

  for (const pattern of patterns) {
    const type = typeof pattern === 'string' ? pattern
               : (pattern.type || (pattern.random != null ? 'random' : null));
    const opts = typeof pattern === 'object' ? pattern : {};

    if (type === 'scale_up') {
      rootToRoot(sc).forEach(note => tasks.push(_noteTask(note, 'scale_up')));

    } else if (type === 'scale_down') {
      rootToRoot(sc).slice().reverse()
         .forEach(note => tasks.push(_noteTask(note, 'scale_down')));

    } else if (type === 'scale_horizontal') {
      // "Unitar" — walk the scale linearly along ONE string, ascending then
      // descending, so the W–W–H–W–W–W–H step pattern is laid out on a single
      // horizontal plane with no string crossings.
      //
      // Reads phase.single_string — the string index (0=low E … 5=high e).
      // Scans frets across the phase window [fretMin, fretMax]; with fret_min=0
      // the open string is included.  The matching phase should also set
      // string_subset:[single_string] so the fretboard render (ghosts included)
      // collapses to that one string.
      var hsString = phase && phase.single_string;
      if (hsString != null && hsString >= 0 && hsString < 6) {
        var hsNotes = [];
        for (var hf = fretMin; hf <= fretMax; hf++) {
          var hMidi = STANDARD_TUNING_MIDI[hsString] + hf;
          var hName = _CHROM[((hMidi % 12) + 12) % 12];
          if (NOTES.includes(hName)) {
            hsNotes.push({ name: hName, octave: Math.floor(hMidi / 12) - 1, midi: hMidi });
          }
        }
        if (hsNotes.length) {
          // Ascend to the top, then descend back down. The top note is played
          // once at the turnaround (slice(0,-1) drops it from the return leg).
          var hsSeq = hsNotes.concat(hsNotes.slice(0, -1).reverse());
          hsSeq.forEach(function(note) {
            tasks.push(_noteTask(note, 'scale_horizontal'));
          });
        }
      }

    } else if (type === 'chromatic_walk') {
      // Lesson 1 — "The Chromatic Crawl".  Walks EVERY fret along one string
      // (no scale filter), ascending then descending.  Each step is exactly one
      // half-step, so on the colour/shape engine every move flips the shape
      // (square ⇆ circle) and leaps across the Circle-of-Fifths colour wheel —
      // the most direct possible demonstration of the 12-note alphabet.
      //
      // Reads phase.walk_string (string index 0=low E … 5=high e, default 0).
      // The matching phase should also set string_subset:[walk_string] so the
      // fretboard render collapses to that one string.
      var cwString = (phase && phase.walk_string != null) ? phase.walk_string : 0;
      if (cwString >= 0 && cwString < 6) {
        var cwNotes = [];
        for (var cwf = fretMin; cwf <= fretMax; cwf++) {
          var cwMidi = STANDARD_TUNING_MIDI[cwString] + cwf;
          var cwPc   = ((cwMidi % 12) + 12) % 12;
          cwNotes.push({ name: _CHROM[cwPc], octave: Math.floor(cwMidi / 12) - 1, midi: cwMidi });
        }
        if (cwNotes.length) {
          var cwSeq = cwNotes.concat(cwNotes.slice(0, -1).reverse());
          cwSeq.forEach(function(note) {
            tasks.push(_noteTask(note, 'chromatic_walk'));
          });
        }
      }

    } else if (type === 'recall') {
      // Lesson 1.1 — non-mic knowledge checkpoints. Each task is a multiple-choice
      // question answered by tapping a button (see answerRecall in stage.js).
      //   mode 'name_shape'  — show a colour/shape swatch, pick the note name.
      //   mode 'enharmonic'  — given an accidental, pick its second (enharmonic) name.
      const mode     = opts.mode || 'name_shape';
      const noteList = opts.notes && opts.notes.length ? opts.notes : _CHROM.slice();
      if (mode === 'name_fret') {
        // Show a highlighted fret position; the learner names the note there.
        // Pulls positions from the phase's string(s) and fret window so it
        // builds directly on the string the previous phase just crawled.
        const strings = opts.strings && opts.strings.length ? opts.strings
                      : (phase && phase.string_subset && phase.string_subset.length
                         ? phase.string_subset : [0]);
        const count   = opts.count || 10;
        // Optional restriction: 'naturals' | 'accidentals' — only quiz frets
        // whose note belongs to that group (teaches where each group lives).
        const filter  = opts.note_filter || null;
        const allowed = filter === 'naturals' ? _NATURALS
                      : filter === 'accidentals' ? _ACCIDENTALS : null;
        const seen    = {};
        let guard     = 0;
        const picks   = [];
        while (picks.length < count && guard++ < 600) {
          const si = strings[Math.floor(Math.random() * strings.length)];
          const fr = fretMin + Math.floor(Math.random() * (fretMax - fretMin + 1));
          const key = si + ':' + fr;
          if (seen[key]) continue;
          if (allowed) {
            const midiC = STANDARD_TUNING_MIDI[si] + fr;
            const nameC = _CHROM[((midiC % 12) + 12) % 12];
            if (allowed.indexOf(nameC) === -1) continue;
          }
          seen[key] = true;
          picks.push({ si: si, fret: fr });
        }
        picks.forEach(function(pk) {
          const midi   = STANDARD_TUNING_MIDI[pk.si] + pk.fret;
          const name   = _CHROM[((midi % 12) + 12) % 12];
          const octave = Math.floor(midi / 12) - 1;
          const pool   = _CHROM.filter(function(x) { return x !== name; });
          tasks.push({
            kind: 'recall', segmentId: 'recall', mode: 'name_fret',
            si: pk.si, fret: pk.fret,
            currentNote: { name: name, octave: octave, midi: midi },
            prompt: 'Which note is at the highlighted fret?',
            swatchName: null,
            choices: _shuffle([name].concat(_sample(pool, 3))),
            answer: name,
          });
        });
      } else if (mode === 'enharmonic') {
        noteList.forEach(function(n) {
          const other = _ENHARMONIC[n];
          if (!other) return;
          const pool = ['C#','Db','D#','Eb','F#','Gb','G#','Ab','A#','Bb']
                         .filter(function(x) { return x !== other && x !== n; });
          tasks.push({
            kind: 'recall', segmentId: 'recall', mode: 'enharmonic',
            prompt: n + ' has a second name \u2014 its enharmonic twin. Which one is it?',
            swatchName: (NOTE_SYSTEM[n] ? n : null),
            choices: _shuffle([other].concat(_sample(pool, 3))),
            answer: other,
          });
        });
      } else {
        noteList.forEach(function(n) {
          const pool = _CHROM.filter(function(x) { return x !== n; });
          tasks.push({
            kind: 'recall', segmentId: 'recall', mode: 'name_shape',
            prompt: 'Which note is this?',
            swatchName: n,
            choices: _shuffle([n].concat(_sample(pool, 3))),
            answer: n,
          });
        });
      }

    } else if (type === 'step_intervals') {
      // Adjacent scale-degree pairs only: 1→2, 2→3, 3→4 … 7→1
      const r2r = rootToRoot(sc);
      const pairs = [];
      for (let i = 0; i < r2r.length - 1; i++) {
        const semis = r2r[i + 1].midi - r2r[i].midi;
        if (semis > 0) pairs.push({ lo: r2r[i], hi: r2r[i + 1], semis });
      }
      const totalPairs = pairs.length;
      pairs.forEach(function({ lo, hi }, pairIdx) {
        tasks.push(_intervalTask(lo, hi, 0, 0, 1, pairIdx, totalPairs, 'step_intervals'));
        tasks.push(_intervalTask(lo, hi, 1, 0, 1, pairIdx, totalPairs, 'step_intervals'));
      });

    } else if (type === 'intervals') {
      const reps = opts.reps != null ? opts.reps : 2;
      const pairs = [];
      for (let i = 0; i < sc.length; i++)
        for (let j = i + 1; j < sc.length; j++) {
          const s = sc[j].midi - sc[i].midi;
          if (s >= 1 && s <= 12) pairs.push({ lo: sc[i], hi: sc[j], semis: s });
        }
      // Sort by lo.midi, then hi.midi — groups all intervals from the same root note together.
      pairs.sort((a, b) => a.lo.midi !== b.lo.midi ? a.lo.midi - b.lo.midi : a.hi.midi - b.hi.midi);
      const totalPairs = pairs.length;
      pairs.forEach(function({ lo, hi }, pairIdx) {
        for (let rep = 0; rep < reps; rep++) {
          tasks.push(_intervalTask(lo, hi, 0, rep, reps, pairIdx, totalPairs, 'intervals'));
          tasks.push(_intervalTask(lo, hi, 1, rep, reps, pairIdx, totalPairs, 'intervals'));
        }
      });

    } else if (type === 'quartal') {
      // Quartal/quintal: keep legacy buildQuartalTriads for now
      const triads      = buildQuartalTriads(sc);
      const totalChords = triads.length;
      triads.forEach(function(notes, chordIdx) {
        const q   = triadQuality(notes[1].midi - notes[0].midi, notes[2].midi - notes[0].midi);
        const rom = rootMidi != null ? chordRoman(rootMidi, notes[0].midi, q.symbol) : '';
        [0, 1, 2].forEach(stepIdx => {
          tasks.push(_chordTask(notes, stepIdx, chordIdx, totalChords, q, rom, type, type));
        });
      });

    } else if (type === 'arpeggio') {
      // Derive the scale's diatonic triad PCs (every-other scale degree, same
      // logic as buildTriads), then feed each set into buildChordVoicings so
      // voicings are physically playable on guitar within the current fret window.
      var arpPCs = [], arpSeen = {};
      sc.forEach(function(n) {
        var pc = ((n.midi % 12) + 12) % 12;
        if (!arpSeen[pc]) { arpSeen[pc] = true; arpPCs.push(pc); }
      });
      var nDeg = arpPCs.length;
      if (nDeg < 3) return;

      var arpSets = [[0,1,2],[1,2,3],[2,3,4],[3,4,5],[0,1,2,3],[1,2,3,4],[2,3,4,5]];

      for (var di = 0; di < nDeg; di++) {
        var arpRootPC  = arpPCs[di];
        var arpThirdPC = arpPCs[(di + 2) % nDeg];
        var arpFifthPC = arpPCs[(di + 4) % nDeg];
        var arpChordPCs = [arpRootPC, arpThirdPC, arpFifthPC];
        var arpI3 = ((arpThirdPC - arpRootPC) + 12) % 12;
        var arpI5 = ((arpFifthPC - arpRootPC) + 12) % 12;
        var arpCIntervals = [0, arpI3, arpI5];

        var arpVoicings = [];
        arpSets.forEach(function(ss) {
          buildChordVoicings(arpChordPCs, ss, fretMin, fretMax).forEach(function(v) { arpVoicings.push(v); });
        });

        // Sort: root-position first, closed before open, fewer strings, lower bass
        arpVoicings.sort(function(a, b) {
          var aLo  = Math.min.apply(null, a.map(function(n){return n.note.midi;}));
          var bLo  = Math.min.apply(null, b.map(function(n){return n.note.midi;}));
          var aRoot = a.filter(function(n){return n.note.midi===aLo;})[0];
          var bRoot = b.filter(function(n){return n.note.midi===bLo;})[0];
          var aIsRoot = aRoot && aRoot.pc === arpChordPCs[0] ? 0 : 1;
          var bIsRoot = bRoot && bRoot.pc === arpChordPCs[0] ? 0 : 1;
          if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
          var aOpen = a.some(function(n){return n.fret===0;}) ? 1 : 0;
          var bOpen = b.some(function(n){return n.fret===0;}) ? 1 : 0;
          if (aOpen !== bOpen) return aOpen - bOpen;
          if (a.length !== b.length) return a.length - b.length;
          return aLo - bLo;
        });

        // Ascending-pitch filter
        arpVoicings = arpVoicings.filter(function(v) {
          for (var i = 1; i < v.length; i++) {
            if (v[i].note.midi <= v[i-1].note.midi) return false;
          }
          return true;
        });

        if (!arpVoicings.length) continue;

        // Annotate altPositions
        var arpGroups = {};
        arpVoicings.forEach(function(v) {
          var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
          if (!arpGroups[sig]) arpGroups[sig] = [];
          arpGroups[sig].push(v);
        });
        arpVoicings.forEach(function(v) {
          var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
          var grp = arpGroups[sig];
          v._stepAltPositions = v.map(function(vn) {
            var alts = [];
            grp.forEach(function(ov) {
              if (ov === v) return;
              var match = null;
              for (var k = 0; k < ov.length; k++) {
                if (ov[k].note.midi === vn.note.midi) { match = ov[k]; break; }
              }
              if (match) alts.push({si: match.si, fret: match.fret});
            });
            return alts;
          });
        });

        var arpQ        = triadQuality(arpI3, arpI5);
        var arpRootName = _CHROM[arpRootPC];
        var arpName     = arpRootName + arpQ.symbol;
        var arpBassRoot = rootMidi != null ? rootMidi + (((arpRootPC - (rootMidi % 12)) + 12) % 12) : null;
        var arpRom      = (rootMidi != null && arpBassRoot != null) ? chordRoman(rootMidi, arpBassRoot, arpQ.symbol) : '';
        var arpTotal    = arpVoicings.length;

        arpVoicings.forEach(function(voicing, chordIdx) {
          var notes = voicing.map(function(v) { return v.note; });
          var segId = 'arp_' + arpRootName + '_' + di + '_' + chordIdx;
          for (var step = 0; step < notes.length; step++) {
            var t = _chordTask(notes, step, chordIdx, arpTotal, arpQ, arpRom, 'chord_shape', segId);
            t.voicing        = voicing;
            t.chordPCs       = arpChordPCs;
            t.chordIntervals = arpCIntervals;
            t.chordName      = arpName;
            t.altPositions   = (voicing._stepAltPositions && voicing._stepAltPositions[step]) || [];
            tasks.push(t);
          }
        });
      }

    } else if (type === 'orbit') {
      // Root-centric interval drill: root → interval → root → next interval → …
      // For each non-root scale note, emit: root task, interval-hi task.
      // Pairs are ordered by scale degree (ascending), then reversed (descending)
      // so the student hears the full orbit up and back.
      // Tasks use kind='interval' so the fretboard line + label appear naturally.
      var orbitR2R  = rootToRoot(sc);
      // Collect unique non-root notes in order
      var orbitNonRoot = [];
      var orbitSeen    = {};
      orbitR2R.forEach(function(n) {
        if (n.name !== ROOT_NOTE_NAME && !orbitSeen[n.midi]) {
          orbitSeen[n.midi] = true;
          orbitNonRoot.push(n);
        }
      });
      // Root: lowest root in the span
      var orbitRoot = orbitR2R[0];
      // Full orbit: up through all degrees, back down
      var orbitSeq = orbitNonRoot.concat(orbitNonRoot.slice().reverse());
      var orbitTotal = orbitSeq.length;
      orbitSeq.forEach(function(target, idx) {
        var lo, hi;
        if (target.midi >= orbitRoot.midi) { lo = orbitRoot; hi = target; }
        else                               { lo = target;    hi = orbitRoot; }
        var semis   = hi.midi - lo.midi;
        var segId   = 'orbit_' + idx;
        // Step 0: play the root
        var t0 = _intervalTask(lo, hi, lo === orbitRoot ? 0 : 1, 0, 1, idx, orbitTotal, 'orbit');
        t0.orbitRoot = orbitRoot;
        // Step 1: play the target degree
        var t1 = _intervalTask(lo, hi, lo === orbitRoot ? 1 : 0, 0, 1, idx, orbitTotal, 'orbit');
        t1.orbitRoot = orbitRoot;
        tasks.push(t0);
        tasks.push(t1);
      });

    } else if (type === 'random') {
      const count = opts.random != null ? opts.random : (opts.count || 4);
      for (let i = 0; i < count; i++)
        tasks.push(_noteTask(all[Math.floor(Math.random() * all.length)], 'random'));

    } else if (type === 'string_interval') {
      // Chromatic interval drill on specific adjacent string pairs.
      //
      // Reads from the phase dict (4th arg):
      //   phase.interval_semis_list — e.g. [3, 4] for thirds
      //   phase.string_subset       — e.g. [0, 1] for E-A strings
      //
      // For each adjacent string pair (sLo, sHi) in the subset:
      //   For each fret f on sLo within [fretMin, fretMax]:
      //     Compute the fret on sHi that places exactly `semis` above.
      //     f_hi = semis - (open_midi[sHi] - open_midi[sLo]) + f_lo
      //   Tasks are ordered lo→hi per pair, sweeping frets low to high.
      //
      // The G-B string pair (indices 3-4) has an open interval of M3 (4 st)
      // instead of P4 (5 st) like all other adjacent pairs — so every interval
      // shape on G-B is shifted by 1 fret vs the other pairs.  That shift is
      // computed automatically here; no special-casing needed.

      const semisFilter = (phase && phase.interval_semis_list) || [];
      const subset      = (phase && phase.string_subset)
                          ? [...phase.string_subset].sort((a, b) => a - b)
                          : [0, 1, 2, 3, 4, 5];
      const reps        = opts.reps != null ? opts.reps : 1;
      const MAX_FRET    = 22;

      // Collect only directly-adjacent string pairs (gap = 1 string index).
      const adjPairs = [];
      for (let i = 0; i < subset.length - 1; i++) {
        if (subset[i + 1] === subset[i] + 1) adjPairs.push([subset[i], subset[i + 1]]);
      }

      for (const [sLo, sHi] of adjPairs) {
        const openDiff = STANDARD_TUNING_MIDI[sHi] - STANDARD_TUNING_MIDI[sLo];
        const strNames = ['E','A','D','G','B','e'];
        const pairLabel = strNames[sLo] + '\u2013' + strNames[sHi]; // e.g. "E–A"

        for (const semis of semisFilter) {
          const pairs = [];
          for (let fLo = fretMin; fLo <= fretMax; fLo++) {
            const fHi = semis - openDiff + fLo;
            if (fHi < 0 || fHi > MAX_FRET) continue;
            const loMidi = STANDARD_TUNING_MIDI[sLo] + fLo;
            const hiMidi = STANDARD_TUNING_MIDI[sHi] + fHi;
            const loName = _CHROM[((loMidi % 12) + 12) % 12];
            const hiName = _CHROM[((hiMidi % 12) + 12) % 12];
            const loOct  = Math.floor(loMidi / 12) - 1;
            const hiOct  = Math.floor(hiMidi / 12) - 1;
            pairs.push({
              lo: { name: loName, octave: loOct, midi: loMidi },
              hi: { name: hiName, octave: hiOct, midi: hiMidi },
            });
          }
          // Each unique (sLo, sHi, semis) gets its own segment so the queue
          // strip can show "E–A  ·  Major 3rd" progress independently.
          const segId      = 'si_' + sLo + '_' + sHi + '_' + semis;
          const totalPairs = pairs.length;
          pairs.forEach(function({ lo, hi }, pairIdx) {
            for (let rep = 0; rep < reps; rep++) {
              const task0 = _intervalTask(lo, hi, 0, rep, reps, pairIdx, totalPairs, segId);
              const task1 = _intervalTask(lo, hi, 1, rep, reps, pairIdx, totalPairs, segId);
              // Attach the string-pair label so the queue strip header can show
              // "E–A  ·  Major 3rd" without parsing the segId.
              task0.stringPairLabel = pairLabel;
              task1.stringPairLabel = pairLabel;
              tasks.push(task0);
              tasks.push(task1);
            }
          });
        }
      }
    } else if (type === 'chord_shape') {
      // Chord arpeggio drill — enumerates every playable voicing of a specific
      // chord on 3- and 4-string adjacent subsets, then creates arpeggio tasks.
      //
      // Reads from phase:
      //   phase.chord_root       — note name of the chord root, e.g. "C"
      //   phase.chord_intervals  — semitones from root, e.g. [0, 4, 7]
      //   phase.chord_name       — display name, e.g. "Cmaj"
      //
      // For each voicing found, tasks are emitted in string order (low→high).
      // The task carries .voicing, .chordPCs, .chordIntervals, .chordName
      // so render.js can build the shape diagram and show context.

      var cRootName  = phase && phase.chord_root;
      var cIntervals = phase && phase.chord_intervals;
      var cName      = (phase && phase.chord_name) || cRootName || '?';
      if (!cRootName || !cIntervals || !cIntervals.length) { /* nothing */ }
      else {
        var cRootPC  = _CHROM.indexOf(cRootName);
        if (cRootPC < 0) { /* unknown root */ }
        else {
          var chordPCs = cIntervals.map(function(i) { return (cRootPC + i) % 12; });
          var nTones   = cIntervals.length;

          // 3-string subsets for triads/dyads; add 4-string for tetrads
          var searchSets = [[0,1,2],[1,2,3],[2,3,4],[3,4,5]];
          if (nTones >= 4) searchSets = searchSets.concat([[0,1,2,3],[1,2,3,4],[2,3,4,5]]);

          var allVoicings = [];
          searchSets.forEach(function(ss) {
            buildChordVoicings(chordPCs, ss, fretMin, fretMax).forEach(function(v) {
              allVoicings.push(v);
            });
          });

          // Sort: root-position first, then closed (no open strings), then by
          // string count and bass MIDI. Open voicings go at the end.
          allVoicings.sort(function(a, b) {
            var aLo  = Math.min.apply(null, a.map(function(n){return n.note.midi;}));
            var bLo  = Math.min.apply(null, b.map(function(n){return n.note.midi;}));
            var aRoot = a.filter(function(n){return n.note.midi===aLo;})[0];
            var bRoot = b.filter(function(n){return n.note.midi===bLo;})[0];
            var aIsRoot = aRoot && aRoot.pc === chordPCs[0] ? 0 : 1;
            var bIsRoot = bRoot && bRoot.pc === chordPCs[0] ? 0 : 1;
            if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
            var aHasOpen = a.some(function(n){return n.fret===0;}) ? 1 : 0;
            var bHasOpen = b.some(function(n){return n.fret===0;}) ? 1 : 0;
            if (aHasOpen !== bHasOpen) return aHasOpen - bHasOpen;
            if (a.length !== b.length) return a.length - b.length;
            return aLo - bLo;
          });

          // Only keep voicings where notes are strictly ascending in pitch
          // (string order guarantees this on a real guitar, but cross-string
          //  combinations at low frets can produce equal-pitch duplicates)
          allVoicings = allVoicings.filter(function(v) {
            for (var i = 1; i < v.length; i++) {
              if (v[i].note.midi <= v[i-1].note.midi) return false;
            }
            return true;
          });

          // Group voicings that share the same MIDI pitch set (same notes, different strings).
          // Annotate each voicing with per-step alt positions so the fretboard can show them.
          var midiGroups = {};
          allVoicings.forEach(function(v) {
            var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
            if (!midiGroups[sig]) midiGroups[sig] = [];
            midiGroups[sig].push(v);
          });
          allVoicings.forEach(function(v) {
            var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
            var group = midiGroups[sig];
            // For each step i, find the same MIDI note in every other voicing of the group
            v._stepAltPositions = v.map(function(vn) {
              var alts = [];
              group.forEach(function(ov) {
                if (ov === v) return;
                var match = null;
                for (var k = 0; k < ov.length; k++) {
                  if (ov[k].note.midi === vn.note.midi) { match = ov[k]; break; }
                }
                if (match) alts.push({si: match.si, fret: match.fret});
              });
              return alts;
            });
          });

          var totalChords = allVoicings.length;
          // Determine quality label for display
          var q = cIntervals.length >= 3
            ? triadQuality(cIntervals[1], cIntervals[2])
            : { symbol: '5', full: 'power' };

          // Roman numeral relative to the stage root
          var rom = '';
          if (rootMidi != null && cIntervals.length >= 1) {
            var bassRootMidi = rootMidi + (function() {
              // nearest C (or cRootName) above/at rootMidi
              var diff = ((cRootPC - (rootMidi % 12)) + 12) % 12;
              return diff;
            })();
            rom = chordRoman(rootMidi, bassRootMidi, q.symbol);
          }

          allVoicings.forEach(function(voicing, chordIdx) {
            var notes = voicing.map(function(v) { return v.note; });
            var segId = 'cs_' + cRootName + '_' + chordIdx;
            for (var step = 0; step < notes.length; step++) {
              var t = _chordTask(notes, step, chordIdx, totalChords, q, rom, 'chord_shape', segId);
              t.voicing        = voicing;           // [{si,fret,toneIdx,note}]
              t.chordPCs       = chordPCs;          // [0,4,7] absolute pitch classes
              t.chordIntervals = cIntervals;        // [0,4,7] semitones from root
              t.chordName      = cName;
              t.altPositions   = (voicing._stepAltPositions && voicing._stepAltPositions[step]) || [];
              tasks.push(t);
            }
          });
        }
      }

    } else if (type === 'box_chords') {
      // Multiple chords per phase, each constrained to the phase fret window.
      // Each entry in phase.box_chords is {chord_name, chord_root, chord_intervals, chord_desc}.
      // Uses buildChordVoicings (adjacent-string, hand-width-constrained voicings) rather
      // than buildTriads (scale-degree stacking), giving idiomatic playable shapes.
      var bcDefs = (phase && phase.box_chords) || [];
      bcDefs.forEach(function(def) {
        var bcRoot      = def.chord_root;
        var bcIntervals = def.chord_intervals;
        var bcName      = def.chord_name || bcRoot || '?';
        if (!bcRoot || !bcIntervals || !bcIntervals.length) return;
        var bcRootPC = _CHROM.indexOf(bcRoot);
        if (bcRootPC < 0) return;
        var bcPCs  = bcIntervals.map(function(i) { return (bcRootPC + i) % 12; });
        var bcTones = bcIntervals.length;

        var bcSets = [[0,1,2],[1,2,3],[2,3,4],[3,4,5]];
        if (bcTones >= 4) bcSets = bcSets.concat([[0,1,2,3],[1,2,3,4],[2,3,4,5]]);

        var bcVoicings = [];
        bcSets.forEach(function(ss) {
          buildChordVoicings(bcPCs, ss, fretMin, fretMax).forEach(function(v) {
            bcVoicings.push(v);
          });
        });

        // Sort: root-position first, closed before open, fewer strings first, lower bass first
        bcVoicings.sort(function(a, b) {
          var aLo   = Math.min.apply(null, a.map(function(n){return n.note.midi;}));
          var bLo   = Math.min.apply(null, b.map(function(n){return n.note.midi;}));
          var aRoot = a.filter(function(n){return n.note.midi===aLo;})[0];
          var bRoot = b.filter(function(n){return n.note.midi===bLo;})[0];
          var aIsRoot = aRoot && aRoot.pc === bcPCs[0] ? 0 : 1;
          var bIsRoot = bRoot && bRoot.pc === bcPCs[0] ? 0 : 1;
          if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
          var aOpen = a.some(function(n){return n.fret===0;}) ? 1 : 0;
          var bOpen = b.some(function(n){return n.fret===0;}) ? 1 : 0;
          if (aOpen !== bOpen) return aOpen - bOpen;
          if (a.length !== b.length) return a.length - b.length;
          return aLo - bLo;
        });

        // Ascending-pitch filter
        bcVoicings = bcVoicings.filter(function(v) {
          for (var i = 1; i < v.length; i++) {
            if (v[i].note.midi <= v[i-1].note.midi) return false;
          }
          return true;
        });

        if (!bcVoicings.length) return; // no voicings in this fret window — skip chord

        // Annotate alt positions for fretboard display
        var bcGroups = {};
        bcVoicings.forEach(function(v) {
          var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
          if (!bcGroups[sig]) bcGroups[sig] = [];
          bcGroups[sig].push(v);
        });
        bcVoicings.forEach(function(v) {
          var sig = v.map(function(n){return n.note.midi;}).sort(function(a,b){return a-b;}).join(',');
          var grp = bcGroups[sig];
          v._stepAltPositions = v.map(function(vn) {
            var alts = [];
            grp.forEach(function(ov) {
              if (ov === v) return;
              var match = null;
              for (var k = 0; k < ov.length; k++) {
                if (ov[k].note.midi === vn.note.midi) { match = ov[k]; break; }
              }
              if (match) alts.push({si: match.si, fret: match.fret});
            });
            return alts;
          });
        });

        var bcTotal = bcVoicings.length;
        var bcQ = bcIntervals.length >= 3
          ? triadQuality(bcIntervals[1], bcIntervals[2])
          : { symbol: '5', full: 'power' };
        var bcRom = '';
        if (rootMidi != null) {
          var bcBassRoot = rootMidi + (((bcRootPC - (rootMidi % 12)) + 12) % 12);
          bcRom = chordRoman(rootMidi, bcBassRoot, bcQ.symbol);
        }

        bcVoicings.forEach(function(voicing, chordIdx) {
          var notes = voicing.map(function(v) { return v.note; });
          var segId = 'bc_' + bcRoot + '_' + chordIdx;
          for (var step = 0; step < notes.length; step++) {
            var t = _chordTask(notes, step, chordIdx, bcTotal, bcQ, bcRom, 'chord_shape', segId);
            t.voicing        = voicing;
            t.chordPCs       = bcPCs;
            t.chordIntervals = bcIntervals;
            t.chordName      = bcName;
            t.altPositions   = (voicing._stepAltPositions && voicing._stepAltPositions[step]) || [];
            tasks.push(t);
          }
        });
      });

    } else if (type === 'voice_lead') {
      // Voice-leading drill — walks a chord SEQUENCE and plays exactly ONE
      // voicing per chord, chosen so the fretting hand travels as little as
      // possible from the previous chord (minimal-motion / common-tone voice
      // leading).
      //
      // Reads the same chord-sequence shape as box_chords:
      //   phase.chord_sequence (preferred) or phase.box_chords — an array of
      //   {chord_name, chord_root, chord_intervals, chord_desc}.
      //
      // Per chord we enumerate every playable voicing (identical search to
      // box_chords / chord_shape).  A Viterbi pass over voiceLeadingCost then
      // selects the single smoothest voicing for each chord; only those winners
      // become tasks.  Emitted tasks reuse the 'chord_shape' style so render.js
      // and stage.js need no changes.
      var vlDefs = (phase && (phase.chord_sequence || phase.box_chords)) || [];

      var vlLayers = [];   // voicings per chord (parallel to vlMeta)
      var vlMeta   = [];   // per-chord metadata for task emission

      vlDefs.forEach(function(def) {
        var vName      = def.chord_name || def.chord_root || '?';
        var vRoot      = def.chord_root;
        var vIntervals = def.chord_intervals;
        if (!vRoot || !vIntervals || !vIntervals.length) return;
        var vRootPC = _CHROM.indexOf(vRoot);
        if (vRootPC < 0) return;
        var vPCs   = vIntervals.map(function(i) { return (vRootPC + i) % 12; });
        var vTones = vIntervals.length;

        var vSets = [[0,1,2],[1,2,3],[2,3,4],[3,4,5]];
        if (vTones >= 4) vSets = vSets.concat([[0,1,2,3],[1,2,3,4],[2,3,4,5]]);

        var vVoicings = [];
        vSets.forEach(function(ss) {
          buildChordVoicings(vPCs, ss, fretMin, fretMax).forEach(function(v) { vVoicings.push(v); });
        });

        // Ascending-pitch filter (same guard the other chord patterns apply)
        vVoicings = vVoicings.filter(function(v) {
          for (var i = 1; i < v.length; i++) {
            if (v[i].note.midi <= v[i-1].note.midi) return false;
          }
          return true;
        });
        if (!vVoicings.length) return; // chord unplayable in this window — skip it

        var vQ = vIntervals.length >= 3
          ? triadQuality(vIntervals[1], vIntervals[2])
          : { symbol: '5', full: 'power' };
        var vRom = '';
        if (rootMidi != null) {
          var vBassRoot = rootMidi + (((vRootPC - (rootMidi % 12)) + 12) % 12);
          vRom = chordRoman(rootMidi, vBassRoot, vQ.symbol);
        }

        vlLayers.push(vVoicings);
        vlMeta.push({ pcs: vPCs, intervals: vIntervals, name: vName,
                      quality: vQ, roman: vRom, root: vRoot });
      });

      var vlChosen = pickVoiceLedProgression(vlLayers, vlMeta.map(function(m){ return m.pcs; }));
      var vlTotal  = vlChosen.length;

      vlChosen.forEach(function(voicing, chordIdx) {
        var meta  = vlMeta[chordIdx];
        var notes = voicing.map(function(v) { return v.note; });
        // One segment per chord in the sequence; chordIdx/vlTotal drive the
        // queue-strip "chord N of sequence" progress.
        var segId = 'vl_' + meta.root + '_' + chordIdx;
        for (var step = 0; step < notes.length; step++) {
          var t = _chordTask(notes, step, chordIdx, vlTotal, meta.quality, meta.roman, 'chord_shape', segId);
          t.voicing        = voicing;
          t.chordPCs       = meta.pcs;
          t.chordIntervals = meta.intervals;
          t.chordName      = meta.name;
          t.altPositions   = [];   // one voicing per chord — no alternates to show
          tasks.push(t);
        }
      });

    }
  }

  return tasks;
}
