"""
main.py — FastAPI application entry point.

Run with:
    uvicorn main:app --reload
"""

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from markupsafe import Markup
from pydantic import BaseModel

from app.note_system import (
    NOTE_SYSTEM,
    normalize_note,
    get_note_info,
    build_major_triad,
    build_minor_triad,
    build_major_scale,
    build_minor_scale,
)
from app.fretboard import generate_fretboard_svg, get_fretboard_matrix
from app.lesson_engine import next_question, check_answer
from app.pitch import freq_to_note
from app.curriculum import STAGES, STAGE_MAP, STAGE_ROWS, MODULES, SEMESTERS, get_stage, stage_note_info
from app import lesson_dsl

app = FastAPI(title="Chromatic Fretboard Theory Trainer")
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")
# Add tojson filter — returns Markup so Jinja2 autoescaping leaves it untouched
templates.env.filters["tojson"] = lambda obj: Markup(json.dumps(obj))


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
#
# Route overview:
#   /                  — Landing page / note color-shape reference
#   /fretboard         — Dev/debug tool: render the fretboard with arbitrary notes
#   /learn             — Curriculum map (stage selection)
#   /learn/<stage_id>  — Main learning experience; all exercise logic runs
#                        client-side via theory.js + stage.js.  No server
#                        round-trips per question.
#   /trainer           — Freeform quiz; questions generated server-side by
#                        lesson_engine.py, answers validated via /api/lesson/answer.
#
# API overview:
#   /api/pitch             — Frequency → note info (used by /trainer mic flow)
#   /api/fretboard         — Full fretboard note matrix as JSON
#   /api/fretboard/svg     — SVG fretboard (called by stage.js on every question)
#   /api/note/<name>       — Color/shape metadata for a note name
#   /api/lesson/question   — Generate a trainer question (lesson_engine)
#   /api/lesson/answer     — Validate a trainer answer  (lesson_engine)
#   /api/chord/<name>      — Notes of a major/minor triad
#   /api/scale/<name>      — Notes of a major/minor scale

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {"note_system": NOTE_SYSTEM},
    )


# Dev/debug tool — not linked from the main nav.  Useful for checking that
# generate_fretboard_svg() renders a given note set correctly.
@app.get("/fretboard", response_class=HTMLResponse)
async def fretboard_page(
    request: Request,
    notes: str = "",
    show_all: bool = False,
    num_frets: int = 15,
):
    highlighted = [n.strip() for n in notes.split(",") if n.strip()] if notes else []
    svg = generate_fretboard_svg(
        highlighted_notes=highlighted,
        num_frets=num_frets,
        show_all_notes=show_all,
    )
    return templates.TemplateResponse(
        request,
        "fretboard.html",
        {
            "svg":         svg,
            "highlighted": highlighted,
            "note_system": NOTE_SYSTEM,
            "num_frets":   num_frets,
            "show_all":    show_all,
        },
    )


import os


