# Mtheory — Architecture & Curriculum Reference

## 1. System Overview

Mtheory is a guitar theory learning app built with **FastAPI + Jinja2** on the server and **vanilla JS** on the client. There are no frontend frameworks, no build steps, no bundlers. Every page is server-rendered HTML; all exercise logic runs entirely in the browser after the initial page load. The server is only contacted for the initial stage page and for fretboard SVG updates per question.

### Stack

| Layer | Technology |
|---|---|
| Server | Python 3.11, FastAPI 0.110+, Uvicorn |
| Templates | Jinja2 (via `fastapi.templating`) |
| Client logic | Vanilla JS — `theory.js`, `queue.js`, `render.js`, `stage.js`, `audio.js` |
| Styling | Single CSS file — `static/css/styles.css` |
| SVG | Pure Python string generation — `app/fretboard.py` |
| Audio | Web Audio API — autocorrelation pitch detection + Karplus-Strong synthesis |

### Run command

```
uvicorn main:app --reload --port 8000
```

---

## 2. Directory Structure

```
Mtheory/
├── main.py                  ← FastAPI app, all routes
├── app/
│   ├── note_system.py       ← Source of truth: colors, shapes, tuning, intervals
│   ├── curriculum.py        ← All stage/phase/module definitions
│   ├── fretboard.py         ← SVG fretboard engine
│   ├── lesson_engine.py     ← Legacy freeform trainer question generator
│   └── pitch.py             ← Server-side freq → note conversion
├── static/
│   ├── css/styles.css       ← All styles
│   └── js/
│       ├── audio.js         ← Mic input, pitch detection, Karplus-Strong playback
│       ├── theory.js        ← Music logic + task queue builder
│       ├── queue.js         ← Queue state (currentPhase, queueIdx, phaseQueue)
│       ├── render.js        ← All DOM/SVG rendering
│       └── stage.js         ← Event wiring, state transitions, boot
├── templates/
│   ├── base.html            ← HTML shell, nav, CSS/JS includes
│   ├── stage.html           ← Main learning page
│   ├── learn.html           ← Curriculum map
│   ├── primers/
│   │   ├── c_pent.html      ← Theory primer fragment (injected into overlay)
│   │   └── c_major.html
│   ├── inspect.html         ← Dev: curriculum overview table
│   ├── inspect_stage.html   ← Dev: per-stage phase detail
│   ├── fretboard.html       ← Dev: arbitrary fretboard render
│   ├── index.html           ← Landing/reference page
│   └── trainer.html         ← Legacy freeform trainer
```

---

## 3. The NOTE_SYSTEM

Defined in `app/note_system.py`. Canonical source used by both Python and JS (duplicated in `audio.js`).

### Color and Shape Map (Circle of Fifths order)

| Note | Shape | Color |
|---|---|---|
| C  | square  | `#ee0043` (red) |
| G  | circle  | `#ff3c00` (red-orange) |
| D  | square  | `#ff7b00` (orange) |
| A  | circle  | `#ffb700` (amber) |
| E  | square  | `#f7dd00` (yellow) |
| B  | circle  | `#9ad100` (lime) |
| F# | square  | `#00ba35` (green) |
| Db | circle  | `#00ad94` (teal) |
| Ab | square  | `#0099e3` (sky blue) |
| Eb | circle  | `#2b62b5` (blue) |
| Bb | square  | `#8c379d` (purple) |
| F  | circle  | `#bb0092` (magenta) |

### The Shape Law (proven universal)

- **Same shape → even semitones** apart (0, 2, 4, 6, 8, 10, 12)
- **Different shape → odd semitones** apart (1, 3, 5, 7, 9, 11)
- Every half step is a shape change (sq↔ci), no exceptions across all 144 note pairs
- To reach a same-shape note: stack whole steps only
- To reach a different-shape note: exactly one half step is built in

### Guitar Tuning

```
String 0 (low E):  E2  MIDI 40
String 1 (A):      A2  MIDI 45
String 2 (D):      D3  MIDI 50
String 3 (G):      G3  MIDI 55
String 4 (B):      B3  MIDI 59  ← M3 gap (not P4)
String 5 (high e): E4  MIDI 64
```

The G–B pair is a major 3rd (4 semitones) apart. Every other adjacent pair is a perfect 4th (5 semitones). This is the "G–B exception" called out explicitly in the interval track.

### Chromatic Scale (flat-preferred)

`C Db D Eb E F F# G Ab A Bb B`

### Enharmonic Respelling

`C#→Db, D#→Eb, E#→F, G#→Ab, A#→Bb, B#→C, Cb→B, Fb→E`

---

## 4. Routes

### Page Routes

| Path | Handler | Template | Description |
|---|---|---|---|
| `/` | `index` | `index.html` | Note color-shape reference card |
| `/fretboard` | `fretboard_page` | `fretboard.html` | Dev tool: render arbitrary notes |
| `/learn` | `learn_page` | `learn.html` | Curriculum module/stage map |
| `/learn/{stage_id}` | `stage_page` | `stage.html` | Main learning experience |
| `/primer/{stage_id}` | `primer_fragment` | — | Returns HTML fragment from `templates/primers/` |
| `/inspect` | `inspect_page` | `inspect.html` | Dev: curriculum overview |
| `/inspect/{stage_id}` | `inspect_stage_page` | `inspect_stage.html` | Dev: per-stage phase detail |
| `/trainer` | `trainer_page` | `trainer.html` | Legacy freeform trainer |

