/* chromacircle.js — Chromatic circle widget for the Mtheory Content Engine
 *
 * Renders all 12 pitch classes as coloured nodes arranged clockwise in a
 * circle (C at the top, like a clock face). Supports:
 *   • interactive: click a node to play + emit note_played
 *   • highlight: ring one or more notes
 *   • step arc: draw a curved arrow from one note showing a half or whole step
 *
 * Props (from the Content Engine DSL):
 *   interactive  {bool}         default true
 *   audio        {bool|fn}
 *   highlight    {string|arr}   notes to ring with white halo
 *   step         {object}       { from: "C", type: "half"|"whole"|"1.5" }
 *                               draws a step arc + labels the two endpoints
 *   labels       {string}       "names" (default) | "none"
 *   onEvent, emitDom
 *
 * Emits: mtheory:note_played  (same §1d contract as Keyboard/Staff)
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  // Flat-preferred chromatic names in PC order.
  const CHROM = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  // Base MIDI for each PC in octave 4.
  const PC_MIDI4 = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // Polar -> cartesian (angle in degrees, 0 = top = 12 o'clock, CW).
  function polar(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  // Name (e.g. "C", "F#", "Gb") -> pitch class 0-11.
  function pcOf(name) {
    const k = KB();
    if (!k) return -1;
    const midi = k.midiOfSci(name + "4") || k.midiOfSci(name + "3");
    return midi != null ? k.pitchClassOf(midi) : -1;
  }

  class ChromaCircle {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("ChromaCircle: container not found");

      this.interactive = opts.interactive !== false;
      this.showLabels  = (opts.labels || "names") !== "none";
      this.emitDom     = opts.emitDom !== false;
      this.onEvent     = typeof opts.onEvent === "function" ? opts.onEvent : null;
      // Accept single `step` object OR `steps` array.
      this.steps = opts.steps
        ? (Array.isArray(opts.steps) ? opts.steps : [opts.steps])
        : (opts.step ? [opts.step] : []);

      if (opts.audio === false) this._play = () => {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (KB() && KB().pluck) || (() => {});

      this._highlightPCs = this._toPC(opts.highlight);
      this._nodeEls = new Map(); // pc -> <g>
      this.render();
    }

    _toPC(spec) {
      const set = new Set();
      if (!spec) return set;
      const list = Array.isArray(spec) ? spec : [spec];
      list.forEach((n) => {
        const pc = pcOf(String(n));
        if (pc >= 0) set.add(pc);
      });
      return set;
    }

    render() {
      this.root.classList.add("mcc-wrap");
      this.root.innerHTML = "";
      this._nodeEls.clear();

      const SIZE = 300; // Increased from 260 to prevent text cutoff
      const CX = SIZE / 2, CY = SIZE / 2;
      const RING_R = 82;   // centre of node ring
      const NODE_R = 15;   // node radius
      const LABEL_R = RING_R + NODE_R + 10; // label ring

      const el = svg("svg", {
        class: "mcc-svg",
        viewBox: "0 0 " + SIZE + " " + SIZE,
        width: "100%",
        preserveAspectRatio: "xMidYMid meet",
      });
      this._svg = el;

      // Optional step arcs (drawn behind nodes).
        this.steps.forEach(step => this._renderStepArc(el, CX, CY, RING_R, NODE_R, step));
        
      // 12 nodes.
      for (let pc = 0; pc < 12; pc++) {
        const angle = pc * 30; // 0 = C at top
        const pos = polar(CX, CY, RING_R, angle);
        const name = CHROM[pc];
        const k = KB();
        const style = k ? k.noteStyle(name) : null;
        const isHi = this._highlightPCs.has(pc);

        const g = svg("g", { class: "mcc-node", "data-pc": String(pc) });

        // Node shape (circle or square per the color standard).
        let nodeEl;
        if (style && style.shape === "square") {
          const hw = NODE_R * 0.82;
          nodeEl = svg("rect", {
            class: "mcc-shape",
            x: pos.x - hw, y: pos.y - hw,
            width: hw * 2, height: hw * 2,
            rx: "3",
          });
        } else {
          nodeEl = svg("circle", {
            class: "mcc-shape",
            cx: pos.x, cy: pos.y, r: NODE_R,
          });
        }
        if (style) {
          nodeEl.setAttribute("fill", style.color);
          nodeEl.setAttribute("stroke", style.color);
        }
        if (isHi) {
          nodeEl.setAttribute("stroke", "#fff");
          nodeEl.setAttribute("stroke-width", "2.5");
        }
        g.appendChild(nodeEl);

        // Note name label on the node.
        if (this.showLabels) {
          const t = svg("text", {
            class: "mcc-label",
            x: pos.x, y: pos.y + 1,
            "text-anchor": "middle", "dominant-baseline": "central",
          });
          t.textContent = name;
          if (style) t.setAttribute("fill", KB().readableText(style.color));
          g.appendChild(t);
        }

        if (this.interactive) {
          // Invisible hit area covering the full node.
          const hit = svg("circle", {
            class: "mcc-hit", cx: pos.x, cy: pos.y, r: NODE_R + 4,
            fill: "transparent",
          });
          g.appendChild(hit);
          g.classList.add("mcc-node--play");
          g.addEventListener("pointerdown", (ev) => {
            ev.preventDefault();
            const midi = PC_MIDI4[pc];
            this._play(midi, KB().freqOf(midi));
            g.classList.add("mcc-node--active");
            setTimeout(() => g.classList.remove("mcc-node--active"), 160);
            this._emit("note_played", KB().notePayload(midi));
          });
        }

        el.appendChild(g);
        this._nodeEls.set(pc, g);
      }

      this.root.appendChild(el);
    }

    _renderStepArc(parent, cx, cy, ringR, nodeR, step) {
      const { from, type } = step;
      const fromPC = pcOf(String(from));
      if (fromPC < 0) return;

      const steps = type === "half" ? 1 : type === "whole" ? 2 : type === 1.5 ? 3 : 2;
      const toPC = (fromPC + steps) % 12;

      const aFrom = fromPC * 30;
      const aTo   = toPC   * 30;
      const aMid  = aFrom + steps * 15; // midpoint angle between the two nodes

      // Define the radius for the concentric arc outside the nodes
      const ARC_R = ringR + nodeR + 16; 

      // Pad the start and end angles slightly so the arc floats cleanly between the axes
      const anglePadding = 4; // degrees
      const startRad = (aFrom + anglePadding - 90) * Math.PI / 180;
      const endRad   = (aTo - anglePadding - 90) * Math.PI / 180;

      const startX = cx + ARC_R * Math.cos(startRad);
      const startY = cy + ARC_R * Math.sin(startRad);
      
      const endX = cx + ARC_R * Math.cos(endRad);
      const endY = cy + ARC_R * Math.sin(endRad);

      // SVG Arc Command (A rx ry x-axis-rotation large-arc-flag sweep-flag x y)
      // sweep-flag is 1 to draw clockwise
      const d = `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${ARC_R} ${ARC_R} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;

      // Arrow marker definition — insert defs only once per SVG.
      if (!parent.querySelector("defs #mcc-arrow")) {
        const defs = svg("defs", {});
        const marker = svg("marker", {
          id: "mcc-arrow", markerWidth: "7", markerHeight: "7",
          refX: "5.5", refY: "3.5", orient: "auto",
        });
        const arrowPoly = svg("polygon", {
          points: "0 0, 7 3.5, 0 7",
          class: "mcc-arrow-head",
        });
        marker.appendChild(arrowPoly);
        defs.appendChild(marker);
        parent.insertBefore(defs, parent.firstChild);
      }

      parent.appendChild(svg("path", {
        class: "mcc-arc",
        d: d,
        fill: "none",
        "marker-end": "url(#mcc-arrow)",
      }));

      // Label: placed radially outside the arc exactly at the midpoint
      // Label: placed radially outside the arc exactly at the midpoint
      const labelR = ARC_R + 14;
      const pLabel = polar(cx, cy, labelR, aMid);
      const label = type === "half" ? "½ step" : "1 step";
      
      // Calculate tangent rotation so the text sits against the arc
      let textRot = aMid;
      // Normalize angle to 0-360 just in case
      textRot = ((textRot % 360) + 360) % 360; 
      
      // Prevent upside-down text on the bottom half of the circle
      if (textRot > 90 && textRot < 270) {
        textRot -= 180;
      }

      const t = svg("text", {
        class: "mcc-arc-label",
        x: pLabel.x.toFixed(2), y: pLabel.y.toFixed(2),
        "text-anchor": "middle", "dominant-baseline": "central",
        // Rotate the text around its own center coordinates
        transform: `rotate(${textRot.toFixed(1)}, ${pLabel.x.toFixed(2)}, ${pLabel.y.toFixed(2)})`
      });
      t.textContent = label;
      parent.appendChild(t);
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "chromacircle", payload: payload };
      try { console.log("[ChromaCircle]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
    }

    // --- Public API -------------------------------------------------------
    setHighlight(spec) {
      this._highlightPCs = this._toPC(spec);
      this._nodeEls.forEach((g, pc) => {
        const shape = g.querySelector(".mcc-shape");
        if (!shape) return;
        const isHi = this._highlightPCs.has(pc);
        const name = CHROM[pc];
        const style = KB() ? KB().noteStyle(name) : null;
        if (isHi) {
          shape.setAttribute("stroke", "#fff");
          shape.setAttribute("stroke-width", "2.5");
        } else if (style) {
          shape.setAttribute("stroke", style.color);
          shape.removeAttribute("stroke-width");
        }
      });
    }

    setHighlightMidi(midiSet) {
      const k = KB();
      if (!k) return;
      const pcSet = new Set();
      midiSet.forEach(m => pcSet.add(k.pitchClassOf(m)));
      this.setHighlight(Array.from(pcSet).map(pc => CHROM[pc]));
    }

    triggerNote(midi) {
      const k = KB();
      if (!k) return;
      const pc = k.pitchClassOf(midi);
      const g = this._nodeEls.get(pc);
      if (!g) return;
      this._play(midi, k.freqOf(midi));
      g.classList.add("mcc-node--active");
      setTimeout(() => g.classList.remove("mcc-node--active"), 160);
      this._emit("note_played", k.notePayload(midi));
    }

    destroy() {
      this.root.innerHTML = "";
      this._nodeEls.clear();
    }
  }

  global.MtheoryChromaCircle = ChromaCircle;
})(window);
