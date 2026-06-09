/* scale-helpers.js — Shared pitch & geometry utilities for ScaleView and KeyView
 * ─────────────────────────────────────────────────────────────────────────────
 * TABLE OF CONTENTS
 *   § Constants       — letter tables, semitone maps
 *   § Staff geometry  — SVG coordinate constants (NOTE_DX = 52 for scale spacing)
 *   § SVG factory     — svg() element creator
 *   § Pitch helpers   — diatonicIndex(), yForIndex()
 *   § Scale builder   — buildMajorScale(rootMidi)
 *   § Step label      — stepLabel(m1, m2) → "1" | "½" | "1½"
 *
 * Exports: window.MtheoryScaleHelpers
 * Must load before: scaleview.js, keyview.js
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  // === § CONSTANTS ===========================================================

  const LETTERS         = ["C", "D", "E", "F", "G", "A", "B"];
  const LETTER_STEP     = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const NATURAL_PC      = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];

  // === § STAFF GEOMETRY ======================================================
  // Mirrors staff.js except NOTE_DX is wider (52 vs 34) to give step brackets room.

  const GAP          = 12;
  const STEP         = GAP / 2;
  const TOP_Y        = 46;
  const BOTTOM_INDEX = 30;          // diatonic index of E4, the bottom staff line
  const BOTTOM_Y     = TOP_Y + 4 * GAP; // y of bottom staff line = 94
  const STAFF_X0     = 8;
  const CLEF_W       = 40;
  const NOTE_DX      = 52;          // wider than staff.js to give W/H bracket room
  const NOTE_R       = 6.6;

  // === § SVG FACTORY =========================================================

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // === § PITCH HELPERS =======================================================

  function diatonicIndex(midi) {
    const k = KB();
    const name   = k.nameOf(midi);
    const letter = name[0];
    const oct    = k.octaveOf(midi);
    return oct * 7 + LETTER_STEP[letter];
  }

  function yForIndex(index) {
    return BOTTOM_Y - (index - BOTTOM_INDEX) * STEP;
  }

  // === § SCALE BUILDER =======================================================
  // Builds a major scale from rootMidi with correct letter spelling.
  // e.g. G major → G A B C D E F# G  (not Gb).

  function buildMajorScale(rootMidi) {
    const k               = KB();
    const rootName        = k.nameOf(rootMidi);
    const rootLetter      = rootName[0];
    const rootLetterIndex = LETTERS.indexOf(rootLetter);
    if (rootLetterIndex === -1) return [];

    const scale = [];
    for (let scaleDegree = 0; scaleDegree < 8; scaleDegree++) {
      const letterIndex  = (rootLetterIndex + scaleDegree) % 7;
      const letter       = LETTERS[letterIndex];
      const targetMidi   = rootMidi + MAJOR_SEMITONES[scaleDegree];
      const targetOctave = Math.floor(targetMidi / 12) - 1;

      // MIDI of the natural (no accidental) version of this letter in this octave.
      let naturalNoteMidi = (targetOctave + 1) * 12 + NATURAL_PC[letter];
      // If the gap exceeds a tritone we picked the wrong octave — adjust by one.
      if (Math.abs(naturalNoteMidi - targetMidi) > 6) {
        naturalNoteMidi += (targetMidi > naturalNoteMidi ? 12 : -12);
      }

      const semitoneDiff = targetMidi - naturalNoteMidi;
      const accidental   = semitoneDiff === 0  ? ""
                         : semitoneDiff === 1  ? "#"  : semitoneDiff === -1 ? "b"
                         : semitoneDiff === 2  ? "##" : semitoneDiff === -2 ? "bb" : "";
      scale.push({ midi: targetMidi, name: letter + accidental, letter, acc: accidental });
    }
    return scale;
  }

  // === § SCALE BUILDER (GENERAL) =============================================
  // Builds any scale type by applying semitone alterations to the parallel major.
  // alts: 0-indexed degree positions → semitone offset (e.g. {2: -1} = lower deg 3).

  const ACC_SEMI = { "": 0, "#": 1, "##": 2, "b": -1, "bb": -2 };
  const SEMI_ACC = { "0": "", "1": "#", "2": "##", "-1": "b", "-2": "bb" };

  function shiftDeg(deg, semitones) {
    const cur = ACC_SEMI[deg.acc] !== undefined ? ACC_SEMI[deg.acc] : 0;
    const nxt = cur + semitones;
    const acc = SEMI_ACC[String(nxt)] !== undefined ? SEMI_ACC[String(nxt)] : "";
    return { midi: deg.midi + semitones, name: deg.letter + acc, letter: deg.letter, acc };
  }

  // Scale type → 0-indexed alteration map (each entry lowers/raises that degree).
  const SCALE_ALTS = {
    major:              {},
    natural_minor:      { 2: -1, 5: -1, 6: -1 }, // ♭3, ♭6, ♭7
    harmonic_minor:     { 2: -1, 5: -1 },          // ♭3, ♭6
    melodic_minor:      { 2: -1 },                  // ♭3 (ascending form)
    melodic_minor_desc: { 2: -1, 5: -1, 6: -1 },   // = natural (descending form)
  };

  function buildScale(rootMidi, type) {
    const major = buildMajorScale(rootMidi);
    const alts  = SCALE_ALTS[type || "major"];
    if (!alts || Object.keys(alts).length === 0) return major;
    return major.map((deg, i) => {
      const s = alts[i];
      return s != null ? shiftDeg(deg, s) : deg;
    });
  }

  // === § STEP LABEL ==========================================================

  function stepLabel(m1, m2) {
    const semitones = m2 - m1;
    if (semitones === 1) return "½";
    if (semitones === 2) return "1";
    if (semitones === 3) return "1½";
    return String(semitones);
  }

  // === § EXPORT ==============================================================

  global.MtheoryScaleHelpers = {
    LETTERS, LETTER_STEP, NATURAL_PC, MAJOR_SEMITONES,
    GAP, STEP, TOP_Y, BOTTOM_INDEX, BOTTOM_Y, STAFF_X0, CLEF_W, NOTE_DX, NOTE_R,
    SVGNS, svg,
    diatonicIndex, yForIndex,
    buildMajorScale, buildScale, shiftDeg, SCALE_ALTS,
    stepLabel,
  };

})(window);
