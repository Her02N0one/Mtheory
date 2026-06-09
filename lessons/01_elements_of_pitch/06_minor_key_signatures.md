---
id: "1.6"
chapter: "Elements of Pitch"
title: "Minor Key Signatures"
requires: [knows_minor_scales, knows_major_key_signatures]
grants: [knows_minor_key_signatures]
estimated_min: 20
---

# Minor Key Signatures

A minor key signature always reflects the **natural minor scale** — regardless of which minor form the music actually uses. Any accidentals that differ from the key signature (such as the raised 7̂ in harmonic minor) are written as individual accidentals directly before the notes.

## C minor: finding the key signature

C natural minor uses three accidentals: B♭, E♭, and A♭. Those three flats become the key signature for all music in c minor.

:::widget keyview {root: "C4", scale: "natural_minor", steps: false, labels: "degrees", altered: [3, 6, 7], interactive: true}
:::

:::widget keysigview {count: 3, type: "flats", readonly: true, showHint: true, showRelative: true}
:::

Notice that this three-flat key signature is the **same as E♭ major**. C minor and E♭ major are called **relative keys** — they share the same key signature while having different tonics.

## Relative keys

The relationship between any pair of relatives is fixed:

- The **♭3̂** of any minor key is the **tonic (1̂) of its relative major**
- The **♭6̂** of any major key is the **tonic of its relative minor**

:::callout key
**c minor → E♭ major**: The ♭3̂ of c minor is E♭. E♭ is the tonic of E♭ major. \\
**E♭ major → c minor**: The ♭6̂ of E♭ major is C. C is the tonic of c minor.
:::

Because relatives share a key signature, they share the same pool of accidentals — only the starting note and mode differ.

## Parallel keys

Two keys that share the **same tonic** but *different* key signatures are called **parallel keys**. C major and c minor both start on C but have entirely different key signatures.

| Key | Tonic | Signature |
| :--- | :--- | :--- |
| C major | C | No accidentals |
| c minor | C | 3 flats: B♭, E♭, A♭ |

To find the parallel minor of any major key, lower the 3rd, 6th, and 7th degrees — which adds three flats (or removes three sharps) from the key signature.

## The complete circle of fifths

The circle of fifths displays all 24 major and minor keys. **Major keys** appear on the outer ring; their **relative minors** appear on the inner ring at the same position, sharing the same key signature.

:::widget fifthscircle {interactive: true, showMinor: true}
:::

Click any major key to see its relative minor highlighted, or click any minor key to see its relative major. Every pair at the same position on the circle shares the same accidentals.

:::callout info
The three bottom positions show **enharmonic pairs** — keys that sound identical but are spelled differently. For example, B major (5 sharps) and its relative g♯ minor share the bottom-right position with C♭ major (7 flats) and its relative a♭ minor.
:::

---

# Checkpoint

:::widget mcq {question: "The key signature of c minor uses:", options: ["2 flats: B♭, E♭", "3 flats: B♭, E♭, A♭", "3 sharps: F♯, C♯, G♯"], answer: 1}
:::

:::widget mcq {question: "The relative minor of G major is:", options: ["g minor", "e minor", "b minor"], answer: 1}
:::

:::widget mcq {question: "C major and c minor are called:", options: ["Relative keys", "Parallel keys", "Enharmonic keys"], answer: 1}
:::

:::widget mcq {question: "The relative major of a minor is:", options: ["F major", "C major", "G major"], answer: 1}
:::

---

# Self Test

Score **4 / 4** to complete this lesson.

:::widget checkpoint {needs: 4, of: 4}
:::
