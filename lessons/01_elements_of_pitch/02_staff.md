---
id: "1.2"
chapter: "Elements of Pitch"
title: "Notation on the Staff — Treble Clef"
requires: [completed_pitch_basics]
grants: [reads_treble_staff]
estimated_min: 12
---

# Writing pitch down

In the last lesson you *heard* pitch and *placed* it — on the keyboard and the
neck. Now you'll learn to **read** it. Western music writes pitch on a **staff**:
five lines and four spaces. The higher a note sits on the staff, the higher it
sounds — the same up-is-higher logic as the keyboard, turned on its side.

A staff alone doesn't fix which pitches the lines mean. A **clef** does that. The
one you'll meet first — and use most on guitar — is the **treble clef**. It curls
around the second line from the bottom and pins it to **[[G4]]**, which is why it's
also called the *G clef*. Everything else is measured from there.

The lowest note on the staff here is **[[C4]]**. On a piano, that pitch sits at the
horizontal centre of the full 88-key instrument — which is why pianists call it
*middle C*. The name comes from the piano's layout, not from any property of the
pitch itself; on guitar it's just [[C4]], one pitch among many.

## Phase 1 — The staff sandbox

Here is a treble staff carrying the natural notes from [[C4]] up. Click any
notehead and listen. Notice the same thing you saw on the piano: moving **up** the
staff raises the pitch, moving **down** lowers it.

:::widget staff {low: "C4", high: "G5"}
:::

The lowest note here, [[C4]], hangs below the staff on its own little **ledger
line** — your anchor from last lesson. From there the notes climb line, space,
line, space, all the way up.

## Phase 2 — Lines and spaces

The treble staff has a fixed map. Read it from the **bottom up**.

The five **lines** spell **[[E]] [[G]] [[B]] [[D]] [[F]]** — *Every Good Boy Does
Fine*. The four **spaces** spell **[[F]] [[A]] [[C]] [[E]]** — they literally spell
**FACE**, bottom to top.

:::callout key
Click straight up the staff and say each letter as it sounds: line [[E]], space
[[F]], line [[G]], space [[A]], line [[B]], space [[C]], line [[D]], space [[E]],
line [[F]]. That's one octave of the alphabet, lines and spaces alternating.
:::

:::widget staff {low: "E4", high: "F5"}
:::

Two anchors make the rest easy to find:

:::callout info
The **bottom line is [[E]]** and the **top space is [[E]]** — same letter, an
octave apart. And the clef's curl sits on **[[G]]** (the second line). Find those
three and you can count to any other note.
:::

## Phase 3 — The translation

The staff and the keyboard are two views of the *same* pitches. Below, a note on
the treble staff sits above the keyboard that plays it. Press a key and watch its
notehead light up on the staff; the two always agree.

:::widget staffcompanion {low: "C4", high: "C6", highlight: "C4", sync: true}
:::

Look at **[[C4]]** — one ledger line *below* the staff on the left, and the white
key just left of the two black keys on the right. The note that looked "lowest and
lonely" on the staff is the same anchor you already own on the keyboard.

:::callout info
On the keyboard, [[C4]] sits almost dead-center of a full 88-key piano — which is
why pianists nickname it ***middle C***. That name is a keyboard idea (it's also
the note that joins the treble and bass staves on the grand staff). The *pitch* is
just [[C4]]; "middle C" is what you call it at the piano.
:::

Play up from there and watch each notehead step up the staff in time with the keys.

## Phase 4 — Onto the neck

Treble clef isn't only for pianists — it's the clef **guitar** music is written in.
But the guitar has a quirk you need to know right now: **it sounds an octave lower than it is written.**

That's shown by the **8** printed below the clef. The number tells you: every written note sounds one octave lower than it looks. A note written on the bottom line of the staff is [[E4]]./ on a piano, but on a guitar it sounds as **[[E3]]**.

This shift lets the full guitar range fit inside a single treble staff (with just a few ledger lines), instead of requiring a grand staff or constant ledger lines.

Here is the full guitar sounding range mapped to its written staff positions. Play any fret or key — watch the written note light on the staff above it.

:::widget staffcompanion {low: "E2", high: "E5", clef: "guitar", guitar: true, frets: 15, labels: "none", sync: true}
:::

The six **open strings** sit at the edges: [[E2]] and [[A2]] and [[D3]] hang below the staff on ledger lines (written up as E3 A3 D4), while [[G3]] [[B3]] [[E4]] live at the bottom of the staff and just above it (written G4 B4 E5). At the 15th fret the high E string reaches **[[G#5]]** sounding, written as G#6 — well above the staff. That is the full guitar range in one clef.

## Phase 5 — Both clefs, one guitar

The guitar's sounding range spans [[E2]] (open low-E string) to about [[E6]] — too wide for treble alone. Western music covers that range with a **grand staff**: treble clef on top, bass clef below, the two staves joined by a bar and brace. [[C4]] sits on a single short ledger line between them, in the gap where the two clefs meet.

Here are all six open strings plotted at their **actual sounding pitches**:

:::widget grandstaff {notes: ["E2", "A2", "D3", "G3", "B3", "E4"], labels: "names", interactive: true}
:::

:::callout info
Strings 1–3 ([[E2]], [[A2]], [[D3]]) live in the bass clef. String 4 ([[G3]]) sits just below the join. Strings 5–6 ([[B3]], [[E4]]) are near the treble bottom. This is why guitar music is written entirely in treble clef — but shifted an octave up. Doing so keeps all six strings inside or near a single staff and avoids constant ledger-line reading.
:::

## Phase 6 — The crucible

Reading, for real. A single note appears on the staff with **no letter** — name it
by pressing its key on the keyboard below. Lines and spaces, *Every Good Boy* and
*FACE*.

:::read {range: "C4-G5", notes: naturals, count: 10}
:::

:::checkpoint {needs: 8, of: 10, on_pass: {complete: true}}
:::
