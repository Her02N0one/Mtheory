"""
positions.py — CAGED scale-position drills for the Positions section.

─── Overview ────────────────────────────────────────────────────────────────
The Positions section (/positions) teaches CAGED box-position playing by
generating Engine-format lesson JSON on the fly.  No hardcoded lesson files —
every drill is assembled from the box geometry and scale intervals at request
time.

─── Key concepts ────────────────────────────────────────────────────────────
KEY_GROUPS      — 3 groups: C/Am, G/Em, F/Dm (each shares the same 5 boxes).
                  Each box is (shape_label, fret_min, fret_max).
SCALE_INTERVALS — Pitch-class intervals for each supported scale type.
SHAPE_ORDER     — Display order: ['E', 'A', 'G', 'C', 'D'].
PASSES_B_STRING — Shapes whose root crosses the G→B tuning anomaly.

─── Lesson generators ───────────────────────────────────────────────────────
build_shape_lesson(position)
    One CAGED shape drill.  Tiers:
      Guided  — up_down + thirds scaledrill, persists "guided" on pass.
      Blind   — ascending from memory, persists "blind" on pass.
      Boundary— connects this shape to the next (if one exists).

build_full_neck_lesson(group_id, scale_type)
    All 5 shapes in a continuous drill (frets 0 → max across the neck).

─── Progress keys ───────────────────────────────────────────────────────────
Written to localStorage by the Engine on checkpoint pass:
  mpos:{group_id}:{scale_type}:{shape}:guided
  mpos:{group_id}:{scale_type}:{shape}:blind
  mpos:{group_id}:{scale_type}:{shape}:boundary
  mpos:{group_id}:{scale_type}:full_neck:guided
  mpos:{group_id}:{scale_type}:full_neck:complete

─── Data flow ───────────────────────────────────────────────────────────────
HTTP GET /positions/{group_id}/{scale_type}/{shape}
  → main.py calls build_shape_lesson(get_position(group_id, scale_type, shape))
  → JSON block-tree injected into engine.html as `lesson_json`
  → engine.js walks blocks, mounts scaledrill widgets
  → scaledrill emits mtheory:quiz_answered on correct note
  → checkpoint counts events → fires on_pass → persist → localStorage
  → positions.html reads localStorage on next load → lights up tier markers
"""

from __future__ import annotations
from typing import Any

# ---------------------------------------------------------------------------
# Pitch helpers
# ---------------------------------------------------------------------------

_OPEN_MIDI = [40, 45, 50, 55, 59, 64]   # E2 A2 D3 G3 B3 E4

