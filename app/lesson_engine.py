"""
lesson_engine.py — Question generation and answer validation for the freeform Trainer.

This module powers the /trainer page and the /api/lesson/* endpoints.
It is NOT used by the main curriculum stages (/learn/<stage_id>).

Architecture note
-----------------
The curriculum stages use a fully client-side task model: the server injects
stage JSON (notes, phases) into the page, and theory.js builds the exercise
queue in the browser via buildQueueTasks().  No server round-trip is needed
per question — the browser drives the whole loop.

The Trainer is a separate, simpler mode: each question is generated server-side
here, sent to the browser as JSON, and the browser posts the played note back
to /api/lesson/answer for validation.  It is useful for freeform practice
outside the structured curriculum.

Question types
--------------
find_interval               Play a specific interval above a root note (mic)
find_interval_from_position Play an interval above a highlighted fretboard position (mic)
find_scale_degree           Play a scale degree using degree-name framing (mic)
find_chord_tone             Play any note in a triad or 7th chord (mic)
name_the_note               Identify a displayed color/shape by clicking its name (button)
"""

import random
from typing import Any

from app.note_system import (
    NOTE_SYSTEM,
    INTERVALS,
    note_at_semitone,
    normalize_note,
)
from app.fretboard import get_note_at as _fretboard_note_at

_ALL_NOTES = list(NOTE_SYSTEM.keys())


# ── Interval questions ─────────────────────────────────────────────────────────

_INTERVAL_DISPLAY: dict[str, str] = {
    "M2":  "Major 2nd",
    "m3":  "Minor 3rd",
    "M3":  "Major 3rd",
    "P4":  "Perfect 4th",
    "P5":  "Perfect 5th",
    "m6":  "Minor 6th",
    "M6":  "Major 6th",
    "m7":  "Minor 7th",
    "M7":  "Major 7th",
}


def generate_interval_question() -> dict[str, Any]:
    root         = random.choice(_ALL_NOTES)
    interval_key = random.choice(list(_INTERVAL_DISPLAY.keys()))
    semitones    = INTERVALS[interval_key]
    target       = note_at_semitone(root, semitones)
    display_name = _INTERVAL_DISPLAY[interval_key]
    return {
        "type":     "find_interval",
        "mode":     "mic",
        "prompt":   f"Play the {display_name} above {root}",
        "root":     root,
        "interval": interval_key,
        "answer":   target,
        "hint":     f"{semitones} semitone{'s' if semitones != 1 else ''} above {root}",
    }


def generate_positional_interval_question() -> dict[str, Any]:
    """Ask for an interval above a *specific fretboard position*, shown with a pulsing ring."""
    string_idx   = random.randint(0, 5)
    fret         = random.randint(0, 12)
    root         = _fretboard_note_at(string_idx, fret)
    interval_key = random.choice(list(_INTERVAL_DISPLAY.keys()))
    semitones    = INTERVALS[interval_key]
    target       = note_at_semitone(root, semitones)
    display_name = _INTERVAL_DISPLAY[interval_key]
    string_names = ["low E", "A", "D", "G", "B", "high E"]
    fret_label   = "open" if fret == 0 else f"fret {fret}"
    return {
        "type":      "find_interval_from_position",
        "mode":      "mic",
        "prompt":    f"Play the {display_name} above this {root}",
        "root":      root,
        "position":  {"string": string_idx, "fret": fret},
        "interval":  interval_key,
        "answer":    target,
        "hint":      f"{root} on {string_names[string_idx]}, {fret_label} — {semitones} semitone{'s' if semitones != 1 else ''} up",
    }


# ── Scale-degree questions ─────────────────────────────────────────────────────

# (symbol, semitones, display_name)
_DEGREES: list[tuple[str, int, str]] = [
    ("b2",  1,  "flat 2nd (b2)"),
    ("2",   2,  "2nd"),
    ("b3",  3,  "flat 3rd (b3)"),
    ("3",   4,  "3rd (Major 3rd)"),
    ("4",   5,  "4th (Perfect 4th)"),
    ("b5",  6,  "flat 5th (b5)"),
    ("5",   7,  "5th (Perfect 5th)"),
    ("b6",  8,  "flat 6th (b6)"),
    ("6",   9,  "6th"),
    ("b7",  10, "flat 7th (b7)"),
    ("7",   11, "7th (Major 7th)"),
]


