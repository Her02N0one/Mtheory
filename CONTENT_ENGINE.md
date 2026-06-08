# Mtheory — Component-Driven Content Engine (Design)

> Status: **proposal / design doc.** Nothing here is built yet. This document
> specifies a lesson-authoring architecture that lets non-developers write lessons
> as readable scripts, while keeping Mtheory's existing **vanilla-JS, no-build,
> server-rendered** stack. It also defines **Chapter 1 — Elements of Pitch**, which
> replaces the current Semester 1 foundations, and the **keyboard-first → keyboard +
> fretboard** progression.

---

## 0. Why this exists

Today a "lesson" is a Python `dict` in [app/curriculum.py](app/curriculum.py) with a
hardcoded `phases` array, and the page layout is fixed in
[templates/stage.html](templates/stage.html). Adding a new *kind* of lesson (e.g. a
keyboard intro, a staff-reading drill) means editing JS/HTML. That's the infodump-
then-drill rigidity we keep bumping into.

We want to **separate curriculum from code**:

- **Developers** build a fixed set of interactive widgets and a runtime.
- **Authors** write lessons as scripts that summon those widgets, gate content
  behind user actions, and flip flags — no JavaScript required.

This is a **Component-Driven Content Engine** driven by a **block DSL**. We use a
human-readable Markdown-with-directives format (not MDX) so it compiles to a plain
JSON block-tree the existing vanilla renderer can walk — **no React, no bundler.**

---

## 1. The three layers

```
┌──────────────────────────────────────────────────────────────┐
│  THE SCRIPT  (authors)                                        │
│  lessons/*.md  — Markdown prose + ::: directive blocks        │
│        │  compiled at server start / on save                  │
│        ▼                                                       │
│  THE BLOCK TREE  (data)                                       │
│  parsed JSON: ordered list of typed blocks + flag/event rules │
│        │  served to the browser                               │
│        ▼                                                       │
│  THE RUNTIME  (developers)                                    │
│  • Component Library — Keyboard, Fretboard, Companion, Recall…│
│  • State Machine — flags, events, gates, progress             │
│  • Renderer — walks blocks, mounts components, advances PC    │
└──────────────────────────────────────────────────────────────┘
```

### 1a. Component Library (the actors)

Self-contained widgets. They render, accept props, and **emit events**; they hold no
curriculum knowledge. Initial set:

| Component | Purpose | Key props | Emits |
|---|---|---|---|
| `Keyboard` | Piano UI, playable | `octaves`, `highlight`, `labels`, `range`, `quiz` | `note_played`, `key_quizzed` |
| `Fretboard` | Existing SVG engine, now a widget | `strings`, `fret_range`, `highlight`, `quiz`, `reference`, `guides` | `fret_played`, `fret_quizzed` |
| `Companion` | Wraps Keyboard +/or Fretboard, synced | `instruments`, plus pass-through | re-emits child events |
| `Recall` | Multiple-choice question | `mode`, `prompt`, `choices`, `answer` | `recall_answered` |
| `Staff` | Notated staff (later lessons) | `clef`, `notes`, `quiz` | `note_picked` |
| `Callout` | Styled prose box (info/warn/key) | `kind` | — |
| `Button` | Author-placed action button | `label`, `action` | `button_clicked` |

> The existing `generate_fretboard_svg` and the `name_fret`/`enharmonic` recall code
> become the implementations behind `Fretboard` and `Recall` — we reuse, not rewrite.

### 1b. State Machine (the director)

A small in-browser store with three responsibilities:

1. **Flags** — a key→value map (`{ c_pressed: true, fretboard_unlocked: false }`).
   Persisted per lesson alongside the existing `mtheory-progress` localStorage.
2. **Event bus** — components emit events; the machine matches them against the
   lesson's `listen` rules and fires triggers (`set_flag`, `reveal`, `goto`,
   `complete`).
3. **Program counter (PC)** — the renderer reveals blocks top-to-bottom; a `gate`
   block (or a `listen` with `blocking: true`) pauses the PC until its condition is
   met, then resumes. This is how **progressive disclosure** works.

### 1c. Renderer

Walks the block tree. For each block: render markdown, mount a component, register a
listener, or evaluate a `when` condition against current flags. Re-runs affected
blocks when a flag changes (e.g. a hidden `when` section appears).

### 1d. Event payload contract (the shared language)

Components emit events the State Machine matches against `listen`/`checkpoint` rules.
The payload must describe pitch **absolutely** so the linear keyboard and the mapped
fretboard can be linked ("C4 on piano" ↔ "B-string / 1st fret"). The contract is
pinned to the **existing** code conventions:

