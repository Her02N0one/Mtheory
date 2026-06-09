---
id: "1.3"
chapter: "Elements of Pitch"
title: "The Major Scale"
requires: [reads_treble_staff]
grants: [knows_major_scale]
estimated_min: 15
---

# The major scale

Major and minor scales form the basis of tonal music. However, there are many
other kinds of scales, some of which will be covered in a later chapter.

The **major scale** is a specific pattern of small steps (called **half steps**)
and larger ones (called **whole steps**) encompassing an octave.

:::callout info
Throughout these lessons, major scales are named with **uppercase** letters —
for example **A major** or simply **A** — and minor scales with *lowercase* —
for example *a minor* or simply *a*.
:::

## Phase 1 — Half steps and whole steps

A **half step** is the distance from a key on the piano to the very next key —
white *or* black, with nothing in between. Using only the white keys on the
piano keyboard, there are **two half steps** in each octave: between [[E]] and
[[F]], and between [[B]] and [[C]].

:::widget stepview {steps: [{from: "E4", type: "half"}, {from: "B4", type: "half"}]}
:::

A **whole step** skips the very next key and goes instead to the following one —
it spans two half steps. Using only the white keys, there are **five whole
steps** in each octave: C–D, D–E, F–G, G–A, and A–B.

:::widget stepview {type: "whole"}
:::

On the chromatic circle, each clockwise position is one half step. A whole step
skips one node; a half step moves to the adjacent node.

:::callout key
The two natural half steps — **[[E]]–[[F]]** and **[[B]]–[[C]]** — are your
fixed landmarks. Every other pair of adjacent white keys is a whole step apart.
:::

## Phase 2 — C major: the pattern on white keys

The major scale pattern of whole and half steps is the same as that found on
the white keys from any [[C]] up to the next [[C]]. The numbers with carets
above them (1, 2, …) in the diagram below are the **scale degree numbers** for
the C major scale.

:::callout info
The major scale always follows this pattern: **W – W – H – W – W – W – H**
:::

:::widget keyview {root: "C4", scale: "major", steps: true, labels: "degrees", interactive: true}
:::

The **half steps** (shown in amber) fall between degrees **3 and 4** ([[E]]–[[F]])
and between **7 and 8** ([[B]]–[[C]]). Every other adjacent pair is a whole step.

## Phase 3 — Tetrachords

The major scale splits naturally into two identical four-note groups called
**tetrachords**. Each tetrachord has the same internal pattern: **W – W – H**.

:::widget keyview {root: "C4", scale: "major", steps: true, labels: "both", tetrachords: true, interactive: true}
:::

:::callout key
Both tetrachords end on a half step. The gap between them — from [[F4]] to
[[G4]] — is one whole step. Tetrachords are a fast way to build any major scale:
find the **W–W–H** pattern, jump a whole step, then repeat.
:::

## Phase 4 — G to G on white keys

Try playing seven white keys from [[G4]] to [[G5]] and compare the W/H pattern
to C major:

:::widget keyview {notes: ["G4","A4","B4","C5","D5","E5","F5","G5"], steps: true, labels: "degrees", interactive: true}
:::

:::callout warn
The second tetrachord reads **W – H – W** instead of **W – W – H** — the half
step falls one place too early. The pattern is broken.
:::

## Phase 5 — The fix: sharps and flats

To repair the [[G]] scale we need to **raise [[F]] by one half step** — from the
white key to the black key between [[F]] and [[G]]. That restores the **W–W–H**
shape of the second tetrachord.

The symbol that raises a pitch by a half step is the **sharp** (♯). The modified
note is written **[[F#]]** (F-sharp).

:::callout info
When we **say** a note name with an accidental, the accidental comes **last**:
*F-sharp*, *B-flat*. But when we write it on the **staff**, the accidental symbol
always appears **before** the notehead it modifies.
:::

:::widget keyview {root: "G4", scale: "major", steps: true, labels: "both", tetrachords: true, interactive: true}
:::

Both tetrachords now read **W–W–H**. The only difference from [[C]] major is that
one note — degree 7 — has been raised by a half step.

## Phase 6 — Accidentals

A symbol that raises or lowers a pitch is called an **accidental**. There are
five kinds:

| Symbol | Name | Effect |
|--------|------|--------|
| × | Double sharp | Raises the pitch by a whole step (2 half steps) |
| ♯ | Sharp | Raises the pitch by a half step |
| ♮ | Natural | Cancels a previous sharp or flat |
| ♭ | Flat | Lowers the pitch by a half step |
| 𝄫 | Double flat | Lowers the pitch by a whole step (2 half steps) |

## Phase 7 — Spelling rule: one of each letter

Every major scale uses all seven letter names exactly once — no letter skipped,
none repeated.

This is why [[G]] major uses **[[F#]]**, not **[[Gb]]**. Both are the same key on
the piano (enharmonic equivalents), but [[Gb]] would give two notes named [[G]]
(degrees 1 and 7) and skip [[F]] entirely — violating the one-of-each-letter rule.

:::callout key
**Spelling rule:** in any major or minor scale, each letter name appears exactly
once. If you need to raise the 7th degree of [[G]] major, the note must be spelled
[[F#]] (raising [[F]]), not [[Gb]] (lowering [[G]]). The music looks different on the staff and
the logic of scale degrees breaks down if you substitute enharmonic spellings.
:::

## Phase 8 — [[C]] major on the neck

You now know [[C]] major as a pattern of white keys and the rule **W – W – H – W – W – W – H**.
On the guitar that rule becomes fret distances: a **whole step** is always **two frets**;
a **half step** is always **one fret**.

Below, the keyboard (showing one octave [[C3]]–[[C4]]) and the fretboard are locked together.
Play any note on either instrument — both will respond.

The coloured dots on the neck are the eight [[C]] major scale notes; the number inside each
dot is the scale degree. The lines connecting consecutive degrees are labelled **W** (whole
step, two frets) or **H** (half step, one fret).

:::widget keyview {root: "C3", scale: "major", steps: true, labels: "degrees", fretboard: true, frets: 7}
:::

:::callout key
The path crosses three strings — [[A]], [[D]], and [[G]] — in groups of **2 – 3 – 3** notes.
Each time the path jumps from one string to the next, the fret number drops by three.
That three-fret shift is exactly what a whole step looks like when you move across two
strings that are a perfect fourth (five semitones) apart:
five semitones of string gap minus two semitones of scale step = three frets backward.

The half steps (**[[E]]–[[F]]** at degrees 3–4 and **[[B]]–[[C]]** at degrees 7–8)
are the only adjacent pairs one fret apart — every other pair is two frets.
:::

## Phase 9 — [[G]] major on the neck

[[G]] major has one sharp: [[F#]]. On the keyboard it is the black key between [[F]] and [[G]].
On the guitar it is the note **one fret higher than [[F]] natural** wherever [[F]] appears — fret
position shifts up by one.

The diagram below starts from [[G2]] on the low-[[E2]] string (fret 3) and follows the same
2 – 3 – 3 path across the [[E]], [[A]], and [[D]] strings. Compare the W/H pattern to C major above:
everything is identical **except degree 7**, where the H label has moved one fret higher
because F natural became [[F#]].

:::widget keyview {root: "G2", scale: "major", steps: true, labels: "degrees", fretboard: true, frets: 7}
:::

:::callout info
The shape of a major scale on the guitar is the same in every key — only the **starting
fret** moves. Shift the entire [[C]] major pattern up two frets and you get [[D]] major; up four
frets gives [[E]] major. The W–W–H–W–W–W–H rule (2–2–1–2–2–2–1 frets) never changes.
:::
