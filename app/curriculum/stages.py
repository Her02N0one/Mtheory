"""
stages.py — All stage definitions.

A "stage" is a self-contained drill unit: a set of notes, a sequence of
phases, and unlock/require relationships.  Each dict includes a `module`
key (used by the UI and by the MODULES grouping in modules.py) so there is
one authoritative place to declare which module a stage belongs to.

To add a new stage:
  1. Define its dict here with all required keys (see shape below).
  2. Add it to the appropriate STAGES section (or a new _TRACK list).
  3. Add its ID to the lesson's `stages` list in semesters.py.
  4. Add its `module` value to the matching entry in modules.py (stage_ids).
  5. (Optional) drop a primer HTML file in templates/primers/<id>.html —
     it will be auto-detected by __init__.py with no further config.

Stage dict shape
----------------
  id          — URL slug and localStorage save-key (e.g. "c_pent")
  module      — module id this stage belongs to (e.g. "pentatonic")
  title       — full display name
  subtitle    — short tagline shown on the map card
  notes       — note names in this scale/set (notes[0] is the root)
  phases      — list of phase dicts (see phases.py)
  pass_score  — None = phase-queue based (UI auto-advances per phase)
  requires    — stage IDs that must be completed before this unlocks
  unlocks     — stage IDs this stage unlocks on completion
  description — shown on the stage detail card
  color       — hex color from NOTE_SYSTEM for the root note
  icon        — single character shown on the map node
"""

from typing import Any

from app.note_system import NOTE_SYSTEM
from .phases import (
    PENT_PHASES, MAJOR_PHASES, unitar_phases,
    ALL_CHROM,
    interval_family_phases, PENT_INTERVAL_PHASES, INT_FAMILY_DEFS,
    chord_phases, CHORD_3RDS_DEFS, CHORD_SUS_DEFS, CHORD_INV_DEFS,
    diatonic_phases, voice_lead_phases,
)


# ---------------------------------------------------------------------------
# Foundations + Pentatonic + Major tracks
# ---------------------------------------------------------------------------

