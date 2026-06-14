"""lesson_dsl.py — Markdown DSL → JSON block-tree compiler.

─── What it does ────────────────────────────────────────────────────────────
Reads a Markdown file with YAML frontmatter and `:::directive` blocks,
and compiles it to the JSON lesson format that engine.js understands.

Route: GET /learn/x/{lesson_id}
  → main.py calls compile_lesson(file_text)
  → returns {id, title, requires, grants, blocks: [...]}
  → injected into engine.html as `lesson_json | safe`

─── Lesson file format ──────────────────────────────────────────────────────

    ---
    id: "1.1"
    title: "Keyboard & Octave Registers"
    requires: []
    grants: [completed_pitch_basics]
    ---

    # This is Markdown prose — renders as a markdown block.

    :::widget keyboard {octaves: 3, highlight: "C4", labels: "naturals"}
    :::

    :::listen {waitFor: note_played, where: "note == C4", then: {set_flag: c_pressed}}
    :::

    :::when {flag: c_pressed}
    This text is revealed once c_pressed is set.

    :::callout info
    Pro tip: you can nest blocks inside container directives.
    :::

    :::

─── Directive types ─────────────────────────────────────────────────────────
Leaf directives (no children):
  :::widget <type> {props}       Mount a UI component (scaledrill, keyboard, etc.)
  :::listen {waitFor, where, then, blocking?, once?}  Event gate
  :::button {label, action}      Clickable action
  :::checkpoint {needs, of, on_pass}  Progress gate
  :::recall {mode, ...}          Quiz block

Container directives (have nested children, closed with bare :::):
  :::when {flag: x}  or  :::when {expr: "note == C4"}   Conditional section
  :::callout <kind>  (info | key | warn)                 Styled info box

─── on_pass / action fields ─────────────────────────────────────────────────
  set_flag: "name"          Set a flag; re-evaluates all when-blocks
  persist: {key, value?}    localStorage.setItem(key, value || "1")
  complete: true            Mark lesson done

─── Compilation pipeline ────────────────────────────────────────────────────
parse_frontmatter(text) → (metadata_dict, body_string)
parse_blocks(body)      → [block_dict, ...]   (stack-based, handles nesting)
compile_lesson(text)    → full lesson_dict
"""

from __future__ import annotations

import re
from typing import Any

# Directives whose body contains nested child blocks. The parser will attach a 'children' array to these.
_CONTAINERS = {"when", "callout"}

# Directives that take a leading type token before the prop map (e.g., `:::widget keyboard {..}`).
_TYPED = {"widget"}


# --------------------------------------------------------------------------- #
# Relaxed YAML-flow prop parser  ({octaves: 3, then: {set_flag: c_pressed}})    #
# --------------------------------------------------------------------------- #
def _split_top_level(s: str) -> list[str]:
    """
    Split a comma-separated string, ignoring commas inside nested structures.
    
    This acts as a rudimentary state machine. It iterates through characters,
    tracking whether it is currently inside a quote (" or '), a list ([]), 
    or a map ({}). It only splits on a comma if it is at the root depth.
    
    Example: "{a: 1, b: [2, 3]}" -> ["a: 1", "b: [2, 3]"]
    """
    parts: list[str] = []
    depth = 0
    quote = ""
    buf: list[str] = []
    
    for ch in s:
        # Inside a quoted string: pass every character through verbatim.
        # Brackets, commas, and colons have no structural meaning here.
        # `quote` holds the opening delimiter (" or ') so we know which
        # character ends the string.
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = ""  # matching closing delimiter — exit string mode
            continue
            
        # Entering a string literal
        if ch in "\"'":
            quote = ch
            buf.append(ch)
        # Entering a nested list or map
        elif ch in "[{":
            depth += 1
            buf.append(ch)
        # Exiting a nested list or map
        elif ch in "]}":
            depth -= 1
            buf.append(ch)
        # Safe comma at the root level: split here
        elif ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        # Standard character
        else:
            buf.append(ch)
            
    # Flush the remaining buffer into the final part
    if buf:
        parts.append("".join(buf))
        
    # Clean up whitespace before returning
    return [p.strip() for p in parts if p.strip()]


