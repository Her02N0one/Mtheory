---
id: "1.1"
chapter: "Elements of Pitch"
title: "Keyboard & Octave Registers"
requires: []
grants: [completed_pitch_basics, fretboard_unlocked]
estimated_min: 10
---

# Pitch: the raw material

Every piece of music is built from **pitch** — how high or low a sound is. A pitch is
just a frequency: a string or a speaker vibrating a certain number of times per
second. Faster vibration sounds *higher*; slower sounds *lower*.

The piano is the clearest map of pitch ever built: **one key = one pitch**, laid out
left (low) to right (high) with no ambiguity. We start here, then carry what you learn
to the guitar.

## Phase 1 — The sandbox

Here is a single octave. Press any key and listen. There are no wrong answers yet —
just notice that moving *right* raises the pitch and moving *left* lowers it.

:::widget keyboard {octaves: 1, startOctave: 4, labels: "naturals"}
:::

The white keys spell the musical alphabet — [[C]] [[D]] [[E]] [[F]] [[G]] [[A]] [[B]] — and then it starts
over. The black keys are the five pitches *between* them. Seven white + five black =
**twelve pitches** in total before the pattern repeats.

## Phase 2 — The loop of twelve

Those twelve pitches are the *entire* Western pitch alphabet. Everything — every
chord, every melody, every key — is built from these twelve and their repeats.

When the pattern repeats, the new [[C]] sounds "the same, but higher." That repeat is an
**octave register**. Same letter, different height. higher octaves are 2X the pitch of the fundemental, lower octaves are 0.5X the pitch of the fundemental. Pitch classes are organized into registers, numbered based on the octave distance relative to [[C0]] ~16.35 Hz. The number tells you which
register you're in: [[C3]] is lower than [[C4]], which is lower than [[C5]].

Here is the keyboard widened to three registers. Find the three [[C]] keys — they're
labelled with their register number.

:::widget keyboard {octaves: 3, startOctave: 3, highlight: "C", labels: "all"}
:::

:::callout key
Play the three [[C]]s **in order, lowest to highest**: first [[C3]], then [[C4]], then
[[C5]]. Listen to how each is "the same note, one register up."
:::

:::listen {waitFor: note_played, where: "note == C3", then: {set_flag: played_c3}, blocking: true}
:::

:::when {flag: played_c3}
[[C3]] — the lowest [[C]] on the guitar. Now play [[C4]] (middle C on a piano).

:::listen {waitFor: note_played, where: "note == C4", then: {set_flag: played_c4}, blocking: true}
:::

:::when {flag: played_c4}
[[C4]], *middle C* — the centre of a standard piano. 
One more: play [[C5]].

:::listen {waitFor: note_played, where: "note == C5", then: {set_flag: played_c5}, blocking: true}
:::

:::when {flag: played_c5}
[[C5]] — same letter, top register. You just walked the octave loop. Every other note
behaves exactly this way: a pitch class that repeats, register after register.
:::
:::
:::

## Phase 3 — The translation

On the piano, **[[C4]] is one key in one place.** The guitar is different: it's a *grid*,
not a line, so the same pitch can live in several places at once. This is the single
biggest mental shift in moving between the two instruments.

Below, the same keyboard now sits above a fretboard. The standard-tuning open strings
are your anchors:

:::callout info
[[E2]] · [[A2]] · [[D3]] · [[G3]] · [[B3]] · [[E4]] — low to high. Middle C ([[C4]]) is *not* an open
string: it's the **B-string / 1st fret**, or equally the **A-string / 3rd fret**.
:::

:::widget companion {instruments: [keyboard, fretboard], highlight: "C4", sync: true, frets: 5}
:::

Find **both** playable [[C4]]s inside the first five frets — the B-string/1st-fret and the
G-string/5th-fret. They are the *same pitch* as the single [[C4]] key above.

:::listen {waitFor: fret_played, where: "string == 3 and fret == 5", then: {set_flag: found_c4_a}}
:::
:::listen {waitFor: fret_played, where: "string == 4 and fret == 1", then: {set_flag: found_c4_b}}
:::

:::when {expr: "flag:found_c4_a and flag:found_c4_b"}
Both at once — one piano key, two fretboard homes. That "many places, one pitch" is
the guitarist's whole spatial puzzle, and it's why we anchor everything to the
keyboard first.
:::

## Phase 4 — The crucible

Aids off. A key lights up on the piano; place that **exact note** on the guitar — the
right pitch in the right register. Each one you find **stays on the neck**, so you're
filling in the bottom two strings one natural at a time, low to high.

:::recall {mode: fill, range: "E2-E3", notes: naturals, strings: [0, 1], frets: 7}
:::

:::checkpoint {needs: 8, of: 8, on_pass: {complete: true}}
:::
