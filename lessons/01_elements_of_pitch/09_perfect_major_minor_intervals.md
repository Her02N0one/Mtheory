---
id: "1.9"
chapter: "Elements of Pitch"
title: "Perfect, Major & Minor Intervals"
requires: [knows_intervals_intro]
grants: [knows_interval_qualities]
estimated_min: 20
---

# Perfect, Major & Minor Intervals

The generic number (2nd, 3rd, etc.) tells you *how far* two notes are by letter. The **quality** tells you the exact size in semitones. Most intervals come in two flavours — major and minor — but four special intervals are called **perfect**.

## The perfect intervals

An interval is **perfect** if it exists in both major and its parallel minor with the same exact size, and if inverting it also produces a perfect interval. There are four:

| Name | Semitones | Example |
| :--- | :--- | :--- |
| Perfect Unison (P1) | 0 | C → C |
| Perfect 4th (P4) | 5 | C → F |
| Perfect 5th (P5) | 7 | C → G |
| Perfect Octave (P8) | 12 | C → C (higher) |

:::callout key
Perfect intervals feel **stable and open**. The perfect 5th is the most "hollow" stable sound; the perfect 4th is its mirror. Both appear constantly in power chords, open tunings, and counterpoint.
:::

:::widget scaleview {view: "keyboard", root: "C4", scale: "major", steps: true, labels: "degrees", interactive: true}
:::

## Major and minor intervals

The 2nd, 3rd, 6th, and 7th each come in two sizes. The larger version (from the major scale) is **major**; one semitone smaller is **minor**.

| Generic | Major | Semitones | Minor | Semitones |
| :--- | :--- | :--- | :--- | :--- |
| 2nd | Major 2nd (M2) | 2 | Minor 2nd (m2) | 1 |
| 3rd | Major 3rd (M3) | 4 | Minor 3rd (m3) | 3 |
| 6th | Major 6th (M6) | 9 | Minor 6th (m6) | 8 |
| 7th | Major 7th (M7) | 11 | Minor 7th (m7) | 10 |

:::callout info
An easy anchor: all intervals built on the **major scale from the tonic upward** are either major or perfect. The major scale is literally named after its intervals.
:::

## The full interval table

| Name | Abbreviation | Semitones | Example from C |
| :--- | :--- | :--- | :--- |
| Perfect Unison | P1 | 0 | C–C |
| Minor 2nd | m2 | 1 | C–D♭ |
| Major 2nd | M2 | 2 | C–D |
| Minor 3rd | m3 | 3 | C–E♭ |
| Major 3rd | M3 | 4 | C–E |
| Perfect 4th | P4 | 5 | C–F |
| Tritone | TT | 6 | C–F♯ / C–G♭ |
| Perfect 5th | P5 | 7 | C–G |
| Minor 6th | m6 | 8 | C–A♭ |
| Major 6th | M6 | 9 | C–A |
| Minor 7th | m7 | 10 | C–B♭ |
| Major 7th | M7 | 11 | C–B |
| Perfect Octave | P8 | 12 | C–C |

## Hearing perfect 5ths on the neck

A perfect 5th is the interval between the two notes of a power chord. It is everywhere on the guitar — any root note plus the note two frets higher on the next string (five strings' standard tuning apart is P4; two strings is P5 on E–A–D–G or B–E).

Play the root and its perfect 5th across the full position below.

:::widget scaledrill {root: "C3", scale: "pentatonic_major", pattern: "up", strings: [1, 2, 3], frets: 7}
:::

:::callout info
You are playing the roots of the C major pentatonic — every one of these notes has a perfect 5th available two frets up on the next string (with the G–B exception at string 3→4).
:::

---

# Checkpoint

:::widget mcq {question: "How many semitones is a Major 3rd?", options: ["3", "4", "5"], answer: 1}
:::

:::widget mcq {question: "How many semitones is a Perfect 5th?", options: ["6", "7", "8"], answer: 1}
:::

:::widget mcq {question: "The interval C to E♭ is a:", options: ["Major 3rd", "Minor 3rd", "Perfect 4th"], answer: 1}
:::

:::widget mcq {question: "Which intervals can be perfect (not major or minor)?", options: ["2nds and 3rds", "Unison, 4th, 5th, Octave", "3rds and 7ths"], answer: 1}
:::

:::widget mcq {question: "All intervals built upward from the tonic of a major scale are:", options: ["Major or perfect", "Minor or perfect", "Augmented or perfect"], answer: 0}
:::

:::checkpoint {needs: 5, of: 5, on_pass: {complete: true}}
:::
