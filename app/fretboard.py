"""
fretboard.py — Fretboard data calculations and SVG rendering engine.
All output is pure SVG strings; no external graphics libraries required.
"""

from app.note_system import (
    STANDARD_TUNING,
    CHROMATIC,
    INTERVAL_COLORS,
    INTERVAL_LABELS,
    normalize_note,
    get_note_info,
    chromatic_index,
)


def midi_at(string_idx: int, fret: int) -> int:
    """Return the MIDI note number for (string_idx, fret).

    Uses STANDARD_TUNING octave data so pitches are absolute.
    Middle C (C4) = MIDI 60.
    """
    open_note, octave = STANDARD_TUNING[string_idx]
    return (octave + 1) * 12 + chromatic_index(open_note) + fret

# --- Layout constants (pixels) ---
NUT_X           = 68    # x position of the nut line
OPEN_NOTE_CX    = 34    # x center for open-string note markers
STRING_LABEL_X  = 12    # x for the string-name text labels
SCALE_PX        = 1400  # full scale length nut-to-saddle in pixels (equal temperament)
STRING_SPACING  = 32    # vertical distance between adjacent strings
PADDING_TOP     = 40
PADDING_BOTTOM  = 45
PADDING_RIGHT   = 40
NOTE_RADIUS     = 13    # half-width of square / radius of circle markers
DEFAULT_FRETS   = 15

# Standard guitar inlay fret positions
SINGLE_DOT_FRETS: set[int] = {3, 5, 7, 9, 15, 17, 19, 21}
DOUBLE_DOT_FRETS: set[int] = {12, 24}

# String names from visual top (high E) to visual bottom (low E)
_STRING_LABELS  = ["E", "B", "G", "D", "A", "E"]
# Stroke widths from visual top (thin) to visual bottom (thick)
_STRING_WIDTHS  = [1.0, 1.2, 1.5, 1.8, 2.2, 2.8]


# --- Data helpers ---

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


# --- Private geometry helpers ---

def _string_y(string_idx: int) -> float:
    """
    Y coordinate for a string.
    string 5 (high E) → top of diagram, string 0 (low E) → bottom.
    """
    visual_row = 5 - string_idx
    return PADDING_TOP + visual_row * STRING_SPACING


def _fret_pos(fret: int) -> float:
    """X position of fret wire `fret`; fret=0 returns the nut position."""
    if fret == 0:
        return float(NUT_X)
    return NUT_X + SCALE_PX * (1.0 - 2.0 ** (-fret / 12.0))


def _fret_cx(fret: int) -> float:
    """X center for a note marker at a given fret (0 = open string)."""
    if fret == 0:
        return OPEN_NOTE_CX
    return (_fret_pos(fret - 1) + _fret_pos(fret)) / 2.0


# --- SVG builder ---