### API Routes

| Path | Method | Description |
|---|---|---|
| `/api/fretboard` | GET | Full note matrix JSON |
| `/api/fretboard/svg` | GET | SVG fretboard string — called by stage.js every question |
| `/api/pitch` | POST | `{frequency}` → note info |
| `/api/note/{name}` | GET | Color/shape metadata for a note name |
| `/api/lesson/question` | GET | Legacy trainer question |
| `/api/lesson/answer` | POST | Legacy trainer answer check |
| `/api/chord/{name}` | GET | Triad notes for a root |
| `/api/scale/{name}` | GET | Scale notes for a root |

### `/api/fretboard/svg` Parameters

| Param | Format | Description |
|---|---|---|
| `notes` | `C,D,E` | Highlighted (lit) notes |
| `root` | `C` | Root note — white-ring dim treatment |
| `pin` | `3:5,4:7` | Pinned positions (string:fret) — pulsing ring |
| `preview` | `2:0` | Upcoming note guide — amber ring |
| `shape` | `1:3,1:5` | Chord voicing outline dots |
| `alt` | `0:3` | Alt voicing positions — dashed outline |
| `ghost` | `C,D,E,G,A` | Faint scale shape hints |
| `scale_root` | `C` | Root for orphaned-ghost detection |
| `ipair` | `1:3\|2:0:2` | Interval connector lines: `si_lo:fret_lo\|si_hi:fret_hi:semis` (pipe-delimited) |
| `fret_min` | `5` | Lower bound of active fret range |
| `fret_max` | `9` | Upper bound |
| `num_frets` | `15` | Total frets drawn |
| `show_all` | `true` | Show all 12 chromatic notes at low opacity |
| `strings` | `0,1,2` | String subset to render |

---

## 5. Fretboard SVG Engine (`app/fretboard.py`)

`generate_fretboard_svg()` is a pure Python function. It builds SVG by appending strings to a list `p` and joining at the end.

### Note Rendering Priority (highest wins)

1. **Pinned** — full opacity, white pulsing ring animation
2. **Preview-out** — 60% opacity, amber dashed ring (note not in ghost set)
3. **Preview-in** — same as highlighted (note is already in ghost/highlighted set)
4. **Highlighted** — full opacity, white semi-opaque stroke
5. **Root** — 55% opacity, white ring
6. **Shape** — 80% opacity, chord voicing guide (no label)
7. **Alt** — dashed outline, no fill
8. **Ghost orphaned** — dashed outline, no fill (note below lowest root in range)
9. **Ghost** — 20% opacity, no label
10. **Dim** — 22% opacity (when `show_all=True`)

### Interval Lines (`interval_pairs`)

Each entry: `(si_lo, fret_lo, si_hi, fret_hi, semis)`.

Colors by quality:
- Minor (1, 3, 8, 10): `#ff8c20` (amber)
- Major (2, 4, 9, 11): `#b5e000` (lime)
- Perfect (5, 7, 12): `#4d9fff` (blue)
- Tritone (6): `#ff3a55` (red)

A dark pill with the interval label (m2, M2, m3, M3, P4, TT, P5, m6, M6, m7, M7, P8) is drawn at the midpoint. Lines are dashed (`stroke-dasharray="5,3"`), drawn above note markers and below pulsing rings.

### Layout Constants

```python
NUT_X        = 68     # nut x position
OPEN_NOTE_CX = 34     # x center for open-string markers
STRING_SPACING = 32   # px between strings
PADDING_TOP  = 40
PADDING_BOTTOM = 45
NOTE_RADIUS  = 13     # half-width of square / radius of circle
```

Fret positions use equal temperament: `x = NUT_X + 1400 * (1 - 2^(-fret/12))`

---

## 6. Client-Side JS Architecture

All exercise logic runs in the browser. The server sends one initial HTML page per stage; after that, only `/api/fretboard/svg` is called (once per question, to update the large fretboard).

### Script load order (in `stage.html`)

```html
<script>/* inline globals: NOTE_SYSTEM, NOTES, PHASES, ROOT_NOTE_NAME, GHOST_CSV, STAGE */</script>
<script src="theory.js?v=9"></script>
<script src="queue.js?v=2"></script>
<script src="render.js?v=26"></script>
<script src="audio.js"></script>
<script src="stage.js?v=2"></script>
```

### Global Variables (injected inline by `stage.html`)

| Variable | Type | Description |
|---|---|---|
| `NOTE_SYSTEM` | `{name: {color, shape}}` | The 12-note color/shape map |
| `NOTES` | `string[]` | Note names in the current stage |
| `ROOT_NOTE_NAME` | `string` | First note of the stage scale |
| `PHASES` | `Phase[]` | All phase dicts from curriculum.py |
| `GHOST_CSV` | `string` | Comma-sep note names for fretboard ghost hints |
| `STAGE` | `{id, title, notes, primer_url, ...}` | Full stage object |

