# Mtheory — Developer Guide

A no-build-step guitar theory learning platform. Python/FastAPI backend,
vanilla JavaScript frontend, Jinja2 templates. No npm, no webpack, no transpilation.

---

## Quick Start

```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
# → http://localhost:8080
```

Cache-busting is manual: bump `?v=N` on any `<link>` or `<script>` tag you edit.

---

## Architecture in 30 Seconds

There are **two lesson systems** running side-by-side. They share the same music
data layer, audio stack, and UI components — but they handle progression and
rendering differently.

| | Phases system | Engine (DSL) system |
|---|---|---|
| **Routes** | `/learn/{stage_id}` | `/learn/x/{lesson_id}`, `/positions/…` |
| **Template** | `stage.html` | `engine.html` |
| **Data** | Python dicts → Jinja2 globals | Markdown DSL → JSON block-tree |
| **State** | `queue.js` globals | `Engine` class |
| **Status** | Stable, 19 stages | Active development |

The **Positions section** (`/positions/…`) is built entirely on the Engine system
and is the current focus of development.

---

## File Map

```
main.py                  ← FastAPI app, all HTTP routes
app/
  note_system.py         ← Single source of truth for notes: colors, shapes,
                           enharmonic spelling, standard tuning, interval colors
  fretboard.py           ← Python SVG renderer (legacy; used by stage.html API)
  lesson_dsl.py          ← Markdown DSL → JSON block-tree compiler
  positions.py           ← CAGED lesson generator (Engine format)
  curriculum/
    __init__.py          ← Public API: STAGES, MODULES, SEMESTERS, get_stage()
    stages.py            ← All 19 stage definitions
    modules.py           ← 4 module groupings
    phases.py            ← Phase factory helpers
    semesters.py         ← Semester/chapter structure

lessons/                 ← Markdown DSL lesson files (Engine system)
  01_elements_of_pitch/  ← Chapter 1
  _smoke/                ← Smoke test fixtures

templates/
  base.html              ← Shell: nav, <main>, CSS/JS slot blocks
  engine.html            ← Engine system host: loads all components, boots engine
  stage.html             ← Phases system host: injects globals, loads legacy JS
  positions.html         ← CAGED overview page (has its own inline JS)
  learn.html             ← Curriculum map (/learn)
  primers/               ← HTML fragments for pre-stage introductions

static/
  js/
    engine/
      engine.js          ← Block-tree runtime (the "OS" for Engine lessons)
      mic-bridge.js      ← audio.js callback → mtheory:mic_played DOM event
    components/          ← Self-contained UI widgets (see Component System below)
      keyboard.js
      fretboard.js
      staff.js
      scaleview.js
      scaledrill.js
      stepview.js
      chromacircle.js
      keysigview.js
      fifthscircle.js
      minorscaleview.js
      keyview.js
      quiz-mcq.js
      quiz-keysig.js
      degquiz.js
    theory.js            ← Music logic for Phases system (no DOM, pure functions)
    audio.js             ← Microphone pitch detection + Karplus-Strong synthesis
    midi.js              ← Hardware MIDI device input → DOM events
    queue.js             ← Phases system: mutable state variables
    render.js            ← Phases system: DOM rendering functions
    stage.js             ← Phases system: event wiring + boot sequence
  css/
    styles.css           ← Design tokens + global layout
    engine.css           ← Engine block and wrapper styles
    fretboard.css        ← Fretboard component
    keyboard.css         ← Keyboard component
    scaledrill.css       ← ScaleDrill component
    positions.css        ← Positions overview page
    [+ one CSS file per remaining component]
```

---

## Music Data — Single Source of Truth

**`app/note_system.py`** owns all core music data. Everything else should derive
from it.

