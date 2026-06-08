"""
pitch.py — Server-side frequency → note conversion utilities.
The autocorrelation algorithm itself runs client-side (Web Audio API).
This module validates and interprets the note name sent from the browser.
"""

import math
from app.note_system import CHROMATIC, normalize_note, get_note_info

# Reference: A4 = MIDI 69 = 440 Hz
A4_FREQ  = 440.0
A4_MIDI  = 69

# Playable guitar range: low E2 (MIDI 40) → high frets on high E (~MIDI 88)
GUITAR_MIDI_MIN = 40
GUITAR_MIDI_MAX = 88


def freq_to_midi_float(freq: float) -> float:
    """Convert a frequency in Hz to a (possibly fractional) MIDI note number."""
    if freq <= 0:
        raise ValueError("Frequency must be positive")
    return 12.0 * math.log2(freq / A4_FREQ) + A4_MIDI


def freq_to_note(freq: float) -> dict:
    """
    Convert a frequency to full note information.

    Returns a dict with:
        midi          — nearest integer MIDI note
        note_name     — e.g. "A", "F#", "Db"
        octave        — e.g. 4
        cents_off     — how many cents sharp/flat from the nearest semitone
        in_guitar_range — whether the note is within standard guitar range
        color         — hex color from NOTE_SYSTEM
        shape         — "circle" or "square"
    """
    try:
        midi_float = freq_to_midi_float(freq)
    except ValueError:
        return {"error": "Invalid frequency"}

    midi_int  = round(midi_float)
    cents_off = (midi_float - midi_int) * 100
    note_name = CHROMATIC[((midi_int % 12) + 12) % 12]
    octave    = (midi_int // 12) - 1
    info      = get_note_info(note_name) or {}

    return {
        "midi":            midi_int,
        "note_name":       note_name,
        "octave":          octave,
        "cents_off":       round(cents_off, 1),
        "in_guitar_range": GUITAR_MIDI_MIN <= midi_int <= GUITAR_MIDI_MAX,
        "color":           info.get("color"),
        "shape":           info.get("shape"),
    }


def note_name_from_midi(midi: int) -> str:
    """Return the canonical note name for a MIDI number."""
    return CHROMATIC[((midi % 12) + 12) % 12]