### `theory.js` — Pure Music Logic

No DOM access. All functions are pure or read-only.

#### Note enumeration

**`getTargetsInRange(noteNames, fretMin, fretMax)`**
→ `{name, octave, midi}[]` sorted by MIDI. Deduplicates by (name, octave) — no two entries for the same pitch.

**`getPinsForTarget(name, octave, fretMin, fretMax)`**
→ `"si:fret,si:fret"` string of all fretboard positions for a specific pitch.

#### Scale helpers

**`findScaleAnchor(fMin, fMax)`**
→ `{all, sc, startIdx}`. `sc` starts at the lowest root that has a matching root an octave above. Ensures scale_up begins from a completeable octave.

**`rootToRoot(sc)`**
→ `sc` trimmed to a single root-to-root span inclusive. First root at index 0, next root at index N. Used by `scale_up`, `scale_down`, `step_intervals`.

#### Chord helpers

**`buildChordVoicings(chordPCs, strings, fretMin, fretMax)`**
→ voicing arrays. Each voicing is an array of `{si, fret, pc, toneIdx, note}`. Constraints:
- All chord tone pitch classes must appear at least once
- Non-open frets span ≤ 4 semitones (playable stretch)

**`buildTriads(scaleTargets)`** — legacy, every-other-note triads from a linear scale array

**`buildQuartalTriads(scaleTargets)`** — stacks every 3rd scale degree (quartal/quintal)

**`triadQuality(i3, i5)`** → `{symbol, full}`. Maps interval pairs to quality names:

| i3 | i5 | Symbol | Name |
|---|---|---|---|
| 4 | 7 | `` | major |
| 3 | 7 | `m` | minor |
| 3 | 6 | `°` | dim |
| 4 | 8 | `+` | aug |
| 2 | 7 | `sus2` | sus2 |
| 5 | 7 | `sus4` | sus4 |
| 5 | 10 | `(4)` | quartal |
| 7 | 14 | `(5)` | quintal |
| 4 | 9 | `add6` | pentatonic add-6 |
| 3 | 9 | `madd6` | pentatonic m add-6 |
| 5 | 9 | `(4+6)` | pentatonic fourth add-6 |

**`chordRoman(rootMidi, chordRootMidi, qualitySymbol)`** → Roman numeral string (e.g. `"V"`, `"ii"`, `"IV"`)

#### Task builders

**`buildQueueTasks(patterns, fretMin, fretMax, phase)`** → `Task[]`

The main builder. Called once per phase transition. Iterates `patterns` array and dispatches per type.

#### Task object shapes

**Note task** (kind `'note'`):
```js
{
  kind: 'note',
  currentNote: {name, octave, midi},
  segmentId: 'scale_up' | 'scale_down' | 'random',
  note: {name, octave, midi}
}
```

**Interval task** (kind `'interval'`):
```js
{
  kind: 'interval',
  currentNote: lo (stepIdx=0) or hi (stepIdx=1),
  segmentId: 'intervals' | 'step_intervals' | 'si_N_M_S',
  lo: {name, octave, midi},
  hi: {name, octave, midi},
  semis: number,          // hi.midi - lo.midi
  label: string,          // e.g. 'Major 2nd'
  stepIdx: 0 | 1,
  repIdx: number,
  totalReps: number,
  pairIdx: number,
  totalPairs: number,
  stringPairLabel?: string  // e.g. 'E–A' (string_interval only)
}
```

**Chord task** (kind `'chord'`):
```js
{
  kind: 'chord',
  currentNote: {name, octave, midi},
  segmentId: string,
  notes: [{name, octave, midi}, ...],  // all chord tones
  quality: {symbol, full},
  roman: string,
  stepIdx: 0 | 1 | 2 | 3,
  chordIdx: number,
  totalChords: number,
  style: 'chord_shape' | 'quartal' | 'arpeggio',
  // chord_shape / arpeggio only:
  voicing?: [{si, fret, pc, toneIdx, note}, ...],
  chordPCs?: number[],
  chordIntervals?: number[],
  chordName?: string,
  altPositions?: [{si, fret}, ...][]   // per-step alt positions
}
```

#### Pattern types and what they generate

| Pattern | Source | Tasks generated |
|---|---|---|
| `scale_up` | `rootToRoot(sc)` | One note task per note, root to octave root |
| `scale_down` | `rootToRoot(sc).reverse()` | One note task per note, octave root back down |
| `step_intervals` | Adjacent pairs in `rootToRoot(sc)` | 2 interval tasks (lo then hi) per adjacent pair |
| `intervals` | All pairs in `sc` with semis 1–12 | 2 × reps interval tasks per pair, sorted by lo.midi |
| `arpeggio` | `buildChordVoicings` per diatonic triad PC set | 3+ chord tasks per voicing |
| `quartal` | `buildQuartalTriads(sc)` | 3 chord tasks per triad |
| `chord_shape` | `buildChordVoicings` for phase.chord_root + intervals | 3–4 chord tasks per voicing |
| `box_chords` | `buildChordVoicings` for each chord in `phase.box_chords` | 3–4 chord tasks per voicing |
| `string_interval` | Chromatic pairs on specific string pairs | 2 interval tasks per (string pair, fret, semis) |
| `{random: N}` | N random picks from `all` (full range) | N note tasks |

