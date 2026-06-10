"""
semesters.py — The 5-semester, 43-lesson high-level syllabus.

This is the spine shown on /learn. It does NOT redefine progress, colour, or
unlock data — those live in stages.py (the source of truth). Each lesson here
references zero or more stage IDs:

  • one+ stage_ids  → a built, playable lesson (links into /learn/<stage_id>)
  • [] (empty)      → a planned lesson, rendered as a locked "Planned" node

To add a new lesson:
  1. Call _lesson(num, title, [stage_ids], summary) and append it to the
     appropriate semester's `lessons` list.
  2. If the lesson references new stages, ensure those stages exist in stages.py.
"""


def _lesson(num: int, title: str, stages: list[str] | None = None,
            summary: str = "") -> dict:
    return {"num": num, "title": title, "stages": stages or [], "summary": summary}


SEMESTERS: list[dict] = [
    {
        "id":       "sem1",
        "num":      1,
        "title":    "The Language & The Major Framework",
        "subtitle": "Notation, the major scale, and how the neck is spelled",
        "lessons": [
            _lesson(1,  "The Musical Alphabet", ["lesson_1"],
                    "The language of music: the 12 chromatic pitches and the idea of "
                    "enharmonics. It's dry, but it's the bridge every later topic is built on "
                    "— you can't learn the language without its alphabet."),
            _lesson(2,  "The Music Staff & Fretboard Mapping", None,
                    "Where those 12 notes physically live — on the staff and on your "
                    "fretboard. Theory stays abstract until you can instantly find it on your "
                    "instrument."),
            _lesson(3,  "The Major Scale", ["c_major", "f_major", "g_major", "c_major_unitar"],
                    "The first immediately-practical topic: roughly 90% of theory either "
                    "derives from or is measured against the major scale. On guitar, one "
                    "movable shape generates all twelve of them."),
            _lesson(4,  "Rhythm Basics", None,
                    "Music is *what* note and *when*. Counting, vocalizing, and syncopation "
                    "— ignore the 'when' and you're missing half of music."),
            _lesson(5,  "Meter & Time Signature", None,
                    "How rhythm is grouped into measures. Understanding meter is what lets you "
                    "write rhythmically varied music instead of something flat and boring."),
            _lesson(6,  "Audiation & Melody", None,
                    "Hearing music in your head and reproducing it with your voice — the "
                    "core human act of composing, whether or not you play an instrument."),
            _lesson(7,  "Key Signatures & Enharmonics", None,
                    "The notation bookkeeping for reading and analyzing scores. Annoying and "
                    "not always musical, but it's how you speak the same language as other "
                    "musicians."),
            _lesson(8,  "Scale Degrees", None,
                    "Stop thinking C–D–E and start thinking 1–2–3. Numbering the scale "
                    "frees you from keys and letters — a huge advantage on a big fretboard, "
                    "and the doorway to intervals."),
            _lesson(9,  "Intervals", ["int_pent", "int_2nds", "int_3rds", "int_4ths",
                                       "int_tritone", "int_5ths", "int_6ths",
                                       "int_7ths", "int_octave"],
                    "The distance between two notes. Learn every interval shape on every string "
                    "pair and you stop thinking in scale boxes and start thinking in pure "
                    "relationships — total fretboard fluency."),
        ],
    },
    {
        "id":       "sem2",
        "num":      2,
        "title":    "Diatonic Harmony & “Safe” Solos",
        "subtitle": "Building chords from the scale and the notes that always work",
        "lessons": [
            _lesson(10, "Basic Triads", ["chord_3rds"],
                    "Chords start here. There are only four triad types, so it's digestible "
                    "— but only if the alphabet, scale, and intervals are already solid."),
            _lesson(11, "Movable Chords", None,
                    "Bar chords: a single triad shape you can slide anywhere to generate every "
                    "chord. Pure leverage — learn the shapes once, play them in any key."),
            _lesson(12, "Diatonic Chords of the Major Scale", ["c_diatonic_triads"],
                    "The pot of gold. The chords that live inside a major scale, plus Roman-"
                    "numeral notation. An astonishing amount of music relies on just this one "
                    "concept."),
            _lesson(13, "Chord Progressions in Major", ["chord_voice_lead"],
                    "Now write with those diatonic chords. It's easy because thousands of songs "
                    "model it — learn them, analyze them, and keep referring back to the "
                    "scale."),
            _lesson(14, "Pentatonic Major", ["c_pent", "f_pent", "g_pent"],
                    "The safe 5-note version of the major scale: it never clashes over a major "
                    "progression. The place to start writing leads — and where most players "
                    "begin, but you'll arrive able to actually apply it."),
            _lesson(15, "Suspended Chords", ["chord_sus"],
                    "Modifying triads (sus2 / sus4) to color and improve your major and minor "
                    "chords. A composer's first real 'how do I make this better?' tool."),
        ],
    },
    {
        "id":       "sem3",
        "num":      3,
        "title":    "The Minor World & Relativity",
        "subtitle": "The other tonality and how it relates to major",
        "lessons": [
            _lesson(16, "The Minor Scale", None,
                    "Major's evil twin: the same machinery, a drastically different mood. It "
                    "has its own diatonic chords, just like major."),
            _lesson(17, "Chord Progressions in Minor", None,
                    "Write in the minor world too. Now you can compose in both tonalities and "
                    "move between their emotional colors."),
            _lesson(18, "Pentatonic Minor", None,
                    "The king of scales — it sounds good over almost anything in minor. Most "
                    "players learn it far too early to use it; by now you can apply it right "
                    "out of the gate."),
            _lesson(19, "Ear Training (Intervals & Chords)", None,
                    "Hear music and know exactly what it is. It feels like magic but it's pure "
                    "skill-building — it turns the sounds you hear into instant musical "
                    "understanding, no perfect pitch required."),
            _lesson(20, "Power Chords", None,
                    "Entire genres are built on nothing else. Apply everything you've learned "
                    "to them — and even non-guitarists should understand why players are so "
                    "obsessed with this sound."),
            _lesson(21, "Relativity & Tonal Center", None,
                    "The confusing-but-crucial duality that major and minor scales are the same "
                    "notes seen from different homes. Grasp this and you unlock modes."),
            _lesson(22, "Combining Pentatonic Shapes", None,
                    "Why the five pentatonic shapes connect into one map across the neck — "
                    "which only makes sense once you understand relativity and tonal center."),
        ],
    },
    {
        "id":       "sem4",
        "num":      4,
        "title":    "Advanced Movement & Tension",
        "subtitle": "Arpeggios, sevenths, blues, and chromatic colour chords",
        "lessons": [
            _lesson(23, "Arpeggios & Chord Tones", None,
                    "Beyond spamming the pentatonic: target the actual chord tones with the "
                    "full scale. Essential for any instrument that plays lead lines."),
            _lesson(24, "Inversions", ["chord_inv"],
                    "Rearranging a chord's notes. Taught too early to most players, who then "
                    "don't know why — with theory behind you, you finally know how to use "
                    "them."),
            _lesson(25, "Slash Chords", None,
                    "A notation for inversions and deliberate bass-note choices. Simple, but "
                    "powerful once the basic triads are second nature."),
            _lesson(26, "Seventh Chords (Maj7, Min7, Dom7)", None,
                    "The three sevenths are everywhere in music. You'll apply them instantly "
                    "because you can already see how they fit into the major and minor scales."),
            _lesson(27, "The Major Blues", None,
                    "A whole genre built on what you already know, and the best precursor to "
                    "jazz. Learn the core concept — not just licks to mimic."),
            _lesson(28, "The Minor Blues", None,
                    "The minor side of the blues: another application of sevenths and "
                    "pentatonics, and another stepping stone toward jazz."),
            _lesson(29, "Secondary Dominants", None,
                    "Your first chords from *outside* the key. Up to now you've used seven "
                    "notes — these add pull and color beyond them."),
            _lesson(30, "Diminished Chords", None,
                    "The big, bad chord. Not diatonic to major or minor, but everywhere in "
                    "interesting music — full and half-diminished. Get the basics down first."),
            _lesson(31, "Augmented Chords", None,
                    "Rare, weird, specialized colors. Tricky to use, but distinctive — and "
                    "far easier to understand now that you're advanced."),
        ],
    },
    {
        "id":       "sem5",
        "num":      5,
        "title":    "Chromaticism, Modes & Songwriting",
        "subtitle": "Beyond the key — modes, modulation, and arrangement",
        "lessons": [
            _lesson(32, "The Harmonic Minor Scale", None,
                    "An exotic, dramatic tonality that doesn't sound Western at all. Inside it "
                    "you'll find the diminished and augmented chords you just learned."),
            _lesson(33, "Writing a Melody", None,
                    "Back to a basic topic with new eyes: the tips, trends, and 'secret sauce' "
                    "behind melodies that actually work."),
            _lesson(34, "Passing Tones & Chromaticism", None,
                    "Escaping the seven-note prison: notes outside the scale that bridge the "
                    "gaps between scale tones. The chromatic alphabet returns — now used "
                    "musically."),
            _lesson(35, "The Bebop Scales", None,
                    "Major scales and modes with one added note — eight notes total, with "
                    "chromaticism baked right in."),
            _lesson(36, "The Modes of Major", None,
                    "Each mode is its own world: Mixolydian (classic rock), Lydian (prog / "
                    "ambient), Phrygian (metal / eastern). Easy to digest once major and minor "
                    "are solid."),
            _lesson(37, "Modulation & Transposition", None,
                    "Changing keys on purpose. Not just *how* to modulate, but *why* composers "
                    "do it and which keys they tend to move to."),
            _lesson(38, "Modal Interchange", None,
                    "Borrowing chords from a parallel key (modal mixture). A single tool that "
                    "ties together nearly everything you've learned."),
            _lesson(39, "Modern Song Sections", None,
                    "Verses, pre-choruses, bridges, post-choruses — the functional parts of "
                    "contemporary songs, not the rondo and sonata forms from school."),
            _lesson(40, "Song Structures", None,
                    "Assembling those sections into whole songs. The cookie-cutter forms, and "
                    "how small changes make them feel fresh instead of generic."),
            _lesson(41, "Writing Drum Parts", None,
                    "Groove and energy live in the rhythm section. Even guitarists need this "
                    "language — it's what keeps a song from falling flat."),
            _lesson(42, "Writing Bass Parts", None,
                    "The bass shares four strings with the guitar but follows very different "
                    "rules. Its own approach to writing a line."),
            _lesson(43, "Timbre & Production", None,
                    "How and why a note sounds the way it does — the abstract edge of theory "
                    "that leads into production and EQ."),
        ],
    },
]
