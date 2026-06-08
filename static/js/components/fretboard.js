/* fretboard.js — Mtheory Fretboard component (Content Engine widget)
 *
 * A playable guitar-neck widget that speaks the same §1d event contract as the
 * Keyboard. It emits `fret_played` (note payload + string/fret) and
 * `fret_quizzed`, reuses the Keyboard's pitch math + synth + color/shape
 * standard, and exposes a MIDI-keyed highlight API so `Companion` can sync the
 * two instruments by absolute sounding pitch.
 *
 * Conventions (match note_system.py STANDARD_TUNING / fretboard.py):
 *   string index 0 = low E (E2), 5 = high E (E4).  Rendered high-E on top.
 *   midiAt(string, fret) = openMidi[string] + fret.
 */
(function (global) {
  "use strict";

  // Open-string MIDI per string index (0 = low E2 .. 5 = high E4).
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
  const STRING_LABEL = ["E", "A", "D", "G", "B", "E"]; // by string index
  const INLAY_FRETS = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1, 19: 1, 21: 1 };

  function KB() { return global.MtheoryKeyboard; }
  function midiAt(stringIdx, fret) { return OPEN_MIDI[stringIdx] + fret; }

  class Fretboard {
    /* opts:
     *   strings   {number[]} string indices to show (default [0..5], low→high)
     *   frets     {number}   highest fret to draw (default 5; shows 0..frets)
     *   highlight {string|string[]} note name(s)/sci pitch(es) to mark
     *   reference {string|string[]} faint labelled anchor notes
     *   quiz      {object}   { target: 'C4' | 'C' } — quiz mode, emits fret_quizzed
     *   labels    {string}   'marks' (default, only on highlight) | 'all' | 'none'
     *   audio     {boolean|function}  true | false | (midi, freq) => {}
     *   onEvent   {function} callback receiving every emitted event object
     *   emitDom   {boolean}  dispatch bubbling DOM events (default true)
     */
    constructor(container, opts) {
      opts = opts || {};
      this.root = typeof container === "string"
        ? document.querySelector(container) : container;
      if (!this.root) throw new Error("Fretboard: container not found");

      this.strings = Array.isArray(opts.strings) && opts.strings.length
        ? opts.strings.slice() : [0, 1, 2, 3, 4, 5];
      this.frets = opts.frets != null ? opts.frets : 5;
      this.labels = opts.labels || "marks";
      // labelMap: {midi -> string} — overrides the text shown inside a dot.
      // Useful for degree numbers (1–8) instead of note names (C, D, E…).
      this.labelMap = opts.labelMap || {};
      this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : null;
      this.emitDom = opts.emitDom !== false;

      if (opts.audio === false) this._play = function () {};
      else if (typeof opts.audio === "function") this._play = opts.audio;
      else this._play = (KB() && KB().pluck) || function () {};

      this.highlightMidi = this._toMidiSet(opts.highlight);
      this.referenceMidi = this._toMidiSet(opts.reference);
      this.quiz = opts.quiz || null;
      this.quizTargetPc = this.quiz != null ? this._toPitchClass(this.quiz.target) : null;

      this._cellEls = new Map(); // "s:f" -> element
      this.render();
    }

    // Accept 'C4' | ['C4','E4'] | 'C' (bare name -> every matching position).
    _toMidiSet(spec) {
      const set = new Set();
      if (spec == null) return set;
      const list = Array.isArray(spec) ? spec : [spec];
      const k = KB();
      list.forEach((item) => {
        const midi = k && k.midiOfSci ? k.midiOfSci(item) : null;
        if (midi != null && /\d/.test(item)) { set.add(midi); return; }
        // bare name -> all positions of that pitch class in range
        const pc = this._toPitchClass(item);
        if (pc == null) return;
        this._forEachPos((s, f, m) => { if (k.pitchClassOf(m) === pc) set.add(m); });
      });
      return set;
    }
    _toPitchClass(item) {
      const k = KB();
      if (item == null || !k) return null;
      if (typeof item === "number") return ((item % 12) + 12) % 12;
      const midi = k.midiOfSci(/\d/.test(item) ? item : item + "4");
      return midi == null ? null : k.pitchClassOf(midi);
    }
    _forEachPos(fn) {
      this.strings.forEach((s) => {
        for (let f = 0; f <= this.frets; f++) fn(s, f, midiAt(s, f));
      });
    }

    render() {
      const k = KB();
      this.root.classList.add("mf-fretboard");
      this.root.innerHTML = "";
      this._cellEls.clear();

      // Visual order: highest-pitched string on top.
      const rows = this.strings.slice().sort((a, b) => b - a);

      const grid = document.createElement("div");
      grid.className = "mf-grid";
      grid.style.setProperty("--mf-frets", String(this.frets));

      rows.forEach((s) => {
        const row = document.createElement("div");
        row.className = "mf-row";

        const label = document.createElement("span");
        label.className = "mf-string-label";
        label.textContent = STRING_LABEL[s];
        row.appendChild(label);

        for (let f = 0; f <= this.frets; f++) {
          row.appendChild(this._makeCell(s, f));
        }
        grid.appendChild(row);
      });

      // Fret-number strip (with inlay dots) under the neck.
      const nums = document.createElement("div");
      nums.className = "mf-fretnums";
      const spacer = document.createElement("span");
      spacer.className = "mf-string-label";
      nums.appendChild(spacer);
      for (let f = 0; f <= this.frets; f++) {
        const cell = document.createElement("span");
        cell.className = "mf-fretnum" + (INLAY_FRETS[f] ? " mf-fretnum--inlay" : "");
        cell.textContent = f === 0 ? "" : String(f);
        nums.appendChild(cell);
      }
      grid.appendChild(nums);

      this.root.appendChild(grid);
    }

    _makeCell(stringIdx, fret) {
      const k = KB();
      const midi = midiAt(stringIdx, fret);
      const name = k.nameOf(midi);
      const style = k.noteStyle(name);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mf-cell" + (fret === 0 ? " mf-cell--open" : "");
      cell.dataset.string = String(stringIdx);
      cell.dataset.fret = String(fret);
      cell.dataset.midi = String(midi);

      const isHi = this.highlightMidi.has(midi);
      const isRef = !isHi && this.referenceMidi.has(midi);
      const showMark =
        this.labels === "all" ||
        (this.labels === "marks" && (isHi || isRef));

      if (showMark && style) {
        const dot = document.createElement("span");
        dot.className = "mf-dot mf-dot--" + style.shape +
          (isHi ? " mf-dot--hi" : "") + (isRef ? " mf-dot--ref" : "");
        dot.style.background = style.color;
        dot.style.color = k.readableText(style.color);
        dot.textContent = this.labelMap[midi] != null ? String(this.labelMap[midi]) : name;
        cell.appendChild(dot);
      }

      cell.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        this._press(stringIdx, fret, midi, cell);
      });
      this._cellEls.set(stringIdx + ":" + fret, cell);
      return cell;
    }

    _press(stringIdx, fret, midi, cell) {
      this._play(midi, KB().freqOf(midi));
      cell.classList.add("mf-cell--active");
      setTimeout(() => cell.classList.remove("mf-cell--active"), 160);

      if (this.quizTargetPc != null) {
        // Capture sticky before emitting: the engine's onEvent handler may
        // disarm the quiz (setQuiz(null)) synchronously inside _emit.
        const sticky = this.sticky;
        const evt = this._emitQuiz(stringIdx, fret, midi);
        if (sticky && evt.payload.isCorrect) this.markFound(stringIdx, fret, midi);
      } else {
        this._emit("fret_played", this._payload(stringIdx, fret, midi));
      }
    }

    _payload(stringIdx, fret, midi) {
      const p = KB().notePayload(midi);
      p.string = stringIdx;
      p.fret = fret;
      return p;
    }

    _emit(eventName, payload) {
      const evt = { event: eventName, source: "fretboard", payload: payload };
      try { console.log("[Fretboard]", JSON.stringify(evt)); } catch (e) {}
      if (this.emitDom) {
        this.root.dispatchEvent(
          new CustomEvent("mtheory:" + eventName, { detail: evt, bubbles: true })
        );
      }
      if (this.onEvent) this.onEvent(evt);
      return evt;
    }

    _emitQuiz(stringIdx, fret, midi) {
      const k = KB();
      const selPc = k.pitchClassOf(midi);
      // Exact mode (sticky fill) compares absolute pitch; otherwise pitch class.
      const isCorrect = this.quizExact
        ? midi === this.quizTargetMidi
        : selPc === this.quizTargetPc;
      return this._emit("fret_quizzed", {
        targetPitchClass: this.quizTargetPc,
        selectedPitchClass: selPc,
        targetNote: k.nameOf(this.quizTargetPc), // pc-as-midi gives the letter
        selectedNote: k.nameOf(midi),
        string: stringIdx,
        fret: fret,
        isCorrect: isCorrect,
      });
    }

    // Permanently pin a found position (sticky fill drill): a colored chip the
    // user placed stays on the neck so the board fills up note by note. Every
    // visible position of the same exact pitch is pinned (e.g. B2 / A2 each sit
    // on two strings), so finding one lights all of its spots on the neck.
    markFound(stringIdx, fret, midi) {
      const target = midi != null ? midi : midiAt(stringIdx, fret);
      this._cellEls.forEach((el, key) => {
        const [s, f] = key.split(":").map(Number);
        if (midiAt(s, f) !== target) return;
        this._pinCell(el, target);
      });
    }

    _pinCell(el, midi) {
      if (!el || el.querySelector(".mf-dot--found")) return;
      const k = KB();
      const name = k.nameOf(midi);
      const style = k.noteStyle(name);
      if (!style) return;
      const dot = document.createElement("span");
      dot.className = "mf-dot mf-dot--" + style.shape + " mf-dot--found";
      dot.style.background = style.color;
      dot.style.color = k.readableText(style.color);
      dot.textContent = name;
      el.appendChild(dot);
      el.classList.add("mf-cell--placed");
    }

    // --- Public API -------------------------------------------------------
    setHighlight(spec) { this.setHighlightMidi(this._toMidiSet(spec)); }

    // MIDI-keyed highlight (Companion sync by absolute sounding pitch).
    setHighlightMidi(midiSet) {
      this.highlightMidi = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      this.render();
    }

    setQuiz(quiz) {
      this.quiz = quiz || null;
      this.sticky = !!(quiz && quiz.sticky);
      if (quiz && quiz.targetMidi != null) {
        // Exact-pitch quiz (sticky fill): the lit pitch must be matched in the
        // right register, not merely the right letter.
        this.quizTargetMidi = quiz.targetMidi;
        this.quizTargetPc = KB().pitchClassOf(quiz.targetMidi);
        this.quizExact = true;
      } else if (quiz) {
        this.quizTargetPc = this._toPitchClass(quiz.target);
        this.quizTargetMidi = null;
        this.quizExact = false;
      } else {
        this.quizTargetPc = null;
        this.quizTargetMidi = null;
        this.quizExact = false;
      }
    }

    flashCell(stringIdx, fret, cls) {
      const el = this._cellEls.get(stringIdx + ":" + fret);
      if (!el) return;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 600);
    }

    // Briefly highlight all cells in `midiSet` without triggering a full
    // re-render (so an SVG overlay drawn on top is not destroyed).
    flashMidi(midiSet, duration) {
      var ms = midiSet instanceof Set ? midiSet : new Set(midiSet || []);
      var dur = duration != null ? duration : 900;
      this._cellEls.forEach(function (el, key) {
        var parts = key.split(":");
        var m = midiAt(parseInt(parts[0], 10), parseInt(parts[1], 10));
        if (ms.has(m)) {
          el.classList.add("mf-cell--flash");
          setTimeout(function () { el.classList.remove("mf-cell--flash"); }, dur);
        }
      });
    }

    destroy() { this.root.innerHTML = ""; this._cellEls.clear(); }
  }

  Fretboard.midiAt = midiAt;
  global.MtheoryFretboard = Fretboard;
})(window);