@app.get("/primer/{stage_id}", response_class=HTMLResponse)
async def primer_fragment(request: Request, stage_id: str):
    """Serve a theory primer HTML fragment for injection into the stage overlay."""
    primer_path = os.path.join("templates", "primers", f"{stage_id}.html")
    if not os.path.exists(primer_path):
        return HTMLResponse("", status_code=404)
    with open(primer_path, encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/learn", response_class=HTMLResponse)
async def learn_page(request: Request):
    return templates.TemplateResponse(
        request,
        "learn.html",
        {
            "stages":    STAGES,
            "stage_map": STAGE_MAP,
            "modules":   MODULES,
            "semesters": SEMESTERS,
            "note_info": NOTE_SYSTEM,
        },
    )


def find_lesson_file(target_id: str) -> str | None:
    """Scan lessons/ for a markdown file whose frontmatter `id` matches."""
    base_dir = Path("lessons")
    if not base_dir.exists():
        return None
    for md_file in base_dir.rglob("*.md"):
        try:
            frontmatter, _ = lesson_dsl.parse_frontmatter(
                md_file.read_text(encoding="utf-8")
            )
            if frontmatter.get("id") == target_id:
                return str(md_file)
        except Exception:
            continue  # skip files with invalid frontmatter
    return None


# Block-DSL lessons (Content Engine). Coexists with the legacy phases stages
# above; navigate to /learn/x/<lesson_id> (the two-segment path means it never
# collides with /learn/<stage_id>).
@app.get("/learn/x/{lesson_id}", response_class=HTMLResponse)
async def learn_block_lesson(request: Request, lesson_id: str):
    lesson_file = find_lesson_file(lesson_id)
    if not lesson_file:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")
    try:
        lesson_data = lesson_dsl.compile_file(lesson_file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DSL compiler error: {e}")
    return templates.TemplateResponse(
        request,
        "engine.html",
        {
            "lesson_json":  json.dumps(lesson_data),
            "lesson_title": lesson_data.get("title", "Lesson"),
        },
    )


@app.get("/learn/{stage_id}", response_class=HTMLResponse)
async def stage_page(request: Request, stage_id: str):
    stage = get_stage(stage_id)
    if not stage:
        return HTMLResponse("Stage not found", status_code=404)
    note_infos = stage_note_info(stage)
    # Initial fretboard: phase 0 fret range, ghost = all stage notes, root anchoring
    ph0 = stage["phases"][0]
    svg = generate_fretboard_svg(
        highlighted_notes=[],
        ghost_notes=stage["notes"],
        scale_root=stage["notes"][0],
        fret_range=(ph0.get("fret_min", 0), ph0["fret_max"]),
        num_frets=15,
        string_subset=ph0.get("string_subset"),
    )
    return templates.TemplateResponse(
        request,
        "stage.html",
        {
            "stage":      stage,
            "stage_map":  STAGE_MAP,
            "note_infos": note_infos,
            "stage_json": json.dumps(stage),
            "svg":        svg,
        },
    )


# ---------------------------------------------------------------------------
# Curriculum inspect views
# ---------------------------------------------------------------------------

def _stage_patterns(stage: dict) -> list[str]:
    """Unique pattern names/types used across all phases of a stage."""
    seen: list[str] = []
    for ph in stage["phases"]:
        for pat in ph.get("patterns", []):
            if isinstance(pat, dict):
                label = "random×" + str(pat["random"]) if "random" in pat else str(pat)
            else:
                label = pat
            if label not in seen:
                seen.append(label)
    return seen


def _build_tracks(stages: list) -> list[dict]:
    scale_stages    = [s for s in stages if not s.get("interval_stage") and not s.get("chord_stage")]
    interval_stages = [s for s in stages if s.get("interval_stage")]
    chord_stages    = [s for s in stages if s.get("chord_stage")]

    tracks = []
    if scale_stages:
        tracks.append({"label": "Scale Track", "stages": scale_stages})
    if interval_stages:
        tracks.append({"label": "Interval Track", "stages": interval_stages})
    if chord_stages:
        tracks.append({"label": "Chord Track", "stages": chord_stages})
    return tracks


@app.get("/inspect", response_class=HTMLResponse)
async def inspect_page(request: Request):
    # Annotate each stage with deduplicated pattern list for the table
    annotated = []
    for s in STAGES:
        sc = dict(s)
        sc["_patterns"] = _stage_patterns(s)
        annotated.append(sc)

    tracks = _build_tracks(annotated)
    return templates.TemplateResponse(
        request,
        "inspect.html",
        {
            "stages":      annotated,
            "tracks":      tracks,
            "note_system": NOTE_SYSTEM,
        },
    )


@app.get("/inspect/{stage_id}", response_class=HTMLResponse)
async def inspect_stage_page(request: Request, stage_id: str):
    stage = get_stage(stage_id)
    if not stage:
        return HTMLResponse("Stage not found", status_code=404)

    # Build immediate-context chain: direct prereqs → this → direct unlocks.
    # Walk just one hop back to avoid an unbounded chain.
    chain: list[dict] = []
    for req_id in stage.get("requires", []):
        req = STAGE_MAP.get(req_id)
        if req:
            chain.append({"id": req["id"], "title": req["title"]})
    chain.append({"id": stage["id"], "title": stage["title"]})

    total_patterns = sum(len(ph.get("patterns", [])) for ph in stage["phases"])

    return templates.TemplateResponse(
        request,
        "inspect_stage.html",
        {
            "stage":          stage,
            "stage_map":      STAGE_MAP,
            "note_system":    NOTE_SYSTEM,
            "chain":          chain,
            "total_patterns": total_patterns,
        },
    )


# Freeform trainer — server-side question generation via lesson_engine.py.
# Independent of the /learn curriculum; useful for open-ended practice.
@app.get("/trainer", response_class=HTMLResponse)
async def trainer_page(request: Request):
    question = next_question()
    root_notes = [question["root"]] if question.get("root") else []
    pinned: list[tuple[int, int]] = []
    if question.get("position"):
        pos = question["position"]
        pinned = [(pos["string"], pos["fret"])]
    svg = generate_fretboard_svg(
        root_notes=root_notes,
        pinned_positions=pinned,
        num_frets=15,
    )
    return templates.TemplateResponse(
        request,
        "trainer.html",
        {
            "question":    question,
            "svg":         svg,
            "note_system": NOTE_SYSTEM,
        },
    )


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

class FreqRequest(BaseModel):
    frequency: float


class AnswerRequest(BaseModel):
    question:    dict[str, Any]
    played_note: str


@app.post("/api/pitch")
async def api_pitch(body: FreqRequest):
    """Convert a raw frequency (Hz) to note information."""
    return freq_to_note(body.frequency)


@app.get("/api/fretboard")
async def api_fretboard_data(num_frets: int = 15):
    """Return the full fretboard note matrix as JSON."""
    matrix = get_fretboard_matrix(num_frets)
    return {"strings": matrix, "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"]}


@app.get("/api/fretboard/svg")
async def api_fretboard_svg(
    notes: str = "",
    root: str = "",
    pin: str = "",
    preview: str = "",
    alt: str = "",
    shape: str = "",
    quiz: str = "",
    ghost: str = "",
    ref: str = "",
    scale_root: str = "",
    ipair: str = "",
    fret_min: int = 0,
    fret_max: int = 15,
    show_all: bool = False,
    num_frets: int = 15,
    strings: str = "",
    mono: bool = False,
    noshape: bool = False,
):
    """Return an SVG string for the fretboard (used by the trainer JS).

    pin format: "string_idx:fret"  e.g. "3:5"
    ghost: comma-separated note names to render as faint scale-shape hints.
    scale_root: root note of the scale — ghost notes below the lowest root
                occurrence in the fret range are marked as orphaned (dashed).
    fret_min / fret_max: restrict visible note markers to this fret range.
    strings: comma-separated string indices to render, e.g. "0,1,2" for E A D.
             Omit to render all 6 strings.
    """
    highlighted = [n.strip() for n in notes.split(",") if n.strip()] if notes else []
    root_notes  = [root.strip()] if root.strip() else []
    ghost_notes = [n.strip() for n in ghost.split(",") if n.strip()] if ghost else []
    reference_notes = [n.strip() for n in ref.split(",") if n.strip()] if ref else []

    pinned: list[tuple[int, int]] = []
    if pin.strip():
        for pair in pin.strip().split(","):
            try:
                s, f = pair.strip().split(":")
                pinned.append((int(s), int(f)))
            except (ValueError, AttributeError):
                pass

    preview_pins: list[tuple[int, int]] = []
    if preview.strip():
        for pair in preview.strip().split(","):
            try:
                s, f = pair.strip().split(":")
                preview_pins.append((int(s), int(f)))
            except (ValueError, AttributeError):
                pass

    alt_pins: list[tuple[int, int]] = []
    if alt.strip():
        for pair in alt.strip().split(","):
            try:
                s, f = pair.strip().split(":")
                alt_pins.append((int(s), int(f)))
            except (ValueError, AttributeError):
                pass

    shape_p: list[tuple[int, int]] = []
    if shape.strip():
        for pair in shape.strip().split(","):
            try:
                s, f = pair.strip().split(":")
                shape_p.append((int(s), int(f)))
            except (ValueError, AttributeError):
                pass

    quiz_p: list[tuple[int, int]] = []
    if quiz.strip():
        for pair in quiz.strip().split(","):
            try:
                s, f = pair.strip().split(":")
                quiz_p.append((int(s), int(f)))
            except (ValueError, AttributeError):
                pass

    string_subset: list[int] | None = None
    if strings.strip():
        try:
            string_subset = [int(x.strip()) for x in strings.split(",") if x.strip()]
        except ValueError:
            string_subset = None

    int_pairs: list[tuple[int, int, int, int, int]] = []
    if ipair.strip():
        for seg in ipair.strip().split("|"):
            try:
                parts = seg.strip().split(":")
                int_pairs.append((int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4])))
            except (ValueError, IndexError):
                pass

    svg = generate_fretboard_svg(
        highlighted_notes=highlighted,
        root_notes=root_notes,
        pinned_positions=pinned,
        preview_positions=preview_pins,
        alt_positions=alt_pins,
        shape_pins=shape_p,
        quiz_positions=quiz_p,
        ghost_notes=ghost_notes,
        reference_notes=reference_notes,
        interval_pairs=int_pairs,
        scale_root=scale_root.strip() or None,
        fret_range=(fret_min, fret_max),
        num_frets=num_frets,
        show_all_notes=show_all,
        string_subset=string_subset,
        mono=mono,
        flatten_shapes=noshape,
    )
    return {"svg": svg}


