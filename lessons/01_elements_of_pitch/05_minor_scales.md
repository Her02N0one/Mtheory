---
id: "1.5"
chapter: "Elements of Pitch"
title: "Minor Scales"
requires: [knows_major_scale]
grants: [knows_minor_scales]
estimated_min: 20
---

# Minor Scales

Musicians recognise three minor scale forms. Each is most easily understood as a **parallel major scale with specific degrees lowered by a half step** — the amber keys below mark exactly what changed.

## The Natural Minor Scale

The natural minor scale lowers the **♭3̂**, **♭6̂**, and **♭7̂** of the major scale.

:::widget keyview {root: "C4", scale: "natural_minor", steps: true, labels: "degrees", altered: [3, 6, 7], interactive: true}
:::

The three amber keys — E♭, A♭, and B♭ — are each one half step lower than in C major. Notice how the half steps shift: they now fall between **2̂–3̂** and **5̂–6̂** instead of 3̂–4̂ and 7̂–8̂.

## The Harmonic Minor Scale

The harmonic minor scale lowers only **♭3̂** and **♭6̂** — the 7̂ stays raised, creating a large **augmented second** (1½ steps) between 6̂ and 7̂.

:::widget keyview {root: "C4", scale: "harmonic_minor", steps: true, labels: "degrees", altered: [3, 6], interactive: true}
:::

That raised 7̂ acts as a **leading tone**, pulling strongly upward to 1̂. This is the minor form most used in chord progressions.

:::callout info
The interval from A♭ to B♮ is an **augmented second** — 1½ steps (3 half steps). It sounds identical to a minor third, but is spelled as a *second* because the scale must use each letter name exactly once: calling it a minor third would require writing C♭ instead of B, putting two notes on the C line. This gap is what gives harmonic minor its characteristic sound.
:::

## The Melodic Minor Scale

Because the augmented second is awkward to sing, composers developed a smoother ascending form. The melodic minor ascending lowers only **♭3̂** — the 6̂ and 7̂ are natural.

:::widget keyview {root: "C4", scale: "melodic_minor", steps: true, labels: "degrees", altered: [3], interactive: true}
:::

The **descending form** is the same as natural minor — the raised 6̂ and 7̂ return to their lowered positions on the way back down.

:::widget keyview {root: "C4", scale: "melodic_minor_desc", steps: true, labels: "degrees", altered: [3, 6, 7], interactive: true}
:::

## Comparison: All Three Forms

Use the tabs below to switch between all four forms of C minor. Amber keys show exactly which degrees differ from the parallel C major.

:::widget minorscaleview {root: "C4", compare: true, interactive: true}
:::

| Form | Altered degrees | Interval pattern |
| :--- | :--- | :--- |
| Natural minor | ♭3̂, ♭6̂, ♭7̂ | W–H–W–W–H–W–W |
| Harmonic minor | ♭3̂, ♭6̂ (7̂ raised) | W–H–W–W–H–A2–H |
| Melodic minor ↑ | ♭3̂ only | W–H–W–W–W–W–H |
| Melodic minor ↓ | ♭3̂, ♭6̂, ♭7̂ (= natural) | W–W–H–W–W–H–W |

*W = whole step, H = half step, A2 = augmented second*

## C Natural Minor on the Guitar

The W–H pattern of a minor scale translates to the neck exactly as it did in C major: whole steps are two frets, half steps are one. The amber keys (♭3̂, ♭6̂, ♭7̂) each sit one fret lower than the corresponding note in C major.

:::widget keyview {root: "C3", scale: "natural_minor", steps: true, labels: "degrees", altered: [3, 6, 7], fretboard: true, frets: 7, interactive: true}
:::

:::callout key
The scale still climbs across three strings in the same general pattern as C major. Only the amber degrees shift by one fret — the fingering shape is nearly identical.
:::

---

# Checkpoint

:::widget mcq {question: "Which scale degrees are lowered in the natural minor scale compared to major?", options: ["♭2̂, ♭5̂, ♭7̂", "♭3̂, ♭6̂, ♭7̂", "♭3̂, ♭4̂, ♭6̂"], answer: 1}
:::

:::widget mcq {question: "The harmonic minor scale is like major with:", options: ["♭3̂ and ♭6̂ only", "♭3̂, ♭6̂, and ♭7̂", "♭3̂ only"], answer: 0}
:::

:::widget mcq {question: "What characteristic interval does harmonic minor contain?", options: ["A diminished third between 2̂ and 3̂", "An augmented second between 6̂ and 7̂", "A tritone between 4̂ and 7̂"], answer: 1}
:::

:::widget mcq {question: "The descending form of the melodic minor scale is identical to:", options: ["Harmonic minor", "Natural minor", "Major"], answer: 1}
:::

---

# Self Test

Score **4 / 4** to complete this lesson.

:::widget checkpoint {needs: 4, of: 4}
:::