def generate_fretboard_svg(
    highlighted_notes: list[str] | None = None,
    root_notes: list[str] | None = None,
    pinned_positions: list[tuple[int, int]] | None = None,
    preview_positions: list[tuple[int, int]] | None = None,
    alt_positions: list[tuple[int, int]] | None = None,
    shape_pins: list[tuple[int, int]] | None = None,
    quiz_positions: list[tuple[int, int]] | None = None,
    ghost_notes: list[str] | None = None,
    reference_notes: list[str] | None = None,
    interval_pairs: list[tuple[int, int, int, int, int]] | None = None,
    fret_range: tuple[int, int] | None = None,
    scale_root: str | None = None,
    num_frets: int = DEFAULT_FRETS,
    show_all_notes: bool = False,
    string_subset: list[int] | None = None,
    mono: bool = False,
    flatten_shapes: bool = False,
) -> str:
    """
    Generate an SVG string representing the guitar fretboard.

    Args:
        highlighted_notes: Note names to render at full opacity (answers).
        root_notes:        Reference root notes — dim with a white ring marker.
        pinned_positions:  Specific (string_idx, fret) positions to spotlight
                           with a pulsing ring.  These render at full opacity
                           regardless of highlighted_notes.
        alt_positions:     Alternative (string_idx, fret) positions for the same
                           chord notes on different string sets — dashed outline.
        shape_pins:        Full chord voicing positions — dim colored dots showing the
                           arpeggio shape. Pin takes priority over these.
        ghost_notes:       Notes to show as faint outlines (scale shape hints).
                           Lower priority than highlighted/root/pinned.
        interval_pairs:    List of (si_lo, fret_lo, si_hi, fret_hi, semis) tuples.
                           Draws a colored connector line between each pair with
                           an interval label at the midpoint.
        fret_range:        (min_fret, max_fret) — only render markers in this
                           range; the fretboard structure is always drawn fully.
        scale_root:        Root note name (e.g. "C"). Ghost notes whose absolute
                           pitch is BELOW the lowest root occurrence in the fret
                           range are rendered as "orphaned" — dashed warm outline
                           — indicating the root cannot be found an octave below.
        num_frets:         Number of frets to draw (12–24 recommended).
        show_all_notes:    If True, all other notes appear at very low opacity.
    """
    if highlighted_notes is None:
        highlighted_notes = []
    if root_notes is None:
        root_notes = []
    if pinned_positions is None:
        pinned_positions = []
    if preview_positions is None:
        preview_positions = []
    if alt_positions is None:
        alt_positions = []
    if shape_pins is None:
        shape_pins = []
    if quiz_positions is None:
        quiz_positions = []
    if ghost_notes is None:
        ghost_notes = []
    if reference_notes is None:
        reference_notes = []
    if interval_pairs is None:
        interval_pairs = []
    highlighted_notes = [normalize_note(n) for n in highlighted_notes]
    root_notes        = [normalize_note(n) for n in root_notes if normalize_note(n) not in highlighted_notes]
    ghost_set         = {normalize_note(n) for n in ghost_notes}
    # Build a set for fast lookup; also derive pinned note names
    pinned_set        = set(pinned_positions)   # {(string_idx, fret), ...}
    preview_set       = set(preview_positions)  # {(string_idx, fret), ...}
    alt_set           = set(alt_positions)       # {(string_idx, fret), ...}
    shape_set         = set(shape_pins)          # {(string_idx, fret), ...} chord voicing guide
    quiz_set          = set(quiz_positions)      # {(string_idx, fret), ...} "name this fret" markers
    reference_set     = {normalize_note(n) for n in reference_notes}  # faint labelled anchor map
    pinned_notes      = {get_note_at(s, f) for s, f in pinned_set}
    fret_min, fret_max = fret_range if fret_range else (0, num_frets)

    # Active strings: sorted desc → highest-pitched string first = visual top row
    if string_subset is not None:
        active_strings = sorted(string_subset, reverse=True)
    else:
        active_strings = list(range(5, -1, -1))   # [5, 4, 3, 2, 1, 0]
    active_set = set(active_strings)
    num_strings = len(active_strings)
    # Map string_idx → y coordinate within the rendered diagram
    sy = {s: PADDING_TOP + i * STRING_SPACING for i, s in enumerate(active_strings)}

    # --- Find lowest/highest root MIDI in fret range (for orphaned-ghost detection) ---
    lowest_root_midi:  int | None = None
    highest_root_midi: int | None = None
    if scale_root:
        root_name = normalize_note(scale_root)
        for si in active_strings:
            for fi in range(fret_min, fret_max + 1):
                if get_note_at(si, fi) == root_name:
                    m = midi_at(si, fi)
                    if lowest_root_midi is None or m < lowest_root_midi:
                        lowest_root_midi = m
                    if highest_root_midi is None or m > highest_root_midi:
                        highest_root_midi = m

    total_width  = int(_fret_pos(num_frets) + PADDING_RIGHT) + 1
    total_height = PADDING_TOP + (num_strings - 1) * STRING_SPACING + PADDING_BOTTOM

    p: list[str] = []  # SVG parts accumulator

    # Root element
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{total_width}" height="{total_height}" '
        f'viewBox="0 0 {total_width} {total_height}" '
        f'class="fretboard-svg">'
    )

    # Background
    p.append(
        f'<rect width="{total_width}" height="{total_height}" '
        f'fill="#16213e" rx="10"/>'
    )

    y_top    = PADDING_TOP
    y_bottom = PADDING_TOP + (num_strings - 1) * STRING_SPACING
    mid_y    = PADDING_TOP + (num_strings - 1) / 2.0 * STRING_SPACING

    # Grid lines (nut + fret wires) need a minimum vertical span so they stay
    # visible when only one string is rendered (single-string "unitar" lessons).
    # With one string y_top == y_bottom, which would collapse the nut and every
    # fret wire to a zero-length, invisible line.
    if num_strings == 1:
        grid_top    = y_top - STRING_SPACING / 2.0
        grid_bottom = y_bottom + STRING_SPACING / 2.0
    else:
        grid_top, grid_bottom = float(y_top), float(y_bottom)

    # ---- Inlay position dots ----
    for fret in range(1, num_frets + 1):
        cx = _fret_cx(fret)
        if fret in DOUBLE_DOT_FRETS:
            if num_strings >= 4:
                y1 = PADDING_TOP + 1 * STRING_SPACING
                y2 = PADDING_TOP + (num_strings - 2) * STRING_SPACING
                p.append(f'<circle cx="{cx:.1f}" cy="{y1:.1f}" r="5" fill="#2a2a50" opacity="0.9"/>')
                p.append(f'<circle cx="{cx:.1f}" cy="{y2:.1f}" r="5" fill="#2a2a50" opacity="0.9"/>')
            else:
                p.append(f'<circle cx="{cx:.1f}" cy="{mid_y:.1f}" r="5" fill="#2a2a50" opacity="0.9"/>')
        elif fret in SINGLE_DOT_FRETS:
            p.append(f'<circle cx="{cx:.1f}" cy="{mid_y:.1f}" r="5" fill="#2a2a50" opacity="0.9"/>')

    # ---- Nut ----
    p.append(
        f'<line x1="{NUT_X}" y1="{grid_top:.1f}" x2="{NUT_X}" y2="{grid_bottom:.1f}" '
        f'stroke="#cccccc" stroke-width="4" stroke-linecap="round"/>'
    )

    # ---- Fret wires ----
    for fret in range(1, num_frets + 1):
        x = _fret_pos(fret)
        p.append(
            f'<line x1="{x:.1f}" y1="{grid_top:.1f}" x2="{x:.1f}" y2="{grid_bottom:.1f}" '
            f'stroke="#4a4a6a" stroke-width="1.5"/>'
        )

    # ---- Strings ----
    for string_idx in active_strings:
        y   = sy[string_idx]
        w   = _STRING_WIDTHS[5 - string_idx]
        lbl = _STRING_LABELS[5 - string_idx]
        # String line: from left of open-note area to last fret
        p.append(
            f'<line x1="22" y1="{y}" x2="{_fret_pos(num_frets):.1f}" '
            f'y2="{y}" stroke="#8888aa" stroke-width="{w}"/>'
        )
        # String name label
        p.append(
            f'<text x="{STRING_LABEL_X}" y="{y + 5:.1f}" '
            f'font-family="monospace" font-size="13" font-weight="bold" '
            f'fill="#666688" text-anchor="middle">{lbl}</text>'
        )

    # ---- Fret number labels (below diagram) ----
    label_y = total_height - 10
    for fret in range(1, num_frets + 1):
        cx = _fret_cx(fret)
        p.append(
            f'<text x="{cx:.1f}" y="{label_y}" '
            f'font-family="monospace" font-size="10" '
            f'fill="#555577" text-anchor="middle">{fret}</text>'
        )

    # ---- Note markers ----
    for string_idx in active_strings:
        y = sy[string_idx]
        for fret in range(num_frets + 1):
            # Respect fret range — skip notes outside the active zone
            if fret < fret_min or fret > fret_max:
                continue

            note = get_note_at(string_idx, fret)
            info = get_note_info(note)
            if info is None:
                continue

            is_pinned      = (string_idx, fret) in pinned_set
            is_quiz        = (string_idx, fret) in quiz_set and not is_pinned
            is_preview     = (string_idx, fret) in preview_set and not is_pinned and not is_quiz
            # Preview in-register: note is already a highlighted/ghost scale note → render normally
            is_preview_in  = is_preview and (note in highlighted_notes or note in root_notes or note in ghost_set)
            # Preview out-of-register: not already highlighted → amber dim treatment
            is_preview_out = is_preview and not is_preview_in
            is_highlighted = note in highlighted_notes and not is_pinned and not is_preview_out and not is_quiz
            is_root        = note in root_notes and not is_pinned and not is_preview_out and not is_highlighted and not is_quiz
            is_shape       = ((string_idx, fret) in shape_set
                              and not is_pinned and not is_preview and not is_highlighted and not is_root)
            is_ghost       = (note in ghost_set
                              and not is_pinned and not is_preview and not is_highlighted
                              and not is_root and not is_shape)
            is_alt         = ((string_idx, fret) in alt_set
                              and not is_pinned and not is_preview and not is_highlighted
                              and not is_root and not is_ghost and not is_shape)
            is_dim         = (show_all_notes and not is_highlighted and not is_root
                              and not is_pinned and not is_preview and not is_ghost
                              and not is_alt and not is_shape)
            # Reference anchor: a faint, labelled "you are here" map note. Lowest
            # priority bar dim — used by early lessons to show a note map (e.g.
            # every natural note) so the learner can see the spacing and count.
            is_reference   = (note in reference_set
                              and not is_highlighted and not is_root and not is_pinned
                              and not is_preview and not is_ghost and not is_alt
                              and not is_shape and not is_quiz and not is_dim)
            # Orphaned ghost: outside the root-to-root range in the fret window
            note_midi   = midi_at(string_idx, fret)
            is_orphaned = (is_ghost and (
                (lowest_root_midi  is not None and note_midi < lowest_root_midi) or
                (highest_root_midi is not None and note_midi > highest_root_midi)
            ))

            if not (is_highlighted or is_root or is_dim or is_pinned or is_preview
                    or is_ghost or is_alt or is_shape or is_quiz or is_reference):
                continue

            cx    = _fret_cx(fret)
            color = "#5a5a68" if mono else info["color"]
            shape = "circle" if flatten_shapes else info["shape"]

            if is_quiz:
                # "Name this fret" marker — spotlight the position with a bright
                # white ring and a "?" label instead of the note name. Colour and
                # shape stay visible as crutches (unless mono/flatten_shapes strip
                # them); only the answer (the letter) is withheld.
                opacity      = "1"
                stroke       = "white"
                stroke_width = "2.5"
            elif is_pinned:
                opacity      = "1"
                stroke       = "white"
                stroke_width = "2.5"
            elif is_preview_out:
                opacity      = "0.60"
                stroke       = "#ffb700"
                stroke_width = "2.5"
            elif is_highlighted:
                opacity      = "1"
                stroke       = "rgba(255,255,255,0.70)"
                stroke_width = "1.5"
            elif is_root:
                opacity      = "0.55"
                stroke       = "white"
                stroke_width = "2.5"
            elif is_shape:
                # Chord voicing guide dot — visible but not as bright as the active pin
                opacity      = "0.80"
                stroke       = "rgba(255,255,255,0.45)"
                stroke_width = "1.8"
            elif is_alt:
                # Dashed outline — same notes playable on alternate strings
                if shape == "circle":
                    p.append(
                        f'<circle cx="{cx:.1f}" cy="{y:.1f}" r="{NOTE_RADIUS}" '
                        f'fill="none" opacity="0.50" '
                        f'stroke="{color}" stroke-width="1.8" stroke-dasharray="4,3"/>'
                    )
                else:
                    h = NOTE_RADIUS
                    p.append(
                        f'<rect x="{cx - h:.1f}" y="{y - h:.1f}" '
                        f'width="{h * 2}" height="{h * 2}" '
                        f'fill="none" opacity="0.50" '
                        f'stroke="{color}" stroke-width="1.8" stroke-dasharray="4,3" rx="2"/>'
                    )
                continue  # skip the shared shape block below
            elif is_ghost and is_orphaned:
                # Hollow dashed outline — no fill, clearly outside the root-to-root register
                if shape == "circle":
                    p.append(
                        f'<circle cx="{cx:.1f}" cy="{y:.1f}" r="{NOTE_RADIUS}" '
                        f'fill="none" opacity="0.55" '
                        f'stroke="{color}" stroke-width="1.5" stroke-dasharray="3,2"/>'
                    )
                else:
                    h = NOTE_RADIUS
                    p.append(
                        f'<rect x="{cx - h:.1f}" y="{y - h:.1f}" '
                        f'width="{h * 2}" height="{h * 2}" '
                        f'fill="none" opacity="0.55" '
                        f'stroke="{color}" stroke-width="1.5" stroke-dasharray="3,2" rx="2"/>'
                    )
                continue  # skip the shared shape block below
            elif is_ghost:
                opacity      = "0.20"
                stroke       = "rgba(255,255,255,0.15)"
                stroke_width = "1"
            elif is_reference:
                # Faint labelled anchor — keeps colour/shape (unless stripped) at
                # low opacity so it reads as a background map, not an answer.
                opacity      = "0.38"
                stroke       = "rgba(255,255,255,0.35)"
                stroke_width = "1.2"
            else:  # dim
                opacity      = "0.22"
                stroke       = "rgba(255,255,255,0.3)"
                stroke_width = "1"

            if shape == "circle":
                p.append(
                    f'<circle cx="{cx:.1f}" cy="{y:.1f}" r="{NOTE_RADIUS}" '
                    f'fill="{color}" opacity="{opacity}" '
                    f'stroke="{stroke}" stroke-width="{stroke_width}"/>'
                )
            else:  # square
                h = NOTE_RADIUS
                p.append(
                    f'<rect x="{cx - h:.1f}" y="{y - h:.1f}" '
                    f'width="{h * 2}" height="{h * 2}" '
                    f'fill="{color}" opacity="{opacity}" '
                    f'stroke="{stroke}" stroke-width="{stroke_width}" rx="2"/>'
                )

            # Note name label — ghost and shape guide dots get no label
            if not is_ghost and not is_shape:
                lbl_opacity = ("1" if (is_highlighted or is_pinned or is_quiz)
                               else "0.90" if is_preview_out
                               else "0.85" if is_root
                               else "0.80" if is_reference
                               else "0.55")
                if is_quiz:
                    label = "?"
                else:
                    label = f"R:{note}" if is_root and len(note) <= 2 else note
                font_size = "7" if len(label) > 2 else "8"
                p.append(
                    f'<text x="{cx:.1f}" y="{y + 4:.1f}" '
                    f'font-family="monospace" font-size="{font_size}" font-weight="bold" '
                    f'fill="white" text-anchor="middle" opacity="{lbl_opacity}">'
                    f'{label}</text>'
                )

    # ---- Interval connector lines (drawn above note markers, below rings) ----
    for si_lo, fret_lo, si_hi, fret_hi, semis in interval_pairs:
        if si_lo not in active_set or si_hi not in active_set:
            continue
        x1 = _fret_cx(fret_lo)
        y1 = sy[si_lo]
        x2 = _fret_cx(fret_hi)
        y2 = sy[si_hi]
        col   = INTERVAL_COLORS.get(semis, '#aaaacc')
        label = INTERVAL_LABELS.get(semis, f'{semis}st')
        mx = (x1 + x2) / 2.0
        my = (y1 + y2) / 2.0
        # Line between note centers
        p.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{col}" stroke-width="2" opacity="0.75" '
            f'stroke-dasharray="5,3"/>'
        )
        # Pill background
        pill_w, pill_h, pill_r = 26, 14, 5
        p.append(
            f'<rect x="{mx - pill_w/2:.1f}" y="{my - pill_h/2:.1f}" '
            f'width="{pill_w}" height="{pill_h}" rx="{pill_r}" '
            f'fill="#16213e" stroke="{col}" stroke-width="1.5" opacity="0.95"/>'
        )
        # Label text
        p.append(
            f'<text x="{mx:.1f}" y="{my + 4.5:.1f}" '
            f'font-family="monospace" font-size="9" font-weight="bold" '
            f'fill="{col}" text-anchor="middle" opacity="1">{label}</text>'
        )

    # ---- Pulsing rings for pinned positions (drawn on top) ----
    for string_idx, fret in pinned_set:
        if string_idx not in active_set:
            continue
        cx = _fret_cx(fret)
        y  = sy[string_idx]
        r  = NOTE_RADIUS + 5
        p.append(
            f'<circle cx="{cx:.1f}" cy="{y:.1f}" r="{r}" '
            f'fill="none" stroke="white" stroke-width="2" opacity="0.9">'
            f'<animate attributeName="r" values="{r};{r + 6};{r}" '
            f'dur="1.6s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="0.9;0.15;0.9" '
            f'dur="1.6s" repeatCount="indefinite"/>'
            f'</circle>'
        )

    # ---- Preview rings for upcoming note positions ----
    for string_idx, fret in preview_set:
        if string_idx not in active_set:
            continue
        cx   = _fret_cx(fret)
        y    = sy[string_idx]
        note = get_note_at(string_idx, fret)
        info = get_note_info(note)
        in_register = note in highlighted_notes or note in root_notes or note in ghost_set
        if in_register:
            ring_attrs = 'fill="none" stroke="#ffb700" stroke-width="2" opacity="0.75"'
        else:
            ring_attrs = 'fill="none" stroke="#ffb700" stroke-width="1.5" opacity="0.50" stroke-dasharray="4,3"'
        if info["shape"] == "circle":
            r = NOTE_RADIUS + 4
            p.append(f'<circle cx="{cx:.1f}" cy="{y:.1f}" r="{r}" {ring_attrs}/>')
        else:
            h = NOTE_RADIUS + 4
            p.append(
                f'<rect x="{cx - h:.1f}" y="{y - h:.1f}" '
                f'width="{h * 2}" height="{h * 2}" '
                f'{ring_attrs} rx="3"/>'
            )

    p.append('</svg>')
    return '\n'.join(p)