def _parse_value(raw: str) -> Any:
    """
    Parse a single relaxed-YAML scalar, list, or map value into a Python type.
    
    This function recursively handles nested lists and maps, and infers
    booleans, nulls, integers, and floats from bare strings.
    """
    raw = raw.strip()
    if not raw:
        return ""
        
    # Strip surrounding quotes if it is an explicit string literal
    if (raw[0], raw[-1]) in (("\"", "\""), ("'", "'")):
        return raw[1:-1]
        
    # Handle Lists: Recursively parse each item inside the brackets
    if raw[0] == "[" and raw[-1] == "]":
        return [_parse_value(item) for item in _split_top_level(raw[1:-1])]
        
    # Handle Maps: Recursively parse the key-value pairs inside the braces
    if raw[0] == "{" and raw[-1] == "}":
        return _parse_map(raw[1:-1])
        
    # Type Inference for scalars
    low = raw.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low in ("null", "none"):
        return None
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d*\.\d+", raw):
        return float(raw)
        
    # If no other types matched, treat it as a bare string
    return raw 


def _parse_map(body: str) -> dict[str, Any]:
    """
    Parse a string of comma-separated key-value pairs into a Python dictionary.
    Supports shorthand boolean flags (e.g., `{blocking}` becomes `{"blocking": True}`).
    """
    out: dict[str, Any] = {}
    for item in _split_top_level(body):
        if ":" not in item:
            # Handle shorthand flags (no colon present)
            out[item.strip()] = True
            continue
            
        # Split on the first colon to separate key and value
        key, _, val = item.partition(":")
        
        # Clean the key (remove quotes and whitespace) and parse the value
        out[key.strip().strip("\"'")] = _parse_value(val)
    return out


def parse_props(text: str) -> dict[str, Any]:
    """
    Entry point for parsing the `{ ... }` property block attached to a directive.
    Returns an empty dictionary if the directive has no properties.
    """
    text = text.strip()
    if not text:
        return {}
    # Strip the outermost braces before passing to the map parser
    if text[0] == "{" and text[-1] == "}":
        text = text[1:-1]
    return _parse_map(text)


# --------------------------------------------------------------------------- #
# Frontmatter                                                                 #
# --------------------------------------------------------------------------- #
def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """
    Extract the leading `---` YAML-ish frontmatter from the Markdown body.
    
    Returns a tuple containing:
    1. A dictionary of the metadata.
    2. The remaining Markdown body string.
    """
    # Regex breakdown:
    # ^---\s*\n  : Matches the opening '---' and newline
    # (.*?)      : Group 1 - Non-greedy match for the metadata block
    # \n---\s*\n?: Matches the closing '---' and optional newline
    # (.*)$      : Group 2 - The rest of the document (the lesson body)
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
        
    meta_block, body = m.group(1), m.group(2)
    meta: dict[str, Any] = {}
    
    # Parse the frontmatter line by line
    for line in meta_block.splitlines():
        line = line.strip()
        # Skip empty lines, comments, or malformed lines
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        meta[key.strip()] = _parse_value(val)
        
    return meta, body


# --------------------------------------------------------------------------- #
# Block parsing                                                               #
# --------------------------------------------------------------------------- #

# Matches `:::name {props}`. Group 1 is the name (optional), Group 2 is the rest.
_DIRECTIVE_RE = re.compile(r"^:::(\w+)?(.*)$")


class _Counter:
    """Stateful counter to generate unique sequential IDs for each block."""
    def __init__(self) -> None:
        self.n = 0

    def next(self) -> str:
        self.n += 1
        return f"b{self.n}"


def _flush_markdown(lines: list[str], out: list[dict], ids: _Counter) -> None:
    """
    Take accumulated prose lines, join them, and append them to the output tree 
    as a single 'markdown' block. Clears the buffer afterward.
    """
    content = "\n".join(lines).strip()
    if content:
        out.append({"id": ids.next(), "type": "markdown", "content": content})
    lines.clear()


def _build_directive(name: str, rest: str, ids: _Counter) -> dict[str, Any]:
    """
    Construct the JSON dictionary for a directive header.
    This parses the properties and structures the dictionary based on the directive type,
    but does not process nested children.
    """
    rest = rest.strip()
    block: dict[str, Any] = {"id": ids.next(), "type": name}
    type_token = ""
    
    # Handle typed directives (e.g., `:::widget keyboard {props}`)
    if name in _TYPED:
        m = re.match(r"(\w+)\s*(.*)$", rest)
        if m:
            type_token, rest = m.group(1), m.group(2)
            
    # Handle styled callouts (e.g., `:::callout info {props}`)
    elif name == "callout":
        m = re.match(r"(\w+)\s*(.*)$", rest)
        if m:
            block["kind"] = m.group(1)
            rest = m.group(2)

    # Parse whatever is left as the properties map
    props = parse_props(rest)

    # Structure the block based on its specific requirements
    if name == "widget":
        block["widget"] = type_token
        block["props"] = props
    elif name == "when":
        # Lift 'flag' or 'expr' out of props and onto the block root for the State Machine
        if "flag" in props:
            block["flag"] = props["flag"]
        if "expr" in props:
            block["expr"] = props["expr"]
        block["children"] = []
    elif name == "callout":
        block["children"] = []
    else:
        # Leaf directives (listen, button, recall, checkpoint) merge props directly onto the block root
        block.update(props)
        
    return block


