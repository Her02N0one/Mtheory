/* grandstaff.js — Treble + bass grand staff widget (GrandStaff class)
 * ────────────────────────────────────────────────────────────────────
 * TABLE OF CONTENTS
 *   § Geometry           — SVG coordinate constants (mirrors staff.js)
 *   § Constructor        — parse opts, resolve notes, call render()
 *   § render()           — treble lines, bass lines, barline, clefs, noteheads
 *   § _renderTrebleClef()— G-clef glyph
 *   § _renderBassClef()  — F-clef glyph
 *   § _ledgerLines()     — above treble / middle-C / below bass
 *   § _renderNote()      — notehead + accidental + label + click
 *   § _press()           — play + emit on interaction
 *   § _emit()            — DOM CustomEvent + onEvent callback
 *   § Public API         — setHighlight(), setHighlightMidi(), destroy()
 *
 * Grand staff Y reference (treble formula applies to both staves):
 *   F5 (38) → y= 46  — treble top
 *   E4 (30) → y= 94  — treble bottom
 *   C4 (28) → y=106  — middle-C ledger (in gap between staves)
 *   A3 (26) → y=118  — bass top
 *   G2 (18) → y=166  — bass bottom
 *
 * See also: staff.js (Staff — treble-only single staff)
 * Depends on:  keyboard.js → window.MtheoryKeyboard
 * Exports:     window.MtheoryGrandStaff
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  // === § GEOMETRY ============================================================
  // Mirrors staff.js constants exactly — intentional duplication to keep this
  // file fully self-contained without a shared dependency.

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

  class GrandStaff {
    /* opts mirror Staff: low, high, notes, highlight, labels, interactive,
     * audio, cols, onEvent, emitDom. */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("GrandStaff: container not found");

      const k = KB();
      this.lowMidi     = k.midiOfSci(opts.low  || "E2");
      this.highMidi    = k.midiOfSci(opts.high || "E5");
      this.labels      = opts.labels || "none";
      this.interactive = opts.interactive !== false;
      this.emitDom     = opts.emitDom !== false;
      this.cols        = opts.cols != null ? opts.cols : null;
      this.onEvent     = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false)          this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else                               this._play = (k && k.pluck) || function () {};

      this.highlightMidi = this._toMidiSet(opts.highlight);
      this.notes         = this._resolveNotes(opts.notes);
      this._noteEls      = new Map();
      this.render();
    }

    _resolveNotes(spec) {
      const k = KB();
      if (Array.isArray(spec) && spec.length) {
        return spec.map(n => typeof n === "number" ? n : k.midiOfSci(String(n))).filter(m => m != null);
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

    // === § RENDER =============================================================

    render() {
      this.root.classList.add("ms-staff", "ms-staff--grand");
      this.root.innerHTML = "";
      this._noteEls.clear();

      const cols  = Math.max(this.notes.length, this.cols || 0, 1);
      const width = STAFF_X0 + CLEF_W + cols * NOTE_DX + 16;
      const el    = svg("svg", {
        class:  "ms-svg",
        viewBox: "0 0 " + width + " 220",
        width:  "100%",
        preserveAspectRatio: "xMinYMid meet",
      });
      this._svg   = el;
      this._width = width;

      // Treble staff lines: E4 G4 B4 D5 F5  (indices 30 32 34 36 38)
      [30, 32, 34, 36, 38].forEach(idx => {
        const y = yForIndex(idx);
        el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
      });

      // Bass staff lines: G2 B2 D3 F3 A3  (indices 18 20 22 24 26)
      [18, 20, 22, 24, 26].forEach(idx => {
        const y = yForIndex(idx);
        el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
      });

      // Connecting barline: treble top → bass bottom.
      el.appendChild(svg("line", {
        class: "ms-barline",
        x1: STAFF_X0, y1: yForIndex(38),
        x2: STAFF_X0, y2: yForIndex(18),
      }));

      this._renderTrebleClef(el);
      this._renderBassClef(el);

      const pad = ((cols - this.notes.length) / 2) * NOTE_DX;
      this.notes.forEach((midi, i) => {
        const x = STAFF_X0 + CLEF_W + pad + i * NOTE_DX + NOTE_DX / 2;
        this._renderNote(el, midi, x);
      });

      this.root.appendChild(el);
    }

    // === § _RENDERTREBLECLEF ==================================================

    _renderTrebleClef(parent) {
      const gLineY = yForIndex(32);
      const t = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        y: gLineY + GAP * 0.776,
        "font-size": GAP * 5,
      });
      t.textContent = "𝄞";
      parent.appendChild(t);
    }

    // === § _RENDERBASSCLEF ====================================================
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

    // === § _LEDGERLINES =======================================================
    // Covers three zones: above treble (> F5), middle-C ledger, below bass (< G2).

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

    // === § _RENDERNOTE ========================================================

    _renderNote(parent, midi, x) {
      const k     = KB();
      const index = diatonicIndex(midi);
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

      // Labels sit below the bass staff so all names share one baseline.
      if (this.labels === "names") {
        const labelY = yForIndex(18) + GAP * 2.5;
        const t = svg("text", { class: "ms-label", x, y: labelY, "text-anchor": "middle" });
        t.textContent = name;
        if (style) t.setAttribute("fill", style.color);
        g.appendChild(t);
      }

      if (this.interactive) {
        const hit = svg("rect", { class: "ms-hit", x: x - NOTE_DX / 2, y: 4, width: NOTE_DX, height: 212, fill: "transparent" });
        g.appendChild(hit);
        g.classList.add("ms-note--play");
        g.addEventListener("pointerdown", ev => { ev.preventDefault(); this._press(midi, g); });
      }

      parent.appendChild(g);
      this._noteEls.set(midi, g);
    }

    // === § _PRESS =============================================================

    _press(midi, g) {
      this._play(midi, KB().freqOf(midi));
      g.classList.add("ms-note--active");
      setTimeout(() => g.classList.remove("ms-note--active"), 160);
      this._emit("note_played", KB().notePayload(midi));
    }

    // === § _EMIT ==============================================================

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "grandstaff", payload: payload };
      try { console.log("[GrandStaff]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true }));
      }
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    // === § PUBLIC API =========================================================

    setHighlight(spec)  { this.setHighlightMidi(this._toMidiSet(spec)); }

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

  // Re-export Staff statics for backward compat (Staff.diatonicIndex is set in staff.js).
  GrandStaff.diatonicIndex = diatonicIndex;

})(window);
