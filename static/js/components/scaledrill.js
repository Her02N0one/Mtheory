/* scaledrill.js — Sequential scale pattern drill on the fretboard
 *
 * Prompts the student to play each note of a scale in order, accepting both
 * fretboard clicks and real guitar via microphone (optional). Wrong notes
 * flash the fretboard and replay the audio hint; correct notes advance.
 * Only correct answers are emitted as mtheory:quiz_answered so checkpoints
 * tally mastery (wrong attempts are absorbed here).
 *
 * Props:
 *   root    {string}  tonic in sci notation e.g. "C3"          (default "C3")
 *   scale   {string}  scale type key (see SCALE_INTERVALS)     (default "major")
 *   pattern {string}  "up" | "down" | "up_down" | "thirds"    (default "up")
 *   count   {number}  repetitions of the pattern               (default 1)
 *   strict  {boolean} exact octave if true; pitch-class if false (default false)
 *   strings {array}   drill-path string indices e.g. [1,2,3]   (default all 6)
 *   frets   {number}  highest fret shown                       (default 5)
 *   fretMin {number}  lowest fret shown (0 = open position)    (default 0)
 *   labels  {string}  "marks" | "all" | "none"                 (default "marks")
 *   blind   {boolean} hide all fretboard dots (recall mode)    (default false)
 *
 * Exports: window.MtheoryScaleDrill
 * Depends on: fretboard.js, keyboard.js, mic-bridge.js (optional)
 */
