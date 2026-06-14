---
id: "1.8"
chapter: "Elements of Pitch"
title: "Intervals"
requires: [knows_scale_degree_names]
grants: [knows_intervals_intro]
estimated_min: 15
---

# Intervals

An **interval** is the distance between two pitches. Every melody is built from intervals; every chord is a stack of them. You have already used intervals without naming them — the W and H labels on major and minor scales are intervals. Now you'll name all of them systematically.

## Counting intervals

Intervals are counted by the number of **letter names** they span, *inclusive* of both endpoints.

| Lower | Upper | Letters spanned | Interval name |
| :--- | :--- | :--- | :--- |
| C | C | C (1 letter) | **Unison** |
| C | D | C D (2 letters) | **2nd** |
| C | E | C D E (3 letters) | **3rd** |
| C | F | C D E F (4 letters) | **4th** |
| C | G | C D E F G (5 letters) | **5th** |
| C | A | C D E F G A (6 letters) | **6th** |
| C | B | C D E F G A B (7 letters) | **7th** |
| C | C | C…C (8 letters) | **Octave** |

:::callout key
Count by letter name, not by piano keys. The letter count gives the **generic** interval (2nd, 3rd, etc.). The exact number of semitones gives the **specific** quality (major, minor, perfect, etc.) — covered in the next lesson.
:::

## Intervals on the staff

On the staff, an interval is easy to see: **line to line** or **space to space** is always a 3rd; **line to space** (adjacent) is always a 2nd. The visual distance doubles as a rough interval meter.

:::widget staff {low: "C4", high: "C5", notes: ["C4", "E4"], labels: "names", interactive: true}
:::

## Intervals on the guitar

On the guitar, every interval has a **shape** — a fixed pattern of string and fret that works the same way anywhere on the neck. This is one of the guitar's great advantages over the piano: the same interval always looks the same.

The most important shapes to memorise first:

| Interval | Semitones | Same-string shape | Adjacent-string shape |
| :--- | :--- | :--- | :--- |
| Unison | 0 | Same fret | (varies by string pair) |
| Half step | 1 | 1 fret up | — |
| Whole step | 2 | 2 frets up | — |
| Minor 3rd | 3 | 3 frets up | 2 frets back on next string |
| Major 3rd | 4 | 4 frets up | 1 fret back on next string |
| Perfect 4th | 5 | 5 frets up | Same fret on next string |
| Tritone | 6 | 6 frets up | 1 fret up on next string |
| Perfect 5th | 7 | 7 frets up | 2 frets up on next string |
| Octave | 12 | 12 frets up | 2 strings up, 2 frets up |

:::callout info
**The G–B exception:** every adjacent string pair is tuned a perfect 4th apart, *except* G–B which is a major 3rd. This shifts cross-string interval shapes by one fret whenever the B string is involved. You will feel this constantly — learn to expect it.
:::

## The reference interval: the perfect 4th

The most common melodic jump on guitar is the **perfect 4th** — it is the distance between every adjacent open string except G–B. Playing on the same fret on two adjacent strings (E–A, A–D, D–G, or B–E) always produces a perfect 4th. Every other interval shape can be derived from this anchor.

---

# Checkpoint

:::widget mcq {question: "How many letters does a 5th span (counting both endpoints)?", options: ["4", "5", "6"], answer: 1}
:::

:::widget mcq {question: "What is the interval from C up to E (counting letter names)?", options: ["2nd", "3rd", "4th"], answer: 1}
:::

:::widget mcq {question: "On the guitar, playing the same fret on adjacent strings E–A produces a:", options: ["Major 3rd", "Perfect 4th", "Perfect 5th"], answer: 1}
:::

:::widget mcq {question: "Which string pair is the exception to the standard tuning rule?", options: ["A–D", "D–G", "G–B"], answer: 2}
:::

:::checkpoint {needs: 4, of: 4, on_pass: {complete: true}}
:::
