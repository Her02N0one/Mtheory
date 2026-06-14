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

  function _hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  class Fretboard {
    /* opts:
     *   strings   {number[]} string indices to show (default [0..5], low→high)
     *   frets     {number}   highest fret to draw (default 5; shows 0..frets)
     *   highlight {string|string[]} note name(s)/sci pitch(es) to mark
     *   reference {string|string[]} faint labelled anchor notes
     *   quiz      {object}   { target: 'C4' | 'C' } — quiz mode, emits fret_quizzed
     *   labels    {string}   'marks' (default, only on highlight) | 'all' | 'none'
     *   audio     {boolean|function}  true | false | (midi, freq) => {}
     *   onEvent      {function} callback receiving every emitted event object
     *   emitDom      {boolean}  dispatch bubbling DOM events (default true)
     *   registerView {boolean}  show a visual separator at the G/B string boundary
     *                           and lighter region tint on upper-register rows (B, e)
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

      // Fret window: fretMin is the lowest fret shown (default 0 = open position).
      // frets is still the *highest* fret shown.  Mid-neck boxes set fretMin > 0.
      this.fretMin = opts.fretMin != null ? parseInt(opts.fretMin, 10) : 0;

      // Per-instance row height in px (stringSpacing prop). Default 34.
      this.stringSpacing = opts.stringSpacing != null ? opts.stringSpacing : 34;

      // Linger: ms notes remain visible after being played (0 = off).
      this.lingerMs = opts.lingerMs != null ? opts.lingerMs : 0;
      this._lingerMidi = new Map(); // midi -> timeoutId

      // When true, renders a separator between the G string row and B string row
      // (the G→B tuning anomaly boundary) and dims the upper-register region bands.
      this.registerView = opts.registerView || false;

      this._cellEls    = new Map(); // "s:f" -> element
      this._multiGroups = null;    // set by setMultiView()
      this._regions     = null;    // set by setRegionsAndView()
      // orphanMidi: scale notes that fall outside any complete root-to-root octave span.
      // Rendered as hollow dashed dots so the student can see where complete octaves end.
      this.orphanMidi  = this._toMidiSet(opts.orphan);
      this.render();
    }

    // Accept MIDI int | 'C4' | ['C4','E4'] | 'C' (bare name -> every matching position).
    _toMidiSet(spec) {
      const set = new Set();
      if (spec == null) return set;
      const list = Array.isArray(spec) ? spec : [spec];
      const k = KB();
      list.forEach((item) => {
        // Direct numeric MIDI value — skip string-parsing entirely.
        if (typeof item === "number") { set.add(item); return; }
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
        for (let f = this.fretMin; f <= this.frets; f++) fn(s, f, midiAt(s, f));
      });
    }

    render() {
      const k = KB();
      this.root.classList.add("mf-fretboard");
      if (this.registerView) this.root.classList.add("mf-fretboard--register-view");
      this.root.innerHTML = "";
      this._cellEls.clear();

      // Visual order: highest-pitched string on top.
      const rows = this.strings.slice().sort((a, b) => b - a);

      const grid = document.createElement("div");
      grid.className = "mf-grid";
      grid.style.setProperty("--mf-frets", String(this.frets - this.fretMin));
      grid.style.setProperty("--mf-row-h", this.stringSpacing + "px");

      rows.forEach((s) => {
        const row = document.createElement("div");
        // mf-row--upper-reg  : B and high-E strings (upper register, above the G→B gap)
        // mf-row--reg-break  : B string row specifically — the separator is drawn beneath it
        row.className = "mf-row"
          + (this.registerView && (s === 4 || s === 5) ? " mf-row--upper-reg" : "")
          + (this.registerView && s === 4 ? " mf-row--reg-break" : "");

        const label = document.createElement("span");
        label.className = "mf-string-label";
        label.textContent = STRING_LABEL[s];
        row.appendChild(label);

        for (let f = this.fretMin; f <= this.frets; f++) {
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
      for (let f = this.fretMin; f <= this.frets; f++) {
        const cell = document.createElement("span");
        cell.className = "mf-fretnum" + (INLAY_FRETS[f] ? " mf-fretnum--inlay" : "");
        // Open string column has no fret number; mid-neck always shows the actual fret.
        cell.textContent = (f === 0) ? "" : String(f);
        nums.appendChild(cell);
      }
      grid.appendChild(nums);

      this.root.appendChild(grid);

      // Re-attach linger dots that survived a re-render (timers still running).
      var self = this;
      this._lingerMidi.forEach(function (_id, midi) { self._addLingerDot(midi); });
    }

    _makeCell(stringIdx, fret) {
      const k = KB();
      const midi = midiAt(stringIdx, fret);
      const name = k.nameOf(midi);
      const style = k.noteStyle(name);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mf-cell"
        + (fret === 0 ? " mf-cell--open" : "")
        + (fret === 1 && this.fretMin === 0 ? " mf-cell--nut" : "");
      cell.dataset.string = String(stringIdx);
      cell.dataset.fret = String(fret);
      cell.dataset.midi = String(midi);

      // Region-band background (CAGED section coloring — set by setRegionsAndView).
      // Upper-register strings (B=4, high-E=5) get a lighter tint so the G→B
      // register divide is visually obvious when registerView is enabled.
      if (this._regions) {
        for (var ri = 0; ri < this._regions.length; ri++) {
          var rg = this._regions[ri];
          if (fret >= rg.fmin && fret <= rg.fmax) {
            var isUpperReg = this.registerView && (stringIdx === 4 || stringIdx === 5);
            cell.style.background = _hexToRgba(rg.color, isUpperReg ? 0.10 : 0.25);
            break;
          }
        }
      }

      if (this._multiGroups) {
        // Multi-view (CAGED shape overview): each group gets its own color.
        let matchedGroup = null;
        let isRoot = false;
        for (let gi = 0; gi < this._multiGroups.length; gi++) {
          const g = this._multiGroups[gi];
          if (g.midi.has(midi)) {
            matchedGroup = g;
            isRoot = g.rootMidi ? g.rootMidi.has(midi) : false;
            break;
          }
        }
        if (matchedGroup && style) {
          const dot = document.createElement("span");
          dot.className = "mf-dot mf-dot--" + style.shape + " mf-dot--multi" +
            (isRoot ? " mf-dot--multi-root" : " mf-dot--multi-ref");
          dot.style.background = matchedGroup.color;
          dot.style.color = isRoot ? "#fff" : "transparent";
          if (isRoot && matchedGroup.rootLabel) dot.textContent = matchedGroup.rootLabel;
          cell.appendChild(dot);
        }
      } else {
        const isHi   = this.highlightMidi.has(midi);
        const isOrph = !isHi && this.orphanMidi.has(midi);
        const isRef  = !isHi && !isOrph && this.referenceMidi.has(midi);
        const showMark =
          this.labels === "all" ||
          (this.labels === "marks" && (isHi || isRef || isOrph));

        if (showMark && style) {
          const dot = document.createElement("span");
          if (this._regions) {
            // White/neutral dots on top of the colored region band.
            dot.className = "mf-dot mf-dot--circle"
              + (isHi ? " mf-dot--region-root" : isOrph ? " mf-dot--region-orphan" : " mf-dot--region-ref");
            dot.style.background = isHi ? "rgba(255,255,255,0.93)" : isOrph ? "transparent" : "rgba(255,255,255,0.35)";
            if (isOrph) dot.style.border = "1.5px dashed rgba(255,255,255,0.40)";
            dot.style.color = "#111";
            if (isHi) dot.textContent = this.labelMap[midi] != null ? String(this.labelMap[midi]) : name;
          } else if (isOrph) {
            // Orphan: hollow dashed dot in the note's color — outside a complete octave span.
            dot.className = "mf-dot mf-dot--" + style.shape + " mf-dot--orphan";
            dot.style.background  = "transparent";
            dot.style.borderColor = style.color;
            dot.style.color       = style.color;
            dot.textContent = this.labelMap[midi] != null ? String(this.labelMap[midi]) : name;
          } else {
            dot.className = "mf-dot mf-dot--" + style.shape +
              (isHi ? " mf-dot--hi" : "") + (isRef ? " mf-dot--ref" : "");
            dot.style.background = style.color;
            dot.style.color = k.readableText(style.color);
            dot.textContent = this.labelMap[midi] != null ? String(this.labelMap[midi]) : name;
          }
          cell.appendChild(dot);
        }
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
      if (this.lingerMs > 0) this.lingerNote(midi);

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

    // Update highlight, reference, and orphan sets in one render pass.
    // orphanMidi (optional): notes outside any complete root-to-root octave span,
    // rendered as hollow dashed dots so the student sees where complete octaves end.
    setView(highlightMidi, referenceMidi, orphanMidi) {
      this._multiGroups = null;
      this._regions     = null;
      this.highlightMidi = highlightMidi instanceof Set ? highlightMidi : new Set(highlightMidi || []);
      this.referenceMidi = referenceMidi instanceof Set ? referenceMidi : new Set(referenceMidi || []);
      this.orphanMidi    = orphanMidi    instanceof Set ? orphanMidi    : new Set(orphanMidi    || []);
      this.render();
    }

    // Region-band + note view: colors fret-column backgrounds by shape zone, then
    // overlays neutral white dots for scale tones and roots.
    // regions = [{fmin, fmax, color}], highlight/reference/orphan are MIDI Sets.
    setRegionsAndView(regions, highlightMidi, referenceMidi, orphanMidi) {
      this._multiGroups = null;
      this._regions     = regions || null;
      this.highlightMidi = highlightMidi instanceof Set ? highlightMidi : new Set(highlightMidi || []);
      this.referenceMidi = referenceMidi instanceof Set ? referenceMidi : new Set(referenceMidi || []);
      this.orphanMidi    = orphanMidi    instanceof Set ? orphanMidi    : new Set(orphanMidi    || []);
      this.render();
    }

    // Multi-group coloring for CAGED overview: each group = {midi, rootMidi, color, rootLabel}.
    // Dots take the group's color; root dots show rootLabel text and full opacity.
    setMultiView(groups) {
      this._multiGroups = groups || null;
      this._regions     = null;
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

    // Linger API: show a note dot for `ms` ms (defaults to this.lingerMs), then
    // fade it out.  Calling again before expiry resets the timer.  Notes already
    // in permanentHighlightMidi are skipped (they're always visible anyway).
    lingerNote(midi, ms) {
      var dur = ms != null ? ms : this.lingerMs;
      if (!dur) return;
      var already = this._lingerMidi.has(midi);
      if (already) {
        clearTimeout(this._lingerMidi.get(midi));
      } else {
        this._addLingerDot(midi);
      }
      var self = this;
      this._lingerMidi.set(midi, setTimeout(function () {
        self._lingerMidi.delete(midi);
        self._removeLingerDot(midi);
      }, dur));
    }

    _addLingerDot(midi) {
      if (this.highlightMidi.has(midi)) return; // permanent dot already visible
      var k = KB();
      var name = k.nameOf(midi);
      var style = k.noteStyle(name);
      if (!style) return;
      var labelText = this.labelMap[midi] != null ? String(this.labelMap[midi]) : name;
      this._cellEls.forEach(function (el, key) {
        var parts = key.split(":");
        var s = parseInt(parts[0], 10);
        var f = parseInt(parts[1], 10);
        if (midiAt(s, f) !== midi) return;
        if (el.querySelector(".mf-dot--linger")) return;
        var dot = document.createElement("span");
        dot.className = "mf-dot mf-dot--" + style.shape + " mf-dot--linger mf-dot--hi";
        dot.style.background = style.color;
        dot.style.color = k.readableText(style.color);
        dot.textContent = labelText;
        el.appendChild(dot);
      });
    }

    _removeLingerDot(midi) {
      this._cellEls.forEach(function (el, key) {
        var parts = key.split(":");
        var s = parseInt(parts[0], 10);
        var f = parseInt(parts[1], 10);
        if (midiAt(s, f) !== midi) return;
        var dot = el.querySelector(".mf-dot--linger");
        if (!dot) return;
        dot.classList.add("mf-dot--expiring");
        setTimeout(function () { if (dot.parentNode) dot.parentNode.removeChild(dot); }, 520);
      });
    }

    // Remove all currently-lingering dots immediately (timers cancelled).
    clearLinger() {
      this._lingerMidi.forEach(function (id) { clearTimeout(id); });
      this._lingerMidi.clear();
      this._cellEls.forEach(function (el) {
        var dot = el.querySelector(".mf-dot--linger");
        if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
      });
    }

    destroy() {
      this._lingerMidi.forEach(function (id) { clearTimeout(id); });
      this._lingerMidi.clear();
      this.root.innerHTML = "";
      this._cellEls.clear();
    }
  }

  Fretboard.midiAt = midiAt;
  global.MtheoryFretboard = Fretboard;
})(window);
