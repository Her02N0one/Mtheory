/* stepview.js — Isolated interval widget for the Mtheory Content Engine
 *
 * Orchestrates the Keyboard, Fretboard, and ChromaCircle to show isolated
 * whole/half steps without assuming a contiguous scale path.
 *
 * Props:
 * steps       {array}   e.g. [{from: "E4", type: "half"}, {from: "C4", type: "whole"}]
 * circleSize  {string}  CSS width for the chromatic circle (default "160px")
 * instruments {array}   ["keyboard", "chromacircle", "fretboard"] (default: all 3)
 * low, high   {string}  Keyboard bounds (e.g., "C4", "C5")
 * frets       {number}  Fretboard length (default 7)
 * interactive {bool}
 *
 * Depends on: keyboard.js, fretboard.js, chromacircle.js, scale-helpers.js
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }
  function FB() { return global.MtheoryFretboard; }
  function CC() { return global.MtheoryChromaCircle; }
  
  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function parseProp(val, def) {
    if (val == null) return def;
    if (typeof val !== "string") return val;
    try { return JSON.parse(val); } catch(e) {}
    try { return JSON.parse(val.replace(/'/g, '"')); } catch(e) {}
    try { return new Function("return " + val)(); } catch(e) {}
    return def;
  }

  class StepView {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string" ? document.querySelector(container) : container;
      this.root.classList.add("mkv-wrap", "stepview-wrap");
      this.root.innerHTML = "";

      let parsedSteps = parseProp(opts.steps || opts.step, []);
      this.steps = Array.isArray(parsedSteps) ? parsedSteps : (parsedSteps ? [parsedSteps] : []);

      let parsedInsts = parseProp(opts.instruments, ["keyboard", "chromacircle", "fretboard"]);
      if (typeof parsedInsts === "string") {
        parsedInsts = parsedInsts.split(/[, ]+/).map(s => s.replace(/[^a-z]/gi, '').toLowerCase());
      }
      this.instruments = Array.isArray(parsedInsts) ? parsedInsts : ["keyboard", "chromacircle", "fretboard"];

      this.interactive = opts.interactive !== false;
      this.kbLow = opts.low || "C4";
      this.kbHigh = opts.high || "C5";
      this.frets = opts.frets != null ? parseInt(opts.frets, 10) : 7;
      this.circleSize = opts.circleSize || "200px";

      this.highlightSci = [];
      this.steps.forEach(step => {
        if (!step || !step.from) return;
        const searchFrom = /\d/.test(step.from) ? step.from : step.from + "4";
        const fromMidi = KB() ? KB().midiOfSci(searchFrom) : null;
        if (fromMidi == null) return;
        
        const semitones = step.type === "half" ? 1 : step.type === "whole" ? 2 : 0;
        this.highlightSci.push(step.from);
        
        const toMidi = fromMidi + semitones;
        const toSci = KB().sciOf(toMidi);
        this.highlightSci.push(/\d/.test(step.from) ? toSci : KB().nameOf(toMidi));
      });

      this._buildLayout();
    }

    _buildLayout() {
      const hasInst = (name) => this.instruments.some(i => i && i.includes(name));
      const hasCc = hasInst("chromacircle") && CC();
      const hasKb = hasInst("keyboard") && KB();
      const hasFb = hasInst("fretboard") && FB();

      if (hasCc || hasKb) {
        const topRow = document.createElement("div");
        topRow.style.display = "flex";
        topRow.style.flexDirection = "row";
        topRow.style.alignItems = "center";
        topRow.style.justifyContent = "center";
        topRow.style.gap = "32px";
        topRow.style.marginBottom = hasFb ? "24px" : "0";
        this.root.appendChild(topRow);

        if (hasCc) {
          this._ccWrap = document.createElement("div");
          this._ccWrap.className = "mkv-cc";
          this._ccWrap.style.width = this.circleSize;
          this._ccWrap.style.flexShrink = "0";
          topRow.appendChild(this._ccWrap);

          this._cc = new (CC())(this._ccWrap, {
            steps: this.steps,
            highlight: this.highlightSci,
            interactive: this.interactive
          });
        }

        if (hasKb) {
          this._kbWrap = document.createElement("div");
          this._kbWrap.className = "mkv-kb";
          this._kbWrap.style.position = "relative";
          this._kbWrap.style.flexGrow = "1";
          topRow.appendChild(this._kbWrap);

          this._kb = new (KB())(this._kbWrap, {
            low: this.kbLow,
            high: this.kbHigh,
            highlight: this.highlightSci,
            labels: "naturals",
            interactive: this.interactive
          });

          this._drawKbOverlay();
        }
      }

      if (hasFb) {
        this._fbWrap = document.createElement("div");
        this._fbWrap.className = "mkv-fb";
        this._fbWrap.style.position = "relative";
        this.root.appendChild(this._fbWrap);

        this._fb = new (FB())(this._fbWrap, {
          frets: this.frets,
          highlight: this.highlightSci,
          labels: "marks",
          interactive: this.interactive
        });

        this._drawFbOverlay();
      }
    }

    _drawKbOverlay(attempts = 0) {
      if (!this._kb || !this.steps.length) return;
      const kbEl = this._kbWrap.querySelector(".mk-keyboard");
      if (!kbEl) return;
      
      const rect = kbEl.getBoundingClientRect();
      if (!rect.width) {
        if (attempts < 10) setTimeout(() => this._drawKbOverlay(attempts + 1), 50);
        return;
      }

      const overlay = svg("svg", {
        viewBox: `0 0 ${rect.width} 40`,
        width: rect.width,
        height: 40,
        style: "position:absolute; bottom:-40px; left:0; pointer-events:none; overflow:visible;"
      });

      this.steps.forEach(step => {
        if (!step || !step.from) return;
        const searchFrom = /\d/.test(step.from) ? step.from : step.from + "4";
        const fromMidi = KB().midiOfSci(searchFrom);
        if (fromMidi == null) return;
        const toMidi = fromMidi + (step.type === "half" ? 1 : 2);

        const elA = kbEl.querySelector(`[data-midi="${fromMidi}"]`);
        const elB = kbEl.querySelector(`[data-midi="${toMidi}"]`);
        if (!elA || !elB) return;

        const rA = elA.getBoundingClientRect();
        const rB = elB.getBoundingClientRect();

        const x1 = rA.left + rA.width / 2 - rect.left;
        const x2 = rB.left + rB.width / 2 - rect.left;
        const midX = (x1 + x2) / 2;
        const color = step.type === "half" ? "var(--warn,#ffb700)" : "var(--accent,#5555ff)";

        overlay.appendChild(svg("line", { x1: x1, y1: 0, x2: midX, y2: 15, stroke: color, "stroke-width": "1.5" }));
        overlay.appendChild(svg("line", { x1: x2, y1: 0, x2: midX, y2: 15, stroke: color, "stroke-width": "1.5" }));
        overlay.appendChild(svg("line", { x1: midX, y1: 15, x2: midX, y2: 25, stroke: color, "stroke-width": "1.5" }));

        const label = svg("text", { x: midX, y: 35, "text-anchor": "middle", fill: color, "font-size": "12px" });
        label.textContent = step.type === "half" ? "½" : "1";
        overlay.appendChild(label);
      });

      this._kbWrap.appendChild(overlay);
    }

    _drawFbOverlay(attempts = 0) {
      if (!this._fb || !this.steps.length) return;
      const fbRoot = this._fb.root;
      const hostRect = this._fbWrap.getBoundingClientRect();
      
      if (!hostRect.width) {
        if (attempts < 10) setTimeout(() => this._drawFbOverlay(attempts + 1), 50);
        return;
      }

      const overlay = svg("svg", {
        viewBox: `0 0 ${hostRect.width} ${hostRect.height}`,
        width: hostRect.width,
        height: hostRect.height,
        style: "position:absolute; top:0; left:0; pointer-events:none; overflow:visible;"
      });

      const activeCells = Array.from(fbRoot.querySelectorAll(".mf-cell")).filter(c => c.querySelector(".mf-dot"));
      
      const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; 
      const getFret = (cell) => {
        if (cell.dataset.fret != null) return parseInt(cell.dataset.fret, 10);
        const str = parseInt(cell.dataset.string, 10);
        const midi = parseInt(cell.dataset.midi, 10);
        return midi - OPEN_MIDI[str];
      };

      this.steps.forEach(step => {
        if (!step || !step.from) return;
        const fromPc = KB().pitchClassOf(KB().midiOfSci(step.from + "4"));
        const semitones = step.type === "half" ? 1 : step.type === "whole" ? 2 : 0;
        if (semitones === 0) return;
        
        const baseColor = step.type === "half" ? "var(--warn,#ffb700)" : "var(--accent,#5555ff)";

        activeCells.forEach(cellA => {
          const midiA = parseInt(cellA.dataset.midi, 10);
          if (KB().pitchClassOf(midiA) !== fromPc) return;

          const targetMidi = midiA + semitones;
          const strA = parseInt(cellA.dataset.string, 10);
          const fretA = getFret(cellA);
          
          const validDestinations = activeCells.filter(c => {
            const mB = parseInt(c.dataset.midi, 10);
            const strB = parseInt(c.dataset.string, 10);
            
            if (mB !== targetMidi) return false;
            if (Math.abs(strA - strB) > 1) return false;
            
            const fretB = getFret(c);
            if (Math.abs(fretA - fretB) > 4) return false; 
            
            return true;
          });

          validDestinations.forEach(cellB => {
            const strB = parseInt(cellB.dataset.string, 10);
            const isCrossString = Math.abs(strA - strB) > 0;
            
            // Adjust color for cross-string mechanics
            let arrowColor = baseColor;
            if (isCrossString) {
              if (semitones === 1) arrowColor = "var(--error,#ff3366)"; // Pink/Red for half steps
              if (semitones === 2) arrowColor = "var(--info,#00d2ff)";  // Cyan/Teal for whole steps
            }

            const rA = cellA.getBoundingClientRect();
            const rB = cellB.getBoundingClientRect();
            const x1 = rA.left + rA.width / 2 - hostRect.left;
            const y1 = rA.top + rA.height / 2 - hostRect.top;
            const x2 = rB.left + rB.width / 2 - hostRect.left;
            const y2 = rB.top + rB.height / 2 - hostRect.top;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const angle = Math.atan2(dy, dx);
            const pullBack = 16; 
            
            const startX = x1 + Math.cos(angle) * pullBack;
            const startY = y1 + Math.sin(angle) * pullBack;
            const tipX = x2 - Math.cos(angle) * pullBack;
            const tipY = y2 - Math.sin(angle) * pullBack;

            overlay.appendChild(svg("line", { x1: startX, y1: startY, x2: tipX, y2: tipY, stroke: arrowColor, "stroke-width": "2", opacity: "0.75" }));
            
            const headLen = 10;
            const p1x = tipX - headLen * Math.cos(angle - Math.PI/6);
            const p1y = tipY - headLen * Math.sin(angle - Math.PI/6);
            const p2x = tipX - headLen * Math.cos(angle + Math.PI/6);
            const p2y = tipY - headLen * Math.sin(angle + Math.PI/6);
            overlay.appendChild(svg("polygon", { points: `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`, fill: arrowColor, opacity: "0.85" }));
            
            const midX = (startX + tipX) / 2;
            const midY = (startY + tipY) / 2;
            overlay.appendChild(svg("circle", { cx: midX, cy: midY, r: 9, fill: arrowColor, opacity: "0.92" }));
            const label = svg("text", { x: midX, y: midY, "text-anchor": "middle", "dominant-baseline": "central", fill: "#fff", "font-size": "10", "font-weight": "bold" });
            label.textContent = step.type === "half" ? "½" : "1";
            overlay.appendChild(label);
          });
        });
      });

      this._fbWrap.appendChild(overlay);
    }

    destroy() {
      if (this._kb) this._kb.destroy();
      if (this._fb) this._fb.destroy();
      if (this._cc) this._cc.destroy();
      this.root.innerHTML = "";
    }
  }

  global.MtheoryStepView = StepView;
})(window);