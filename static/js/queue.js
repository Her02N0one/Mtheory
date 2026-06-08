// queue.js — Phase/segment state and accessors.
// Depends on: PHASES, NOTES, ROOT_NOTE_NAME, STAGE_ID, PROGRESS_KEY (globals)
// Depends on: theory.js

// -- Mutable phase state ------------------------------------------------------
let currentPhase   = 0;
let phaseQueue     = [];  // array of task objects (see theory.js task types)
let queueIdx       = 0;
let totalCorrect   = 0;
let totalWrong     = 0;
let prevMidi       = null;

// Per-question state
let locked         = false;
let waitingCorrect = false;
let listening      = false;
let acceptAfter    = 0;  // timestamp — ignore detections until this time

// Convenience: the task at the current queue position
function currentTask() { return phaseQueue[queueIdx] || null; }

// -- Phase accessors ----------------------------------------------------------
function currentFretMin()  { return PHASES[currentPhase].fret_min != null ? PHASES[currentPhase].fret_min : 0; }
function currentFretMax()  { return PHASES[currentPhase].fret_max; }
function currentPatterns() { return PHASES[currentPhase].patterns || [{ random: 4 }]; }
function currentStringSubset() {
  const ss = PHASES[currentPhase].string_subset;
  return (ss && ss.length) ? ss.join(',') : '';
}

// Guide config for the current phase. Controls which "crutch" hints are shown
// on the fretboard. Defaults to all-on (colour, shape, circle-of-fifths).
// A phase may override via `guides: { color, shape, circle }` in curriculum.py.
function currentGuides() {
  const g = PHASES[currentPhase].guides || {};
  return {
    color:  g.color  !== false,   // false => mono (neutral grey) dots
    shape:  g.shape  !== false,   // false => all dots drawn as circles
    circle: g.circle !== false,   // false => hide the circle-of-fifths sidebar
  };
}

// Build the &mono=&noshape= query fragment for fretboard SVG requests.
function guideQuery() {
  const g = currentGuides();
  let q = '';
  if (!g.color) q += '&mono=true';
  if (!g.shape) q += '&noshape=true';
  return q;
}

// Faint labelled "note map" anchors for the active phase. A phase may set
// `reference: 'naturals'` (the 7 natural notes) to overlay a spacing map that
// helps the learner count and see where notes live. Returns '' when unset.
function referenceQuery() {
  const r = PHASES[currentPhase].reference;
  if (!r) return '';
  let notes = '';
  if (r === 'naturals')         notes = 'C,D,E,F,G,A,B';
  else if (Array.isArray(r))    notes = r.join(',');
  else if (typeof r === 'string') notes = r;
  return notes ? '&ref=' + encodeURIComponent(notes) : '';
}

// -- Segment accessors --------------------------------------------------------
// Segments are now derived directly from task.segmentId — no arithmetic needed.

// Returns { pattern, segStart, segEnd } for any queue index.
function getSegmentInfo(idx) {
  if (!phaseQueue.length || idx >= phaseQueue.length)
    return { pattern: 'random', segStart: idx, segEnd: idx };
  const segId = phaseQueue[idx].segmentId;
  let segStart = idx, segEnd = idx;
  while (segStart > 0 && phaseQueue[segStart - 1].segmentId === segId) segStart--;
  while (segEnd < phaseQueue.length - 1 && phaseQueue[segEnd + 1].segmentId === segId) segEnd++;
  return { pattern: segId, segStart, segEnd };
}

function currentPatternLabel() {
  const task = currentTask();
  if (!task) return '\u007e Free exploration';
  return QS_LABELS[task.segmentId] || '\u007e Free exploration';
}

function getScaleTargets() {
  const { sc } = findScaleAnchor(currentFretMin(), currentFretMax());
  return sc;
}

function phaseRootMidi() {
  const { all } = findScaleAnchor(currentFretMin(), currentFretMax());
  const roots   = all.filter(t => t.name === ROOT_NOTE_NAME);
  for (const r of roots) {
    if (roots.some(x => x.midi === r.midi + 12)) return r.midi;
  }
  return roots.length ? roots[0].midi : null;
}

// -- Progress persistence -----------------------------------------------------
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
  catch { return {}; }
}

function saveStageProgress(stars) {
  const prog = loadProgress();
  const prev = prog[STAGE_ID] || { correct: 0, wrong: 0, best_stars: 0 };
  prog[STAGE_ID] = {
    correct:    prev.correct + totalCorrect,
    wrong:      prev.wrong   + totalWrong,
    best_stars: Math.max(prev.best_stars, stars),
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
}