### `queue.js` — State Variables

```js
let currentPhase   = 0;       // index into PHASES
let queueIdx       = 0;       // position in phaseQueue
let phaseQueue     = [];      // Task[] for the current phase
let totalCorrect   = 0;
let totalWrong     = 0;
let locked         = false;   // ignore detections briefly after answer
let waitingCorrect = false;   // wrong answer was given; must now hit correct
let prevMidi       = null;
let acceptAfter    = 0;       // timestamp after which detections are valid
let listening      = false;
```

Helper functions: `currentTask()`, `currentPatterns()`, `currentFretMin()`, `currentFretMax()`, `currentPatternLabel()`, `getSegmentInfo(idx)`, `saveStageProgress(stars)`, `loadStageProgress()`.

### `render.js` — DOM/SVG Rendering

No music logic, no state mutations.

**`renderPhaseUI()`** — Updates phase banner label, desc, pips, pattern jump buttons.

**`updateProgress()`** — Updates progress bar fill, task counter, wrong count.

**`updateHint()`** — Updates `.snc-hint` text. For note tasks: "Find C4 · frets 5–9 ↓". For interval tasks: "Major 2nd above C3 · frets 5–9 ↓". For chord tasks: shows slash name (e.g. "Cmaj/E · play E3 ↓").

**`renderQueueStrip()`** — Dispatches to `_renderNoteStrip`, `_renderIntervalStrip`, or `_renderChordStrip` based on current task kind.

**`renderTarget(task)`** — Fills the note card (`.snc-target`) with the target note chip, degree label, NNS number, and theory context box.

**`showFretboard(task)`** — Builds `/api/fretboard/svg` URL and injects the response. Per task kind:
- **Note task**: pin = current note positions. Preview = next note in same segment. ipair = line to next note if same segment and next exists.
- **Interval task (both steps)**: pin = currentNote positions. Shape = hi-note guide positions (step 0) or lo-note guide (step 1). ipair = all (lo, hi) pairs within 3-string reach.
- **Chord task**: pin = current step position. Shape = other voicing steps. Alt = alt positions.

**`renderTheoryPanel(task)`** — Updates the theory panel below the fretboard. For interval tasks: `buildShapeDiagram`. For chord tasks: `buildChordDiagram`. For note tasks: chromatic circle + CoF circle.

**`renderChromaticCircle(loNote, hiNote)`** — Draws SVG circles in `#chrom-circle` (CoF) and optionally `#chrom-clock` (chromatic clock). When two notes are given, draws the interval line between them.

**`buildShapeDiagram(semis, lo, hi, fMin, fMax, stringSubset)`** — Generates HTML `.cd-grid` with mini SVG thumbnails of every cross-string and same-string placement for an interval. Two columns: moveable / open strings. Grouped by lo-note octave. Active placement (matching current fret range and exact pitch) gets a green glow.

**`buildChordDiagram(task)`** — Same `.cd-grid` structure for chord voicings. Uses `task.voicing` signature to identify the active voicing. Degree labels (R, 3, 5, b7, etc.) shown inside each dot.

**`_intervalQualityClass(semis)`** → CSS class: `iq-minor`, `iq-major`, `iq-perfect`, `iq-tritone`.

### `stage.js` — Event Wiring and Boot

**Boot sequence:**
1. `phaseQueue = buildQueueTasks(...)` for phase 0
2. `renderPhaseUI()`, `updateProgress()`, `renderQueueStrip()`, `renderChromaticCircle(null, null)`
3. `nextNote()` — renders first target
4. If `STAGE.primer_url` set: fetches HTML fragment → injects into `#primer-body` → shows `#primer-overlay`

**`nextNote()`** — Advances `queueIdx`. If phase complete → `advancePhase()`. If all phases complete → `showCompletion()`. Re-renders everything.

**`advancePhase()`** — Increments `currentPhase`, rebuilds `phaseQueue`, shows toast, calls `nextNote()`.

**`onNoteDetected(noteInfo)`** — Called by `audio.js` on each stable detected pitch.
- If `locked` or `Date.now() < acceptAfter`: ignore
- If correct (name + octave match): `queueIdx++`, set `locked`, show ✓, call `nextNote()` after 400ms
- If wrong: `totalWrong++`, set `waitingCorrect`, show ✗ with detected note name, re-render fretboard

**`jumpToSegment(segId)`** — Jumps `queueIdx` to the first task of the target segment.

**`dismissPrimer()`** — Adds `.hidden` to `#primer-overlay`.

**`hearTarget()`** — Calls `playReferenceNote(name, octave)` from audio.js.

