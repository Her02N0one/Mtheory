# Mtheory — Master Reference

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Note system](#2-note-system)
3. [Guitar model](#3-guitar-model)
4. [Pages & routes](#4-pages--routes)
5. [Curriculum structure](#5-curriculum-structure)
6. [Lesson plans — all stages](#6-lesson-plans--all-stages)
7. [Task types & queue logic](#7-task-types--queue-logic)
8. [Rendering pipeline](#8-rendering-pipeline)
9. [Audio detection](#9-audio-detection)
10. [Fretboard SVG](#10-fretboard-svg)
11. [Progress & persistence](#11-progress--persistence)
12. [What is working well](#12-what-is-working-well)
13. [Points of contention](#13-points-of-contention)
14. [What is not yet built](#14-what-is-not-yet-built)
15. [Possible additions](#15-possible-additions)

---

## 1. Architecture overview

| Layer | Technology | Role |
|---|---|---|
| Server | FastAPI (Python) + Uvicorn | Serves HTML pages, static files, SVG API |
| Templating | Jinja2 | `base.html` → extended by each page template |
| Styling | Single `styles.css` (v19) | All layout and component CSS |
| Music theory | `theory.js` (v6) | Pure logic — note math, voicing enumeration, queue building |
| Phase state | `queue.js` (v2) | Mutable phase/queue state, localStorage persistence |
| Rendering | `render.js` (v19) | All DOM/SVG — no music logic, no state mutations |
| Stage wiring | `stage.js` (v2) | Event handlers, boot sequence, answer detection |
| Audio | `audio.js` | Web Audio API pitch detection, `startListening` / `stopListening` |
| Fretboard | `app/fretboard.py` | SVG generation — strings, frets, note markers, pins |
| Curriculum | `app/curriculum.py` | Stage definitions, phase templates, unlock DAG |

No database. All user state lives in `localStorage` under key `mtheory-progress`.

---

## 2. Note system

12 notes with a fixed color and shape each (the `NOTE_SYSTEM` object):

| Note | Shape | Color |
|---|---|---|
| C | square | `#ee0043` |
| G | circle | `#ff3c00` |
| D | square | `#ff7b00` |
| A | circle | `#ffb700` |
| E | square | `#f7dd00` |
| B | circle | `#9ad100` |
| F# | square | `#00ba35` |
| Db | circle | `#00ad94` |
| Ab | square | `#0099e3` |
| Eb | circle | `#2b62b5` |
| Bb | square | `#8c379d` |
| F | circle | `#bb0092` |

Shape rule: **square = natural note with a flat neighbor above** (C, D, E, F#, Ab, Bb);
**circle = all others**. The shape drives dot rendering everywhere — fretboard, diagrams, pills, note card.

Interval quality colors used in UI labels and SVG connectors:

| Quality | Color |
|---|---|
| Perfect / unison / octave | `#4d9fff` |
| Major | `#b5e000` |
| Minor | `#ff8c20` |
| Tritone | `#ff3a55` |

---

## 3. Guitar model

Standard tuning: `E2 A2 D3 G3 B3 E4` → MIDI `[40, 45, 50, 55, 59, 64]`.

String indices: 0 = E2 (lowest/thickest), 5 = E4 (highest/thinnest).

**G–B anomaly**: strings 3→4 are a Major 3rd apart (4 semitones), not a Perfect 4th (5 semitones) like all other adjacent pairs. This shifts every interval shape on G–B by one fret. The code handles it automatically (no special-casing needed in voicing math, but the UI notes it explicitly in the intervals desc panel).

`buildChordVoicings(chordPCs, strings, fretMin, fretMax)`:
- Enumerates all combinations of chord tone placements on a given set of string indices.
- Constrains non-open span to ≤ 4 frets (one hand width).
- Returns raw `[{si, fret, pc, toneIdx, note}]` arrays.

`getPinsForTarget(name, octave, fretMin, fretMax)`:
- Returns `"s:f,s:f,…"` for every fretboard position matching the given note+octave within the fret window.

---

## 4. Pages & routes

| URL | Template | Description |
|---|---|---|
| `/` | `index.html` | Landing page — note color/shape reference grid |
| `/fretboard` | `fretboard.html` | Dev tool — render arbitrary note sets on the fretboard |
| `/learn` | `learn.html` | Curriculum map — stage cards, unlock state, progress bars |
| `/learn/<stage_id>` | `stage.html` | Main learning experience — all logic runs client-side |
| `/inspect` | `inspect.html` | Curriculum inspector — table of all stages grouped by track |
| `/inspect/<stage_id>` | `inspect_stage.html` | Per-stage drill-down — all phases with full data |
| `/trainer` | `trainer.html` | Freeform quiz — server-side question generation |
| `/api/fretboard/svg` | — | Returns `{"svg": "..."}` for the fretboard SVG |
| `/api/note/<name>` | — | Returns color/shape for a note name |
| `/api/lesson/question` | — | Returns a random trainer question |
| `/api/lesson/answer` | — | Validates a trainer answer |
| `/api/chord/<name>` | — | Returns notes of a major/minor triad |
| `/api/scale/<name>` | — | Returns notes of a major/minor scale |

### `/api/fretboard/svg` query parameters

| Param | Type | Description |
|---|---|---|
| `pin` | `s:f,…` | Active note positions — bright dot + white stroke + pulsing ring |
| `shape` | `s:f,…` | Chord voicing guide dots — 80% opacity, colored fill, no label |
| `preview` | `s:f,…` | Next note preview — amber dim treatment |
| `alt` | `s:f,…` | Alternate string positions — dashed colored outline |
| `ghost` | note names | Scale shape hints — faint outlines |
| `scale_root` | name | Root for orphaned-ghost detection |
| `fret_min/fret_max` | int | Active marker range |
| `strings` | `0,1,2,…` | Restrict to a string subset |
| `show_all` | bool | Show all 12 notes at very low opacity |

---

## 5. Curriculum structure

Three tracks, linear within each track, DAG across tracks:

```
SCALE TRACK
  c_pent  ──► f_pent ──┐
          └──► g_pent ──┴──► c_major ──► f_major
                                     └──► g_major

INTERVAL TRACK
  int_pent ──► int_2nds ──► int_3rds ──► int_4ths ──► int_tritone
           ──► int_5ths ──► int_6ths ──► int_7ths ──► int_octave

CHORD TRACK
  chord_3rds ──► chord_sus ──► chord_inv
```

`chord_3rds` requires `int_octave`. `int_pent` requires nothing (entry point of interval track). `c_pent` requires nothing (entry point of scale track).

Total: **20 stages**, **~120 phases**, 3 tracks.

---

## 6. Lesson plans — all stages

### How pattern types work mechanically

Before listing every stage, here is exactly what each exercise pattern does to the student — what they see, hear, and play.

---

#### `scale_up`

**What it is:** Play every note of the scale in the current fret window, from the lowest-pitched instance to the highest, one note at a time in strict ascending MIDI order.

**Scale anchor:** The builder finds the lowest root note that has another root an octave above it within the fret range. This guarantees the range is musically "complete" — the scale starts and ends on the root. Notes below that anchor (open strings of lower notes that exist in the range) are omitted. Notes at and above the anchor are included, up to and including the top root.

**Example — C Pentatonic, frets 0–4:**
Scale anchor is C2 on string 5 fret 3 (the lowest C that has a C3 above it in range). The `sc` array ascending from that point:
`C2 → D2 → E2 → G2 → A2 → C3 → D3 → E3 → G3 → A3`
(exact notes depend on which fret positions fall within 0–4 on each string)

**Student sees:** Note card with the next note name + octave (e.g. "G3"), hint "Find G3 · open position (frets 0–3) ↓", fretboard with that note pinned and ghost scale shape shown.

**Student plays:** The exact note+octave shown. Detection is octave-strict — playing G2 when G3 is shown is counted as wrong.

**Task count:** Equal to the number of unique note+octave instances in `sc`. For C Pentatonic in frets 0–4 this is typically 9–10 tasks.

---

#### `scale_down`

**What it is:** Play the scale in reverse — from the highest root back down to fret 0, including notes below the anchor that were excluded from scale_up.

**Direction difference:** `scale_down` uses the full `all` array (not just `sc`), sliced from the beginning up to the top root, then reversed. This means it reaches lower than `scale_up` — it can include open strings below the anchor. On a real guitar this is how you'd naturally descend: all the way to the lowest note in range.

**Example — C Pentatonic, frets 0–4:**
Descends from e.g. A3 (highest in range) back down through G3, E3, D3, C3, A2, G2, E2, D2, C2, then continues to A1, G1 (open strings that fall below the anchor but within fret range 0–4).

**Task count:** Typically 2–4 more tasks than scale_up because of the sub-anchor notes.

---

#### `intervals`

**What it is:** Drill every possible interval pair within the current scale window, each pair played twice in succession (lo→hi, lo→hi). The student plays both notes of each pair in order.

**Pair enumeration:** All pairs `(sc[i], sc[j])` where `j > i` and `sc[j].midi - sc[i].midi` is between 1 and 12 semitones. Sorted first by `sc[i].midi` (lo note), then by `sc[j].midi` (hi note) — so all intervals from C are grouped together before all intervals from D, etc.

**Default reps: 2.** So each pair appears as: lo→hi, lo→hi.

**What the student sees on step 0 (lo note):** Note card shows the lo note + octave. Theory panel shows both notes as chips (lo bright, hi dim) with interval name badge (e.g. "Major 3rd"). Shape diagram shows all cross-string placements of this interval on the mini fretboard.

**What the student sees on step 1 (hi note):** Same pair, hi note now bright, lo note dim. Hint shows "Major 3rd above C3 · open position ↓". The fretboard pins the hi note position, previews the next lo note.

**Example — C Pentatonic, frets 0–4, some pairs:**
- C2→D2 (M2), C2→E2 (M3), C2→G2 (P5), C2→A2 (M6), C2→C3 (P8)
- D2→E2 (M2), D2→G2 (P4), D2→A2 (P5), D2→D3 (P8)
- E2→G2 (m3), E2→A2 (P4), E2→E3 (P8)
- ... and so on up through all pairs in the window

**Task count (pentatonic, open box):** Roughly 25–35 pairs × 2 notes × 2 reps = ~100–140 tasks. This is the longest single pattern in any phase.

---

#### `arpeggio`

**What it is:** Play diatonic triads — every three-note chord built by stacking every-other scale degree — as an ascending arpeggio (root → 3rd → 5th).

**How triads are built (`buildTriads`):** Takes the `sc` array and for each index `i` where `i+4 < sc.length`, creates a triad of `[sc[i], sc[i+2], sc[i+4]]`. These are the notes 0, 2, and 4 positions ahead in the scale — i.e. the 1st, 3rd, and 5th scale degrees counting from each starting note.

**Important: these are scale-position triads, not chord voicings.** The three notes are the next available scale notes above the root in MIDI order, regardless of which strings they land on. The student may need to change positions to find all three notes.

**Example — C Pentatonic, frets 0–4:**
- `sc[0]→sc[2]→sc[4]`: C2→E2→G2 → Cmaj (M3 + m3) → Roman: I
- `sc[1]→sc[3]→sc[5]`: D2→G2→A2 → Gsus2-ish (P4 + M2) → Roman: V(sus2)
- `sc[2]→sc[4]→sc[6]`: E2→G2→C3 → Am (m3 + P4) → Roman: vi
- `sc[3]→sc[5]→sc[7]`: G2→A2→D3 → Dsus2-ish → Roman: II(sus2)
- `sc[4]→sc[6]→sc[8]`: A2→C3→E3 → Am → Roman: vi
- ... continues for all valid starting positions in the window

**Quality recognition:** Each triad's quality is computed by `triadQuality(i3, i5)` — the semitone gap between root→3rd and root→5th. Pentatonic triads produce `major`, `minor`, `sus2`, and quartal shapes because the pentatonic scale has no half-steps.

**Roman numeral:** Each chord gets a Roman numeral relative to the stage root (e.g. I, ii, iii, IV, V, vi, vii°). Shown in the theory panel and queue strip.

**Task count:** Roughly `(sc.length - 4)` triads × 3 steps. For pentatonic open box: ~6–8 triads × 3 = 18–24 tasks.

---

#### `quartal`

**What it is:** Same structure as `arpeggio` but uses `buildQuartalTriads` — which stacks every **third** scale degree instead of every second.

**How quartal triads are built:** `[sc[i], sc[i+3], sc[i+6]]` — the 1st, 4th, and 7th scale degrees counting from each starting note.

**The resulting intervals:** Skipping 3 positions in a 5-note pentatonic means each voice is approximately a Perfect 4th (5 semitones) or Perfect 5th (7 semitones) apart. These are "quartal/quintal" sonorities — open, ambiguous, modern sounding. Used extensively in jazz and rock.

**Example — C Pentatonic:**
- C2→G2→D3: stacks P5 + P5 (actually quintal but same voicings inverted)
- D2→A2→E3: P5 + P5
- E2→C3→G3: m6 + P5 (slightly different due to pentatonic gaps)

**Why quartal is omitted in upper box (G-shape):** The upper box is narrower — fewer notes fit in frets 9–13 — so quartal triads often don't have enough room to form without going beyond the fret window. The comment in curriculum.py notes this explicitly.

**Task count:** Similar to `arpeggio` but usually fewer triads because `i+6 < sc.length` is a harder constraint. Typically 3–5 triads × 3 = 9–15 tasks.

---

#### `random`

**What it is:** N freely chosen notes from the entire `all` array — every note+octave instance within the fret range, not just the scale-anchor subset. Completely random each time the phase starts (not reproducible).

**Purpose:** Free recall under unpredictable conditions. The student can't anticipate the next note, so they must know the whole shape. This pattern appears in consolidation phases (Connect open+mid, Full neck) to test that positional muscle memory has generalized.

**Note pool difference from scale_up:** `all` vs `sc`. `all` includes notes below the anchor root — e.g. in open position it includes the very low open strings. `sc` starts from the anchor. So `random` can ask for notes that `scale_up` never explicitly drilled.

**Task count:** Explicitly specified in each phase dict: ×4 in pentatonic boxes, ×5 in major boxes, ×6/8/10 in connection/full-neck phases.

---

#### `string_interval`

**What it is:** Chromatic interval drill on a specific pair of adjacent strings. The student plays every occurrence of a given interval (e.g. minor 3rd) on those two strings, sweeping from fret 0 to fret 12 on the lower string.

**What "sweeping" means:** For string pair (E, A) and interval m3 (3 semitones):
- Open E (E2, midi 40) → fret 3 on A (C3, midi 48): no, that's 8 semitones — wrong
- Wait, the math: `f_hi = semis - openDiff + f_lo`. openDiff for E→A = 45-40 = 5. For semis=3: `f_hi = 3 - 5 + f_lo = f_lo - 2`. So f_lo=2 gives f_hi=0 (open A), which is valid. f_lo=3 gives f_hi=1, etc.
- So pairs: (fret 2 on E, open A), (fret 3 on E, fret 1 on A), (fret 4 on E, fret 2 on A), ... up to fret 12 on E.

**Each pair is two tasks:** step 0 = lo note (lower string), step 1 = hi note (upper string). The fretboard shows the exact string:fret pin, and the interval shape diagram highlights the active placement.

**G–B anomaly in action:** For string pair (G=index 3, B=index 4), `openDiff = 59-55 = 4` instead of 5 for all other adjacent pairs. So every interval shape on G–B is shifted by 1 fret compared to the same interval on E–A, A–D, D–G, or B–e. The formula handles this automatically — no if-statement needed.

**Phase structure for each interval family (12 phases total):**

| Phases 1–5 | Two adjacent strings | Forces the student to see each shape in isolation |
| Phases 6–9 | Three adjacent strings | One phase per 3-string set; only adjacent pairs within the set are drilled |
| Phases 10–12 | Four adjacent strings | Same logic; 3 adjacent pairs per phase |

Within a 3-string phase (say E–A–D), the adjacent pairs are E–A and A–D — two segments, each with its own queue strip label ("E–A · Major 3rd", "A–D · Major 3rd"). The D–string is never the lo note for a pair that skips to G — only directly adjacent pairs are drilled per phase. The G-string only appears when the subset includes it.

**Task count per phase:** For semis=[3,4] (thirds), string pair E–A, frets 0–12:
- m3 (3 semitones): valid f_lo range is 2–12 → 11 pairs × 2 steps = 22 tasks
- M3 (4 semitones): valid f_lo range is 1–12 → 12 pairs × 2 steps = 24 tasks
- Total for one 2-string phase: ~46 tasks

For a 3-string phase (E–A–D) with semis=[3,4]:
- E–A pairs (as above): ~46 tasks
- A–D pairs (similar count): ~46 tasks
- Total: ~92 tasks per 3-string phase

---

#### `chord_shape`

**What it is:** Enumerate every playable adjacent-string voicing of a specific chord, then drill each voicing as a stepwise ascending arpeggio — one note at a time in the exact string order of the voicing.

**Voicing enumeration detail (`buildChordVoicings`):**
For each 3-string subset (and 4-string for tetrads), the algorithm tries every combination of chord-tone fret placements across those strings using recursive backtracking. A voicing is accepted only if:
1. All chord tones appear (e.g. for Cmaj, C+E+G must all be present)
2. The span of non-open frets is ≤ 4 (one-hand reach)

**Voicings searched for triads:** subsets [0,1,2], [1,2,3], [2,3,4], [3,4,5] — all four 3-string groups.
**Voicings searched for tetrads:** same four 3-string subsets plus [0,1,2,3], [1,2,3,4], [2,3,4,5].

**Sort order applied to all voicings:**
1. Root-position first (lowest-pitched note in voicing has pitch class = chord root)
2. Closed voicings (no open strings) before open voicings
3. Shorter string count first within each group (3-string before 4-string)
4. Lower bass MIDI first within each group (lower register first)

**Ascending-pitch filter:** Any voicing where a higher string has ≤ MIDI of the string below it is discarded. This eliminates physically nonsensical combinations.

**Per-step task content:** Each note in the voicing becomes one task. The task carries the complete voicing so render.js can show the entire chord shape on the fretboard.

**What the student sees for each step:**
- Note card: target note name + octave + chord tone role (root / 3rd / 5th / b7 / 6th)
- Hint: slash chord name (e.g. "Cmaj/E · play E3 ↓") — slash notation only when bass ≠ root
- Fretboard: all voicing positions shown as dim 80%-opacity colored guide dots; the current target position shows as a bright white-ring pin
- Theory panel: colored chord name + figured bass + inversion label + open/close voicing badge; note pills row with SVG tick-ruler connectors; step-progress dots; root-position interval formula
- Mini chord diagram: all valid voicings for this bass-PC filter grouped into moveable and open-string columns

**Example — Cmaj voicings on strings 1,2,3 (A–D–G), frets 0–4:**
Possible accepted root-position voicings (C is lowest note):
- A string fret 3 (C2), D string fret 2 (E2), G string fret 0 (G2) → C–E–G ascending ✓ (has open string → goes to open column)
- A string fret 3 (C2), D string fret 2 (E2), G string fret 5 — fret 5 > fretMax=4, rejected
So for open box (0–4), only voicings with notes falling within that range qualify. Some string subsets will yield no valid voicings in a narrow window.

**Task count for Cmaj across full 0–12 range:** Typically 10–18 distinct voicings × 3 steps = 30–54 tasks per chord.

---

### Scale track

#### `c_pent` — C Major Pentatonic
**Notes: C D E G A**
Entry point of the entire curriculum. No prerequisites.
Pedagogical note: no semitones, no tritone — the five "safe" notes. Used as the foundation for all interval and chord tracks.

**Shared intervals within this scale:**
- C→D: M2, C→E: M3, C→G: P5, C→A: M6, C→C: P8
- D→E: M2, D→G: P4, D→A: P5, D→D: P8
- E→G: m3, E→A: P4, E→E: P8
- G→A: M2, G→C: P4, G→D: P5, G→G: P8
- A→C: m3, A→D: P4, A→E: P5, A→A: P8

**Diatonic triads arpeggiated in `arpeggio` pattern (open box, C scale anchor at C2):**

| Triad (scale degrees) | Notes | Quality | Roman |
|---|---|---|---|
| sc[0]–sc[2]–sc[4] | C–E–G | major | I |
| sc[1]–sc[3]–sc[5] | D–G–A | sus2 (P4+M2) | IIsus2 |
| sc[2]–sc[4]–sc[6] | E–G–C | minor | iiim (vi-ish) |
| sc[3]–sc[5]–sc[7] | G–A–D | sus2 | Vsus2 |
| sc[4]–sc[6]–sc[8] | A–C–E | minor | vi |
| ... | | | |

**Quartal triads (open box):** Skip 3 positions each time:
- C–A–E (skipping D and G) → P6 + P5 (technically not "quartal" but pentatonic stacking)
- D–E–G... varies by register

Note: `buildQuartalTriads` uses `sc[i+3]` and `sc[i+6]`, so with a 5-note pentatonic repeating across octaves the result depends on which octave instances fall in `sc`.

| # | Phase label | Frets | Patterns | Approx tasks |
|---|---|---|---|---|
| 1 | Open box (C-shape) | 0–4 | scale_up, scale_down, intervals, arpeggio, quartal, random×4 | ~250 |
| 2 | Mid box (A-shape) | 5–9 | scale_up, scale_down, intervals, arpeggio, quartal, random×4 | ~250 |
| 3 | Upper box (G-shape) | 9–13 | scale_up, scale_down, intervals, arpeggio, random×4 | ~220 |
| 4 | Connect open + mid | 0–9 | scale_up, scale_down, random×6 | ~50 |
| 5 | Full neck | 0–15 | scale_up, scale_down, random×8 | ~65 |

---

#### `f_pent` — F Major Pentatonic
**Notes: F G A C D**
Shares C, D, A with C pentatonic. New notes: F and G (each has a different color/shape than in C pent context — F is circle/#bb0092, G is circle/#ff3c00).
Relative to its root F: same interval structure as C pent transposed up a P4.
Same 5-phase template. Mid box starts at fret 5 where F has its first closed-position root.

---

#### `g_pent` — G Major Pentatonic
**Notes: G A B D E**
Shares D, A, E with C pentatonic. New note: B (circle/#9ad100). B sits one fret below every C — a reliable landmark.
The only pentatonic stage with a natural 7th (B = major 7th above G). This creates a more "country/bluegrass" flavour.
Same 5-phase template.

---

#### `c_major` — C Major Scale
**Notes: C D E F G A B**
All 7 diatonic notes. Two notes new to anyone coming from C pentatonic: F and B.
F is the perfect 4th — sits one fret below every E shape. B is the major 7th — one fret below every C.

**Diatonic triads in `arpeggio` pattern (all 7 possible scale-degree triads):**

| Triad root | Notes | Quality | Roman |
|---|---|---|---|
| C | C–E–G | major | I |
| D | D–F–A | minor | ii |
| E | E–G–B | minor | iii |
| F | F–A–C | major | IV |
| G | G–B–D | major | V |
| A | A–C–E | minor | vi |
| B | B–D–F | dim | vii° |

These will appear across multiple octave-register instances in each box — the `buildTriads(sc)` function stacks from every starting position in `sc`, so the same triad quality appears multiple times at different octave heights.

**Quartal triads** in C major are more musically interesting than pentatonic quartal — they often land on P4 + P4 shapes since the scale has P4 relationships: C–F–B (tritone substitution), D–G–C, E–A–D, G–C–F, A–D–G, B–E–A.

Same 5-phase template with higher random counts (×5/8/10).

---

#### `f_major` / `g_major`

**F major (F G A Bb C D E):** One flat. Bb is the only note that differs from C major — it sits one fret below every B. The `arpeggio` pattern produces Fmaj, Gm, Am, Bbmaj, Cmaj, Dm, E°.

**G major (G A B C D E F#):** One sharp. F# differs from C major. The `arpeggio` pattern produces Gmaj, Am, Bm, Cmaj, Dmaj, Em, F#°. Most common guitar key — open chords G, C, D, Em, Am all fall naturally.

Same 5-phase template.

---

### Interval track

#### `int_pent` — Pentatonic Intervals
**Notes: C D E G A — same note set as c_pent**
Entry point of the interval track. Unlocks int_2nds.

Purpose: transition from "find a named note" to "find a note that is X above another note". By using the familiar pentatonic set, the student already knows where the notes are — the new skill is naming and recognizing the relationship.

**Intervals drilled (all pairs within the pentatonic):**
This uses the `intervals` pattern (not `string_interval`), so it generates all pairs with semitone distance 1–12 within `sc`. In C pentatonic the possible intervals are:

| Interval | Semitones | Example pairs |
|---|---|---|
| Major 2nd | 2 | C→D, D→E, G→A |
| Minor 3rd | 3 | E→G, A→C |
| Major 3rd | 4 | C→E, G→A (oct) |
| Perfect 4th | 5 | D→G, E→A, C→... wait — C→F doesn't exist in pentatonic |
| Perfect 5th | 7 | C→G, D→A, E→... |
| Major 6th | 9 | C→A, D→... |
| Minor 7th | 10 | E→D (next octave), A→G |
| Octave | 12 | C→C, D→D, etc. |

Note: P4 and P5 only appear where the scale notes happen to be that distance apart. The tritone, m2, m6, M7 do not appear in C pentatonic at all — this stage is intentionally interval-incomplete.

| # | Phase | Frets | Patterns |
|---|---|---|---|
| 1 | Open position | 0–4 | scale_up, intervals |
| 2 | Mid neck | 5–9 | scale_up, intervals |
| 3 | Upper neck | 9–13 | scale_up, intervals |

---

#### `int_2nds` through `int_octave` — Chromatic interval families

All eight stages share the exact same 12-phase structure. Only the `interval_semis_list` differs.

**What `string_interval` drills per phase:**

For each phase, `buildQueueTasks` iterates through the adjacent string pairs in the subset, then for each pair iterates through every semitone value in `interval_semis_list`, generating all valid (lo_note, hi_note) pairs by sliding from fret 0 to fret 12 on the lower string.

**Concrete example — int_3rds, phase 1 (E–A strings, semitones [3,4]):**

Minor 3rd (3 semitones) on E–A: `f_hi = 3 - 5 + f_lo = f_lo - 2`. Valid when f_hi ≥ 0, so f_lo ≥ 2.
- f_lo=2 (F#2), f_hi=0 (A2, open): F#→A, m3 ✓
- f_lo=3 (G2), f_hi=1 (Bb2): G→Bb, m3 ✓
- f_lo=4 (Ab2), f_hi=2 (B2): Ab→B, m3 ✓
- f_lo=5 (A2), f_hi=3 (C3): A→C, m3 ✓
- ... through f_lo=12 (E3), f_hi=10 (F#3): E→F#... wait, that's M2 not m3. Recalculate: E→G# is M3 not m3. Let me recheck: midi(E3 string at fret 12) = 40+12=52 → E3. f_hi=10 → A string fret 10 → midi=45+10=55 → G3. 55-52=3 ✓ G3 is indeed m3 above E3. So yes: E3→G3.
- 11 valid pairs × 2 steps = 22 tasks for m3 on E–A

Major 3rd (4 semitones) on E–A: `f_hi = 4 - 5 + f_lo = f_lo - 1`. Valid when f_lo ≥ 1.
- f_lo=1 (F2), f_hi=0 (A2 open): F→A, M3 ✓
- f_lo=2 (F#2), f_hi=1 (Bb2): F#→Bb, M3 ✓
- ... through f_lo=12 (E3), f_hi=11 (G#3/Ab3)
- 12 valid pairs × 2 steps = 24 tasks for M3 on E–A

**Total for phase 1 of int_3rds (E–A, m3+M3): 22 + 24 = 46 tasks.**

**G–B anomaly example — int_3rds, G–B phase (strings 3,4, semitones [3,4]):**
openDiff = 59-55 = 4 (M3 apart instead of P4).

Minor 3rd: `f_hi = 3 - 4 + f_lo = f_lo - 1`. Valid when f_lo ≥ 1.
- f_lo=1 (Ab3), f_hi=0 (B3 open): Ab3→B3... 59-56=3 ✓
- f_lo=2 (A3), f_hi=1 (C4): A3→C4, m3 ✓
- 12 valid pairs for m3

Major 3rd: `f_hi = 4 - 4 + f_lo = f_lo`. Both strings at same fret number.
- f_lo=0 (G3 open), f_hi=0 (B3 open): G→B, M3 ✓ — this is the famous open-string M3
- f_lo=1 (Ab3), f_hi=1 (C4): Ab→C, M3 ✓
- 13 valid pairs for M3 (0–12 inclusive)

On all other string pairs (E–A, A–D, D–G, B–e), a M3 requires the hi fret to be 1 less than the lo fret. On G–B, the hi fret equals the lo fret. This is exactly the G–B shape difference that the course is designed to make visible.

**Interval family semitone lists:**

| Stage | Semitones | Intervals |
|---|---|---|
| int_2nds | [1, 2] | minor 2nd, Major 2nd |
| int_3rds | [3, 4] | minor 3rd, Major 3rd |
| int_4ths | [5] | Perfect 4th |
| int_tritone | [6] | Tritone (Aug4/Dim5) |
| int_5ths | [7] | Perfect 5th |
| int_6ths | [8, 9] | minor 6th, Major 6th |
| int_7ths | [10, 11] | minor 7th, Major 7th |
| int_octave | [12] | Perfect Octave |

**Why certain intervals are grouped:**
- 2nds together: both appear in half-step/whole-step patterns, shapes differ by only 1 fret
- 3rds together: the fundamental chord-tone interval; m3 vs M3 determines minor/major chord quality
- 4th alone: the dominant string-crossing interval (adjacent strings are a P4 apart except G–B)
- Tritone alone: the only dissonant interval, it gets its own stage for emphasis
- 5th alone: the power chord interval, universal in all keys
- 6ths together: inverted 3rds — m6 inverts to M3, M6 inverts to m3
- 7ths together: the "leading tone" intervals, close to the octave
- Octave alone: the final stage, the same note one register up

---

### Chord track

#### `chord_3rds` — Thirds · Triads
Requires: `int_octave` (the student has drilled all interval families in isolation before playing chords).

**Notes context: C D E G A (C major pentatonic)**
All chord tones are drawn from this note set. No accidentals except as inherent in the interval structure.

---

**Cmaj (C–E–G, intervals [0,4,7])**

Root: C. Quality: major (M3 + m3 = P5 span).
All-tones: pitch classes 0 (C), 4 (E), 7 (G).

Sample voicings found by `buildChordVoicings` (frets 0–12, illustrative):

*Root-position closed voicings (C is bass, no open strings):*
- Strings A–D–G (1,2,3): A-fret3=C, D-fret2=E, G-fret0... wait, G open is G3 which is in range but fret 0 is open → goes to open column. A-fret3=C, D-fret2=E, G-fret5=C — span=5-2=3 ✓ but that puts C on top, not G. Need C–E–G ascending: A-fret3(C2), D-fret2(E2), G-fret4(B)... hmm. Let me think differently: the voicing just needs all three PCs, ascending MIDI. A-fret3(C2,midi=48), D-fret2(E2,midi=50), G-fret2... G string fret 2 = midi 57 = A2, pc=9 ≠ 4. G string fret 4 = midi 59 = B2, pc=11 ≠ 7. G string fret 0 = midi 55 = G2, but 55 < 50 so NOT ascending — rejected.

Actually the correct ascending voicing on A–D–G would need the G string note to be above the D string note. G string open = G2 (midi 55), D string fret 2 = E2 (midi 50). 55 > 50 ✓. So: A3(C2,48) – D2(E2,50) – G0(G2,55) → ascending C–E–G ✓. But G open = open string → goes to "open strings" column in the diagram.

*Closed root-position on D–G–B (strings 2,3,4):*
D-fret10(C3,midi=62), G-fret9(E3,midi=64), B-fret8(G3,midi=67) → ascending ✓, span=10-8=2 ✓ → moveable/transposable ✓

This is the classic bar-chord shape: D string fret 10, G string fret 9, B string fret 8.

**Inversion behaviour:** Because the sort puts root-position first, the student will drill all root-position voicings of Cmaj before seeing any 1st inversion (C/E) voicings. Even though `chord_3rds` says "root position only" in its description, the voicing enumeration from frets 0–12 technically will find voicings where E or G is the lowest note — these are the inversions that `chord_inv` explicitly teaches later. The root-position-first sort ensures the student encounters clean root-bass shapes before stumbling into inversions.

---

**Am (A–C–E, intervals [0,3,7])**

Root: A. Quality: minor (m3 + M3 = P5 span).
Pitch classes: 9 (A), 0 (C), 4 (E).

Pedagogical connection to Cmaj: Am shares all three notes with Cmaj. The difference is which note is the bass — A vs C. This is why the two chords appear back-to-back in the curriculum.

---

**Cmaj6 (C–E–G–A, intervals [0,4,7,9])**

Root: C. Four voices. Pitch classes: 0,4,7,9.
Uses 3-string subsets first (all four combinations of three of the four tones), then adds 4-string voicings.
The A is the 6th degree — adds colour without creating tension (no 7th). Common in jazz as a chord of resolution.

Inversions are more complex: the bass could be C (root), E (1st inv), G (2nd inv), or A (3rd inv). Figured bass symbols: root=none, 1st=⁶, 2nd=⁶₄, 3rd=² (the last is rare and shown as ² in the theory panel).

---

**Am7 (A–C–E–G, intervals [0,3,7,10])**

Root: A. Four voices. Pitch classes: 9,0,4,7.
The G is the minor 7th above A. This note is already in the pentatonic — so Am7 uses only pentatonic notes. Common resolution chord in jazz (ii–V–I: Dm7→G7→Cmaj7, or Am7→D7→Gmaj7).

---

#### `chord_sus` — Fourths · Sus Chords

Suspended chords replace the 3rd with a 2nd or 4th. No major/minor quality — ambiguous, open sound.

**Csus2 (C–D–G, intervals [0,2,7]):**
- C is root, D is the sus2 (M2 above root), G is the P5.
- Compared to Cmaj: E→D (lower by M2). On the fretboard the D is always 2 frets below E at any position.
- Sound: remove the third entirely, replace with a step tone. Creates an "unresolved" or meditative quality.

**Dsus4 (D–G–A, intervals [0,5,7]):**
- D is root, G is the sus4 (P4 above root), A is the P5.
- Compared to Dm (D–F–A): F→G (raised by M2). On the fretboard G is 2 frets above F at any position.

**Gsus2 (G–A–D, intervals [0,2,7]):**
- G is root, A is sus2, D is P5.
- Note: the interval from A to D is a P4 — so Gsus2 voicings on adjacent strings tend to use the same fret shape as Csus2 but shifted 7 semitones up. This reinforces transposable shape awareness.

**Asus4 (A–D–E, intervals [0,5,7]):**
- A is root, D is sus4, E is P5.
- Classic guitar shape: the "Asus4" in open position (A string open, D string open, G string fret 2, B string fret 3, e string open) — the student will encounter a version of this shape in the voicing enumeration.

---

#### `chord_inv` — Inversions

**What inversions are:** The bass note (lowest pitch in the voicing) is not the chord root. Written with slash notation: Cmaj/E means C major chord with E in the bass.

**Why this is its own stage:** Inversions are melodically and harmonically distinct from root-position chords. The same pitch-class content sounds different depending on what's lowest. Bass lines using inversions create smooth stepwise motion instead of root jumps.

**Cmaj/E (1st inversion — E is bass, intervals from E: [0,3,8]):**
- E(0)→G(3): m3 above bass
- E(0)→C(8): m6 above bass
- The "1st inversion" description corresponds to the 3rd of the chord being in the bass.
- Figured bass: ⁶ (a 6th and a 3rd above the bass, abbreviated as just the 6th)

**Cmaj/G (2nd inversion — G is bass, intervals from G: [0,5,9]):**
- G(0)→C(5): P4 above bass
- G(0)→E(9): M6 above bass
- 2nd inversion = 5th of chord is bass. Historically called a "cadential ⁶₄" in classical theory — often used just before a V chord.
- Figured bass: ⁶₄

**Am/C (1st inversion — C is bass, intervals from C: [0,4,9]):**
- C(0)→E(4): M3 above bass
- C(0)→A(9): M6 above bass
- Note: this has the same intervals from bass as a **C major** chord in root position for the first two notes — but the A on top disambiguates it as Am/C. The shared bass makes transitions between Cmaj and Am/C smooth (the bass note doesn't move).

**Am/E (2nd inversion — E is bass, intervals from E: [0,5,8]):**
- E(0)→A(5): P4 above bass
- E(0)→C(8): m6 above bass
- The P4 from bass is the same shape as G–C or D–G on adjacent strings — highly recognizable shape.

---

## 7. Task types & queue logic

Every task carries: `kind`, `currentNote`, `segmentId`, plus kind-specific fields.

### `kind: 'note'`
Fields: `note` (same as `currentNote`).
Used by: `scale_up`, `scale_down`, `random`.

### `kind: 'interval'`
Fields: `lo`, `hi`, `semis`, `label`, `stepIdx` (0=lo/1=hi), `repIdx`, `totalReps`, `pairIdx`, `totalPairs`.
Optional: `stringPairLabel` (e.g. `"E–A"` for string_interval phases).
Used by: `intervals`, `string_interval`.

### `kind: 'chord'`
Fields: `notes[]`, `quality {symbol, full}`, `roman`, `stepIdx`, `chordIdx`, `totalChords`, `style`.

For `style: 'chord_shape'`, additionally:
- `voicing` — `[{si, fret, pc, toneIdx, note}]` — the exact fretboard positions
- `chordPCs` — absolute pitch classes `[0, 4, 7]`
- `chordIntervals` — semitones from root `[0, 4, 7]`
- `chordName` — display name `"Cmaj"`
- `altPositions` — `[{si, fret}]` for the same step's note on sibling voicings

### Queue builder (`buildQueueTasks`)

Called on each phase advance with `(patterns, fretMin, fretMax, phaseDict)`.

`scale_up`: notes ascending from scale anchor (lowest root with octave above it).
`scale_down`: notes descending from top root back to fret 0.
`intervals`: all pairs within the scale window, sorted lo→hi MIDI, repeated `reps` times.
`arpeggio`: diatonic triads (stack every-other scale degree), arpeggio up.
`quartal`: quartal/quintal triads from the scale, arpeggio up.
`random`: N random notes from the full fret range.
`string_interval`: chromatic interval pairs on adjacent string pairs within a subset.
`chord_shape`: all ascending voicings of a specific chord, root-position first, closed before open.

### Voicing sort order (chord_shape)
1. Root-position (bass note PC = chord root PC) before inversions
2. Closed voicings (no open strings) before open voicings
3. Shorter string span first (3-string before 4-string within same group)
4. Lower bass MIDI first

### Ascending pitch filter
Any voicing where a higher string has a lower or equal MIDI than the string below it is discarded. This ensures every arpeggio goes strictly upward in pitch.

### MIDI group annotation
Voicings with identical MIDI pitch sets (same notes, different strings) are grouped. Each step in a task gets an `altPositions` array pointing to the matching position in every sibling voicing.

---

## 8. Rendering pipeline

### Note card (`renderTarget`)
- Colored shape swatch (clickable → plays the note)
- Note name + octave
- For `chord_shape`: shows the chord tone role (root / 3rd / 5th / …)
- For `interval`: shows the interval name and the lo note reference
- Hear-it button hidden for chord_shape tasks

### Hint bar (`updateHint`)
- Free-range note: "Find C4 · frets 0–4 ↓"
- Interval: "Perfect 4th above D3 · frets 0–4 ↓"
- chord_shape: shows slash name "Cmaj / E · play E3 ↓"

### Queue strip (`renderQueueStrip`)
Dispatches to `_renderNoteStrip` / `_renderIntervalStrip` / `_renderChordStrip`.

**`_renderChordStrip`** — currently shows: `notes[0].name + quality.symbol + roman + chord N/total`, note chips, next chord hint. Known issue: uses hardcoded `3` for step skip in "next" calculation (see §13).

### Theory panel (`renderTheoryPanel`)
Three sub-elements:

**`theory-degree` (`degEl`)**
- Note: degree from root (e.g. "E4 — degree 3 — Major 3rd")
- Interval: lo→hi chips + interval badge
- chord_shape: colored slash name + figured bass superscript + inversion label + open/close voicing badge

**`theory-motion` (`motionEl`)**
- Note: interval from previous note (direction + name)
- chord_shape: note pills row with SVG tick-ruler connectors between adjacent notes, each pill clickable to hear it

**`theory-desc` (`descEl`)**
- Step dots + chord formula + root-position interval structure (for chord_shape)
- Pattern descriptions for other task types

**`theory-arp` (`arpEl`)**
- Intervals: `buildShapeDiagram` SVG — all cross-string and same-string shapes for the interval, with G–B warning coloring
- chord_shape: `buildChordDiagram` SVG — all voicings split into moveable/open-string columns, grouped by bass octave, active voicing highlighted green
- Other chords: note chip row

### Chromatic circle (`renderChromaticCircle`)
- Circle of Fifths view: scale notes highlighted, dashed polygon shape
- Interval mode: adds a second chromatic-order clock diagram with lo/hi highlighted and a connector line showing semitone distance

### Fretboard (`showFretboard`)
- chord_shape: pins the exact voicing position (`si:fret` from `task.voicing[stepIdx]`), sends full voicing as `&shape=` (dim colored guide dots), no preview or alt
- Interval/note: pins by note name+octave across all matching positions in range, sends next note as `&preview=`

---

## 9. Audio detection

`audio.js` (Web Audio API):
- `startListening(callback, deviceId)` — requests mic permission, runs pitch detection, calls `callback(noteInfo)` on each detected pitch
- `stopListening()` — tears down the audio context
- `playReferenceNote(name, octave)` — plays a sine tone at the note's frequency
- `resetLastNote()` — clears the debounce state

`noteInfo` object: `{ noteName, midi, octave, centsOff, color, shape }`.

Detection acceptance: `acceptAfter` timestamp — ignores detections for 550 ms after advancing to a new note (prevents a ringing string from immediately satisfying the next target).

Answer validation logic (in `stage.js`):
- Correct: `noteName === target.name && detectedOctave === target.octave` → advance queue
- Wrong: shows error message with what was detected, sets `waitingCorrect = true` so the next correct hit doesn't double-count as a new correct answer

Octave-strict: the student must play the exact octave shown, not just the right pitch class.

---

## 10. Fretboard SVG

`generate_fretboard_svg()` in `app/fretboard.py`.

All rendering is pure SVG string concatenation (no external library).

**Marker priority** (higher = drawn on top / takes precedence over lower):
1. `pinned` — bright fill + white stroke + pulsing CSS ring
2. `preview` — amber dim (out-of-register) or normal (in-register)
3. `shape` — chord voicing guide: 80% opacity, colored fill, white ring, no label
4. `alt` — dashed outline, 50% opacity, no fill
5. `ghost` — 20% opacity faint outline (scale shape hints)
6. `ghost + orphaned` — dashed outline, outside root-to-root range
7. `dim` — show_all mode, 22% opacity

**Label**: shown for pinned, preview (out-of-register), highlighted, root. Hidden for ghost, shape guide dots.

---

## 11. Progress & persistence

Key: `mtheory-progress` in `localStorage`.

Shape: `{ [stageId]: { correct: number, wrong: number, best_stars: 0–3 } }`.

Stars awarded at completion:
- 0 wrong → 3 stars
- 1–3 wrong → 2 stars
- 4+ wrong → 1 star

Progress is cumulative across sessions (correct/wrong counts accumulate). `best_stars` only ever increases.

The `/learn` map reads `localStorage` on page load and uses it to:
- Unlock stages (requires all prerequisite stages to have `best_stars > 0`)
- Show progress bars (percent through current correct/wrong counts)
- Show star badges on completed stages

Phase advance is automatic — no score threshold. The user completes every task in a phase's queue, then the next phase starts.

---

## 12. What is working well

- **Note system color/shape** is consistent across every rendering surface: fretboard, shape diagrams, note pills, chromatic circles, chips, cards.
- **Chord voicing enumeration** is exhaustive and musically accurate: spans all 3-string and 4-string adjacent subsets, respects MAX_STRETCH, and filters for ascending pitch.
- **Voicing sort** gives a pedagogically sensible order: root-position closed voicings first, open voicings last.
- **Chord shape diagram** splits cleanly into transposable (moveable) vs position-specific (open string) columns, grouped by bass octave.
- **Interval shape diagram** handles G–B anomaly automatically and shows all cross-string and same-string placements.
- **Fretboard pin/shape separation**: the active note is always bright; the full chord shape is visible as a dim guide; no clutter.
- **Slash chord notation + figured bass** in the theory panel is musically correct.
- **Chromatic circle + CoF** dual view in interval mode shows both the semitone distance (clock) and the CoF relationship simultaneously.
- **Inspect pages** give a full read-only data view of every stage and phase without touching the lesson code.

---

## 13. Points of contention

### `_renderChordStrip` is still not fully fixed
The queue strip for chord tasks (`_renderChordStrip`) still uses the old `task.notes[0].name + task.quality.symbol + roman` label instead of the slash name (like `updateHint` does). The "next chord" calculation uses a hardcoded note count that may be wrong for 4-note chords. This is the item marked ❌ in previous session notes.

### Octave-strict answer detection is harsh
The student must play the exact octave shown. On a guitar with multiple positions for the same note, this means the hint ("find C4") is essential — but new players may not know what octave they're in. There's no "close — wrong octave" feedback message, just a generic wrong.

### No way to skip a voicing
If a student finds a chord voicing physically impossible or wants to skip it, there's no skip button. The queue locks them in.

### chord_shape phases cover 0–12 frets always
The pentatonic/major scale stages use positional phases (open box, mid box, etc.) but chord_shape phases always use `fret_min: 0, fret_max: 12`. Voicings are sorted to start from the lowest register, so effectively it starts in open position — but there's no positional gating.

### Chord track only covers C major pentatonic
All chord stages (`chord_3rds`, `chord_sus`, `chord_inv`) use notes from C major pentatonic context. There is no equivalent chord track for other keys, and no chord track for the major scale stages (Dm, Em, Fmaj, Gsus4, etc.).

### No key transposition
Every scale and chord stage is in a specific fixed key. There's no "play this in all 12 keys" flow.

### The `arpeggio` and `quartal` patterns in scale stages use diatonic triads, not chord voicings
The scale-stage arpeggio tasks (`style: 'arpeggio'`) stack every-other scale degree and play root→3rd→5th in ascending pitch. They don't use `buildChordVoicings` — they use `buildTriads(scaleTargets)` which picks three scale-adjacent notes. So you may be asked to play an E that's on the G string even if it means jumping strings, because it's the next scale note. This is different from the chord_shape approach which enumerates clean adjacent-string voicings.

### Queue strip for chord_shape tasks doesn't show slash name
The strip shows the root note + quality symbol (e.g. "Cmaj I chord 4/17") rather than the slash name shown in the hint and theory panel (e.g. "Cmaj / E"). This is inconsistent.

### Trainer page is disconnected
`/trainer` uses a separate `lesson_engine.py` for server-side question generation. It doesn't share the curriculum or voicing logic with the main `/learn` experience. It has no mic detection UI — it's just a visual quiz.

### No back-navigation within a phase
If the student advances past a difficult note, there's no way to go back within the current phase queue except by using the segment jump buttons (which only jump to segment starts).

### Stars metric is low-information
Stars are purely wrong-count based with a hard threshold (0/1-3/4+). There's no timing, no difficulty weighting, no per-note breakdown.

---

## 14. What is not yet built

- **`_renderChordStrip` fix**: use slash name, fix hardcoded step count for next-chord calculation (see §13)
- **Wrong-octave feedback**: detect when the right pitch class but wrong octave is played and give a specific message
- **Skip button for voicings**: let the student skip a specific chord voicing they can't play yet
- **Chord track in other keys**: chord stages for F major, G major, C major (7-note scale context)
- **Diatonic chord track**: the seven diatonic triads of C major (Cmaj, Dm, Em, Fmaj, Gsol, Am, Bdim) in all voicings
- **Key transposition flow**: a "now play it in G" follow-up after completing a stage
- **Timing / BPM tracking**: play along to a click, measure response latency
- **Chord recognition mode**: play any voicing of a chord (not arpeggio) and the app recognizes it
- **Strum detection**: polyphonic input via FFT or note-stacking rather than single pitch
- **Phase positional gating for chords**: open box phase (frets 0–4 only), mid box (5–9), etc.
- **CAGED system overlay**: show the CAGED shape name on the fretboard in scale stages
- **Back button within phase**: navigate to the previous task without restarting the phase
- **Session statistics**: per-phase correct/wrong/time breakdown visible after completion
- **Export progress**: JSON export/import so progress can move between devices
- **Modes / keys beyond C, F, G**: D major, A major, E major, etc. — the curriculum DAG is currently limited to three keys
- **Minor keys**: A natural minor, D natural minor — share notes with relative major but different root and emotional context
- **7th chords**: Cmaj7, G7, Dm7, Am7 in chord_shape style
- **Power chords**: 5th dyads — simpler than triads, common in rock
- **The interval track doesn't drill descending intervals**: `string_interval` always goes lo→hi. A descending variant (hi→lo on the same string pair) is not implemented.
- **A metronome / backing track integration**

---

## 15. Possible additions

### High value / low complexity
- Fix `_renderChordStrip` to show slash name (a few lines, the logic already exists in `updateHint`)
- Add "wrong octave" specific feedback in `onNoteDetected`
- Add a skip button that calls `queueIdx++; nextNote()` without incrementing `totalWrong`
- Add fret range gating to chord_shape phases (open box / mid box split)

### Medium complexity
- Diatonic chord track for C major: all 7 triads in chord_shape style
- Descending variant of `string_interval`
- Per-phase stats shown on the completion overlay
- CAGED shape label shown in the phase banner

### Larger features
- Chord recognition mode (polyphonic input)
- Key transposition flow
- Extend the curriculum to D, A, E major and their relative minors
- 7th chord track
- BPM-gated response detection

### Architecture / tech debt
- `NOTE_SYSTEM` is passed as a Jinja2 global on every page; it could be a single JSON endpoint imported once
- `audio.js` pitch detection algorithm not documented — worth describing its accuracy characteristics, latency, and failure modes
- The fretboard SVG is regenerated per note; caching voicing blocks between steps of the same chord would save a round-trip
- `styles.css` is a single large file (~1000 lines) — splitting into component sheets would help maintenance