(function (global) {
  "use strict";

  // Open-string MIDI, matching fretboard.js (string 0 = low E2).
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

  const SCALE_INTERVALS = {
    major:            [0, 2, 4, 5, 7, 9, 11, 12],
    natural_minor:    [0, 2, 3, 5, 7, 8, 10, 12],
    harmonic_minor:   [0, 2, 3, 5, 7, 8, 11, 12],
    melodic_minor:    [0, 2, 3, 5, 7, 9, 11, 12],
    pentatonic_major: [0, 2, 4, 7, 9, 12],
    pentatonic_minor: [0, 3, 5, 7, 10, 12],
  };

  function pc(midi) { return ((midi % 12) + 12) % 12; }

  class ScaleDrill {
    constructor(el, props) {
      props = props || {};
      const KB = global.MtheoryKeyboard;
      const FB = global.MtheoryFretboard;
      if (!KB || !FB) {
        el.textContent = "[ScaleDrill: instruments not loaded]";
        return;
      }

      this._el         = el;
      this._KB         = KB;
      this._strict     = !!props.strict;
      this._blind      = !!props.blind;
      this._idx        = 0;
      this._micActive  = false;
      this._micHandler = null;

      // ── Fret range and string set — must be computed before _buildSequence ──
      this._drillStrings = Array.isArray(props.strings)
        ? props.strings
        : [0, 1, 2, 3, 4, 5];
      this._frets   = props.frets   != null ? props.frets   : 5;
      this._fretMin = props.fretMin != null ? props.fretMin : 0;

      // ── Scale pitch-class set ─────────────────────────────────────────────
      const rootMidi = KB.midiOfSci(props.root || "C3") || 48;
      const ivs      = SCALE_INTERVALS[props.scale] || SCALE_INTERVALS.major;
      this._scalePcs = new Set(ivs.map(i => pc(rootMidi + i)));

      // ── MIDI-by-pitch-class map for all drill strings in fret range ───────
      // Covers every MIDI note reachable in [fretMin, frets] × drill strings.
      this._midiByPc = {};
      this._drillStrings.forEach(s => {
        for (let f = this._fretMin; f <= this._frets; f++) {
          const m = OPEN_MIDI[s] + f;
          const p = pc(m);
          if (!this._midiByPc[p]) this._midiByPc[p] = new Set();
          this._midiByPc[p].add(m);
        }
      });

      // ── Sequence: all scale notes in the box sorted by pitch ──────────────
      // Uses the full fret window (2+ octaves) rather than a single abstract
      // octave from rootMidi, so the drill covers everything in the shape.
      this._sequence = this._buildSequence(props);

      // ── Finger map: midi → finger label ──────────────────────────────────
      // finger = fret - fretMin + 1 (clamped 1–4); fret 0 = "O" (open string).
      // Within a 3–5 fret CAGED box each MIDI appears on at most one string,
      // so the map is unambiguous.
      this._fingerMap = this._buildFingerMap();

      el.classList.add("msd-drill");

      // ── Note card (top section) ──────────────────────────────────────────
      const noteCard = document.createElement("div");
      noteCard.className = "msd-drill__card";
      el.appendChild(noteCard);

      this._swatchEl = document.createElement("span");
      this._swatchEl.className = "msd-drill__swatch";
      noteCard.appendChild(this._swatchEl);

      const cardText = document.createElement("div");
      cardText.className = "msd-drill__card-text";
      noteCard.appendChild(cardText);

      this._noteNameEl = document.createElement("span");
      this._noteNameEl.className = "msd-drill__note-name";
      cardText.appendChild(this._noteNameEl);

      this._subtitleEl = document.createElement("span");
      this._subtitleEl.className = "msd-drill__subtitle";
      cardText.appendChild(this._subtitleEl);

      this._fingerEl = document.createElement("span");
      this._fingerEl.className = "msd-drill__finger-hint";
      cardText.appendChild(this._fingerEl);

      // Right side: progress + mic button
      const cardRight = document.createElement("div");
      cardRight.className = "msd-drill__card-right";
      noteCard.appendChild(cardRight);

      this._progressEl = document.createElement("p");
      this._progressEl.className = "msd-drill__progress";
      cardRight.appendChild(this._progressEl);

      if (global.MicBridge) {
        this._micBtn = document.createElement("button");
        this._micBtn.type = "button";
        this._micBtn.className = "msd-drill__mic-btn";
        this._micBtn.textContent = "Use mic";
        this._micBtn.addEventListener("click", () => this._toggleMic());
        cardRight.appendChild(this._micBtn);
      }

      // ── Sequence strip ───────────────────────────────────────────────────
      this._stripEl = document.createElement("div");
      this._stripEl.className = "msd-drill__strip";
      el.appendChild(this._stripEl);
      this._buildStrip();

      // ── Feedback line ────────────────────────────────────────────────────
      this._feedbackEl = document.createElement("div");
      this._feedbackEl.className = "msd-drill__feedback";
      el.appendChild(this._feedbackEl);

      // ── Mic intonation indicator ─────────────────────────────────────────
      this._micIndicator = document.createElement("span");
      this._micIndicator.className = "msd-drill__mic-indicator";
      el.appendChild(this._micIndicator);

      // ── Fretboard ────────────────────────────────────────────────────────
      // Wrapper absorbs fret_quizzed so wrong clicks never reach the checkpoint.
      const fbWrap = document.createElement("div");
      fbWrap.addEventListener("mtheory:fret_quizzed", e => e.stopPropagation());
      el.appendChild(fbWrap);

      this._fb = new FB(fbWrap, {
        frets:    this._frets,
        fretMin:  this._fretMin,
        labels:   props.labels || "marks",
        emitDom:  true,
      });

      this._fb.onEvent = (evt) => {
        if (evt.event === "fret_quizzed") this._onClickAnswer(evt.payload);
      };

      this._ask();
    }

    // ── Orphan computation ────────────────────────────────────────────────────
    // Returns a Set of MIDI values that are scale notes in the box but fall
    // outside every complete root-to-root octave span.  These are rendered as
    // hollow dashed dots so the student can see where complete octaves end.

    _computeOrphans() {
      const roots = [...(this._midiByPc[this._rootPc] || new Set())].sort((a, b) => a - b);

      const allScaleNotes = new Set();
      this._scalePcs.forEach(p => {
        (this._midiByPc[p] || new Set()).forEach(m => allScaleNotes.add(m));
      });

      if (roots.length < 2) {
        // Only one root in the box — no complete octave is possible.
        return new Set([...allScaleNotes].filter(m => pc(m) !== this._rootPc));
      }

      // Mark every note that sits strictly inside a consecutive root pair as complete.
      const complete = new Set(roots);
      for (let i = 0; i < roots.length - 1; i++) {
        const lo = roots[i], hi = roots[i + 1];
        allScaleNotes.forEach(m => { if (m > lo && m < hi) complete.add(m); });
      }

      return new Set([...allScaleNotes].filter(m => !complete.has(m)));
    }

    // ── Finger map ────────────────────────────────────────────────────────────

    _buildFingerMap() {
      const map = {};
      // Cover all 6 strings so every visible dot gets a label.
      for (let s = 0; s < 6; s++) {
        for (let f = this._fretMin; f <= this._frets; f++) {
          const m = OPEN_MIDI[s] + f;
          map[m] = f === 0 ? "O" : Math.min(4, f - this._fretMin + 1);
        }
      }
      return map;
    }

    // ── Sequence ──────────────────────────────────────────────────────────────
    // Collects every scale note actually present in the fret window across all
    // drill strings, sorted ascending.  This covers the full 2+ octave range of
    // a CAGED box rather than the single abstract octave from rootMidi.

    _buildSequence(props) {
      const pattern  = props.pattern || "up";
      const count    = props.count != null ? props.count : 1;
      const rootMidi = this._KB.midiOfSci(props.root || "C3") || 48;
      const rootPc_  = pc(rootMidi);

      // All scale notes in the box, sorted by pitch.
      const notesSet = new Set();
      this._scalePcs.forEach(p => {
        (this._midiByPc[p] || new Set()).forEach(m => notesSet.add(m));
      });
      const allNotes = [...notesSet].sort((a, b) => a - b);

      // Start from the lowest occurrence of the root in the box so the drill
      // always opens on the tonic.  Notes below that root exist in the box but
      // are shown only as reference/orphan dots, not in the drill sequence.
      const lowestRoot = allNotes.find(m => pc(m) === rootPc_) || allNotes[0];
      const startIdx   = allNotes.indexOf(lowestRoot);
      const base       = allNotes.slice(startIdx);

      // Stash rootPc for orphan computation during the drill.
      this._rootPc = rootPc_;
      const down       = [...base].reverse();

      let seq = [];
      for (let i = 0; i < count; i++) {
        if      (pattern === "up")     seq = seq.concat(base);
        else if (pattern === "down")   seq = seq.concat(down);
        else if (pattern === "thirds") {
          // Ascending thirds: 1→3, 2→4, 3→5 … builds interval awareness.
          for (let j = 0; j < base.length - 2; j++) {
            seq.push(base[j]);
            seq.push(base[j + 2]);
          }
        }
        else /* up_down */             seq = seq.concat(base, down.slice(1));
      }
      return seq;
    }

    // ── Sequence strip (colored note chips) ───────────────────────────────────

    _buildStrip() {
      const KB = this._KB;
      this._chipEls = this._sequence.map((midi, i) => {
        const name  = KB.sciOf(midi).replace(/\d+$/, ""); // bare note name
        const style = KB.noteStyle ? KB.noteStyle(name) : null;
        const chip  = document.createElement("span");
        chip.className = "msd-chip";
        chip.textContent = name;
        if (style) {
          chip.dataset.color = style.color;
          chip.dataset.shape = style.shape;
        }
        this._stripEl.appendChild(chip);
        return chip;
      });
    }

    _updateStrip() {
      this._chipEls.forEach((chip, i) => {
        const style = chip.dataset.color ? { color: chip.dataset.color, shape: chip.dataset.shape } : null;
        chip.className = "msd-chip";
        if      (i < this._idx)  { chip.classList.add("msd-chip--past"); if (style) chip.style.background = style.color + "55"; chip.style.color = ""; chip.style.borderColor = ""; }
        else if (i === this._idx){ chip.classList.add("msd-chip--current"); if (style) { chip.style.background = style.color; chip.style.color = "#fff"; chip.style.borderColor = style.color; } }
        else                     { chip.classList.add("msd-chip--future"); chip.style.background = ""; chip.style.color = ""; chip.style.borderColor = ""; }
      });
    }

    // ── Ask (advance to next note) ────────────────────────────────────────────

    _ask() {
      const KB = this._KB;
      if (this._idx >= this._sequence.length) { this._complete(); return; }

      const midi      = this._sequence[this._idx];
      const sci       = KB.sciOf(midi);
      const name      = this._strict ? sci : sci.replace(/\d+$/, "");
      const targetPc  = pc(midi);
      const n         = this._idx + 1;
      const tot       = this._sequence.length;

      // Note card
      const style = KB.noteStyle ? KB.noteStyle(sci.replace(/\d+$/, "")) : null;
      if (style) {
        this._swatchEl.style.background  = style.color;
        this._swatchEl.style.borderRadius = style.shape === "circle" ? "50%" : "4px";
      }
      this._noteNameEl.textContent = name;
      this._subtitleEl.textContent = "note " + n + " of " + tot;
      this._progressEl.textContent = this._idx + " / " + tot + " correct";

      // Finger hint: show the expected finger for this note's canonical position
      // in the box (determined from the sequence MIDI, not pitch class).
      if (!this._blind) {
        const fl = this._fingerMap[midi];
        this._fingerEl.textContent = fl === "O" ? "open string" : (fl != null ? "finger " + fl : "");
        this._fingerEl.className = "msd-drill__finger-hint" + (fl === "O" ? " msd-fh--open" : "");
      } else {
        this._fingerEl.textContent = "";
      }

      // Strip
      this._updateStrip();

      // Clear previous feedback
      this._feedbackEl.textContent = "";
      this._feedbackEl.className   = "msd-drill__feedback";

      // Ghost scale: target brightly highlighted; other scale notes split into
      // "complete" (solid faint dots) vs "orphan" (hollow dashed dots).
      if (this._blind) {
        this._fb.setView(new Set(), new Set());
      } else {
        const orphans   = this._computeOrphans();
        const targetSet = this._midiByPc[targetPc] || new Set();
        const refSet    = new Set();
        const orphSet   = new Set();
        this._scalePcs.forEach(p => {
          if (p !== targetPc) {
            (this._midiByPc[p] || new Set()).forEach(m => {
              if (orphans.has(m)) orphSet.add(m);
              else refSet.add(m);
            });
          }
        });
        this._fb.setView(targetSet, refSet, orphSet);
      }
      this._fb.setQuiz(this._strict
        ? { targetMidi: midi }
        : { target: targetPc });

      // Play audio reference
      if (KB.pluck) KB.pluck(midi, KB.freqOf(midi));
    }

    // ── Shared advance (both input paths call this on correct answer) ──────────

    _advance() {
      const tot = this._sequence.length;
      this._el.dispatchEvent(new CustomEvent("mtheory:quiz_answered", {
        bubbles: true,
        detail:  { payload: { isCorrect: true } },
      }));
      this._fb.setQuiz(null);
      this._idx++;
      setTimeout(() => this._ask(), 450);
    }

    _complete() {
      this._stopMic();
      const tot = this._sequence.length;
      this._noteNameEl.textContent = "Done";
      this._subtitleEl.textContent = "all " + tot + " notes played";
      this._progressEl.textContent = tot + " / " + tot + " correct";
      this._fingerEl.textContent = "";
      this._updateStrip();
      this._feedbackEl.textContent  = "✓ Complete";
      this._feedbackEl.className    = "msd-drill__feedback msd-fb--correct";
      this._micIndicator.textContent = "";
      // Celebrate: show the full shape with orphans distinguished.
      const orphans  = this._computeOrphans();
      const complete = new Set();
      const orphSet  = new Set();
      this._scalePcs.forEach(p => {
        (this._midiByPc[p] || new Set()).forEach(m => {
          if (orphans.has(m)) orphSet.add(m);
          else complete.add(m);
        });
      });
      this._fb.setView(complete, new Set(), orphSet);
    }

    _showFeedback(text, cls) {
      this._feedbackEl.textContent = text;
      this._feedbackEl.className   = "msd-drill__feedback " + cls;
    }

    // ── Click input ───────────────────────────────────────────────────────────

    _onClickAnswer(payload) {
      const ok   = payload.isCorrect;
      const midi = this._sequence[this._idx];
      const KB   = this._KB;
      this._fb.flashCell(payload.string, payload.fret,
        ok ? "mf-cell--right" : "mf-cell--wrong");

      if (ok) {
        this._showFeedback("✓ Nice!", "msd-fb--correct");
        this._advance();
      } else {
        const targetName = KB.sciOf(midi).replace(/\d+$/, "");
        this._showFeedback(
          "✗ That's " + (KB.nameOf ? KB.nameOf(payload.midi) : "?") + " — find the " + targetName,
          "msd-fb--wrong"
        );
        setTimeout(() => { if (KB.pluck) KB.pluck(midi, KB.freqOf(midi)); }, 700);
      }
    }

    // ── Mic input ─────────────────────────────────────────────────────────────

    async _toggleMic() {
      if (!this._micActive) {
        this._micBtn.textContent = "Connecting…";
        this._micBtn.disabled = true;
        const ok = await global.MicBridge.start();
        this._micBtn.disabled = false;
        if (!ok) { this._micBtn.textContent = "Mic denied"; return; }
        this._micActive  = true;
        this._micHandler = (e) => this._handleMicNote(e);
        document.addEventListener("mtheory:mic_played", this._micHandler);
        this._micBtn.textContent = "Listening — stop";
        this._micBtn.classList.add("msd-drill__mic-btn--active");
      } else {
        this._stopMic();
      }
    }

    _stopMic() {
      if (!this._micActive) return;
      document.removeEventListener("mtheory:mic_played", this._micHandler);
      this._micHandler = null;
      this._micActive  = false;
      if (this._micBtn) {
        this._micBtn.textContent = "Use mic";
        this._micBtn.classList.remove("msd-drill__mic-btn--active");
      }
      this._micIndicator.textContent = "";
    }

    _handleMicNote(e) {
      if (this._idx >= this._sequence.length) return;
      const noteInfo = e.detail && e.detail.payload;
      if (!noteInfo || noteInfo.midi == null) return;

      const targetMidi  = this._sequence[this._idx];
      const targetPc_   = pc(targetMidi);
      const detectedPc_ = pc(noteInfo.midi);
      const exactMatch  = noteInfo.midi === targetMidi;
      const pcMatch     = detectedPc_ === targetPc_;
      const KB          = this._KB;

      // Intonation indicator
      const cents    = noteInfo.centsOff != null ? Math.round(noteInfo.centsOff) : 0;
      const centsStr = cents > 0 ? "+" + cents + "¢" : cents < 0 ? cents + "¢" : "in tune";
      const badge    = Math.abs(cents) <= 5  ? "msd-mic--intune"
                     : Math.abs(cents) <= 15 ? "msd-mic--close"
                     :                         "msd-mic--off";
      this._micIndicator.textContent = noteInfo.noteName + "  " + centsStr;
      this._micIndicator.className   = "msd-drill__mic-indicator " + badge;

      if (this._strict) {
        if (exactMatch) {
          this._flashMatchingCells(targetMidi, "mf-cell--right");
          this._showFeedback("✓ Nice!", "msd-fb--correct");
          global.MicBridge.reset();
          this._advance();
        } else if (pcMatch) {
          const need = KB.sciOf(targetMidi);
          this._showFeedback(
            "▲ Right note — need " + need + " (you played octave " + (Math.floor(noteInfo.midi / 12) - 1) + ")",
            "msd-fb--warn"
          );
        } else {
          const targetName = KB.sciOf(targetMidi);
          this._showFeedback(
            "✗ That's " + noteInfo.noteName + " — find the " + targetName,
            "msd-fb--wrong"
          );
          this._flashMatchingCells(targetMidi, "mf-cell--wrong");
          setTimeout(() => { if (KB.pluck) KB.pluck(targetMidi, KB.freqOf(targetMidi)); }, 700);
        }
      } else {
        // Pitch-class mode: any octave is correct
        if (pcMatch) {
          this._flashMatchingCells(targetMidi, "mf-cell--right");
          this._showFeedback("✓ Nice!", "msd-fb--correct");
          global.MicBridge.reset();
          this._advance();
        } else {
          const targetName = KB.sciOf(targetMidi).replace(/\d+$/, "");
          this._showFeedback(
            "✗ That's " + noteInfo.noteName + " — find the " + targetName,
            "msd-fb--wrong"
          );
          this._flashMatchingCells(targetMidi, "mf-cell--wrong");
          setTimeout(() => { if (KB.pluck) KB.pluck(targetMidi, KB.freqOf(targetMidi)); }, 700);
        }
      }
    }

    // Flash all visible cells on drill-path strings that match the target.
    _flashMatchingCells(targetMidi, cls) {
      const targetPc_ = pc(targetMidi);
      const cells     = this._fb.root.querySelectorAll(".mf-cell");
      for (const cell of cells) {
        const m = parseInt(cell.dataset.midi, 10);
        const matches = this._strict ? m === targetMidi : pc(m) === targetPc_;
        if (matches) {
          this._fb.flashCell(
            parseInt(cell.dataset.string, 10),
            parseInt(cell.dataset.fret, 10),
            cls
          );
          if (this._strict) break;
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────

    destroy() {
      this._stopMic();
      if (this._fb && this._fb.destroy) this._fb.destroy();
    }
  }

  global.MtheoryScaleDrill = ScaleDrill;
})(window);
