/* keyview.js — Keyboard-first scale visualisation widget (KeyView)
 * ─────────────────────────────────────────────────────────────────
 * TABLE OF CONTENTS
 *   § Constructor        — build keyboard, overlay host, optional fretboard
 *   § _buildFretboard()  — attach fretboard + cross-widget event wiring
 *   § _buildScalePath()  — compute natural ascending fingering path
 *   § _drawPathOverlay() — SVG overlay on fretboard with interval labels
 *   § _drawOverlay()     — SVG overlay below keyboard: degrees, names, V-brackets, tetrachords
 *   § Public API         — triggerNote(), destroy()
 *
 * Widget props:
 *   root        {string}  sci-note tonic, e.g. "C4"
 *   scale       {string}  "major" (default)
 *   notes       {array}   explicit MIDI/sci-note array — overrides root/scale
 *   steps       {bool}    show interval V-brackets (default true)
 *   labels      {string}  "degrees" | "names" | "both" | "none"  (default "both")
 *   tetrachords {bool}    show tetrachord brackets + connecting-step circle (default false)
 *   interactive {bool}    click to play (default true)
 *   fretboard   {bool}    attach a fretboard view below (default false)
 *   frets       {number}  fret count when fretboard is shown (default 7)
 *   audio       {bool|fn}
 *
 * Depends on:  scale-helpers.js → window.MtheoryScaleHelpers
 *              keyboard.js      → window.MtheoryKeyboard
 *              fretboard.js     → window.MtheoryFretboard  (optional)
 * Exports:     window.MtheoryKeyView
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  const { svg, buildScale, stepLabel } = global.MtheoryScaleHelpers;

  // === § CONSTRUCTOR =========================================================

  class KeyView {
    constructor(container, opts) {
      opts = opts || {};
      const KBc  = global.MtheoryKeyboard;
      this.root  = typeof container === "string" ? document.querySelector(container) : container;
      this.root.classList.add("mkv-wrap");
      this.root.innerHTML = "";

      this.showSteps   = opts.steps !== false;
      this.showTch     = !!opts.tetrachords;
      this.interactive = opts.interactive !== false;

      const lbl      = opts.labels;
      this.showDegs  = lbl == null || lbl === "degrees" || lbl === "both";
      this.showNames = lbl == null || lbl === "names"   || lbl === "both";

      this._alteredDegrees = new Set(
        Array.isArray(opts.altered) ? opts.altered.map(Number) : []
      );

      // Build degree list.
      if (Array.isArray(opts.notes) && opts.notes.length) {
        this._degs = opts.notes.map(n => {
          const midi = typeof n === "number" ? n : KBc.midiOfSci(String(n));
          if (midi == null) return null;
          return { midi, name: KBc.nameOf(midi) };
        }).filter(Boolean);
      } else if (opts.root) {
        const rootMidi = KBc.midiOfSci(String(opts.root));
        this._degs     = buildScale(rootMidi, opts.scale || "major");
      } else {
        this._degs = [];
      }

      const degs = this._degs;
      if (!degs.length) return;

      // Keyboard spanning exactly tonic → octave.
      // Keyboard spanning exactly tonic → octave (or explicit range if provided)
      const kbLow  = opts.low  || KBc.sciOf(degs[0].midi);
      const kbHigh = opts.high || KBc.sciOf(degs[degs.length - 1].midi);

      const kbHost = document.createElement("div");
      kbHost.className = "mkv-kb";
      this.root.appendChild(kbHost);
      this._kb = new KBc(kbHost, {
        low:         kbLow,
        high:        kbHigh,
        highlight:   degs.map(d => KBc.sciOf(d.midi)),
        labels:      "naturals",
        interactive: this.interactive,
      });

      // Overlay container sits directly below the keyboard.
      this._overlayHost = document.createElement("div");
      this._overlayHost.className = "mkv-overlay";
      this.root.appendChild(this._overlayHost);

      // Attempt immediately; retry via rAF if layout hasn't resolved yet.
      this._drawOverlay();
      if (!this._overlayHost.children.length) {
        requestAnimationFrame(() => requestAnimationFrame(() => this._drawOverlay()));
      }

      // Optional fretboard below the keyboard.
      if (opts.fretboard && global.MtheoryFretboard) {
        this._fbOpts = opts;
        requestAnimationFrame(() => this._buildFretboard());
      }
    }

    // === § _BUILDFRETBOARD ====================================================

    _buildFretboard() {
      const KBc  = global.MtheoryKeyboard;
      const FB   = global.MtheoryFretboard;
      if (!FB || !KBc) return;

      const degs      = this._degs;
      const fretCount = this._fbOpts.frets != null ? this._fbOpts.frets : 7;

      const degreeLabelMap = {};
      degs.forEach((d, i) => { degreeLabelMap[d.midi] = String(i + 1); });

      // Highlight all pitch-class occurrences on the neck, not just the one octave.
      const scaleNoteNames = degs.map(d => d.name);

      const fbHost = document.createElement("div");
      fbHost.className = "mkv-fb";
      fbHost.style.position = "relative";
      this.root.appendChild(fbHost);
      this._fbHost = fbHost;

      this._fb = new FB(fbHost, {
        frets:     fretCount,
        highlight: scaleNoteNames,
        labels:    "marks",
        labelMap:  degreeLabelMap,
        audio:     this._fbOpts.audio !== false,
      });

      this._kbScaleHighlight = degs.map(d => KBc.sciOf(d.midi));

      const self = this;

      // Keyboard → fretboard: flash played MIDI without re-rendering.
      this.root.addEventListener("mtheory:note_played", function (ev) {
        const payload = ev.detail && ev.detail.payload;
        if (!payload || payload.midi == null || !self._fb) return;
        self._fb.flashMidi(new Set([payload.midi]), 900);
      });

      // Fretboard → keyboard: highlight played key, then restore after 900ms.
      this.root.addEventListener("mtheory:fret_played", function (ev) {
        const payload = ev.detail && ev.detail.payload;
        if (!payload || payload.midi == null || !self._kb) return;
        self._kb.setHighlight(KBc.sciOf(payload.midi));
        clearTimeout(self._kbTimer);
        self._kbTimer = setTimeout(function () {
          self._kb.setHighlight(self._kbScaleHighlight);
        }, 900);
      });

      // Build and draw the ascending scale path overlay on the fretboard.
      const openStringMidi = [0, 1, 2, 3, 4, 5].map(stringIdx => FB.midiAt(stringIdx, 0));
      const scaleMidis     = degs.map(d => d.midi);
      this._scalePath      = this._buildScalePath(scaleMidis, openStringMidi, fretCount);
      if (this._scalePath.length >= 2) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { self._drawPathOverlay(); });
        });
      }
    }

    // === § _BUILDSCALEPATH ====================================================
    // Natural ascending fingering: stay on a string while within 3 frets of the
    // first fret played on that string, then shift to the next higher string.

    _buildScalePath(scaleMidis, openStringMidi, maxFret) {
      const path      = [];
      let stringIdx   = -1;
      let anchorFret  = null; // first fret played on the current string

      // Find the lowest string where the root note falls within range.
      const rootMidi = scaleMidis[0];
      for (let s = 0; s <= 5; s++) {
        const fretNum = rootMidi - openStringMidi[s];
        if (fretNum >= 0 && fretNum <= maxFret) { stringIdx = s; break; }
      }
      if (stringIdx === -1) return path;

      for (let noteIdx = 0; noteIdx < scaleMidis.length; noteIdx++) {
        const midi    = scaleMidis[noteIdx];
        const fretNum = midi - openStringMidi[stringIdx];
        const fitsOnString = fretNum >= 0 && fretNum <= maxFret
                          && (anchorFret === null || fretNum <= anchorFret + 3);

        if (fitsOnString) {
          if (anchorFret === null) anchorFret = fretNum;
          path.push({ string: stringIdx, fret: fretNum, midi });
        } else {
          // Shift up one string and try again.
          stringIdx++;
          if (stringIdx > 5) break;
          const nextStringFret = midi - openStringMidi[stringIdx];
          if (nextStringFret >= 0 && nextStringFret <= maxFret) {
            anchorFret = nextStringFret;
            path.push({ string: stringIdx, fret: nextStringFret, midi });
          }
        }
      }
      return path;
    }

    // === § _DRAWPATHOVERLAY ===================================================
    // SVG overlay on the fretboard showing the ascending scale path with
    // interval labels between consecutive notes.

    _drawPathOverlay() {
      if (!this._scalePath || !this._scalePath.length || !this._fbHost) return;

      const fbRoot   = this._fb.root;
      const hostRect = this._fbHost.getBoundingClientRect();
      if (!hostRect.width) return;

      // Collect the pixel centre of each fret cell, relative to the fretboard host.
      const noteCenters = this._scalePath.map(step => {
        const cell = fbRoot.querySelector('[data-string="' + step.string + '"][data-fret="' + step.fret + '"]');
        if (!cell) return null;
        const cellRect = cell.getBoundingClientRect();
        return {
          x:    cellRect.left + cellRect.width  / 2 - hostRect.left,
          y:    cellRect.top  + cellRect.height / 2 - hostRect.top,
          midi: step.midi,
        };
      }).filter(Boolean);

      if (noteCenters.length < 2) return;

      const old = this._fbHost.querySelector(".mkv-fb-path");
      if (old) old.remove();

      const overlaySvg = svg("svg", {
        class:   "mkv-fb-path",
        viewBox: "0 0 " + hostRect.width + " " + hostRect.height,
        width:   hostRect.width,
        height:  hostRect.height,
        style:   "position:absolute;top:0;left:0;pointer-events:none;overflow:visible",
      });

      for (let i = 0; i < noteCenters.length - 1; i++) {
        const fromNote     = noteCenters[i];
        const toNote       = noteCenters[i + 1];
        const semitones    = toNote.midi - fromNote.midi;
        const isWhole      = semitones === 2;
        const color        = isWhole ? "var(--accent,#5555ff)" : "var(--warn,#ffb700)";
        const intervalLabel = stepLabel(fromNote.midi, toNote.midi);
        const midX         = (fromNote.x + toNote.x) / 2;
        const midY         = (fromNote.y + toNote.y) / 2;

        // Connecting line between the two fret cells.
        overlaySvg.appendChild(svg("line", {
          x1: fromNote.x, y1: fromNote.y, x2: toNote.x, y2: toNote.y,
          stroke: color, "stroke-width": "2", "stroke-linecap": "round", opacity: "0.75",
        }));
        // Filled circle badge at the midpoint.
        overlaySvg.appendChild(svg("circle", { cx: midX, cy: midY, r: 9, fill: color, opacity: "0.92" }));
        // Interval label inside the badge.
        const labelText = svg("text", {
          x: midX, y: midY, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#fff", "font-size": "10", "font-weight": "bold",
        });
        labelText.textContent = intervalLabel;
        overlaySvg.appendChild(labelText);
      }

      this._fbHost.appendChild(overlaySvg);
    }

    // === § _DRAWOVERLAY =======================================================
    // SVG overlay below the keyboard: degree numbers, note names, V-brackets,
    // optional tetrachord brackets and connecting-step circle.

    _drawOverlay() {
      const KBc  = global.MtheoryKeyboard;
      const degs = this._degs;

      const kbHost      = this._overlayHost.previousElementSibling;
      const kbEl        = kbHost.querySelector(".mk-keyboard") || kbHost;
      const kbRect  = kbEl.getBoundingClientRect();
      if (!kbRect.width) return;

      const svgWidth = kbRect.width;

      // Pixel x-centre of each scale note's key, measured from the keyboard's left edge.
      const noteXCenters = degs.map(d => {
        const keyEl = kbEl.querySelector('[data-midi="' + d.midi + '"]');
        if (!keyEl) return null;
        const keyRect = keyEl.getBoundingClientRect();
        return keyRect.left + keyRect.width / 2 - kbRect.left;
      });
      if (noteXCenters.some(x => x === null)) return;

      // ── Y positions (px from top of overlay SVG) ──────────────────────────
      // Stacking order from top to bottom:
      //   degree caret (^)  →  degree number  →  note name
      //   →  V-bracket arms  →  V-bracket tip  →  interval label
      //   →  tetrachord bracket ticks  →  bar  →  tetrachord label

      const Y_DEGREE_CARET    = 12;   // the little ^ above each degree number
      const Y_DEGREE_NUM      = 24;   // the scale degree digit  (1 2 3 4 5 6 7 8)
      const Y_NOTE_NAME       = this.showDegs ? 46 : 22; // note letter  (C D E …)

      const Y_VBRACKET_ARMS   = Y_NOTE_NAME + 7;    // where the V arms leave the name row
      const Y_VBRACKET_TIP    = Y_VBRACKET_ARMS + 22; // lowest point of the V
      const Y_INTERVAL_LABEL  = Y_VBRACKET_TIP + 14;  // "1" or "½" text baseline

      // Tetrachord brackets sit below the interval labels (or below note names
      // if step brackets are hidden).
      const Y_TETCH_OPEN  = this.showSteps ? Y_INTERVAL_LABEL + 28 : Y_NOTE_NAME + 34;
      const Y_TETCH_LABEL = Y_TETCH_OPEN + 24; // "Tetrachord 1 / 2" text baseline

      const showTetrachords = this.showTch && degs.length >= 8;
      const svgHeight = showTetrachords    ? Y_TETCH_LABEL + 16
                      : this.showSteps     ? Y_INTERVAL_LABEL + 10
                      : Y_NOTE_NAME + 14;

      const overlaySvg = svg("svg", {
        class:   "mkv-svg",
        viewBox: "0 0 " + svgWidth + " " + svgHeight,
        width:   svgWidth,
        height:  svgHeight,
        style:   "display:block;overflow:visible",
      });

      // ── Degree numbers (caret ^ above digit) ────────────────────────────────
      if (this.showDegs) {
        degs.forEach((d, i) => {
          const isAltered = this._alteredDegrees.has(i + 1);
          const degColor  = isAltered ? "var(--warn, #d97706)" : null;

          const caret = svg("text", { class: "mkv-degree-hat", x: noteXCenters[i], y: Y_DEGREE_CARET, "text-anchor": "middle" });
          caret.textContent = "^";
          if (degColor) caret.setAttribute("fill", degColor);
          overlaySvg.appendChild(caret);

          const degNum = svg("text", { class: "mkv-degree", x: noteXCenters[i], y: Y_DEGREE_NUM, "text-anchor": "middle" });
          degNum.textContent = String(i + 1);
          if (degColor) degNum.setAttribute("fill", degColor);
          overlaySvg.appendChild(degNum);
        });
      }

      // ── Note names (coloured, with ♯/♭) ────────────────────────────────────
      if (this.showNames) {
        degs.forEach((d, i) => {
          const isAltered   = this._alteredDegrees.has(i + 1);
          const noteStyle   = KBc.noteStyle(d.name);
          const fill        = isAltered
            ? "var(--warn, #d97706)"
            : (noteStyle ? noteStyle.color : "var(--text)");
          const displayName = d.name.replace(/#/g, "♯").replace(/b(?=[^a-z]|$)/g, "♭");
          const nameText = svg("text", {
            class: "mkv-name",
            x: noteXCenters[i], y: Y_NOTE_NAME,
            "text-anchor": "middle",
            fill,
          });
          nameText.textContent = displayName;
          overlaySvg.appendChild(nameText);
        });
      }

      // ── V-brackets between consecutive notes ────────────────────────────────
      if (this.showSteps) {
        for (let i = 0; i < degs.length - 1; i++) {
          const semitoneDiff = degs[i + 1].midi - degs[i].midi;
          const isWhole      = semitoneDiff === 2;
          const color        = isWhole ? "var(--muted,#7777aa)" : "var(--warn,#ffb700)";
          const leftX        = noteXCenters[i];
          const rightX       = noteXCenters[i + 1];
          const midX         = (leftX + rightX) / 2;

          // Left arm: from left note down to the tip.
          overlaySvg.appendChild(svg("line", { x1: leftX, y1: Y_VBRACKET_ARMS, x2: midX, y2: Y_VBRACKET_TIP, stroke: color, "stroke-width": "1.5", "stroke-linecap": "round" }));
          // Right arm: from right note down to the tip.
          overlaySvg.appendChild(svg("line", { x1: rightX, y1: Y_VBRACKET_ARMS, x2: midX, y2: Y_VBRACKET_TIP, stroke: color, "stroke-width": "1.5", "stroke-linecap": "round" }));
          // Short stem from tip down to label.
          overlaySvg.appendChild(svg("line", { x1: midX, y1: Y_VBRACKET_TIP, x2: midX, y2: Y_INTERVAL_LABEL - 3, stroke: color, "stroke-width": "1.5" }));

          const intervalText = svg("text", { class: "mkv-step-label", x: midX, y: Y_INTERVAL_LABEL + 9, "text-anchor": "middle", fill: color });
          intervalText.textContent = stepLabel(degs[i].midi, degs[i + 1].midi);
          overlaySvg.appendChild(intervalText);
        }
      }

      // ── Circle around the connecting whole step between the two tetrachords ─
      // This is always the step between scale degree 4 and 5 (index 3 → 4).
      if (showTetrachords && this.showSteps && degs.length >= 8) {
        const connectingMidX = (noteXCenters[3] + noteXCenters[4]) / 2;
        const accentColor    = "var(--accent,#5555ff)";
        overlaySvg.appendChild(svg("circle", {
          cx: connectingMidX, cy: Y_INTERVAL_LABEL + 5,
          r: 11,
          stroke: accentColor, "stroke-width": "1.5", fill: "none",
        }));
      }

      // ── Tetrachord square-U brackets ────────────────────────────────────────
      // Shape: ticks point up from the open end, horizontal bar at the bottom.
      if (showTetrachords) {
        const BRACKET_PADDING = 12; // px of extra width beyond the outer notes
        const TICK_HEIGHT     = 10; // px — height of each vertical tick mark
        const accentColor     = "var(--accent,#5555ff)";

        [[0, 3, "Tetrachord 1"], [4, 7, "Tetrachord 2"]].forEach(([fromIdx, toIdx, label]) => {
          const bracketLeft  = noteXCenters[fromIdx] - BRACKET_PADDING;
          const bracketRight = noteXCenters[toIdx]   + BRACKET_PADDING;
          const bracketMidX  = (bracketLeft + bracketRight) / 2;

          // Left tick (pointing up from the bar).
          overlaySvg.appendChild(svg("line", { x1: bracketLeft, y1: Y_TETCH_OPEN, x2: bracketLeft, y2: Y_TETCH_OPEN + TICK_HEIGHT, stroke: accentColor, "stroke-width": "1.5" }));
          // Right tick.
          overlaySvg.appendChild(svg("line", { x1: bracketRight, y1: Y_TETCH_OPEN, x2: bracketRight, y2: Y_TETCH_OPEN + TICK_HEIGHT, stroke: accentColor, "stroke-width": "1.5" }));
          // Horizontal bar connecting the tick bases.
          overlaySvg.appendChild(svg("line", { x1: bracketLeft, y1: Y_TETCH_OPEN + TICK_HEIGHT, x2: bracketRight, y2: Y_TETCH_OPEN + TICK_HEIGHT, stroke: accentColor, "stroke-width": "1.5" }));

          const labelText = svg("text", { class: "mkv-tetch-label", x: bracketMidX, y: Y_TETCH_LABEL, "text-anchor": "middle", fill: accentColor });
          labelText.textContent = label;
          overlaySvg.appendChild(labelText);
        });
      }

      this._overlayHost.innerHTML = "";
      this._overlayHost.appendChild(overlaySvg);
    }

    // === § PUBLIC API =========================================================

    triggerNote(midi) {
      if (this._kb && this._kb.triggerNote) this._kb.triggerNote(midi);
    }

    destroy() {
      clearTimeout(this._fbTimer);
      clearTimeout(this._kbTimer);
      if (this._kb && this._kb.destroy) this._kb.destroy();
      if (this._fb && this._fb.destroy) this._fb.destroy();
      this.root.innerHTML = "";
    }
  }

  global.MtheoryKeyView = KeyView;

})(window);
