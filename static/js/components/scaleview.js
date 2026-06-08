/* scaleview.js — Scale-step visualisation widget for the Mtheory Content Engine
 *
 * Renders a treble-clef staff with:
 *   • coloured noteheads (same standard as Keyboard / Fretboard)
 *   • W / H brackets between consecutive notes (whole / half step)
 *   • scale-degree labels under the staff  (1̂ 2̂ 3̂ 4̂ 5̂ 6̂ 7̂ 8̂)
 *   • optional note-name labels
 *   • optional tetrachord brackets
 *
 * Widget props (passed from the Content Engine block):
 *   root        {string}  sci-note for the tonic, e.g. "C4" or "G4"
 *   scale       {string}  "major" (default) — builds the scale with correct letter spelling
 *   notes       {array}   explicit MIDI/sci-note array — overrides root/scale
 *   steps       {bool}    show W/H brackets (default true)
 *   labels      {string}  "degrees" | "names" | "both" | "none"  (default "degrees")
 *   tetrachords {bool}    show tetrachord brackets (default false)
 *   highlight   {array}   sci-notes to ring with the highlight halo
 *   interactive {bool}    click to play (default true)
 *   audio       {bool|fn}
 *   onEvent     {fn}
 *   emitDom     {bool}    default true
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];

  // --- Geometry (mirrors staff.js) ----------------------------------------
  const GAP = 12;
  const STEP = GAP / 2;
  const TOP_Y = 46;
  const BOTTOM_INDEX = 30; // E4
  const BOTTOM_Y = TOP_Y + 4 * GAP; // 94
  const STAFF_X0 = 8;
  const CLEF_W = 40;
  const NOTE_DX = 52;   // slightly wider than staff to give room for W/H brackets
  const NOTE_R = 6.6;

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function diatonicIndex(midi) {
    const k = KB();
    const name = k.nameOf(midi);
    const letter = name[0];
    const oct = k.octaveOf(midi);
    return oct * 7 + LETTER_STEP[letter];
  }
  function yForIndex(index) {
    return BOTTOM_Y - (index - BOTTOM_INDEX) * STEP;
  }

  // --- Scale builder -------------------------------------------------------
  // Produces notes with CORRECT letter spelling for any major scale root.
  // E.g. G major → G A B C D E F# G (not Gb).
  function buildMajorScale(rootMidi) {
    const k = KB();
    // Determine root letter from the sci string. KB().nameOf is flat-preferred
    // so we need to handle sharp roots manually. For common natural roots it works.
    const rootName = k.nameOf(rootMidi);
    const rootLetter = rootName[0];
    const rootLetterIdx = LETTERS.indexOf(rootLetter);
    if (rootLetterIdx === -1) return [];

    const scale = [];
    for (let d = 0; d < 8; d++) {
      const letterIdx = (rootLetterIdx + d) % 7;
      const letter = LETTERS[letterIdx];
      const targetMidi = rootMidi + MAJOR_SEMITONES[d];
      const targetOct = Math.floor(targetMidi / 12) - 1;

      // Natural MIDI for this letter in the target octave.
      let naturalMidi = (targetOct + 1) * 12 + NATURAL_PC[letter];
      // If the gap exceeds a tritone we've picked the wrong octave — adjust.
      if (Math.abs(naturalMidi - targetMidi) > 6) {
        naturalMidi += (targetMidi > naturalMidi ? 12 : -12);
      }

      const diff = targetMidi - naturalMidi;
      const acc = diff === 0 ? "" : diff === 1 ? "#" : diff === -1 ? "b"
                : diff === 2 ? "##" : diff === -2 ? "bb" : "";
      scale.push({ midi: targetMidi, name: letter + acc, letter, acc });
    }
    return scale;
  }

  function stepLabel(m1, m2) {
    const d = m2 - m1;
    if (d === 1) return "H";
    if (d === 2) return "W";
    if (d === 3) return "W+H";
    return String(d);
  }

  // =========================================================================
  class ScaleView {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("ScaleView: container not found");

      const k = KB();
      this.showSteps = opts.steps !== false;
      this.labels = opts.labels != null ? String(opts.labels) : "degrees";
      this.showTetrachords = !!opts.tetrachords;
      this.interactive = opts.interactive !== false;
      this.emitDom = opts.emitDom !== false;
      this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false) this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (k && k.pluck) || function () {};

      // Build note list with correct spelling.
      if (Array.isArray(opts.notes) && opts.notes.length) {
        // Explicit array — no scale-degree name knowledge; use KB names.
        this._degs = opts.notes.map((n) => {
          const midi = typeof n === "number" ? n : k.midiOfSci(String(n));
          if (midi == null) return null;
          const name = k.nameOf(midi);
          return { midi, name, letter: name[0], acc: name.slice(1) };
        }).filter(Boolean);
      } else if (opts.root) {
        const rootMidi = k.midiOfSci(String(opts.root));
        const type = opts.scale || "major";
        this._degs = type === "major" ? buildMajorScale(rootMidi) : [];
      } else {
        this._degs = [];
      }

      this._highlightMidi = this._toMidiSet(opts.highlight);
      this._noteEls = new Map(); // midi -> <g>
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

    render() {
      this.root.classList.add("msv-wrap");
      this.root.innerHTML = "";
      this._noteEls.clear();

      const degs = this._degs;
      const n = degs.length;
      if (!n) return;

      const showNames = this.labels === "names" || this.labels === "both";
      const showDegs  = this.labels === "degrees" || this.labels === "both";

      // Compute SVG dimensions.
      const cols = n;
      const width = STAFF_X0 + CLEF_W + cols * NOTE_DX + 16;

      // Lowest notehead y (may be below the staff, e.g. C4 at y=106).
      let loY = BOTTOM_Y;
      degs.forEach(({ midi }) => {
        const idx = diatonicIndex(midi);
        const y = yForIndex(idx);
        if (y > loY) loY = y;
      });

      // Row y values — stacked below the lowest note.
      const Y_STEPS   = Math.max(loY + 16, BOTTOM_Y + 16);
      const Y_NAMES   = Y_STEPS  + (this.showSteps ? 20 : 0);
      const Y_DEGS    = showNames ? Y_NAMES + 18 : Y_STEPS + (this.showSteps ? 20 : 4);
      const Y_TETCH   = (showDegs ? Y_DEGS : Y_NAMES) + 22;
      const bottomRow = this.showTetrachords ? Y_TETCH + 28
                      : showDegs             ? Y_DEGS  + 18
                      : showNames            ? Y_NAMES + 18
                      : Y_STEPS + 16;
      const height = Math.max(150, bottomRow + 10);

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
        el.appendChild(svg("line", {
          class: "ms-line", x1: STAFF_X0, y1: y, x2: width - 8, y2: y,
        }));
      }

      // Treble clef.
      const gLineY = yForIndex(32);
      const clef = svg("text", {
        class: "ms-clef-glyph",
        x: STAFF_X0 + 8,
        y: gLineY + GAP * 0.78,
        "font-size": GAP * 5,
      });
      clef.textContent = "\uD834\uDD1E";
      el.appendChild(clef);

      // Noteheads.
      const xs = degs.map((_, i) => STAFF_X0 + CLEF_W + i * NOTE_DX + NOTE_DX / 2);
      degs.forEach((deg, i) => this._renderNote(el, deg, xs[i]));

      // W/H step brackets.
      // W/H step brackets + Triangle lines
      if (this.showSteps && n > 1) {
        for (let i = 0; i < n - 1; i++) {
          const m1 = degs[i].midi;
          const m2 = degs[i + 1].midi;
          const x1 = xs[i];
          const x2 = xs[i + 1];
          const xM = (x1 + x2) / 2;
          
          // Draw the triangle lines coming from the keys to the midpoint
          // Assuming keyboard keys are around Y=110 (adjust based on your layout)
          const bracketTop = Y_STEPS - 15;
          el.appendChild(svg("line", { class: "msv-tri", x1: x1, y1: 110, x2: xM, y2: bracketTop }));
          el.appendChild(svg("line", { class: "msv-tri", x1: x2, y1: 110, x2: xM, y2: bracketTop }));

          // Draw the W/H bracket
          this._renderStep(el, m1, m2, x1, x2, bracketTop);
        }
      }

      // Note names row.
      if (showNames) {
        degs.forEach((deg, i) => {
          const k = KB();
          const style = k.noteStyle(deg.name);
          const t = svg("text", {
            class: "msv-name",
            x: xs[i], y: Y_NAMES, "text-anchor": "middle",
          });
          t.textContent = deg.name;
          if (style) t.setAttribute("fill", style.color);
          el.appendChild(t);
        });
      }

      // Scale degree numbers row — rendered as two text elements per degree
      // (digit + small "^" above) because combining U+0302 is unreliable in SVG.
      if (showDegs) {
        degs.forEach((_, i) => {
          const numT = svg("text", {
            class: "msv-degree",
            x: xs[i], y: Y_DEGS, "text-anchor": "middle",
          });
          numT.textContent = String(i + 1);
          el.appendChild(numT);
          const hatT = svg("text", {
            class: "msv-degree-hat",
            x: xs[i], y: Y_DEGS - 9, "text-anchor": "middle",
          });
          hatT.textContent = "^";
          el.appendChild(hatT);
        });
      }

      // Tetrachord brackets (for 8-note scales).
      if (this.showTetrachords && n >= 8) {
        this._renderTetrachord(el, xs, 0, 3, "Tetrachord 1", Y_TETCH);
        this._renderTetrachord(el, xs, 4, 7, "Tetrachord 2", Y_TETCH);
      }

      this.root.appendChild(el);
    }

    _renderNote(parent, deg, x) {
      const k = KB();
      const { midi, name, acc } = deg;
      const index = diatonicIndex(midi);
      const y = yForIndex(index);
      const style = k.noteStyle(name);

      const g = svg("g", { class: "ms-note msv-note", "data-midi": String(midi) });
      g.dataset.midi = String(midi);

      // Ledger lines below staff.
      if (index <= 28) {
        const w = NOTE_R + 4;
        for (let i = 28; i >= index; i -= 2) {
          const ly = yForIndex(i);
          g.appendChild(svg("line", {
            class: "ms-ledger", x1: x - w, y1: ly, x2: x + w, y2: ly,
          }));
        }
      } else if (index >= 40) {
        const w = NOTE_R + 4;
        for (let i = 40; i <= index; i += 2) {
          const ly = yForIndex(i);
          g.appendChild(svg("line", {
            class: "ms-ledger", x1: x - w, y1: ly, x2: x + w, y2: ly,
          }));
        }
      }

      // Notehead.
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

      if (this._highlightMidi.has(midi)) g.classList.add("ms-note--hi");

      // Accidental glyph.
      if (acc === "#") {
        const t = svg("text", { class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle" });
        t.textContent = "\u266F";
        g.appendChild(t);
      } else if (acc === "b") {
        const t = svg("text", { class: "ms-acc", x: x - NOTE_R - 6, y: y + 4, "text-anchor": "middle" });
        t.textContent = "\u266D";
        g.appendChild(t);
      }

      if (this.interactive) {
        const hit = svg("rect", {
          class: "ms-hit", x: x - NOTE_DX / 2, y: 4,
          width: NOTE_DX, height: 142, fill: "transparent",
        });
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

    _renderStep(parent, m1, m2, x1, x2, y) {
      const d = m2 - m1;
      const isHalf = d === 1;
      const label = isHalf ? "½ step" : "1 step";
      
      const xM = (x1 + x2) / 2;
      const TICK = 5;

      // Draw the bracket line
      parent.appendChild(svg("line", { 
          class: isHalf ? "msv-step-line msv-step-line--half" : "msv-step-line", 
          x1: x1, y1: y, x2: x2, y2: y 
      }));
      
      // Draw the label
      const t = svg("text", { 
          class: isHalf ? "msv-step-label msv-step-label--half" : "msv-step-label", 
          x: xM, y: y - 8, "text-anchor": "middle" 
      });
      t.textContent = label;
      parent.appendChild(t);
    }

    _renderTetrachord(parent, xs, from, to, label, y) {
      const x1 = xs[from] - NOTE_DX / 2 + 6;
      const x2 = xs[to]   + NOTE_DX / 2 - 6;
      const xM = (x1 + x2) / 2;
      const TICK = 6;
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: x1, y1: y - TICK, x2: x1, y2: y }));
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: x1, y1: y, x2: x2, y2: y }));
      parent.appendChild(svg("line", { class: "msv-tetch-line", x1: x2, y1: y - TICK, x2: x2, y2: y }));
      const t = svg("text", { class: "msv-tetch-label", x: xM, y: y + 14, "text-anchor": "middle" });
      t.textContent = label;
      parent.appendChild(t);
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "scaleview", payload: payload };
      try { console.log("[ScaleView]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
    }

    // --- Public API -------------------------------------------------------
    triggerNote(midi) {
      const k = KB();
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

  // =========================================================================
  // KeyView — keyboard-first scale visualisation.
  // Shows a piano keyboard with scale notes highlighted, then below it:
  //   • coloured letter names (with ♯/♭ superscripts)
  //   • V-bracket annotations between consecutive notes (W amber, H muted)
  //   • optional scale-degree numbers + ^ hat
  //   • optional tetrachord square brackets
  // =========================================================================
  class KeyView {
    constructor(container, opts) {
      opts = opts || {};
      const KBc = global.MtheoryKeyboard;
      this.root = typeof container === "string" ? document.querySelector(container) : container;
      this.root.classList.add("mkv-wrap");
      this.root.innerHTML = "";

      this.showSteps    = opts.steps !== false;
      this.showTch      = !!opts.tetrachords;
      this.interactive  = opts.interactive !== false;

      const lbl = opts.labels;
      this.showDegs  = lbl == null || lbl === "degrees" || lbl === "both";
      this.showNames = lbl == null || lbl === "names"   || lbl === "both";

      // Build degree list (reuse same scale builder as ScaleView).
      if (Array.isArray(opts.notes) && opts.notes.length) {
        this._degs = opts.notes.map(n => {
          const midi = typeof n === "number" ? n : KBc.midiOfSci(String(n));
          if (midi == null) return null;
          const name = KBc.nameOf(midi);
          return { midi, name };
        }).filter(Boolean);
      } else if (opts.root) {
        const rootMidi = KBc.midiOfSci(String(opts.root));
        this._degs = (opts.scale || "major") === "major" ? buildMajorScale(rootMidi) : [];
      } else {
        this._degs = [];
      }

      const degs = this._degs;
      if (!degs.length) return;

      // Keyboard spanning exactly from tonic to octave note.
      const kbHost = document.createElement("div");
      kbHost.className = "mkv-kb";
      this.root.appendChild(kbHost);
      this._kb = new KBc(kbHost, {
        low:       KBc.sciOf(degs[0].midi),
        high:      KBc.sciOf(degs[degs.length - 1].midi),
        highlight: degs.map(d => KBc.sciOf(d.midi)),
        labels:    "naturals",
        interactive: this.interactive,
      });

      // Overlay container sits directly below the keyboard.
      this._overlayHost = document.createElement("div");
      this._overlayHost.className = "mkv-overlay";
      this.root.appendChild(this._overlayHost);

      // Try immediately (getBoundingClientRect forces layout), then retry via rAF.
      this._drawOverlay();
      if (!this._overlayHost.children.length) {
        requestAnimationFrame(() => requestAnimationFrame(() => this._drawOverlay()));
      }

      // Optional fretboard view below the keyboard overlay.
      if (opts.fretboard && global.MtheoryFretboard) {
        this._fbOpts = opts;
        requestAnimationFrame(() => this._buildFretboard());
      }
    }

    _buildFretboard() {
      const KBc = global.MtheoryKeyboard;
      const FB  = global.MtheoryFretboard;
      if (!FB || !KBc) return;

      const degs  = this._degs;
      const frets = this._fbOpts.frets != null ? this._fbOpts.frets : 7;

      // Degree label map: exact MIDI in the scale → degree number string.
      const labelMap = {};
      degs.forEach(function (d, i) { labelMap[d.midi] = String(i + 1); });

      // Highlight by note name (pitch-class) so every occurrence of each scale
      // note lights up on the neck, not just the one octave shown on the keyboard.
      const highlightNames = degs.map(function (d) { return d.name; });

      const fbHost = document.createElement("div");
      fbHost.className = "mkv-fb";
      fbHost.style.position = "relative"; // needed for the path SVG overlay
      this.root.appendChild(fbHost);
      this._fbHost = fbHost;

      this._fb = new FB(fbHost, {
        frets:     frets,
        highlight: highlightNames,
        labels:    "marks",
        labelMap:  labelMap,
        audio:     this._fbOpts.audio !== false,
      });

      this._kbScaleHighlight = degs.map(function (d) { return KBc.sciOf(d.midi); });

      const self = this;

      // Keyboard → fretboard: flash the played MIDI without re-rendering the
      // fretboard (which would destroy the path SVG overlay).
      this.root.addEventListener("mtheory:note_played", function (ev) {
        const p = ev.detail && ev.detail.payload;
        if (!p || p.midi == null || !self._fb) return;
        self._fb.flashMidi(new Set([p.midi]), 900);
      });

      // Fretboard → keyboard: highlight the played key, then restore.
      this.root.addEventListener("mtheory:fret_played", function (ev) {
        const p = ev.detail && ev.detail.payload;
        if (!p || p.midi == null || !self._kb) return;
        self._kb.setHighlight(KBc.sciOf(p.midi));
        clearTimeout(self._kbTimer);
        self._kbTimer = setTimeout(function () {
          self._kb.setHighlight(self._kbScaleHighlight);
        }, 900);
      });

      // Compute the standard ascending scale path and draw the interval overlay.
      const openMidi = [0, 1, 2, 3, 4, 5].map(function (s) { return FB.midiAt(s, 0); });
      const scaleMidis = degs.map(function (d) { return d.midi; });
      this._scalePath = this._buildScalePath(scaleMidis, openMidi, frets);
      if (this._scalePath.length >= 2) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { self._drawPathOverlay(); });
        });
      }
    }

    // Build the natural ascending fingering path for the scale.
    // Stays on a string while the fret number stays within 3 semitones of the
    // first fret played on that string, then shifts to the next higher string.
    _buildScalePath(scaleMidis, openMidi, maxFret) {
      const path   = [];
      let s        = -1;
      let firstF   = null;

      // Find the lowest string where the first note sits within range.
      const root = scaleMidis[0];
      for (let i = 0; i <= 5; i++) {
        const f = root - openMidi[i];
        if (f >= 0 && f <= maxFret) { s = i; break; }
      }
      if (s === -1) return path;

      for (let n = 0; n < scaleMidis.length; n++) {
        const midi = scaleMidis[n];
        const f    = midi - openMidi[s];
        const ok   = f >= 0 && f <= maxFret && (firstF === null || f <= firstF + 3);

        if (ok) {
          if (firstF === null) firstF = f;
          path.push({ string: s, fret: f, midi: midi });
        } else {
          // Shift to the next higher string.
          s++;
          if (s > 5) break;
          const f2 = midi - openMidi[s];
          if (f2 >= 0 && f2 <= maxFret) {
            firstF = f2;
            path.push({ string: s, fret: f2, midi: midi });
          }
        }
      }
      return path;
    }

    // Draw an SVG overlay on top of the fretboard showing the scale path with
    // W / H labels between consecutive notes (same-string and cross-string).
    _drawPathOverlay() {
      if (!this._scalePath || !this._scalePath.length || !this._fbHost) return;

      const SVGNS = "http://www.w3.org/2000/svg";
      function mk(tag, a) {
        const e = document.createElementNS(SVGNS, tag);
        if (a) for (const k in a) e.setAttribute(k, a[k]);
        return e;
      }

      const fbRoot    = this._fb.root;
      const hostRect  = this._fbHost.getBoundingClientRect();
      if (!hostRect.width) return;

      // Collect cell centres relative to fbHost.
      const pts = this._scalePath.map(function (step) {
        const cell = fbRoot.querySelector(
          '[data-string="' + step.string + '"][data-fret="' + step.fret + '"]'
        );
        if (!cell) return null;
        const r = cell.getBoundingClientRect();
        return {
          x:    r.left + r.width  / 2 - hostRect.left,
          y:    r.top  + r.height / 2 - hostRect.top,
          midi: step.midi,
        };
      }).filter(Boolean);

      if (pts.length < 2) return;

      // Remove any existing overlay.
      const old = this._fbHost.querySelector(".mkv-fb-path");
      if (old) old.remove();

      const svgEl = mk("svg", {
        class:    "mkv-fb-path",
        viewBox:  "0 0 " + hostRect.width + " " + hostRect.height,
        width:    hostRect.width,
        height:   hostRect.height,
        style:    "position:absolute;top:0;left:0;pointer-events:none;overflow:visible",
      });

      for (let i = 0; i < pts.length - 1; i++) {
        const p1    = pts[i];
        const p2    = pts[i + 1];
        const diff  = p2.midi - p1.midi;
        const isH   = diff === 1;
        const col   = isH ? "var(--warn,#ffb700)" : "var(--accent,#5555ff)";
        const label = isH ? "H" : "W";
        const mx    = (p1.x + p2.x) / 2;
        const my    = (p1.y + p2.y) / 2;

        // Connecting line.
        svgEl.appendChild(mk("line", {
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          stroke: col, "stroke-width": "2", "stroke-linecap": "round",
          opacity: "0.75",
        }));

        // Label badge (circle + letter).
        svgEl.appendChild(mk("circle", {
          cx: mx, cy: my, r: 9,
          fill: col, opacity: "0.92",
        }));
        const t = mk("text", {
          x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "central",
          fill: "#fff", "font-size": "10", "font-weight": "bold",
        });
        t.textContent = label;
        svgEl.appendChild(t);
      }

      this._fbHost.appendChild(svgEl);
    }

    _drawOverlay() {
      const KBc  = global.MtheoryKeyboard;
      const degs = this._degs;

      const kbHost = this._overlayHost.previousElementSibling;
      const kbEl   = kbHost.querySelector(".mk-keyboard") || kbHost;
      const kbRect = kbEl.getBoundingClientRect();
      if (!kbRect.width) return;

      const SVGNS = "http://www.w3.org/2000/svg";
      function mk(tag, a) {
        const e = document.createElementNS(SVGNS, tag);
        if (a) for (const k in a) e.setAttribute(k, a[k]);
        return e;
      }

      const svgW = kbRect.width;

      // X centres of each scale note's key, relative to keyboard left edge.
      const xs = degs.map(d => {
        const keyEl = kbEl.querySelector('[data-midi="' + d.midi + '"]');
        if (!keyEl) return null;
        const r = keyEl.getBoundingClientRect();
        return r.left + r.width / 2 - kbRect.left;
      });
      if (xs.some(x => x === null)) return;

      // Row Y values (pixels from top of overlay SVG).
      const ROW_DEG_HAT = 12;
      const ROW_DEG     = 24;
      const ROW_NAME    = this.showDegs ? 46 : 22;
      const V_TOP       = ROW_NAME + 7;
      const V_TIP       = V_TOP + 22;
      const V_LABEL     = V_TIP + 14;
      const TCH_TOP     = this.showSteps ? V_LABEL + 14 : ROW_NAME + 22;
      const TCH_LABEL   = TCH_TOP + 18;

      const showTch = this.showTch && degs.length >= 8;
      const svgH = showTch ? TCH_LABEL + 12
                 : this.showSteps ? V_LABEL + 10
                 : ROW_NAME + 14;

      const el = mk("svg", {
        class: "mkv-svg",
        viewBox: "0 0 " + svgW + " " + svgH,
        width: svgW, height: svgH,
        style: "display:block;overflow:visible",
      });

      // Degree numbers.
      if (this.showDegs) {
        degs.forEach((d, i) => {
          const hat = mk("text", {
            class: "mkv-degree-hat", x: xs[i], y: ROW_DEG_HAT, "text-anchor": "middle",
          });
          hat.textContent = "^";
          el.appendChild(hat);
          const num = mk("text", {
            class: "mkv-degree", x: xs[i], y: ROW_DEG, "text-anchor": "middle",
          });
          num.textContent = String(i + 1);
          el.appendChild(num);
        });
      }

      // Letter names (coloured, with ♯/♭).
      if (this.showNames) {
        degs.forEach((d, i) => {
          const style = KBc.noteStyle(d.name);
          const dispName = d.name.replace(/#/g, "♯").replace(/b(?=[^a-z]|$)/g, "♭");
          const t = mk("text", {
            class: "mkv-name", x: xs[i], y: ROW_NAME,
            "text-anchor": "middle",
            fill: style ? style.color : "var(--text)",
          });
          t.textContent = dispName;
          el.appendChild(t);
        });
      }

      // V-brackets between consecutive notes.
      if (this.showSteps) {
        for (let i = 0; i < degs.length - 1; i++) {
          const diff = degs[i + 1].midi - degs[i].midi;
          const isHalf = diff === 1;
          const col = isHalf ? "var(--warn,#ffb700)" : "var(--muted,#7777aa)";
          const x1 = xs[i], x2 = xs[i + 1], xM = (x1 + x2) / 2;

          el.appendChild(mk("line", { x1, y1: V_TOP, x2: xM, y2: V_TIP,
            stroke: col, "stroke-width": "1.5", "stroke-linecap": "round" }));
          el.appendChild(mk("line", { x1: x2, y1: V_TOP, x2: xM, y2: V_TIP,
            stroke: col, "stroke-width": "1.5", "stroke-linecap": "round" }));
          el.appendChild(mk("line", { x1: xM, y1: V_TIP, x2: xM, y2: V_LABEL - 4,
            stroke: col, "stroke-width": "1.5" }));

          const t = mk("text", {
            class: "mkv-step-label", x: xM, y: V_LABEL + 3,
            "text-anchor": "middle", fill: col,
          });
          t.textContent = isHalf ? "H" : "W";
          el.appendChild(t);
        }
      }

      // Tetrachord square-U brackets.
      if (showTch) {
        [[0, 3, "Tetrachord 1"], [4, 7, "Tetrachord 2"]].forEach(([from, to, label]) => {
          const x1 = xs[from] - 12;
          const x2 = xs[to]   + 12;
          const xM = (x1 + x2) / 2;
          const TICK = 7;
          const col = "var(--accent,#5555ff)";
          // horizontal bar.
          el.appendChild(mk("line", { x1, y1: TCH_TOP, x2, y2: TCH_TOP,
            stroke: col, "stroke-width": "1.5" }));
          // left tick down.
          el.appendChild(mk("line", { x1, y1: TCH_TOP, x2: x1, y2: TCH_TOP + TICK,
            stroke: col, "stroke-width": "1.5" }));
          // right tick down.
          el.appendChild(mk("line", { x1: x2, y1: TCH_TOP, x2, y2: TCH_TOP + TICK,
            stroke: col, "stroke-width": "1.5" }));
          const t = mk("text", {
            class: "mkv-tetch-label", x: xM, y: TCH_LABEL,
            "text-anchor": "middle", fill: col,
          });
          t.textContent = label;
          el.appendChild(t);
        });
      }

      this._overlayHost.innerHTML = "";
      this._overlayHost.appendChild(el);
    }

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
