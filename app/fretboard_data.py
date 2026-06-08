"""
fretboard_data.py — Pitch calculations for the guitar fretboard.

Converts (string_idx, fret) coordinates to MIDI numbers and note names
using STANDARD_TUNING. No rendering, no pixel geometry.
"""

from app.note_system import STANDARD_TUNING, CHROMATIC, chromatic_index

DEFAULT_FRETS = 15


def midi_at(string_idx: int, fret: int) -> int:
    """Return the MIDI note number for (string_idx, fret).

    Uses STANDARD_TUNING octave data so pitches are absolute.
    Middle C (C4) = MIDI 60.
    """
    open_note, octave = STANDARD_TUNING[string_idx]
    return (octave + 1) * 12 + chromatic_index(open_note) + fret


def get_note_at(string_idx: int, fret: int) -> str:
    """Return the note name at string_idx (0=low E, 5=high E) and fret (0=open)."""
    open_note, _ = STANDARD_TUNING[string_idx]
    idx = (chromatic_index(open_note) + fret) % 12
    return CHROMATIC[idx]


def get_fretboard_matrix(num_frets: int = DEFAULT_FRETS) -> list[list[str]]:
    """
    Return a 6 × (num_frets + 1) matrix where
    matrix[string_idx][fret] = note_name.
    """
    return [
        [get_note_at(s, f) for f in range(num_frets + 1)]
        for s in range(6)
    ]