```python
NOTE_SYSTEM       # {note_name: {shape: "circle"|"square", color: "#xxxxxx"}}
CHROMATIC         # ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"]
ENHARMONIC        # {"C#": "Db", "D#": "Eb", ...}  sharp → flat spelling
STANDARD_TUNING   # [("E",2),("A",2),("D",3),("G",3),("B",3),("E",4)] strings 0–5
INTERVAL_COLORS   # {semitones: "#color"} for interval connector lines
INTERVAL_LABELS   # {semitones: "label"} e.g. {7: "P5"}
normalize_note()  # → flat-preferred canonical spelling
get_note_info()   # → {shape, color}
note_at_semitone()# root + semis → note name
build_major_scale()
build_major_triad()
```

⚠️ **Known duplication**: pitch tables, enharmonic maps, and tuning constants are
also hardcoded in `keyboard.js`, `theory.js`, and `fretboard.js`. They are in sync
currently but must be updated in all places if the note system changes.

---

## Engine System — How Lessons Work

### The Block Format

A lesson is a JSON object with a flat array of blocks:

```json
{
  "id": "pos_C_major_E",
  "title": "C Major — E Shape",
  "blocks": [
    {"id": "b1", "type": "markdown",    "content": "## Hello\n\nLearn this shape."},
    {"id": "b2", "type": "widget",      "widget": "scaledrill", "props": {...}},
    {"id": "b3", "type": "checkpoint",  "needs": 21, "of": 21,  "on_pass": {...}},
    {"id": "b4", "type": "markdown",    "content": "Good work."},
    {"id": "b5", "type": "widget",      "widget": "scaledrill", "props": {...}},
    {"id": "b6", "type": "checkpoint",  "needs": 9,  "of": 9,   "on_pass": {"complete": true}}
  ]
}
```

### Block Types

| Type | Purpose | Key fields |
|---|---|---|
| `markdown` | Prose, headers, explanations | `content` (Markdown string) |
| `widget` | Mount a UI component | `widget` (name), `props` (object) |
| `checkpoint` | Gate progress on N correct events | `needs`, `of`, `on_pass` |
| `listen` | Wait for an event and fire an action | `waitFor`, `where` (expr), `then` (action) |
| `when` | Conditionally show a section | `flag` or `expr`, `children` |
| `button` | Clickable action | `label`, `action` |
| `callout` | Styled info box | `kind` ("info"/"key"/"warn"), `children` |
| `recall` | Quiz block | `mode`, mode-specific props |

### How `engine.js` Processes a Lesson

1. `Engine.init(lessonData, rootEl)` constructs the Engine class
2. `engine.run()` walks every block and calls `_renderBlock(block, parentEl)`
3. Each block type gets its own render path:
   - `markdown` → `marked.parse()` → innerHTML
   - `widget` → look up `REGISTRY[block.widget]` → call `mount(hostEl, props, engine)`
   - `checkpoint` → mount `<progress>` bar; listen for `mtheory:quiz_answered` events
   - `listen` → `addEventListener` on `document`; evaluate `where` expression on each fire
   - `when` → render children into a hidden div; call `_refreshWhens()` when any flag changes
4. Checkpoints count `mtheory:quiz_answered` events (emitted by widgets on correct answers)
5. When a checkpoint passes, it runs `on_pass`:
   - `set_flag: name` → sets a flag, rerenders `when` blocks
   - `persist: {key, value}` → `localStorage.setItem(key, value || "1")`
   - `complete: true` → fires `mte:complete` event

### Checkpoint → Progress Tracking Flow

```
User plays correct note
  → widget emits "mtheory:quiz_answered" (bubbling DOM event)
  → checkpoint tallies it
  → when needs == of: on_pass fires
    → persist writes to localStorage
    → positions.html reads localStorage on load → lights up tier markers
```

---

## Component System

### The Contract

Every component is a self-contained JS class that:
- Has a static `mount(hostEl, props, engine)` method that returns an instance
- Has `instance.triggerNote(midi)` for MIDI/audio routing
- Has `instance.destroy()` for cleanup
- Self-registers at the bottom of its file via `autoRegister("name", "GlobalClassName")`
- Dispatches `mtheory:note_played` (or similar) as a bubbling DOM CustomEvent

