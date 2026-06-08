"""
curriculum.py — Structured learning path.

Stage progression:

         [C Pent]
        /         \\
   [F Pent]    [G Pent]
        \\         /
         [C Major]
        /         \\
   [F Major]   [G Major]

Each stage: identify notes from that scale by ear + eye, anywhere on the neck.
Pass threshold earns a star rating and unlocks the next stage.
"""

from typing import Any
import random

from app.note_system import NOTE_SYSTEM

# ---------------------------------------------------------------------------
# Phase definitions (reused across stages)
# ---------------------------------------------------------------------------

# Each phase:
#   label      — displayed in UI
#   fret_min   — lowest fret shown/tested
#   fret_max   — highest fret shown/tested
#   patterns   — ordered list of exercise patterns consumed by buildQueueTasks() in theory.js
#                Accepted strings: scale_up | scale_down | intervals | arpeggio | quartal
#                Accepted objects: { "random": N }  — pick N random notes from the fret range
#                                  { "type": "intervals", "reps": N }  — override default rep count
#   box        — CAGED box name (informational only, shown in the UI phase label)
#
# Phases are consumed in order; the user must complete every pattern in a phase
# before the UI advances to the next phase automatically.

# Pentatonic phase template — shared by all 5-note stages (C, F, G pentatonic).
# Patterns build deliberately: Phase 0 orients, Phase 1 adds intervals,
# Phase 2 adds chord shapes, Challenges consolidate across positions.
_PENT_PHASES = [
    {
        "label":    "Open box (C-shape)",
        "desc":     "Find degrees 1 2 3 (◼) and 5 6 (●) in this position by ear.",
        "box":      "C",
        "fret_min": 0,
        "fret_max": 4,
        "patterns": ["scale_up", "scale_down", {"random": 3}],
    },
    {
        "label":    "Mid box (A-shape)",
        "desc":     "Same degrees, new position. Drill intervals between the two shape camps.",
        "box":      "A",
        "fret_min": 5,
        "fret_max": 9,
        "patterns": ["scale_up", "scale_down", "step_intervals", {"random": 4}],
    },
    {
        "label":    "Upper box (G-shape)",
        "desc":     "Higher register. Add chord shapes built from these five degrees.",
        "box":      "G",
        "fret_min": 9,
        "fret_max": 13,
        "patterns": ["scale_up", "scale_down", "step_intervals", "arpeggio", {"random": 4}],
    },
    {
        "label":    "Orbit (open box)",
        "desc":     "Root to each degree and back. Hear every interval from the root.",
        "box":      "C",
        "fret_min": 0,
        "fret_max": 4,
        "patterns": ["orbit", {"random": 3}],
    },
    {
        "label":        "Connect open + mid",
        "desc":         "Cross positions freely. The shape law is your map.",
        "is_challenge": True,
        "box":          "C+A",
        "fret_min":     0,
        "fret_max":     9,
        "patterns":     ["scale_up", "scale_down", "quartal", {"random": 5}],
    },
    {
        "label":        "Full neck",
        "desc":         "Any degree, anywhere. Squares and circles across all positions.",
        "is_challenge": True,
        "box":          "all",
        "fret_min":     0,
        "fret_max":     15,
        "patterns":     ["scale_up", "scale_down", "quartal", {"random": 8}],
    },
]

# Major scale phase template — shared by C, F, G major stages.
# Same progressive build as _PENT_PHASES; reps=1 for intervals keeps task
# counts manageable across the larger 7-note set.
_MAJOR_PHASES = [
    {
        "label":    "Open box (C-shape)",
        "desc":     "Find all seven degrees. Note where the ◼→● shape crossings sit.",
        "box":      "C",
        "fret_min": 0,
        "fret_max": 4,
        "patterns": ["scale_up", "scale_down", {"random": 4}],
    },
    {
        "label":    "Mid box (A-shape)",
        "desc":     "Same seven degrees, moveable position. Drill intervals across the shape divide.",
        "box":      "A",
        "fret_min": 5,
        "fret_max": 9,
        "patterns": ["scale_up", "scale_down", "step_intervals", {"random": 5}],
    },
    {
        "label":    "Upper box (G-shape)",
        "desc":     "Higher register. Add diatonic chord shapes from these scale tones.",
        "box":      "G",
        "fret_min": 9,
        "fret_max": 13,
        "patterns": ["scale_up", "scale_down", "step_intervals", "arpeggio", {"random": 5}],
    },
    {
        "label":    "Orbit (open box)",
        "desc":     "Root to each degree and back. Hear each interval against the root.",
        "box":      "C",
        "fret_min": 0,
        "fret_max": 4,
        "patterns": ["orbit", {"random": 4}],
    },
    {
        "label":        "Connect open + mid",
        "desc":         "Cross between lower positions and add quartal harmony.",
        "is_challenge": True,
        "box":          "C+A",
        "fret_min":     0,
        "fret_max":     9,
        "patterns":     ["scale_up", "scale_down", "quartal", {"random": 6}],
    },
    {
        "label":        "Full neck",
        "desc":         "Free recall — any note, anywhere on the neck.",
        "is_challenge": True,
        "box":          "all",
        "fret_min":     0,
        "fret_max":     15,
        "patterns":     ["scale_up", "scale_down", "quartal", {"random": 10}],
    },
]

# "Unitar" single-string phases — one phase per string. Each walks the scale
# linearly along a single string (open → fret 12) so the W-W-H-W-W-W-H step
# pattern is visible on one horizontal plane with no string crossings.
# single_string drives task generation; string_subset collapses the fretboard
# render (ghosts included) to that same string.
_STRING_NAMES = ["Low E", "A", "D", "G", "B", "High e"]


def _unitar_phases() -> list[dict]:
    phases = []
    for si, sname in enumerate(_STRING_NAMES):
        phases.append({
            "label":         f"{sname} string",
            "desc":          f"Walk the scale up and back along the {sname} string. "
                             "Watch the whole-step / half-step spacing.",
            "is_challenge":  si >= 4,   # the two highest strings consolidate
            "single_string": si,
            "string_subset": [si],
            "fret_min":      0,
            "fret_max":      12,
            "patterns":      ["scale_horizontal"],
        })
    return phases


# ---------------------------------------------------------------------------
# Stage definitions
# ---------------------------------------------------------------------------
# Each stage dict shape:
#   id          — URL slug and save-key (e.g. "c_pent")
#   title       — full display name
#   subtitle    — short tagline shown on the map card
#   notes       — note names in this scale/set (order matters: notes[0] is the root)
#   phases      — list of phase dicts (see _PENT_PHASES / _MAJOR_PHASES above)
#   pass_score  — None = phase-queue based (UI advances automatically per phase)
#   requires    — list of stage IDs that must be passed before this one unlocks
#   unlocks     — list of stage IDs this stage unlocks on completion
#   description — shown on the stage detail card
#   color       — hex color pulled from NOTE_SYSTEM for the root note
#   icon        — single character shown on the map node

