---
id: "smoke.1"
chapter: "Engine Smoke Test"
title: "Keyboard → Flag Loop"
requires: []
grants: [smoke_passed]
---

# Engine smoke test

This lesson exercises the whole loop: a keyboard widget, an event listener, and a
conditionally revealed block.

:::widget keyboard {octaves: 3, startOctave: 3, highlight: "C4", labels: "naturals"}
:::

Press the highlighted **C** ([[C4]], middle [[C]]).

:::listen {waitFor: note_played, where: "note == C4", then: {set_flag: c_pressed}, blocking: true}
:::

:::when {flag: c_pressed}
Nice — that was **[[C4]]**. The event fired, the flag flipped, and this block appeared.
The Content Engine skeleton works end to end.

:::button {label: "Finish →", action: {complete: true}}
:::
:::