def generate_scale_degree_question() -> dict[str, Any]:
    root                    = random.choice(_ALL_NOTES)
    symbol, semitones, disp = random.choice(_DEGREES)
    target                  = note_at_semitone(root, semitones)
    return {
        "type":      "find_scale_degree",
        "mode":      "mic",
        "prompt":    f"Play the {disp} of {root}",
        "root":      root,
        "degree":    symbol,
        "semitones": semitones,
        "answer":    target,
        "hint":      f"{semitones} semitone{'s' if semitones != 1 else ''} above {root}",
    }


# ── Chord-tone questions ──────────────────────────────────────────────────────

def _build_chord(root: str, intervals: list[int]) -> list[str]:
    return [note_at_semitone(root, s) for s in intervals]


_CHORD_TYPES: dict[str, tuple[str, list[int]]] = {
    "major":    ("major triad",      [0, 4, 7]),
    "minor":    ("minor triad",      [0, 3, 7]),
    "dom7":     ("dominant 7th",     [0, 4, 7, 10]),
    "maj7":     ("major 7th",        [0, 4, 7, 11]),
    "min7":     ("minor 7th",        [0, 3, 7, 10]),
    "dim":      ("diminished triad", [0, 3, 6]),
    "aug":      ("augmented triad",  [0, 4, 8]),
}


def generate_chord_tone_question() -> dict[str, Any]:
    root             = random.choice(_ALL_NOTES)
    chord_key        = random.choice(list(_CHORD_TYPES.keys()))
    label, intervals = _CHORD_TYPES[chord_key]
    notes            = _build_chord(root, intervals)
    return {
        "type":    "find_chord_tone",
        "mode":    "mic",
        "prompt":  f"Play any note in a {root} {label}",
        "root":    root,
        "quality": chord_key,
        "answer":  notes,
        "hint":    "Chord tones: " + ", ".join(notes),
    }


# ── Name-the-note questions ───────────────────────────────────────────────────

def generate_name_the_note_question() -> dict[str, Any]:
    target  = random.choice(_ALL_NOTES)
    info    = NOTE_SYSTEM[target]
    others  = [n for n in _ALL_NOTES if n != target]
    choices = random.sample(others, 3) + [target]
    random.shuffle(choices)
    return {
        "type":    "name_the_note",
        "mode":    "button",
        "prompt":  "What note is this?",
        "root":    None,
        "answer":  target,
        "choices": choices,
        "color":   info["color"],
        "shape":   info["shape"],
        "hint":    "",
    }


# ── Mode routing ──────────────────────────────────────────────────────────────

_MODE_GENERATORS: dict[str, list] = {
    "all":           [generate_interval_question, generate_positional_interval_question,
                      generate_scale_degree_question,
                      generate_chord_tone_question, generate_name_the_note_question],
    "intervals":     [generate_interval_question, generate_positional_interval_question],
    "positional":    [generate_positional_interval_question],
    "scale_degrees": [generate_scale_degree_question],
    "chords":        [generate_chord_tone_question],
    "identify":      [generate_name_the_note_question],
}


def next_question(mode: str = "all", filters: dict | None = None) -> dict[str, Any]:
    """
    Return a question.

    filters keys (all optional):
      intervals   — list of interval keys to include, e.g. ["M3","P5"]
      degrees     — list of degree symbols, e.g. ["3","5","b7"]
      chords      — list of chord type keys, e.g. ["major","min7"]
      roots       — list of root note names to restrict to, e.g. ["A","E","D"]
    """
    generators = _MODE_GENERATORS.get(mode, _MODE_GENERATORS["all"])
    gen = random.choice(generators)

    if filters:
        allowed_intervals = filters.get("intervals")
        allowed_degrees   = filters.get("degrees")
        allowed_chords    = filters.get("chords")
        allowed_roots     = filters.get("roots")

        # Inject filter into generator call via a thin wrapper
        if gen is generate_interval_question and allowed_intervals:
            return _gen_interval_filtered(allowed_intervals, allowed_roots)
        if gen is generate_positional_interval_question and allowed_intervals:
            return _gen_positional_filtered(allowed_intervals)
        if gen is generate_scale_degree_question and allowed_degrees:
            return _gen_degree_filtered(allowed_degrees, allowed_roots)
        if gen is generate_chord_tone_question and allowed_chords:
            return _gen_chord_filtered(allowed_chords, allowed_roots)

    return gen()