### `audio.js` — Pitch Detection + Synthesis

**Pitch detection:**
- `startListening(callback, deviceId)` → `Promise<boolean>`. Opens microphone, starts 30ms poll loop.
- Algorithm: autocorrelation on 2048-sample buffer.
- Guitar MIDI range: 40–88 (E2–E4+)
- Stability: same note must appear 2 consecutive frames (~60ms) before firing callback
- Callback receives: `{noteName, shape, color, midi, centsOff}`

**Karplus-Strong synthesis (`playReferenceNote(name, octave)`):**
- Computes frequency `f = 440 * 2^((midi-69)/12)`
- Buffer length `N = round(sampleRate / f)`
- Seeds delay line with averaged 3-sample noise
- Update loop: `out[i] = delay[i]; delay[i] = g * 0.5 * (out[i] + delay[next])`
- Damping `g` by register: E2 → 0.9998, A2 → 0.9996, D3 → 0.9993, others → 0.999
- 64-sample fade-in, 3.0s total duration, exponential gain ramp to silence

---

## 7. Curriculum Structure

### Module / Stage / Phase / Pattern hierarchy

```
Module (4 total)
└── Stage (19 total)
    └── Phase (3–12 per stage)
        └── Pattern list (1–6 per phase)
            └── Tasks (generated at runtime by buildQueueTasks)
```

### Modules

| ID | Title | Stages |
|---|---|---|
| `pentatonic` | Module 1: The Pentatonic Engine | c_pent, f_pent, g_pent |
| `major` | Module 2: The Major Ecosystem | c_major, f_major, g_major, c_diatonic_triads |
| `intervals` | Module 3: Interval Mastery | int_pent, int_2nds … int_octave (9 stages) |
| `harmony` | Module 4: Harmony & Chords | chord_3rds, chord_sus, chord_inv |

### Stage Object Shape

```python
{
  "id":          str,          # URL slug and localStorage key
  "title":       str,
  "subtitle":    str,
  "notes":       list[str],    # scale notes, notes[0] = root
  "phases":      list[Phase],
  "pass_score":  None,         # all stages are phase-queue based
  "requires":    list[str],    # stage IDs that must be completed first
  "unlocks":     list[str],    # stage IDs this completion unlocks
  "description": str,
  "color":       str,          # hex color of root note
  "icon":        str,          # ◼ or ● or ↕ or ⬡
  "module":      str,          # assigned by post-processing loop
  "has_challenge": bool,       # any phase has is_challenge=True
  "primer_url":  str | None,   # "/primer/c_pent" if file exists
  # optional flags:
  "interval_stage": bool,
  "chord_stage":    bool,
}
```

### Phase Object Shape

```python
{
  "label":     str,            # shown in phase banner
  "desc":      str,            # shown as phase subtitle (nav hint)
  "fret_min":  int,
  "fret_max":  int,
  "patterns":  list,           # strings or objects
  "is_challenge": bool,        # shows ⚡ badge, opt-in gate
  # interval phases only:
  "interval_semis_list": list[int],
  "string_subset":       list[int],
  # chord_shape phases only:
  "chord_root":      str,
  "chord_intervals": list[int],
  "chord_name":      str,
  "chord_desc":      str,
  # box_chords phases only:
  "box_chords": list[{chord_name, chord_root, chord_intervals, chord_desc}],
}
```

---

## 8. Stage-by-Stage Curriculum

### MODULE 1 — The Pentatonic Engine

---

#### `c_pent` — C Major Pentatonic
**Notes:** C D E G A (degrees 1 2 3 5 6)  
**Shape camps:** 1 2 3 = ◼ squares; 5 6 = ● circles  
**Primer:** `/primer/c_pent`  
**Unlocks:** f_pent, g_pent

| Phase | Frets | Desc | Patterns | Challenge |
|---|---|---|---|---|
| Open box (C-shape) | 0–4 | Find degrees 1 2 3 (◼) and 5 6 (●) in this position | scale_up, scale_down, random×3 | No |
| Mid box (A-shape) | 5–9 | Same degrees, new position. Drill intervals between the two shape camps | scale_up, scale_down, step_intervals, random×4 | No |
| Upper box (G-shape) | 9–13 | Higher register. Add chord shapes | scale_up, scale_down, step_intervals, arpeggio, random×4 | No |
| Connect open + mid | 0–9 | Cross positions freely. The shape law is your map | scale_up, scale_down, quartal, random×5 | ⚡ |
| Full neck | 0–15 | Any degree, anywhere. Squares and circles across all positions | scale_up, scale_down, quartal, random×8 | ⚡ |

**Open box scale_up sequence (root-to-root):**
C3 (A-str fret 3) → D3 (D-str open) → E3 (D-str fret 2) → G3 (G-str open) → A3 (G-str fret 2) → C4 (B-str fret 1)

**step_intervals for open box pentatonic:**

| Pair | Interval | Semis | Shape change? |
|---|---|---|---|
| C→D | M2 | 2 | No (sq→sq) |
| D→E | M2 | 2 | No (sq→sq) |
| E→G | m3 | 3 | Yes (sq→ci) |
| G→A | M2 | 2 | No (ci→ci) |
| A→C | m3 | 3 | Yes (ci→sq) |