- **`pitchClass`** = chromatic semitone index, `midi % 12`, matching
  `CHROMATIC` / `_CHROM` (`C,Db,D,Eb,E,F,F#,G,Ab,A,Bb,B`). **C = 0, G = 7.**
  This is *not* the Circle-of-Fifths order. The CoF "wheel" position (which drives
  colour/shape via `COF_ORDER` / `NOTE_SYSTEM`: `C,G,D,A,E,B,F#,Db,Ab,Eb,Bb,F`, where
  G = 1) is a **separate, derived** value carried as `wheelIndex` only when a
  component needs colour/shape. Keep the two indices distinct.
- **`noteName`** = canonical **flat-preferred** spelling matching `NOTE_SYSTEM` keys:
  `Db, Eb, Ab, Bb` and the lone sharp `F#`. The compiler/`normalize_note` folds
  `C#→Db` etc. Enharmonic tolerance lives in the `where` comparator, *not* the
  payload (so `note == C#4` still matches a `Db4` event).
- **`octave`** = scientific register, `floor(midi/12) − 1` (C4 = MIDI 60 = middle C).
- **`midi`** = absolute MIDI number. The canonical **sync key** — `Companion` matches
  unisons by integer equality, never by parsing strings. The guitar's
  treble-8 (sounds-8vb) transposition is a **Staff-display-only** transform and is
  **never** applied to `midi`; sync is always by absolute sounding pitch.
- **`scientificPitch`** = `noteName + octave` (e.g. `"C4"`, `"Db5"`) — convenience for
  readable `where: "note == C4"` expressions.
- **`frequency`** = optional Hz (A4 = 440), for future Hz visualisations.

**`note_played`** (keyboard or fretboard interaction):

```json
{
  "event": "note_played",
  "source": "keyboard",
  "payload": {
    "midi": 60,
    "pitchClass": 0,
    "noteName": "C",
    "octave": 4,
    "scientificPitch": "C4",
    "frequency": 261.63,
    "wheelIndex": 0
  }
}
```

The `fretboard` source adds `string` and `fret` to its payload (so rules like
`where: "string == 4 and fret == 1"` work); everything else is identical, which is
what lets `Companion` relay one instrument's event to highlight the other.

**`key_quizzed` / `fret_quizzed`** (instrument acting as the test surface): reports
correctness so the machine can advance progress without knowing theory. Correctness
for naming quizzes is by **pitch class** (octave-agnostic):

```json
{
  "event": "key_quizzed",
  "source": "keyboard",
  "payload": {
    "targetPitchClass": 0,
    "selectedPitchClass": 0,
    "targetNote": "C",
    "selectedNote": "C",
    "isCorrect": true
  }
}
```

The `targetNote`/`selectedNote` names are included alongside the pitch classes purely
so `checkpoint`/`listen` rules read naturally in the DSL.

---

## 2. The DSL (the script)

### 2a. File shape

One file per lesson: `lessons/01_elements_of_pitch/01_keyboard.md`.

- **YAML frontmatter** — metadata, prerequisites, flags.
- **Body** — Markdown prose, interleaved with **container directives** delimited by
  `:::`. (This is the standard "fenced div" / remark-directive style — readable, and
  trivially parseable without a JS toolchain.)

```markdown
---
id: "1.1"
chapter: "Elements of Pitch"
title: "Keyboard & Octave Registers"
requires: []
grants: [completed_pitch_basics, fretboard_unlocked]
estimated_min: 8
---

# What is pitch?

Pitch is how high or low a note sounds. Western music organises pitch into a
repeating loop of **12 steps**. Let's see it on a keyboard first — one key, one
pitch, no ambiguity.

:::widget companion {instruments: [keyboard], octaves: 2, highlight: "C4", labels: "naturals"}
:::

Press the highlighted **C** to hear it.

:::listen {waitFor: note_played, where: "note == C4", then: {set_flag: c_pressed}, blocking: true}
:::

:::when {flag: c_pressed}
Nice — that was **C4**, "middle C". Notice the keys repeat in a 7-white / 5-black
pattern. Each repeat is one **octave register**: C4, C5, C6…

Now watch what one piano key looks like on a guitar — the same pitch lives in
several places at once.

:::widget companion {instruments: [keyboard, fretboard], highlight: "C4", sync: true}
:::

:::button {label: "Finish lesson →", action: {complete: true}}
:::
:::
```

### 2b. Directive catalogue