def _pick_root(allowed_roots: list[str] | None) -> str:
    pool = allowed_roots if allowed_roots else _ALL_NOTES
    return random.choice(pool)


def _gen_interval_filtered(allowed_intervals: list[str], allowed_roots: list[str] | None) -> dict[str, Any]:
    root         = _pick_root(allowed_roots)
    interval_key = random.choice(allowed_intervals)
    semitones    = INTERVALS[interval_key]
    target       = note_at_semitone(root, semitones)
    display_name = _INTERVAL_DISPLAY.get(interval_key, interval_key)
    return {
        "type":     "find_interval",
        "mode":     "mic",
        "prompt":   f"Play the {display_name} above {root}",
        "root":     root,
        "interval": interval_key,
        "answer":   target,
        "hint":     f"{semitones} semitone{'s' if semitones != 1 else ''} above {root}",
    }


def _gen_positional_filtered(allowed_intervals: list[str]) -> dict[str, Any]:
    string_idx   = random.randint(0, 5)
    fret         = random.randint(0, 12)
    root         = _fretboard_note_at(string_idx, fret)
    interval_key = random.choice(allowed_intervals)
    semitones    = INTERVALS[interval_key]
    target       = note_at_semitone(root, semitones)
    display_name = _INTERVAL_DISPLAY.get(interval_key, interval_key)
    string_names = ["low E", "A", "D", "G", "B", "high E"]
    fret_label   = "open" if fret == 0 else f"fret {fret}"
    return {
        "type":      "find_interval_from_position",
        "mode":      "mic",
        "prompt":    f"Play the {display_name} above this {root}",
        "root":      root,
        "position":  {"string": string_idx, "fret": fret},
        "interval":  interval_key,
        "answer":    target,
        "hint":      f"{root} on {string_names[string_idx]}, {fret_label} — {semitones} semitone{'s' if semitones != 1 else ''} up",
    }


def _gen_degree_filtered(allowed_degrees: list[str], allowed_roots: list[str] | None) -> dict[str, Any]:
    root    = _pick_root(allowed_roots)
    pool    = [d for d in _DEGREES if d[0] in allowed_degrees]
    if not pool:
        pool = _DEGREES
    symbol, semitones, disp = random.choice(pool)
    target  = note_at_semitone(root, semitones)
    return {
        "type":      "find_scale_degree",
        "mode":      "mic",
        "prompt":    f"Play the {disp} of {root}",
        "root":      root,
        "degree":    symbol,
        "semitones": semitones,
        "answer":    target,
        "hint":      f"{semitones} semitone{'s' if semitones != 1 else ''} above {root}",
    }


def _gen_chord_filtered(allowed_chords: list[str], allowed_roots: list[str] | None) -> dict[str, Any]:
    root              = _pick_root(allowed_roots)
    chord_key         = random.choice(allowed_chords)
    label, intervals  = _CHORD_TYPES.get(chord_key, _CHORD_TYPES["major"])
    notes             = _build_chord(root, intervals)
    return {
        "type":    "find_chord_tone",
        "mode":    "mic",
        "prompt":  f"Play any note in a {root} {label}",
        "root":    root,
        "quality": chord_key,
        "answer":  notes,
        "hint":    "Chord tones: " + ", ".join(notes),
    }


# ── Answer validation ─────────────────────────────────────────────────────────

def check_answer(question: dict[str, Any], played_note: str) -> dict[str, Any]:
    played = normalize_note(played_note)
    q_type = question.get("type")

    if q_type in ("find_interval", "find_scale_degree", "find_interval_from_position"):
        expected = question["answer"]
        correct  = played == expected
        return {
            "correct":  correct,
            "expected": expected,
            "played":   played,
            "feedback": "Correct!" if correct else f"Expected {expected}, played {played}",
        }

    if q_type == "find_chord_tone":
        chord_tones = question["answer"]
        correct     = played in chord_tones
        root, qual  = question["root"], question["quality"]
        label       = _CHORD_TYPES[qual][0]
        return {
            "correct":  correct,
            "expected": chord_tones,
            "played":   played,
            "feedback": (
                f"{played} is in {root} {label}" if correct
                else f"{played} is not in {root} {label}"
            ),
        }

    if q_type == "name_the_note":
        expected = question["answer"]
        correct  = played == expected
        return {
            "correct":  correct,
            "expected": expected,
            "played":   played,
            "feedback": "Correct!" if correct else f"It was {expected}",
        }

    return {"error": "Unknown question type", "correct": False}
