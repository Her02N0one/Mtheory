"""
app/curriculum — Guitar theory curriculum data.

Public API (unchanged from the old curriculum.py):
  STAGES       — ordered list of all stage dicts
  STAGE_MAP    — {stage_id: stage_dict} for O(1) lookup
  STAGE_ROWS   — row layout for the visual map on /learn
  MODULES      — module grouping list
  SEMESTERS    — semester/lesson syllabus list
  get_stage()  — convenience wrapper around STAGE_MAP
  stage_note_info()
  random_stage_note()
  stars_for_score()

Sub-modules (edit these to add content):
  phases.py    — phase templates and factory functions
  stages.py    — all stage definitions
  modules.py   — module groupings
  semesters.py — semester/lesson syllabus
"""

import random
from pathlib import Path

from app.note_system import NOTE_SYSTEM

from .stages import STAGES
from .modules import MODULES
from .semesters import SEMESTERS


# ---------------------------------------------------------------------------
# Auto-detect primer URLs from the filesystem.
# Drop an HTML file in templates/primers/<stage_id>.html — it will be picked
# up automatically without any manual registration.
# ---------------------------------------------------------------------------
_primers_dir = Path(__file__).parent.parent.parent / "templates" / "primers"
_primer_urls: dict[str, str] = (
    {f.stem: f"/primer/{f.stem}" for f in sorted(_primers_dir.glob("*.html"))}
    if _primers_dir.exists() else {}
)

# Annotate each stage with derived fields (runs once at import time).
for _s in STAGES:
    _s["has_challenge"] = any(
        ph.get("is_challenge", False) for ph in _s.get("phases", [])
    )
    if _s["id"] in _primer_urls:
        _s["primer_url"] = _primer_urls[_s["id"]]


# ---------------------------------------------------------------------------
# Fast lookups
# ---------------------------------------------------------------------------

STAGE_MAP: dict[str, dict] = {s["id"]: s for s in STAGES}

# Row layout for the visual map — each inner list is one horizontal row,
# left-to-right display order.
STAGE_ROWS: list[list[str]] = [
    ["c_pent"],
    ["f_pent", "g_pent"],
    ["c_major"],
    ["f_major", "g_major"],
    ["c_diatonic_triads"],
    ["int_pent"],
    ["int_2nds", "int_3rds"],
    ["int_4ths", "int_tritone", "int_5ths"],
    ["int_6ths", "int_7ths", "int_octave"],
    ["chord_3rds"],
    ["chord_sus", "chord_inv"],
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    """Map a raw correct/wrong count to a 0–3 star rating."""
    if correct < pass_score:
        return 0
    if wrong == 0:
        return 3
    if wrong <= 1:
        return 2
    return 1
