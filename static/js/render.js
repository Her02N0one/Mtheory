// render.js — All DOM/SVG rendering. No music logic, no state mutations.
// Depends on: NOTE_SYSTEM, NOTES, PHASES, ROOT_NOTE_NAME, GHOST_CSV (globals)
// Depends on: theory.js, queue.js

// -- Interval quality color class -------------------------------------------
// Returns a CSS class name based on the interval quality.
// Used to color the interval label in the note card and queue strip.
function _intervalQualityClass(semis) {
  if (semis === 6)                      return 'iq-tritone';
  if ([0, 5, 7, 12].includes(semis))   return 'iq-perfect';
  if ([2, 4, 9, 11].includes(semis))   return 'iq-major';
  return 'iq-minor'; // 1, 3, 8, 10
}

// -- Phase banner + pip render ------------------------------------------------
function renderPhaseUI() {
  const ph = PHASES[currentPhase];
  const challengeBadge = ph.is_challenge
    ? ' <span class="phase-challenge-badge">⚡ Challenge</span>' : '';
  document.getElementById('phase-label').innerHTML =
    'Phase ' + (currentPhase + 1) + ' of ' + PHASES.length + ' \u2014 ' + ph.label + challengeBadge;
  const descEl = document.getElementById('phase-desc');
  if (descEl) descEl.textContent = ph.desc || '';

  document.getElementById('phase-pattern-label').textContent = currentPatternLabel();

  const patterns = currentPatterns();
  const jumpEl   = document.getElementById('seg-jump-btns');
  if (jumpEl) {
    const task    = currentTask();
    const curSeg  = task ? task.segmentId : '';
    const seenSegs = new Set();
    jumpEl.innerHTML = patterns.map(function(p) {
      const name = typeof p === 'string' ? p : (p.type || (p.random != null ? 'random' : null));
      if (!name || seenSegs.has(name)) return '';
      seenSegs.add(name);
      const label  = QS_LABELS[name] || '~';
      const active = name === curSeg ? ' seg-jump-active' : '';
      return '<button class="seg-jump' + active + '" onclick="jumpToSegment(\'' + name + '\')">' + label + '</button>';
    }).filter(Boolean).join('');
  }

  const pips = document.getElementById('phase-pips');
  pips.innerHTML = PHASES.map((_, i) =>
    '<span class="phase-pip ' + (i < currentPhase ? 'done' : i === currentPhase ? 'active' : '') + '"></span>'
  ).join('');

  applyGuides();
}

// Show/hide the crutch hints (currently the circle-of-fifths sidebar) for the
// active phase. Colour/shape guides are handled per-request via guideQuery().
function applyGuides() {
  const sidebar = document.querySelector('.fret-sidebar');
  if (sidebar) sidebar.style.display = currentGuides().circle ? '' : 'none';
}

// -- Score display ------------------------------------------------------------
function updateProgress() {
  const phasePct = phaseQueue.length
    ? Math.min(100, Math.round((queueIdx / phaseQueue.length) * 100))
    : 0;
  document.getElementById('prog-fill').style.width = phasePct + '%';
  document.getElementById('prog-label').textContent =
    queueIdx + ' / ' + phaseQueue.length + ' this phase';
  document.getElementById('hdr-correct').textContent = totalCorrect;
  if (totalWrong > 0)
    document.getElementById('wrong-label').textContent = '\u2717 ' + totalWrong + ' wrong';
}

// -- Hint text ----------------------------------------------------------------
function updateHint() {
  const task = currentTask();
  if (!task) return;
  const fMin = currentFretMin(), fMax = currentFretMax();
  const rangeLabel = fMax >= 15 ? 'anywhere on the neck'
    : fMin > 0 ? 'frets ' + fMin + '\u2013' + fMax
    : 'open position (frets 0\u2013' + fMax + ')';

  let hint;
  if (task.kind === 'interval') {
    const baseNote = task.lo.name + task.lo.octave;
    hint = task.label + ' above ' + baseNote + ' \u00b7 ' + rangeLabel + ' \u2193';
  } else if (task.kind === 'chord' && task.style === 'chord_shape' && task.chordName) {
    const n = task.currentNote;
    var _cPCs2  = task.chordPCs || [];
    var _v2     = task.voicing  || [];
    var _loM2   = _v2.length ? Math.min.apply(null, _v2.map(function(x){return x.note.midi;})) : 0;
    var _bassV2 = _v2.filter(function(x){return x.note.midi === _loM2;})[0];
    var _hintName = (_bassV2 && _cPCs2.length && _bassV2.pc !== _cPCs2[0])
      ? task.chordName + '/' + _bassV2.note.name
      : task.chordName;
    hint = _hintName + ' \u00b7 play ' + n.name + n.octave + ' \u2193';
  } else {
    const n = task.currentNote;
    hint = 'Find ' + n.name + n.octave + ' \u00b7 ' + rangeLabel + ' \u2193';
  }
  document.getElementById('snc-hint').textContent = hint;
}

