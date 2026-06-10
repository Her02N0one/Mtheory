"""
phases.py — Reusable phase templates and factory functions.

A "phase" is one segment of a stage: a fret range, a list of patterns,
and optional metadata (box name, challenge flag, teach HTML).  Phases are
consumed in order by the client-side queue builder in theory.js.

To add a new phase template: define a list or function here and import it
in stages.py.  To add a new pattern keyword: add a handler in theory.js
(see QS_LABELS / buildQueueTasks) and use the keyword in a pattern list here.
"""

from typing import Any


# ---------------------------------------------------------------------------
# Pentatonic phase template
# ---------------------------------------------------------------------------
# Shared by all 5-note stages (C, F, G pentatonic).
# Patterns build deliberately: Phase 0 orients, Phases 1-2 add intervals and
# chord shapes, challenge phases consolidate across positions.

PENT_PHASES: list[dict[str, Any]] = [
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


# ---------------------------------------------------------------------------
# Major scale phase template
# ---------------------------------------------------------------------------
# Shared by C, F, G major stages.
# reps=1 for intervals keeps task counts manageable across the 7-note set.

MAJOR_PHASES: list[dict[str, Any]] = [
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


# ---------------------------------------------------------------------------
# Unitar (single-string) phase factory
# ---------------------------------------------------------------------------
# Produces one phase per string. Each phase walks the scale linearly along
# that string so the W-W-H-W-W-W-H step pattern is visible as horizontal
# distance with no string crossings.

_STRING_NAMES = ["Low E", "A", "D", "G", "B", "High e"]


def unitar_phases() -> list[dict]:
    phases = []
    for si, sname in enumerate(_STRING_NAMES):
        phases.append({
            "label":         f"{sname} string",
            "desc":          f"Walk the scale up and back along the {sname} string. "
                             "Watch the whole-step / half-step spacing.",
            "is_challenge":  si >= 4,
            "single_string": si,
            "string_subset": [si],
            "fret_min":      0,
            "fret_max":      12,
            "patterns":      ["scale_horizontal"],
        })
    return phases


# ---------------------------------------------------------------------------
# Interval track helpers
# ---------------------------------------------------------------------------

ALL_CHROM = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# String subsets for the string_interval pattern.
# Each tuple: (display label, list of string indices 0=low-E … 5=high-e).
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
    ("D G B", [2, 3, 4]),  # includes the G–B anomaly
    ("G B e", [3, 4, 5]),
]
_4_STRING_SUBSETS = [
    ("E A D G", [0, 1, 2, 3]),
    ("A D G B", [1, 2, 3, 4]),
    ("D G B e", [2, 3, 4, 5]),  # includes the G–B anomaly on both sides
]


def interval_family_phases(semis_list: list[int]) -> list[dict]:
    """Build the 12-phase progression for one interval family.

    Phases 1–5 use 2-string subsets, 6–9 use 3-string subsets, 10–12 use
    4-string subsets.  This forces the student to confront every
    string-crossing shape before widening the context.
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
            "is_challenge":        True,
            "string_subset":       subset,
            "interval_semis_list": semis_list,
            "fret_min":            0,
            "fret_max":            12,
            "patterns":            ["string_interval"],
        })
    for lbl, subset in _4_STRING_SUBSETS:
        phases.append({
            "label":               f"{lbl}  (4 strings)",
            "is_challenge":        True,
            "string_subset":       subset,
            "interval_semis_list": semis_list,
            "fret_min":            0,
            "fret_max":            12,
            "patterns":            ["string_interval"],
        })
    return phases


# Entry-point phases for the interval track (diatonic intervals over pentatonic,
# before the chromatic string_interval families begin).
PENT_INTERVAL_PHASES: list[dict[str, Any]] = [
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

# One entry per interval family in ascending semitone order.
# Format: (stage_id, display_title, subtitle_tagline, [semitone_values])
# The loop in stages.py builds a full stage dict for each entry.
INT_FAMILY_DEFS: list[tuple] = [
    ("int_2nds",    "Seconds",   "m2 + M2  ·  1–2 semitones",      [1, 2]),
    ("int_3rds",    "Thirds",    "m3 + M3  ·  3–4 semitones",       [3, 4]),
    ("int_4ths",    "Fourths",   "P4  ·  5 semitones",              [5]),
    ("int_tritone", "Tritone",   "Aug4 / Dim5  ·  6 semitones",     [6]),
    ("int_5ths",    "Fifths",    "P5  ·  7 semitones",              [7]),
    ("int_6ths",    "Sixths",    "m6 + M6  ·  8–9 semitones",       [8, 9]),
    ("int_7ths",    "Sevenths",  "m7 + M7  ·  10–11 semitones",     [10, 11]),
    ("int_octave",  "Octave",    "same note, 8va  ·  12 semitones",  [12]),
]


# ---------------------------------------------------------------------------
# Chord track phase factories
# ---------------------------------------------------------------------------

def chord_phases(chord_defs: list) -> list[dict]:
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
CHORD_3RDS_DEFS = [
    ("C major",    "Cmaj",  "C", [0, 4, 7],     "C–E–G  ·  1–3–5"),
    ("A minor",    "Am",    "A", [0, 3, 7],     "A–C–E  ·  1–b3–5"),
    ("C major 6",  "Cmaj6", "C", [0, 4, 7, 9],  "C–E–G–A  ·  1–3–5–6"),
    ("A minor 7",  "Am7",   "A", [0, 3, 7, 10], "A–C–E–G  ·  1–b3–5–b7"),
]

CHORD_SUS_DEFS = [
    ("Csus2", "Csus2", "C", [0, 2, 7], "C–D–G  ·  1–2–5"),
    ("Dsus4", "Dsus4", "D", [0, 5, 7], "D–G–A  ·  1–4–5"),
    ("Gsus2", "Gsus2", "G", [0, 2, 7], "G–A–D  ·  1–2–5"),
    ("Asus4", "Asus4", "A", [0, 5, 7], "A–D–E  ·  1–4–5"),
]

# Inversions: chord_root is the bass note; intervals are from that bass note.
CHORD_INV_DEFS = [
    ("Cmaj / E bass  (1st inv)", "Cmaj/E", "E", [0, 3, 8], "E–G–C"),
    ("Cmaj / G bass  (2nd inv)", "Cmaj/G", "G", [0, 5, 9], "G–C–E"),
    ("Am / C bass  (1st inv)",   "Am/C",   "C", [0, 4, 9], "C–E–A"),
    ("Am / E bass  (2nd inv)",   "Am/E",   "E", [0, 5, 8], "E–A–C"),
]


# ---------------------------------------------------------------------------
# Diatonic triad phases
# ---------------------------------------------------------------------------

DIATONIC_C = [
    {"chord_name": "Cmaj", "chord_root": "C", "chord_intervals": [0, 4, 7], "chord_desc": "C–E–G  ·  I"},
    {"chord_name": "Dm",   "chord_root": "D", "chord_intervals": [0, 3, 7], "chord_desc": "D–F–A  ·  ii"},
    {"chord_name": "Em",   "chord_root": "E", "chord_intervals": [0, 3, 7], "chord_desc": "E–G–B  ·  iii"},
    {"chord_name": "Fmaj", "chord_root": "F", "chord_intervals": [0, 4, 7], "chord_desc": "F–A–C  ·  IV"},
    {"chord_name": "Gmaj", "chord_root": "G", "chord_intervals": [0, 4, 7], "chord_desc": "G–B–D  ·  V"},
    {"chord_name": "Am",   "chord_root": "A", "chord_intervals": [0, 3, 7], "chord_desc": "A–C–E  ·  vi"},
    {"chord_name": "Bdim", "chord_root": "B", "chord_intervals": [0, 3, 6], "chord_desc": "B–D–F  ·  vii°"},
]

_IVV   = [DIATONIC_C[i] for i in [0, 3, 4]]      # Cmaj Fmaj Gmaj
_minor = [DIATONIC_C[i] for i in [1, 2, 5, 6]]   # Dm Em Am Bdim
_all7  = DIATONIC_C


def diatonic_phases() -> list[dict]:
    phases = []
    for fret_min, fret_max, box_label, is_challenge in [
        (0, 4,  "Open box",  False),
        (5, 9,  "Mid box",   True),
        (9, 13, "Upper box", True),
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
            "label":        f"{box_label} — ii iii vi vii°",
            "is_challenge": is_challenge,
            "fret_min":     fret_min,
            "fret_max":     fret_max,
            "patterns":     ["box_chords"],
            "box_chords":   _minor,
        })
    phases.append({
        "label":        "Full neck — all 7 chords",
        "is_challenge": True,
        "fret_min":     0,
        "fret_max":     12,
        "patterns":     ["box_chords"],
        "box_chords":   _all7,
    })
    return phases


# ---------------------------------------------------------------------------
# Voice-leading phase factory
# ---------------------------------------------------------------------------
# Pattern 'voice_lead' in theory.js plays one voicing per chord, chosen by a
# Viterbi search over voiceLeadingCost so the fretting hand travels the
# shortest total distance through the sequence (minimal-motion voice leading).

_PROG_ii_V_I    = [DIATONIC_C[i] for i in [1, 4, 0]]     # Dm   Gmaj Cmaj
_PROG_I_vi_IV_V = [DIATONIC_C[i] for i in [0, 5, 3, 4]]  # Cmaj Am   Fmaj Gmaj
_PROG_I_IV_V_I  = [DIATONIC_C[i] for i in [0, 3, 4, 0]]  # Cmaj Fmaj Gmaj Cmaj


def voice_lead_phases() -> list[dict]:
    progs = [
        ("ii – V – I",          _PROG_ii_V_I),
        ("I – vi – IV – V",     _PROG_I_vi_IV_V),
        ("I – IV – V – I",      _PROG_I_IV_V_I),
    ]
    phases = []
    for label, seq in progs:
        phases.append({
            "label":          f"{label}  ·  smooth path",
            "is_challenge":   False,
            "fret_min":       0,
            "fret_max":       12,
            "patterns":       ["voice_lead"],
            "chord_sequence": seq,
        })
    return phases