STAGES: list[dict[str, Any]] = [
    # ── Foundations ───────────────────────────────────────────────────────────
    {
        "id":          "lesson_1",
        "module":      "foundations",
        "title":       "The Alphabet & The Wheel",
        "subtitle":    "naturals & accidentals · the chromatic loop · find any note",
        "notes":       ["E", "F", "F#", "G", "Ab", "A", "Bb", "B",
                        "C", "Db", "D", "Eb"],
        "phases": [
            {
                "label":         "The loop of 12",
                "desc":          "Crawl up the low E string, fret 0 → 12. Every fret is one "
                                 "half-step; the 12th lands back on E.",
                "teach": """
<div class="primer-section">
  <h2>Lesson 1 · The Musical Alphabet</h2>
  <h3>Twelve sounds, then it repeats</h3>
  <p>Western music is built from just <strong>12 pitches</strong> — the chromatic
  alphabet. Play them in order and the 13th is the same as the 1st, only higher.
  That repeat is the <strong>octave</strong>, and it is why a guitar with 22 frets
  isn't 22 different notes — it's the same 12, looping.</p>
  <p>On one string, moving up <strong>one fret = one half-step</strong>: the
  smallest move in the whole system. You're about to walk all 12 up the low E
  string. Fret 0 is E; twelve half-steps later, fret 12 is <strong>E again</strong>
  — your first proof that the alphabet loops.</p>
  <p>As a visual aid, each pitch keeps a <strong>fixed colour and shape</strong>, so
  the look changes from one fret to the next as you crawl. Treat it as
  embellishment — don't worry about decoding it. Just notice the alphabet
  marching up one fret at a time, then looping back to where it started.</p>
</div>""",
                "walk_string":   0,
                "string_subset": [0],
                "fret_min":      0,
                "fret_max":      12,
                "patterns":      ["chromatic_walk"],
            },
            {
                "label":         "Half steps & whole steps",
                "desc":          "One fret is a half-step; two frets is a whole step. Read a "
                                 "few frets and start measuring distance.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>The two distances you'll use forever</h3>
  <p>Everything in music is built from two distances on the neck:</p>
  <ul>
    <li><strong>Half-step = 1 fret.</strong> The smallest move — the next pitch up
    or down, with nothing between.</li>
    <li><strong>Whole step = 2 frets.</strong> Two half-steps stacked — with one
    pitch skipped over in the middle.</li>
  </ul>
  <p>That's it. A scale is just a particular <em>recipe</em> of halves and wholes,
  and a chord is notes pulled from that recipe. Before any of that, you need the
  ruler itself: be able to look at two frets and say "that's a whole step" or
  "that's a half-step."</p>
  <p>The faint labelled dots on the board are your <strong>map</strong> — the seven
  natural notes, sitting where they actually fall. Notice they are <em>not</em>
  evenly spaced: some neighbours are 1 fret apart, others 2. That uneven spacing is
  the whole point of the next phase. For now, a fret lights up — name what's there
  by counting half-steps from the open string.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0],
                    "count": 6,
                }],
            },
            {
                "label":         "The seven naturals",
                "desc":          "A B C D E F G — and why the half-steps fall at E–F and B–C. "
                                 "Find each natural on the low E string.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Seven letters, unevenly spaced</h3>
  <p>The musical alphabet is only <strong>seven letters: A B C D E F G</strong>, then
  it wraps back to A. These are the <strong>natural</strong> notes — no sharp, no
  flat. On a piano they're the <strong>white keys</strong>.</p>
  <p>Here's the part that confuses everyone at first: the letters are <em>not</em>
  evenly spaced. Five of the gaps are a <strong>whole step</strong> (2 frets), but
  <strong>two</strong> of them — <strong>B→C</strong> and <strong>E→F</strong> —
  are only a <strong>half-step</strong> (1 fret). Nothing fits between B and C, or
  between E and F. On a piano, those are exactly the two spots with
  <strong>no black key</strong>.</p>
  <p>Watch it happen on the low E string — the labelled map shows the gaps:</p>
  <p style="font-family:monospace; line-height:1.7">
    E <span style="opacity:.6">(0)</span>
    →<sup>1</sup> F <span style="opacity:.6">(1)</span>
    →<sup>2</sup> G <span style="opacity:.6">(3)</span>
    →<sup>2</sup> A <span style="opacity:.6">(5)</span>
    →<sup>2</sup> B <span style="opacity:.6">(7)</span>
    →<sup>1</sup> C <span style="opacity:.6">(8)</span>
    →<sup>2</sup> D <span style="opacity:.6">(10)</span>
    →<sup>2</sup> E <span style="opacity:.6">(12)</span>
  </p>
  <p>The little numbers are how many frets you jump: <strong>1–2–2–2–1–2–2</strong>.
  The two <strong>1</strong>s are E→F and B→C — the natural half-steps. Memorise
  those two pairs and the rest of the fretboard falls into place. Name the lit
  natural; lean on the map to count.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0],
                    "note_filter": "naturals",
                    "count": 8,
                }],
            },
            {
                "label":         "Sharps & flats",
                "desc":          "The five in-between notes that fill the whole-step gaps — "
                                 "named as flats here, with a sharp twin coming next.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Filling the gaps: accidentals</h3>
  <p>Every whole-step gap between two naturals has <strong>one pitch hiding inside
  it</strong>. Those in-between pitches are the <strong>accidentals</strong>. There
  are exactly <strong>five</strong> of them — one in each of the five whole-step
  gaps. (B–C and E–F are already half-steps, so they have no room and no
  accidental.) That's <strong>7 naturals + 5 accidentals = the 12</strong> you
  crawled in phase 1. Nothing else exists.</p>
  <p>An accidental can be named two ways. Raise the natural <em>below</em> it by a
  half-step and you <strong>sharpen</strong>: the note above F is <strong>F#</strong>.
  Lower the natural <em>above</em> it by a half-step and you <strong>flatten</strong>:
  that same pitch, seen from G, is <strong>Gb</strong>. Same fret, same sound.</p>
  <p><strong>In this lesson the app shows the flat spelling</strong> (Bb, Eb, Ab,
  Db) for four of them, and F# for the one between F and G — simply because those
  spellings dominate in the keys you'll play most often as a guitarist.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0],
                    "note_filter": "accidentals",
                    "count": 8,
                }],
            },
            {
                "label":         "Name it across strings",
                "desc":          "Now any note — natural or accidental — on the low E, A, or D "
                                 "string. Name it wherever it lands.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Read any string, any note</h3>
  <p>Final reading drill before the challenge. The lit fret can now be
  <em>any</em> of the 12 — natural or accidental — on the <strong>E, A, or D</strong>
  string. Name what's there.</p>
  <p>The rule never changes: count up from the open string, <strong>one half-step
  per fret</strong>. The natural map is still faintly labelled to anchor you; an
  accidental sits one fret above the natural below it. This is the skill the rest of
  the course quietly assumes — see a position, know its name.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0, 1, 2],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0, 1, 2],
                    "count": 12,
                }],
            },
            {
                "label":         "Find it anywhere",
                "desc":          "Name a pitch, then locate it anywhere on the neck — any "
                                 "string, any position.",
                "is_challenge":  True,
                "teach": """
<div class="primer-section">
  <h3>Now find it anywhere</h3>
  <p>You've crawled the loop, measured half- and whole-steps, named the naturals and
  learned why they're spaced as they are, filled in the accidentals, met the twin
  names, and read frets across several strings. The last step is to <strong>apply
  it</strong>: you'll be given a pitch and have to find it <em>anywhere</em> on the
  neck — any string, any position that holds it.</p>
  <p>Use the shape and colour to confirm you're on the right pitch before you play.
  This is the physical foundation everything else is built on: see a note name, put
  a finger on it, instantly.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "patterns":      [{"random": 8}],
            },
        ],
        "pass_score":  None,
        "requires":    [],
        "unlocks":     ["c_pent"],
        "description": (
            "Western music is built from a repeating loop of just 12 notes: seven "
            "natural letters (A–G) and the five sharps and flats that fill the gaps "
            "between them. Crawl the loop one fret at a time, name the naturals and "
            "accidentals where they live, meet the enharmonic twins, read frets across "
            "several strings, and finish by finding any note anywhere on the neck. This "
            "is the alphabet every scale, chord, and riff is spelled from."
        ),
        "color":       NOTE_SYSTEM["E"]["color"],
        "icon":        "→",
    },

    # ── Pentatonic track ──────────────────────────────────────────────────────
    {
        "id":          "c_pent",
        "module":      "pentatonic",
        "title":       "C Major Pentatonic",
        "subtitle":    "5 notes · start here",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      PENT_PHASES,
        "pass_score":  None,
        "requires":    [],
        "unlocks":     ["f_pent", "g_pent"],
        "description": (
            "No sharps, no flats. These 5 notes are everywhere on the neck. "
            "Use the 'Hear it' button to associate each sound with its name and color."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "◼",
    },
    {
        "id":          "f_pent",
        "module":      "pentatonic",
        "title":       "F Major Pentatonic",
        "subtitle":    "5 notes · one step left on the CoF",
        "notes":       ["F", "G", "A", "C", "D"],
        "phases":      PENT_PHASES,
        "pass_score":  None,
        "requires":    ["c_pent"],
        "unlocks":     ["c_major"],
        "description": (
            "Shares C, D, A with the C pentatonic. "
            "The new notes are F and G — find them everywhere."
        ),
        "color":       NOTE_SYSTEM["F"]["color"],
        "icon":        "●",
    },
    {
        "id":          "g_pent",
        "module":      "pentatonic",
        "title":       "G Major Pentatonic",
        "subtitle":    "5 notes · one step right on the CoF",
        "notes":       ["G", "A", "B", "D", "E"],
        "phases":      PENT_PHASES,
        "pass_score":  None,
        "requires":    ["c_pent"],
        "unlocks":     ["c_major"],
        "description": (
            "Shares D, A, E with C pentatonic. "
            "B is new — it sits just below C everywhere on the neck."
        ),
        "color":       NOTE_SYSTEM["G"]["color"],
        "icon":        "●",
    },

    # ── Major scale track ─────────────────────────────────────────────────────
    {
        "id":          "c_major",
        "module":      "major",
        "title":       "C Major Scale",
        "subtitle":    "7 notes · the full picture",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      MAJOR_PHASES,
        "pass_score":  None,
        "requires":    ["f_pent", "g_pent"],
        "unlocks":     ["f_major", "g_major"],
        "description": (
            "All 7 notes, no accidentals. "
            "You already know 5 from the pentatonics — add F and B."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "◼",
    },
    {
        "id":          "f_major",
        "module":      "major",
        "title":       "F Major Scale",
        "subtitle":    "7 notes · one flat (Bb)",
        "notes":       ["F", "G", "A", "Bb", "C", "D", "E"],
        "phases":      MAJOR_PHASES,
        "pass_score":  None,
        "requires":    ["c_major"],
        "unlocks":     [],
        "description": (
            "One note changes from C major: B becomes Bb. "
            "Bb sits one fret below every B you already know."
        ),
        "color":       NOTE_SYSTEM["F"]["color"],
        "icon":        "●",
    },
    {
        "id":          "g_major",
        "module":      "major",
        "title":       "G Major Scale",
        "subtitle":    "7 notes · one sharp (F#)",
        "notes":       ["G", "A", "B", "C", "D", "E", "F#"],
        "phases":      MAJOR_PHASES,
        "pass_score":  None,
        "requires":    ["c_major"],
        "unlocks":     [],
        "description": (
            "One note changes from C major: F becomes F#. "
            "The most common guitar key — you'll use this constantly."
        ),
        "color":       NOTE_SYSTEM["G"]["color"],
        "icon":        "●",
    },
    {
        "id":          "c_major_unitar",
        "module":      "major",
        "title":       "C Major — Single String",
        "subtitle":    "7 notes · one string · linear geometry",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      unitar_phases(),
        "pass_score":  None,
        "requires":    ["c_major"],
        "unlocks":     [],
        "description": (
            "Forget the boxes. Walk the major scale along a single string, "
            "one string at a time, and the whole-step / half-step formula "
            "(W–W–H–W–W–W–H) lays itself out as pure horizontal distance."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "▬",
    },
]


# ---------------------------------------------------------------------------
# Interval track (auto-generated from INT_FAMILY_DEFS)
# ---------------------------------------------------------------------------

_INT_FAM_IDS = [d[0] for d in INT_FAMILY_DEFS]

_INTERVAL_STAGES: list[dict[str, Any]] = [
    {
        "id":             "int_pent",
        "module":         "intervals",
        "title":          "Pentatonic Intervals",
        "subtitle":       "M3 and P4  ·  familiar ground first",
        "notes":          ["C", "D", "E", "G", "A"],
        "phases":         PENT_INTERVAL_PHASES,
        "pass_score":     None,
        "requires":       [],
        "unlocks":        ["int_2nds"],
        "description": (
            "Start with the two intervals hiding inside the C major pentatonic: "
            "the Major 3rd (C→E) and Perfect 4th (D→G, E→A). "
            "Learn their shapes on every box before moving to all intervals."
        ),
        "color":          NOTE_SYSTEM["C"]["color"],
        "icon":           "↕",
        "interval_stage": True,
    }
]

for _i, (_sid, _title, _sub, _semis_list) in enumerate(INT_FAMILY_DEFS):
    _requires = ["int_pent"] if _i == 0 else [_INT_FAM_IDS[_i - 1]]
    _unlocks  = [] if _i == len(INT_FAMILY_DEFS) - 1 else [_INT_FAM_IDS[_i + 1]]
    _INTERVAL_STAGES.append({
        "id":             _sid,
        "module":         "intervals",
        "title":          _title,
        "subtitle":       _sub,
        "notes":          ALL_CHROM,
        "phases":         interval_family_phases(_semis_list),
        "pass_score":     None,
        "requires":       _requires,
        "unlocks":        _unlocks,
        "description": (
            f"Learn the {_title.lower()} on every string set, 3 strings at a time "
            f"then 4 strings at a time. "
            "The G–B pair always has a different shape — that's normal guitar tuning."
        ),
        "color":          NOTE_SYSTEM["C"]["color"],
        "icon":           "↕",
        "interval_stage": True,
    })

STAGES.extend(_INTERVAL_STAGES)


# ---------------------------------------------------------------------------
# Chord track
# ---------------------------------------------------------------------------

_CHORD_STAGES: list[dict[str, Any]] = [
    {
        "id":          "c_diatonic_triads",
        "module":      "major",
        "title":       "C Major Diatonic Triads",
        "subtitle":    "All 7 chords · positionally gated",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      diatonic_phases(),
        "pass_score":  None,
        "requires":    ["c_major"],
        "unlocks":     [],
        "description": (
            "The seven triads built from C major: Cmaj, Dm, Em, Fmaj, Gmaj, Am, Bdim. "
            "Each box phase constrains voicings to a single positional window so you "
            "learn the shapes that sit naturally under your hand."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
    {
        "id":          "chord_3rds",
        "module":      "harmony",
        "title":       "Thirds · Triads",
        "subtitle":    "Cmaj + Am  ·  stacked thirds",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      chord_phases(CHORD_3RDS_DEFS),
        "pass_score":  None,
        "requires":    ["int_octave"],
        "unlocks":     ["chord_sus"],
        "description": (
            "Build chords by stacking thirds: each chord tone skips one "
            "pentatonic note to reach the next.  Root position only — "
            "the lowest note in every voicing is the chord root."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
    {
        "id":          "chord_sus",
        "module":      "harmony",
        "title":       "Fourths · Sus Chords",
        "subtitle":    "sus2 + sus4  ·  seconds and fourths",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      chord_phases(CHORD_SUS_DEFS),
        "pass_score":  None,
        "requires":    ["chord_3rds"],
        "unlocks":     ["chord_inv"],
        "description": (
            "Suspended chords replace the third with a 2nd (sus2) or 4th (sus4). "
            "The perfect 5th remains.  Every note stays inside C major pentatonic, "
            "so these shapes sit naturally next to the triads you just learned."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
    {
        "id":          "chord_inv",
        "module":      "harmony",
        "title":       "Inversions",
        "subtitle":    "Cmaj + Am  ·  bass on 3rd or 5th",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      chord_phases(CHORD_INV_DEFS),
        "pass_score":  None,
        "requires":    ["chord_sus"],
        "unlocks":     [],
        "description": (
            "An inversion moves the bass note away from the root. "
            "1st inversion: the 3rd is lowest.  "
            "2nd inversion: the 5th is lowest.  "
            "Same chord tones, different colour and tension."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
    {
        "id":          "chord_voice_lead",
        "module":      "harmony",
        "title":       "Voice Leading",
        "subtitle":    "Smoothest path through a progression",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      voice_lead_phases(),
        "pass_score":  None,
        "requires":    ["c_diatonic_triads"],
        "unlocks":     [],
        "description": (
            "Play a progression the way a guitarist actually does — keeping the "
            "fretting hand still.  Each chord is voiced to share as many notes "
            "and strings as possible with the one before it, so your fingers "
            "travel the minimum distance between chords."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
]

STAGES.extend(_CHORD_STAGES)