### Component Props Reference

**`scaledrill`** — Sequential scale drill on a fretboard
```
root     {string}  Tonic in sci notation e.g. "C3"
scale    {string}  "major" | "natural_minor" | "pentatonic_major" | "pentatonic_minor"
pattern  {string}  "up" | "down" | "up_down" | "thirds"
frets    {number}  Highest fret shown
fretMin  {number}  Lowest fret shown (0 = open position)
blind    {boolean} Hide all dots (recall mode)
```

**`fretboard`** — Interactive fretboard
```
frets          {number}   Highest fret (default 5)
fretMin        {number}   Lowest fret (default 0)
strings        {number[]} String indices to show (default [0,1,2,3,4,5])
labels         {string}   "marks" | "all" | "none"
labelMap       {object}   {midi: text} — overrides dot text
registerView   {boolean}  Show G→B register separator and lighter upper-register tint
audio          {boolean}  Play sound on click (default true)
emitDom        {boolean}  Fire DOM events (default true)
```

Public methods: `setView(hi, ref, orphan)`, `setMultiView(groups)`,
`setRegionsAndView(regions, hi, ref, orphan)`, `setQuiz({target})`,
`flashCell(string, fret, cssClass)`, `lingerNote(midi)`, `destroy()`

**`keyboard`** — Piano keyboard
```
octaves      {number}  Number of octaves (default 2)
startOctave  {number}  First octave (default 3)
highlight    {string}  Sci pitch to light up
labels       {string}  "naturals" | "all" | "none"
```

**`scaleview`** — Scale diagram (dots on a staff-like row)
**`chromacircle`** — Circle of Fifths
**`keysigview`** — Key signature visualization
**`stepview`** — Step-by-step scale builder
**`degquiz`** — Scale degree naming quiz
**`quiz-mcq`** — Multiple-choice quiz

### Adding a New Component

1. Create `static/js/components/mywidget.js`:
```javascript
(function (global) {
  "use strict";

  class MyWidget {
    constructor(el, props) {
      this._el = el;
      // ... build DOM ...
    }

    // Required for MIDI routing
    triggerNote(midi) { /* respond to external MIDI input */ }

    // Required for cleanup
    destroy() { this._el.innerHTML = ""; }

    // Static mount — called by engine.js
    static mount(hostEl, props, engine) {
      return new MyWidget(hostEl, props);
    }
  }

  // Self-register so engine.js can find it as :::widget mywidget
  if (global.MtheoryEngine && global.MtheoryEngine.autoRegister) {
    global.MtheoryEngine.autoRegister("mywidget", MyWidget);
  }

  global.MtheoryMyWidget = MyWidget;
})(window);
```

2. Create `static/css/mywidget.css` with BEM class prefix `myw-`.

3. Add both to `templates/engine.html`:
```html
<link rel="stylesheet" href="/static/css/mywidget.css?v=1">
<script src="/static/js/components/mywidget.js?v=1"></script>
```

4. Now any lesson can use `:::widget mywidget {prop: value}`.

---

## Positions System (CAGED Drills)

### Data Flow

```
positions.py
  KEY_GROUPS           — 3 key groups: C/Am, G/Em, F/Dm
  _C_MAJOR_BOXES       — [(shape, fret_min, fret_max), ...]  for each key
  
  get_position(group_id, scale_type, shape)
    → builds a "position record": {root_sci, fret_min, fret_max, ...}
  
  build_shape_lesson(position)
    → returns Engine JSON block-tree for one CAGED shape drill
    → blocks: intro(markdown) → up_down(scaledrill) → checkpoint
               → thirds(scaledrill) → checkpoint(guided persist)
               → blind_intro → blind_up(scaledrill) → checkpoint(blind persist)
               → [optional boundary blocks if next shape exists]
  
  build_full_neck_lesson(group_id, scale_type)
    → returns Engine JSON spanning all 5 shapes (frets 0 → max)

main.py routes:
  GET /positions                               → positions.html (overview)
  GET /positions/{group_id}/{scale_type}/{shape}   → engine.html (shape drill)
  GET /positions/{group_id}/{scale_type}/full_neck → engine.html (full neck)
```

