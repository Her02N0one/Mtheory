/* fifthscircle.js — Circle of Fifths widget for the Mtheory Content Engine
 *
 * 12 major keys on the outer ring (C at 12 o'clock, sharps clockwise).
 * When showMinor:true, a second inner ring shows the 12 relative minor keys.
 * Clicking either ring selects that key and highlights its relative on the
 * other ring; the info panel shows the shared key signature.
 *
 * Props:
 *   interactive  {bool}  default true
 *   showMinor    {bool}  show relative minor inner ring  default false
 *   audio        {bool}
 *   onEvent, emitDom
 *
 * Exports: window.MtheoryFifthsCircle
 * Depends on: keyboard.js → window.MtheoryKeyboard
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // 0° = 12 o'clock, clockwise.
  function polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  // === § CIRCLE DATA ==========================================================
  // minor: relative minor tonic (lowercase, Unicode ♯/♭ for display).
  // Relative minor = major root + perfect 6th (9 semitones).

  const FIFTHS = [
    { name: "C",  minor: "a",   sharps: 0,    flats: 0,    angle:   0 },
    { name: "G",  minor: "e",   sharps: 1,    flats: null, angle:  30 },
    { name: "D",  minor: "b",   sharps: 2,    flats: null, angle:  60 },
    { name: "A",  minor: "f♯",  sharps: 3,    flats: null, angle:  90 },
    { name: "E",  minor: "c♯",  sharps: 4,    flats: null, angle: 120 },
    { name: "B",  minor: "g♯",  sharps: 5,    flats: null, angle: 150, enh: "Cb",  enhMinor: "a♭", enhFlats: 7 },
    { name: "F#", minor: "d♯",  sharps: 6,    flats: null, angle: 180, enh: "Gb",  enhMinor: "e♭", enhFlats: 6 },
    { name: "C#", minor: "a♯",  sharps: 7,    flats: null, angle: 210, enh: "Db",  enhMinor: "b♭", enhFlats: 5 },
    { name: "Ab", minor: "f",   sharps: null, flats: 4,    angle: 240 },
    { name: "Eb", minor: "c",   sharps: null, flats: 3,    angle: 270 },
    { name: "Bb", minor: "g",   sharps: null, flats: 2,    angle: 300 },
    { name: "F",  minor: "d",   sharps: null, flats: 1,    angle: 330 },
  ];

  const SHARP_LIST = ["F#", "C#", "G#", "D#", "A#", "E#", "B#"];
  const FLAT_LIST  = ["Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Fb"];

  function accList(type, count) {
    return (type === "sharps" ? SHARP_LIST : FLAT_LIST).slice(0, count).join(", ");
  }

  const NAME_PC = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
    F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
  };

  // Pitch class → canonical note name for keyboard.noteStyle() lookups.
  const PC_NOTE = ["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

  // === § CLASS ================================================================

  class FifthsCircle {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("FifthsCircle: container not found");

      this.interactive = opts.interactive !== false;
      this.showMinor   = !!opts.showMinor;
      this.emitDom     = opts.emitDom !== false;
      this.onEvent     = typeof opts.onEvent === "function" ? opts.onEvent : null;

      if (opts.audio === false) this._play = () => {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (KB() && KB().pluck) || (() => {});

      this._active      = -1;
      this._activeMinor = -1;
      this._nodeEls     = new Map();
      this._innerEls    = new Map();
      this._render();
    }

    _render() {
      this.root.classList.add("mfc-wrap");
      this.root.innerHTML = "";
      this._nodeEls.clear();
      this._innerEls.clear();

      const SIZE     = 310;
      const CX       = SIZE / 2;
      const CY       = SIZE / 2 + 5;
      const RING_R   = 108;
      const NODE_R   = 21;
      const INNER_R  = 64;
      const INNER_NR = 14;

      const s = svg("svg", {
        class: "mfc-svg",
        viewBox: `0 0 ${SIZE} ${SIZE}`,
        width: "100%",
        preserveAspectRatio: "xMidYMid meet",
      });

      // Separator ring between major and minor rings (only when showMinor).
      if (this.showMinor) {
        s.appendChild(svg("circle", {
          class: "mfc-sep-ring",
          cx: CX, cy: CY,
          r: Math.round((RING_R + INNER_R) / 2),
        }));
      }

      // — Region labels —
      const sharpLbl = svg("text", {
        class: "mfc-region mfc-region--sharp",
        x: CX + RING_R + NODE_R + 12, y: CY,
        "text-anchor": "start", "dominant-baseline": "central",
      });
      sharpLbl.textContent = "♯ Sharps";
      s.appendChild(sharpLbl);

      const flatLbl = svg("text", {
        class: "mfc-region mfc-region--flat",
        x: CX - RING_R - NODE_R - 12, y: CY,
        "text-anchor": "end", "dominant-baseline": "central",
      });
      flatLbl.textContent = "Flats ♭";
      s.appendChild(flatLbl);

      // — Outer (major) ring —
      FIFTHS.forEach((entry, i) => {
        const pos    = polar(CX, CY, RING_R, entry.angle);
        const k      = KB();
        const style  = k ? k.noteStyle(entry.name) : null;
        const hasEnh = !!entry.enh;

        const g = svg("g", { class: "mfc-node", "data-idx": String(i) });

        if (entry.angle === 0)       g.classList.add("mfc-node--neutral");
        else if (entry.angle <= 120) g.classList.add("mfc-node--sharp");
        else if (entry.angle <= 210) g.classList.add("mfc-node--enharmonic");
        else                         g.classList.add("mfc-node--flat");

        const circle = svg("circle", { class: "mfc-shape", cx: pos.x, cy: pos.y, r: NODE_R });
        if (style) { circle.setAttribute("fill", style.color); circle.setAttribute("stroke", style.color); }
        g.appendChild(circle);

        const primaryY = hasEnh ? pos.y - 5 : pos.y + 1;
        const lbl = svg("text", {
          class: "mfc-lbl",
          x: pos.x, y: primaryY,
          "text-anchor": "middle", "dominant-baseline": "central",
          "font-size": entry.name.length > 2 ? "9" : "10",
        });
        lbl.textContent = entry.name;
        if (style && k) lbl.setAttribute("fill", k.readableText(style.color));
        g.appendChild(lbl);

        if (hasEnh) {
          const lbl2 = svg("text", {
            class: "mfc-lbl mfc-lbl--enh",
            x: pos.x, y: pos.y + 7,
            "text-anchor": "middle", "dominant-baseline": "central",
            "font-size": "8",
          });
          lbl2.textContent = entry.enh;
          if (style && k) lbl2.setAttribute("fill", k.readableText(style.color));
          g.appendChild(lbl2);
        }

        if (this.interactive) {
          const hit = svg("circle", {
            class: "mfc-hit", cx: pos.x, cy: pos.y, r: NODE_R + 5, fill: "transparent",
          });
          g.appendChild(hit);
          g.classList.add("mfc-node--play");
          g.addEventListener("pointerdown", ev => { ev.preventDefault(); this._select(i); });
        }

        s.appendChild(g);
        this._nodeEls.set(i, g);
      });

      // — Inner (minor) ring —
      if (this.showMinor) {
        FIFTHS.forEach((entry, i) => {
          const pos    = polar(CX, CY, INNER_R, entry.angle);
          const k      = KB();
          const mpc    = (NAME_PC[entry.name] + 9) % 12;
          const style  = k ? k.noteStyle(PC_NOTE[mpc]) : null;
          const hasEnh = !!entry.minorEnh;

          const g = svg("g", { class: "mfc-node mfc-node--minor", "data-idx": String(i) });

          const circle = svg("circle", {
            class: "mfc-shape mfc-shape--minor", cx: pos.x, cy: pos.y, r: INNER_NR,
          });
          if (style) { circle.setAttribute("fill", style.color); circle.setAttribute("stroke", style.color); }
          g.appendChild(circle);

          const primaryY = hasEnh ? pos.y - 4 : pos.y + 1;
          const lbl = svg("text", {
            class: "mfc-lbl mfc-lbl--minor",
            x: pos.x, y: primaryY,
            "text-anchor": "middle", "dominant-baseline": "central",
            "font-size": entry.minor.length > 2 ? "7.5" : "8.5",
          });
          lbl.textContent = entry.minor;
          if (style && k) lbl.setAttribute("fill", k.readableText(style.color));
          g.appendChild(lbl);

          if (hasEnh) {
            const lbl2 = svg("text", {
              class: "mfc-lbl mfc-lbl--minor mfc-lbl--enh",
              x: pos.x, y: pos.y + 5,
              "text-anchor": "middle", "dominant-baseline": "central",
              "font-size": "6.5",
            });
            lbl2.textContent = entry.minorEnh;
            if (style && k) lbl2.setAttribute("fill", k.readableText(style.color));
            g.appendChild(lbl2);
          }

          if (this.interactive) {
            const hit = svg("circle", {
              class: "mfc-hit", cx: pos.x, cy: pos.y, r: INNER_NR + 5, fill: "transparent",
            });
            g.appendChild(hit);
            g.classList.add("mfc-node--play");
            g.addEventListener("pointerdown", ev => { ev.preventDefault(); this._selectMinor(i); });
          }

          s.appendChild(g);
          this._innerEls.set(i, g);
        });
      }

      this.root.appendChild(s);

      // Legend (only when showMinor)
      if (this.showMinor) {
        const legend = document.createElement("div");
        legend.className = "mfc-legend";
        legend.innerHTML = "Outer ring: <strong>Major keys</strong>&ensp;·&ensp;Inner ring: <em>minor keys</em>";
        this.root.appendChild(legend);
      }

      // Info panel
      const info = document.createElement("div");
      info.className = "mfc-info";
      this._infoEl = info;
      this.root.appendChild(info);
      this._showInfo(-1, false);
    }

    _clearActive() {
      if (this._active >= 0) {
        const g = this._nodeEls.get(this._active);
        if (g) g.classList.remove("mfc-node--active", "mfc-node--related");
      }
      if (this._activeMinor >= 0) {
        const g = this._innerEls.get(this._activeMinor);
        if (g) g.classList.remove("mfc-node--active", "mfc-node--related");
      }
      this._active = -1;
      this._activeMinor = -1;
    }

    _select(idx) {
      this._clearActive();
      this._active = this._activeMinor = idx;

      const outer = this._nodeEls.get(idx);
      if (outer) outer.classList.add("mfc-node--active");

      if (this.showMinor) {
        const inner = this._innerEls.get(idx);
        if (inner) inner.classList.add("mfc-node--related");
      }

      const entry = FIFTHS[idx];
      const k = KB();
      if (k) {
        const midi = 60 + (NAME_PC[entry.name] ?? 0);
        this._play(midi, k.freqOf(midi));
        this._emit("note_played", k.notePayload(midi));
      }
      this._showInfo(idx, false);
    }

    _selectMinor(idx) {
      this._clearActive();
      this._active = this._activeMinor = idx;

      const outer = this._nodeEls.get(idx);
      if (outer) outer.classList.add("mfc-node--related");

      const inner = this._innerEls.get(idx);
      if (inner) inner.classList.add("mfc-node--active");

      const entry = FIFTHS[idx];
      const k = KB();
      if (k) {
        const midi = 60 + (NAME_PC[entry.name] + 9) % 12;
        this._play(midi, k.freqOf(midi));
        this._emit("note_played", k.notePayload(midi));
      }
      this._showInfo(idx, true);
    }

    _showInfo(idx, isMinor) {
      if (idx < 0) {
        const hint = this.showMinor
          ? "Click a major (outer) or minor (inner) key to see its signature and relative"
          : "Click any key to explore its accidentals";
        this._infoEl.innerHTML = `<span class="mfc-hint">${hint}</span>`;
        return;
      }
      const e = FIFTHS[idx];

      let accStr;
      if (e.sharps === 0 && e.flats === 0) {
        accStr = "no sharps or flats";
      } else if (e.sharps != null) {
        accStr = `${e.sharps} sharp${e.sharps > 1 ? "s" : ""}: ${accList("sharps", e.sharps)}`;
      } else {
        accStr = `${e.flats} flat${e.flats > 1 ? "s" : ""}: ${accList("flats", e.flats)}`;
      }

      let html;
      if (!isMinor) {
        html  = `<strong class="mfc-info-name">${e.name} major</strong>`;
        html += `<span class="mfc-info-acc"> — ${accStr}</span>`;
        if (this.showMinor) {
          html += `<br><span class="mfc-info-rel">Relative minor: <em>${e.minor} minor</em></span>`;
        }
        if (e.enh) {
          html += `<br><span class="mfc-info-enh">= ${e.enh} major — ${e.enhFlats} flats: ${accList("flats", e.enhFlats)}</span>`;
          if (this.showMinor) {
            html += `<span class="mfc-info-enh"> / ${e.minorEnh} minor</span>`;
          }
        }
      } else {
        html  = `<strong class="mfc-info-name">${e.minor} minor</strong>`;
        html += `<span class="mfc-info-acc"> — ${accStr}</span>`;
        html += `<br><span class="mfc-info-rel">Relative major: <em>${e.name} major</em></span>`;
        if (e.enh && e.minorEnh) {
          html += `<br><span class="mfc-info-enh">= ${e.minorEnh} minor (enharmonic) / ${e.enh} major</span>`;
        }
      }

      this._infoEl.innerHTML = html;
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "fifthscircle", payload };
      try { console.log("[FifthsCircle]", JSON.stringify(evt)); } catch (_) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
    }

    destroy() {
      this.root.innerHTML = "";
      this._nodeEls.clear();
      this._innerEls.clear();
    }
  }

  global.MtheoryFifthsCircle = FifthsCircle;
})(window);