// -- Recall (button) task render ---------------------------------------------
// Lesson 1.1 knowledge checkpoints. Replaces the mic note card with a prompt,
// an optional colour/shape swatch, and a row of multiple-choice buttons.
function renderRecall(task) {
  if (!task) return;
  let swatch = '';
  if (task.swatchName && NOTE_SYSTEM[task.swatchName]) {
    const info = NOTE_SYSTEM[task.swatchName];
    swatch = '<div class="recall-swatch ' + info.shape + '" style="background:' + info.color + '"></div>';
  }
  const buttons = task.choices.map(function(c) {
    return '<button class="recall-btn" onclick="answerRecall(this, \'' +
      c.replace(/'/g, "\\'") + '\')">' + c + '</button>';
  }).join('');
  document.getElementById('snc-target').innerHTML =
    '<div class="recall-card">' + swatch +
    '<div class="recall-prompt">' + task.prompt + '</div>' +
    '<div class="recall-choices">' + buttons + '</div></div>';

  const hearBtn = document.getElementById('hear-btn');
  if (hearBtn) hearBtn.style.display = 'none';
  ['theory-degree', 'theory-motion', 'theory-desc'].forEach(function(id) {
    const e = document.getElementById(id); if (e) e.innerHTML = '';
  });
  document.getElementById('snc-feedback').textContent = '';
  document.getElementById('snc-feedback').className = 'snc-feedback';
  document.getElementById('snc-hint').textContent = 'Tap your answer \u2014 no mic needed';
}

// Render the fretboard for a name_fret recall task: a single mystery "?" marker
// at the quizzed position, on the string being tested, with no scale highlighting.
async function showRecallFretboard(task) {
  if (!task || task.mode !== 'name_fret') return;
  const fMin = currentFretMin(), fMax = currentFretMax();
  // Render the phase's full string subset (if it spans several strings) so the
  // quizzed fret is seen in the context of the neck; fall back to just the
  // tested string. The quiz marker always sits on task.si.
  const subset = PHASES[currentPhase].string_subset;
  const strings = (subset && subset.length) ? subset.join(',') : String(task.si);
  const url = '/api/fretboard/svg?num_frets=15&fret_min=' + fMin + '&fret_max=' + fMax
            + '&strings=' + encodeURIComponent(strings)
            + '&quiz=' + encodeURIComponent(task.si + ':' + task.fret)
            + guideQuery() + referenceQuery();
  try {
    const res  = await fetch(url);
    const data = await res.json();
    document.getElementById('fretboard-container').innerHTML = data.svg;
  } catch (e) { console.error(e); }
}

// -- Queue strip --------------------------------------------------------------
function renderQueueStrip() {
  const el = document.getElementById('queue-strip');
  if (!el) return;
  const task = currentTask();
  if (!task) { el.innerHTML = ''; return; }

  if (task.kind === 'recall') { el.innerHTML = ''; return; }
  if (task.kind === 'interval') _renderIntervalStrip(el, task);
  else if (task.kind === 'chord') _renderChordStrip(el, task);
  else _renderNoteStrip(el, task);
}

function _noteChip(t, cls) {
  const info = NOTE_SYSTEM[t.name] || { color: '#888' };
  const shape = info.shape === 'circle' ? ' qs-circle' : '';
  return '<div class="qs-note' + shape + ' ' + cls + '" style="--nc:' + info.color + '">' +
    '<span class="qs-label">' + t.name + '<sup>' + t.octave + '</sup></span>' +
    '</div>';
}

function _nextSegHint() {
  const seg     = getSegmentInfo(queueIdx);
  const nextIdx = seg.segEnd + 1;
  if (nextIdx >= phaseQueue.length) return '';
  const nextSeg  = getSegmentInfo(nextIdx);
  const nextSize = nextSeg.segEnd - nextSeg.segStart + 1;
  return '<div class="qs-next-seg">next: ' + (QS_LABELS[nextSeg.pattern] || nextSeg.pattern) +
    '<span class="qs-seg-pos">\u00a0' + nextSize + '</span></div>';
}

function _renderIntervalStrip(el, task) {
  const parts = [];
  // Header: interval name + string pair (if string_interval) + pair/rep counters
  const strPairTag = task.stringPairLabel ? '\u00a0\u00b7\u00a0' + task.stringPairLabel : '';
  const repTag = task.totalReps > 1 ? '\u00a0\u00b7\u00a0\u00d7' + (task.repIdx + 1) : '';
  parts.push(
    '<div class="qs-seg-label">' + task.label + strPairTag +
    '<span class="qs-seg-pos">\u00a0pair\u00a0' + (task.pairIdx + 1) + '\u00a0/\u00a0' + task.totalPairs +
    repTag + '</span></div>'
  );
  // Two note chips
  parts.push(_noteChip(task.lo,  task.stepIdx === 0 ? 'qs-cur' : 'qs-past'));
  parts.push(_noteChip(task.hi,  task.stepIdx === 1 ? 'qs-cur' : 'qs-upcoming'));

  // Next pair hint (skip to the next unique pair, past all reps of the current one)
  const nextUniquePairStart = queueIdx
    + (task.totalReps - task.repIdx) * 2   // remaining reps of this pair
    - task.stepIdx;                         // offset for current step within pair
  if (nextUniquePairStart < phaseQueue.length) {
    const nt = phaseQueue[nextUniquePairStart];
    if (nt && nt.kind === 'interval') {
      parts.push('<div class="qs-next-seg">next: ' + nt.label +
        ' <span class="qs-seg-pos">' + nt.lo.name + nt.lo.octave + '\u2192' + nt.hi.name + nt.hi.octave + '</span></div>');
    } else if (nt) {
      parts.push(_nextSegHint());
    }
  } else {
    parts.push(_nextSegHint());
  }
  el.innerHTML = parts.join('');
}

function _renderChordStrip(el, task) {
  const parts = [];
  // Slash name: same logic as updateHint — show 'Cmaj/E' when bass ≠ root
  var _cPCs  = task.chordPCs || [];
  var _v     = task.voicing  || [];
  var _loM   = _v.length ? Math.min.apply(null, _v.map(function(x){return x.note.midi;})) : 0;
  var _bassV = _v.filter(function(x){return x.note.midi===_loM;})[0];
  var _slashName = (_bassV && _cPCs.length && _bassV.pc !== _cPCs[0])
    ? task.chordName + '/' + _bassV.note.name
    : (task.chordName || task.notes[0].name + (task.quality ? task.quality.symbol : ''));
  parts.push(
    '<div class="qs-seg-label">' + _slashName +
    '<span class="qs-seg-pos">\u00a0' + (task.chordIdx + 1) + '\u00a0/\u00a0' + task.totalChords + '</span>' +
    '</div>'
  );
  task.notes.forEach(function(n, i) {
    const cls = i < task.stepIdx ? 'qs-past' : i === task.stepIdx ? 'qs-cur' : 'qs-upcoming';
    parts.push(_noteChip(n, cls));
  });
  // Next chord hint — use voicing length (not hardcoded 3) so 4-note chords work correctly
  var _noteCount = (_v.length || task.notes.length);
  var nextChordStart = queueIdx + (_noteCount - task.stepIdx);
  if (nextChordStart < phaseQueue.length) {
    var nt = phaseQueue[nextChordStart];
    if (nt && nt.kind === 'chord') {
      var _ntPCs  = nt.chordPCs || [];
      var _ntV    = nt.voicing  || [];
      var _ntLo   = _ntV.length ? Math.min.apply(null, _ntV.map(function(x){return x.note.midi;})) : 0;
      var _ntBass = _ntV.filter(function(x){return x.note.midi===_ntLo;})[0];
      var _ntName = (_ntBass && _ntPCs.length && _ntBass.pc !== _ntPCs[0])
        ? nt.chordName + '/' + _ntBass.note.name
        : (nt.chordName || nt.notes[0].name + (nt.quality ? nt.quality.symbol : ''));
      parts.push('<div class="qs-next-seg">next: ' + _ntName + '</div>');
    } else if (nt) {
      parts.push(_nextSegHint());
    }
  }
  el.innerHTML = parts.join('');
}

function _renderNoteStrip(el, task) {
  const seg  = getSegmentInfo(queueIdx);
  const pos  = queueIdx - seg.segStart + 1;
  const size = seg.segEnd - seg.segStart + 1;
  const parts = [
    '<div class="qs-seg-label">' + (QS_LABELS[seg.pattern] || seg.pattern) +
    '<span class="qs-seg-pos">\u00a0' + pos + '\u00a0/\u00a0' + size + '</span>' +
    '</div>'
  ];
  for (let i = seg.segStart; i <= seg.segEnd && i < phaseQueue.length; i++) {
    const t   = phaseQueue[i];
    const cls = i < queueIdx ? 'qs-past' : i === queueIdx ? 'qs-cur' : 'qs-upcoming';
    parts.push(_noteChip(t.currentNote, cls));
  }
  parts.push(_nextSegHint());
  el.innerHTML = parts.join('');
}

// -- Chromatic circle ---------------------------------------------------------

function _rotateOffset(order) {
  const idx = order.indexOf(ROOT_NOTE_NAME);
  return idx >= 0 ? idx : 0;
}

function _drawCircle(el, order, offset, highlightA, highlightB) {
  const cx = 100, cy = 100, R = 84, nr = 14;
  const n  = order.length;
  const parts = [];

  function dotSVG(x, y, r, color, opacity, isSquare) {
    if (isSquare) return '<rect x="' + (x-r).toFixed(1) + '" y="' + (y-r).toFixed(1) + '"' +
      ' width="' + (r*2).toFixed(1) + '" height="' + (r*2).toFixed(1) + '" rx="3"' +
      ' fill="' + color + '" fill-opacity="' + opacity + '"/>';
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"' +
      ' fill="' + color + '" fill-opacity="' + opacity + '"/>';
  }
  function glowSVG(x, y, r, color, isSquare) {
    if (isSquare) return '<rect x="' + (x-r).toFixed(1) + '" y="' + (y-r).toFixed(1) + '"' +
      ' width="' + (r*2).toFixed(1) + '" height="' + (r*2).toFixed(1) + '" rx="4"' +
      ' fill="' + color + '" fill-opacity="0.18" stroke="' + color + '" stroke-width="1.5"/>';
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"' +
      ' fill="' + color + '" fill-opacity="0.18" stroke="' + color + '" stroke-width="1.5"/>';
  }
  function emptyDotSVG(x, y, r, isSquare) {
    if (isSquare) return '<rect x="' + (x-r).toFixed(1) + '" y="' + (y-r).toFixed(1) + '"' +
      ' width="' + (r*2).toFixed(1) + '" height="' + (r*2).toFixed(1) + '" rx="3"' +
      ' fill="#0d0d1a" stroke="#252540" stroke-width="1.5"/>';
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"' +
      ' fill="#0d0d1a" stroke="#252540" stroke-width="1.5"/>';
  }

  const idxA = highlightA ? order.indexOf(highlightA.name) : -1;
  const idxB = highlightB ? order.indexOf(highlightB.name) : -1;

  if (idxA >= 0 && idxB >= 0) {
    const aA = ((idxA - offset + n) % n / n) * Math.PI * 2 - Math.PI / 2;
    const aB = ((idxB - offset + n) % n / n) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + R*Math.cos(aA), y1 = cy + R*Math.sin(aA);
    const x2 = cx + R*Math.cos(aB), y2 = cy + R*Math.sin(aB);
    const midX = (x1+x2)/2, midY = (y1+y2)/2;
    const labelX = midX + (cx-midX)*0.18, labelY = midY + (cy-midY)*0.18;
    const semis = ((idxB - idxA) + n) % n;
    parts.push('<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="rgba(255,255,255,0.30)" stroke-width="2" stroke-linecap="round"/>');
    parts.push('<text x="' + labelX.toFixed(1) + '" y="' + (labelY+4).toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="700" font-family="system-ui,sans-serif" fill="rgba(255,255,255,0.65)">' + semis + '</text>');
  } else if (!highlightB) {
    const scaleXY = [];
    for (let i = 0; i < n; i++) {
      if (NOTES.includes(order[i])) {
        const a = ((i - offset + n) % n / n) * Math.PI * 2 - Math.PI / 2;
        scaleXY.push([cx + R*Math.cos(a), cy + R*Math.sin(a)]);
      }
    }
    if (scaleXY.length > 2) {
      const pts = scaleXY.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      parts.push('<polygon points="' + pts + '" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" stroke-width="1.5" stroke-dasharray="3,2"/>');
    }
  }

  for (let i = 0; i < n; i++) {
    const note    = order[i];
    const angle   = ((i - offset + n) % n / n) * Math.PI * 2 - Math.PI / 2;
    const x       = cx + R * Math.cos(angle);
    const y       = cy + R * Math.sin(angle);
    const inScale = NOTES.includes(note);
    const isA     = highlightA && note === highlightA.name;
    const isB     = highlightB && note === highlightB.name;
    const isCur   = isA || isB;
    const info    = NOTE_SYSTEM[note] || { color: '#333', shape: 'circle' };
    const isSquare = info.shape === 'square';
    const dotR    = isCur ? nr + 2 : nr;
    if (isCur)              parts.push(glowSVG(x, y, dotR + 5, info.color, isSquare));
    if (inScale || isCur)   parts.push(dotSVG(x, y, dotR, info.color, isCur ? 1 : 0.5, isSquare));
    else                    parts.push(emptyDotSVG(x, y, nr, isSquare));
    const fc = (inScale || isCur) ? '#fff' : '#444';
    const fw = isCur ? '800' : (inScale ? '600' : '400');
    const fs = note.length > 2 ? '8' : '10';
    parts.push('<text x="' + x.toFixed(1) + '" y="' + (y+3.8).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '" font-weight="' + fw + '" font-family="system-ui,sans-serif" fill="' + fc + '">' + note + '</text>');
  }
  el.innerHTML = parts.join('');
}

function renderChromaticCircle(loNote, hiNote) {
  const cofEl     = document.getElementById('chrom-circle');
  const clockEl   = document.getElementById('chrom-clock');
  const clockWrap = document.getElementById('clock-wrap');
  if (!cofEl) return;
  const intervalMode = !!(loNote && hiNote);
  _drawCircle(cofEl, COF_ORDER, _rotateOffset(COF_ORDER), loNote, null);
  if (intervalMode && clockEl) {
    clockWrap.style.display = '';
    _drawCircle(clockEl, CHROM_ORDER, _rotateOffset(CHROM_ORDER), loNote, hiNote);
  } else if (clockEl) {
    clockWrap.style.display = 'none';
  }
}

// -- Mini fretboard shape diagram ---------------------------------------------
function buildShapeDiagram(semis, lo, hi, fMin, fMax, stringSubset) {
  const SHORT   = ['E', 'A', 'D', 'G', 'B', 'e'];
  const STR_TH  = [2.6, 2.1, 1.7, 1.4, 1.1, 0.9];
  const loInfo  = NOTE_SYSTEM[lo.name] || { color: '#888' };
  const hiInfo  = NOTE_SYSTEM[hi.name] || { color: '#888' };
  const MIDI    = STANDARD_TUNING_MIDI;
  const MAX_STRETCH = 5;
  const MAX_FRET    = 22;

  // Thumbnail geometry — matches chord-thumb height so the two panels look identical
  // PX=18 gives fret labels (text-anchor="end" at xLo-DR-2) 12px of clearance for 2-digit numbers
  const TC = { FH:10, SW:22, PX:18, DR:4, NUT_Y:18, OPEN_Y:12, LBL_Y:8, NUM_FRETS:5, PB:2 };
  const SS_W = 36;   // same-string block width (xStr=18 = TC.PX, matches left margin)
  const TH   = TC.NUT_Y + TC.NUM_FRETS * TC.FH + TC.PB;

  // ── Cross-string placements ───────────────────────────────────────────────
  const placements = [];
  for (let pLo = 0; pLo <= 5; pLo++) {
    for (let gap = 1; gap <= 3; gap++) {
      const pHi = pLo + gap;
      if (pHi > 5) continue;
      const skippedCount = gap - 1;
      const exactLo = lo.midi - MIDI[pLo];
      const exactHi = hi.midi - MIDI[pHi];
      const modLo   = ((lo.midi % 12) - (MIDI[pLo] % 12) + 12) % 12;
      const modHi   = ((hi.midi % 12) - (MIDI[pHi] % 12) + 12) % 12;
      let dLo = exactLo >= 0 ? exactLo : modLo;
      let dHi = exactHi >= 0 ? exactHi : modHi;
      let loRaised = false;
      if (exactHi < 0) {
        const rendered = (MIDI[pHi] + dHi) - (MIDI[pLo] + dLo);
        if (rendered !== semis) {
          const alt = dLo + 12;
          if (alt <= MAX_FRET && (MIDI[pHi] + dHi) - (MIDI[pLo] + alt) === semis) {
            dLo = alt; loRaised = true;
          }
        }
      }
      if (dLo > MAX_FRET || dHi > MAX_FRET) continue;
      const stretch = Math.abs(dLo - dHi);
      if (dLo !== 0 && dHi !== 0 && stretch > MAX_STRETCH) continue;
      const loMidi       = MIDI[pLo] + dLo;
      const loOct        = Math.floor(loMidi / 12) - 1;
      const isSameOctave = exactLo >= 0 && (exactHi >= 0 || loRaised);
      const isAct        = exactLo >= 0 && !loRaised && exactHi >= 0 && exactLo >= fMin && exactLo <= fMax;
      const crossesGB    = (pLo <= 3 && pHi >= 4) && !(pLo === 4 && pHi === 5);
      placements.push({ type:'cross', pLo, pHi, dLo, dHi, loRaised, loOct, loMidi, skippedCount, isSameOctave, isAct, crossesGB });
    }
  }

  // ── Same-string placements ────────────────────────────────────────────────
  const sameStrPlacements = [];
  if (semis <= MAX_STRETCH) {
    for (let si = 0; si <= 5; si++) {
      const modLo        = ((lo.midi % 12) - (MIDI[si] % 12) + 12) % 12;
      const dLo          = modLo;
      const dHi          = dLo + semis;
      if (dHi > MAX_FRET) continue;
      const exactLo      = lo.midi - MIDI[si];
      const isSameOctave = exactLo >= 0;
      const isAct        = isSameOctave && exactLo >= fMin && exactLo <= fMax;
      const loOct        = Math.floor((MIDI[si] + dLo) / 12) - 1;
      sameStrPlacements.push({ type:'same', si, dLo, dHi, isSameOctave, isAct, loIsOpen: dLo === 0, loOct });
    }
  }

  if (!placements.length && !sameStrPlacements.length) return '';

  // ── String-subset filter ──────────────────────────────────────────────────
  const subsetSet = (stringSubset && stringSubset.length) ? new Set(stringSubset) : null;
  if (subsetSet) {
    placements.forEach(p => { if (p.isAct && (!subsetSet.has(p.pLo) || !subsetSet.has(p.pHi))) p.isAct = false; });
    sameStrPlacements.forEach(p => { if (p.isAct && !subsetSet.has(p.si)) p.isAct = false; });
  }

  // ── Split moveable / open strings ─────────────────────────────────────────
  const allShapes = placements.concat(sameStrPlacements);
  const moveable  = allShapes.filter(p => p.type === 'same' || (p.dLo !== 0 && p.dHi !== 0) || Math.abs(p.dLo - p.dHi) <= MAX_STRETCH);
  const openStr   = allShapes.filter(p => p.type !== 'same' && (p.dLo === 0 || p.dHi === 0) && Math.abs(p.dLo - p.dHi) > MAX_STRETCH);

  // ── Per-shape thumbnail SVG ───────────────────────────────────────────────
  function makeThumbSVG(pl) {
    const isAct = pl.isAct;
    let s = '', TW;

    if (pl.type === 'same') {
      const { si, dLo, dHi, isSameOctave, loIsOpen } = pl;
      TW = SS_W;
      const xStr = TW / 2;
      const wTop = (loIsOpen ? dHi : Math.min(dLo, dHi)) <= TC.NUM_FRETS ? 0
                 : Math.max(0, Math.round((dLo + dHi) / 2) - Math.ceil(TC.NUM_FRETS / 2));
      const fY   = f => TC.NUT_Y + (f - wTop - 0.5) * TC.FH;
      if (isAct)             s += '<rect x="0" y="'+(TC.NUT_Y-2)+'" width="'+TW+'" height="'+(TC.NUM_FRETS*TC.FH+4)+'" fill="rgba(0,200,80,0.13)" stroke="rgba(0,220,80,0.7)" stroke-width="1.5" rx="2"/>';
      else if (isSameOctave) s += '<rect x="0" y="'+(TC.NUT_Y-2)+'" width="'+TW+'" height="'+(TC.NUM_FRETS*TC.FH+4)+'" fill="rgba(0,200,80,0.07)" rx="2"/>';
      s += '<text x="'+xStr+'" y="'+TC.LBL_Y+'" text-anchor="middle" font-size="8" fill="#ccc" font-family="system-ui,sans-serif" font-weight="700">'+SHORT[si]+'</text>';
      if (wTop === 0) s += '<line x1="2" y1="'+TC.NUT_Y+'" x2="'+(TW-2)+'" y2="'+TC.NUT_Y+'" stroke="#aaa" stroke-width="2.5"/>';
      else { s += '<line x1="2" y1="'+TC.NUT_Y+'" x2="'+(TW-2)+'" y2="'+TC.NUT_Y+'" stroke="#454565" stroke-width="1"/>'; s += '<text x="'+(TW-2)+'" y="'+(TC.NUT_Y-3)+'" text-anchor="end" font-size="7" fill="'+(isSameOctave?'#999':'#444')+'" font-family="system-ui,sans-serif">'+(wTop+1)+'</text>'; }
      for (let f = 1; f <= TC.NUM_FRETS; f++) s += '<line x1="2" y1="'+(TC.NUT_Y+f*TC.FH)+'" x2="'+(TW-2)+'" y2="'+(TC.NUT_Y+f*TC.FH)+'" stroke="#3c3c5a" stroke-width="0.8"/>';
      s += '<line x1="'+xStr+'" y1="'+TC.NUT_Y+'" x2="'+xStr+'" y2="'+(TC.NUT_Y+TC.NUM_FRETS*TC.FH)+'" stroke="#5a6080" stroke-width="'+STR_TH[si]+'"/>';
      if (loIsOpen) s += '<circle cx="'+xStr+'" cy="'+TC.OPEN_Y+'" r="3" fill="none" stroke="'+loInfo.color+'" stroke-width="1.5"/>';
      const loY = loIsOpen ? TC.OPEN_Y : fY(dLo), hiY = fY(dHi);
      s += '<line x1="'+xStr+'" y1="'+loY+'" x2="'+xStr+'" y2="'+hiY+'" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>';
      if (!loIsOpen) s += '<circle cx="'+xStr+'" cy="'+loY+'" r="'+TC.DR+'" fill="'+loInfo.color+'"/>';
      s += '<circle cx="'+xStr+'" cy="'+hiY+'" r="'+TC.DR+'" fill="'+hiInfo.color+'"/>';
      if (!loIsOpen) s += '<text x="'+(xStr-TC.DR-2)+'" y="'+(loY+3.5)+'" text-anchor="end" font-size="9" font-weight="700" font-family="system-ui,sans-serif" fill="#eee">'+dLo+'</text>';
      s += '<text x="'+(xStr-TC.DR-2)+'" y="'+(hiY+3.5)+'" text-anchor="end" font-size="9" font-weight="700" font-family="system-ui,sans-serif" fill="#eee">'+dHi+'</text>';
    } else {
      const { pLo, pHi, dLo, dHi, loRaised, skippedCount, isSameOctave, crossesGB } = pl;
      TW = TC.PX + (1 + skippedCount) * TC.SW + TC.PX;
      const xLo   = TC.PX;
      const xHi   = TC.PX + (1 + skippedCount) * TC.SW;
      const xMids = Array.from({length: skippedCount}, (_, m) => TC.PX + (m + 1) * TC.SW);
      const loIsOpen = dLo === 0, hiIsOpen = dHi === 0;
      const topFret  = Math.max(loIsOpen ? 0 : dLo, hiIsOpen ? 0 : dHi);
      const wTop     = topFret <= TC.NUM_FRETS ? 0 : Math.max(0, topFret - TC.NUM_FRETS + 1);
      const fY       = f => TC.NUT_Y + (f - wTop - 0.5) * TC.FH;
      const lblC     = crossesGB ? '#c8a020' : '#ccc';
      if (isAct)             s += '<rect x="0" y="'+(TC.NUT_Y-2)+'" width="'+TW+'" height="'+(TC.NUM_FRETS*TC.FH+4)+'" fill="rgba(0,200,80,0.13)" stroke="rgba(0,220,80,0.7)" stroke-width="1.5" rx="2"/>';
      else if (isSameOctave) s += '<rect x="0" y="'+(TC.NUT_Y-2)+'" width="'+TW+'" height="'+(TC.NUM_FRETS*TC.FH+4)+'" fill="rgba(0,200,80,0.07)" rx="2"/>';
      else if (crossesGB)    s += '<rect x="0" y="'+(TC.NUT_Y-2)+'" width="'+TW+'" height="'+(TC.NUM_FRETS*TC.FH+4)+'" fill="rgba(255,183,0,0.10)" rx="2"/>';
      s += '<text x="'+xLo+'" y="'+TC.LBL_Y+'" text-anchor="middle" font-size="8" fill="'+lblC+'" font-family="system-ui,sans-serif" font-weight="700">'+SHORT[pLo]+'</text>';
      xMids.forEach((xm, m) => { s += '<text x="'+xm+'" y="'+TC.LBL_Y+'" text-anchor="middle" font-size="8" fill="rgba(140,140,160,0.45)" font-family="system-ui,sans-serif" font-weight="700">'+SHORT[pLo+1+m]+'</text>'; });
      s += '<text x="'+xHi+'" y="'+TC.LBL_Y+'" text-anchor="middle" font-size="8" fill="'+lblC+'" font-family="system-ui,sans-serif" font-weight="700">'+SHORT[pHi]+'</text>';
      if (wTop === 0) s += '<line x1="2" y1="'+TC.NUT_Y+'" x2="'+(TW-2)+'" y2="'+TC.NUT_Y+'" stroke="#aaa" stroke-width="2.5"/>';
      else { s += '<line x1="2" y1="'+TC.NUT_Y+'" x2="'+(TW-2)+'" y2="'+TC.NUT_Y+'" stroke="#454565" stroke-width="1"/>'; s += '<text x="'+(TW-2)+'" y="'+(TC.NUT_Y-3)+'" text-anchor="end" font-size="7" fill="'+(isSameOctave?'#999':'#444')+'" font-family="system-ui,sans-serif">'+(wTop+1)+'</text>'; }
      for (let f = 1; f <= TC.NUM_FRETS; f++) s += '<line x1="2" y1="'+(TC.NUT_Y+f*TC.FH)+'" x2="'+(TW-2)+'" y2="'+(TC.NUT_Y+f*TC.FH)+'" stroke="#3c3c5a" stroke-width="0.8"/>';
      const strSeq = [pLo].concat(Array.from({length: skippedCount}, (_, m) => pLo + 1 + m)).concat([pHi]);
      const xSeq   = [xLo].concat(xMids).concat([xHi]);
      strSeq.forEach((si, i) => { const mid = i > 0 && i < strSeq.length - 1; s += '<line x1="'+xSeq[i]+'" y1="'+TC.NUT_Y+'" x2="'+xSeq[i]+'" y2="'+(TC.NUT_Y+TC.NUM_FRETS*TC.FH)+'" stroke="#5a6080" stroke-width="'+STR_TH[si]+'"'+(mid?' opacity="0.3"':'')+'/>';});
      if (loIsOpen) s += '<circle cx="'+xLo+'" cy="'+TC.OPEN_Y+'" r="3" fill="none" stroke="'+loInfo.color+'" stroke-width="1.5"/>';
      if (hiIsOpen) s += '<circle cx="'+xHi+'" cy="'+TC.OPEN_Y+'" r="3" fill="none" stroke="'+hiInfo.color+'" stroke-width="1.5"/>';
      const loY = loIsOpen ? TC.OPEN_Y : fY(dLo), hiY = hiIsOpen ? TC.OPEN_Y : fY(dHi);
      s += '<line x1="'+xLo+'" y1="'+loY+'" x2="'+xHi+'" y2="'+hiY+'" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"'+(skippedCount > 0 ? ' stroke-dasharray="3,2"' : '')+'/>';
      if (!loIsOpen) s += '<circle cx="'+xLo+'" cy="'+loY+'" r="'+TC.DR+'" fill="'+loInfo.color+'"/>';
      if (!hiIsOpen) s += '<circle cx="'+xHi+'" cy="'+hiY+'" r="'+TC.DR+'" fill="'+hiInfo.color+'"/>';
      if (loRaised && !loIsOpen) s += '<text x="'+xLo+'" y="'+(loY-TC.DR-2)+'" text-anchor="middle" font-size="6" font-weight="800" font-family="system-ui,sans-serif" fill="#ffb700">8\u2191</text>';
      if (!loIsOpen) s += '<text x="'+(xLo-TC.DR-2)+'" y="'+(loY+3.5)+'" text-anchor="end" font-size="9" font-weight="700" font-family="system-ui,sans-serif" fill="#eee">'+dLo+'</text>';
    }
    return '<svg class="chord-thumb'+(isAct ? ' chord-thumb-active' : '')+'" viewBox="0 0 '+TW+' '+TH+'" xmlns="http://www.w3.org/2000/svg">'+s+'</svg>';
  }

  // ── HTML column layout (identical structure to buildChordDiagram) ─────────
  function renderColumn(shapes, colLabel) {
    if (!shapes.length) return '';
    var octaves = [];
    shapes.forEach(function(p) { var o = p.loOct; if (octaves.indexOf(o) < 0) octaves.push(o); });
    octaves.sort(function(a, b) { return a - b; });
    var html = '<div class="cd-col-label">' + colLabel + '</div>';
    octaves.forEach(function(oct) {
      var group = shapes.filter(function(p) { return p.loOct === oct; });
      html += '<div class="cd-oct-label">oct.' + oct + '</div>';
      html += '<div class="cd-oct-row">';
      group.forEach(function(p) { html += makeThumbSVG(p); });
      html += '</div>';
    });
    return '<div class="cd-col">' + html + '</div>';
  }

  return '<div class="cd-grid">' + renderColumn(moveable, 'moveable') + renderColumn(openStr, 'open strings') + '</div>';
}


// -- Chord shape diagram -----------------------------------------------------
// Renders all playable voicings of a chord (from buildChordVoicings in
// theory.js) in the same horizontal-block style as buildShapeDiagram.
//
// task: a chord_shape task carrying .chordPCs, .chordIntervals, .voicing,
//       .chordName.  The matching voicing gets a green active highlight.
//
// Layout: two rows — 3-string voicings on top, 4-string voicings below,
// separated by a faint divider line (mirrors moveable/open-strings split).
function buildChordDiagram(task) {
  if (!task || !task.chordPCs || !task.voicing) return '';

  const SHORT   = ['E', 'A', 'D', 'G', 'B', 'e'];
  const STR_TH  = [2.6, 2.1, 1.7, 1.4, 1.1, 0.9];
  const MIDI    = STANDARD_TUNING_MIDI;
  const chordPCs   = task.chordPCs;
  const cIntervals = task.chordIntervals || [];
  const actSig     = task.voicing.map(function(v) { return v.si + ':' + v.fret; }).join(',');

  const DEG_MAP = {0:'R',1:'b2',2:'2',3:'b3',4:'3',5:'4',6:'b5',7:'5',8:'b6',9:'6',10:'b7',11:'7',12:'8va'};
  function degLabel(toneIdx) { return DEG_MAP[cIntervals[toneIdx]] || '?'; }

  // Collect all voicings (3-string then 4-string)
  const sets3 = [[0,1,2],[1,2,3],[2,3,4],[3,4,5]];
  const sets4 = [[0,1,2,3],[1,2,3,4],[2,3,4,5]];
  const useSets = chordPCs.length <= 3 ? sets3.concat(sets4) : sets4;
  var allV = [];
  useSets.forEach(function(ss) {
    buildChordVoicings(chordPCs, ss, 0, 12).forEach(function(v) { allV.push(v); });
  });
  function rowSort(a, b) {
    return Math.min.apply(null, a.map(function(n){return n.note.midi;}))
         - Math.min.apply(null, b.map(function(n){return n.note.midi;}));
  }
  allV.sort(rowSort);

  // Filter: keep only voicings where notes are strictly ascending in pitch
  // (rules out physically impossible string crossings and descending intervals)
  allV = allV.filter(function(v) {
    for (var i = 1; i < v.length; i++) {
      if (v[i].note.midi <= v[i-1].note.midi) return false;
    }
    return true;
  });

  // Keep only voicings whose lowest-pitched note matches the bass note of the
  // active task voicing (handles inversions: C/E uses E bass, C/G uses G bass).
  var actLoMidi = Math.min.apply(null, task.voicing.map(function(n){ return n.note.midi; }));
  var bassPC = task.voicing.filter(function(n){ return n.note.midi === actLoMidi; })[0].pc;
  allV = allV.filter(function(v) {
    var loMidi = Math.min.apply(null, v.map(function(n){ return n.note.midi; }));
    return v.some(function(n){ return n.note.midi === loMidi && n.pc === bassPC; });
  });

  // ── Shared render helper ────────────────────────────────────────────────
  // Renders a single voicing block as SVG content (no outer <svg> tag).
  // C = { FH, SW, PX, DR, NUT_Y, OPEN_Y, LBL_Y, NUM_FRETS, PB, OCT_H }
  function voicingBlock(voicing, C, bY, x0, isActive) {
    var nStr  = voicing.length;
    var blkW  = C.PX + (nStr - 1) * C.SW + C.PX;
    var xR    = x0 + blkW;
    var sig   = voicing.map(function(v){return v.si+':'+v.fret;}).join(',');
    var crossesGB = voicing.some(function(v,i){
      return i < nStr-1 && voicing[i].si === 3 && voicing[i+1].si === 4;
    });
    var xPoss = voicing.map(function(_, i) { return x0 + C.PX + i * C.SW; });
    var closedFrets = voicing.map(function(v){return v.fret;}).filter(function(f){return f>0;});
    var topFret = closedFrets.length ? Math.max.apply(null, closedFrets) : 0;
    var wTop    = topFret <= C.NUM_FRETS ? 0 : Math.max(0, topFret - C.NUM_FRETS + 1);
    var fY      = function(f) { return bY + C.NUT_Y + (f - wTop - 0.5) * C.FH; };
    var s = '';
    // Background highlight
    if (isActive)       s += '<rect x="'+x0+'" y="'+(bY+C.NUT_Y-2)+'" width="'+blkW+'" height="'+(C.NUM_FRETS*C.FH+4)+'" fill="rgba(0,200,80,0.13)" stroke="rgba(0,220,80,0.7)" stroke-width="'+(C.DR>5?2:1.2)+'" rx="2"/>';
    else if (crossesGB) s += '<rect x="'+x0+'" y="'+(bY+C.NUT_Y-2)+'" width="'+blkW+'" height="'+(C.NUM_FRETS*C.FH+4)+'" fill="rgba(255,183,0,0.07)" rx="2"/>';
    // String labels
    var lblC = crossesGB ? '#c8a020' : (C.DR > 5 ? '#ccc' : 'rgba(180,180,200,0.7)');
    voicing.forEach(function(v, i) {
      s += '<text x="'+xPoss[i]+'" y="'+(bY+C.LBL_Y)+'" text-anchor="middle" font-size="'+(C.DR>5?10:7)+'" fill="'+lblC+'" font-family="system-ui,sans-serif" font-weight="700">'+SHORT[v.si]+'</text>';
    });
    // Nut / position marker
    if (wTop === 0) s += '<line x1="'+(x0+2)+'" y1="'+(bY+C.NUT_Y)+'" x2="'+(xR-2)+'" y2="'+(bY+C.NUT_Y)+'" stroke="#aaa" stroke-width="'+(C.DR>5?3:1.5)+'"/>';
    else {
      s += '<line x1="'+(x0+2)+'" y1="'+(bY+C.NUT_Y)+'" x2="'+(xR-2)+'" y2="'+(bY+C.NUT_Y)+'" stroke="#454565" stroke-width="1"/>';
      s += '<text x="'+(xR-2)+'" y="'+(bY+C.NUT_Y-3)+'" text-anchor="end" font-size="'+(C.DR>5?8:6)+'" fill="'+(isActive?'#999':'#444')+'" font-family="system-ui,sans-serif">'+(wTop+1)+'</text>';
    }
    // Fret lines
    for (var f = 1; f <= C.NUM_FRETS; f++)
      s += '<line x1="'+(x0+2)+'" y1="'+(bY+C.NUT_Y+f*C.FH)+'" x2="'+(xR-2)+'" y2="'+(bY+C.NUT_Y+f*C.FH)+'" stroke="#3c3c5a" stroke-width="0.8"/>';
    // String lines
    voicing.forEach(function(v, i) {
      s += '<line x1="'+xPoss[i]+'" y1="'+(bY+C.NUT_Y)+'" x2="'+xPoss[i]+'" y2="'+(bY+C.NUT_Y+C.NUM_FRETS*C.FH)+'" stroke="#5a6080" stroke-width="'+STR_TH[v.si]+'"/>';
    });
    // Dot Y positions
    var dotYs = voicing.map(function(v) { return v.fret === 0 ? bY+C.OPEN_Y : fY(v.fret); });
    // Connecting polyline
    var pts = voicing.map(function(_, i){ return xPoss[i]+','+dotYs[i]; }).join(' ');
    s += '<polyline points="'+pts+'" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="'+(C.DR>5?2:1)+'" stroke-linecap="round" stroke-linejoin="round"/>';
    // Dots + labels — shape matches NOTE_SYSTEM (square=rect, circle=circle)
    voicing.forEach(function(v, i) {
      var info   = NOTE_SYSTEM[v.note.name] || { color: '#888', shape: 'circle' };
      var isOpen = v.fret === 0;
      var cy     = isOpen ? bY + C.OPEN_Y : dotYs[i];
      var col    = info.color;
      var sw     = C.DR > 5 ? 2 : 1.2;
      if (info.shape === 'square') {
        var rx2 = Math.max(1, C.DR * 0.3);
        if (isOpen) {
          s += '<rect x="'+(xPoss[i]-C.DR)+'" y="'+(cy-C.DR)+'" width="'+(C.DR*2)+'" height="'+(C.DR*2)+'" rx="'+rx2+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'"/>';
        } else {
          s += '<rect x="'+(xPoss[i]-C.DR)+'" y="'+(cy-C.DR)+'" width="'+(C.DR*2)+'" height="'+(C.DR*2)+'" rx="'+rx2+'" fill="'+col+'"/>';
          if (C.DR > 5) s += '<text x="'+(xPoss[i]-C.DR-3)+'" y="'+(cy+4)+'" text-anchor="end" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="#eee">'+v.fret+'</text>';
        }
      } else {
        if (isOpen) {
          s += '<circle cx="'+xPoss[i]+'" cy="'+cy+'" r="'+C.DR+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'"/>';
        } else {
          s += '<circle cx="'+xPoss[i]+'" cy="'+cy+'" r="'+C.DR+'" fill="'+col+'"/>';
          if (C.DR > 5) s += '<text x="'+(xPoss[i]-C.DR-3)+'" y="'+(cy+4)+'" text-anchor="end" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="#eee">'+v.fret+'</text>';
        }
      }
    });
    // Degree row at bottom
    var degStr = voicing.map(function(v) { return degLabel(v.toneIdx); }).join('\u2013');
    s += '<text x="'+(x0+blkW/2)+'" y="'+(bY+C.NUT_Y+C.NUM_FRETS*C.FH+C.PB+C.OCT_H*0.65)+'" text-anchor="middle" font-size="'+(C.DR>5?10:7)+'" font-weight="'+(C.DR>5?700:600)+'" font-family="system-ui,sans-serif" fill="'+(isActive?'#ccc':'rgba(100,100,140,0.8)')+'">'+degStr+'</text>';
    return { s, blkW };
  }

  // ── Thumb renderer ──────────────────────────────────────────────────────
  // TC is sized so each thumb is a consistent visual height.
  var TC = { FH:11, SW:20, PX:9, DR:4, NUT_Y:22, OPEN_Y:15, LBL_Y:8, NUM_FRETS:5, PB:4, OCT_H:11 };
  function thumbH(v) { return TC.NUT_Y + TC.NUM_FRETS * TC.FH + TC.PB + TC.OCT_H; }
  function thumbW(v) { return TC.PX + (v.length - 1) * TC.SW + TC.PX; }

  function makeSVG(voicing) {
    var isSame = voicing.map(function(v){return v.si+':'+v.fret;}).join(',') === actSig;
    var tw = thumbW(voicing), th = thumbH(voicing);
    var tb = voicingBlock(voicing, TC, 0, 0, isSame);
    return '<svg class="chord-thumb'+(isSame?' chord-thumb-active':'')+
           '" viewBox="0 0 '+tw+' '+th+'" xmlns="http://www.w3.org/2000/svg">'+tb.s+'</svg>';
  }

  // ── Split: transposable vs position-specific ─────────────────────────────
  // A voicing is transposable if shifting every fret +1 stays within a
  // 4-fret window (a human hand). Shifted span = max(frets) - min(frets),
  // which equals the original total span. buildChordVoicings only constrains
  // the non-open span ≤ 4, so open-string voicings with max_fret > 4 exceed
  // the 4-fret window after shifting and belong in the right (fixed) column.
  function isTransposable(v) {
    var frets = v.map(function(n){ return n.fret; });
    return Math.max.apply(null, frets) - Math.min.apply(null, frets) <= 4;
  }
  function bassOct(v) {
    return Math.floor(Math.min.apply(null, v.map(function(n){return n.note.midi;})) / 12) - 1;
  }
  var moveable = allV.filter(isTransposable);
  var open     = allV.filter(function(v){ return !isTransposable(v); });

  // ── Group by bass octave, return HTML for one column ─────────────────────
  function renderColumn(voicings, colLabel) {
    if (!voicings.length) return '';
    // Collect unique octaves in ascending order
    var octaves = [];
    voicings.forEach(function(v) {
      var o = bassOct(v);
      if (octaves.indexOf(o) < 0) octaves.push(o);
    });
    octaves.sort(function(a,b){ return a - b; });

    var html = '<div class="cd-col-label">'+colLabel+'</div>';
    octaves.forEach(function(oct) {
      var group = voicings.filter(function(v){ return bassOct(v) === oct; });
      html += '<div class="cd-oct-label">oct.'+oct+'</div>';
      html += '<div class="cd-oct-row">';
      group.forEach(function(v){ html += makeSVG(v); });
      html += '</div>';
    });
    return '<div class="cd-col">'+html+'</div>';
  }

  return '<div class="cd-grid">' +
    renderColumn(moveable, 'moveable') +
    renderColumn(open, 'open strings') +
  '</div>';
}


// -- Theory panel -------------------------------------------------------------
function renderTheoryPanel(task) {
  if (!task) return;
  const target   = task.currentNote;
  const rootMidi = phaseRootMidi();
  const pat      = task.segmentId;

  const theoryPanel = document.getElementById('theory-panel');
  if (theoryPanel) theoryPanel.classList.toggle('intervals-active', pat === 'intervals');

  const degEl    = document.getElementById('theory-degree');
  const motionEl = document.getElementById('theory-motion');

  if (task.kind === 'interval') {
    if (degEl) {
      const loInfo = NOTE_SYSTEM[task.lo.name]  || { color: '#888' };
      const hiInfo = NOTE_SYSTEM[task.hi.name]  || { color: '#888' };
      const onHi   = task.stepIdx === 1;
      const loChip = '<span class="theory-chip ' + (loInfo.shape||'circle') + '" style="background:' + loInfo.color + (onHi?';opacity:0.55':'') + '">' + task.lo.name + '<sup>' + task.lo.octave + '</sup></span>';
      const hiChip = '<span class="theory-chip ' + (hiInfo.shape||'circle') + '" style="background:' + hiInfo.color + (!onHi?';opacity:0.55':'') + '">' + task.hi.name + '<sup>' + task.hi.octave + '</sup></span>';
      degEl.innerHTML = loChip + ' <span class="theory-arrow">\u2192</span> ' + hiChip + ' &nbsp;<strong class="theory-deg-badge">' + task.label + '</strong>';
    }
    if (motionEl) motionEl.textContent = '';

  } else if (task.kind === 'chord') {
    if (task.style === 'chord_shape') {
      var cInt    = task.chordIntervals || [];
      var cPCs    = task.chordPCs || [];
      var voicing = task.voicing || [];
      var loMidi  = Math.min.apply(null, voicing.map(function(n){ return n.note.midi; }));
      var bassV   = voicing.filter(function(n){ return n.note.midi === loMidi; })[0];
      // Slash chord name (e.g. "Cmaj / E" for 1st inversion)
      var rootPC   = cPCs[0];

      // Colorize a chord name: root letter in NOTE_SYSTEM color, quality in maj/min convention
      function colorizeChordName(name) {
        var chromOrder = ['Db','Eb','F#','Ab','Bb','C','D','E','F','G','A','B'];
        var root = 'C', qual = name;
        for (var _ci = 0; _ci < chromOrder.length; _ci++) {
          if (name.indexOf(chromOrder[_ci]) === 0 && chromOrder[_ci].length >= root.length) {
            root = chromOrder[_ci]; qual = name.slice(root.length);
          }
        }
        var rInfo = NOTE_SYSTEM[root] || { color: '#c8a020' };
        var qCol = /^maj/i.test(qual) ? '#b5e000'
                 : /^m(?!aj)/i.test(qual) || /^min/i.test(qual) ? '#ff8c20'
                 : '#7777aa';
        return '<span style="color:' + rInfo.color + ';font-weight:800">' + root + '</span>' +
               (qual ? '<span style="color:' + qCol + ';font-weight:800;font-size:0.82em">' + qual + '</span>' : '');
      }

      function colorizeNoteName(noteName) {
        var nInfo = NOTE_SYSTEM[noteName] || { color: '#c8a020' };
        return '<span style="color:' + nInfo.color + ';font-weight:800">' + noteName + '</span>';
      }

      var coloredChordName = colorizeChordName(task.chordName);
      var slashName = (bassV && bassV.pc !== rootPC)
        ? coloredChordName + '<span class="snc-slash-sep"> / </span>' + colorizeNoteName(bassV.note.name)
        : coloredChordName;
      // Figured bass symbol
      var figBass = '';
      if (bassV) {
        var bassInt = cInt[bassV.toneIdx];
        if (cInt.length === 3) {
          if (bassInt > 0 && bassInt === cInt[1]) figBass = '\u2076';         // ⁶
          else if (bassInt > 0 && bassInt === cInt[2]) figBass = '\u2076\u2084'; // ⁶₄
        } else if (cInt.length === 4) {
          if (bassInt === cInt[1]) figBass = '\u2076\u2085';  // ⁶₅
          else if (bassInt === cInt[2]) figBass = '\u2074\u2083'; // ⁴₃
          else if (bassInt === cInt[3]) figBass = '\u00b2';   // ²
        }
      }
      // Inversion label
      var invLabel = '';
      if (bassV) {
        var bassInt2 = cInt[bassV.toneIdx];
        if      (bassInt2 === 0)        invLabel = 'root position';
        else if (bassInt2 === cInt[1])  invLabel = '1st inversion';
        else if (bassInt2 === cInt[2])  invLabel = '2nd inversion';
        else if (cInt[3] != null && bassInt2 === cInt[3]) invLabel = '3rd inversion';
      }
      if (degEl) {
        // Detect open voicing here so the badge lands on the chord-name row
        var isOpenVoicingDeg = voicing.some(function(v, i) {
          return i > 0 && (voicing[i].note.midi - voicing[i-1].note.midi) > 5;
        });
        var voicingBadge = '<span class="snc-voicing-badge">' + (isOpenVoicingDeg ? 'open' : 'close') + ' voicing</span>';
        degEl.innerHTML =
          '<div class="snc-chord-slash-name">' + slashName +
          (figBass ? '<sup class="snc-fig-bass">&thinsp;' + figBass + '</sup>' : '') + '</div>' +
          '<div class="snc-inv-row">' +
          (invLabel ? '<span class="snc-inv-label">' + invLabel + '</span>' : '') +
          voicingBadge +
          '</div>';
      }
      // Note pills with labeled interval connectors (distances are actual semitones)
      if (motionEl) {
        var DEG_SHORT = {0:'R',2:'2',3:'\u266d3',4:'3',5:'4',6:'\u266d5',7:'5',9:'6',10:'\u266d7',11:'7'};
        var INT_ABBR  = {
          1:'m2', 2:'M2', 3:'m3', 4:'M3', 5:'P4', 6:'TT', 7:'P5',
          8:'m6', 9:'M6', 10:'m7', 11:'M7', 12:'P8',
          13:'m9', 14:'M9', 15:'m10', 16:'M10', 17:'P11', 18:'TT', 19:'P12'
        };
        // Color by interval quality — matches .iq-* CSS variables
        var INT_COLOR = {
          0:'#4d9fff',  // perfect unison
          1:'#ff8c20',  2:'#b5e000',  3:'#ff8c20',  4:'#b5e000',
          5:'#4d9fff',  6:'#ff3a55',  7:'#4d9fff',
          8:'#ff8c20',  9:'#b5e000',  10:'#ff8c20', 11:'#b5e000', 12:'#4d9fff',
          // compound
          13:'#ff8c20', 14:'#b5e000', 15:'#ff8c20', 16:'#b5e000',
          17:'#4d9fff', 18:'#ff3a55', 19:'#4d9fff'
        };
        // Tick width + gap in px
        var TW = 4, GAP = 3, TH = 10;
        function intConnector(semis) {
          var col = INT_COLOR[semis] || '#888';
          var lbl = INT_ABBR[semis]  || (semis + 'st');
          var W   = semis * (TW + GAP) - GAP;
          var rects = '';
          for (var t = 0; t < semis; t++) {
            rects += '<rect x="' + (t * (TW + GAP)) + '" y="0" width="' + TW + '" height="' + TH + '" rx="1" fill="' + col + '" opacity="0.6"/>';
          }
          var svg = '<svg width="' + W + '" height="' + TH + '" viewBox="0 0 ' + W + ' ' + TH + '" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;flex-shrink:0">' + rects + '</svg>';
          return '<span class="snc-int-connector">' +
            svg +
            '<span class="snc-int-lbl" style="color:' + col + '">' + lbl + '</span>' +
            '</span>';
        }
        // Detect open voicing: any adjacent pair spans > a 4th (5 semitones)
        var isOpenVoicing = voicing.some(function(v, i) {
          return i > 0 && (voicing[i].note.midi - voicing[i-1].note.midi) > 5;
        });
        var pillsHtml = '<span class="snc-pills-row">';
        for (var pi = 0; pi < voicing.length; pi++) {
          var vn    = voicing[pi];
          var info  = NOTE_SYSTEM[vn.note.name] || { color: '#888', shape: 'circle' };
          var isCur = (vn.note.midi === task.currentNote.midi);
          var dg    = DEG_SHORT[cInt[vn.toneIdx]] !== undefined ? DEG_SHORT[cInt[vn.toneIdx]] : '?';
          var shapeClass = info.shape === 'square' ? 'snc-pill-dot-sq' : 'snc-pill-dot-ci';
          pillsHtml += '<span class="snc-pill' + (isCur ? ' snc-pill-cur' : '') + '"' +
            ' onclick="playReferenceNote(\'' + vn.note.name + '\',' + vn.note.octave + ')"' +
            ' title="' + vn.note.name + vn.note.octave + ' \u2014 ' + dg + '">' +
            '<span class="snc-pill-dot ' + shapeClass + '" style="background:' + info.color + ';opacity:' + (isCur?'1':'0.4') + '"></span>' +
            '<span class="snc-pill-note">' + vn.note.name + '<sup>' + vn.note.octave + '</sup></span>' +
            '<span class="snc-pill-deg">' + dg + '</span>' +
            '</span>';
          if (pi < voicing.length - 1) {
            var semis = voicing[pi + 1].note.midi - vn.note.midi;
            pillsHtml += intConnector(semis);
          }
        }
        pillsHtml += '</span>';
        motionEl.innerHTML = pillsHtml;
      }
    } else {
      // old arpeggio style
      if (degEl) {
        const posInTriad = task.stepIdx;
        var chip = function(n, dim) {
          const info = NOTE_SYSTEM[n.name] || { color: '#888' };
          const op   = dim ? ';opacity:0.45' : '';
          return '<span class="theory-chip ' + (info.shape||'circle') + '" style="background:' + info.color + op + '">' + n.name + '<sup>' + n.octave + '</sup></span>';
        };
        const rom = task.roman ? ' &nbsp;<span style="opacity:0.6;font-size:0.85em">' + task.roman + '</span>' : '';
        degEl.innerHTML =
          chip(task.notes[0], posInTriad > 0) + '<span class="theory-arrow"> \u2192 </span>' +
          chip(task.notes[1], posInTriad !== 1) + '<span class="theory-arrow"> \u2192 </span>' +
          chip(task.notes[2], posInTriad < 2) +
          ' &nbsp;<strong class="theory-deg-badge">' + task.notes[0].name + task.quality.symbol + rom +
          ' &nbsp;<span style="opacity:0.55;font-size:0.8em">' + task.quality.full + '</span></strong>';
      }
      if (motionEl) motionEl.textContent = '';
    }

  } else {
    const DEG = ['1 \u2014 Root','\u266d2','2','\u266d3','3 \u2014 Major 3rd','4','\u266d5','5 \u2014 Perfect 5th','\u266d6','6 \u2014 Major 6th','\u266d7','7'];
    if (degEl && rootMidi != null) {
      const semi   = ((target.midi - rootMidi) % 12 + 12) % 12;
      const octUp  = Math.max(0, Math.floor((target.midi - rootMidi) / 12));
      const info   = NOTE_SYSTEM[target.name] || {};
      const octTag = octUp > 0 ? ' (octave +' + octUp + ')' : '';
      degEl.innerHTML = '<span class="theory-deg-badge" style="color:' + (info.color||'#fff') + '">' +
        target.name + '<sup>' + target.octave + '</sup></span> &nbsp; degree <strong>' + DEG[semi] + octTag + '</strong>';
    }
    if (motionEl) {
      if (prevMidi != null && prevMidi !== target.midi) {
        const diff = target.midi - prevMidi;
        const semi = Math.abs(diff) % 12;
        const octs = Math.floor(Math.abs(diff) / 12);
        const dir  = diff > 0 ? '\u2191' : '\u2193';
        const octStr = octs > 0 ? ' + ' + octs + ' octave' : '';
        motionEl.textContent = dir + ' ' + (INTERVAL_FULL[semi] || '?' + semi) + octStr;
      } else {
        motionEl.textContent = prevMidi == null ? 'Start' : 'Same note';
      }
    }
  }
  prevMidi = target.midi;

  // -- Description line -------------------------------------------------------
  const descEl = document.getElementById('theory-desc');
  if (descEl) {
    if (pat === 'intervals') {
      descEl.innerHTML = '<span class="intervals-gb-note">G\u2013B pair: +1 fret on upper string vs all other adjacent pairs \u2014 G and B strings are a Major 3rd apart (4 semitones), not a Perfect 4th (5 semitones)</span>';
    } else if (pat === 'arpeggio') {
      descEl.textContent = '\u25c7 Diatonic triads \u2014 3-voice chords built on each scale degree';
    } else if (pat === 'quartal') {
      descEl.textContent = '\u25c6 Quartal/quintal triads \u2014 stacked 4ths and 5ths';
    } else if (task.style === 'chord_shape') {
      const ph = PHASES[currentPhase];
      // Step progress dots
      var dots = '';
      if (task.voicing) {
        for (var di = 0; di < task.voicing.length; di++) {
          var cls = di < task.stepIdx ? 'snc-step-done' : di === task.stepIdx ? 'snc-step-cur' : 'snc-step-todo';
          dots += '<span class="snc-step-dot ' + cls + '">\u25cf</span>';
        }
      }
      // Root-position interval structure (always from root, not voicing order)
      var rpHtml = '';
      if (task.chordIntervals && task.chordPCs) {
        var rpINT_ABBR = {1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'P8'};
        var rpINT_COLOR = {1:'#ff8c20',2:'#b5e000',3:'#ff8c20',4:'#b5e000',5:'#4d9fff',6:'#ff3a55',7:'#4d9fff',8:'#ff8c20',9:'#b5e000',10:'#ff8c20',11:'#b5e000',12:'#4d9fff'};
        var _CHROM2 = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
        var rpNotes = task.chordPCs.map(function(pc){ return _CHROM2[pc]; });
        rpHtml = '<span class="snc-rp-label">root pos: </span>';
        for (var ri = 0; ri < rpNotes.length; ri++) {
          rpHtml += '<span class="snc-rp-note">' + rpNotes[ri] + '</span>';
          if (ri < task.chordIntervals.length - 1) {
            var rpSemis = task.chordIntervals[ri + 1] - task.chordIntervals[ri];
            var rpCol   = rpINT_COLOR[rpSemis] || '#888';
            rpHtml += '<span class="snc-rp-int" style="color:' + rpCol + '">' + (rpINT_ABBR[rpSemis] || rpSemis) + '</span>';
          }
        }
      }
      descEl.innerHTML =
        '<span class="snc-step-dots">' + dots + '</span>' +
        (ph.chord_desc ? '<span class="snc-chord-formula">' + ph.chord_desc + '</span>' : '') +
        (rpHtml ? '<span class="snc-rp-row">' + rpHtml + '</span>' : '');
    } else {
      const DESCS = { scale_up:'\u2191 Ascending scale', scale_down:'\u2193 Descending scale', random:'~ Free exploration' };
      descEl.textContent = DESCS[pat] || '';
    }
  }

  // -- Right panel: shape diagram (intervals) or chord chips ------------------
  const arpEl = document.getElementById('theory-arp');
  if (arpEl) {
    if (task.kind === 'interval') {
      const ss = PHASES[currentPhase].string_subset || null;
      arpEl.innerHTML = buildShapeDiagram(task.semis, task.lo, task.hi, currentFretMin(), currentFretMax(), ss);
    } else if (task.kind === 'chord') {
      if (task.style === 'chord_shape') {
        // chord_shape: show the chord shape diagram with all voicings
        arpEl.innerHTML = buildChordDiagram(task);
      } else {
        // legacy diatonic arpeggio: show note chips
        const i3 = task.notes[1].midi - task.notes[0].midi;
        const i5 = task.notes[2].midi - task.notes[0].midi;
        arpEl.innerHTML = task.notes[0].name + task.quality.symbol + ' &nbsp;' +
          task.notes.map(n => {
            const info = NOTE_SYSTEM[n.name] || { color: '#888' };
            return '<span class="theory-chip" style="background:' + info.color + '">' + n.name + '<sup>' + n.octave + '</sup></span>';
          }).join('<span class="theory-arrow"> \u2192 </span>') +
          ' &nbsp;<span style="opacity:0.5;font-size:0.8em">' + intervalLabel(i3) + ' + ' + intervalLabel(i5-i3) + '</span>';
      }
    } else {
      arpEl.innerHTML = '';
    }
  }

  // -- Circles ----------------------------------------------------------------
  if (task.kind === 'interval') {
    renderChromaticCircle(task.lo, task.hi);
  } else {
    renderChromaticCircle(target, null);
  }
}

// -- Note card ----------------------------------------------------------------
function renderTarget(task) {
  if (!task) return;
  const target = task.currentNote;
  const info   = NOTE_SYSTEM[target.name] || { color: '#888', shape: 'circle' };
  // Swatch is clickable to hear the current target note
  let innerHtml =
    '<div class="snc-shape ' + info.shape + ' snc-playable" style="background:' + info.color + '" onclick="hearTarget()" title="Hear this note"></div>' +
    '<div class="snc-name">' + target.name + '<span class="snc-octave">' + target.octave + '</span></div>';
  if (task.kind === 'interval') {
    const qClass = _intervalQualityClass(task.semis);
    innerHtml += '<div class="snc-interval-ctx">' +
      '<span class="' + qClass + '">' + task.label + '</span>' +
      '<span class="snc-int-above"> above ' + task.lo.name + task.lo.octave + '</span>' +
      '</div>';
  } else if (task.kind === 'chord' && task.style === 'chord_shape' && task.chordName) {
    var cInt2  = task.chordIntervals || [];
    var ti2    = task.voicing && task.voicing[task.stepIdx] ? task.voicing[task.stepIdx].toneIdx : -1;
    // Chord tone degree — number only, no quality qualifier.
    // Quality belongs to the chord name (Cmaj, Am), not the individual tone.
    var DEG_ROLE = {0:'root',2:'2nd',3:'\u266d3',4:'3rd',5:'4th',6:'\u266d5',7:'5th',9:'6th',10:'\u266d7',11:'7th'};
    var degLbl2  = ti2 >= 0 && cInt2[ti2] != null ? (DEG_ROLE[cInt2[ti2]] || '') : '';
    innerHtml += '<div class="snc-chord-role">' + degLbl2 + '</div>';
  }
  document.getElementById('snc-target').innerHTML = innerHtml;
  // Hide hear-btn for chord tasks — swatch and pills are clickable instead
  const hearBtn = document.getElementById('hear-btn');
  if (hearBtn) hearBtn.style.display = (task.style === 'chord_shape') ? 'none' : '';
  document.getElementById('snc-feedback').textContent = '';
  document.getElementById('snc-feedback').className = 'snc-feedback';
  document.getElementById('detected-name').textContent = '\u2014';
  const sh = document.getElementById('note-shape-display');
  sh.className = 'note-shape-display'; sh.style.backgroundColor = '';
  document.getElementById('intonation-badge').textContent = '';
  updateHint();
}

// -- Phase-up toast -----------------------------------------------------------
function showPhaseToast(msg) {
  const el = document.getElementById('phase-toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'fade-out');
  el.classList.add('visible');
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.classList.add('hidden'), 600); }, 2200);
}

