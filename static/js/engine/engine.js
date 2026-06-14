/* engine.js — Mtheory Content Engine runtime
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 * Walks a compiled lesson block-tree (JSON produced by app/lesson_dsl.py or
 * Python lesson builders like app/positions.py), mounts UI components, tracks
 * flags, listens for component events, and reveals conditional sections when
 * their flag/expression becomes true.
 *
 * ── Block types it handles ───────────────────────────────────────────────────
 * markdown    — rendered prose (via marked.js)
 * widget      — mounts a UI component from REGISTRY; see Component Contract below
 * checkpoint  — counts mtheory:quiz_answered events; fires on_pass when needs==of
 * listen      — listens for a DOM event; evaluates a `where` expression; fires `then`
 * when        — shows/hides a section based on a flag or expression
 * button      — clickable action button
 * callout     — styled info box (kind: "info" | "key" | "warn")
 * recall      — quiz block (mode-specific)
 *
 * ── on_pass / action fields ──────────────────────────────────────────────────
 * set_flag: "name"          → set a flag, re-evaluate all when-blocks
 * persist: {key, value}     → localStorage.setItem(key, value || "1")
 * complete: true            → fire "mte:complete" on the lesson root element
 *
 * ── Component Contract ───────────────────────────────────────────────────────
 * Every component registered via autoRegister() must have:
 *
 *   static mount(hostEl, props, engine) → instance
 *     Called once when the block is rendered. Build your DOM inside hostEl.
 *     Return a component instance.
 *
 *   instance.triggerNote(midi)
 *     Called by the Engine to route MIDI/audio input to the most-visible widget.
 *     The IntersectionObserver picks the widget nearest the viewport center.
 *
 *   instance.destroy()
 *     Called when the engine is torn down. Remove listeners, release resources.
 *
 * Components emit progress via CustomEvent("mtheory:quiz_answered", {bubbles:true})
 * with detail.payload.isCorrect = true. This is what checkpoints count.
 *
 * ── Widget registry: maps widget name → {mount} ──────────────────────────────
 * Components call autoRegister("name", ClassRef) at the end of their file.
 * engine.html must <script src> the component file before engine.js runs.
 */
