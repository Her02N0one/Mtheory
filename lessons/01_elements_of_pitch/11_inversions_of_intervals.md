---
id: "1.11"
chapter: "Elements of Pitch"
title: "Inversions of Intervals"
requires: [knows_augmented_diminished]
grants: [knows_interval_inversions]
estimated_min: 12
---

# Inversions of Intervals

When you take the lower note of an interval and move it up an octave — or move the upper note down an octave — the interval **inverts**. Inversion is one of the most useful tools in composition and analysis because it reveals the hidden symmetry inside the octave.

## The inversion rule

Any interval and its inversion always add up to **9**:

| Interval | Semitones | Inversion | Semitones |
| :--- | :--- | :--- | :--- |
| Unison (P1) | 0 | Octave (P8) | 12 |
| Minor 2nd (m2) | 1 | Major 7th (M7) | 11 |
| Major 2nd (M2) | 2 | Minor 7th (m7) | 10 |
| Minor 3rd (m3) | 3 | Major 6th (M6) | 9 |
| Major 3rd (M3) | 4 | Minor 6th (m6) | 8 |
| Perfect 4th (P4) | 5 | Perfect 5th (P5) | 7 |
| Tritone (A4/d5) | 6 | Tritone (d5/A4) | 6 |

**Number rule:** generic numbers add up to 9. A 3rd inverts to a 6th (3 + 6 = 9). A 4th inverts to a 5th (4 + 5 = 9).

**Quality rule:**
- Major ↔ Minor
- Perfect ↔ Perfect
- Augmented ↔ Diminished

:::callout key
To invert any interval mentally: **subtract the number from 9** and **flip major↔minor** (or keep perfect). A Major 6th inverts to a Minor 3rd. A Perfect 4th inverts to a Perfect 5th.
:::

## Why inversions matter on guitar

On the guitar, voicing a chord differently often means inverting intervals. When you play an F chord at the first position vs. a barre chord, you are inverting the intervals between certain notes. The chord has the same name but a different colour because the interval stacking changed.

More practically: if you cannot reach an interval going up, you can always go down by its inversion instead. A Perfect 5th up is the same relationship as a Perfect 4th down.

## The tritone is its own inversion

The tritone (6 semitones) inverts to itself: 6 + 6 = 12. This is why the tritone is special — it is the only interval that is symmetrically placed in the octave and maps onto itself under inversion.

:::widget scaleview {view: "keyboard", root: "C4", scale: "major", steps: true, labels: "degrees", interactive: true}
:::

## Checkpoint

:::widget mcq {question: "What does a Major 3rd invert to?", options: ["Minor 3rd", "Minor 6th", "Major 6th"], answer: 1}
:::

:::widget mcq {question: "What does a Perfect 4th invert to?", options: ["Perfect 4th", "Perfect 5th", "Minor 5th"], answer: 1}
:::

:::widget mcq {question: "The numbers of an interval and its inversion always add up to:", options: ["8", "9", "12"], answer: 1}
:::

:::widget mcq {question: "A Minor 7th inverts to a:", options: ["Major 2nd", "Minor 2nd", "Major 7th"], answer: 0}
:::

:::widget mcq {question: "Which interval inverts to itself?", options: ["Perfect 5th", "Major 3rd", "Tritone"], answer: 2}
:::

:::checkpoint {needs: 5, of: 5, on_pass: {complete: true}}
:::
