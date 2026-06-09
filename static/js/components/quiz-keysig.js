/* quiz-keysig.js — Key Signature Flashcard Quiz
 *
 * Flashes key signatures on a staff (or as text) and asks the student to press
 * the correct root note on the keyboard.  Each correct press advances the
 * question; wrong presses are tracked by the checkpoint via the existing
 * key_quizzed DOM event that already bubbles from the keyboard naturally.
 *
 * Props:
 *   mode   {string}  "identify" — staff visual  |  "text" — word prompt (default "identify")
 *   type   {string}  "sharps"  |  "flats"  |  "both"  (default "both")
 *   count  {number}  questions per session  (default 5)
 *
 * Depends on: keyboard.js, keysigview.js
 * Exports:    window.MtheoryKeysigQuiz
 *
 * Checkpoint note: this widget does NOT emit quiz_answered — the underlying
 * key_quizzed event from the keyboard already bubbles to the checkpoint,
 * so tallying happens without double-counting.
 */
(function (global) {
  "use strict";

  function KB()  { return global.MtheoryKeyboard;  }
  function KSV() { return global.MtheoryKeySigView; }

  // Each entry describes one learnable key signature.
  const ENTRIES = [
    // Sharps ─────────────────────────────────────────────────
    { count: 1, type: "sharps", name: "G",  root: "G4"  },
    { count: 2, type: "sharps", name: "D",  root: "D4"  },
    { count: 3, type: "sharps", name: "A",  root: "A4"  },
    { count: 4, type: "sharps", name: "E",  root: "E4"  },
    { count: 5, type: "sharps", name: "B",  root: "B4"  },
    { count: 6, type: "sharps", name: "F♯", root: "F#4" },
    { count: 7, type: "sharps", name: "C♯", root: "C#4" },
    // Flats ──────────────────────────────────────────────────
    { count: 1, type: "flats",  name: "F",  root: "F4"  },
    { count: 2, type: "flats",  name: "B♭", root: "Bb4" },
    { count: 3, type: "flats",  name: "E♭", root: "Eb4" },
    { count: 4, type: "flats",  name: "A♭", root: "Ab4" },
    { count: 5, type: "flats",  name: "D♭", root: "Db4" },
    { count: 6, type: "flats",  name: "G♭", root: "Gb4" },
    { count: 7, type: "flats",  name: "C♭", root: "B4"  }, // Cb ≡ B
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  class KeysigQuiz {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("KeysigQuiz: container not found");

      this.mode  = opts.mode  || "identify";
      this.type  = opts.type  || "both";
      this.total = Math.max(1, opts.count != null ? +opts.count : 5);

      this._idx     = 0;
      this._correct = 0;
      this._done    = false;

      this._build();
    }

    _buildPool() {
      let pool = ENTRIES;
      if (this.type === "sharps") pool = ENTRIES.filter(e => e.type === "sharps");
      if (this.type === "flats")  pool = ENTRIES.filter(e => e.type === "flats");

      // Sample with replacement until we have enough questions.
      const shuffled = shuffle(pool);
      const questions = [];
      for (let i = 0; i < this.total; i++) {
        questions.push(shuffled[i % shuffled.length]);
      }
      return questions;
    }

    _build() {
      this.root.classList.add("mkq-wrap");
      this.root.innerHTML = "";

      const KBc = KB(), KSVc = KSV();
      if (!KBc) {
        this.root.textContent = "[KeysigQuiz: MtheoryKeyboard not loaded]";
        return;
      }

      this._questions = this._buildPool();

      // — Prompt line —
      const prompt = document.createElement("div");
      prompt.className = "mkq-prompt";
      this._promptEl = prompt;
      this.root.appendChild(prompt);

      // — Key-signature staff (identify mode only) —
      if (this.mode === "identify") {
        if (!KSVc) {
          this.root.textContent = "[KeysigQuiz: MtheoryKeySigView not loaded]";
          return;
        }
        const sigWrap = document.createElement("div");
        sigWrap.className = "mkq-sig";
        this.root.appendChild(sigWrap);
        this._sigView = new KSVc(sigWrap, { readonly: true, showHint: false });
      }

      // — Keyboard —
      const kbHost = document.createElement("div");
      kbHost.className = "mkq-kb";
      this.root.appendChild(kbHost);
      this._kb = new KBc(kbHost, { low: "C4", high: "C5", labels: "all" });

      // — Progress bar —
      const progress = document.createElement("div");
      progress.className = "mkq-progress";
      this._progressEl = progress;
      this.root.appendChild(progress);

      // — Answer feedback (hidden by default) —
      const feedback = document.createElement("div");
      feedback.className = "mkq-feedback";
      feedback.setAttribute("aria-live", "polite");
      this._feedbackEl = feedback;
      this.root.appendChild(feedback);

      // Listen for key_quizzed on the keyboard host (bubbles up through here).
      this.root.addEventListener("mtheory:key_quizzed", ev => {
        if (this._done) return;
        const p = ev.detail && ev.detail.payload;
        if (!p) return;
        if (p.isCorrect) this._onCorrect();
      });

      this._ask();
    }

    _ask() {
      if (this._idx >= this._questions.length) {
        this._finish();
        return;
      }

      const q = this._questions[this._idx];
      this._feedbackEl.textContent = "";
      this._feedbackEl.className = "mkq-feedback";

      // Update staff
      if (this._sigView) {
        this._sigView.setSignature(q.count, q.type);
      }

      // Update prompt
      if (this.mode === "identify") {
        this._promptEl.innerHTML =
          `<span class="mkq-qnum">Q${this._idx + 1} / ${this.total}</span>`
          + `  Name the major key for this signature:`;
      } else {
        const acc = q.type === "sharps"
          ? `${q.count} sharp${q.count > 1 ? "s" : ""}`
          : `${q.count} flat${q.count > 1 ? "s" : ""}`;
        this._promptEl.innerHTML =
          `<span class="mkq-qnum">Q${this._idx + 1} / ${this.total}</span>`
          + `  Which major key has <strong>${acc}</strong>?`;
      }

      this._updateProgress();

      // Arm keyboard quiz
      this._kb.setQuiz({ target: q.root });
    }

    _onCorrect() {
      const q = this._questions[this._idx];
      this._correct++;
      this._idx++;

      // Brief correct-answer reveal
      this._feedbackEl.textContent = `✓  ${q.name} major`;
      this._feedbackEl.className = "mkq-feedback mkq-feedback--ok";

      this._kb.setQuiz(null);
      this._updateProgress();

      setTimeout(() => this._ask(), 700);
    }

    _finish() {
      this._done = true;
      this._kb.setQuiz(null);
      this._promptEl.innerHTML =
        `<span class="mkq-done">Session complete — ${this._correct} / ${this.total} correct</span>`;
      this._feedbackEl.textContent = "";
      this._updateProgress();
    }

    _updateProgress() {
      const remaining = this.total - this._idx;
      this._progressEl.innerHTML =
        `<span class="mkq-prog-correct">${this._correct} correct</span>`
        + `  ·  `
        + `<span class="mkq-prog-remain">${remaining} remaining</span>`;
    }

    destroy() {
      if (this._kb) this._kb.destroy();
      this.root.innerHTML = "";
    }
  }

  global.MtheoryKeysigQuiz = KeysigQuiz;
})(window);