(function (global) {
  "use strict";

  const REGISTRY = {};

  // Lowest/highest sounding MIDI reachable on the given strings within `frets`.
  function fretSpan(strings, frets) {
    const FB = global.MtheoryFretboard;
    const ss = Array.isArray(strings) && strings.length ? strings : [0, 1, 2, 3, 4, 5];
    let lo = Infinity, hi = -Infinity;
    ss.forEach((s) => {
      lo = Math.min(lo, FB.midiAt(s, 0));
      hi = Math.max(hi, FB.midiAt(s, frets));
    });
    return { lo: lo, hi: hi };
  }

  // --- where/when expression evaluator (minimal, §2d) ----------------------
  // Supports: `and`, `or`, `not`, comparisons (==), `in [..]`, `flag:NAME`,
  // and the enharmonic `note` token. No parens (skeleton).
  function evalExpr(expr, ctx, flags) {
    if (expr == null || expr === "") return true;
    expr = String(expr).trim();

    // Split on top-level ' or ' then ' and ' (no parens in skeleton grammar).
    if (/\bor\b/.test(expr)) {
      return expr.split(/\bor\b/).some((p) => evalExpr(p, ctx, flags));
    }
    if (/\band\b/.test(expr)) {
      return expr.split(/\band\b/).every((p) => evalExpr(p, ctx, flags));
    }
    if (/^not\b/.test(expr)) {
      return !evalExpr(expr.replace(/^not\b/, ""), ctx, flags);
    }
    return evalAtom(expr.trim(), ctx, flags);
  }

  function evalAtom(atom, ctx, flags) {
    // flag:NAME
    let m = atom.match(/^flag:(\w+)$/);
    if (m) return !!flags[m[1]];

    // note in [A, B]
    m = atom.match(/^note\s+in\s+\[(.*)\]$/);
    if (m) {
      const targets = m[1].split(",").map((s) => s.trim().replace(/["']/g, ""));
      return targets.some((t) => noteEquals(t, ctx));
    }
    // note == X  (enharmonic / absolute pitch compare)
    m = atom.match(/^note\s*==\s*(.+)$/);
    if (m) return noteEquals(m[1].trim().replace(/["']/g, ""), ctx);

    // generic field == value (string|number)
    m = atom.match(/^(\w+)\s*==\s*(.+)$/);
    if (m) {
      const field = m[1];
      let val = m[2].trim().replace(/["']/g, "");
      const actual = ctx ? ctx[field] : undefined;
      if (/^-?\d+$/.test(val)) return Number(actual) === Number(val);
      return String(actual) === val;
    }

    // bare flag name
    return !!flags[atom];
  }

  function noteEquals(sci, ctx) {
    if (!ctx) return false;
    // Prefer absolute MIDI match (octave-specific, enharmonic-tolerant).
    const KB = global.MtheoryKeyboard;
    if (KB && typeof KB.midiOfSci === "function" && ctx.midi != null) {
      const target = KB.midiOfSci(sci);
      if (target != null) {
        if (/\d/.test(sci)) return target === ctx.midi; // octave specified
        return KB.pitchClassOf(target) === ctx.pitchClass; // bare name
      }
    }
    // Fallback to scientificPitch string compare.
    return ctx.scientificPitch === sci || ctx.noteName === sci;
  }

  // --- SyncGroup: bidirectional MIDI mirror between co-registered widgets ---
  function _mirrorMidi(inst, midi) {
    if (typeof inst.lingerNote === "function") {
      inst.lingerNote(midi);
    } else if (typeof inst.setHighlightMidi === "function") {
      inst.setHighlightMidi(new Set([midi]));
    } else if (typeof inst.setHighlight === "function" && global.MtheoryKeyboard) {
      inst.setHighlight(global.MtheoryKeyboard.sciOf(midi));
    }
  }

  class SyncGroup {
    constructor() { this._members = []; }
    add(el, inst) {
      const handler = (ev) => {
        const p = ev.detail && ev.detail.payload;
        if (!p || p.midi == null) return;
        const midi = p.midi;
        for (const m of this._members) {
          if (m.inst === inst) continue;
          _mirrorMidi(m.inst, midi);
        }
      };
      el.addEventListener("mtheory:note_played", handler);
      el.addEventListener("mtheory:fret_played", handler);
      this._members.push({ el, inst });
    }
  }

  // --- Engine -------------------------------------------------------------
  class Engine {
    constructor(lesson, rootEl) {
      this.lesson = lesson;
      this.root = typeof rootEl === "string"
        ? document.querySelector(rootEl) : rootEl;
      this.flags = {};
      this.listeners = [];   // active listen rules
      this.whenBlocks = [];  // { el, flag, expr }
      this.widgets = [];     // mounted widget instances
      this._midiTargets = []; // { el, inst, ratio } — candidates for MIDI focus
      this._midiObserver = null;
      this._syncGroups = {};
    }

    run() {
      this.root.innerHTML = "";
      this.root.classList.add("mte-lesson");
      (this.lesson.blocks || []).forEach((b) => this._renderBlock(b, this.root, null));
      this._refreshWhens();
      this._initMidi();
    }

    // --- MIDI routing -------------------------------------------------------
    // Uses IntersectionObserver to track which widget block is most visible.
    // Incoming midi_note events are routed to the most-visible widget's
    // triggerNote(midi) method (Keyboard, Staff, or compound wrapper).
    _initMidi() {
      if (typeof global.MtheoryMidi === "undefined") return;
      global.MtheoryMidi.init();

      if (this._midiTargets.length === 0) return;

      // Track intersection ratio for each widget host.
      this._midiObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const rec = this._midiTargets.find((t) => t.el === entry.target);
          if (rec) rec.ratio = entry.intersectionRatio;
        });
      }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] });

      this._midiTargets.forEach((t) => {
        t.ratio = 0;
        this._midiObserver.observe(t.el);
      });

      document.addEventListener("mtheory:midi_note", (ev) => {
        const midi = ev.detail && ev.detail.midi;
        if (midi == null) return;
        // Find the widget with the highest intersection ratio.
        let best = null, bestRatio = -1;
        this._midiTargets.forEach((t) => {
          if (t.ratio > bestRatio) { bestRatio = t.ratio; best = t; }
        });
        if (!best || bestRatio <= 0) return;
        const inst = best.inst;
        const target = inst;
        if (target && typeof target.triggerNote === "function") {
          target.triggerNote(midi);
        }
      });
    }

    // Register a widget element + instance as a MIDI target.
    _registerMidiTarget(el, inst) {
      this._midiTargets.push({ el: el, inst: inst, ratio: 0 });
    }

    setFlag(name, value) {
      this.flags[name] = value === undefined ? true : value;
      this._refreshWhens();
    }

    _applyThen(then) {
      if (!then) return;
      if (then.set_flag != null) {
        if (typeof then.set_flag === "object") {
          Object.keys(then.set_flag).forEach((k) => this.setFlag(k, then.set_flag[k]));
        } else {
          this.setFlag(then.set_flag, true);
        }
      }
      if (then.clear_flag != null) {
        this.flags[then.clear_flag] = false;
        this._refreshWhens();
      }
      // Persist key/value to localStorage for cross-session progress tracking.
      if (then.persist != null) {
        try {
          localStorage.setItem(
            then.persist.key,
            then.persist.value != null ? String(then.persist.value) : "1"
          );
        } catch (e) {}
      }
      if (then.complete) {
        this.root.dispatchEvent(new CustomEvent("mte:complete",
          { detail: { lesson: this.lesson.id }, bubbles: true }));
      }
    }

    _refreshWhens() {
      this.whenBlocks.forEach((w) => {
        const visible = w.expr
          ? evalExpr(w.expr, null, this.flags)
          : !!this.flags[w.flag];
        w.el.style.display = visible ? "" : "none";
      });
    }

    _renderBlock(block, parentEl, gate) {
      switch (block.type) {
        case "markdown":
          parentEl.appendChild(this._mdEl(block.content));
          break;

        case "widget": {
          const host = document.createElement("div");
          host.className = "mte-widget mte-widget--" + block.widget;
          parentEl.appendChild(host);
          const mount = REGISTRY[block.widget];
          if (mount) {
            const inst = mount(host, block.props || {}, this);
            if (inst) {
              this.widgets.push(inst);
              this._registerMidiTarget(host, inst);
              const syncName = block.props && block.props.sync;
              if (syncName) {
                if (!this._syncGroups[syncName]) this._syncGroups[syncName] = new SyncGroup();
                this._syncGroups[syncName].add(host, inst);
              }
            }
          } else {
            host.textContent = "[unknown widget: " + block.widget + "]";
          }
          break;
        }

        case "listen":
          // The gate (inherited from enclosing `when` blocks) means a listener
          // stays dormant until its branch is actually reachable — this is what
          // makes sequential gates (play C3, then C4, then C5) fire in order.
          this._registerListen(block, gate);
          break;

        case "when": {
          const wrap = document.createElement("div");
          wrap.className = "mte-when";
          wrap.style.display = "none";
          parentEl.appendChild(wrap);
          const thisGate = block.expr
            ? block.expr
            : (block.flag ? "flag:" + block.flag : null);
          const childGate = _combineGates(gate, thisGate);
          (block.children || []).forEach((c) => this._renderBlock(c, wrap, childGate));
          this.whenBlocks.push({ el: wrap, flag: block.flag, expr: block.expr });
          break;
        }

        case "callout": {
          const box = document.createElement("div");
          box.className = "mte-callout mte-callout--" + (block.kind || "info");
          parentEl.appendChild(box);
          (block.children || []).forEach((c) => this._renderBlock(c, box, gate));
          break;
        }

        case "button": {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "mte-button";
          btn.textContent = block.label || "Continue";
          btn.addEventListener("click", () => this._applyThen(block.action));
          parentEl.appendChild(btn);
          break;
        }

        case "recall":
          this._renderRecall(block, parentEl);
          break;

        case "read":
          this._renderRead(block, parentEl);
          break;

        case "checkpoint":
          this._renderCheckpoint(block, parentEl);
          break;

        default: {
          const note = document.createElement("div");
          note.className = "mte-unhandled";
          note.textContent = "[block type not yet implemented: " + block.type + "]";
          parentEl.appendChild(note);
        }
      }
    }

    _registerListen(rule, gate) {
      const eventName = "mtheory:" + rule.waitFor;
      const handler = (ev) => {
        // Dormant while the enclosing branch's gate is unmet.
        if (gate && !evalExpr(gate, null, this.flags)) return;
        const payload = ev.detail && ev.detail.payload ? ev.detail.payload : {};
        if (evalExpr(rule.where, payload, this.flags)) {
          this._applyThen(rule.then);
          if (rule.once !== false) {
            this.root.removeEventListener(eventName, handler);
          }
        }
      };
      this.root.addEventListener(eventName, handler);
      this.listeners.push({ eventName, handler });
    }

    // Parse a "C3-C5" range string into an inclusive [loMidi, hiMidi] pair.
    _parseRange(range) {
      const KB = global.MtheoryKeyboard;
      const def = [48, 72]; // C3..C5
      if (!range || !KB) return def;
      const m = String(range).split("-");
      if (m.length !== 2) return def;
      const lo = KB.midiOfSci(m[0].trim());
      const hi = KB.midiOfSci(m[1].trim());
      return (lo != null && hi != null && lo < hi) ? [lo, hi] : def;
    }

    // Recall (mode: key_to_fret): a key lights on the piano; tap the matching
    // fret on the guitar. Correctness is by pitch class (any octave counts).
    _renderRecall(block, parentEl) {
      const KB = global.MtheoryKeyboard;
      if (!KB || !global.MtheoryFretboard) {
        const e = document.createElement("div");
        e.className = "mte-unhandled";
        e.textContent = "[recall: instruments not loaded]";
        parentEl.appendChild(e);
        return;
      }
      const wrap = document.createElement("div");
      wrap.className = "mte-recall";
      parentEl.appendChild(wrap);

      const prompt = document.createElement("p");
      prompt.className = "mte-recall__prompt";
      wrap.appendChild(prompt);

      const kbHost = document.createElement("div");
      const fbHost = document.createElement("div");
      wrap.appendChild(kbHost);
      wrap.appendChild(fbHost);

      const [lo, hi] = this._parseRange(block.range);
      const frets = block.frets != null ? block.frets : 5;
      // Clamp the question range to what the fretboard can actually reach, so a
      // lit key always has a matching fret (5 frets => E2..A4).
      const span = fretSpan(block.strings, frets);
      const qLo = Math.max(lo, span.lo);
      const qHi = Math.min(hi, span.hi);
      // Note filter: `naturals` (white keys only) keeps the first crucible to
      // the alphabet the lesson taught; `all` (default) includes accidentals.
      const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
      const allowPc = (pc) =>
        block.notes === "naturals" ? NATURAL_PCS.indexOf(pc) !== -1 : true;
      const pool = [];
      for (let m = qLo; m <= qHi; m++) {
        if (allowPc(KB.pitchClassOf(m))) pool.push(m);
      }
      if (!pool.length) for (let m = qLo; m <= qHi; m++) pool.push(m);

      // `fill` mode: walk every allowed pitch in the range once, in order,
      // octave-specific, pinning each found position so the neck fills up.
      // Otherwise: a random `count`-length drill (pitch-class correctness).
      const fill = block.mode === "fill";
      let questions;
      if (fill) {
        questions = pool.slice(); // already ascending, one per allowed pitch
      } else {
        const count = block.count != null ? block.count : 10;
        questions = [];
        for (let i = 0; i < count; i++) {
          questions.push(pool[Math.floor(Math.random() * pool.length)]);
        }
      }

      const kb = new KB(kbHost, {
        low: KB.sciOf(span.lo),
        high: KB.sciOf(span.hi),
        labels: "naturals",
      });
      const fb = new global.MtheoryFretboard(fbHost, { strings: block.strings, frets: frets, labels: "marks" });

      let idx = 0;
      const ask = () => {
        if (idx >= questions.length) {
          prompt.textContent = fill ? "Neck filled — every natural placed." : "Set complete.";
          kb.setHighlight(null);
          fb.setQuiz(null);
          return;
        }
        const target = questions[idx];
        const sci = KB.sciOf(target);
        const where = fill
          ? "place " + this._chip(sci) + " in its spot"
          : "find " + this._chip(KB.nameOf(target)) + " anywhere on the neck";
        prompt.innerHTML = "Note " + (idx + 1) + " of " + questions.length + " — " + where + ".";
        kb.setHighlight(sci);
        KB.pluck(target, KB.freqOf(target));
        // Fill mode quizzes the exact pitch (octave-specific) and sticks it.
        fb.setQuiz(fill
          ? { targetMidi: target, sticky: true }
          : { target: KB.pitchClassOf(target) });
      };

      // Advance on each answer; the fret_quizzed event also bubbles to the
      // checkpoint, which tallies correctness independently.
      fb.onEvent = (evt) => {
        if (evt.event !== "fret_quizzed") return;
        const ok = evt.payload.isCorrect;
        fb.flashCell(evt.payload.string, evt.payload.fret, ok ? "mf-cell--right" : "mf-cell--wrong");
        if (ok) {
          // Disarm immediately so extra taps before the next note loads can't
          // re-fire a correct quiz event (would double-count the same answer).
          fb.setQuiz(null);
          idx++;
          setTimeout(ask, 450);
        }
      };
      ask();
      this.widgets.push(kb, fb);
      // MIDI input for recall: routes to keyboard highlight for pitch feedback.
      this._registerMidiTarget(wrap, { keyboard: kb });
    }

    // Read (staff -> keyboard): a note appears on the treble staff; name it by
    // pressing the matching key. Correctness is by pitch class (the note's
    // letter), tallied by the checkpoint via the bubbling key_quizzed event.
    _renderRead(block, parentEl) {
      const KB = global.MtheoryKeyboard;
      if (!KB || !global.MtheoryStaff) {
        const e = document.createElement("div");
        e.className = "mte-unhandled";
        e.textContent = "[read: staff/keyboard not loaded]";
        parentEl.appendChild(e);
        return;
      }
      const wrap = document.createElement("div");
      wrap.className = "mte-read";
      parentEl.appendChild(wrap);

      const prompt = document.createElement("p");
      prompt.className = "mte-read__prompt";
      wrap.appendChild(prompt);

      const stHost = document.createElement("div");
      const kbHost = document.createElement("div");
      wrap.appendChild(stHost);
      wrap.appendChild(kbHost);

      const [lo, hi] = this._parseRange(block.range);
      const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
      const allowPc = (pc) =>
        block.notes === "naturals" ? NATURAL_PCS.indexOf(pc) !== -1 : true;
      const pool = [];
      for (let m = lo; m <= hi; m++) {
        if (allowPc(KB.pitchClassOf(m))) pool.push(m);
      }
      if (!pool.length) for (let m = lo; m <= hi; m++) pool.push(m);

      const count = block.count != null ? block.count : 10;
      const questions = [];
      for (let i = 0; i < count; i++) {
        questions.push(pool[Math.floor(Math.random() * pool.length)]);
      }

      // The staff shows the prompt (no letter labels — that's the test); the
      // keyboard is the answer surface, labelled so beginners can find the key.
      // Reserve columns so the single prompt note keeps the clef at a normal
      // size (a 1-note staff stretched to full width would balloon otherwise).
      const st = new global.MtheoryStaff(stHost, {
        low: KB.sciOf(lo), high: KB.sciOf(hi),
        labels: "none", interactive: false, cols: 8,
      });
      const kb = new KB(kbHost, {
        low: KB.sciOf(lo), high: KB.sciOf(hi), labels: "naturals",
      });

      let idx = 0;
      const ask = () => {
        if (idx >= questions.length) {
          prompt.textContent = "Set complete — you read the staff.";
          kb.setQuiz(null);
          return;
        }
        const target = questions[idx];
        prompt.innerHTML = "Note " + (idx + 1) + " of " + questions.length +
          " — name the note on the staff by pressing its key.";
        st.showNote(target);
        kb.setQuiz({ target: KB.sciOf(target) });
      };

      kb.onEvent = (evt) => {
        if (evt.event !== "key_quizzed") return;
        const ok = evt.payload.isCorrect;
        st.flashNote(questions[idx], ok ? "ms-note--right" : "ms-note--wrong");
        if (ok) {
          // Disarm so extra presses before the next note can't double-count.
          kb.setQuiz(null);
          idx++;
          setTimeout(ask, 450);
        }
      };
      ask();
      this.widgets.push(st, kb);
      // MIDI input routes to the keyboard for this drill.
      this._registerMidiTarget(wrap, { keyboard: kb });
    }

    // Checkpoint: tally quiz correctness from bubbling *_quizzed events; when
    // `needs` correct answers are reached, fire on_pass (e.g. complete: true).
    _renderCheckpoint(block, parentEl) {
      const needs = block.needs != null ? block.needs : 8;
      const of = block.of != null ? block.of : 10;

      const bar = document.createElement("div");
      bar.className = "mte-checkpoint";
      parentEl.appendChild(bar);

      const tally = document.createElement("div");
      tally.className = "mte-checkpoint__tally";
      bar.appendChild(tally);

      let correct = 0, attempts = 0, done = false;
      const paint = () => {
        tally.textContent = correct + " / " + needs + " correct" +
          (attempts ? "  ·  " + attempts + " of " + of + " attempts" : "");
        bar.classList.toggle("mte-checkpoint--pass", done);
      };
      paint();

      const onQuiz = (ev) => {
        if (done) return;
        const p = ev.detail && ev.detail.payload ? ev.detail.payload : {};
        attempts++;
        if (p.isCorrect) correct++;
        paint();
        if (correct >= needs) {
          done = true;
          tally.textContent = "Passed — " + correct + " / " + needs + " correct.";
          bar.classList.add("mte-checkpoint--pass");
          this._applyThen(block.on_pass);
        }
      };
      this.root.addEventListener("mtheory:fret_quizzed",   onQuiz);
      this.root.addEventListener("mtheory:key_quizzed",    onQuiz);
      this.root.addEventListener("mtheory:quiz_answered",  onQuiz); // MCQ + future widgets
      this.listeners.push({ eventName: "mtheory:fret_quizzed",  handler: onQuiz });
      this.listeners.push({ eventName: "mtheory:key_quizzed",   handler: onQuiz });
      this.listeners.push({ eventName: "mtheory:quiz_answered", handler: onQuiz });
    }

    _chip(noteName) {
      return inlineMd("[[" + noteName + "]]");
    }

    // Minimal markdown: headings, **bold**, *italic*, pipe tables, paragraphs.
    _mdEl(text) {
      const wrap = document.createElement("div");
      wrap.className = "mte-md";
      // Split on blank lines, but treat contiguous pipe-table lines as one block.
      const blocks = [];
      let buf = [];
      (text || "").split(/\n/).forEach((line) => {
        if (line.trim() === "") {
          if (buf.length) { blocks.push(buf.join("\n")); buf = []; }
        } else {
          buf.push(line);
        }
      });
      if (buf.length) blocks.push(buf.join("\n"));

      blocks.forEach((para) => {
        para = para.trim();
        if (!para) return;
        // Pipe table: every line starts with | (or is a separator row ---)
        if (/^\|/.test(para)) {
          wrap.appendChild(this._mdTable(para));
          return;
        }
        let el;
        const h = para.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          el = document.createElement("h" + h[1].length);
          el.innerHTML = inlineMd(h[2]);
        } else {
          el = document.createElement("p");
          el.innerHTML = inlineMd(para.replace(/\n/g, " "));
        }
        wrap.appendChild(el);
      });
      return wrap;
    }

    _mdTable(text) {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const table = document.createElement("table");
      table.className = "mte-md-table";
      const parseCells = (line) =>
        line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      let inHead = true;
      lines.forEach((line) => {
        if (/^\|[-:\s|]+\|?$/.test(line)) { inHead = false; return; } // separator
        const cells = parseCells(line);
        const row = table.insertRow();
        cells.forEach((cell) => {
          const td = inHead
            ? document.createElement("th")
            : document.createElement("td");
          td.innerHTML = inlineMd(cell);
          row.appendChild(td);
        });
        if (inHead) {
          // Wrap head row in <thead>.
          const thead = document.createElement("thead");
          thead.appendChild(row);
          table.insertBefore(thead, table.firstChild);
          inHead = false;
        }
      });
      return table;
    }
  } // end class Engine

  // Combine an inherited gate with a nested one (AND). Either may be null.
  function _combineGates(outer, inner) {
    if (!outer) return inner || null;
    if (!inner) return outer;
    return outer + " and " + inner;
  }

  function inlineMd(s) {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      // [[Note]] -> colored shape chip (color/shape standard). The double
      // brackets + strict note pattern keep it from firing on ordinary prose.
      .replace(/\[\[\s*([A-Ga-g][#b]?)(-?\d+)?\s*\]\]/g, (whole, note, oct) => {
        const KB = global.MtheoryKeyboard;
        const style = KB && KB.noteStyle ? KB.noteStyle(note) : null;
        if (!style) return whole; // not a real note — leave the literal text
        const label = note[0].toUpperCase() + note.slice(1) + (oct || "");
        const fg = KB.readableText ? KB.readableText(style.color) : "#fff";
        return (
          '<span class="mte-note mte-note--' + style.shape + '"' +
          ' style="background:' + style.color + ';color:' + fg + '">' +
          label + "</span>"
        );
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  }

  const MtheoryEngine = {
    register(name, mountFn) { REGISTRY[name] = mountFn; },
    run(lesson, rootEl) {
      const eng = new Engine(lesson, rootEl);
      eng.run();
      return eng;
    },
    _eval: evalExpr,
  };
  // `init` is an alias of `run` (the server template boots via init()).
  MtheoryEngine.init = MtheoryEngine.run;

  // ---------------------------------------------------------------------------
  // Widget registration
  // ---------------------------------------------------------------------------
  function autoRegister(name, globalKey) {
    REGISTRY[name] = function (el, props) {
      var Cls = global[globalKey];
      if (!Cls) { el.textContent = "[" + globalKey + " not loaded]"; return null; }
      return new Cls(el, props || {});
    };
  }

  autoRegister("keyboard",       "MtheoryKeyboard");
  autoRegister("fretboard",      "MtheoryFretboard");
  autoRegister("staff",          "MtheoryStaff");
  // scaleview: unified scale-visualisation widget.
  //   view:"staff"    (default) — treble staff with V-bracket intervals (MtheoryScaleView)
  //   view:"keyboard"           — keyboard + SVG overlay + optional fretboard (MtheoryKeyView)
  REGISTRY["scaleview"] = function (el, props) {
    props = props || {};
    var isKb = props.view === "keyboard";
    var Cls  = isKb ? global.MtheoryKeyView : global.MtheoryScaleView;
    var key  = isKb ? "MtheoryKeyView" : "MtheoryScaleView";
    if (!Cls) { el.textContent = "[" + key + " not loaded]"; return null; }
    return new Cls(el, props);
  };
  autoRegister("chromacircle",   "MtheoryChromaCircle");
  autoRegister("stepview",       "MtheoryStepView");
  autoRegister("minorscaleview", "MtheoryMinorScaleView");
  autoRegister("keysigquiz",     "MtheoryKeysigQuiz");
  autoRegister("mcq",            "MtheoryMCQ");
  autoRegister("keysigview",     "MtheoryKeySigView");
  autoRegister("fifthscircle",   "MtheoryFifthsCircle");

  autoRegister("degquiz",        "MtheoryDegQuiz");
  autoRegister("scaledrill",     "MtheoryScaleDrill");

  global.MtheoryEngine = MtheoryEngine;
})(window);
