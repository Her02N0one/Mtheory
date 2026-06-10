/* staff.js — Staff widget: treble, guitar-8va, or grand (treble+bass)
 * ─────────────────────────────────────────────────────────────────────
 * TABLE OF CONTENTS
 *   § Geometry        — SVG coordinate constants (NOTE_DX = 34)
 *   § Constructor     — parse opts, resolve notes, call render()
 *   § render()        — build SVG: staff lines, clef(s), noteheads
 *   § _renderClef()   — dispatch to treble / guitar-8 / bass clef
 *   § _renderNote()   — notehead + ledger lines + accidental + label + click
 *   § _ledgerLines()  — draw ledger lines above/below staff (or grand zones)
 *   § _press()        — handle click/trigger: play + emit
 *   § _emit()         — fire DOM CustomEvent + onEvent callback
 *   § _emitQuiz()     — quiz-mode answer event
 *   § Public API      — setNotes(), setHighlight(), setHighlightMidi(),
 *                       setQuiz(), triggerNote(), flashNote(), destroy()
 *
 * clef options
 * ─────────────
 *   "treble"  — standard treble clef (G clef).  Default.
 *   "guitar"  — treble clef with an 8 subscript; notes sound an octave lower
 *               than written (writtenOffset = +12 MIDI).
 *   "grand"   — treble staff + bass staff combined (piano grand staff).
 *               Bottom staff line index 18 (G2); barline connects both staves.
 *               Middle C (index 28) gets its own ledger line in the gap.
 *               Replaces the former separate GrandStaff widget.
 *
 * Vertical layout — treble clef:
 *   diatonic index = octave*7 + letterStep   (C=0 D=1 E=2 F=3 G=4 A=5 B=6)
 *   bottom staff line = E4 (index 30); each diatonic step = half a line gap.
 *   middle C4 (index 28) sits on the first ledger line below the staff.
 *
 * Grand staff Y reference (same formula, two stave groups):
 *   F5 (38) → y= 46  — treble top
 *   E4 (30) → y= 94  — treble bottom
 *   C4 (28) → y=106  — middle-C ledger (in the gap)
 *   A3 (26) → y=118  — bass top
 *   G2 (18) → y=166  — bass bottom
 *
 * Depends on:  keyboard.js → window.MtheoryKeyboard
 * Exports:     window.MtheoryStaff
 *              window.MtheoryGrandStaff  (alias: new Staff(el, {clef:"grand", ...props}))
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  // === § GEOMETRY ============================================================

  const LETTER_STEP  = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const GAP          = 12;
  const STEP         = GAP / 2;
  const TOP_Y        = 46;
  const BOTTOM_INDEX = 30;
  const BOTTOM_Y     = TOP_Y + 4 * GAP;
  const STAFF_X0     = 8;
  const CLEF_W       = 40;
  const NOTE_DX      = 34;
  const NOTE_R       = 6.6;

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function diatonicIndex(midi) {
    const k = KB();
    const name   = k.nameOf(midi);
    const letter = name[0];
    const oct    = k.octaveOf(midi);
    return oct * 7 + LETTER_STEP[letter];
  }
  function accidentalOf(midi) {
    const name = KB().nameOf(midi);
    return name.length > 1 ? name[1] : "";
  }
  function yForIndex(index) {
    return BOTTOM_Y - (index - BOTTOM_INDEX) * STEP;
  }

  // === § CONSTRUCTOR =========================================================

  class Staff {
    /* opts:
     *   low, high   {string}  sci range, default "C4".."A5"
     *   notes       {array}   explicit notes (sci|midi) — overrides range
     *   highlight   {string|string[]}  note(s) to mark
     *   labels      {string}  "names" | "none"  (default "names")
     *   interactive {bool}    click a notehead to play  (default true)
     *   audio       {bool|fn}
     *   quiz        {object}  { targetMidi }
     *   cols        {number}  minimum column count (keeps proportions stable)
     *   clef        {string}  "treble" | "guitar"  (default "treble")
     *   onEvent     {fn}
     *   emitDom     {bool}    default true
     */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("Staff: container not found");

      const k = KB();
      this.clef = opts.clef || "treble";

      // Grand staff defaults to a wider range spanning both staves.
      const defaultLow  = this.clef === "grand" ? "E2" : "C4";
      const defaultHigh = this.clef === "grand" ? "E5" : "A5";
      this.lowMidi     = k.midiOfSci(opts.low  || defaultLow);
      this.highMidi    = k.midiOfSci(opts.high || defaultHigh);

      this.labels      = opts.labels || "names";
      this.interactive = opts.interactive !== false;
      this.emitDom     = opts.emitDom !== false;
      this.cols        = opts.cols != null ? opts.cols : null;
      this.onEvent     = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false)          this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else                               this._play = (k && k.pluck) || function () {};

      this.highlightMidi   = this._toMidiSet(opts.highlight);
      this.quiz            = opts.quiz || null;
      this.quizTargetMidi  = this.quiz && this.quiz.targetMidi != null ? this.quiz.targetMidi : null;

      // Guitar clef: display notes at written pitch (midi+12), emit at sounding pitch.
      this.writtenOffset = this.clef === "guitar" ? 12 : 0;

      this.notes   = this._resolveNotes(opts.notes);
      this._noteEls = new Map();
      this.render();
    }

    _resolveNotes(spec) {
      const k = KB();
      if (Array.isArray(spec) && spec.length) {
        return spec.map(n => (typeof n === "number" ? n : k.midiOfSci(String(n)))).filter(m => m != null);
      }
      if (this.quizTargetMidi != null) return [this.quizTargetMidi];
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

    // === § RENDER =============================================================

    render() {
      this.root.classList.add("ms-staff");
      this.root.classList.toggle("ms-staff--grand", this.clef === "grand");
      this.root.innerHTML = "";
      this._noteEls.clear();

      const cols  = Math.max(this.notes.length, this.cols || 0, 1);
      const width = STAFF_X0 + CLEF_W + cols * NOTE_DX + 16;

      let height;
      if (this.clef === "grand") {
        // Fixed grand-staff height; label row sits below the bass staff.
        height       = 220;
        this._labelY = yForIndex(18) + GAP * 2.5;
      } else {
        // Expand height if guitar clef pushes notes below the treble staff.
        const loWrittenIdx = this.notes.length
          ? Math.min(...this.notes.map(m => diatonicIndex(m + this.writtenOffset)))
          : BOTTOM_INDEX;
        const loY    = yForIndex(loWrittenIdx);
        this._labelY = Math.max(BOTTOM_Y + GAP * 3.0, loY + GAP * 2.5);
        height       = Math.max(150, this._labelY + 20);
      }

      const el = svg("svg", {
        class: "ms-svg",
        viewBox: "0 0 " + width + " " + height,
        width: "100%",
        preserveAspectRatio: "xMinYMid meet",
      });
      this._svg   = el;
      this._width = width;

      if (this.clef === "grand") {
        // Treble staff lines: E4 G4 B4 D5 F5 (diatonic indices 30 32 34 36 38)
        [30, 32, 34, 36, 38].forEach(idx => {
          const y = yForIndex(idx);
          el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
        });
        // Bass staff lines: G2 B2 D3 F3 A3 (diatonic indices 18 20 22 24 26)
        [18, 20, 22, 24, 26].forEach(idx => {
          const y = yForIndex(idx);
          el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
        });
        // Barline connecting treble top → bass bottom
        el.appendChild(svg("line", {
          class: "ms-barline",
          x1: STAFF_X0, y1: yForIndex(38),
          x2: STAFF_X0, y2: yForIndex(18),
        }));
      } else {
        for (let i = 0; i < 5; i++) {
          const y = TOP_Y + i * GAP;
          el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
        }
      }

      this._renderClef(el);

      const pad = ((cols - this.notes.length) / 2) * NOTE_DX;
      this.notes.forEach((midi, i) => {
        const x = STAFF_X0 + CLEF_W + pad + i * NOTE_DX + NOTE_DX / 2;
        this._renderNote(el, midi, x);
      });

      this.root.appendChild(el);
    }

    // === § _RENDERCLEF ========================================================

    _renderClef(parent) {
      if (this.clef === "grand") {
        this._renderTrebleClef(parent);
        this._renderBassClef(parent);
        return;
      }
      this._renderTrebleClef(parent);
      // Guitar clef: "8" subscript below the clef tail.
      if (this.clef === "guitar") {
        const eight = svg("text", {
          class: "ms-clef-8",
          x: STAFF_X0 + 22,
          y: BOTTOM_Y + GAP * 1.5 + 6,
          "text-anchor": "middle",
          "font-size": GAP * 1.5,
        });
        eight.textContent = "8";
        parent.appendChild(eight);
      }
    }

    _renderTrebleClef(parent) {
      const gLineY = yForIndex(32); // G4 line
      const t = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        y: gLineY + GAP * 0.78,
        "font-size": GAP * 5,
      });
      t.textContent = "𝄞";
      parent.appendChild(t);
    }

    // F-clef glyph positioned so its dots straddle the F3 line (index 24).
    _renderBassClef(parent) {
      const fLineY = yForIndex(24);
      const t = svg("text", {
        class: "ms-clef-glyph ms-clef-glyph--bass",
        x: STAFF_X0 + 10,
        y: fLineY + GAP * 1.8,
        "font-size": GAP * 4,
      });
      t.textContent = "𝄢";
      parent.appendChild(t);
    }

    // === § _RENDERNOTE ========================================================

    _renderNote(parent, midi, x) {
      const k = KB();
      const writtenMidi = midi + this.writtenOffset;
      const index = diatonicIndex(writtenMidi);
      const y     = yForIndex(index);
      const name  = k.nameOf(midi);
      const style = k.noteStyle(name);

      const g = svg("g", { class: "ms-note", "data-midi": String(midi) });
      g.dataset.midi = String(midi);

      this._ledgerLines(g, index, x);

      const head = svg("ellipse", {
        class: "ms-head",
        cx: x, cy: y, rx: NOTE_R, ry: NOTE_R * 0.74,
        transform: "rotate(-20 " + x + " " + y + ")",
      });
      if (style) { head.setAttribute("fill", style.color); head.setAttribute("stroke", style.color); }
      g.appendChild(head);

      if (this.highlightMidi.has(midi)) g.classList.add("ms-note--hi");

      const acc = accidentalOf(midi);
      if (acc) {
        const t = svg("text", { class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle" });
        t.textContent = acc === "#" ? "♯" : "♭";
        g.appendChild(t);
      }

      if (this.labels === "names") {
        const t = svg("text", { class: "ms-label", x, y: this._labelY, "text-anchor": "middle" });
        t.textContent = name;
        if (style) t.setAttribute("fill", style.color);
        g.appendChild(t);
      }

      if (this.interactive) {
        const hitH = this.clef === "grand" ? 212 : 142;
        const hit = svg("rect", { class: "ms-hit", x: x - NOTE_DX / 2, y: 4, width: NOTE_DX, height: hitH, fill: "transparent" });
        g.appendChild(hit);
        g.classList.add("ms-note--play");
        g.addEventListener("pointerdown", ev => { ev.preventDefault(); this._press(midi, g); });
      }

      parent.appendChild(g);
      this._noteEls.set(midi, g);
    }

    // === § _LEDGERLINES =======================================================

    _ledgerLines(parent, index, x) {
      const w = NOTE_R + 4;
      const line = i => {
        const y = yForIndex(i);
        parent.appendChild(svg("line", { class: "ms-ledger", x1: x - w, y1: y, x2: x + w, y2: y }));
      };
      if (this.clef === "grand") {
        // Three zones: above treble top (F5), middle-C ledger in the gap, below bass bottom (G2).
        if (index > 38) { for (let i = 40; i <= index; i += 2) line(i); }
        if (index === 28) line(28); // middle C
        if (index < 18)  { for (let i = 16; i >= index; i -= 2) line(i); }
      } else {
        if (index <= 28) { for (let i = 28; i >= index; i -= 2) line(i); }
        else if (index >= 40) { for (let i = 40; i <= index; i += 2) line(i); }
      }
    }

    // === § _PRESS =============================================================

    _press(midi, g) {
      this._play(midi, KB().freqOf(midi));
      g.classList.add("ms-note--active");
      setTimeout(() => g.classList.remove("ms-note--active"), 160);
      if (this.quizTargetMidi != null) this._emitQuiz(midi);
      else                             this._emit("note_played", KB().notePayload(midi));
    }

    // === § _EMIT ==============================================================

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "staff", payload: payload };
      try { console.log("[Staff]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true }));
      }
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    // === § _EMITQUIZ ==========================================================

    _emitQuiz(selectedMidi) {
      const k         = KB();
      const isCorrect = k.pitchClassOf(selectedMidi) === k.pitchClassOf(this.quizTargetMidi);
      return this._emit("note_quizzed", {
        targetPitchClass:   k.pitchClassOf(this.quizTargetMidi),
        selectedPitchClass: k.pitchClassOf(selectedMidi),
        targetNote:         k.nameOf(this.quizTargetMidi),
        selectedNote:       k.nameOf(selectedMidi),
        isCorrect,
      });
    }

    // === § PUBLIC API =========================================================

    setNotes(spec)    { this.notes = this._resolveNotes(spec); this.render(); }
    showNote(midi)    { this.setNotes([midi]); }
    setHighlight(spec){ this.setHighlightMidi(this._toMidiSet(spec)); }

    setHighlightMidi(midiSet) {
      this.highlightMidi = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      this._noteEls.forEach((g, midi) => {
        g.classList.toggle("ms-note--hi", this.highlightMidi.has(midi));
      });
    }

    setQuiz(quiz) {
      this.quiz           = quiz || null;
      this.quizTargetMidi = quiz && quiz.targetMidi != null ? quiz.targetMidi : null;
      if (this.quizTargetMidi != null) this.setNotes([this.quizTargetMidi]);
    }

    triggerNote(midi) {
      let g = this._noteEls.get(midi);
      if (!g) {
        const k  = KB();
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

  Staff.diatonicIndex = diatonicIndex;

  global.MtheoryStaff = Staff;

  // MtheoryGrandStaff: convenience alias — equivalent to Staff with clef:"grand".
  // Preserves backwards compatibility; the grandstaff.js file is no longer needed.
  global.MtheoryGrandStaff = function GrandStaff(el, props) {
    return new Staff(el, Object.assign({ clef: "grand" }, props || {}));
  };

})(window);
