/* minorscaleview.js — Minor Scale Comparison Widget
 *
 * Shows the four standard minor scale forms (Natural, Harmonic, Melodic ↑,
 * Melodic ↓) on a tab-based staff view. Degrees that differ from the parallel
 * major are rendered in amber so students can see exactly what changed.
 *
 * Optionally shows the parallel major scale as a reference row beneath each
 * minor form when `compare: true` is passed.
 *
 * Props:
 *   root       {string}  tonic in sci notation, e.g. "C4"  (default "C4")
 *   compare    {bool}    also show parallel major for comparison (default true)
 *   interactive {bool}   click noteheads to play  (default true)
 *
 * Depends on:  scale-helpers.js, scaleview.js, keyboard.js
 * Exports:     window.MtheoryMinorScaleView
 */
(function (global) {
  "use strict";

  function KVc() { return global.MtheoryKeyView; }

  const TABS = [
    {
      key:     "natural_minor",
      label:   "Natural",
      badge:   "♭3̂ ♭6̂ ♭7̂",
      altered: [3, 6, 7],
      desc:    "♭3̂, ♭6̂, ♭7̂ (three lowered degrees)",
    },
    {
      key:     "harmonic_minor",
      label:   "Harmonic",
      badge:   "♭3̂ ♭6̂",
      altered: [3, 6],
      desc:    "♭3̂, ♭6̂ — raised 7̂ creates the leading tone interval",
    },
    {
      key:     "melodic_minor",
      label:   "Melodic ↑",
      badge:   "♭3̂",
      altered: [3],
      desc:    "♭3̂ only (ascending form — only the 3rd is lowered)",
    },
    {
      key:     "melodic_minor_desc",
      label:   "Melodic ↓",
      badge:   "♭3̂ ♭6̂ ♭7̂",
      altered: [3, 6, 7],
      desc:    "Same as natural minor (descending form)",
    },
  ];

  class MinorScaleView {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("MinorScaleView: container not found");

      this.rootNote    = opts.root    || "C4";
      this.showCompare = opts.compare !== false;
      this.interactive = opts.interactive !== false;
      this._activeKey  = "natural_minor";
      this._svMinor    = null;
      this._svMajor    = null;

      this._build();
    }

    _build() {
      this.root.classList.add("mmsv-wrap");
      this.root.innerHTML = "";

      // — Tab row —
      const tabRow = document.createElement("div");
      tabRow.className = "mmsv-tabs";
      this._tabBtns = {};
      TABS.forEach(tab => {
        const btn = document.createElement("button");
        btn.className = "mmsv-tab";
        btn.innerHTML =
          `<span class="mmsv-tab-label">${tab.label}</span>`
          + `<span class="mmsv-tab-badge">${tab.badge}</span>`;
        btn.addEventListener("click", () => this._select(tab.key));
        this._tabBtns[tab.key] = btn;
        tabRow.appendChild(btn);
      });
      this.root.appendChild(tabRow);

      // — Scale title —
      const title = document.createElement("div");
      title.className = "mmsv-title";
      this._titleEl = title;
      this.root.appendChild(title);

      // — Minor scale staff —
      const minorHost = document.createElement("div");
      minorHost.className = "mmsv-scale mmsv-scale--minor";
      this._minorHost = minorHost;
      this.root.appendChild(minorHost);

      // — Compare: major staff (optional) —
      if (this.showCompare) {
        const compareLabel = document.createElement("div");
        compareLabel.className = "mmsv-compare-label";
        compareLabel.textContent = "Reference: parallel major";
        this._compareLabelEl = compareLabel;
        this.root.appendChild(compareLabel);

        const majorHost = document.createElement("div");
        majorHost.className = "mmsv-scale mmsv-scale--major";
        this._majorHost = majorHost;
        this.root.appendChild(majorHost);
      }

      // — Info strip —
      const info = document.createElement("div");
      info.className = "mmsv-info";
      this._infoEl = info;
      this.root.appendChild(info);

      this._select("natural_minor");
    }

    _select(key) {
      this._activeKey = key;

      // Update tab button states
      TABS.forEach(tab => {
        this._tabBtns[tab.key].classList.toggle("mmsv-tab--active", tab.key === key);
      });

      const tab = TABS.find(t => t.key === key);
      const rootName = this.rootNote.replace(/\d+$/, "");

      // Update title
      this._titleEl.textContent = `${rootName} ${tab.label.replace(" ↑", " ascending").replace(" ↓", " descending")} minor`;

      // Destroy + recreate minor KeyView
      if (this._svMinor) { this._svMinor.destroy(); this._svMinor = null; }
      this._minorHost.innerHTML = "";
      const KV = KVc();
      if (KV) {
        this._svMinor = new KV(this._minorHost, {
          root:        this.rootNote,
          scale:       tab.key,
          steps:       true,
          labels:      "degrees",
          altered:     tab.altered,
          interactive: this.interactive,
        });
      }

      // Major reference
      if (this.showCompare) {
        if (this._svMajor) { this._svMajor.destroy(); this._svMajor = null; }
        this._majorHost.innerHTML = "";
        if (KV) {
          this._svMajor = new KV(this._majorHost, {
            root:        this.rootNote,
            scale:       "major",
            steps:       false,
            labels:      "degrees",
            interactive: false,
          });
        }
      }

      // Update info strip
      this._infoEl.innerHTML =
        `Compared to ${rootName} major: `
        + `<span class="mmsv-altered-badge">${tab.desc}</span>`;
    }

    destroy() {
      if (this._svMinor) this._svMinor.destroy();
      if (this._svMajor) this._svMajor.destroy();
      this.root.innerHTML = "";
    }
  }

  global.MtheoryMinorScaleView = MinorScaleView;
})(window);