---

#### `f_pent` — F Major Pentatonic
**Notes:** F G A C D (degrees 1 2 3 5 6)  
**Requires:** c_pent → **Unlocks:** c_major

Same 5-phase structure as c_pent. Shared notes with c_pent: C, D, A. New notes: F (●), G (●).

**step_intervals:**

| Pair | Interval | Semis |
|---|---|---|
| F→G | M2 | 2 |
| G→A | M2 | 2 |
| A→C | m3 | 3 |
| C→D | M2 | 2 |
| D→F | m3 | 3 |

---

#### `g_pent` — G Major Pentatonic
**Notes:** G A B D E (degrees 1 2 3 5 6)  
**Requires:** c_pent → **Unlocks:** c_major

Shared notes with c_pent: D, A, E. New notes: G (●), B (●).

**step_intervals:**

| Pair | Interval | Semis |
|---|---|---|
| G→A | M2 | 2 |
| A→B | M2 | 2 |
| B→D | m3 | 3 |
| D→E | M2 | 2 |
| E→G | m3 | 3 |

---

### MODULE 2 — The Major Ecosystem

---

#### `c_major` — C Major Scale
**Notes:** C D E F G A B (degrees 1–7)  
**Requires:** f_pent + g_pent → **Unlocks:** f_major, g_major  
**Primer:** `/primer/c_major`

| Phase | Frets | Desc | Patterns | Challenge |
|---|---|---|---|---|
| Open box (C-shape) | 0–4 | Find all seven degrees. Note where ◼→● shape crossings sit | scale_up, scale_down, random×4 | No |
| Mid box (A-shape) | 5–9 | Same seven degrees, moveable. Drill intervals across the shape divide | scale_up, scale_down, step_intervals, random×5 | No |
| Upper box (G-shape) | 9–13 | Higher register. Add diatonic chord shapes | scale_up, scale_down, step_intervals, arpeggio, random×5 | No |
| Connect open + mid | 0–9 | Cross between lower positions and add quartal harmony | scale_up, scale_down, quartal, random×6 | ⚡ |
| Full neck | 0–15 | Free recall — any note, anywhere | scale_up, scale_down, quartal, random×10 | ⚡ |

**step_intervals for C major (open box):**

| Pair | Degree step | Interval | Semis | Shape change? |
|---|---|---|---|---|
| C→D | 1→2 | M2 | 2 | No (sq→sq) |
| D→E | 2→3 | M2 | 2 | No (sq→sq) |
| E→F | 3→4 | m2/H | 1 | **Yes** (sq→ci) ← half step |
| F→G | 4→5 | M2 | 2 | No (ci→ci) |
| G→A | 5→6 | M2 | 2 | No (ci→ci) |
| A→B | 6→7 | M2 | 2 | No (ci→ci) |
| B→C | 7→1 | m2/H | 1 | **Yes** (ci→sq) ← half step |

---

#### `f_major` — F Major Scale
**Notes:** F G A Bb C D E  
**Requires:** c_major

One accidental from C major: B→Bb (●, purple). The Bb sits one fret below every B location.

Same 5-phase structure as c_major. step_intervals identical except A→Bb (M2) and E→F (H) replace the A→B and B→C transitions.

---

#### `g_major` — G Major Scale
**Notes:** G A B C D E F#  
**Requires:** c_major

One accidental from C major: F→F# (◼, green). The F# sits one fret above every F location.

Same 5-phase structure. step_intervals identical except F#→G (H) at degree 7→1 replaces F→G.

---

#### `c_diatonic_triads` — C Major Diatonic Triads
**Notes:** C D E F G A B  
**Requires:** c_major  
**The 7 chords:** Cmaj (I), Dm (ii), Em (iii), Fmaj (IV), Gmaj (V), Am (vi), Bdim (vii°)

| Phase | Frets | Chords | Challenge |
|---|---|---|---|
| Open box — I IV V | 0–4 | Cmaj, Fmaj, Gmaj | No |
| Open box — ii iii vi vii° | 0–4 | Dm, Em, Am, Bdim | No |
| Mid box — I IV V | 5–9 | Cmaj, Fmaj, Gmaj | ⚡ |
| Mid box — ii iii vi vii° | 5–9 | Dm, Em, Am, Bdim | ⚡ |
| Upper box — I IV V | 9–13 | Cmaj, Fmaj, Gmaj | ⚡ |
| Upper box — ii iii vi vii° | 9–13 | Dm, Em, Am, Bdim | ⚡ |
| Full neck — all 7 chords | 0–12 | All 7 | ⚡ |

Each phase uses the `box_chords` pattern which calls `buildChordVoicings` for each chord definition, constrained to the phase fret range, searching all 3-string and 4-string adjacent subsets.

**Chord definitions:**