def parse_blocks(body: str, ids: _Counter | None = None) -> list[dict]:
    """
    Parse a markdown body into an ordered list of typed blocks.

    Architecture: Stack-based Parser
    - Every `:::name` directive opens a frame on the stack.
    - The next bare `:::` closes the most recent frame.
    - Container directives (`when`, `callout`) keep prose/blocks nested inside them as `children`.
    - Leaf directives use a throwaway sink because they carry props, not nested content.
    """
    if ids is None:
        ids = _Counter()
        
    lines = body.splitlines()
    out: list[dict] = []
    md_buf: list[str] = []
    
    # Stack tracks open directives: List of tuples (block_dictionary, list_to_append_children_to)
    stack: list[tuple[dict, list]] = []

    def sink() -> list[dict]:
        """Returns the current list we should append blocks to (either root or a nested child array)."""
        return stack[-1][1] if stack else out

    for line in lines:
        m = _DIRECTIVE_RE.match(line.rstrip())
        
        # If it's standard Markdown prose, buffer it
        if not m:
            md_buf.append(line)
            continue

        # We hit a directive (`:::`). First, flush any buffered Markdown into the current sink.
        _flush_markdown(md_buf, sink(), ids)
        name, rest = m.group(1), m.group(2)

        # Handle a closing directive (bare `:::`)
        if not name: 
            if stack:
                stack.pop() # Close the nearest open directive frame
            continue

        # Handle an opening directive (`:::name`)
        block = _build_directive(name, rest, ids)
        sink().append(block) # Append it to the current active level
        
        # If it's a container, its children array becomes the new active sink target
        child_list = block["children"] if name in _CONTAINERS else []
        stack.append((block, child_list))

    # Flush any remaining Markdown at the end of the file
    _flush_markdown(md_buf, sink(), ids)
    return out


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #
def scan_chapters(lessons_dir: str = "lessons") -> list[dict]:
    """Scan the lessons/ directory and return a sorted chapter/lesson index.

    Returns a list of chapter dicts:
      [{num, title, lessons: [{id, title, estimated_min, file_path}, ...]}, ...]

    Chapters are sorted by their numeric prefix; lessons within each chapter are
    sorted numerically by their frontmatter id (so 1.10 comes after 1.9).
    Directories whose names start with '_' (e.g. _smoke) are skipped.
    """
    from pathlib import Path

    base = Path(lessons_dir)
    if not base.exists():
        return []

    chapter_map: dict[str, list[dict]] = {}

    for md_file in base.rglob("*.md"):
        if any(part.startswith("_") for part in md_file.parts):
            continue
        try:
            meta, _ = parse_frontmatter(md_file.read_text(encoding="utf-8"))
            lid     = meta.get("id")
            title   = meta.get("title", "")
            chapter = meta.get("chapter", "")
            if not lid or not chapter:
                continue
            chapter_map.setdefault(chapter, []).append({
                "id":            lid,
                "title":         title,
                "chapter":       chapter,
                "estimated_min": meta.get("estimated_min"),
                "file_path":     str(md_file),
            })
        except Exception:
            continue

    def _id_sort_key(lesson: dict) -> tuple:
        try:
            return tuple(int(p) for p in lesson["id"].split("."))
        except ValueError:
            return (999,)

    chapters = []
    for chapter_title, lessons in chapter_map.items():
        lessons.sort(key=_id_sort_key)
        chapter_num = lessons[0]["id"].split(".")[0] if lessons else "0"
        chapters.append({
            "num":     chapter_num,
            "title":   chapter_title,
            "lessons": lessons,
        })

    chapters.sort(key=lambda c: int(c["num"]) if c["num"].isdigit() else 999)
    return chapters


def compile_lesson(text: str) -> dict[str, Any]:
    """Compile raw DSL source text into the final JSON lesson tree."""
    meta, body = parse_frontmatter(text)
    blocks = parse_blocks(body)
    lesson = dict(meta)
    lesson["blocks"] = blocks
    return lesson


def compile_file(path: str) -> dict[str, Any]:
    """Helper to read a file from disk and compile it."""
    with open(path, "r", encoding="utf-8") as fh:
        return compile_lesson(fh.read())


if __name__ == "__main__":  # Quick CLI runner for self-testing
    import json
    import sys

    src = sys.argv[1] if len(sys.argv) > 1 else "lessons/_smoke/keyboard.md"
    print(json.dumps(compile_file(src), indent=2))