// -- Fretboard ----------------------------------------------------------------
async function showFretboard(task, opts) {
  if (!task) return;
  const target    = task.currentNote;
  const showGhost = opts ? opts.showGhost !== false : true;
  const fMin = currentFretMin(), fMax = currentFretMax();
  const ss   = currentStringSubset();
  let url = '/api/fretboard/svg?num_frets=15&fret_min=' + fMin + '&fret_max=' + fMax
          + '&scale_root=' + encodeURIComponent(ROOT_NOTE_NAME) + guideQuery();
  if (ss) url += '&strings=' + encodeURIComponent(ss);
  // For chord_shape: pin the exact voicing position, overlay the full chord shape,
  // and suppress generic alt/preview (they'd show wrong string options for this voicing).
  if (task.kind === 'chord' && task.style === 'chord_shape' && task.voicing) {
    var vn = task.voicing[task.stepIdx];
    if (vn) url += '&pin=' + encodeURIComponent(vn.si + ':' + vn.fret);
    // Shape guide: all voicing positions (pin takes priority over its own position)
    var shapeStr = task.voicing.map(function(v){ return v.si + ':' + v.fret; }).join(',');
    url += '&shape=' + encodeURIComponent(shapeStr);
  } else if (task.kind === 'interval') {
    // Interval task — draw connector lines on BOTH steps.
    // step 0: pin the lo note, show hi positions as shape guides
    // step 1: pin the hi note, show lo positions as shape guides (already played)
    const loPins = getPinsForTarget(task.lo.name, task.lo.octave, fMin, fMax);
    const hiPins = getPinsForTarget(task.hi.name, task.hi.octave, fMin, fMax);
    if (task.stepIdx === 0) {
      if (loPins) url += '&pin=' + encodeURIComponent(loPins);
      if (hiPins) url += '&shape=' + encodeURIComponent(hiPins);
    } else {
      if (hiPins) url += '&pin=' + encodeURIComponent(hiPins);
      if (loPins) url += '&shape=' + encodeURIComponent(loPins);
    }
    // Build ipair lines for every valid (lo, hi) string-adjacent pair combination.
    if (loPins && hiPins) {
      const loPairs = loPins.split(',').map(function(p){ var t=p.split(':'); return {si:+t[0],fret:+t[1]}; });
      const hiPairs = hiPins.split(',').map(function(p){ var t=p.split(':'); return {si:+t[0],fret:+t[1]}; });
      const pairSegs = [];
      loPairs.forEach(function(lo) {
        hiPairs.forEach(function(hi) {
          if (Math.abs(lo.si - hi.si) <= 3) {
            pairSegs.push(lo.si + ':' + lo.fret + ':' + hi.si + ':' + hi.fret + ':' + task.semis);
          }
        });
      });
      if (pairSegs.length) url += '&ipair=' + encodeURIComponent(pairSegs.join('|'));
    }
  } else {
    const pins = getPinsForTarget(target.name, target.octave, fMin, fMax);
    if (pins) url += '&pin=' + encodeURIComponent(pins);

    // Alt positions: same chord notes on different string sets — dashed outlines
    if (task.altPositions && task.altPositions.length) {
      var altStr = task.altPositions.map(function(p){ return p.si + ':' + p.fret; }).join(',');
      url += '&alt=' + encodeURIComponent(altStr);
    }

    // Scale traversal: draw interval lines for BOTH the interval just completed
    // (previous → current) and the upcoming interval (current → next), so the
    // learner sees where they came from and where they're headed at once.
    const isScale = (task.segmentId === 'scale_up' || task.segmentId === 'scale_down' || task.segmentId === 'step_intervals' || task.segmentId === 'scale_horizontal' || task.segmentId === 'chromatic_walk');
    if (isScale) {
      const curMidi   = task.currentNote.midi;
      const shapeCsv  = [];   // guide outlines for the neighbour notes
      const ipairSegs = [];   // connector lines between string-adjacent pairs

      // Build connector segments between the current note and a neighbour task
      // (previous or next). Returns true if the neighbour shared this segment.
      const pushInterval = function (neighbourTask) {
        if (!neighbourTask || neighbourTask.segmentId !== task.segmentId) return false;
        const nMidi  = neighbourTask.currentNote.midi;
        const semis  = Math.abs(nMidi - curMidi);
        const nPins  = getPinsForTarget(neighbourTask.currentNote.name, neighbourTask.currentNote.octave, fMin, fMax);
        if (!nPins) return false;
        shapeCsv.push(nPins);
        if (pins && semis > 0 && semis <= 12) {
          const loPins_ = curMidi <= nMidi ? pins  : nPins;
          const hiPins_ = curMidi <= nMidi ? nPins : pins;
          const loPairs = loPins_.split(',').map(function(p){ var t=p.split(':'); return {si:+t[0],fret:+t[1]}; });
          const hiPairs = hiPins_.split(',').map(function(p){ var t=p.split(':'); return {si:+t[0],fret:+t[1]}; });
          loPairs.forEach(function(lo) {
            hiPairs.forEach(function(hi) {
              if (Math.abs(lo.si - hi.si) <= 3)
                ipairSegs.push(lo.si + ':' + lo.fret + ':' + hi.si + ':' + hi.fret + ':' + semis);
            });
          });
        }
        return true;
      };

      // Previous interval (already played) then next interval (upcoming).
      pushInterval(queueIdx - 1 >= 0 ? phaseQueue[queueIdx - 1] : null);
      const nextTask = queueIdx + 1 < phaseQueue.length ? phaseQueue[queueIdx + 1] : null;
      const nextSame = pushInterval(nextTask);

      if (shapeCsv.length)  url += '&shape=' + encodeURIComponent(shapeCsv.join(','));
      if (ipairSegs.length) url += '&ipair=' + encodeURIComponent(ipairSegs.join('|'));

      // If the next task begins a different segment, still preview it as a dot.
      if (nextTask && !nextSame) {
        const previewPins = getPinsForTarget(nextTask.currentNote.name, nextTask.currentNote.octave, fMin, fMax);
        if (previewPins) url += '&preview=' + encodeURIComponent(previewPins);
      }
    } else if (queueIdx + 1 < phaseQueue.length) {
      const nextTask    = phaseQueue[queueIdx + 1];
      const previewPins = getPinsForTarget(nextTask.currentNote.name, nextTask.currentNote.octave, fMin, fMax);
      if (previewPins) url += '&preview=' + encodeURIComponent(previewPins);
    }
  }
  if (showGhost) url += '&ghost=' + encodeURIComponent(GHOST_CSV);
  try {
    const res  = await fetch(url);
    const data = await res.json();
    document.getElementById('fretboard-container').innerHTML = data.svg;
  } catch (e) { console.error(e); }
}
