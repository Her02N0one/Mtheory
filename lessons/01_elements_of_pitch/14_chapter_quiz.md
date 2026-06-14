---
id: "1.14"
chapter: "Elements of Pitch"
title: "Chapter 1 Assessment"
requires: [chapter1_reviewed]
grants: [chapter1_complete]
estimated_min: 30
---

# Chapter 1 Assessment

This is the comprehensive final assessment for Chapter 1. It tests everything — notation, scales, key signatures, scale degree names, intervals, and most importantly your ability to **play the right note on the guitar when asked**.

You must pass each section to complete the chapter. Take your time.

---

## Part 1 — Staff Reading

Name each note on the treble staff by pressing its key on the keyboard. No labels.

:::read {range: "C4-G5", notes: naturals, count: 12}
:::

:::checkpoint {needs: 10, of: 12, on_pass: {set_flag: part1_pass}}
:::

---

## Part 2 — Scale Degree Names

:::when {flag: part1_pass}

Name the scale degree when prompted. Both major and minor keys tested.

:::widget degquiz {root: "G4", scale: "major", count: 7}
:::

:::widget degquiz {root: "A3", scale: "natural_minor", count: 7}
:::

:::checkpoint {needs: 10, of: 14, on_pass: {set_flag: part2_pass}}
:::

:::

---

## Part 3 — Theory: Intervals & Key Signatures

:::when {flag: part2_pass}

:::widget mcq {question: "How many semitones is a Perfect 5th?", options: ["6", "7", "8"], answer: 1}
:::
:::widget mcq {question: "A Major 3rd inverts to a:", options: ["Minor 6th", "Major 6th", "Minor 3rd"], answer: 0}
:::
:::widget mcq {question: "The tritone spans how many semitones?", options: ["5", "6", "7"], answer: 1}
:::
:::widget mcq {question: "The key of D major has:", options: ["1 sharp", "2 sharps", "3 sharps"], answer: 1}
:::
:::widget mcq {question: "The relative minor of F major is:", options: ["f minor", "d minor", "g minor"], answer: 1}
:::
:::widget mcq {question: "Which interval is the most dissonant?", options: ["Minor 3rd", "Major 7th", "Tritone"], answer: 2}
:::
:::widget mcq {question: "The natural minor scale has ♭3, ♭6, and ♭7. How many semitones does ♭7 sit below the tonic?", options: ["1", "2", "3"], answer: 1}
:::

:::checkpoint {needs: 6, of: 7, on_pass: {set_flag: part3_pass}}
:::

:::

---

## Part 4 — Fretboard: Major Scales

:::when {flag: part3_pass}

Play C major ascending on the A, D, and G strings (frets 0–7). No hints — this is the test.

:::widget scaledrill {root: "C3", scale: "major", pattern: "up", strings: [1, 2, 3], frets: 7, strict: false}
:::

:::checkpoint {needs: 8, of: 8, on_pass: {set_flag: part4a_pass}}
:::

:::

:::when {flag: part4a_pass}

Now G major. Same position — only one note changes.

:::widget scaledrill {root: "G2", scale: "major", pattern: "up", strings: [0, 1, 2], frets: 7, strict: false}
:::

:::checkpoint {needs: 8, of: 8, on_pass: {set_flag: part4_pass}}
:::

:::

---

## Part 5 — Fretboard: Minor Scales

:::when {flag: part4_pass}

A natural minor — the relative of C major. Same notes, different starting point.

:::widget scaledrill {root: "A2", scale: "natural_minor", pattern: "up", strings: [1, 2, 3], frets: 7, strict: false}
:::

:::checkpoint {needs: 8, of: 8, on_pass: {set_flag: part5_pass}}
:::

:::

---

## Part 6 — Fretboard: Pentatonics (Guitar Focus)

:::when {flag: part5_pass}

:::callout key
The pentatonic scales are the guitarist's home. These five notes are played more than any others in rock, blues, and country. Own them.
:::

**C major pentatonic** — ascending and descending. No half steps, no stress.

:::widget scaledrill {root: "C3", scale: "pentatonic_major", pattern: "up_down", strings: [1, 2, 3], frets: 7, strict: false}
:::

:::checkpoint {needs: 10, of: 10, on_pass: {set_flag: part6a_pass}}
:::

:::

:::when {flag: part6a_pass}

**A minor pentatonic** — the blues scale. Same notes as C major pentatonic, starting from A.

:::widget scaledrill {root: "A2", scale: "pentatonic_minor", pattern: "up_down", strings: [1, 2, 3], frets: 7, strict: false}
:::

:::checkpoint {needs: 10, of: 10, on_pass: {set_flag: part6b_pass}}
:::

:::

:::when {flag: part6b_pass}

**High position — E minor pentatonic.** Now shift up the neck to the 12th position area. Same shape, new key.

:::widget scaledrill {root: "E3", scale: "pentatonic_minor", pattern: "up_down", strings: [1, 2, 3], frets: 12, strict: false}
:::

:::checkpoint {needs: 10, of: 10, on_pass: {set_flag: part6_pass}}
:::

:::

---

## Part 7 — Fretboard: Key Signature Identification

:::when {flag: part6_pass}

:::widget keysigquiz {mode: "identify", type: "both", count: 8}
:::

:::checkpoint {needs: 6, of: 8, on_pass: {set_flag: part7_pass}}
:::

:::

---

## Final Result

:::when {flag: part7_pass}

:::callout key
**Chapter 1 complete.** You have demonstrated:
- Reading notes on the treble staff
- Naming all seven scale degrees by function
- Identifying and applying key signatures
- Naming intervals and understanding consonance/dissonance
- Playing major scales, minor scales, and pentatonic scales across multiple positions on the guitar neck

You are ready for Chapter 2.
:::

:::button {label: "Complete Chapter 1 →", action: {complete: true}}
:::

:::
