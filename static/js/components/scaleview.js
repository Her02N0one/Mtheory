/* scaleview.js — Staff-based scale visualisation widget (ScaleView)
 * ─────────────────────────────────────────────────────────────────
 * TABLE OF CONTENTS
 *   § Constructor        — parse opts, build degree list, call render()
 *   § render()           — assemble staff SVG: lines, clef, noteheads, labels
 *   § _renderNote()      — single notehead + ledger lines + accidental + click
 *   § _renderStep()      — interval bracket between adjacent noteheads
 *   § _renderTetrachord  — square-U bracket grouping a tetrachord
 *   § _emit()            — fire DOM CustomEvent + onEvent callback
 *   § Public API         — triggerNote(), setHighlightMidi(), destroy()
 *
 * Widget props:
 *   root        {string}  sci-note tonic, e.g. "C4"
 *   scale       {string}  "major" (default)
 *   notes       {array}   explicit MIDI/sci-note array — overrides root/scale
 *   steps       {bool}    show interval brackets (default true)
 *   labels      {string}  "degrees" | "names" | "both" | "none"  (default "degrees")
 *   tetrachords {bool}    show tetrachord brackets (default false)
 *   highlight   {array}   sci-notes to ring with halo
 *   interactive {bool}    click to play (default true)
 *   audio       {bool|fn}
 *   onEvent     {fn}
 *   emitDom     {bool}    default true
 *
 * Depends on:  scale-helpers.js → window.MtheoryScaleHelpers
 *              keyboard.js      → window.MtheoryKeyboard
 * Exports:     window.MtheoryScaleView
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  const {
    GAP, TOP_Y, BOTTOM_Y, STAFF_X0, CLEF_W, NOTE_DX, NOTE_R,
    svg, diatonicIndex, yForIndex, buildScale, stepLabel,
  } = global.MtheoryScaleHelpers;

  // === § CONSTRUCTOR =========================================================

  class ScaleView {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("ScaleView: container not found");

      const k = KB();
      this.showSteps      = opts.steps !== false;
      this.labels         = opts.labels != null ? String(opts.labels) : "degrees";
      this.showTetrachords = !!opts.tetrachords;
      this.interactive    = opts.interactive !== false;
      this.emitDom        = opts.emitDom !== false;
      this.onEvent        = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false)          this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else                               this._play = (k && k.pluck) || function () {};

      if (Array.isArray(opts.notes) && opts.notes.length) {
        this._degs = opts.notes.map((n) => {
          const midi = typeof n === "number" ? n : k.midiOfSci(String(n));
          if (midi == null) return null;
          const name = k.nameOf(midi);
          return { midi, name, letter: name[0], acc: name.slice(1) };
        }).filter(Boolean);
      } else if (opts.root) {
        const rootMidi = k.midiOfSci(String(opts.root));
        this._degs     = buildScale(rootMidi, opts.scale || "major");
      } else {
        this._degs = [];
      }

      // altered: 1-based degree indices to display in the warning/amber colour.
      this._alteredDegrees = new Set(
        Array.isArray(opts.altered) ? opts.altered.map(Number) : []
      );

      this._highlightMidi = this._toMidiSet(opts.highlight);
      this._noteEls       = new Map(); // midi → <g>
      this.render();
    }

    _toMidiSet(spec) {
      const set = new Set();
      if (!spec) return set;
      const k = KB();
      (Array.isArray(spec) ? spec : [spec]).forEach((n) => {
        const m = typeof n === "number" ? n : k.midiOfSci(String(n));
        if (m != null) set.add(m);
      });
      return set;
    }

    // === § RENDER =============================================================

    render() {
      this.root.classList.add("msv-wrap");
      this.root.innerHTML = "";
      this._noteEls.clear();

      const degs = this._degs;
      const n    = degs.length;
      if (!n) return;

      const showNames = this.labels === "names"   || this.labels === "both";
      const showDegs  = this.labels === "degrees" || this.labels === "both";

      const noteCount = n;
      const width     = STAFF_X0 + CLEF_W + noteCount * NOTE_DX + 16;

      // Find the lowest notehead y — notes like C4 fall below the bottom staff line.
      let lowestNoteY = BOTTOM_Y;
      degs.forEach(({ midi }) => {
        const noteY = yForIndex(diatonicIndex(midi));
        if (noteY > lowestNoteY) lowestNoteY = noteY;
      });

      // Row y values — each row stacks below the previous one.
      const Y_INTERVAL_ROW = Math.max(lowestNoteY + 16, BOTTOM_Y + 16); // interval bracket row
      const Y_NAME_ROW     = Y_INTERVAL_ROW + (this.showSteps ? 20 : 0); // note letter names
      const Y_DEGREE_ROW   = showNames ? Y_NAME_ROW + 18 : Y_INTERVAL_ROW + (this.showSteps ? 20 : 4); // scale degrees
      const Y_TETCH_ROW    = (showDegs ? Y_DEGREE_ROW : Y_NAME_ROW) + 22; // tetrachord brackets
      const lastRowY       = this.showTetrachords ? Y_TETCH_ROW + 28
                           : showDegs             ? Y_DEGREE_ROW  + 18
                           : showNames            ? Y_NAME_ROW + 18
                           : Y_INTERVAL_ROW + 16;
      const height = Math.max(150, lastRowY + 10);

      const el = svg("svg", {
        class: "msv-svg",
        viewBox: "0 0 " + width + " " + height,
        width: "100%",
        preserveAspectRatio: "xMinYMid meet",
      });
      this._svg = el;

      // Five staff lines.
      for (let i = 0; i < 5; i++) {
        const y = TOP_Y + i * GAP;
        el.appendChild(svg("line", { class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y }));
      }

      // Treble clef glyph.
      const gLineY = yForIndex(32);
      const clef   = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        y: gLineY + GAP * 0.78,
        "font-size": GAP * 5,
      });
      clef.textContent = "𝄞";
      el.appendChild(clef);

      // Noteheads.
      const noteXPositions = degs.map((_, i) => STAFF_X0 + CLEF_W + i * NOTE_DX + NOTE_DX / 2);
      degs.forEach((deg, i) => this._renderNote(el, deg, noteXPositions[i], i));

      // Interval brackets between consecutive noteheads.
      if (this.showSteps && noteCount > 1) {
        for (let i = 0; i < noteCount - 1; i++) {
          const bracketTopY = Y_INTERVAL_ROW - 15;
          const leftX = noteXPositions[i], rightX = noteXPositions[i + 1], midX = (leftX + rightX) / 2;
          el.appendChild(svg("line", { class: "msv-tri", x1: leftX, y1: 110, x2: midX, y2: bracketTopY }));
          el.appendChild(svg("line", { class: "msv-tri", x1: rightX, y1: 110, x2: midX, y2: bracketTopY }));
          this._renderStep(el, degs[i].midi, degs[i + 1].midi, leftX, rightX, bracketTopY);
        }
      }

      // Note names row.
      if (showNames) {
        degs.forEach((deg, i) => {
          const noteStyle = KB().noteStyle(deg.name);
          const nameText = svg("text", { class: "msv-name", x: noteXPositions[i], y: Y_NAME_ROW, "text-anchor": "middle" });
          nameText.textContent = deg.name;
          if (noteStyle) nameText.setAttribute("fill", noteStyle.color);
          el.appendChild(nameText);
        });
      }

      // Scale degree numbers row (digit + small "^" above).
      if (showDegs) {
        degs.forEach((_, i) => {
          const degNum = svg("text", { class: "msv-degree", x: noteXPositions[i], y: Y_DEGREE_ROW, "text-anchor": "middle" });
          degNum.textContent = String(i + 1);
          el.appendChild(degNum);
          const degCaret = svg("text", { class: "msv-degree-hat", x: noteXPositions[i], y: Y_DEGREE_ROW - 9, "text-anchor": "middle" });
          degCaret.textContent = "^";
          el.appendChild(degCaret);
        });
      }

      // Tetrachord brackets (8-note scales only).
      if (this.showTetrachords && noteCount >= 8) {
        this._renderTetrachord(el, noteXPositions, 0, 3, "Tetrachord 1", Y_TETCH_ROW);
        this._renderTetrachord(el, noteXPositions, 4, 7, "Tetrachord 2", Y_TETCH_ROW);
      }

      this.root.appendChild(el);
    }

    // === § _RENDERNOTE ========================================================

    _renderNote(parent, deg, x, degIdx) {
      const k = KB();
      const { midi, name, acc: accidental } = deg;
      const staffLineIdx = diatonicIndex(midi);
      const y            = yForIndex(staffLineIdx);
      const noteStyle    = k.noteStyle(name);
      const isAltered    = this._alteredDegrees.has(degIdx + 1); // 1-based check

      const g = svg("g", { class: "ms-note msv-note", "data-midi": String(midi) });
      g.dataset.midi = String(midi);
      if (isAltered) g.classList.add("ms-note--changed");

      // Ledger lines (drawn below or above the staff when the note is out of range).
      const ledgerHalfWidth = NOTE_R + 4;
      if (staffLineIdx <= 28) {
        for (let lineIdx = 28; lineIdx >= staffLineIdx; lineIdx -= 2) {
          const ledgerY = yForIndex(lineIdx);
          g.appendChild(svg("line", { class: "ms-ledger", x1: x - ledgerHalfWidth, y1: ledgerY, x2: x + ledgerHalfWidth, y2: ledgerY }));
        }
      } else if (staffLineIdx >= 40) {
        for (let lineIdx = 40; lineIdx <= staffLineIdx; lineIdx += 2) {
          const ledgerY = yForIndex(lineIdx);
          g.appendChild(svg("line", { class: "ms-ledger", x1: x - ledgerHalfWidth, y1: ledgerY, x2: x + ledgerHalfWidth, y2: ledgerY }));
        }
      }

      // Notehead ellipse.
      const noteHead = svg("ellipse", {
        class: "ms-head",
        cx: x, cy: y, rx: NOTE_R, ry: NOTE_R * 0.74,
        transform: "rotate(-20 " + x + " " + y + ")",
      });
      if (noteStyle) { noteHead.setAttribute("fill", noteStyle.color); noteHead.setAttribute("stroke", noteStyle.color); }
      g.appendChild(noteHead);

      if (this._highlightMidi.has(midi)) g.classList.add("ms-note--hi");

      // Accidental glyph to the left of the notehead.
      if (accidental === "#") {
        const accText = svg("text", { class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle" });
        accText.textContent = "♯";
        g.appendChild(accText);
      } else if (accidental === "b") {
        const accText = svg("text", { class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle" });
        accText.textContent = "♭";
        g.appendChild(accText);
      }

      if (this.interactive) {
        const hit = svg("rect", { class: "ms-hit", x: x - NOTE_DX / 2, y: 4, width: NOTE_DX, height: 142, fill: "transparent" });
        g.appendChild(hit);
        g.classList.add("ms-note--play");
        g.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          this._play(midi, KB().freqOf(midi));
          g.classList.add("ms-note--active");
          setTimeout(() => g.classList.remove("ms-note--active"), 160);
          this._emit("note_played", KB().notePayload(midi));
        });
      }

      parent.appendChild(g);
      this._noteEls.set(midi, g);
    }

    // === § _RENDERSTEP ========================================================

    _renderStep(parent, m1, m2, x1, x2, y) {
      const isWhole = (m2 - m1) === 2;
      const label   = stepLabel(m1, m2) + " step";
      const xM      = (x1 + x2) / 2;

      parent.appendChild(svg("line", {
        class: isWhole ? "msv-step-line" : "msv-step-line msv-step-line--half",
        x1, y1: y, x2, y2: y,
      }));
      const t = svg("text", {
        class: isWhole ? "msv-step-label" : "msv-step-label msv-step-label--half",
        x: xM, y: y - 8, "text-anchor": "middle",
      });
      t.textContent = label;
      parent.appendChild(t);
    }

    // === § _RENDERTETRACHORD ==================================================

    _renderTetrachord(parent, noteXPositions, from, to, label, barY) {
      const bracketLeft  = noteXPositions[from] - NOTE_DX / 2 + 6;
      const bracketRight = noteXPositions[to]   + NOTE_DX / 2 - 6;
      const bracketMidX  = (bracketLeft + bracketRight) / 2;
      const TICK_HEIGHT  = 6; // px — how far the ticks rise above the bar
      // Ticks point up, bar at bottom.
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: bracketLeft,  y1: barY - TICK_HEIGHT, x2: bracketLeft,  y2: barY }));
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: bracketLeft,  y1: barY,               x2: bracketRight, y2: barY }));
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: bracketRight, y1: barY - TICK_HEIGHT, x2: bracketRight, y2: barY }));
      const labelText = svg("text", { class: "msv-tetch-label", x: bracketMidX, y: barY + 14, "text-anchor": "middle" });
      labelText.textContent = label;
      parent.appendChild(labelText);
    }

    // === § _EMIT ==============================================================

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "scaleview", payload: payload };
      try { console.log("[ScaleView]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true }));
      }
      if (this.onEvent) this.onEvent(evt);
    }

    // === § PUBLIC API =========================================================

    triggerNote(midi) {
      const k  = KB();
      const pc = k.pitchClassOf(midi);
      for (const [m, g] of this._noteEls) {
        if (k.pitchClassOf(m) === pc) {
          this._play(m, k.freqOf(m));
          g.classList.add("ms-note--active");
          setTimeout(() => g.classList.remove("ms-note--active"), 160);
          this._emit("note_played", k.notePayload(m));
          break;
        }
      }
    }

    setHighlightMidi(midiSet) {
      this._highlightMidi = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      this._noteEls.forEach((g, m) => {
        g.classList.toggle("ms-note--hi", this._highlightMidi.has(m));
      });
    }

    destroy() {
      this.root.innerHTML = "";
      this._noteEls.clear();
    }
  }

  global.MtheoryScaleView = ScaleView;

})(window);
