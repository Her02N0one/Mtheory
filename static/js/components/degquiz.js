/* degquiz.js — Scale Degree Name Drill
 *
 * Shows a keyboard with all scale notes highlighted and prompts the student
 * to press the named degree. Cycles through all 7 degrees in shuffled order,
 * repeating as needed to reach the configured question count.
 *
 * Props:
 *   root   {string}  tonic in sci notation e.g. "C4"  (default "C4")
 *   scale  {string}  scale type                        (default "major")
 *   count  {number}  questions per session             (default 7)
 *
 * Depends on: keyboard.js, scale-helpers.js
 * Exports: window.MtheoryDegQuiz
 *
 * Checkpoint note: does NOT emit quiz_answered — key_quizzed from the keyboard
 * already bubbles to the checkpoint, so tallying happens without double-counting.
 */
(function (global) {
  "use strict";

  function KB() { return global.MtheoryKeyboard; }
  const { buildScale } = global.MtheoryScaleHelpers;

  const BASE_NAMES = [
    "Tonic", "Supertonic", "Mediant", "Subdominant",
    "Dominant", "Submediant",
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  class DegQuiz {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("DegQuiz: container not found");

      this._rootNote  = opts.root  || "C4";
      this._scaleType = opts.scale || "major";
      this._total     = Math.max(1, opts.count != null ? +opts.count : 7);
      this._idx       = 0;
      this._correct   = 0;
      this._done      = false;

      this._build();
    }

    _build() {
      const KBc = KB();
      if (!KBc) {
        this.root.textContent = "[DegQuiz: MtheoryKeyboard not loaded]";
        return;
      }

      this.root.classList.add("mdq-wrap");
      this.root.innerHTML = "";

      const rootMidi = KBc.midiOfSci(this._rootNote);
      this._degs = buildScale(rootMidi, this._scaleType);

      // Detect 7th degree: half step to octave = leading tone, whole = subtonic.
      const interval7 = this._degs[7].midi - this._degs[6].midi;
      this._names = [...BASE_NAMES, interval7 === 1 ? "Leading tone" : "Subtonic"];

      // Build shuffled queue cycling all 7 unique degrees.
      this._queue = [];
      for (let i = 0; i < this._total; i += 7) {
        this._queue.push(...shuffle([0, 1, 2, 3, 4, 5, 6]));
      }
      this._queue = this._queue.slice(0, this._total);

      // Prompt.
      const prompt = document.createElement("div");
      prompt.className = "mdq-prompt";
      this._promptEl = prompt;
      this.root.appendChild(prompt);

      // Keyboard.
      const kbHost = document.createElement("div");
      kbHost.className = "mdq-kb";
      this.root.appendChild(kbHost);

      this._kb = new KBc(kbHost, {
        low:         KBc.sciOf(this._degs[0].midi),
        high:        KBc.sciOf(this._degs[this._degs.length - 1].midi),
        highlight:   this._degs.map(d => KBc.sciOf(d.midi)),
        labels:      "all",
        interactive: true,
      });

      // Feedback.
      const feedback = document.createElement("div");
      feedback.className = "mdq-feedback";
      feedback.setAttribute("aria-live", "polite");
      this._feedbackEl = feedback;
      this.root.appendChild(feedback);

      // Progress.
      const progress = document.createElement("div");
      progress.className = "mdq-progress";
      this._progressEl = progress;
      this.root.appendChild(progress);

      this.root.addEventListener("mtheory:key_quizzed", ev => {
        if (this._done) return;
        const p = ev.detail && ev.detail.payload;
        if (!p) return;
        if (p.isCorrect) this._onCorrect();
      });

      this._ask();
    }

    _ask() {
      if (this._idx >= this._queue.length) {
        this._finish();
        return;
      }

      const KBc    = KB();
      const degIdx = this._queue[this._idx];
      const name   = this._names[degIdx];
      const target = KBc.sciOf(this._degs[degIdx].midi);

      this._feedbackEl.textContent = "";
      this._feedbackEl.className = "mdq-feedback";

      this._promptEl.innerHTML =
        `<span class="mdq-cue">Press the</span> `
        + `<strong class="mdq-name">${name}</strong> `
        + `<span class="mdq-num">(${degIdx + 1}̂)</span>`;

      this._kb.setQuiz({ target });
      this._updateProgress();
    }

    _onCorrect() {
      const degIdx = this._queue[this._idx];
      this._correct++;
      this._idx++;

      this._feedbackEl.textContent = `✓  ${this._names[degIdx]}`;
      this._feedbackEl.className = "mdq-feedback mdq-feedback--ok";

      this._kb.setQuiz(null);
      this._updateProgress();

      setTimeout(() => this._ask(), 700);
    }

    _finish() {
      this._done = true;
      this._kb.setQuiz(null);
      this._promptEl.innerHTML =
        `<span class="mdq-done">Done — ${this._correct} / ${this._total} correct</span>`;
      this._feedbackEl.textContent = "";
      this._progressEl.textContent = "";
    }

    _updateProgress() {
      const remaining = this._total - this._idx;
      this._progressEl.innerHTML =
        `<span class="mdq-prog-correct">${this._correct} correct</span>`
        + `  ·  `
        + `<span class="mdq-prog-remain">${remaining} remaining</span>`;
    }

    destroy() {
      if (this._kb && this._kb.destroy) this._kb.destroy();
      this.root.innerHTML = "";
    }
  }

  global.MtheoryDegQuiz = DegQuiz;
})(window);
