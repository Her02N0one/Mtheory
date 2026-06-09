/* keysigview.js — Key Signature Explorer for the Mtheory Content Engine
 *
 * Interactive widget: students move a slider (0–7) and toggle Sharps / Flats.
 * Accidentals appear on the treble clef staff in standard order; the key-rule
 * accidental is highlighted in the accent colour so the derivation is visible.
 *
 * Sharps order : F C G D A E B   — last sharp, up a ½ step = key name
 * Flats  order : B E A D G C F   — 2nd-to-last flat = key name (1 flat = F, exception)
 *
 * Props:
 *   count  {number}  initial accidental count  (default 0)
 *   type   {string}  "sharps" | "flats"         (default "sharps")
 *
 * Exports: window.MtheoryKeySigView
 */
(function (global) {
  "use strict";

  // === § TREBLE CLEF KEY SIGNATURE POSITIONS ==================================
  // Diatonic index = octave*7 + letterStep  (C=0 D=1 E=2 F=3 G=4 A=5 B=6)
  // E4 = index 30 = bottom staff line.

  const SHARP_LETTERS  = ["F", "C", "G", "D", "A", "E", "B"];
  const SHARP_INDICES  = [38, 35, 39, 36, 33, 37, 34]; // F5 C5 G5 D5 A4 E5 B4
  const FLAT_LETTERS   = ["B", "E", "A", "D", "G", "C", "F"];
  const FLAT_INDICES   = [34, 37, 33, 36, 32, 35, 31]; // B4 E5 A4 D5 G4 C5 F4

  const SHARP_KEYS       = ["C", "G", "D", "A", "E", "B", "F♯", "C♯"];
  const FLAT_KEYS        = ["C", "F", "B♭", "E♭", "A♭", "D♭", "G♭", "C♭"];
  // Relative minors indexed by accidental count (0–7).
  const SHARP_MINOR_KEYS = ["a", "e", "b", "f♯", "c♯", "g♯", "d♯", "a♯"];
  const FLAT_MINOR_KEYS  = ["a", "d", "g", "c",  "f",  "b♭", "e♭", "a♭"];

  // === § GEOMETRY (matches staff.js) ==========================================

  const GAP          = 12;
  const STEP         = GAP / 2;
  const TOP_Y        = 46;
  const BOTTOM_INDEX = 30;
  const BOTTOM_Y     = TOP_Y + 4 * GAP; // 94
  const STAFF_X0     = 8;
  const CLEF_W       = 46;
  const ACC_DX       = 16; // px per accidental slot

  const SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function yForIndex(idx) {
    return BOTTOM_Y - (idx - BOTTOM_INDEX) * STEP;
  }

  // === § CLASS ================================================================

  class KeySigView {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("KeySigView: container not found");

      this.count        = Math.max(0, Math.min(7, opts.count != null ? +opts.count : 0));
      this.type         = opts.type === "flats" ? "flats" : "sharps";
      this.readonly     = opts.readonly     === true;
      this.showHint     = opts.showHint     !== false; // default true; pass false to hide key name/rule
      this.showRelative = opts.showRelative === true;  // also show relative minor key name
      this._typeBtn  = {};
      this._build();
    }

    // Public API for programmatic updates (used by quiz widgets).
    setSignature(count, type) {
      this.count = Math.max(0, Math.min(7, +count || 0));
      if (type === "flats" || type === "sharps") this.type = type;
      this._drawStaff();
      if (this.showHint) this._updateText();
    }

    _build() {
      this.root.classList.add("mksv-wrap");
      this.root.innerHTML = "";

      if (!this.readonly) {
        // — Toggle: Sharps / Flats —
        const toggle = document.createElement("div");
        toggle.className = "mksv-toggle";
        ["sharps", "flats"].forEach(t => {
          const btn = document.createElement("button");
          btn.className = "mksv-btn";
          btn.innerHTML = t === "sharps" ? "&#9839;&nbsp; Sharps" : "&#9837;&nbsp; Flats";
          btn.addEventListener("click", () => { this.type = t; this.count = 0; this._update(); });
          this._typeBtn[t] = btn;
          toggle.appendChild(btn);
        });

        // — Slider row —
        const sliderRow = document.createElement("div");
        sliderRow.className = "mksv-slider-row";

        const slider = document.createElement("input");
        slider.type = "range"; slider.min = "0"; slider.max = "7"; slider.value = "0";
        slider.className = "mksv-slider";
        slider.addEventListener("input", () => { this.count = +slider.value; this._update(); });
        this._slider = slider;

        const countLbl = document.createElement("span");
        countLbl.className = "mksv-count";
        this._countLbl = countLbl;

        sliderRow.appendChild(slider);
        sliderRow.appendChild(countLbl);
        this.root.appendChild(toggle);
        this.root.appendChild(sliderRow);
      }

      // — Staff —
      const staffWrap = document.createElement("div");
      staffWrap.className = "mksv-staff";
      this._staffWrap = staffWrap;
      this.root.appendChild(staffWrap);

      if (this.showHint) {
        // — Key name —
        const keyName = document.createElement("div");
        keyName.className = "mksv-keyname";
        this._keyNameEl = keyName;
        this.root.appendChild(keyName);

        // — Rule text —
        const rule = document.createElement("div");
        rule.className = "mksv-rule";
        this._ruleEl = rule;
        this.root.appendChild(rule);
      }

      this._update();
    }

    // Return the 0-based index of the "rule" accidental (highlight in accent colour).
    _hiIdx() {
      if (this.count === 0) return -1;
      if (this.type === "sharps") return this.count - 1;        // last sharp
      return this.count === 1 ? 0 : this.count - 2;            // 2nd-to-last flat
    }

    _update() {
      if (this._slider)   this._slider.value = String(this.count);
      if (this._countLbl) this._countLbl.textContent = this.count === 0 ? "0" : String(this.count);

      Object.keys(this._typeBtn).forEach(t =>
        this._typeBtn[t].classList.toggle("mksv-btn--active", this.type === t)
      );

      this._drawStaff();
      if (this.showHint) this._updateText();
    }

    _drawStaff() {
      const SLOTS  = 7;
      const width  = STAFF_X0 + CLEF_W + SLOTS * ACC_DX + 24;
      const height = 130;

      const s = svg("svg", {
        class: "mksv-svg",
        viewBox: `0 0 ${width} ${height}`,
        width: "100%",
        preserveAspectRatio: "xMinYMid meet",
      });

      // Five staff lines
      for (let i = 0; i < 5; i++) {
        s.appendChild(svg("line", {
          class: "mksv-line",
          x1: STAFF_X0, y1: TOP_Y + i * GAP,
          x2: width - 6, y2: TOP_Y + i * GAP,
        }));
      }

      // Treble clef glyph
      const clef = svg("text", {
        class: "mksv-clef",
        x: STAFF_X0 + 8,
        y: yForIndex(32) + GAP * 0.78,
        "font-size": GAP * 5,
      });
      clef.textContent = "𝄞"; // 𝄞
      s.appendChild(clef);

      const hiIdx   = this._hiIdx();
      const indices = this.type === "sharps" ? SHARP_INDICES : FLAT_INDICES;
      const glyph   = this.type === "sharps" ? "♯" : "♭"; // ♯ ♭

      for (let i = 0; i < this.count; i++) {
        const x    = STAFF_X0 + CLEF_W + i * ACC_DX + ACC_DX * 0.5;
        const y    = yForIndex(indices[i]);
        const isHi = (i === hiIdx);

        const acc = svg("text", {
          class: "mksv-acc" + (isHi ? " mksv-acc--hi" : ""),
          x: String(x),
          y: String(y + 4),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": "16",
          "font-family": "serif",
        });
        acc.textContent = glyph;
        s.appendChild(acc);

        // Pointer caret below the rule accidental
        if (isHi) {
          const by = BOTTOM_Y + 18;
          s.appendChild(svg("polygon", {
            class: "mksv-caret",
            points: `${x},${by - 1} ${x - 5},${by + 7} ${x + 5},${by + 7}`,
          }));
        }
      }

      this._staffWrap.innerHTML = "";
      this._staffWrap.appendChild(s);
    }

    _updateText() {
      const keys      = this.type === "sharps" ? SHARP_KEYS : FLAT_KEYS;
      const minorKeys = this.type === "sharps" ? SHARP_MINOR_KEYS : FLAT_MINOR_KEYS;
      const name      = keys[this.count];
      const minorName = minorKeys[this.count];

      let nameHtml = `<span class="mksv-key-note">${name}</span>`
        + `<span class="mksv-key-suffix"> major</span>`;
      if (this.showRelative) {
        nameHtml += `<span class="mksv-key-rel">  /  ${minorName} minor</span>`;
      }
      this._keyNameEl.innerHTML = nameHtml;

      let rule = "";
      if (this.count === 0) {
        rule = "No accidentals → C major";
      } else if (this.type === "sharps") {
        const last = SHARP_LETTERS[this.count - 1];
        rule = `Last sharp: ${last}♯ — key is \xBD step higher → ${name} major`;
      } else if (this.count === 1) {
        rule = "1 flat (B♭) → F major  (memorize this one)";
      } else {
        const penult = FLAT_LETTERS[this.count - 2];
        rule = `2nd-to-last flat: ${penult}♭ — that flat’s name is the key → ${name} major`;
      }
      this._ruleEl.textContent = rule;
    }

    destroy() { this.root.innerHTML = ""; }
  }

  global.MtheoryKeySigView = KeySigView;
})(window);
