---
id: "1.7"
chapter: "Elements of Pitch"
title: "Scale Degree Names"
requires: [knows_major_key_signatures, knows_minor_key_signatures]
grants: [knows_scale_degree_names]
estimated_min: 20
---

# Scale Degree Names

Every scale degree has a traditional name used across music theory, analysis, and composition.

| Degree | In C major | Name |
| :--- | :--- | :--- |
| 1̂ | C | **Tonic** |
| 2̂ | D | **Supertonic** |
| 3̂ | E | **Mediant** |
| 4̂ | F | **Subdominant** |
| 5̂ | G | **Dominant** |
| 6̂ | A | **Submediant** |
| 7̂ | B | **Leading tone** |

:::widget keyview {root: "C4", scale: "major", steps: false, labels: "degrees", interactive: true}
:::

## Origins

The names reflect each degree's structural role:

- The **Tonic** (1̂) is the home pitch — the center of gravity for the key.
- The **Dominant** (5̂) is the most important pitch after the tonic; it dominates the harmony.
- The **Mediant** (3̂) lies halfway between the tonic and the dominant — it *mediates* between them.
- The **Subdominant** (4̂) is a perfect fifth *below* the tonic (sub = below). It mirrors the dominant's distance above the tonic.
- The **Submediant** (6̂) lies halfway between the subdominant and the tonic — the mediant of the *lower* half of the scale.
- The **Supertonic** (2̂) is one step *above* (super = above) the tonic.

:::callout key
Structural summary: Tonic (1̂) · Dominant (5̂) are the anchors. Mediant (3̂) sits between them. Subdominant (4̂) mirrors the Dominant below. Submediant (6̂) sits between Subdominant and Tonic.
:::

## The 7th degree: two names

The 7th degree has two names depending on how far it lies from the tonic above it:

| Interval to Tonic | Name | Scale |
| :--- | :--- | :--- |
| Half step | **Leading tone** | Major, harmonic minor, melodic minor |
| Whole step | **Subtonic** | Natural minor |

The **leading tone** (e.g. B in C major) creates strong upward pull toward the tonic — its name reflects this melodic tendency. The **subtonic** (e.g. B♭ in c natural minor) sits a whole step below and resolves less urgently.

:::widget keyview {root: "D4", scale: "natural_minor", steps: false, labels: "degrees", altered: [3, 6, 7], interactive: true}
:::

In d natural minor, scale degree 7̂ is C — a whole step below D. This is the **Subtonic**, not the Leading tone.

---

# Checkpoint

:::widget mcq {question: "What is the name of scale degree 3̂?", options: ["Subdominant", "Mediant", "Dominant"], answer: 1}
:::

:::widget mcq {question: "What is the name of scale degree 5̂?", options: ["Mediant", "Dominant", "Subdominant"], answer: 1}
:::

:::widget mcq {question: "What is the name of scale degree 4̂?", options: ["Subdominant", "Submediant", "Supertonic"], answer: 0}
:::

:::widget mcq {question: "The 7th degree is called the Leading tone when it is:", options: ["A whole step below the tonic", "A half step below the tonic", "The same pitch as the tonic"], answer: 1}
:::

:::widget mcq {question: "In d natural minor, scale degree 7̂ (C) is called the:", options: ["Leading tone", "Subtonic", "Submediant"], answer: 1}
:::

:::widget mcq {question: "The Submediant (6̂) lies between:", options: ["Tonic and Dominant", "Subdominant and Tonic", "Dominant and Supertonic"], answer: 1}
:::

---

# Self Test

Press the key for each named scale degree. Score **18 / 27** to complete this lesson.

:::widget checkpoint {needs: 18, of: 27}
:::

### In C major

:::widget degquiz {root: "C4", scale: "major", count: 7}
:::

### In G major

:::widget degquiz {root: "G4", scale: "major", count: 7}
:::

### In d natural minor

:::widget degquiz {root: "D4", scale: "natural_minor", count: 7}
:::