### Progress Keys (localStorage)

```
mpos:{group_id}:{scale_type}:{shape}:guided    — completed guided tier
mpos:{group_id}:{scale_type}:{shape}:blind     — completed blind tier
mpos:{group_id}:{scale_type}:{shape}:boundary  — completed boundary drill
mpos:{group_id}:{scale_type}:full_neck:guided  — full neck guided
mpos:{group_id}:{scale_type}:full_neck:complete — full neck blind
```

These are written by Engine checkpoints via `persist` and read by `positions.html`
on page load to light up the tier markers (◉ ○ →).

### Orphan Notes

Notes in a CAGED box that fall **outside** any root-to-root octave span are
"orphans" — they exist in the scale pattern but don't form a complete octave.
`computeOrphans(notes, roots)` returns these as a Set; fretboard renders them as
hollow dashed dots (`.mf-dot--orphan`).

---

## Adding a New Page

1. **Python route** in `main.py`:
```python
@app.get("/mypage", response_class=HTMLResponse)
async def mypage(request: Request):
    return templates.TemplateResponse(request, "mypage.html", {
        "my_data": some_python_data,
    })
```

2. **Template** `templates/mypage.html`:
```html
{% extends "base.html" %}
{% block title %}Mtheory | My Page{% endblock %}

{% block head %}
  <link rel="stylesheet" href="/static/css/mypage.css?v=1">
{% endblock %}

{% block content %}
  <div class="mypage">{{ my_data }}</div>
{% endblock %}

{% block scripts %}
  <script src="/static/js/mypage.js?v=1"></script>
{% endblock %}
```

3. Add link to nav in `templates/base.html` if needed.

---

## Adding an Engine Lesson (DSL)

Create a Markdown file in `lessons/{chapter}/`:

```markdown
---
id: "1.2"
chapter: "Elements of Pitch"
title: "The Major Scale"
requires: []
grants: [major_scale_done]
---

## The Major Scale

The major scale has seven notes with a specific pattern of steps.

:::widget scaleview {root: "C", scale: "major"}
:::

Play each note on the keyboard.

:::widget keyboard {octaves: 2, startOctave: 3, highlight: "C4"}
:::

:::listen {waitFor: note_played, where: "note == C4", then: {set_flag: c_done}, blocking: true}
:::

:::when {flag: c_done}
Great! Now try D.
:::
```

The route `/learn/x/1.2` will automatically serve this lesson. The compiler
(`app/lesson_dsl.py`) scans the `lessons/` directory for a file whose frontmatter
`id` matches.

---

## Adding a Curriculum Stage (Phases System)

Edit `app/curriculum/stages.py`. Add an entry to the `STAGES` list:

```python
{
    "id": "bb_pent",
    "title": "Bb Pentatonic",
    "notes": ["Bb", "Db", "Eb", "F", "Ab"],   # notes[0] is always the root
    "requires": ["c_pent"],                    # prerequisite stage IDs
    "unlocks": [],
    "description": "The Bb pentatonic scale in open and 5th-position boxes.",
    "phases": [
        {
            "label": "Open Position",
            "desc": "Frets 1–4",
            "fret_min": 1,
            "fret_max": 4,
            "patterns": ["scale_up", "scale_down", {"random": 3}],
        },
        {
            "label": "Challenge",
            "desc": "Random notes, both positions",
            "fret_min": 1,
            "fret_max": 9,
            "patterns": [{"random": 5}],
            "is_challenge": True,
        },
    ],
}
```

Assign to a module in `app/curriculum/modules.py` by adding the id to the
appropriate `stage_ids` list.

