---
id: "1.4"
chapter: "Elements of Pitch"
title: "The Major Key Signatures"
requires: [reads_treble_staff, knows_major_scale]
grants: [knows_key_signatures]
estimated_min: 20
---

# The major key signatures

One way to learn the major scales is by means of the pattern of whole and half steps discussed in the previous section. Another is by memorizing the key signatures associated with the various scales. 

The term **key** is used in music to identify the first degree of a scale. For instance, the key of G major refers to the major scale that begins on [[G]]. A **key signature** is a pattern of sharps or flats that appears at the beginning of a staff and indicates that certain notes are to be consistently raised or lowered. 

## The Sharp Keys

There are seven key signatures using sharps. In each case, the name of the major key can be found by going **up a half step from the last sharp**.

Drag the slider to add sharps one at a time and watch the key change:

:::widget keysigview {type: "sharps", count: 0}
:::

| Number of Sharps | Sharps Included | Name of Major Key |
| :---: | :--- | :--- |
| 1 | F# | **G major** |
| 2 | F#, C# | **D major** |
| 3 | F#, C#, G# | **A major** |
| 4 | F#, C#, G#, D# | **E major** |
| 5 | F#, C#, G#, D#, A# | **B major** |
| 6 | F#, C#, G#, D#, A#, E# | **F# major** |
| 7 | F#, C#, G#, D#, A#, E#, B# | **C# major** |

:::callout info
Notice that the pattern of placing the sharps on the staff changes at the fifth sharp ([[A#]]) for both the treble and the bass clefs to avoid stacking too far above the staff lines.
:::

## The Flat Keys

Similarly, there are seven key signatures using flats. For flat key signatures (except F major), the name of the major key is simply the **second-to-last flat** in the signature itself.

The highlighted accidental shows exactly which flat names the key:

:::widget keysigview {type: "flats", count: 0}
:::

| Number of Flats | Flats Included | Name of Major Key |
| :---: | :--- | :--- |
| 1 | Bb | **F major** |
| 2 | Bb, Eb | **Bb major** |
| 3 | Bb, Eb, Ab | **Eb major** |
| 4 | Bb, Eb, Ab, Db | **Ab major** |
| 5 | Bb, Eb, Ab, Db, Gb | **Db major** |
| 6 | Bb, Eb, Ab, Db, Gb, Cb | **Gb major** |
| 7 | Bb, Eb, Ab, Db, Gb, Cb, Fb | **Cb major** |

## Enharmonic Keys

You may have noticed that there are three pairs of major keys that would sound exactly the same — that is, they would be played on the very same keys of the piano keyboard or guitar fretboard:

* **B major** = **Cb major** (5 sharps / 7 flats)
* **F# major** = **Gb major** (6 sharps / 6 flats)
* **C# major** = **Db major** (7 sharps / 5 flats)

Notes that are spelled differently but sound the same are said to be **enharmonic**; so B major and Cb major, for example, are enharmonic keys. If two major keys are not enharmonic, then they are transpositions of each other. To **transpose** means to write or play music in some key other than the original.

## Order of Accidentals

The key signatures in the previous two examples should be memorized — not only the number of accidentals involved, but also their order and placement on the staff. 

Try saying out loud the order of accidentals for sharps and flats until you feel confident with them:

* **Sharps:** F – C – G – D – A – E – B
* **Flats:** B – E – A – D – G – C – F

:::callout key
Notice they are both the exact same string of letters, just reversed!
:::

## The Circle of Fifths

Some people find it easier to memorize key signatures if they visualize a **circle of fifths**, which is a diagram somewhat like the face of a clock. 

Reading clockwise around the circle of fifths, you will see that each new key begins on **5** (the fifth scale degree) of the previous key — C→G→D→A→E→B going right (adding sharps), and C→F→Bb→Eb→Ab→Db going left (adding flats). The three keys at the bottom are the **enharmonic pairs** — keys that sound identical but are spelled differently. Click any key to see its exact accidentals.

:::widget fifthscircle {interactive: true}
:::

---

# Checkpoint

Test your understanding before the self-test.

:::widget mcq {question: "Does G3 lie below or above middle C (C4)?", options: ["Below middle C", "Above middle C", "G3 and C4 are the same pitch"], answer: 0}
:::

:::widget mcq {question: "How is a double sharp notated?", options: ["Two sharp signs side by side (♯♯)", "The letter 'x'", "A sharp sign with a diagonal cross"], answer: 1}
:::

:::widget mcq {question: "Half steps in a major scale occur between which scale degrees?", options: ["2 & 3, and 6 & 7", "3 & 4, and 7 & 8 (octave)", "1 & 2, and 4 & 5"], answer: 1}
:::

:::widget mcq {question: "The major scale consists of two identical four-note patterns called:", options: ["Pentachords", "Tetrachords", "Hemichords"], answer: 1}
:::

---

# Self Test

Score **8 / 10** or higher to complete this lesson.

:::widget checkpoint {needs: 8, of: 10}
:::

### A. Identify the Key Signature

Look at each key signature on the staff and press the correct root key on the keyboard to name the key.

:::widget keysigquiz {mode: "identify", type: "both", count: 5}
:::

### B. Name the Key from Accidentals

Read the number of accidentals described and press the correct root key on the keyboard.

:::widget keysigquiz {mode: "text", type: "both", count: 5}
:::