| Roman | Chord | Root | Intervals (from root) | Notes |
|---|---|---|---|---|
| I | Cmaj | C | 0, 4, 7 | C E G |
| ii | Dm | D | 0, 3, 7 | D F A |
| iii | Em | E | 0, 3, 7 | E G B |
| IV | Fmaj | F | 0, 4, 7 | F A C |
| V | Gmaj | G | 0, 4, 7 | G B D |
| vi | Am | A | 0, 3, 7 | A C E |
| vii° | Bdim | B | 0, 3, 6 | B D F |

---

### MODULE 3 — Interval Mastery

---

#### `int_pent` — Pentatonic Intervals
**Notes:** C D E G A  
**Requires:** (none) → **Unlocks:** int_2nds

Entry point to the interval track. Uses the standard `intervals` pattern (all pairs, reps=2) rather than `string_interval`. Drills the Major 3rd (C→E, 4 semitones) and Perfect 4th (D→G, E→A, 5 semitones) that appear inside the C major pentatonic.

| Phase | Frets | Patterns |
|---|---|---|
| Open position (C-shape) | 0–4 | scale_up, intervals |
| Mid neck (A-shape) | 5–9 | scale_up, intervals |
| Upper neck (G-shape) | 9–13 | scale_up, intervals |

**All interval pairs in C major pentatonic (semis 1–12):**

| lo | hi | semis | Interval |
|---|---|---|---|
| C | D | 2 | M2 |
| C | E | 4 | M3 |
| C | G | 7 | P5 |
| C | A | 9 | M6 |
| D | E | 2 | M2 |
| D | G | 5 | P4 |
| D | A | 7 | P5 |
| E | G | 3 | m3 |
| E | A | 5 | P4 |
| G | A | 2 | M2 |

---

#### Interval Family Stages (int_2nds through int_octave)

Each family stage has **12 phases**: 5 two-string subsets → 4 three-string subsets → 3 four-string subsets. All use the `string_interval` pattern.

**String subset progression:**

| Phases | Subsets | Challenge |
|---|---|---|
| 1–5 | E–A, A–D, D–G, G–B, B–e (2 strings each) | No |
| 6–9 | E–A–D, A–D–G, D–G–B, G–B–e (3 strings each) | ⚡ |
| 10–12 | E–A–D–G, A–D–G–B, D–G–B–e (4 strings each) | ⚡ |

**`string_interval` generation:** For each (sLo, sHi) adjacent pair, each fret on sLo from fret_min to fret_max:
```
fHi = semis - openDiff + fLo
where openDiff = MIDI[sHi] - MIDI[sLo]
```

The G–B anomaly: `openDiff = 59 - 55 = 4` instead of 5. Every shape on G–B is shifted by 1 fret compared to all other adjacent pairs.

**Interval families:**

| Stage ID | Title | Semitone values |
|---|---|---|
| `int_2nds` | Seconds | 1 (m2), 2 (M2) |
| `int_3rds` | Thirds | 3 (m3), 4 (M3) |
| `int_4ths` | Fourths | 5 (P4) |
| `int_tritone` | Tritone | 6 (TT) |
| `int_5ths` | Fifths | 7 (P5) |
| `int_6ths` | Sixths | 8 (m6), 9 (M6) |
| `int_7ths` | Sevenths | 10 (m7), 11 (M7) |
| `int_octave` | Octave | 12 (P8) |

**Example — int_2nds, Phase 1 (E–A, 2-string), M2 only:**
For each fret f on low E (string 0):  
`fHi = 2 - 5 + f = f - 3`  
Valid range: fHi ≥ 0 → f ≥ 3  
Pairs: (E fret 3, A fret 0), (E fret 4, A fret 1), …, (E fret 12, A fret 9)

---

### MODULE 4 — Harmony & Chords

---

#### `chord_3rds` — Thirds / Triads
**Notes:** C D E G A (pentatonic context)  
**Requires:** int_octave → **Unlocks:** chord_sus

4 phases, one chord per phase. Each uses the `chord_shape` pattern.

| Phase | Chord | Root | Intervals | Notes |
|---|---|---|---|---|
| C major | Cmaj | C | 0, 4, 7 | C E G |
| A minor | Am | A | 0, 3, 7 | A C E |
| C major 6 | Cmaj6 | C | 0, 4, 7, 9 | C E G A |
| A minor 7 | Am7 | A | 0, 3, 7, 10 | A C E G |

---

#### `chord_sus` — Fourths / Sus Chords
**Notes:** C D E G A  
**Requires:** chord_3rds → **Unlocks:** chord_inv

| Phase | Chord | Root | Intervals | Notes |
|---|---|---|---|---|
| Csus2 | Csus2 | C | 0, 2, 7 | C D G |
| Dsus4 | Dsus4 | D | 0, 5, 7 | D G A |
| Gsus2 | Gsus2 | G | 0, 2, 7 | G A D |
| Asus4 | Asus4 | A | 0, 5, 7 | A D E |

---

#### `chord_inv` — Inversions
**Notes:** C D E G A  
**Requires:** chord_sus

