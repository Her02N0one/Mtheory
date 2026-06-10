"""
modules.py — Module groupings for the /learn curriculum map.

Each module clusters related stages into a themed section.  The `stage_ids`
list controls which stage cards appear under the module heading and in what
order — it must match the IDs defined in stages.py.

To add a new module: append an entry here and assign `"module": "<id>"` to
the relevant stages in stages.py.
"""

MODULES: list[dict] = [
    {
        "id":        "foundations",
        "title":     "Module 0: Foundations",
        "tagline":   "12 notes · the raw alphabet",
        "description": (
            "Before scales, before chords — the 12-note chromatic alphabet that everything "
            "else is spelled from. Walk it one fret at a time up a single string and watch how "
            "each half-step flips the note's shape and leaps across the colour wheel. This is "
            "the bedrock the rest of the curriculum builds on."
        ),
        "stage_ids": ["lesson_1"],
    },
    {
        "id":        "pentatonic",
        "title":     "Module 1: The Pentatonic Engine",
        "tagline":   "5 safe notes · the universal foundation",
        "description": (
            "The pentatonic scale removes the two 'tension' notes — the 4th and the 7th — "
            "from the major scale, leaving 5 pitches that sound consonant over almost any chord. "
            "Nearly every guitarist starts here. Learn to find all five notes anywhere on the neck "
            "across three positional boxes, then connect them into a single continuous map."
        ),
        "stage_ids": ["c_pent", "f_pent", "g_pent"],
    },
    {
        "id":        "major",
        "title":     "Module 2: The Major Ecosystem",
        "tagline":   "7 notes · half-steps · diatonic harmony",
        "description": (
            "Add the two missing notes back in to unlock the full major scale. "
            "The new half-steps — E→F and B→C — create tension and resolution: the engine of "
            "all Western harmony. Once you can navigate the scale, you build its 7 diatonic triads "
            "and begin hearing how they function inside the key."
        ),
        "stage_ids": ["c_major", "f_major", "g_major", "c_major_unitar", "c_diatonic_triads"],
    },
    {
        "id":        "intervals",
        "title":     "Module 3: Interval Mastery",
        "tagline":   "Every distance · every string pair",
        "description": (
            "An interval is the distance between two notes. Knowing every interval shape on every "
            "string pair gives you absolute fretboard fluency — you stop thinking in scale boxes "
            "and start thinking in relationships. "
            "The G–B string pair is a special case: it has a major 3rd gap (4 semitones) "
            "instead of the perfect 4th (5 semitones) found on every other adjacent pair."
        ),
        "stage_ids": ["int_pent", "int_2nds", "int_3rds", "int_4ths",
                      "int_tritone", "int_5ths", "int_6ths", "int_7ths", "int_octave"],
    },
    {
        "id":        "harmony",
        "title":     "Module 4: Harmony & Chords",
        "tagline":   "Triads · suspended shapes · inversions",
        "description": (
            "Chords are stacked intervals. Start with root-position triads (stacked thirds), "
            "then explore suspended shapes that replace the third with a 2nd or 4th, "
            "then inversions that place the 3rd or 5th in the bass. "
            "Same chord tones — entirely different colour and tension."
        ),
        "stage_ids": ["chord_3rds", "chord_sus", "chord_inv", "chord_voice_lead"],
    },
]
