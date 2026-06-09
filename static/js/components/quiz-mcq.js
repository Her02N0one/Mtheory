/* quiz-mcq.js — Multiple-Choice Question Widget
 *
 * Renders a single theory question with 2–4 labeled options.  Clicking an
 * option shows immediate green (correct) or red (wrong) feedback.  A second
 * click after a wrong answer is allowed; the widget locks permanently once
 * the correct answer is chosen.
 *
 * Props:
 *   question {string}   The question text
 *   options  {array}    Array of answer strings (2–4 items)
 *   answer   {number}   0-based index of the correct option
 *
 * Emits: mtheory:quiz_answered  (bubbles — tallied by the checkpoint)
 * Exports: window.MtheoryMCQ
 */
(function (global) {
  "use strict";

  class MCQ {
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("MCQ: container not found");

      this._answerIdx = parseInt(opts.answer, 10);
      if (isNaN(this._answerIdx)) this._answerIdx = 0;
      this._options  = Array.isArray(opts.options) ? opts.options : [];
      this._done     = false;
      this._buttons  = [];

      this._build(opts.question || "");
    }

    _build(questionText) {
      this.root.classList.add("mmcq-wrap");
      this.root.innerHTML = "";

      // Question text
      const q = document.createElement("p");
      q.className = "mmcq-question";
      q.textContent = questionText;
      this.root.appendChild(q);

      // Option buttons
      const list = document.createElement("div");
      list.className = "mmcq-options";
      this._options.forEach((text, idx) => {
        const btn = document.createElement("button");
        btn.className = "mmcq-btn";
        btn.textContent = text;
        btn.addEventListener("click", () => this._pick(idx, btn));
        this._buttons.push(btn);
        list.appendChild(btn);
      });
      this.root.appendChild(list);
    }

    _pick(idx, btn) {
      if (this._done) return;
      const isCorrect = (idx === this._answerIdx);

      btn.classList.add(isCorrect ? "mmcq-btn--correct" : "mmcq-btn--wrong");

      if (isCorrect) {
        // Lock the widget — fade out other options
        this._done = true;
        this._buttons.forEach(b => {
          if (b !== btn) b.classList.add("mmcq-btn--muted");
          b.disabled = true;
        });
      } else {
        // Allow retry — remove the wrong class after a moment so they can try again
        setTimeout(() => btn.classList.remove("mmcq-btn--wrong"), 600);
      }

      // Emit for checkpoint tally (MCQ has no underlying instrument event to bubble)
      this.root.dispatchEvent(new CustomEvent("mtheory:quiz_answered", {
        detail: { source: "mcq", payload: { isCorrect } },
        bubbles: true,
      }));
    }

    destroy() { this.root.innerHTML = ""; }
  }

  global.MtheoryMCQ = MCQ;
})(window);