---

## DSL Expression Language

Used in `:::listen {where: "..."}` and `:::when {expr: "..."}`:

```
note == C4          exact pitch (octave-specific)
note == C           pitch class (any octave)
note in [C, D, E]   pitch class membership
string == 4         fretboard string index
fret == 7           fret number
flag:my_flag        check a flag is set
not flag:waiting    negate
cond1 and cond2     conjunction
cond1 or cond2      disjunction
```

Context available in `where` expressions: `midi`, `pitchClass`, `noteName`,
`octave`, `scientificPitch`, `string` (fretboard only), `fret` (fretboard only).

---

## Design Tokens (CSS)

```css
--bg:         #0d0d1a    /* page background */
--bg-card:    #1a1a2e    /* card/widget background */
--fg:         #e8e8f0    /* primary text */
--muted:      #888       /* secondary text, inactive elements */
--border:     #2a2a4a    /* card borders */
--accent:     #5555ff    /* interactive highlights, active state */
--success:    #00ba35    /* correct answer, completion */
--error:      #ee0043    /* wrong answer */
--warn:       #ffb700    /* caution, adjacent info */
--radius:     8px
--radius-lg:  12px
--radius-sm:  4px
```

Component CSS files use BEM-like prefixes:
- `mf-` — fretboard (fretboard.css)
- `msd-` — scaledrill (scaledrill.css)
- `mte-` — engine blocks (engine.css)
- `pos-` — positions page (positions.css)

---

## Audio System

**`audio.js`** — microphone pitch detection + synthesis
- `startListening(callback)` → begins autocorrelation on mic stream (~30ms polling)
- `stopListening()` → release mic
- `playReferenceNote(name, octave)` → Karplus-Strong guitar synthesis
- Callback receives `{noteName, midi, centsOff, shape, color}`

**`midi.js`** — hardware MIDI input
- `MtheoryMidi.init()` → request MIDI access, auto-discover devices
- Fires `mtheory:midi_note` on `document` when a key is pressed

**`mic-bridge.js`** — bridges audio.js into the engine event system
- `MicBridge.start()` → start listening, forward detections as `mtheory:mic_played`
- `MicBridge.reset()` → 450ms cooldown after correct answer
- Used by `scaledrill.js` when the user enables mic mode

---

## Fretboard Visual System

**`fretboard.js`** renders everything as DOM (div + span, no SVG or canvas).

Note sets passed to `setView(hi, ref, orphan)`:
- `hi` (highlight) — bright solid dots, target notes
- `ref` (reference) — faint solid dots, other scale tones
- `orphan` — hollow dashed dots, notes outside a complete octave span

Region mode (`setRegionsAndView(regions, hi, ref, orphan)`):
- `regions` — `[{fmin, fmax, color}]` — colors fretboard cell backgrounds by CAGED shape zone
- Used in `positions.html` full-neck view to show which shape each fret belongs to
- `registerView: true` option adds a dashed horizontal separator at the G→B string boundary
  and lighter tinting on B/high-e strings to visualize the tuning anomaly

---

## Known Issues / Tech Debt

1. **Pitch data duplication** — `CHROMATIC`, `ENHARMONIC`, `STANDARD_TUNING` are
   hardcoded in `note_system.py`, `keyboard.js`, `theory.js`, and `fretboard.js`.
   Must be updated in all four places on any change.

2. **Two curriculum systems** — `stage.html` (phases) and `engine.html` (DSL) coexist
   with no migration plan. The phases system is stable and complete; the DSL system
   is the future.

3. **No server-side progress** — all progress lives in `localStorage`. Clearing
   browser data resets all lesson completion.

4. **No lesson validation** — malformed DSL compiles without errors. Add Pydantic
   validation to `lesson_dsl.py` to catch authoring mistakes early.

5. **Manual cache-busting** — `?v=N` query params are updated by hand. A simple
   content hash would be more reliable.