_NOTE_NAMES  = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
_NOTE_PC: dict[str, int] = {n: i for i, n in enumerate(_NOTE_NAMES)}
# Flat aliases → same pitch class
_NOTE_PC.update({'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10})

def _pc(name: str) -> int:
    return _NOTE_PC[name]

def _midi_to_sci(midi: int) -> str:
    octave = (midi // 12) - 1
    return _NOTE_NAMES[midi % 12] + str(octave)

def _lowest_root_in_window(root_pc: int, fret_min: int, fret_max: int) -> int | None:
    """MIDI value of the lowest-pitched root in the fret window across all 6 strings."""
    candidates = [
        open_m + f
        for open_m in _OPEN_MIDI
        for f in range(fret_min, fret_max + 1)
        if (open_m + f) % 12 == root_pc % 12
    ]
    return min(candidates) if candidates else None


# ---------------------------------------------------------------------------
# Scale data
# ---------------------------------------------------------------------------

SCALE_INTERVALS: dict[str, list[int]] = {
    'pentatonic_major': [0, 2, 4, 7, 9, 12],
    'pentatonic_minor': [0, 3, 5, 7, 10, 12],
    'major':            [0, 2, 4, 5, 7, 9, 11, 12],
    'natural_minor':    [0, 2, 3, 5, 7, 8, 10, 12],
}

# Human-readable display names
SCALE_DISPLAY: dict[str, str] = {
    'pentatonic_major': 'Major Pentatonic',
    'pentatonic_minor': 'Minor Pentatonic',
    'major':            'Major Scale',
    'natural_minor':    'Natural Minor Scale',
}


# ---------------------------------------------------------------------------
# CAGED box definitions
# ---------------------------------------------------------------------------
# Each entry: (shape_label, fret_min, fret_max)
# Shape labels: E D C A G  (open-chord voicing the box resembles)

_C_MAJOR_BOXES: list[tuple[str, int, int]] = [
    ('C', 0,  3),
    ('A', 2,  5),
    ('G', 5,  8),
    ('E', 7, 10),
    ('D', 9, 13),
]

_G_MAJOR_BOXES: list[tuple[str, int, int]] = [
    ('G', 0,  3),
    ('E', 2,  5),
    ('D', 4,  8),
    ('C', 7, 10),
    ('A', 9, 12),
]

_F_MAJOR_BOXES: list[tuple[str, int, int]] = [
    ('E',  0,  3),
    ('D',  2,  6),
    ('C',  5,  8),
    ('A',  7, 10),
    ('G', 10, 13),
]

# Map (major_key_name, major_scale) → box list
_MAJOR_BOXES: dict[str, list[tuple[str, int, int]]] = {
    'C': _C_MAJOR_BOXES,
    'G': _G_MAJOR_BOXES,
    'F': _F_MAJOR_BOXES,
}

# Relative minor of each major key (minor tonic name)
_RELATIVE_MINOR: dict[str, str] = {
    'C': 'A',
    'G': 'E',
    'F': 'D',
}


# ---------------------------------------------------------------------------
# KEY GROUPS
# ---------------------------------------------------------------------------
# Each group has a major and a relative minor — both use the same box windows
# but with different roots, connecting them visually.

KEY_GROUPS: list[dict[str, Any]] = [
    {
        'id':    'C',
        'label': 'C / Am',
        'major': 'C',
        'relative_minor': 'A',
        'boxes': _C_MAJOR_BOXES,
    },
    {
        'id':    'G',
        'label': 'G / Em',
        'major': 'G',
        'relative_minor': 'E',
        'boxes': _G_MAJOR_BOXES,
    },
    {
        'id':    'F',
        'label': 'F / Dm',
        'major': 'F',
        'relative_minor': 'D',
        'boxes': _F_MAJOR_BOXES,
    },
]

# Flat lookup: group_id → group dict
KEY_GROUP_MAP: dict[str, dict] = {g['id']: g for g in KEY_GROUPS}

# Shapes that "pass the B string": the root is anchored on the G, D, or B string
# (1-2 strings away from B, or ON B), so the ascending scale immediately crosses
# the G→B tuning gap.
#   G-shape: root on G string (3rd) — 1 string below B
#   D-shape: root on D string (4th) — 2 strings below B; upper octave on B string
#   C-shape: root literally on B string (2nd)
#
# E-shape (root on E string, 6th) and A-shape (root on A string, 5th) anchor
# on the bass side — 3-4 strings below B — and are grouped separately.
PASSES_B_STRING: frozenset[str] = frozenset({'G', 'C', 'D'})

# Column order: E/A (bass-side roots) first, then G/C/D (B-string-crossing roots).
SHAPE_ORDER = ['E', 'A', 'G', 'C', 'D']


# ---------------------------------------------------------------------------
# Position record
# ---------------------------------------------------------------------------

def get_position(group_id: str, scale_type: str, shape: str) -> dict[str, Any] | None:
    """
    Return a single position record, or None if not found.

    scale_type: 'pentatonic_major' | 'pentatonic_minor'
    shape:      'E' | 'D' | 'C' | 'A' | 'G'
    """
    group = KEY_GROUP_MAP.get(group_id)
    if not group:
        return None

    if scale_type in ('pentatonic_major', 'major'):
        root_name = group['major']
    elif scale_type in ('pentatonic_minor', 'natural_minor'):
        root_name = group['relative_minor']
    else:
        return None

    # Find the box with this shape in the group's box list
    box_entry = next((b for b in group['boxes'] if b[0] == shape), None)
    if not box_entry:
        return None

    _, fret_min, fret_max = box_entry
    root_pc   = _pc(root_name)
    root_midi = _lowest_root_in_window(root_pc, fret_min, fret_max)
    if root_midi is None:
        return None

    root_sci = _midi_to_sci(root_midi)

    return {
        'group_id':   group_id,
        'group_label': group['label'],
        'scale_type': scale_type,
        'scale_label': SCALE_DISPLAY[scale_type],
        'shape':      shape,
        'root_name':  root_name,
        'root_sci':   root_sci,
        'fret_min':   fret_min,
        'fret_max':   fret_max,
        'title':      f"{root_name} {SCALE_DISPLAY[scale_type]} — {shape} Shape",
    }


def all_positions() -> list[dict[str, Any]]:
    """All 60 position records (3 groups × 4 scale types × 5 shapes)."""
    records = []
    for group in KEY_GROUPS:
        for scale_type in ['pentatonic_major', 'pentatonic_minor', 'major', 'natural_minor']:
            for shape, fret_min, fret_max in group['boxes']:
                pos = get_position(group['id'], scale_type, shape)
                if pos:
                    records.append(pos)
    return records


# ---------------------------------------------------------------------------
# Engine JSON builder
# ---------------------------------------------------------------------------

class _Counter:
    """Auto-incrementing block-ID generator."""
    def __init__(self) -> None:
        self._n = 0
    def next(self) -> str:
        self._n += 1
        return f'b{self._n}'


def _seq_length(scale_type: str, pattern: str) -> int:
    """Number of notes for a single abstract octave (kept for reference)."""
    n = len(SCALE_INTERVALS[scale_type])
    if pattern in ('up', 'down'):
        return n
    if pattern == 'up_down':
        return 2 * n - 1
    if pattern == 'thirds':
        return (n - 2) * 2
    return n


# ---------------------------------------------------------------------------
# Shape educational context
# ---------------------------------------------------------------------------

_STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high e']

# Scale degree labels per scale type (one per non-octave interval).
_DEGREE_LABELS: dict[str, list[str]] = {
    'major':            ['1', '2', '3', '4', '5', '6', '7'],
    'natural_minor':    ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
    'pentatonic_major': ['1', '2', '3', '5', '6'],
    'pentatonic_minor': ['1', '♭3', '4', '5', '♭7'],
}

# Shape origin descriptions (key insight + root-string geometry).
_SHAPE_INFO: dict[str, dict] = {
    'E': {
        'origin': (
            "Named after the **open E chord**. "
            "The root lands on **both E strings** — low E (string 6) and high-e (string 1) — "
            "at the same fret number. This doubled root is the E shape's visual signature: "
            "find the root on the low E string, and the same fret on the high-e string is "
            "another root an octave higher."
        ),
        'landmark': "both E strings at the same fret",
    },
    'A': {
        'origin': (
            "Named after the **open A chord**. "
            "The root sits on the **A string** with a second occurrence on the **G string**. "
            "The A shape is the most compact of the five — a tight cluster on the middle strings "
            "with no root on either of the outer strings."
        ),
        'landmark': "A string root, G string octave",
    },
    'G': {
        'origin': (
            "Named after the **open G chord**. "
            "The root appears on **three strings**: low E, G, and high-e. "
            "This makes the G shape the widest of the five, spanning the full neck. "
            "It also crosses the G→B [tuning anomaly](/glossary#enharmonic) — notes on "
            "the B and high-e strings shift one fret higher than a straight-fourth calculation "
            "would predict."
        ),
        'landmark': "low E and high-e roots at the same fret, G string root between them",
    },
    'C': {
        'origin': (
            "Named after the **open C chord**. "
            "The root's signature position is the **B string** — unique among the five shapes. "
            "In the open C chord the B-string root sits at fret 1; the same geometry holds "
            "wherever you play the C shape up the neck. The A string also carries a root, "
            "but the B-string root is the C shape's visual anchor."
        ),
        'landmark': "B string root — the most distinctive root placement of all five shapes",
    },
    'D': {
        'origin': (
            "Named after the **open D chord**. "
            "The root sits on the **D string** and the **B string**. "
            "The D shape is the highest of the five — above it, the [CAGED cycle](/glossary#caged-system) "
            "repeats from the C shape an octave higher."
        ),
        'landmark': "D string root, B string root",
    },
}


def _shape_breadcrumb(group: dict, group_id: str, scale_type: str,
                      current_shape: str, root_name: str, scale_lbl: str) -> str:
    """Markdown breadcrumb: back link + shape sequence in fret order."""
    parts = []
    for s, _, _ in group['boxes']:
        url = f"/positions/{group_id}/{scale_type}/{s}"
        parts.append(f"**{s}**" if s == current_shape else f"[{s}]({url})")
    fn_url = f"/positions/{group_id}/{scale_type}/full_neck"
    parts.append(f"[Full Neck]({fn_url})")
    sequence = " → ".join(parts)
    return f"[← Positions](/positions) · {root_name} {scale_lbl}: {sequence}"


def _root_positions(root_name: str, fret_min: int, fret_max: int) -> list[tuple[str, int]]:
    """List of (string_name, fret) pairs where the root appears in the box."""
    root_pc = _pc(root_name)
    result = []
    for si, open_m in enumerate(_OPEN_MIDI):
        for f in range(fret_min, fret_max + 1):
            if (open_m + f) % 12 == root_pc:
                result.append((_STRING_NAMES[si], f))
    return result


def _degree_label_map(root_name: str, scale_type: str, fret_min: int, fret_max: int) -> dict[int, str]:
    """Map of {midi: degree_label} for every scale note in the box window.

    Python int keys become JSON string keys (JSON only allows string keys).
    JS object property access coerces int→str, so this round-trips correctly.
    """
    root_pc = _pc(root_name)
    labels  = _DEGREE_LABELS.get(scale_type, [])
    ivs     = SCALE_INTERVALS[scale_type]

    pc_to_label: dict[int, str] = {}
    for i, interval in enumerate(ivs[:-1]):   # skip the final octave repeat
        p = (root_pc + interval) % 12
        pc_to_label[p] = labels[i] if i < len(labels) else str(i + 1)

    result: dict[int, str] = {}
    for open_m in _OPEN_MIDI:
        for f in range(fret_min, fret_max + 1):
            midi = open_m + f
            p    = midi % 12
            if p in pc_to_label:
                result[midi] = pc_to_label[p]
    return result


def _box_midi_sets(root_name: str, scale_type: str, fret_min: int, fret_max: int) -> tuple[list[int], list[int]]:
    """Return (root_midis, ref_midis) for all scale notes in the box."""
    root_pc   = _pc(root_name)
    scale_pcs = {(root_pc + i) % 12 for i in SCALE_INTERVALS[scale_type]}
    all_notes = sorted({
        open_m + f
        for open_m in _OPEN_MIDI
        for f in range(fret_min, fret_max + 1)
        if (open_m + f) % 12 in scale_pcs
    })
    roots = [m for m in all_notes if m % 12 == root_pc]
    refs  = [m for m in all_notes if m % 12 != root_pc]
    return roots, refs


def _prev_box(group: dict, current_shape: str) -> tuple | None:
    """Return the box immediately below current_shape in fret order, or None."""
    boxes = group['boxes']
    for i, (shape, _, _) in enumerate(boxes):
        if shape == current_shape and i > 0:
            return boxes[i - 1]
    return None


def _box_note_count(root_name: str, scale_type: str, fret_min: int, fret_max: int) -> int:
    """Unique MIDI pitches in the drill sequence for this box.

    Matches scaledrill.js _buildSequence exactly:
    1. Collect all scale notes in [fret_min, fret_max] across all strings.
    2. Sort ascending.
    3. Trim to start at the lowest root occurrence (same as the JS drill).
    """
    root_pc   = _pc(root_name)
    scale_pcs = {(root_pc + i) % 12 for i in SCALE_INTERVALS[scale_type]}
    all_notes = sorted({
        open_m + f
        for open_m in _OPEN_MIDI
        for f in range(fret_min, fret_max + 1)
        if (open_m + f) % 12 in scale_pcs
    })
    # Find the lowest root occurrence — sequence starts here, not at absolute lowest
    root_candidates = [m for m in all_notes if m % 12 == root_pc]
    lowest_root = root_candidates[0] if root_candidates else (all_notes[0] if all_notes else 0)
    return sum(1 for m in all_notes if m >= lowest_root)


def _seq_length_for_box(root_name: str, scale_type: str, fret_min: int, fret_max: int, pattern: str) -> int:
    """Sequence length matching scaledrill.js _buildSequence for a real fret window."""
    n = _box_note_count(root_name, scale_type, fret_min, fret_max)
    if pattern in ('up', 'down'):
        return n
    if pattern == 'up_down':
        return 2 * n - 1
    if pattern == 'thirds':
        return max(0, (n - 2) * 2)
    return n


def _get_next_box(group: dict, current_shape: str) -> tuple | None:
    """Return the next CAGED box (in fret-ascending order) after current_shape, or None."""
    boxes = group['boxes']
    for i, (shape, fmin, fmax) in enumerate(boxes):
        if shape == current_shape and i + 1 < len(boxes):
            return boxes[i + 1]
    return None


def build_shape_lesson(pos: dict[str, Any]) -> dict[str, Any]:
    """Build the engine JSON (lesson block-tree) for a single CAGED shape drill page.

    Structure:
      1. Heading + shape origin (callout-key)
      2. Static degree-labeled fretboard reference (fretboard widget)
      3. Root positions + connections (callout-info)
      4. Part 1: up_down drill + checkpoint  → guided flag persisted on pass
      5. Part 2: thirds drill + checkpoint
      6. Blind run drill + checkpoint        → blind flag + complete
      7. (Optional) boundary drill connecting this shape to the next
    """
    root      = pos['root_sci']
    scale     = pos['scale_type']
    shape     = pos['shape']
    root_name = pos['root_name']
    fret_min  = pos['fret_min']
    fret_max  = pos['fret_max']
    title     = pos['title']
    scale_lbl = pos['scale_label']
    group_id  = pos['group_id']

    n_updown = _seq_length_for_box(root_name, scale, fret_min, fret_max, 'up_down')
    n_thirds = _seq_length_for_box(root_name, scale, fret_min, fret_max, 'thirds')
    n_up     = _seq_length_for_box(root_name, scale, fret_min, fret_max, 'up')
    common   = {'root': root, 'scale': scale, 'fretMin': fret_min, 'frets': fret_max}

    # ── Educational context ────────────────────────────────────────────────────
    shape_info   = _SHAPE_INFO.get(shape, {})
    origin_text  = shape_info.get('origin', '')
    landmark     = shape_info.get('landmark', '')

    root_pos  = _root_positions(root_name, fret_min, fret_max)
    root_pos_str = ', '.join(
        f"{sn} {'(open)' if f == 0 else f'fret {f}'}"
        for sn, f in root_pos
    )

    # Connection context: which shapes border this one?
    group    = KEY_GROUP_MAP.get(group_id)
    prev_box_entry = _prev_box(group, shape) if group else None
    next_box_entry = _get_next_box(group, shape) if group else None

    connection_parts = []
    if prev_box_entry:
        ps, pf0, pf1 = prev_box_entry
        connection_parts.append(f"**← Below:** {ps} shape (frets {pf0}–{pf1})")
    if next_box_entry:
        ns, nf0, nf1 = next_box_entry
        connection_parts.append(f"**→ Above:** {ns} shape (frets {nf0}–{nf1})")
    connection_str = '  ·  '.join(connection_parts) if connection_parts else ''

    # Finger assignments for intro (1 finger per fret, index = lowest fret).
    finger_names = ['index (1)', 'middle (2)', 'ring (3)', 'pinky (4)']
    if fret_min == 0:
        finger_guide = (
            "**Fingering:** open strings use no fret finger. "
            "Fret 1 = index (1), fret 2 = middle (2), fret 3 = ring (3), fret 4 = pinky (4). "
            "The hint below each note prompt tells you which finger to use."
        )
    else:
        assignments = ', '.join(
            f"fret {fret_min + i} = {finger_names[i]}"
            for i in range(min(4, fret_max - fret_min + 1))
        )
        finger_guide = (
            f"**Fingering:** {assignments}. "
            "One finger per fret — your hand stays in position for the whole box."
        )

    # ── Degree-labeled reference fretboard ────────────────────────────────────
    root_midis, ref_midis = _box_midi_sets(root_name, scale, fret_min, fret_max)
    label_map = _degree_label_map(root_name, scale, fret_min, fret_max)

    # ── Build block list ───────────────────────────────────────────────────────
    c = _Counter()
    blocks: list[dict[str, Any]] = []

    def md(content: str) -> dict:
        return {'id': c.next(), 'type': 'markdown', 'content': content}

    def callout(kind: str, content: str) -> dict:
        bid = c.next()
        child_bid = c.next()
        return {
            'id': bid, 'type': 'callout', 'kind': kind,
            'children': [{'id': child_bid, 'type': 'markdown', 'content': content}],
        }

    # 1. Heading
    blocks.append(md(f"## {title}"))

    # 1b. Breadcrumb nav (shape sequence + back link)
    if group:
        blocks.append(md(_shape_breadcrumb(group, group_id, scale, shape, root_name, scale_lbl)))

    # 2. Shape origin callout
    blocks.append(callout('key', origin_text))

    # 3. Degree-labeled reference fretboard
    blocks.append({
        'id': c.next(), 'type': 'widget', 'widget': 'fretboard',
        'props': {
            'frets':        fret_max,
            'fretMin':      fret_min,
            'highlight':    root_midis,
            'reference':    ref_midis,
            'labelMap':     label_map,
            'labels':       'marks',
            'registerView': True,
            'audio':        True,
        },
    })

    # 4. Root positions + navigation info callout
    nav_lines = [f"**Root ({root_name}) appears at:** {root_pos_str}"]
    if landmark:
        nav_lines.append(f"**Visual anchor:** {landmark}")
    if connection_str:
        nav_lines.append(connection_str)
    blocks.append(callout('info', '\n\n'.join(nav_lines)))

    # 5. Part 1 intro + up_down drill + checkpoint
    blocks.append(md(
        f"### Part 1 — Up and back down\n\n"
        f"Bright dot = note to play next; faint dots = rest of the shape for context. "
        f"Play each note in ascending order then back down.\n\n{finger_guide}"
    ))
    blocks.append({
        'id': c.next(), 'type': 'widget', 'widget': 'scaledrill',
        'props': {**common, 'pattern': 'up_down'},
    })
    blocks.append({
        'id': c.next(), 'type': 'checkpoint',
        'needs': n_updown, 'of': n_updown,
        'on_pass': {'set_flag': f'pos_{group_id}_{scale}_{shape}_updown'},
    })

    # 6. Thirds drill + checkpoint (guided tier complete)
    blocks.append(md(
        f"### Part 2 — Scale in thirds\n\n"
        f"Now play the scale in **ascending thirds**: skip one note, land on the next, "
        f"then back to the skipped note, forward again. Pattern: 1→3, 2→4, 3→5, 4→6 …\n\n"
        f"This is the classic guitar melodic exercise — it builds [interval](/glossary#interval) "
        f"awareness and trains your ears to hear harmonic motion inside the box."
    ))
    blocks.append({
        'id': c.next(), 'type': 'widget', 'widget': 'scaledrill',
        'props': {**common, 'pattern': 'thirds'},
    })
    blocks.append({
        'id': c.next(), 'type': 'checkpoint',
        'needs': n_thirds, 'of': n_thirds,
        'on_pass': {
            'set_flag': f'pos_{group_id}_{scale}_{shape}_guided',
            'persist':  {'key': f'mpos:{group_id}:{scale}:{shape}:guided'},
        },
    })

    # 7. Blind run + checkpoint (blind tier complete)
    blocks.append(md(
        f"### Part 3 — Blind run\n\n"
        f"The dots are gone. From memory, play **{root_name} {scale_lbl}** ascending "
        f"through the {shape} shape (frets {fret_min}–{fret_max}).\n\n"
        f"If you get stuck, scroll up to the degree reference above — then try again without looking."
    ))
    blocks.append({
        'id': c.next(), 'type': 'widget', 'widget': 'scaledrill',
        'props': {**common, 'pattern': 'up', 'blind': True},
    })
    blocks.append({
        'id': c.next(), 'type': 'checkpoint',
        'needs': n_up, 'of': n_up,
        'on_pass': {
            'set_flag': f'pos_{group_id}_{scale}_{shape}_blind',
            'persist':  {'key': f'mpos:{group_id}:{scale}:{shape}:blind'},
            'complete': True,
        },
    })

    # Next-shape CTA — shown when blind run passes
    if next_box_entry:
        ns, nf0, nf1 = next_box_entry
        next_url = f"/positions/{group_id}/{scale}/{ns}"
        cta_md = (
            f"**{shape} shape complete!** "
            f"[{ns} shape — frets {nf0}–{nf1} →]({next_url})"
        )
    else:
        fn_url = f"/positions/{group_id}/{scale}/full_neck"
        cta_md = (
            f"**All five shapes done!** "
            f"[Full Neck Run →]({fn_url})"
        )
    blocks.append({
        'id': c.next(), 'type': 'when',
        'flag': f'pos_{group_id}_{scale}_{shape}_blind',
        'children': [callout('key', cta_md)],
    })

    # 8. (Optional) boundary drill — connect to the next shape
    if next_box_entry:
        next_shape, next_fmin, next_fmax = next_box_entry
        n_boundary = _seq_length_for_box(root_name, scale, fret_min, next_fmax, 'up_down')

        blocks.append(md(
            f"### Bonus — Connect {shape} → {next_shape}\n\n"
            f"The **{shape} shape** (frets {fret_min}–{fret_max}) and the "
            f"**{next_shape} shape** (frets {next_fmin}–{next_fmax}) share boundary notes — "
            f"the top of {shape} overlaps with the bottom of {next_shape}.\n\n"
            f"Play the full run spanning both shapes in one phrase. "
            f"Notice where the shapes hand off: the notes that belong to both boxes simultaneously "
            f"are the seam that makes the [CAGED](/glossary#caged-system) system seamless."
        ))
        blocks.append({
            'id': c.next(), 'type': 'widget', 'widget': 'scaledrill',
            'props': {
                'root':    root,
                'scale':   scale,
                'fretMin': fret_min,
                'frets':   next_fmax,
                'pattern': 'up_down',
            },
        })
        blocks.append({
            'id': c.next(), 'type': 'checkpoint',
            'needs': n_boundary, 'of': n_boundary,
            'on_pass': {'persist': {'key': f'mpos:{group_id}:{scale}:{shape}:boundary'}},
        })

    return {
        'id':     f'pos_{group_id}_{scale}_{shape}',
        'title':  title,
        'blocks': blocks,
    }


# ---------------------------------------------------------------------------
# Full-neck run lesson (all 5 shapes in one continuous drill)
# ---------------------------------------------------------------------------

def build_full_neck_lesson(group_id: str, scale_type: str) -> dict[str, Any] | None:
    """
    Build the engine JSON for a full-neck run: all 5 CAGED shapes from the lowest
    fret to the highest in one connected drill.
    """
    group = KEY_GROUP_MAP.get(group_id)
    if not group:
        return None

    if scale_type in ('pentatonic_major', 'major'):
        root_name = group['major']
    elif scale_type in ('pentatonic_minor', 'natural_minor'):
        root_name = group['relative_minor']
    else:
        return None

    scale_lbl  = SCALE_DISPLAY[scale_type]
    title      = f"{root_name} {scale_lbl} — Full Neck Run"
    lesson_id  = f'pos_{group_id}_{scale_type}_full_neck'

    # Fret range spanning all 5 boxes
    fret_min = min(b[1] for b in group['boxes'])
    fret_max = max(b[2] for b in group['boxes'])

    root_pc   = _pc(root_name)
    root_midi = _lowest_root_in_window(root_pc, fret_min, fret_max)
    if root_midi is None:
        return None
    root_sci = _midi_to_sci(root_midi)

    n_up     = _seq_length_for_box(root_name, scale_type, fret_min, fret_max, 'up')
    n_updown = _seq_length_for_box(root_name, scale_type, fret_min, fret_max, 'up_down')
    n_thirds = _seq_length_for_box(root_name, scale_type, fret_min, fret_max, 'thirds')

    common = {
        'root':    root_sci,
        'scale':   scale_type,
        'fretMin': fret_min,
        'frets':   fret_max,
    }

    intro = (
        f"## {title}\n\n"
        f"All five CAGED shapes, frets {fret_min}–{fret_max}, in one continuous run. "
        f"Each shape overlaps the next — boundary notes belong to both boxes simultaneously. "
        f"The goal: navigate the full neck without pausing to 'find your place'.\n\n"
        f"**Part 1 — Ascending and descending.** Bright dot = target; "
        f"faint dots = rest of the shape. Follow the sequence up and back."
    )

    blind_intro = (
        f"## Full Neck — Blind\n\n"
        f"Dots are gone. Play {root_name} {scale_lbl} ascending across the full neck "
        f"(frets {fret_min}–{fret_max}) from memory. You now know where each shape lives "
        f"and how they connect at their boundaries."
    )

    blocks: list[dict[str, Any]] = [
        {
            'id':      'b1',
            'type':    'markdown',
            'content': intro,
        },
        {
            'id':     'b2',
            'type':   'widget',
            'widget': 'scaledrill',
            'props':  {**common, 'pattern': 'up_down'},
        },
        {
            'id':      'b3',
            'type':    'checkpoint',
            'needs':   n_updown,
            'of':      n_updown,
            'on_pass': {
                'set_flag': f'{lesson_id}_guided',
                'persist':  {'key': f'mpos:{group_id}:{scale_type}:full_neck:guided'},
            },
        },
        {
            'id':     'b4',
            'type':   'widget',
            'widget': 'scaledrill',
            'props':  {**common, 'pattern': 'thirds'},
        },
        {
            'id':      'b5',
            'type':    'checkpoint',
            'needs':   n_thirds,
            'of':      n_thirds,
            'on_pass': {'set_flag': f'{lesson_id}_thirds'},
        },
        {
            'id':      'b6',
            'type':    'markdown',
            'content': blind_intro,
        },
        {
            'id':     'b7',
            'type':   'widget',
            'widget': 'scaledrill',
            'props':  {**common, 'pattern': 'up', 'blind': True},
        },
        {
            'id':      'b8',
            'type':    'checkpoint',
            'needs':   n_up,
            'of':      n_up,
            'on_pass': {
                'set_flag': f'{lesson_id}_blind',
                'persist':  {'key': f'mpos:{group_id}:{scale_type}:full_neck:complete'},
                'complete': True,
            },
        },
    ]

    return {
        'id':     lesson_id,
        'title':  title,
        'blocks': blocks,
    }


# ---------------------------------------------------------------------------
# Interactive overview data (mini fretboards on /positions)
# ---------------------------------------------------------------------------

def _scale_pcs(root_name: str, scale_type: str) -> set[int]:
    root = _pc(root_name)
    return {(root + i) % 12 for i in SCALE_INTERVALS[scale_type]}


def _box_midis(pcs: set[int], fret_min: int, fret_max: int) -> list[int]:
    return sorted(set(
        open_m + f
        for open_m in _OPEN_MIDI
        for f in range(fret_min, fret_max + 1)
        if (open_m + f) % 12 in pcs
    ))


def caged_overview_data() -> dict:
    """
    MIDI note data for each key/scale/shape box — used by the interactive
    shape-explorer on /positions.  Structure:
        {group_id: {scale_type: {shape: {notes, roots, fret_min, fret_max}}}}
    """
    data: dict = {}
    for group in KEY_GROUPS:
        gid = group['id']
        data[gid] = {}
        for scale_type in ('pentatonic_major', 'pentatonic_minor', 'major', 'natural_minor'):
            root_name = (
                group['major'] if scale_type in ('pentatonic_major', 'major')
                else group['relative_minor']
            )
            pcs     = _scale_pcs(root_name, scale_type)
            root_pc = _pc(root_name)
            data[gid][scale_type] = {}
            for shape, fmin, fmax in group['boxes']:
                notes = _box_midis(pcs, fmin, fmax)
                roots = [m for m in notes if m % 12 == root_pc]
                data[gid][scale_type][shape] = {
                    'notes':    notes,
                    'roots':    roots,
                    'fret_min': fmin,
                    'fret_max': fmax,
                }
    return data
