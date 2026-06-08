"""
note_system.py — Source of truth for the chromatic color/shape mapping.
All data follows the Circle of Fifths order defined in the project spec.
"""

from typing import Optional

# --- Core Data Dictionary (Circle of Fifths order) ---
NOTE_SYSTEM: dict[str, dict] = {
    "C":  {"shape": "square",  "color": "#ee0043"},
    "G":  {"shape": "circle",  "color": "#ff3c00"},
    "D":  {"shape": "square",  "color": "#ff7b00"},
    "A":  {"shape": "circle",  "color": "#ffb700"},
    "E":  {"shape": "square",  "color": "#f7dd00"},
    "B":  {"shape": "circle",  "color": "#9ad100"},
    "F#": {"shape": "square",  "color": "#00ba35"},  # enharmonic Gb
    "Db": {"shape": "circle",  "color": "#00ad94"},  # enharmonic C#
    "Ab": {"shape": "square",  "color": "#0099e3"},  # enharmonic G#
    "Eb": {"shape": "circle",  "color": "#2b62b5"},  # enharmonic D#
    "Bb": {"shape": "square",  "color": "#8c379d"},  # enharmonic A#
    "F":  {"shape": "circle",  "color": "#bb0092"},
}

# Circle of Fifths order (index matches NOTE_SYSTEM insertion order)
COF_ORDER: list[str] = list(NOTE_SYSTEM.keys())

# Chromatic scale in semitone order (flats preferred to match NOTE_SYSTEM)
CHROMATIC: list[str] = [
    "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"
]

# Enharmonic respelling — map sharps/edge cases to the flat names in NOTE_SYSTEM
ENHARMONIC: dict[str, str] = {
    "C#": "Db",
    "D#": "Eb",
    "E#": "F",
    "Gb": "F#",
    "G#": "Ab",
    "A#": "Bb",
    "B#": "C",
    "Cb": "B",
    "Fb": "E",
}

# Standard tuning: list of (note_name, octave) from string 0 (low E) to string 5 (high E)
STANDARD_TUNING: list[tuple[str, int]] = [
    ("E", 2),  # string 0 — low E
    ("A", 2),  # string 1
    ("D", 3),  # string 2
    ("G", 3),  # string 3
    ("B", 3),  # string 4
    ("E", 4),  # string 5 — high E
]

# Visual encoding for interval connectors — shared across all instrument views.
# Keyed by semitone count (1–12). Minor/major use amber/lime; perfect = blue;
# tritone = red. These intentionally differ from the note color standard so
# interval lines read as a separate visual layer.
INTERVAL_COLORS: dict[int, str] = {
    1:  "#ff8c20",  # m2  — amber
    2:  "#b5e000",  # M2  — lime
    3:  "#ff8c20",  # m3  — amber
    4:  "#b5e000",  # M3  — lime
    5:  "#4d9fff",  # P4  — blue
    6:  "#ff3a55",  # TT  — red
    7:  "#4d9fff",  # P5  — blue
    8:  "#ff8c20",  # m6  — amber
    9:  "#b5e000",  # M6  — lime
    10: "#ff8c20",  # m7  — amber
    11: "#b5e000",  # M7  — lime
    12: "#4d9fff",  # P8  — blue
}

# Short display labels for the same semitone counts.
INTERVAL_LABELS: dict[int, str] = {
    1: "m2", 2: "M2", 3: "m3",  4: "M3",
    5: "P4", 6: "TT", 7: "P5",  8: "m6",
    9: "M6", 10: "m7", 11: "M7", 12: "P8",
}

# Interval name → semitone count
INTERVALS: dict[str, int] = {
    "unison":  0,
    "m2":      1,
    "M2":      2,
    "m3":      3,
    "M3":      4,
    "4":      5,
    "tritone": 6,
    "5":      7,
    "m6":      8,
    "M6":      9,
    "m7":     10,
    "M7":     11,
    "octave": 12,
    "b9":     13,
    "9":     14,
    "m10":    15,
    "M10":    16,
    "11":    17,
    "tritone_2":    18,
    "12":    19,
    "b13":    20,
    "13":    21,
    "m14":    22,
    "M14":    23,
    "octave_2": 24,


}


# --- Helper Functions ---

def normalize_note(note: str) -> str:
    """Return the canonical note name used as a key in NOTE_SYSTEM."""
    if note in NOTE_SYSTEM:
        return note
    return ENHARMONIC.get(note, note)


def get_note_info(note: str) -> Optional[dict]:
    """Return the color/shape dict for a note, or None if not found."""
    return NOTE_SYSTEM.get(normalize_note(note))


def chromatic_index(note: str) -> int:
    """Return the 0-24 index of a note in the chromatic scale."""
    return CHROMATIC.index(normalize_note(note))


def note_at_semitone(root: str, semitones: int) -> str:
    """Return the note name that is `semitones` above `root`."""
    idx = (chromatic_index(root) + semitones) % 12
    return CHROMATIC[idx]


def get_interval_semitones(root: str, target: str) -> int:
    """Return the ascending semitone distance from root to target (0–11)."""
    return (chromatic_index(target) - chromatic_index(root)) % 12


def build_major_triad(root: str) -> list[str]:
    """[root, M3, P5]"""
    r = normalize_note(root)
    return [r, note_at_semitone(r, 4), note_at_semitone(r, 7)]


def build_minor_triad(root: str) -> list[str]:
    """[root, m3, P5]"""
    r = normalize_note(root)
    return [r, note_at_semitone(r, 3), note_at_semitone(r, 7)]


def build_major_scale(root: str) -> list[str]:
    """Return the 7-note major scale starting on root."""
    r = normalize_note(root)
    return [note_at_semitone(r, s) for s in [0, 2, 4, 5, 7, 9, 11]]


def build_minor_scale(root: str) -> list[str]:
    """Return the 7-note natural minor scale starting on root."""
    r = normalize_note(root)
    return [note_at_semitone(r, s) for s in [0, 2, 3, 5, 7, 8, 10]]