| Phase | Chord | Bass | Intervals from bass | Notes |
|---|---|---|---|---|
| Cmaj / E bass (1st inv) | Cmaj/E | E | 0, 3, 8 | E G C |
| Cmaj / G bass (2nd inv) | Cmaj/G | G | 0, 5, 9 | G C E |
| Am / C bass (1st inv) | Am/C | C | 0, 4, 9 | C E A |
| Am / E bass (2nd inv) | Am/E | E | 0, 5, 8 | E A C |

---

## 9. The `/learn` Page

Template: `learn.html`. Data: `MODULES` list.

Each module section is collapsible (JS `toggleModule()`). Stage cards show:
- Lock/unlock state (from `localStorage`)
- `has_challenge` → ⚡ badge on card
- `primer_url` → "📖 Read Primer" button when unlocked
- Start button linking to `/learn/{stage_id}`

Progress stored in `localStorage` under key `mtheory_progress`. Format: `{stage_id: stars}` where stars 1–3.

---

## 10. Theory Primer System

Primer HTML files live in `templates/primers/`. They are HTML fragments (no `<html>`/`<body>` wrapper). Served by the `/primer/{stage_id}` route.

On stage boot (`stage.js`), if `STAGE.primer_url` is set, the fragment is fetched and injected into `#primer-body`. The `#primer-overlay` is shown (fixed full-screen, z-index 200).

Two buttons: "Skip" and "Begin Lesson →" both call `dismissPrimer()` which adds `.hidden`.

### Primer CSS Classes

| Class | Description |
|---|---|
| `.primer-scale-row` | Flex row of note tokens |
| `.psn-wrap` | Token + degree number stacked vertically |
| `.psn` | Note token (square by default) |
| `.psn.psn-C` … | Per-note color (full 12 note set defined) |
| `.psn.root` | White halo ring |
| `.psn.new` | Amber ring (newly introduced note) |
| `.psn.dim` | 18% opacity (chromatic non-scale note) |
| `.psn-deg` | Degree number below token |
| `.psn-step` | Step connector (W/H label) between tokens |
| `.psn-step.H` | Amber color for half-step connectors |
| `.note-ref` | Inline note chip within running text |

---

## 11. Visual Design System

Dark theme. CSS variables:

```css
--bg:       #0d0d1a
--bg-card:  #14142a
--bg-hover: #1e1e38
--fg:       #e8e8f0
--muted:    #7070a0
--accent:   #4d9fff
--success:  #00dc50
--error:    #ff3a55
--warn:     #ffb700
--border:   rgba(255,255,255,0.10)
```

Note dots use the NOTE_SYSTEM colors. Shape = square uses `border-radius: 2px`; circle uses `border-radius: 50%`.

### Interval Quality Colors (CSS classes)

| Class | Semitones | Color |
|---|---|---|
| `.iq-minor` | 1, 3, 8, 10 | `#ff8c20` (amber) |
| `.iq-major` | 2, 4, 9, 11 | `#b5e000` (lime) |
| `.iq-perfect` | 0, 5, 7, 12 | `#4d9fff` (blue) |
| `.iq-tritone` | 6 | `#ff3a55` (red) |

### Chord Diagram Layout (`.cd-grid`)

Two-column flex layout:
- **Left column** ("moveable"): voicings with no open strings, or same-string
- **Right column** ("open strings"): voicings involving open strings with large stretch

Within each column, rows group by lo-note octave (`oct.2`, `oct.3`, `oct.4`). Each cell is a `<svg class="chord-thumb">` (72px height, variable width). Active voicing gets `.chord-thumb-active` (green glow + opacity 1).

---

## 12. Unlock Graph

```
c_pent ──┬── f_pent ──┐
         └── g_pent ──┴── c_major ──┬── f_major
                                     ├── g_major
                                     └── c_diatonic_triads

(interval track)
int_pent → int_2nds → int_3rds → int_4ths → int_tritone
         → int_5ths → int_6ths → int_7ths → int_octave

(chord track, requires int_octave)
chord_3rds → chord_sus → chord_inv
```

All progress stored client-side in `localStorage`. No server-side user accounts. Stars: 3 = perfect (0 wrong), 2 = ≤3 wrong, 1 = completed with errors.

---

## 13. Known Architecture Notes

- `STAGE_ROWS` in `curriculum.py` is still present but no longer used by `learn.html` (superseded by `MODULES`). Kept for the `/inspect` dev view.
- `lesson_engine.py` and `/trainer` are a legacy path (server-side question generation). Not integrated with the phase/queue system.
- `_patch2.py` in the project root is a scratch file, not part of the application.
- The `box_chords` pattern in `theory.js` reads `phase.box_chords[]` (array of chord dicts). The `chord_shape` pattern reads `phase.chord_root` + `phase.chord_intervals` (single chord). These are two separate dispatch paths that both call `buildChordVoicings`.
- `altPositions` on chord tasks: per-step array of `{si, fret}` objects pointing to the same MIDI note in other voicings of the same pitch-class set. Used by `showFretboard` to render dashed alt-position outlines.
- Multi-note chord detection in `audio.js` (`setMultiNotePair`, `_secondPitchPresent`) is implemented but not yet wired to any stage or queue logic.
