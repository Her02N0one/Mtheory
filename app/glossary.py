"""glossary.py — Music theory term definitions for /glossary.

Each entry: {title, short, body (Markdown), related ([term-id, ...])}
Used by /glossary (all terms) and /glossary/{term_id} (single term).
"""

from __future__ import annotations

TERMS: dict[str, dict] = {
    "half-step": {
        "title": "Half Step",
        "short": "The smallest interval in Western music — one adjacent fret on guitar, one adjacent key on piano.",
        "body": """\
A **half step** (also called a *semitone*) is the distance from any note to the very next note above
or below it, with nothing in between.

- **On piano:** adjacent keys, white or black. E→F and B→C are the only white-to-white half steps.
- **On guitar:** moving one fret along the same string.

The major scale contains exactly two half steps: between scale degrees 3 and 4, and between 7 and 8.
These are the "tension points" that give the major scale its characteristic pull toward resolution.
""",
        "related": ["whole-step", "interval", "major-scale"],
    },

    "whole-step": {
        "title": "Whole Step",
        "short": "An interval equal to two half steps — two frets on guitar.",
        "body": """\
A **whole step** (also called a *whole tone* or *major second*) spans exactly two half steps.

- **On guitar:** always two frets on the same string.
- **On piano:** C→D, D→E, F→G, G→A, A→B are whole steps (they skip over the black key between them).

The major scale is defined by its pattern of whole (W) and half (H) steps: **W–W–H–W–W–W–H**.
""",
        "related": ["half-step", "interval", "major-scale"],
    },

    "interval": {
        "title": "Interval",
        "short": "The distance in pitch between two notes, described by quality and number.",
        "body": """\
An **interval** is the distance between two pitches. Intervals have two properties:

- **Number** — count of letter names spanned (2nd, 3rd, 4th, 5th…)
- **Quality** — perfect, major, minor, augmented, or diminished

| Name | Semitones | Example (from C) |
|------|-----------|-----------------|
| Minor 2nd | 1 | C → D♭ |
| Major 2nd (whole step) | 2 | C → D |
| Minor 3rd | 3 | C → E♭ |
| Major 3rd | 4 | C → E |
| Perfect 4th | 5 | C → F |
| Perfect 5th | 7 | C → G |
| Minor 7th | 10 | C → B♭ |
| Major 7th | 11 | C → B |
| Octave | 12 | C → C |

Intervals are the building blocks of scales and chords.
""",
        "related": ["half-step", "whole-step", "octave", "scale-degree"],
    },

    "octave": {
        "title": "Octave",
        "short": "12 semitones — the interval between a note and the same note name at double the frequency.",
        "body": """\
An **octave** spans 12 half steps. The note an octave above any pitch vibrates at exactly **twice the
frequency**: A4 = 440 Hz, A5 = 880 Hz.

Notes an octave apart share the same letter name and sound "the same" to the ear, just higher or lower.
This is why the note system repeats every 12 semitones.

On the guitar, the same pitch appears in multiple positions across the fretboard. Moving 12 frets along
any string always produces the same pitch class one octave higher.
""",
        "related": ["interval", "pitch-class", "half-step"],
    },

    "pitch-class": {
        "title": "Pitch Class",
        "short": "A note name without a specific octave — C3, C4, and C5 all belong to pitch class C.",
        "body": """\
A **pitch class** groups all notes sharing the same letter name and accidental, across every octave.
There are exactly 12 pitch classes in Western music:

**C · C♯/D♭ · D · D♯/E♭ · E · F · F♯/G♭ · G · G♯/A♭ · A · A♯/B♭ · B**

Pitch class is useful when you care about *which note* but not *which register*. On the guitar,
identifying a note's pitch class tells you what to play; the specific octave determines which
string-fret combination to use.

In scale drills, matching by pitch class means any octave of the target note counts — useful for
beginners learning where notes live before worrying about exact register.
""",
        "related": ["octave", "interval", "root"],
    },

    "major-scale": {
        "title": "Major Scale",
        "short": "A seven-note scale following the interval pattern W–W–H–W–W–W–H.",
        "body": """\
The **major scale** is the most fundamental scale in Western tonal music. Starting from any note,
the pattern **Whole – Whole – Half – Whole – Whole – Whole – Half** produces the major scale for
that key.

C major uses only white keys: **C D E F G A B C**

| Degree | Name | Interval from root |
|--------|------|-------------------|
| 1 | Tonic | Unison |
| 2 | Supertonic | Major 2nd |
| 3 | Mediant | Major 3rd |
| 4 | Subdominant | Perfect 4th |
| 5 | Dominant | Perfect 5th |
| 6 | Submediant | Major 6th |
| 7 | Leading tone | Major 7th |

Half steps fall between degrees **3–4** and **7–8**. The major third between degrees 1 and 3
gives the major scale its "bright" or "happy" character.
""",
        "related": ["minor-scale", "pentatonic", "scale-degree", "half-step", "whole-step", "tonic"],
    },

    "minor-scale": {
        "title": "Natural Minor Scale",
        "short": "A seven-note scale following W–H–W–W–H–W–W — darker sound than major.",
        "body": """\
The **natural minor scale** (also called the *Aeolian mode*) uses the pattern:

**Whole – Half – Whole – Whole – Half – Whole – Whole**

A natural minor: **A B C D E F G A** — all white keys, starting on A instead of C.

| Degree | Interval from root |
|--------|-------------------|
| 1 | Unison |
| 2 | Major 2nd |
| ♭3 | Minor 3rd |
| 4 | Perfect 4th |
| 5 | Perfect 5th |
| ♭6 | Minor 6th |
| ♭7 | Minor 7th |

The **minor third** (♭3) is what gives the natural minor its darker, more melancholic character
compared to the major scale. The "natural" qualifier distinguishes it from the harmonic minor
(raised ♭7 → 7) and melodic minor (raised ♭6 and ♭7 when ascending).
""",
        "related": ["major-scale", "relative-minor", "pentatonic", "scale-degree"],
    },

    "pentatonic": {
        "title": "Pentatonic Scale",
        "short": "A five-note scale derived from major or minor by removing the two half-step neighbours.",
        "body": """\
The **pentatonic scale** contains five notes per octave (*penta* = five in Greek). The two most
common forms:

**Major pentatonic** — remove degrees 4 and 7 from the major scale:
C major pentatonic: **C D E G A** (degrees 1 · 2 · 3 · 5 · 6)

**Minor pentatonic** — remove degrees 2 and ♭6 from the natural minor scale:
A minor pentatonic: **A C D E G** (degrees 1 · ♭3 · 4 · 5 · ♭7)

The removed notes were the ones flanking half steps. Removing them means every adjacent pair in
the pentatonic is a whole step or larger — **no adjacent half steps, no dissonant clashes**.
This is why the pentatonic works over almost any chord in a key, and why it dominates rock,
blues, and country improvisation.

The major and minor pentatonic are **relative** to each other: A minor pentatonic uses the same
five notes as C major pentatonic, just starting on a different root.
""",
        "related": ["major-scale", "minor-scale", "scale-degree", "relative-minor", "caged-system"],
    },

    "scale-degree": {
        "title": "Scale Degree",
        "short": "The numbered position of a note within a scale, counting from the root as 1.",
        "body": """\
Every note in a scale is assigned a **scale degree** number. The root is always degree **1**;
subsequent notes are numbered 2, 3, 4, 5, 6, 7 up to the octave (degree 8 = same pitch class as 1).

In the major scale, all degrees are "natural" (no flats or sharps relative to the root).
In minor scales, certain degrees are lowered: written ♭3, ♭6, ♭7.

Scale degrees are the key to understanding transposition: the relationship between degrees is
always the same in every key — only the absolute pitches shift. A "major 3rd" is always 4
semitones above the root, whether you're in C major or F♯ major.

On the fretboard, knowing a note's scale degree immediately tells you its function in the key —
the tonic (1), the "tension" leading tone (7), the strong root-fifth pair (1–5), and so on.
""",
        "related": ["tonic", "interval", "major-scale", "minor-scale"],
    },

    "tonic": {
        "title": "Tonic",
        "short": "The 'home' note of a key — scale degree 1.",
        "body": """\
The **tonic** is scale degree 1 — the note that feels like home or resolution in a given key.
Melodies tend to resolve *to* the tonic; departure from it creates tension that pulls back.

The tonic gives a key its name: in G major, G is the tonic. In A minor, A is the tonic.

On the guitar, locating the tonic is the first step in navigating any key. In the CAGED system,
the **root dots** on the fretboard mark every occurrence of the tonic within a scale box.
Finding the tonic on the lowest string of a shape gives you the shape's anchor point.
""",
        "related": ["root", "scale-degree", "major-scale", "caged-system"],
    },

    "root": {
        "title": "Root",
        "short": "The foundational note of a scale or chord — the note it is named after.",
        "body": """\
The **root** of a scale or chord is the note the scale or chord is built from and named after.
The root of a C major chord is C; the root of an A minor scale is A.

**Root vs. tonic:** *Tonic* specifically means the home pitch of a key (degree 1 of the current
scale). *Root* is the foundational note of a specific chord or scale pattern — which may not
be the tonic. A G chord played in the key of C has root G but tonic C.

On the guitar, the root is the most important landmark for any shape. Once you locate the root
on the fretboard, the geometry of the chord or scale pattern falls into place around it.
""",
        "related": ["tonic", "scale-degree", "caged-system"],
    },

    "relative-minor": {
        "title": "Relative Minor",
        "short": "The minor key that shares all the same notes as a given major key.",
        "body": """\
Every major key has a **relative minor** using exactly the same set of pitches. The relative minor
starts on scale degree 6 of the major scale.

| Major key | Relative minor | Shared notes |
|-----------|----------------|--------------|
| C major | A minor | C D E F G A B |
| G major | E minor | G A B C D E F♯ |
| F major | D minor | F G A B♭ C D E |

C major and A minor use identical pitches — they differ only in *which note acts as the tonic*.
C major emphasises C as home; A minor emphasises A.

On the guitar, this means the **five CAGED box positions are geometrically identical** for a
major key and its relative minor. Only the root dots shift to the new tonic. One set of shapes,
two tonal colours — one of the most efficient uses of fretboard practice time.
""",
        "related": ["minor-scale", "major-scale", "tonic", "caged-system"],
    },

    "caged-system": {
        "title": "CAGED System",
        "short": "Five moveable chord and scale shapes that tile the entire guitar neck without gaps.",
        "body": """\
Every guitarist learns five open-chord shapes: **C, A, G, E, D**. Each shape can be moved up the
neck with a barre — the note names change, but the fingering geometry stays identical.

These five shapes tile the fretboard end-to-end. In any key, all five appear in ascending order
as you climb from nut to body:

**C → A → G → E → D → C → A → …** (cycle repeats an octave higher)

Learning all five boxes gives you **complete coverage of the neck in any key**. Every note you'll
ever play belongs to one of the five shapes you already know.

For scales, each CAGED shape defines a **box position** — a rectangle of frets containing all
scale notes reachable without shifting your hand. The pentatonic scale maps perfectly onto this
system: two notes per string, five shapes, full neck.
""",
        "related": ["chord-shape", "fretboard-position", "root", "relative-minor", "pentatonic"],
    },

    "chord-shape": {
        "title": "Chord Shape",
        "short": "A moveable finger pattern on the fretboard — the same geometry produces different chords at different frets.",
        "body": """\
A **chord shape** is the geometric pattern of fingers on the fretboard that produces a chord.
The same shape produces different chords depending on where it sits on the neck:

- E-shape barre at fret 0 → E chord
- E-shape at fret 3 → G chord
- E-shape at fret 5 → A chord

The CAGED letters (C, A, G, E, D) name the **open-chord voicing each shape resembles** — not
the key being played. An "E-shape G chord" looks like an open E chord moved up 3 frets with
a barre.

This transposability is the core insight of the CAGED system: five shapes become universal
templates once you understand where the root falls in each shape.
""",
        "related": ["caged-system", "root", "fretboard-position"],
    },

    "fretboard-position": {
        "title": "Fretboard Position",
        "short": "A hand location on the neck defined by which fret the index finger covers.",
        "body": """\
A **position** on the guitar neck defines where your fretting hand sits, with each finger
assigned to one fret. In standard one-finger-per-fret position playing:

- Index finger (1) → fret N
- Middle finger (2) → fret N+1
- Ring finger (3) → fret N+2
- Pinky (4) → fret N+3

**Second position** means index on fret 2, pinky on fret 5. **Fifth position** means index
on fret 5, pinky on fret 8.

The CAGED system assigns each of the five scale shapes to a specific position window in a given
key. Knowing your position immediately tells you which four consecutive frets your hand covers,
and therefore which finger plays each note without looking.
""",
        "related": ["caged-system", "scale-degree"],
    },

    "enharmonic": {
        "title": "Enharmonic Equivalents",
        "short": "Two different note names that refer to the same pitch — F♯ and G♭ sound identical.",
        "body": """\
Two notes are **enharmonically equivalent** when they sound the same (share the same frequency)
but are written with different names:

- F♯ = G♭
- C♯ = D♭
- A♯ = B♭
- D♯ = E♭
- G♯ = A♭

On a piano they are the same key. On a guitar they are the same fret.

Despite sounding identical, enharmonic spellings are **not interchangeable** in theory. The
correct spelling depends on the key: G major uses F♯ (not G♭) because every letter name must
appear exactly once in a scale. Using G♭ would skip F entirely and double up on G — violating
the one-of-each-letter rule.
""",
        "related": ["major-scale", "scale-degree"],
    },
}

# Alphabetical sort order for the glossary index
SORTED_KEYS = sorted(TERMS.keys(), key=lambda k: TERMS[k]["title"].lower())