Every directive is `:::name {json-ish props}` … `:::`. Props use a relaxed inline
syntax (YAML-flow) for authoring comfort; the compiler normalises to strict JSON.

| Directive | Meaning | Required props |
|---|---|---|
| `:::widget <type>` | Mount a component | type + its props |
| `:::listen` | Event gate / trigger | `waitFor`, `then` (+ optional `where`, `blocking`) |
| `:::when` | Conditional content (reveals on flag) | `flag` (or `expr`) |
| `:::recall` | Quiz block | `mode` (+ mode-specific props) |
| `:::callout <kind>` | Styled prose (`info`/`key`/`warn`) | kind |
| `:::button` | Action button | `label`, `action` |
| `:::checkpoint` | Pass-gate (needs N correct) | `needs` |

**Inline directives** for prose: `:note[C4]`, `:kbd[Shift]`, `:deg[5]` render small
styled spans (note chips, key hints, scale-degree badges).

### 2c. Actions & triggers (the verbs)

Used by `listen.then`, `button.action`, `checkpoint.on_pass`:

- `set_flag: name` / `set_flag: {name: value}`
- `clear_flag: name`
- `reveal: block_id` (explicitly show a `when`-hidden block)
- `goto: block_id` (jump the PC — for branching)
- `complete: true` (mark lesson done, grant `grants` flags, unlock next)

### 2d. Conditions (the grammar)

`where` / `when.expr` accept a tiny boolean expression over flags and event payload:

```
note == C4
note in [C4, C5]
string == 0 and fret == 8
flag:fretboard_unlocked and not flag:rushed
```

Deliberately minimal — comparisons, `in`, `and/or/not`, `flag:` lookups. No
arbitrary code (safe to author, safe to evaluate). The `note` token compares against
the event's `scientificPitch`/`noteName` **enharmonically** (so `note == C#4` matches
a `Db4` payload); `string`/`fret` are available on `fretboard`-source events.

---

## 3. How it compiles (DSL → JSON block-tree)

The Markdown is parsed once (server start, or on file save) into the JSON the browser
renders. The compiler lives server-side in Python (a new `app/lesson_dsl.py`); the
browser only ever sees JSON.

The lesson above compiles to:

```json
{
  "id": "1.1",
  "chapter": "Elements of Pitch",
  "title": "Keyboard & Octave Registers",
  "requires": [],
  "grants": ["completed_pitch_basics", "fretboard_unlocked"],
  "blocks": [
    { "id": "b1", "type": "markdown",
      "content": "# What is pitch?\nPitch is how high or low…" },
    { "id": "b2", "type": "widget", "widget": "companion",
      "props": { "instruments": ["keyboard"], "octaves": 2,
                 "highlight": "C4", "labels": "naturals" } },
    { "id": "b3", "type": "markdown", "content": "Press the highlighted **C**…" },
    { "id": "b4", "type": "listen", "waitFor": "note_played",
      "where": "note == C4", "then": { "set_flag": "c_pressed" },
      "blocking": true },
    { "id": "b5", "type": "when", "flag": "c_pressed", "children": [
      { "id": "b5a", "type": "markdown", "content": "Nice — that was **C4**…" },
      { "id": "b5b", "type": "widget", "widget": "companion",
        "props": { "instruments": ["keyboard", "fretboard"],
                   "highlight": "C4", "sync": true } },
      { "id": "b5c", "type": "button", "label": "Finish lesson →",
        "action": { "complete": true } }
    ]}
  ]
}
```

The runtime reveals `b1–b3`, mounts the keyboard, then **blocks** at `b4` until the
user plays C4. The trigger sets `c_pressed`, which makes the `when` block `b5`
render — the fretboard slides in. Done.

---

## 4. Keyboard-first → dual-instrument progression

The `Companion` widget is the centrepiece of your "start on keyboard, then reveal the
fretboard" goal:

- **Keyboard only** (`instruments: [keyboard]`): early 1.x lessons. One key = one
  unambiguous pitch — ideal for teaching octave registers, the staff, and scale
  construction without the guitar's "same note in many places" complication.
- **Dual + synced** (`instruments: [keyboard, fretboard], sync: true`): once
  `fretboard_unlocked` is granted, the same pitch highlights on both. Playing/clicking
  one mirrors the other. This is where the learner sees the piano→guitar mapping.