@app.get("/api/note/{note_name}")
async def api_note_info(note_name: str):
    """Return color and shape metadata for a note name."""
    normalized = normalize_note(note_name)
    info = get_note_info(normalized)
    if not info:
        return {"error": f"Note '{note_name}' not found"}
    return {"note": normalized, **info}


@app.get("/api/lesson/question")
async def api_get_question(
    mode: str = "all",
    intervals: str = "",
    degrees: str = "",
    chords: str = "",
    roots: str = "",
):
    """Return a new random lesson question.

    Filter params accept comma-separated values, e.g. intervals=M3,P5
    """
    filters: dict = {}
    if intervals: filters["intervals"] = [v.strip() for v in intervals.split(",") if v.strip()]
    if degrees:   filters["degrees"]   = [v.strip() for v in degrees.split(",")   if v.strip()]
    if chords:    filters["chords"]    = [v.strip() for v in chords.split(",")    if v.strip()]
    if roots:     filters["roots"]     = [v.strip() for v in roots.split(",")     if v.strip()]
    return next_question(mode, filters or None)


@app.post("/api/lesson/answer")
async def api_submit_answer(body: AnswerRequest):
    """Validate a played note against the current question."""
    return check_answer(body.question, body.played_note)


@app.get("/api/chord/{note_name}")
async def api_chord(note_name: str, quality: str = "major"):
    """Return the notes of a major or minor triad."""
    root = normalize_note(note_name)
    notes = build_major_triad(root) if quality == "major" else build_minor_triad(root)
    return {"root": root, "quality": quality, "notes": notes}


@app.get("/api/scale/{note_name}")
async def api_scale(note_name: str, type: str = "major"):
    """Return the notes of a major or minor scale."""
    root = normalize_note(note_name)
    notes = build_major_scale(root) if type == "major" else build_minor_scale(root)
    return {"root": root, "type": type, "notes": notes}