STAGES: list[dict[str, Any]] = [
    # ── Foundations ───────────────────────────────────────────────────────────
    {
        "id":          "lesson_1",
        "title":       "The Alphabet & The Wheel",
        "subtitle":    "naturals & accidentals \u00b7 the chromatic loop \u00b7 find any note",
        # Full chromatic alphabet (root E = low-E open string). Used for ghosts
        # and for the "find any note" free-find challenge in the final phase.
        "notes":       ["E", "F", "F#", "G", "Ab", "A", "Bb", "B",
                        "C", "Db", "D", "Eb"],
        "phases": [
            {
                "label":         "The loop of 12",
                "desc":          "Crawl up the low E string, fret 0 \u2192 12. Every fret is one "
                                 "half-step; the 12th lands back on E.",
                "teach": """
<div class="primer-section">
  <h2>Lesson 1 \u00b7 The Musical Alphabet</h2>
  <h3>Twelve sounds, then it repeats</h3>
  <p>Western music is built from just <strong>12 pitches</strong> \u2014 the chromatic
  alphabet. Play them in order and the 13th is the same as the 1st, only higher.
  That repeat is the <strong>octave</strong>, and it is why a guitar with 22 frets
  isn't 22 different notes \u2014 it's the same 12, looping.</p>
  <p>On one string, moving up <strong>one fret = one half-step</strong>: the
  smallest move in the whole system. You're about to walk all 12 up the low E
  string. Fret 0 is E; twelve half-steps later, fret 12 is <strong>E again</strong>
  \u2014 your first proof that the alphabet loops.</p>
  <p>As a visual aid, each pitch keeps a <strong>fixed colour and shape</strong>, so
  the look changes from one fret to the next as you crawl. Treat it as
  embellishment \u2014 don't worry about decoding it. Just notice the alphabet
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
    <li><strong>Half-step = 1 fret.</strong> The smallest move \u2014 the next pitch up
    or down, with nothing between.</li>
    <li><strong>Whole step = 2 frets.</strong> Two half-steps stacked \u2014 with one
    pitch skipped over in the middle.</li>
  </ul>
  <p>That's it. A scale is just a particular <em>recipe</em> of halves and wholes,
  and a chord is notes pulled from that recipe. Before any of that, you need the
  ruler itself: be able to look at two frets and say \u201cthat's a whole step\u201d or
  \u201cthat's a half-step.\u201d</p>
  <p>The faint labelled dots on the board are your <strong>map</strong> \u2014 the seven
  natural notes, sitting where they actually fall. Notice they are <em>not</em>
  evenly spaced: some neighbours are 1 fret apart, others 2. That uneven spacing is
  the whole point of the next phase. For now, a fret lights up \u2014 name what's there
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
                "desc":          "A B C D E F G \u2014 and why the half-steps fall at E\u2013F and B\u2013C. "
                                 "Find each natural on the low E string.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Seven letters, unevenly spaced</h3>
  <p>The musical alphabet is only <strong>seven letters: A B C D E F G</strong>, then
  it wraps back to A. These are the <strong>natural</strong> notes \u2014 no sharp, no
  flat. On a piano they're the <strong>white keys</strong>.</p>
  <p>Here's the part that confuses everyone at first: the letters are <em>not</em>
  evenly spaced. Five of the gaps are a <strong>whole step</strong> (2 frets), but
  <strong>two</strong> of them \u2014 <strong>B\u2192C</strong> and <strong>E\u2192F</strong> \u2014 are
  only a <strong>half-step</strong> (1 fret). Nothing fits between B and C, or
  between E and F. On a piano, those are exactly the two spots with
  <strong>no black key</strong>.</p>
  <p>Watch it happen on the low E string \u2014 the labelled map shows the gaps:</p>
  <p style="font-family:monospace; line-height:1.7">
    E <span style="opacity:.6">(0)</span>
    \u2192<sup>1</sup> F <span style="opacity:.6">(1)</span>
    \u2192<sup>2</sup> G <span style="opacity:.6">(3)</span>
    \u2192<sup>2</sup> A <span style="opacity:.6">(5)</span>
    \u2192<sup>2</sup> B <span style="opacity:.6">(7)</span>
    \u2192<sup>1</sup> C <span style="opacity:.6">(8)</span>
    \u2192<sup>2</sup> D <span style="opacity:.6">(10)</span>
    \u2192<sup>2</sup> E <span style="opacity:.6">(12)</span>
  </p>
  <p>The little numbers are how many frets you jump: <strong>1\u20132\u20132\u20132\u20131\u20132\u20132</strong>.
  The two <strong>1</strong>s are E\u2192F and B\u2192C \u2014 the natural half-steps. Memorise
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
                "desc":          "The five in-between notes that fill the whole-step gaps \u2014 "
                                 "named as flats here, with a sharp twin coming next.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Filling the gaps: accidentals</h3>
  <p>Every whole-step gap between two naturals has <strong>one pitch hiding inside
  it</strong>. Those in-between pitches are the <strong>accidentals</strong>. There
  are exactly <strong>five</strong> of them \u2014 one in each of the five whole-step
  gaps. (B\u2013C and E\u2013F are already half-steps, so they have no room and no
  accidental.) That's <strong>7 naturals + 5 accidentals = the 12</strong> you
  crawled in phase 1. Nothing else exists.</p>
  <p>An accidental can be named two ways. Raise the natural <em>below</em> it by a
  half-step and you <strong>sharpen</strong>: the note above F is <strong>F#</strong>.
  Lower the natural <em>above</em> it by a half-step and you <strong>flatten</strong>:
  that same pitch, seen from G, is <strong>Gb</strong>. Same fret, same sound.</p>
  <p><strong>In this lesson the app shows the flat spelling</strong> (Bb, Eb, Ab,
  Db) for four of them, and F# for the one between F and G \u2014 simply because those
  are the most common everyday names. Don't worry that it isn't \u201call sharps\u201d or
  \u201call flats\u201d; the very next phase is about the fact that each one has
  <em>both</em> names. For now: a fret lights up between two labelled naturals \u2014
  name the accidental shown.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0],
                    "note_filter": "accidentals",
                    "count": 6,
                }],
            },
            {
                "label":         "Two names, one sound",
                "desc":          "The five in-between pitches each answer to two names. Name "
                                 "each one's twin.",
                "teach": """
<div class="primer-section">
  <h3>One fret can have two names</h3>
  <p>You just named the five accidentals using their flat spellings. But each one
  is also the <strong>sharp</strong> of the natural below it. <span class="note-ref
  psn-Fs">F#</span> and Gb are the <strong>same sound</strong> \u2014 same fret, same
  pitch. These are <strong>enharmonic</strong> twins: Db=C#, Eb=D#, Gb=F#, Ab=G#,
  Bb=A#.</p>
  <p>Which name you use depends on the musical context (the key you're in), but the
  sound is identical. The seven natural letters \u2014 A B C D E F G \u2014 have no twin.
  And the two places with no pitch between the letters at all \u2014
  <strong>B\u2192C</strong> and <strong>E\u2192F</strong> \u2014 are the half-steps you've now met
  three times.</p>
  <p>Name the enharmonic twin (the sharp spelling) of each flat below.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "patterns":      [{
                    "type": "recall",
                    "mode": "enharmonic",
                    "notes": ["F#", "Ab", "Bb", "Db", "Eb"],
                }],
            },
            {
                "label":         "The loop lives everywhere",
                "desc":          "Crawl up the A string. The same 12 pitches, starting from a "
                                 "different letter.",
                "teach": """
<div class="primer-section">
  <h3>The same 12, on every string</h3>
  <p>The alphabet isn't tied to one string. Crawl up the <strong>A string</strong>
  now and you'll meet the very same 12 pitches looping \u2014 they just start from a
  different letter (A at fret 0, A again at fret 12).</p>
  <p>The spacing rule travels with it: the natural half-steps still fall at
  <strong>B\u2192C</strong> and <strong>E\u2192F</strong>, just at different frets now (B\u2013C is
  frets 2\u20133 on this string, E\u2013F is frets 7\u20138). Same pattern, shifted to a new
  starting letter.</p>
  <p>This is the whole reason the fretboard is learnable: it's <strong>one
  repeating pattern of 12</strong>, shifted on each string. Once you accept that
  every string is the same loop, the neck stops being a field of random dots and
  becomes a map.</p>
</div>""",
                "walk_string":   1,
                "string_subset": [1],
                "fret_min":      0,
                "fret_max":      12,
                "patterns":      ["chromatic_walk"],
            },
            {
                "label":         "Naturals on a new string",
                "desc":          "Find the natural notes on the low E and A strings \u2014 the same "
                                 "spacing, two starting letters.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Same map, second string</h3>
  <p>Time to prove the spacing isn't memorised to one string. The lit fret now lands
  on either the <strong>low E</strong> or the <strong>A</strong> string, and you name
  the natural sitting there.</p>
  <p>The labelled map is still on \u2014 use it to confirm the half-step pairs in their
  new spots. On the A string the open note is A, so B\u2013C lands at frets 2\u20133 and E\u2013F
  at frets 7\u20138. Different frets, identical 1\u20132\u20132\u20132\u20131\u20132\u20132 shape.</p>
</div>""",
                "fret_min":      0,
                "fret_max":      12,
                "string_subset": [0, 1],
                "patterns":      [{
                    "type": "recall",
                    "mode": "name_fret",
                    "strings": [0, 1],
                    "note_filter": "naturals",
                    "count": 8,
                }],
            },
            {
                "label":         "Name it across strings",
                "desc":          "Now any note \u2014 natural or accidental \u2014 on the low E, A, or D "
                                 "string. Name it wherever it lands.",
                "reference":     "naturals",
                "teach": """
<div class="primer-section">
  <h3>Read any string, any note</h3>
  <p>Final reading drill before the challenge. The lit fret can now be
  <em>any</em> of the 12 \u2014 natural or accidental \u2014 on the <strong>E, A, or D</strong>
  string. Name what's there.</p>
  <p>The rule never changes: count up from the open string, <strong>one half-step
  per fret</strong>. The natural map is still faintly labelled to anchor you; an
  accidental sits one fret above the natural below it. This is the skill the rest of
  the course quietly assumes \u2014 see a position, know its name.</p>
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
                "desc":          "Name a pitch, then locate it anywhere on the neck \u2014 any "
                                 "string, any position.",
                "is_challenge":  True,
                "teach": """
<div class="primer-section">
  <h3>Now find it anywhere</h3>
  <p>You've crawled the loop, measured half- and whole-steps, named the naturals and
  learned why they're spaced as they are, filled in the accidentals, met the twin
  names, and read frets across several strings. The last step is to <strong>apply
  it</strong>: you'll be given a pitch and have to find it <em>anywhere</em> on the
  neck \u2014 any string, any position that holds it.</p>
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
            "natural letters (A\u2013G) and the five sharps and flats that fill the gaps "
            "between them. Crawl the loop one fret at a time, name the naturals and "
            "accidentals where they live, meet the enharmonic twins, read frets across "
            "several strings, and finish by finding any note anywhere on the neck. This "
            "is the alphabet every scale, chord, and riff is spelled from."
        ),
        "color":       NOTE_SYSTEM["E"]["color"],
        "icon":        "\u2192",
    },
    # ── Pentatonic track ──────────────────────────────────────────────────────
    {
        "id":          "c_pent",
        "title":       "C Major Pentatonic",
        "subtitle":    "5 notes · start here",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      _PENT_PHASES,
        "pass_score":  None,  # phase-queue based; no fixed total
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
        "title":       "F Major Pentatonic",
        "subtitle":    "5 notes · one step left on the CoF",
        "notes":       ["F", "G", "A", "C", "D"],
        "phases":      _PENT_PHASES,
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
        "title":       "G Major Pentatonic",
        "subtitle":    "5 notes · one step right on the CoF",
        "notes":       ["G", "A", "B", "D", "E"],
        "phases":      _PENT_PHASES,
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
        "title":       "C Major Scale",
        "subtitle":    "7 notes · the full picture",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      _MAJOR_PHASES,
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
        "title":       "F Major Scale",
        "subtitle":    "7 notes · one flat (Bb)",
        "notes":       ["F", "G", "A", "Bb", "C", "D", "E"],
        "phases":      _MAJOR_PHASES,
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
        "title":       "G Major Scale",
        "subtitle":    "7 notes · one sharp (F#)",
        "notes":       ["G", "A", "B", "C", "D", "E", "F#"],
        "phases":      _MAJOR_PHASES,
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
        "title":       "C Major — Single String",
        "subtitle":    "7 notes · one string · linear geometry",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      _unitar_phases(),
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
# Interval track
# ---------------------------------------------------------------------------
# Stages are grouped by interval family (2nds, 3rds, 4ths … octave).
# Each family stage uses chromatic notes (all 12) as its note set so that
# every semitone variant of that family can appear as a lo or hi note.
#
# Phase progression within each family:
#   Phases 1–4 : 3-string subsets  (E-A-D, A-D-G, D-G-B, G-B-e)
#   Phases 5–7 : 4-string subsets  (E-A-D-G, A-D-G-B, D-G-B-e)
# This forces the student to confront every string-crossing shape before
# moving to a wider context.
#
# The "G–B exception" (those strings are a M3 apart, not a P4) is called
# out explicitly in the phase description so it isn't surprising.
# ---------------------------------------------------------------------------

_ALL_CHROM = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# String indices: 0=E2  1=A2  2=D3  3=G3  4=B3  5=E4
# Each tuple is (display label, list of string indices passed to buildShapeDiagram).
_2_STRING_SUBSETS = [
    ("E A",  [0, 1]),
    ("A D",  [1, 2]),
    ("D G",  [2, 3]),
    ("G B",  [3, 4]),  # the G–B major-3rd anomaly in its most isolated form
    ("B e",  [4, 5]),
]
_3_STRING_SUBSETS = [
    ("E A D", [0, 1, 2]),
    ("A D G", [1, 2, 3]),
    ("D G B", [2, 3, 4]),  # includes the G–B major-3rd anomaly
    ("G B e", [3, 4, 5]),
]
_4_STRING_SUBSETS = [
    ("E A D G", [0, 1, 2, 3]),
    ("A D G B", [1, 2, 3, 4]),
    ("D G B e", [2, 3, 4, 5]),  # includes the G–B anomaly on both sides
]

def _interval_family_phases(semis_list: list[int]) -> list[dict]:
    """Build the phase progression for one interval family.

    Args:
        semis_list: The semitone counts that define this family, e.g. [3, 4]
                    for thirds.  Passed through to the phase dict and read by
                    the JS queue builder to filter which note pairs to drill.

    Returns:
        12 phase dicts: 5 using 2-string subsets, then 4 using 3-string
        subsets, then 3 using 4-string subsets.  Each subset group isolates
        a progressively wider slice of the neck so the student internalizes
        each shape before encountering more crossing options at once.
    """
    phases = []
    for lbl, subset in _2_STRING_SUBSETS:
        phases.append({
            "label":               f"{lbl}  (2 strings)",
            "is_challenge":        False,
            "string_subset":       subset,
            "interval_semis_list": semis_list,
            "fret_min":            0,
            "fret_max":            12,
            "patterns":            ["string_interval"],
        })
    for lbl, subset in _3_STRING_SUBSETS:
        phases.append({
            "label":               f"{lbl}  (3 strings)",
            "is_challenge":        True,   # wider crossing — exhaustive drilling
            "string_subset":       subset,
            "interval_semis_list": semis_list,
            "fret_min":            0,
            "fret_max":            12,
            "patterns":            ["string_interval"],
        })
    for lbl, subset in _4_STRING_SUBSETS:
        phases.append({
            "label":               f"{lbl}  (4 strings)",
            "is_challenge":        True,   # widest crossing — completionist territory
            "string_subset":       subset,
            "interval_semis_list": semis_list,
            "fret_min":            0,
            "fret_max":            12,
            "patterns":            ["string_interval"],
        })
    return phases

# Entry point into the interval track.
# Uses the standard diatonic-interval pattern (not string_interval) so the
# student sees intervals they already know from the pentatonic stages first,
# before tackling chromatic families with unfamiliar shapes.
_PENT_INTERVAL_PHASES = [
    {
        "label":    "Open position (C-shape)",
        "box":      "C",
        "fret_min": 0,
        "fret_max": 4,
        "patterns": ["scale_up", "intervals"],
    },
    {
        "label":    "Mid neck (A-shape)",
        "box":      "A",
        "fret_min": 5,
        "fret_max": 9,
        "patterns": ["scale_up", "intervals"],
    },
    {
        "label":    "Upper neck (G-shape)",
        "box":      "G",
        "fret_min": 9,
        "fret_max": 13,
        "patterns": ["scale_up", "intervals"],
    },
]

# One entry per interval family in ascending order.
# The loop below converts these into full stage dicts and appends them to STAGES.
# Format: (stage_id, display_title, subtitle_tagline, [semitone_values])
_INT_FAMILY_DEFS = [
    ("int_2nds",    "Seconds",   "m2 + M2  ·  1–2 semitones",       [1, 2]),
    ("int_3rds",    "Thirds",    "m3 + M3  ·  3–4 semitones",       [3, 4]),
    ("int_4ths",    "Fourths",   "P4  ·  5 semitones",              [5]),
    ("int_tritone", "Tritone",   "Aug4 / Dim5  ·  6 semitones",     [6]),
    ("int_5ths",    "Fifths",    "P5  ·  7 semitones",              [7]),
    ("int_6ths",    "Sixths",    "m6 + M6  ·  8–9 semitones",       [8, 9]),
    ("int_7ths",    "Sevenths",  "m7 + M7  ·  10–11 semitones",     [10, 11]),
    ("int_octave",  "Octave",    "same note, 8va  ·  12 semitones",  [12]),
]
# Pre-extracted IDs used to build requires/unlocks chains in the loop below.
_INT_FAM_IDS = [d[0] for d in _INT_FAMILY_DEFS]

_INTERVAL_STAGES: list[dict[str, Any]] = [
    {
        "id":          "int_pent",
        "title":       "Pentatonic Intervals",
        "subtitle":    "M3 and P4  ·  familiar ground first",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      _PENT_INTERVAL_PHASES,
        "pass_score":  None,
        "requires":    [],
        "unlocks":     ["int_2nds"],
        "description": (
            "Start with the two intervals hiding inside the C major pentatonic: "
            "the Major 3rd (C→E) and Perfect 4th (D→G, E→A). "
            "Learn their shapes on every box before moving to all intervals."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "↕",
        "interval_stage": True,
    }
]
# Build one stage per family: each unlocks the next in ascending semitone order.
for _i, (_sid, _title, _sub, _semis_list) in enumerate(_INT_FAMILY_DEFS):
    _requires = ["int_pent"] if _i == 0 else [_INT_FAM_IDS[_i - 1]]  # linear chain
    _unlocks  = [] if _i == len(_INT_FAMILY_DEFS) - 1 else [_INT_FAM_IDS[_i + 1]]
    _INTERVAL_STAGES.append({
        "id":             _sid,
        "title":          _title,
        "subtitle":       _sub,
        "notes":          _ALL_CHROM,
        "phases":         _interval_family_phases(_semis_list),
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
# Three stages follow the interval track, each drilling a different chord
# category from C major pentatonic.  Pattern 'chord_shape' in theory.js
# reads phase.chord_root + phase.chord_intervals to enumerate every playable
# voicing on 3- and 4-string adjacent subsets, then creates arpeggio tasks.
#
# Stage progression:
#   chord_3rds — root-position triads from stacked thirds (Cmaj, Am + ext.)
#   chord_sus  — suspended chords (2nds + 4ths/5ths from the pentatonic)
#   chord_inv  — first and second inversions of the thirds-based triads
# ---------------------------------------------------------------------------

def _chord_phases(chord_defs: list) -> list[dict]:
    """Build one phase per entry in chord_defs.

    Each entry: (label, chord_name, chord_root, intervals, description).
    The phase dict is consumed by buildQueueTasks('chord_shape') in theory.js.
    """
    phases = []
    for lbl, chord_name, chord_root, intervals, desc in chord_defs:
        phases.append({
            "label":           lbl,
            "is_challenge":    False,
            "chord_name":      chord_name,
            "chord_root":      chord_root,
            "chord_intervals": intervals,
            "chord_desc":      desc,
            "fret_min":        0,
            "fret_max":        12,
            "patterns":        ["chord_shape"],
        })
    return phases


# (label, chord_name, chord_root, intervals_from_root, description)
# All tones are from C major pentatonic {C, D, E, G, A}.
_CHORD_3RDS_DEFS = [
    ("C major",    "Cmaj",  "C", [0, 4, 7],     "C–E–G  ·  1–3–5"),
    ("A minor",    "Am",    "A", [0, 3, 7],     "A–C–E  ·  1–b3–5"),
    ("C major 6",  "Cmaj6", "C", [0, 4, 7, 9],  "C–E–G–A  ·  1–3–5–6"),
    ("A minor 7",  "Am7",   "A", [0, 3, 7, 10], "A–C–E–G  ·  1–b3–5–b7"),
]

# Suspended chords: replace the third with a 2nd or 4th, keep the 5th.
_CHORD_SUS_DEFS = [
    ("Csus2", "Csus2", "C", [0, 2, 7], "C–D–G  ·  1–2–5"),
    ("Dsus4", "Dsus4", "D", [0, 5, 7], "D–G–A  ·  1–4–5"),
    ("Gsus2", "Gsus2", "G", [0, 2, 7], "G–A–D  ·  1–2–5"),
    ("Asus4", "Asus4", "A", [0, 5, 7], "A–D–E  ·  1–4–5"),
]

# Inversions: chord_root is the bass note; intervals are from that bass note.
#   Cmaj 1st inv: bass=E → E(0)–G(3)–C(8)   (b3 + m6 above E)
#   Cmaj 2nd inv: bass=G → G(0)–C(5)–E(9)   (P4 + M6 above G)
#   Am  1st inv: bass=C → C(0)–E(4)–A(9)    (M3 + M6 above C)
#   Am  2nd inv: bass=E → E(0)–A(5)–C(8)    (P4 + m6 above E)
_CHORD_INV_DEFS = [
    ("Cmaj / E bass  (1st inv)", "Cmaj/E", "E", [0, 3, 8], "E–G–C"),
    ("Cmaj / G bass  (2nd inv)", "Cmaj/G", "G", [0, 5, 9], "G–C–E"),
    ("Am / C bass  (1st inv)",   "Am/C",   "C", [0, 4, 9], "C–E–A"),
    ("Am / E bass  (2nd inv)",   "Am/E",   "E", [0, 5, 8], "E–A–C"),
]

# ---------------------------------------------------------------------------
# Diatonic triads for C major — 7 chords, positionally gated
# ---------------------------------------------------------------------------
# Each phase groups related function chords (tonic/subdominant/dominant, or
# just major vs minor) so the student hears harmonic context, not just shapes.
#
# Phase structure per box (3 boxes + full neck):
#   box/major — I IV V  (the three major-quality chords)
#   box/minor — ii iii vi vii°  (the four minor/dim chords)
# Full-neck phase drills all seven in one sweep.

_DIATONIC_C = [
    {"chord_name": "Cmaj", "chord_root": "C", "chord_intervals": [0, 4, 7], "chord_desc": "C–E–G  ·  I"},
    {"chord_name": "Dm",   "chord_root": "D", "chord_intervals": [0, 3, 7], "chord_desc": "D–F–A  ·  ii"},
    {"chord_name": "Em",   "chord_root": "E", "chord_intervals": [0, 3, 7], "chord_desc": "E–G–B  ·  iii"},
    {"chord_name": "Fmaj", "chord_root": "F", "chord_intervals": [0, 4, 7], "chord_desc": "F–A–C  ·  IV"},
    {"chord_name": "Gmaj", "chord_root": "G", "chord_intervals": [0, 4, 7], "chord_desc": "G–B–D  ·  V"},
    {"chord_name": "Am",   "chord_root": "A", "chord_intervals": [0, 3, 7], "chord_desc": "A–C–E  ·  vi"},
    {"chord_name": "Bdim", "chord_root": "B", "chord_intervals": [0, 3, 6], "chord_desc": "B–D–F  ·  vii°"},
]

_IVV   = [_DIATONIC_C[i] for i in [0, 3, 4]]  # Cmaj Fmaj Gmaj
_minor = [_DIATONIC_C[i] for i in [1, 2, 5, 6]]  # Dm Em Am Bdim
_all7  = _DIATONIC_C


def _diatonic_phases() -> list[dict]:
    phases = []
    for fret_min, fret_max, box_label, is_challenge in [
        (0, 4,  "Open box",   False),   # Core — the first shapes students encounter
        (5, 9,  "Mid box",    True),    # Challenge — same chords, different position
        (9, 13, "Upper box",  True),    # Challenge — same chords, upper register
    ]:
        phases.append({
            "label":        f"{box_label} — I IV V",
            "is_challenge": is_challenge,
            "fret_min":     fret_min,
            "fret_max":     fret_max,
            "patterns":     ["box_chords"],
            "box_chords":   _IVV,
        })
        phases.append({
            "label":        f"{box_label} — ii iii vi vii\u00b0",
            "is_challenge": is_challenge,
            "fret_min":     fret_min,
            "fret_max":     fret_max,
            "patterns":     ["box_chords"],
            "box_chords":   _minor,
        })
    phases.append({
        "label":        "Full neck \u2014 all 7 chords",
        "is_challenge": True,           # Full-neck sweep — completionist territory
        "fret_min":     0,
        "fret_max":     12,
        "patterns":     ["box_chords"],
        "box_chords":   _all7,
    })
    return phases


# ---------------------------------------------------------------------------
# Voice-leading progressions
# ---------------------------------------------------------------------------
# Pattern 'voice_lead' in theory.js plays ONE voicing per chord, chosen by a
# Viterbi search over voiceLeadingCost so the fretting hand travels the
# shortest total distance through the sequence (minimal-motion voice leading).
# Each phase supplies an ordered chord_sequence drawn from _DIATONIC_C.
# ---------------------------------------------------------------------------

_PROG_ii_V_I    = [_DIATONIC_C[i] for i in [1, 4, 0]]     # Dm   Gmaj Cmaj
_PROG_I_vi_IV_V = [_DIATONIC_C[i] for i in [0, 5, 3, 4]]  # Cmaj Am   Fmaj Gmaj
_PROG_I_IV_V_I  = [_DIATONIC_C[i] for i in [0, 3, 4, 0]]  # Cmaj Fmaj Gmaj Cmaj


def _voice_lead_phases() -> list[dict]:
    progs = [
        ("ii \u2013 V \u2013 I",              _PROG_ii_V_I),
        ("I \u2013 vi \u2013 IV \u2013 V",     _PROG_I_vi_IV_V),
        ("I \u2013 IV \u2013 V \u2013 I",      _PROG_I_IV_V_I),
    ]
    phases = []
    for label, seq in progs:
        phases.append({
            "label":          f"{label}  \u00b7  smooth path",
            "is_challenge":   False,
            "fret_min":       0,
            "fret_max":       12,
            "patterns":       ["voice_lead"],
            "chord_sequence": seq,
        })
    return phases


_CHORD_STAGES: list[dict] = [
    {
        "id":          "c_diatonic_triads",
        "title":       "C Major Diatonic Triads",
        "subtitle":    "All 7 chords · positionally gated",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      _diatonic_phases(),
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
        "title":       "Thirds · Triads",
        "subtitle":    "Cmaj + Am  ·  stacked thirds",
        "notes":       ["C", "D", "E", "G", "A"],   # C major pentatonic context
        "phases":      _chord_phases(_CHORD_3RDS_DEFS),
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
        "title":       "Fourths · Sus Chords",
        "subtitle":    "sus2 + sus4  ·  seconds and fourths",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      _chord_phases(_CHORD_SUS_DEFS),
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
        "title":       "Inversions",
        "subtitle":    "Cmaj + Am  ·  bass on 3rd or 5th",
        "notes":       ["C", "D", "E", "G", "A"],
        "phases":      _chord_phases(_CHORD_INV_DEFS),
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
        "title":       "Voice Leading",
        "subtitle":    "Smoothest path through a progression",
        "notes":       ["C", "D", "E", "F", "G", "A", "B"],
        "phases":      _voice_lead_phases(),
        "pass_score":  None,
        "requires":    ["c_diatonic_triads"],
        "unlocks":     [],
        "description": (
            "Play a progression the way a guitarist actually does — keeping the "
            "fretting hand still.  Each chord is voiced to share as many notes "
            "and strings as possible with the one before it, so your fingers "
            "slide the shortest distance instead of jumping across the neck."
        ),
        "color":       NOTE_SYSTEM["C"]["color"],
        "icon":        "⬡",
        "chord_stage": True,
    },
]

STAGES.extend(_CHORD_STAGES)

# Fast O(1) lookup by stage id — used by get_stage() and the route handlers.
STAGE_MAP: dict[str, dict] = {s["id"]: s for s in STAGES}

# ---------------------------------------------------------------------------
# Module groupings — drives the Module/Lesson card layout on /learn
# ---------------------------------------------------------------------------

# Primer URLs: stages that have a theory primer HTML file.
# lesson_1 intentionally omitted — it now teaches via per-phase `teach` cards
# (chunked concept→drill) instead of one upfront primer modal.
_STAGE_PRIMER_URLS: dict[str, str] = {
    "c_pent":  "/primer/c_pent",
    "c_major": "/primer/c_major",
    "c_major_unitar": "/primer/c_major_unitar",
}

# Module each stage belongs to.
_STAGE_MODULE_MAP: dict[str, str] = {
    "lesson_1":          "foundations",
    "c_pent":            "pentatonic",
    "f_pent":            "pentatonic",
    "g_pent":            "pentatonic",
    "c_major":           "major",
    "f_major":           "major",
    "g_major":           "major",
    "c_major_unitar":    "major",
    "c_diatonic_triads": "major",
    "int_pent":          "intervals",
    "int_2nds":          "intervals",
    "int_3rds":          "intervals",
    "int_4ths":          "intervals",
    "int_tritone":       "intervals",
    "int_5ths":          "intervals",
    "int_6ths":          "intervals",
    "int_7ths":          "intervals",
    "int_octave":        "intervals",
    "chord_3rds":        "harmony",
    "chord_sus":         "harmony",
    "chord_inv":         "harmony",
    "chord_voice_lead":  "harmony",
}

# Annotate every stage with module, has_challenge, and primer_url (if available).
for _s in STAGES:
    _s["module"]        = _STAGE_MODULE_MAP.get(_s["id"], "uncategorized")
    _s["has_challenge"] = any(ph.get("is_challenge", False) for ph in _s.get("phases", []))
    if _s["id"] in _STAGE_PRIMER_URLS:
        _s["primer_url"] = _STAGE_PRIMER_URLS[_s["id"]]

MODULES: list[dict] = [
    {
        "id":        "foundations",
        "title":     "Module 0: Foundations",
        "tagline":   "12 notes · the raw alphabet",
        "description": (
            "Before scales, before chords — the 12-note chromatic alphabet that everything "
            "else is spelled from. Walk it one fret at a time up a single string and watch how "
            "each half-step flips the note's shape and leaps across the colour wheel. This is "
            "the bedrock the rest of the curriculum builds on."
        ),
        "stage_ids": ["lesson_1"],
    },
    {
        "id":        "pentatonic",
        "title":     "Module 1: The Pentatonic Engine",
        "tagline":   "5 safe notes · the universal foundation",
        "description": (
            "The pentatonic scale removes the two \u2018tension\u2019 notes \u2014 the 4th and the 7th \u2014 "
            "from the major scale, leaving 5 pitches that sound consonant over almost any chord. "
            "Nearly every guitarist starts here. Learn to find all five notes anywhere on the neck "
            "across three positional boxes, then connect them into a single continuous map."
        ),
        "stage_ids": ["c_pent", "f_pent", "g_pent"],
    },
    {
        "id":        "major",
        "title":     "Module 2: The Major Ecosystem",
        "tagline":   "7 notes · half-steps · diatonic harmony",
        "description": (
            "Add the two missing notes back in to unlock the full major scale. "
            "The new half-steps \u2014 E\u2192F and B\u2192C \u2014 create tension and resolution: the engine of "
            "all Western harmony. Once you can navigate the scale, you build its 7 diatonic triads "
            "and begin hearing how they function inside the key."
        ),
        "stage_ids": ["c_major", "f_major", "g_major", "c_major_unitar", "c_diatonic_triads"],
    },
    {
        "id":        "intervals",
        "title":     "Module 3: Interval Mastery",
        "tagline":   "Every distance · every string pair",
        "description": (
            "An interval is the distance between two notes. Knowing every interval shape on every "
            "string pair gives you absolute fretboard fluency \u2014 you stop thinking in scale boxes "
            "and start thinking in relationships. "
            "The G\u2013B string pair is a special case: it has a major 3rd gap (4 semitones) "
            "instead of the perfect 4th (5 semitones) found on every other adjacent pair."
        ),
        "stage_ids": ["int_pent", "int_2nds", "int_3rds", "int_4ths",
                      "int_tritone", "int_5ths", "int_6ths", "int_7ths", "int_octave"],
    },
    {
        "id":        "harmony",
        "title":     "Module 4: Harmony & Chords",
        "tagline":   "Triads · suspended shapes · inversions",
        "description": (
            "Chords are stacked intervals. Start with root-position triads (stacked thirds), "
            "then explore suspended shapes that replace the third with a 2nd or 4th, "
            "then inversions that place the 3rd or 5th in the bass. "
            "Same chord tones \u2014 entirely different colour and tension."
        ),
        "stage_ids": ["chord_3rds", "chord_sus", "chord_inv", "chord_voice_lead"],
    },
]

# ---------------------------------------------------------------------------
# Master syllabus — the full 5-semester, 43-lesson roadmap.
#
# This is the high-level *spine* shown on /learn. It does NOT redefine progress,
# colour, or unlock data — those stay in STAGES (the source of truth for every
# playable drill). Each lesson here references zero or more existing stage ids:
#   • one+ stage_ids  → a built, playable lesson (links into /learn/{stage_id})
#   • [] (empty)      → a planned lesson, rendered as a locked "Planned" node
#
# Because the real curriculum is more granular than the 43-lesson outline
# (e.g. "Intervals" = 9 stages), a single lesson may cluster several stages.
# Every one of the 22 real stages appears in exactly one lesson below.
# ---------------------------------------------------------------------------
def _lesson(num: int, title: str, stages: list[str] | None = None,
            summary: str = "") -> dict:
    return {"num": num, "title": title, "stages": stages or [], "summary": summary}


SEMESTERS: list[dict] = [
    {
        "id":       "sem1",
        "num":      1,
        "title":    "The Language & The Major Framework",
        "subtitle": "Notation, the major scale, and how the neck is spelled",
        "lessons": [
            _lesson(1,  "The Musical Alphabet", ["lesson_1"],
                    "The language of music: the 12 chromatic pitches and the idea of "
                    "enharmonics. It's dry, but it's the bridge every later topic is built on "
                    "\u2014 you can't learn the language without its alphabet."),
            _lesson(2,  "The Music Staff & Fretboard Mapping", None,
                    "Where those 12 notes physically live \u2014 on the staff and on your "
                    "fretboard. Theory stays abstract until you can instantly find it on your "
                    "instrument."),
            _lesson(3,  "The Major Scale", ["c_major", "f_major", "g_major", "c_major_unitar"],
                    "The first immediately-practical topic: roughly 90% of theory either "
                    "derives from or is measured against the major scale. On guitar, one "
                    "movable shape generates all twelve of them."),
            _lesson(4,  "Rhythm Basics", None,
                    "Music is *what* note and *when*. Counting, vocalizing, and syncopation "
                    "\u2014 ignore the 'when' and you're missing half of music."),
            _lesson(5,  "Meter & Time Signature", None,
                    "How rhythm is grouped into measures. Understanding meter is what lets you "
                    "write rhythmically varied music instead of something flat and boring."),
            _lesson(6,  "Audiation & Melody", None,
                    "Hearing music in your head and reproducing it with your voice \u2014 the "
                    "core human act of composing, whether or not you play an instrument."),
            _lesson(7,  "Key Signatures & Enharmonics", None,
                    "The notation bookkeeping for reading and analyzing scores. Annoying and "
                    "not always musical, but it's how you speak the same language as other "
                    "musicians."),
            _lesson(8,  "Scale Degrees", None,
                    "Stop thinking C\u2013D\u2013E and start thinking 1\u20132\u20133. Numbering the scale "
                    "frees you from keys and letters \u2014 a huge advantage on a big fretboard, "
                    "and the doorway to intervals."),
            _lesson(9,  "Intervals", ["int_pent", "int_2nds", "int_3rds", "int_4ths",
                                       "int_tritone", "int_5ths", "int_6ths",
                                       "int_7ths", "int_octave"],
                    "The distance between two notes. Learn every interval shape on every string "
                    "pair and you stop thinking in scale boxes and start thinking in pure "
                    "relationships \u2014 total fretboard fluency."),
        ],
    },
    {
        "id":       "sem2",
        "num":      2,
        "title":    "Diatonic Harmony & \u201cSafe\u201d Solos",
        "subtitle": "Building chords from the scale and the notes that always work",
        "lessons": [
            _lesson(10, "Basic Triads", ["chord_3rds"],
                    "Chords start here. There are only four triad types, so it's digestible "
                    "\u2014 but only if the alphabet, scale, and intervals are already solid."),
            _lesson(11, "Movable Chords", None,
                    "Bar chords: a single triad shape you can slide anywhere to generate every "
                    "chord. Pure leverage \u2014 learn the shapes once, play them in any key."),
            _lesson(12, "Diatonic Chords of the Major Scale", ["c_diatonic_triads"],
                    "The pot of gold. The chords that live inside a major scale, plus Roman-"
                    "numeral notation. An astonishing amount of music relies on just this one "
                    "concept."),
            _lesson(13, "Chord Progressions in Major", ["chord_voice_lead"],
                    "Now write with those diatonic chords. It's easy because thousands of songs "
                    "model it \u2014 learn them, analyze them, and keep referring back to the "
                    "scale."),
            _lesson(14, "Pentatonic Major", ["c_pent", "f_pent", "g_pent"],
                    "The safe 5-note version of the major scale: it never clashes over a major "
                    "progression. The place to start writing leads \u2014 and where most players "
                    "begin, but you'll arrive able to actually apply it."),
            _lesson(15, "Suspended Chords", ["chord_sus"],
                    "Modifying triads (sus2 / sus4) to color and improve your major and minor "
                    "chords. A composer's first real 'how do I make this better?' tool."),
        ],
    },
    {
        "id":       "sem3",
        "num":      3,
        "title":    "The Minor World & Relativity",
        "subtitle": "The other tonality and how it relates to major",
        "lessons": [
            _lesson(16, "The Minor Scale", None,
                    "Major's evil twin: the same machinery, a drastically different mood. It "
                    "has its own diatonic chords, just like major."),
            _lesson(17, "Chord Progressions in Minor", None,
                    "Write in the minor world too. Now you can compose in both tonalities and "
                    "move between their emotional colors."),
            _lesson(18, "Pentatonic Minor", None,
                    "The king of scales \u2014 it sounds good over almost anything in minor. Most "
                    "players learn it far too early to use it; by now you can apply it right "
                    "out of the gate."),
            _lesson(19, "Ear Training (Intervals & Chords)", None,
                    "Hear music and know exactly what it is. It feels like magic but it's pure "
                    "skill-building \u2014 it turns the sounds you hear into instant musical "
                    "understanding, no perfect pitch required."),
            _lesson(20, "Power Chords", None,
                    "Entire genres are built on nothing else. Apply everything you've learned "
                    "to them \u2014 and even non-guitarists should understand why players are so "
                    "obsessed with this sound."),
            _lesson(21, "Relativity & Tonal Center", None,
                    "The confusing-but-crucial duality that major and minor scales are the same "
                    "notes seen from different homes. Grasp this and you unlock modes."),
            _lesson(22, "Combining Pentatonic Shapes", None,
                    "Why the five pentatonic shapes connect into one map across the neck \u2014 "
                    "which only makes sense once you understand relativity and tonal center."),
        ],
    },
    {
        "id":       "sem4",
        "num":      4,
        "title":    "Advanced Movement & Tension",
        "subtitle": "Arpeggios, sevenths, blues, and chromatic colour chords",
        "lessons": [
            _lesson(23, "Arpeggios & Chord Tones", None,
                    "Beyond spamming the pentatonic: target the actual chord tones with the "
                    "full scale. Essential for any instrument that plays lead lines."),
            _lesson(24, "Inversions", ["chord_inv"],
                    "Rearranging a chord's notes. Taught too early to most players, who then "
                    "don't know why \u2014 with theory behind you, you finally know how to use "
                    "them."),
            _lesson(25, "Slash Chords", None,
                    "A notation for inversions and deliberate bass-note choices. Simple, but "
                    "powerful once the basic triads are second nature."),
            _lesson(26, "Seventh Chords (Maj7, Min7, Dom7)", None,
                    "The three sevenths are everywhere in music. You'll apply them instantly "
                    "because you can already see how they fit into the major and minor scales."),
            _lesson(27, "The Major Blues", None,
                    "A whole genre built on what you already know, and the best precursor to "
                    "jazz. Learn the core concept \u2014 not just licks to mimic."),
            _lesson(28, "The Minor Blues", None,
                    "The minor side of the blues: another application of sevenths and "
                    "pentatonics, and another stepping stone toward jazz."),
            _lesson(29, "Secondary Dominants", None,
                    "Your first chords from *outside* the key. Up to now you've used seven "
                    "notes \u2014 these add pull and color beyond them."),
            _lesson(30, "Diminished Chords", None,
                    "The big, bad chord. Not diatonic to major or minor, but everywhere in "
                    "interesting music \u2014 full and half-diminished. Get the basics down first."),
            _lesson(31, "Augmented Chords", None,
                    "Rare, weird, specialized colors. Tricky to use, but distinctive \u2014 and "
                    "far easier to understand now that you're advanced."),
        ],
    },
    {
        "id":       "sem5",
        "num":      5,
        "title":    "Chromaticism, Modes & Songwriting",
        "subtitle": "Beyond the key — modes, modulation, and arrangement",
        "lessons": [
            _lesson(32, "The Harmonic Minor Scale", None,
                    "An exotic, dramatic tonality that doesn't sound Western at all. Inside it "
                    "you'll find the diminished and augmented chords you just learned."),
            _lesson(33, "Writing a Melody", None,
                    "Back to a basic topic with new eyes: the tips, trends, and 'secret sauce' "
                    "behind melodies that actually work."),
            _lesson(34, "Passing Tones & Chromaticism", None,
                    "Escaping the seven-note prison: notes outside the scale that bridge the "
                    "gaps between scale tones. The chromatic alphabet returns \u2014 now used "
                    "musically."),
            _lesson(35, "The Bebop Scales", None,
                    "Major scales and modes with one added note \u2014 eight notes total, with "
                    "chromaticism baked right in."),
            _lesson(36, "The Modes of Major", None,
                    "Each mode is its own world: Mixolydian (classic rock), Lydian (prog / "
                    "ambient), Phrygian (metal / eastern). Easy to digest once major and minor "
                    "are solid."),
            _lesson(37, "Modulation & Transposition", None,
                    "Changing keys on purpose. Not just *how* to modulate, but *why* composers "
                    "do it and which keys they tend to move to."),
            _lesson(38, "Modal Interchange", None,
                    "Borrowing chords from a parallel key (modal mixture). A single tool that "
                    "ties together nearly everything you've learned."),
            _lesson(39, "Modern Song Sections", None,
                    "Verses, pre-choruses, bridges, post-choruses \u2014 the functional parts of "
                    "contemporary songs, not the rondo and sonata forms from school."),
            _lesson(40, "Song Structures", None,
                    "Assembling those sections into whole songs. The cookie-cutter forms, and "
                    "how small changes make them feel fresh instead of generic."),
            _lesson(41, "Writing Drum Parts", None,
                    "Groove and energy live in the rhythm section. Even guitarists need this "
                    "language \u2014 it's what keeps a song from falling flat."),
            _lesson(42, "Writing Bass Parts", None,
                    "The bass shares four strings with the guitar but follows very different "
                    "rules. Its own approach to writing a line."),
            _lesson(43, "Timbre & Production", None,
                    "How and why a note sounds the way it does \u2014 the abstract edge of theory "
                    "that leads into production and EQ."),
        ],
    },
]

# Row layout for the visual map — each inner list is one horizontal row.
# Order within a row is left-to-right display order.
STAGE_ROWS = [
    ["c_pent"],
    ["f_pent", "g_pent"],
    ["c_major"],
    ["f_major", "g_major"],    # ── Diatonic chord track ─────────────────────────────────────────────────────
    ["c_diatonic_triads"],    # ── Interval track ────────────────────────────────────────────────────
    ["int_pent"],
    ["int_2nds", "int_3rds"],
    ["int_4ths", "int_tritone", "int_5ths"],
    ["int_6ths", "int_7ths", "int_octave"],
    # ── Chord track ───────────────────────────────────────────────────────
    ["chord_3rds"],
    ["chord_sus", "chord_inv"],
]


def get_stage(stage_id: str) -> dict | None:
    return STAGE_MAP.get(stage_id)


def stage_note_info(stage: dict) -> list[dict]:
    """Return [{name, color, shape}, ...] for every note in the stage."""
    return [
        {"name": n, **NOTE_SYSTEM[n]}
        for n in stage["notes"]
        if n in NOTE_SYSTEM
    ]


def random_stage_note(stage: dict) -> str:
    return random.choice(stage["notes"])


def stars_for_score(correct: int, wrong: int, pass_score: int) -> int:
    """Map a raw correct/wrong count to a 0–3 star rating.

    1 star : reached pass_score regardless of errors
    2 stars: reached pass_score with at most 1 wrong answer
    3 stars: reached pass_score with zero wrong answers (perfect)
    0       : did not reach pass_score
    """
    if correct < pass_score:
        return 0
    if wrong == 0:
        return 3
    if wrong <= 1:
        return 2
    return 1