- **Fretboard only**: later guitar-specific drills (reuses today's stage).

Unlock is a flag (`fretboard_unlocked`) granted at the end of 1.1 — so the second
instrument's first appearance is itself a progressive-disclosure beat.

The keyboard component is **new dev work** (the one genuinely new widget). It needs:
piano rendering (configurable octave range), Web-Audio playback (reuse
`audio.js` synthesis), optional key labels, highlight set, and a `quiz` mode that
greys a key and emits `key_quizzed` — the keyboard analogue of `name_fret`.

### 4a. Keyboard range, registers, and the middle-C / guitar-octave story

**Octave range (resolved decision 3).**

- **Default = 3 octaves**, opening around **C3–C5** (so middle C, **C4**, sits
  visibly in the middle). Enough to teach octave registers (C3 / C4 / C5) without a
  wall of keys. Register numbers shown as small labels under each C by default.
- The `octaves` prop scales the widget up. A later "map the whole neck" lesson opens
  to **~5 octaves (≈ E2–E6)** — the practical range of a 24-fret guitar in standard
  tuning — so every fretboard note has a parallel key directly above it in the synced
  `Companion` view.

**Standard tuning ↔ keyboard anchor points** (used to align the two instruments and
to teach where notes live):

| Guitar (open string) | Sounding pitch | Keyboard key |
|---|---|---|
| 6th (low E) | E2 | E two octaves below middle C |
| 5th (A) | A2 | A below middle C |
| 4th (D) | D3 | D below middle C |
| 3rd (G) | G3 | G below middle C |
| 2nd (B) | B3 | B just below middle C |
| 1st (high E) | E4 | E above middle C |
| 1st string, fret 1 | F4 | **first key above middle C** |

So **middle C (C4)** itself is *not* an open string — it's the **B string, fret 1**
(or the A string, fret 3). Pointing at "the same C" on both instruments is the core
visual of lesson 1.2.

**The guitar octave-transposition quirk (resolved decision 4).** Guitar music is
written in **treble clef**, but the guitar *sounds one octave lower than written* —
conventionally shown by a small **8 under the treble clef** (treble-8 / "vocal tenor"
clef). The `Staff` + `Companion` pairing must make this explicit so a learner reading
"middle C on the staff" understands it maps to the C4 *key* on the piano, and to the
B-string/1st-fret position on the guitar — and why the printed guitar note looks an
octave higher than where it actually sounds. This is the single most common point of
confusion when moving between staff, keyboard, and fretboard, so 1.2 teaches it
head-on rather than hiding it.

---

## 5. Chapter 1 — Elements of Pitch (replaces Semester 1 foundations)

Lesson list (your spec), with the instrument each leans on and the new component(s)
it needs. "Reuse" = already exists behind a widget wrapper.

| # | Lesson | Instrument(s) | Core widgets | New build? |
|---|---|---|---|---|
| 1.1 | Keyboard & Octave Registers | keyboard → +fretboard | Keyboard, Companion | **Keyboard** |
| 1.2 | Notation on the Staff (+ middle C across instruments) | treble staff + keyboard + fretboard | Staff, Companion | **Staff** |
| 1.3 | The Major Scale | keyboard + fretboard | Companion, Recall | reuse |
| 1.4 | Major Key Signatures | keyboard + staff | Staff, Keyboard, Recall | reuse + Staff |
| 1.5 | Minor Scales | keyboard + fretboard | Companion, Recall | reuse |
| 1.6 | Minor Key Signatures | keyboard + staff | Staff, Recall | reuse |
| 1.7 | Scale-Degree Names | keyboard/fretboard | Companion, Recall (`:deg`) | reuse |
| 1.8 | Intervals | keyboard + fretboard | Companion, Recall | reuse (interval drill exists) |
| 1.9 | Perfect, Major & Minor Intervals | dual | Companion, Recall | reuse |
| 1.10 | Augmented & Diminished Intervals | dual | Companion, Recall | reuse |
| 1.11 | Inversions of Intervals | dual | Companion, Recall | reuse |
| 1.12 | Consonant & Dissonant Intervals | keyboard (+ audio) | Keyboard, Recall | reuse |
| 1.13 | Summary / Checkpoint | dual | Companion, Checkpoint | reuse |

Notes:
- The chapter is **keyboard-anchored**: scales/keys/intervals are far clearer on a
  linear keyboard than on a 6-string grid. The fretboard appears as the "now apply it
  to your instrument" half.
- Each lesson is a single DSL file; the chapter is a folder. A `chapter.yml` lists
  order + unlock graph (replaces the hardcoded `SEMESTERS` slice for Semester 1).
- Existing guitar stages (pentatonics, CAGED, etc.) stay as-is for now; only the
  Semester 1 foundations are superseded.

---

## 6. A second sample — 1.3 The Major Scale (dual, with a quiz gate)

Shows reuse of `Recall` + a `checkpoint` pass-gate + synced instruments.

```markdown
---
id: "1.3"
chapter: "Elements of Pitch"
title: "The Major Scale"
requires: [completed_pitch_basics]
grants: [knows_major_scale]
---

# Seven notes from a recipe

A **major scale** picks 7 of the 12 pitches using one fixed recipe of steps:

:::callout key
**W – W – H – W – W – W – H**  (W = whole step, H = half step)
:::

Start on **C** and follow the recipe — you only ever land on white keys.

:::widget companion {instruments: [keyboard], highlight_scale: "C_major", labels: "degrees"}
:::

Play the scale up from :note[C4] to :note[C5].

:::listen {waitFor: scale_completed, where: "scale == C_major", then: {set_flag: played_c_major}}
:::

:::when {flag: played_c_major}
Now the **same recipe** on your guitar. The shape is identical no matter where it
starts — that's why one pattern gives you all 12 keys.

:::widget companion {instruments: [keyboard, fretboard], highlight_scale: "C_major", sync: true}
:::

## Check yourself

:::recall {mode: name_fret, note_filter: scale, scale: "C_major", strings: [0,1,2], count: 8}
:::

:::checkpoint {needs: 6, of: 8, on_pass: {complete: true}}
:::
:::
```

---

## 7. Migration plan (incremental, no big-bang)

The current `phases` engine and the new block engine can coexist; we move lessons
over one at a time.

1. **Add the compiler + runtime alongside the old stage.** New route
   `/learn/x/{lesson_id}` renders block-DSL lessons; `/learn/{stage_id}` keeps serving
   `phases`-based stages untouched.
2. **Wrap existing pieces as components.** `Fretboard` = thin wrapper over
   `generate_fretboard_svg`; `Recall` = existing `name_fret`/`enharmonic` logic.
   No behaviour change — just a uniform `{render, on_event}` interface.
3. **Build the `Keyboard` component** (the only net-new widget for 1.1) + `Staff`
   (for 1.2/1.4/1.6).
4. **Author Chapter 1 in the DSL**, lesson by lesson, starting with 1.1.
5. **Re-point the Semester 1 slot** in the learn map to the new chapter; retire the
   old foundation stages once 1.1–1.13 exist.
6. **Optional later:** express the current `phases` stages as compiled block-trees so
   there's a single runtime. Not required to start.

### What developers build once

- `app/lesson_dsl.py` — Markdown+directive → JSON compiler (Python, server-side).
- `static/js/engine/` — block renderer, state machine (flags/events/PC), component
  registry.
- Components: `Keyboard`, `Staff`, and wrappers for `Fretboard`/`Recall`/`Companion`.
- `lessons/` directory + `chapter.yml` loader.

### What authors do forever after

- Write `lessons/**/*.md` in the DSL. No code. New lesson = new file.

---

## 8. Open decisions

### Resolved
3. **Keyboard scope** — ✅ **Start at 3 octaves** for 1.1 (enough to show octave
   registers without crowding). The widget's `octaves` prop is configurable so a
   later lesson can open to **~5 octaves** to cover most of the guitar's pitch range
   and line the keyboard up against its parallel notes on the fretboard. See §4 for
   the range/register details.
4. **Staff depth** — ✅ **Treble clef only** to start (single staff, ledger lines +
   accidentals as needed). The crucial teaching point baked into the `Staff`/
   `Companion` pairing: make it explicit **where middle C (C4) sits** — one ledger
   line below the treble staff — **and where that same C lives on the guitar**, plus
   the **guitar's octave-transposition quirk** (guitar music is written in treble
   clef but *sounds an octave lower than notated*). See §4a.

### Still open (have a recommended default — not blocking)
1. **Prop syntax in directives** — relaxed YAML-flow (`{instruments: [keyboard]}`,
   shown above) vs strict JSON. YAML-flow is friendlier to authors; recommend it.
2. **Where lessons live** — flat files in `lessons/` (git-authored) vs a DB table.
   Files first (simplest, diff-able); a DB/admin UI can come later since the compiled
   form is already JSON.
5. **Audio** — reuse `audio.js` Karplus-Strong for keyboard playback (fast) vs a
   sampled piano (nicer, heavier). Recommend reuse first.

With 3 and 4 settled, I can start the compiler + runtime skeleton and the `Keyboard`
component (3-octave default, 5-octave-capable), then author 1.1. Items 1, 2, 5 can
ride on their recommended defaults unless you say otherwise.
