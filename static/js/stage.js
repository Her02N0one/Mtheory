// stage.js — Event wiring, state transitions, and boot sequence.
// Depends on: theory.js, queue.js, render.js, audio.js

// -- Theory Primer -----------------------------------------------------------
function dismissPrimer() {
  document.getElementById('primer-overlay').classList.add('hidden');
}

// -- Per-phase teaching card -------------------------------------------------
// Chunked teaching: each phase may carry a `teach` HTML block, shown as a
// dismissible card when that phase begins (concept → do → concept → do).
function dismissPhaseTeach() {
  document.getElementById('teach-overlay').classList.add('hidden');
}
function maybeShowPhaseTeach() {
  const ph = PHASES[currentPhase];
  const overlay = document.getElementById('teach-overlay');
  if (!overlay) return;
  if (ph && ph.teach) {
    document.getElementById('teach-body').innerHTML = ph.teach;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// -- Jump to segment ----------------------------------------------------------
function jumpToSegment(targetSegId) {
  const idx = phaseQueue.findIndex(t => t.segmentId === targetSegId);
  if (idx === -1) return;
  locked = false; waitingCorrect = false;
  queueIdx = idx;
  const task = currentTask();
  if (!task) return;
  if (task.kind === 'recall') {
    renderRecall(task);
    if (task.mode === 'name_fret') showRecallFretboard(task);
    renderPhaseUI();
    updateProgress();
    renderQueueStrip();
    return;
  }
  renderTarget(task);
  showFretboard(task);
  renderPhaseUI();
  updateProgress();
  renderQueueStrip();
  renderTheoryPanel(task);
  updateHearProgBtn();
}

// -- Next question ------------------------------------------------------------
function nextNote() {
  locked = false; waitingCorrect = false;

  if (queueIdx >= phaseQueue.length) {
    if (currentPhase < PHASES.length - 1) setTimeout(advancePhase, 400);
    else setTimeout(showCompletion, 400);
    return;
  }

  const task = currentTask();
  // Cooldown: ignore detections for 550 ms so a ringing string can't
  // immediately satisfy the next target.
  acceptAfter = Date.now() + 550;
  if (typeof resetLastNote === 'function') resetLastNote();

  if (task.kind === 'recall') {
    renderRecall(task);
    if (task.mode === 'name_fret') showRecallFretboard(task);
    renderPhaseUI();
    updateProgress();
    renderQueueStrip();
    return;
  }

  renderTarget(task);
  showFretboard(task);
  renderPhaseUI();
  updateProgress();
  renderQueueStrip();
  renderTheoryPanel(task);
  updateHearProgBtn();
}

// -- "Hear it" ----------------------------------------------------------------
function hearTarget() {
  const task = currentTask();
  if (task) playReferenceNote(task.currentNote.name, task.currentNote.octave);
}

// -- "Hear progression" (voice_lead and other chord-sequence phases) ----------
let _demoPlaying = false;

// Show the progression button only when the current phase is a chord sequence
// worth demonstrating (currently: voice_lead).  Generic by design — add other
// pattern names here to let them offer playback too.
function updateHearProgBtn() {
  const btn = document.getElementById('hear-prog-btn');
  if (!btn) return;
  const patterns = currentPatterns();
  const isProg = patterns.some(function(p) {
    const name = typeof p === 'string' ? p : (p.type || '');
    return name === 'voice_lead';
  });
  btn.hidden = !isProg;
}

// Play every chord of the current phase in sequence, strummed low→high,
// highlighting each chord shape on the fretboard as it strikes.  The mic is
// locked out during playback so a ringing note can't satisfy a target, and the
// current target's fretboard view is restored when the demo finishes.
function hearProgression() {
  if (_demoPlaying) return;

  // One representative task (the chord's first step) per chord segment, in order.
  const segs = [];
  const seen = {};
  phaseQueue.forEach(function(t) {
    if (t.kind === 'chord' && t.voicing && !seen[t.segmentId]) {
      seen[t.segmentId] = true;
      segs.push(t);
    }
  });
  if (!segs.length) return;

  const btn       = document.getElementById('hear-prog-btn');
  const wasLocked = locked;
  _demoPlaying = true;
  locked       = true;                       // freeze mic-driven advancement
  if (btn) btn.disabled = true;

  const voicings = segs.map(function(t) { return t.voicing; });
  const totalMs  = playProgression(voicings, {
    strumMs:    30,
    chordGapMs: 550,
    onChord:    function(idx) { showFretboard(segs[idx]); },   // light each chord as it lands
  });

  setTimeout(function() {
    _demoPlaying = false;
    locked       = wasLocked;
    if (btn) btn.disabled = false;
    const cur = currentTask();
    if (cur) showFretboard(cur);             // restore the active target view
  }, totalMs + 400);
}

// -- Advance phase ------------------------------------------------------------
function advancePhase() {
  currentPhase++;
  queueIdx     = 0;
  prevMidi     = null;
  acceptAfter  = 0;
  phaseQueue   = buildQueueTasks(currentPatterns(), currentFretMin(), currentFretMax(), PHASES[currentPhase]);
  renderPhaseUI();
  updateProgress();
  const ph = PHASES[currentPhase];
  showPhaseToast('\u2746 Phase ' + (currentPhase + 1) + ': ' + ph.label);
  maybeShowPhaseTeach();
  locked = true;
  setTimeout(() => nextNote(), 600);
}

// -- Dev phase skip (testing only) --------------------------------------------
// Jump directly to any phase without satisfying the queue. Skips the teaching
// card so it's instant — reload the page to see teach cards in order.
function devPhase(delta) {
  const next = currentPhase + delta;
  if (next < 0 || next >= PHASES.length) return;
  currentPhase   = next;
  queueIdx       = 0;
  prevMidi       = null;
  acceptAfter    = 0;
  locked         = false;
  waitingCorrect = false;
  dismissPhaseTeach();
  phaseQueue = buildQueueTasks(currentPatterns(), currentFretMin(), currentFretMax(), PHASES[currentPhase]);
  renderPhaseUI();
  updateProgress();
  renderQueueStrip();
  nextNote();
}

// -- Answer detection ---------------------------------------------------------
function onNoteDetected(noteInfo) {
  if (locked) return;
  const _curTask = currentTask();
  if (_curTask && _curTask.kind === 'recall') return;  // recall is button-driven

  const shapeEl = document.getElementById('note-shape-display');
  shapeEl.className = 'note-shape-display ' + noteInfo.shape;
  shapeEl.style.backgroundColor = noteInfo.color;
  document.getElementById('detected-name').textContent = noteInfo.noteName;

  const cents = noteInfo.centsOff || 0;
  const badge = document.getElementById('intonation-badge');
  if      (Math.abs(cents) <= 5)  { badge.textContent = '\u25c6 in tune'; badge.className = 'intonation-badge tune-good'; }
  else if (Math.abs(cents) <= 15) { badge.textContent = (cents > 0 ? '+' : '') + cents + '\u00a2'; badge.className = 'intonation-badge tune-close'; }
  else                            { badge.textContent = (cents > 0 ? '+' : '') + cents + '\u00a2 ' + (cents > 0 ? 'sharp' : 'flat'); badge.className = 'intonation-badge tune-off'; }

  if (Date.now() < acceptAfter) return;

  const task           = currentTask();
  const target         = task.currentNote;
  const fb             = document.getElementById('snc-feedback');
  const detectedOctave = Math.floor(noteInfo.midi / 12) - 1;

  if (noteInfo.noteName === target.name && detectedOctave === target.octave) {
    if (!waitingCorrect) totalCorrect++;
    queueIdx++;
    waitingCorrect = false;
    locked         = true;
    fb.textContent = '\u2713 Nice!';
    fb.className   = 'snc-feedback fb-correct';
    updateProgress();
    setTimeout(nextNote, 400);
  } else if (noteInfo.noteName === target.name && detectedOctave !== target.octave) {
    // Right pitch class, wrong octave — octave error forgiveness.
    // Show a warning but do NOT count as wrong or lock the user out.
    fb.textContent = '\u25b2 Right note \u2014 need ' + target.name + target.octave + ' (you played octave ' + detectedOctave + ')';
    fb.className   = 'snc-feedback fb-warn';
    // Do not set waitingCorrect or increment totalWrong — let them retry freely.
  } else {
    if (!waitingCorrect) { totalWrong++; waitingCorrect = true; }
    locked = true;
    fb.textContent = '\u2717  That\'s ' + noteInfo.noteName + detectedOctave + ' \u2014 find the ' + target.name + target.octave;
    fb.className   = 'snc-feedback fb-wrong';
    updateProgress();
    showFretboard(task);
    setTimeout(() => { locked = false; }, 600);
  }
}

// -- Recall answer (button task) ----------------------------------------------
function answerRecall(btnEl, choice) {
  if (locked) return;
  const task = currentTask();
  if (!task || task.kind !== 'recall') return;
  const fb = document.getElementById('snc-feedback');
  if (choice === task.answer) {
    totalCorrect++;
    queueIdx++;
    locked = true;
    if (btnEl) btnEl.classList.add('recall-correct');
    fb.textContent = '\u2713 ' + choice + ' \u2014 correct';
    fb.className   = 'snc-feedback fb-correct';
    updateProgress();
    setTimeout(nextNote, 650);
  } else {
    if (!task._missed) { totalWrong++; task._missed = true; }
    if (btnEl) { btnEl.classList.add('recall-wrong'); btnEl.disabled = true; }
    fb.textContent = '\u2717 Not ' + choice + ' \u2014 try again';
    fb.className   = 'snc-feedback fb-wrong';
    updateProgress();
  }
}

// -- Completion ---------------------------------------------------------------
function showCompletion() {
  const stars = totalWrong === 0 ? 3 : totalWrong <= 3 ? 2 : 1;
  saveStageProgress(stars);
  document.getElementById('completion-overlay').classList.remove('hidden');
  document.getElementById('comp-stars').textContent = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
  document.getElementById('comp-title').textContent = stars === 3 ? 'Perfect!' : stars === 2 ? 'Great job!' : 'Stage complete!';
  document.getElementById('comp-body').textContent  = totalCorrect + ' correct, ' + totalWrong + ' wrong.';
  document.querySelectorAll('.completion-actions a[id^="unlock-"]').forEach(a => a.removeAttribute('hidden'));
}

// -- Device picker ------------------------------------------------------------
async function populateDevices() {
  const sel = document.getElementById('device-select');
  const cur = sel.value;
  const inputs = await listAudioInputs();
  while (sel.options.length > 1) sel.remove(1);
  inputs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId; opt.text = d.label;
    if (d.deviceId === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}
populateDevices();

// -- Mic toggle ---------------------------------------------------------------
async function toggleListening() {
  const btn    = document.getElementById('listen-btn');
  const status = document.getElementById('mic-status');
  const device = document.getElementById('device-select').value || undefined;
  if (!listening) {
    btn.textContent = 'Connecting\u2026'; btn.disabled = true;
    const ok = await startListening(onNoteDetected, device);
    btn.disabled = false;
    if (ok) {
      listening = true;
      btn.textContent = 'Stop Listening'; btn.className = 'btn-secondary btn-large';
      status.textContent = 'Microphone active'; status.className = 'mic-status mic-active';
      populateDevices();
    } else {
      btn.textContent = 'Start Listening';
      status.textContent = 'Permission denied or device unavailable';
      status.className = 'mic-status mic-error';
    }
  } else {
    stopListening(); listening = false;
    btn.textContent = 'Start Listening'; btn.className = 'btn-primary btn-large';
    status.textContent = 'Microphone off'; status.className = 'mic-status';
  }
}

// -- Boot ---------------------------------------------------------------------
phaseQueue = buildQueueTasks(currentPatterns(), currentFretMin(), currentFretMax(), PHASES[0]);
renderPhaseUI();
updateProgress();
renderQueueStrip();
renderChromaticCircle(null, null);
nextNote();

// Fetch and show theory primer if this stage has one
if (STAGE.primer_url) {
  fetch(STAGE.primer_url)
    .then(r => r.ok ? r.text() : null)
    .then(html => {
      if (html && html.trim()) {
        document.getElementById('primer-body').innerHTML = html;
        document.getElementById('primer-overlay').classList.remove('hidden');
      }
    })
    .catch(() => { /* no primer — proceed silently */ });
} else {
  // No monolithic primer — lead with the first phase's teaching card instead.
  maybeShowPhaseTeach();
}
