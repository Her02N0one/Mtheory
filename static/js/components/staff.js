/* staff.js — Mtheory Staff component (Content Engine widget)
 *
 * A treble-clef staff that speaks the same §1d event contract as the Keyboard
 * and Fretboard. It renders notes as coloured noteheads on the five lines /
 * four spaces (plus ledger lines), is optionally playable (click a notehead to
 * hear it), and exposes a MIDI-keyed highlight API so a Companion can sync the
 * staff with the keyboard by absolute sounding pitch.
 *
 * It reuses the Keyboard's pitch math + synth + colour/shape standard, so a C
 * on the staff is the same red as a C key or a C fret.
 *
 * Vertical layout (treble clef):
 *   diatonic index = octave*7 + letterStep   (C=0,D=1,E=2,F=3,G=4,A=5,B=6)
 *   bottom staff line = E4 (index 30); each diatonic step = half a line gap.
 *   middle C4 (index 28) sits on the first ledger line below the staff.
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  // --- Geometry (SVG user units) -----------------------------------------
  const GAP = 12;          // distance between adjacent staff lines
  const STEP = GAP / 2;    // one diatonic step = half a gap
  const TOP_Y = 46;        // y of the top staff line (F5)
  const BOTTOM_INDEX = 30; // diatonic index of the bottom line (E4)
  const BOTTOM_Y = TOP_Y + 4 * GAP; // y of the bottom line (E4)
  const STAFF_X0 = 8;      // left edge of the staff lines
  const CLEF_W = 40;       // room for the clef before the first notehead
  const NOTE_DX = 34;      // horizontal spacing between successive noteheads
  const NOTE_R = 6.6;      // notehead radius (x)

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // Diatonic index of a midi, using the keyboard's flat-preferred letter.
  function diatonicIndex(midi) {
    const k = KB();
    const name = k.nameOf(midi);        // e.g. "C", "F#", "Bb"
    const letter = name[0];
    const oct = k.octaveOf(midi);
    return oct * 7 + LETTER_STEP[letter];
  }
  function accidentalOf(midi) {
    const name = KB().nameOf(midi);
    return name.length > 1 ? name[1] : ""; // "#" | "b" | ""
  }
  function yForIndex(index) {
    return BOTTOM_Y - (index - BOTTOM_INDEX) * STEP;
  }

  class Staff {
    /* opts:
     *   low, high   {string} sci range of the playable scale (default C4..A5)
     *   notes       {array}  explicit notes (sci|midi) to show instead of scale
     *   highlight   {string|string[]} note(s) to mark
     *   labels      {string} 'names' (letter under each note) | 'none' (default 'names')
     *   interactive {boolean} click a notehead to play it (default true)
     *   audio       {boolean|function}
     *   quiz        {object} { targetMidi } — show a single prompt note
     *   onEvent     {function}
     *   emitDom     {boolean} default true
     */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("Staff: container not found");

      const k = KB();
      this.lowMidi = k.midiOfSci(opts.low || "C4");
      this.highMidi = k.midiOfSci(opts.high || "A5");
      this.labels = opts.labels || "names";
      this.interactive = opts.interactive !== false;
      this.emitDom = opts.emitDom !== false;
      this.cols = opts.cols != null ? opts.cols : null;
      this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false) this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (k && k.pluck) || function () {};

      this.highlightMidi = this._toMidiSet(opts.highlight);
      this.quiz = opts.quiz || null;
      this.quizTargetMidi = this.quiz && this.quiz.targetMidi != null ? this.quiz.targetMidi : null;

      // Guitar clef: treble clef with "8" below — written notes sound one octave
      // lower than notated.  We display each note at its WRITTEN pitch (midi+12)
      // while emitting / quizzing at the sounding pitch.
      this.clef = opts.clef || "treble";
      this.writtenOffset = this.clef === "guitar" ? 12 : 0;

      // The notes to lay out: explicit list, a single quiz note, or the scale.
      this.notes = this._resolveNotes(opts.notes);

      this._noteEls = new Map(); // midi -> notehead <g>
      this.render();
    }

    _resolveNotes(spec) {
      const k = KB();
      if (Array.isArray(spec) && spec.length) {
        return spec.map((n) => (typeof n === "number" ? n : k.midiOfSci(String(n))))
          .filter((m) => m != null);
      }
      if (this.quizTargetMidi != null) return [this.quizTargetMidi];
      // Default: the diatonic (white-key) scale across the range.
      const out = [];
      const WHITE = [0, 2, 4, 5, 7, 9, 11];
      for (let m = this.lowMidi; m <= this.highMidi; m++) {
        if (WHITE.indexOf(k.pitchClassOf(m)) !== -1) out.push(m);
      }
      return out;
    }

    _toMidiSet(spec) {
      const set = new Set();
      if (spec == null) return set;
      const k = KB();
      (Array.isArray(spec) ? spec : [spec]).forEach((item) => {
        const midi = typeof item === "number" ? item : k.midiOfSci(String(item));
        if (midi != null) set.add(midi);
      });
      return set;
    }

    render() {
      this.root.classList.add("ms-staff");
      this.root.innerHTML = "";
      this._noteEls.clear();

      // Reserve at least `cols` note columns so a single-note staff (e.g. a
      // read prompt) keeps the same proportions — and thus the same clef size —
      // as a full scale, instead of ballooning when stretched to 100% width.
      const cols = Math.max(this.notes.length, this.cols || 0, 1);
      const width = STAFF_X0 + CLEF_W + cols * NOTE_DX + 16;

      // Dynamic height: if the guitar clef shifts notes below the staff (e.g.
      // open low-E string sits 2 ledger lines down), expand the canvas so the
      // noteheads and labels are not clipped.
      const loWrittenIdx = this.notes.length
        ? Math.min(...this.notes.map(m => diatonicIndex(m + this.writtenOffset)))
        : BOTTOM_INDEX;
      const loY = yForIndex(loWrittenIdx);
      // Label row sits GAP*3 below BOTTOM_Y, or GAP*2.5 below the lowest note.
      this._labelY = Math.max(BOTTOM_Y + GAP * 3.0, loY + GAP * 2.5);
      const height = Math.max(150, this._labelY + 20);
      const el = svg("svg", {
        class: "ms-svg",
        viewBox: "0 0 " + width + " " + height,
        width: "100%",
        preserveAspectRatio: "xMinYMid meet",
      });
      this._svg = el;
      this._width = width;

      // Five staff lines.
      for (let i = 0; i < 5; i++) {
        const y = TOP_Y + i * GAP;
        el.appendChild(svg("line", {
          class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y,
        }));
      }

      // Treble clef glyph (wraps the G4 line, 2nd from the bottom).
      this._renderClef(el);

      // Noteheads (centred within the reserved column block).
      const pad = ((cols - this.notes.length) / 2) * NOTE_DX;
      this.notes.forEach((midi, i) => {
        const x = STAFF_X0 + CLEF_W + pad + i * NOTE_DX + NOTE_DX / 2;
        this._renderNote(el, midi, x);
      });

      this.root.appendChild(el);
    }

    _renderClef(parent) {
      // The treble clef as the Unicode G-clef glyph (U+1D11E). It renders from a
      // system music fallback font on every platform we target, and its curl is
      // drawn around the glyph's lower-middle — we position that on the G4 line.
      const gLineY = yForIndex(32); // G4 line
      const t = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        // Baseline tuned so the glyph's spiral eye encircles the G4 line and the
        // body fills the staff (tail dipping ~1.5 gaps below the bottom line).
        y: gLineY + GAP * 0.78,
        "font-size": GAP * 5,
      });
      t.textContent = "\uD834\uDD1E"; // 𝄞  (surrogate pair for U+1D11E)
      parent.appendChild(t);

      // Guitar clef: add an "8" subscript below the clef tail to indicate the
      // written pitch sounds one octave lower than notated.
      if (this.clef === "guitar") {
        const eight = svg("text", {
          class: "ms-clef-8",
          x: STAFF_X0 + 22,
          y: BOTTOM_Y + GAP * 1.5 + 6, // nudge down a bit for optical centering
          "text-anchor": "middle",
          "font-size": GAP * 1.5,
        });
        eight.textContent = "8";
        parent.appendChild(eight);
      }
    }

    _renderNote(parent, midi, x) {
      const k = KB();
      // writtenOffset: guitar clef displays notes one octave higher than they sound.
      // Use writtenMidi only for staff position; colour/name/sound stay at sounding midi.
      const writtenMidi = midi + this.writtenOffset;
      const index = diatonicIndex(writtenMidi);
      const y = yForIndex(index);
      const name = k.nameOf(midi);
      const style = k.noteStyle(name);

      const g = svg("g", { class: "ms-note", "data-midi": String(midi) });
      g.dataset.midi = String(midi);

      // Ledger lines between the staff and an out-of-staff note.
      this._ledgerLines(g, index, x);

      // Notehead (filled oval, tilted slightly like real notation).
      const head = svg("ellipse", {
        class: "ms-head",
        cx: x, cy: y, rx: NOTE_R, ry: NOTE_R * 0.74,
        transform: "rotate(-20 " + x + " " + y + ")",
      });
      if (style) {
        head.setAttribute("fill", style.color);
        head.setAttribute("stroke", style.color);
      }
      g.appendChild(head);

      if (this.highlightMidi.has(midi)) g.classList.add("ms-note--hi");

      // Accidental glyph to the left of the notehead.
      const acc = accidentalOf(midi);
      if (acc) {
        const t = svg("text", {
          class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle",
        });
        t.textContent = acc === "#" ? "\u266F" : "\u266D";
        g.appendChild(t);
      }

      // Letter label: aligned to a shared row below the lowest notehead so
      // all labels sit on the same baseline regardless of note position.
      if (this.labels === "names") {
        const t = svg("text", {
          class: "ms-label", x: x, y: this._labelY, "text-anchor": "middle",
        });
        t.textContent = name;
        if (style) t.setAttribute("fill", style.color);
        g.appendChild(t);
      }

      if (this.interactive) {
        // Transparent hit area so the whole column is easy to click.
        const hit = svg("rect", {
          class: "ms-hit", x: x - NOTE_DX / 2, y: 4,
          width: NOTE_DX, height: 142, fill: "transparent",
        });
        g.appendChild(hit);
        g.classList.add("ms-note--play");
        g.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          this._press(midi, g);
        });
      }

      parent.appendChild(g);
      this._noteEls.set(midi, g);
    }

    _ledgerLines(parent, index, x) {
      const w = NOTE_R + 4;
      if (index <= 28) {
        for (let i = 28; i >= index; i -= 2) {
          const y = yForIndex(i);
          parent.appendChild(svg("line", {
            class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y,
          }));
        }
      } else if (index >= 40) {
        for (let i = 40; i <= index; i += 2) {
          const y = yForIndex(i);
          parent.appendChild(svg("line", {
            class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y,
          }));
        }
      }
    }

    _press(midi, g) {
      this._play(midi, KB().freqOf(midi));
      g.classList.add("ms-note--active");
      setTimeout(() => g.classList.remove("ms-note--active"), 160);

      if (this.quizTargetMidi != null) {
        this._emitQuiz(midi);
      } else {
        this._emit("note_played", KB().notePayload(midi));
      }
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "staff", payload: payload };
      try { console.log("[Staff]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    _emitQuiz(selectedMidi) {
      const k = KB();
      const isCorrect = k.pitchClassOf(selectedMidi) === k.pitchClassOf(this.quizTargetMidi);
      return this._emit("note_quizzed", {
        targetPitchClass: k.pitchClassOf(this.quizTargetMidi),
        selectedPitchClass: k.pitchClassOf(selectedMidi),
        targetNote: k.nameOf(this.quizTargetMidi),
        selectedNote: k.nameOf(selectedMidi),
        isCorrect: isCorrect,
      });
    }

    // --- Public API -------------------------------------------------------
    // Replace the rendered notes (e.g. show the next quiz note).
    setNotes(spec) {
      this.notes = this._resolveNotes(spec);
      this.render();
    }
    showNote(midi) { this.setNotes([midi]); }

    setHighlight(spec) { this.setHighlightMidi(this._toMidiSet(spec)); }
    setHighlightMidi(midiSet) {
      this.highlightMidi = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      this._noteEls.forEach((g, midi) => {
        g.classList.toggle("ms-note--hi", this.highlightMidi.has(midi));
      });
    }

    // Show a single prompt note (display only — the answer surface is elsewhere).
    setQuiz(quiz) {
      this.quiz = quiz || null;
      this.quizTargetMidi = quiz && quiz.targetMidi != null ? quiz.targetMidi : null;
      if (this.quizTargetMidi != null) this.setNotes([this.quizTargetMidi]);
    }
    // Trigger a note from MIDI input — same logic as a pointer click.
    triggerNote(midi) {
      let g = this._noteEls.get(midi);
      if (!g) {
        const k = KB();
        const pc = k.pitchClassOf(midi);
        for (const [m, el] of this._noteEls) {
          if (k.pitchClassOf(m) === pc) { g = el; midi = m; break; }
        }
      }
      if (!g) return;
      this._press(midi, g);
    }
    flashNote(midi, cls) {
      const g = this._noteEls.get(midi);
      if (!g) return;
      g.classList.add(cls);
      setTimeout(() => g.classList.remove(cls), 380);
    }

    destroy() {
      this.root.innerHTML = "";
      this._noteEls.clear();
    }
  }

  // Expose the same statics the keyboard does, for consistency.
  Staff.diatonicIndex = diatonicIndex;

  // =========================================================================
  // GrandStaff — treble + bass clef in one SVG, using the same yForIndex
  // reference as Staff (E4/index-30 anchored at BOTTOM_Y=94).  The two staves
  // are separated by exactly one GAP, placing C4 (index 28) on a ledger line
  // centred between them — standard grand-staff geometry.
  //
  //   Grand staff Y reference (treble formula works for both):
  //   F5  (38) → y=46  ─ treble top
  //   E4  (30) → y=94  ─ treble bottom
  //   C4  (28) → y=106 ─ middle-C ledger (in gap)
  //   A3  (26) → y=118 ─ bass top
  //   G2  (18) → y=166 ─ bass bottom
  // =========================================================================
  class GrandStaff {
    /* opts mirror Staff: low, high, notes, highlight, labels, interactive,
     * audio, cols, onEvent, emitDom. */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("GrandStaff: container not found");

      const k = KB();
      this.lowMidi  = k.midiOfSci(opts.low  || "E2");
      this.highMidi = k.midiOfSci(opts.high || "E5");
      this.labels   = opts.labels || "none";
      this.interactive = opts.interactive !== false;
      this.emitDom  = opts.emitDom !== false;
      this.cols     = opts.cols != null ? opts.cols : null;
      this.onEvent  = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false) this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (k && k.pluck) || function () {};

      this.highlightMidi = this._toMidiSet(opts.highlight);
      this.notes = this._resolveNotes(opts.notes);
      this._noteEls = new Map();
      this.render();
    }

    _resolveNotes(spec) {
      const k = KB();
      if (Array.isArray(spec) && spec.length) {
        return spec.map(n => typeof n === "number" ? n : k.midiOfSci(String(n)))
          .filter(m => m != null);
      }
      const out = [], WHITE = [0, 2, 4, 5, 7, 9, 11];
      for (let m = this.lowMidi; m <= this.highMidi; m++) {
        if (WHITE.indexOf(k.pitchClassOf(m)) !== -1) out.push(m);
      }
      return out;
    }

    _toMidiSet(spec) {
      const set = new Set();
      if (spec == null) return set;
      const k = KB();
      (Array.isArray(spec) ? spec : [spec]).forEach(item => {
        const midi = typeof item === "number" ? item : k.midiOfSci(String(item));
        if (midi != null) set.add(midi);
      });
      return set;
    }

    render() {
      this.root.classList.add("ms-staff", "ms-staff--grand");
      this.root.innerHTML = "";
      this._noteEls.clear();

      const cols  = Math.max(this.notes.length, this.cols || 0, 1);
      const width = STAFF_X0 + CLEF_W + cols * NOTE_DX + 16;
      // Height: treble top at y=46, bass bottom at y=166, labels + margin below.
      const height = 220;
      const el = svg("svg", {
        class: "ms-svg",
        viewBox: "0 0 " + width + " " + height,
        width: "100%",
        preserveAspectRatio: "xMinYMid meet",
      });
      this._svg = el;
      this._width = width;

      // Treble staff lines: E4(30) G4(32) B4(34) D5(36) F5(38)
      [30, 32, 34, 36, 38].forEach(idx => {
        const y = yForIndex(idx);
        el.appendChild(svg("line", {
          class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y,
        }));
      });

      // Bass staff lines: G2(18) B2(20) D3(22) F3(24) A3(26)
      [18, 20, 22, 24, 26].forEach(idx => {
        const y = yForIndex(idx);
        el.appendChild(svg("line", {
          class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y,
        }));
      });

      // Connecting barline: treble top (F5, y=46) → bass bottom (G2, y=166)
      el.appendChild(svg("line", {
        class: "ms-barline",
        x1: STAFF_X0, y1: yForIndex(38),
        x2: STAFF_X0, y2: yForIndex(18),
      }));

      this._renderTrebleClef(el);
      this._renderBassClef(el);

      // Noteheads, centred within reserved columns
      const pad = ((cols - this.notes.length) / 2) * NOTE_DX;
      this.notes.forEach((midi, i) => {
        const x = STAFF_X0 + CLEF_W + pad + i * NOTE_DX + NOTE_DX / 2;
        this._renderNote(el, midi, x);
      });

      this.root.appendChild(el);
    }

    _renderTrebleClef(parent) {
      const gLineY = yForIndex(32); // G4 line
      const t = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        y: gLineY + GAP * 0.776,
        "font-size": GAP * 5,
      });
      t.textContent = "\uD834\uDD1E"; // U+1D11E treble clef
      parent.appendChild(t);
    }

    _renderBassClef(parent) {
      // U+1D122 bass clef glyph.  In Segoe UI Symbol / system fallback, the
      // dots appear at roughly the top-third of the glyph BBox, and the glyph
      // extends ~51 SVG units above its text baseline.  We must shift the
      // baseline down until the dots straddle the F3 line (index 24, y=130).
      // Empirically: dots are ~30 units above where the baseline would naively
      // sit, so baseline = fLineY + GAP*2.5 centres them on F3.
      const fLineY = yForIndex(24);
      const t = svg("text", {
        class: "ms-clef-glyph ms-clef-glyph--bass",
        x: STAFF_X0 + 10,
        y: fLineY + GAP * 1.8,
        "font-size": GAP * 4,
      });
      t.textContent = "\uD834\uDD22"; // U+1D122 bass clef
      parent.appendChild(t);
    }

    // Ledger lines for the grand staff.
    //   Above treble (> F5):  draw lines from index 40 up to the note.
    //   Middle C (= 28):      one shared ledger in the inter-staff gap.
    //   Below bass  (< G2):   draw lines from index 16 down to the note.
    _ledgerLines(parent, index, x) {
      const w = NOTE_R + 4;
      if (index > 38) {
        for (let i = 40; i <= index; i += 2) {
          const y = yForIndex(i);
          parent.appendChild(svg("line", { class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y }));
        }
      }
      if (index === 28) {
        const y = yForIndex(28);
        parent.appendChild(svg("line", { class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y }));
      }
      if (index < 18) {
        for (let i = 16; i >= index; i -= 2) {
          const y = yForIndex(i);
          parent.appendChild(svg("line", { class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y }));
        }
      }
    }

    _renderNote(parent, midi, x) {
      const k = KB();
      const index = diatonicIndex(midi);
      const y = yForIndex(index);
      const name = k.nameOf(midi);
      const style = k.noteStyle(name);

      const g = svg("g", { class: "ms-note", "data-midi": String(midi) });
      g.dataset.midi = String(midi);

      this._ledgerLines(g, index, x);

      const head = svg("ellipse", {
        class: "ms-head",
        cx: x, cy: y, rx: NOTE_R, ry: NOTE_R * 0.74,
        transform: "rotate(-20 " + x + " " + y + ")",
      });
      if (style) {
        head.setAttribute("fill", style.color);
        head.setAttribute("stroke", style.color);
      }
      g.appendChild(head);

      if (this.highlightMidi.has(midi)) g.classList.add("ms-note--hi");

      const acc = accidentalOf(midi);
      if (acc) {
        const t = svg("text", {
          class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle",
        });
        t.textContent = acc === "#" ? "\u266F" : "\u266D";
        g.appendChild(t);
      }

      // Labels sit at a fixed y below the bass staff so all names align.
      if (this.labels === "names") {
        const labelY = yForIndex(18) + GAP * 2.5; // below bass bottom
        const t = svg("text", {
          class: "ms-label", x: x, y: labelY, "text-anchor": "middle",
        });
        t.textContent = name;
        if (style) t.setAttribute("fill", style.color);
        g.appendChild(t);
      }

      if (this.interactive) {
        const hit = svg("rect", {
          class: "ms-hit", x: x - NOTE_DX / 2, y: 4,
          width: NOTE_DX, height: 212, fill: "transparent",
        });
        g.appendChild(hit);
        g.classList.add("ms-note--play");
        g.addEventListener("pointerdown", ev => {
          ev.preventDefault();
          this._press(midi, g);
        });
      }

      parent.appendChild(g);
      this._noteEls.set(midi, g);
    }

    _press(midi, g) {
      this._play(midi, KB().freqOf(midi));
      g.classList.add("ms-note--active");
      setTimeout(() => g.classList.remove("ms-note--active"), 160);
      this._emit("note_played", KB().notePayload(midi));
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "grandstaff", payload: payload };
      try { console.log("[GrandStaff]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    // --- Public API -------------------------------------------------------
    setHighlight(spec) { this.setHighlightMidi(this._toMidiSet(spec)); }
    setHighlightMidi(midiSet) {
      this.highlightMidi = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      this._noteEls.forEach((g, midi) => {
        g.classList.toggle("ms-note--hi", this.highlightMidi.has(midi));
      });
    }

    destroy() {
      this.root.innerHTML = "";
      this._noteEls.clear();
    }
  }

  global.MtheoryGrandStaff = GrandStaff;

  // Expose the same statics the keyboard does, for consistency.
  Staff.diatonicIndex = diatonicIndex;

  global.MtheoryStaff = Staff;
})(window);
