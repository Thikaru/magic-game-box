(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 2;
  const LANE_W = W / LANES;
  const JUDGE_Y = H * 0.82;
  const TRAVEL_MS = 1300;
  const SPEED = JUDGE_Y / TRAVEL_MS; // px per ms
  const LOOKAHEAD_MS = 4200;
  const TIER_HITS = 6;

  const introOverlay = document.getElementById('introOverlay');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const heartsEl = document.getElementById('hearts');
  const scoreEl = document.getElementById('scoreLabel');
  const lvEl = document.getElementById('lvLabel');
  const comboEl = document.getElementById('comboLabel');
  const laneBtns = Array.from(document.querySelectorAll('.laneBtn'));

  const LANE_COLORS = ['#ff6fae', '#4ecbff'];
  const LANE_FREQ = [220, 440]; // low tone for left, high tone for right

  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, dur, type, gain, when) {
    if (!audioCtx) return;
    const t = when != null ? when : audioCtx.currentTime;
    if (t < audioCtx.currentTime - 0.01) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function scheduleClick(lane, when) {
    playTone(LANE_FREQ[lane], 0.05, 'square', 0.09, when);
  }
  function playHit(lane, judge) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(LANE_FREQ[lane] * (judge === 'PERFECT' ? 3 : 2), 0.12, 'triangle', 0.2, t);
  }
  function playGold() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [880, 1174].forEach((f, i) => playTone(f, 0.14, 'triangle', 0.2, t + i * 0.05));
  }
  function playSync() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(LANE_FREQ[0] * 2, 0.2, 'sine', 0.18, t);
    playTone(LANE_FREQ[1] * 2, 0.2, 'sine', 0.18, t);
  }
  function playMiss() {
    if (!audioCtx) return;
    playTone(150, 0.22, 'sawtooth', 0.16, audioCtx.currentTime);
  }
  function playGameOver() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [440, 392, 349, 294].forEach((f, i) => playTone(f, 0.28, 'sawtooth', 0.15, t + i * 0.14));
  }

  let state = 'intro'; // intro | playing | gameOver
  let runStartAudioTime = 0;
  let hearts = 3;
  let score = 0;
  let combo = 0;
  let totalHits = 0;
  let notes = [];
  let cycleFrontier = 0;
  let cycleCounter = 0;
  let syncMap = {};
  let laneFlash = [0, 0];
  let floatTexts = [];
  let rafId = null;

  function elapsedMs() {
    return (audioCtx.currentTime - runStartAudioTime) * 1000;
  }

  function currentTier() {
    return Math.floor(totalHits / TIER_HITS);
  }

  function generateCycleIfNeeded() {
    const horizon = elapsedMs() + LOOKAHEAD_MS;
    while (cycleFrontier < horizon) {
      const tier = currentTier();
      const factor = Math.max(0.5, 1 - tier * 0.05);
      const cycle = Math.max(900, 1800 * factor);
      const perfectWin = Math.max(60, 80 - tier * 3);
      const goodWin = Math.max(130, 180 - tier * 6);
      const syncId = cycleCounter++;
      const start = cycleFrontier;

      // Left plays 3 notes per cycle, right plays 2 — a genuine 3:2 polyrhythm.
      for (let i = 0; i < 3; i++) {
        addNote(0, start + (i * cycle) / 3, i === 0 ? syncId : null, perfectWin, goodWin);
      }
      for (let j = 0; j < 2; j++) {
        addNote(1, start + (j * cycle) / 2, j === 0 ? syncId : null, perfectWin, goodWin);
      }
      cycleFrontier += cycle;
    }
  }

  function addNote(lane, time, syncId, perfectWin, goodWin) {
    const golden = Math.random() < 0.09;
    const note = {
      lane, time, syncId, perfectWin, goodWin, golden,
      judged: false, missed: false
    };
    notes.push(note);
    scheduleClick(lane, runStartAudioTime + time / 1000);
  }

  function addFloat(x, text, color) {
    floatTexts.push({ x, text, color, t: 0 });
  }

  function flashLane(lane) {
    laneFlash[lane] = 10;
  }

  function resolveSync(note, success) {
    if (note.syncId == null) return;
    const entry = syncMap[note.syncId] || {};
    entry[note.lane] = success;
    syncMap[note.syncId] = entry;
    if (entry[0] !== undefined && entry[1] !== undefined) {
      if (entry[0] && entry[1]) {
        const mult = Math.min(4, 1 + Math.floor(combo / 10));
        score += 150 * mult;
        addFloat(W / 2, 'シンクロ!', '#ffe066');
        playSync();
        updateHud();
      }
      delete syncMap[note.syncId];
    }
  }

  function finalizeNote(note, judge) {
    note.judged = true;
    note.missed = judge === 'MISS';
    const cx = note.lane * LANE_W + LANE_W / 2;
    if (judge === 'MISS') {
      combo = 0;
      hearts = Math.max(0, hearts - 1);
      playMiss();
      addFloat(cx, 'MISS', '#e6533f');
      resolveSync(note, false);
    } else {
      combo++;
      totalHits++;
      const mult = Math.min(4, 1 + Math.floor(combo / 10));
      let base = judge === 'PERFECT' ? 100 : 50;
      if (note.golden) {
        base += 100;
        hearts = Math.min(3, hearts + 1);
        playGold();
        addFloat(cx, '★+HEAL', '#f4c430');
      } else {
        playHit(note.lane, judge);
        addFloat(cx, judge, judge === 'PERFECT' ? '#4ce07a' : '#4a90e2');
      }
      score += base * mult;
      resolveSync(note, true);
    }
    flashLane(note.lane);
    updateHud();
    if (hearts <= 0) endGame();
  }

  function updateHud() {
    heartsEl.textContent = '♥'.repeat(hearts) + '♡'.repeat(3 - hearts);
    scoreEl.textContent = 'SCORE ' + score;
    lvEl.textContent = 'Lv.' + (currentTier() + 1);
    comboEl.textContent = combo >= 3 ? combo + ' COMBO!' : '';
  }

  function judgeLanePress(lane) {
    const el = elapsedMs();
    let target = null;
    let bestDiff = Infinity;
    for (const n of notes) {
      if (n.judged || n.lane !== lane) continue;
      const diff = Math.abs(el - n.time);
      if (diff < bestDiff && diff <= n.goodWin) { bestDiff = diff; target = n; }
    }
    if (!target) return;
    finalizeNote(target, bestDiff <= target.perfectWin ? 'PERFECT' : 'GOOD');
  }

  function checkAutoMiss() {
    const el = elapsedMs();
    for (const n of notes) {
      if (n.judged) continue;
      if (el - n.time > n.goodWin) finalizeNote(n, 'MISS');
    }
  }

  function pruneNotes() {
    if (notes.length > 40) {
      notes = notes.filter((n) => !n.judged || elapsedMs() - n.time < 1500);
    }
  }

  function endGame() {
    state = 'gameOver';
    cancelAnimationFrame(rafId);
    playGameOver();
    resultTitle.textContent = 'GAME OVER';
    resultText.textContent = `Lv.${currentTier() + 1} で力尽きた…スコア ${score}`;
    resultOverlay.classList.remove('hidden');
  }

  function handleLaneDown(lane) {
    if (state !== 'playing') return;
    judgeLanePress(lane);
  }

  const KEY_MAP = { KeyF: 0, ArrowLeft: 0, KeyJ: 1, ArrowRight: 1 };
  const keyHeld = {};
  window.addEventListener('keydown', (e) => {
    const lane = KEY_MAP[e.code];
    if (lane === undefined) return;
    e.preventDefault();
    if (keyHeld[e.code]) return;
    keyHeld[e.code] = true;
    handleLaneDown(lane);
  });
  window.addEventListener('keyup', (e) => {
    const lane = KEY_MAP[e.code];
    if (lane === undefined) return;
    keyHeld[e.code] = false;
  });
  window.addEventListener('blur', () => {
    Object.keys(keyHeld).forEach((k) => { keyHeld[k] = false; });
    laneBtns.forEach((b) => b.classList.remove('active'));
  });

  laneBtns.forEach((btn) => {
    const lane = Number(btn.dataset.lane);
    const down = (e) => {
      e.preventDefault();
      btn.classList.add('active');
      handleLaneDown(lane);
    };
    const up = (e) => { e.preventDefault(); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', (e) => { if (btn.classList.contains('active')) up(e); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function drawBackground() {
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LANE_W, 0);
    ctx.lineTo(LANE_W, H);
    ctx.stroke();
    ctx.strokeStyle = '#f4c430';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, JUDGE_Y);
    ctx.lineTo(W, JUDGE_Y);
    ctx.stroke();
    for (let l = 0; l < LANES; l++) {
      if (laneFlash[l] > 0) {
        ctx.fillStyle = `rgba(244,196,48,${laneFlash[l] / 10 * 0.3})`;
        ctx.fillRect(l * LANE_W, 0, LANE_W, H);
        laneFlash[l]--;
      }
    }
  }

  function drawNotes() {
    const el = elapsedMs();
    const pulse = 0.6 + 0.4 * Math.sin(el / 90);
    for (const n of notes) {
      if (n.judged) continue;
      const cx = n.lane * LANE_W + LANE_W / 2;
      const y = JUDGE_Y - (n.time - el) * SPEED;
      if (y < -24 || y > H + 24) continue;
      ctx.beginPath();
      ctx.arc(cx, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = n.golden ? '#f4c430' : LANE_COLORS[n.lane];
      ctx.fill();
      ctx.strokeStyle = n.syncId != null ? `rgba(255,255,255,${pulse})` : '#fff';
      ctx.lineWidth = n.syncId != null ? 4 : 2;
      ctx.stroke();
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    floatTexts.forEach((f) => {
      const y = JUDGE_Y - 30 - f.t * 1.4;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 30);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
      ctx.globalAlpha = 1;
      f.t++;
    });
    floatTexts = floatTexts.filter((f) => f.t < 30);
  }

  function loop() {
    drawBackground();
    if (state === 'playing') {
      generateCycleIfNeeded();
      checkAutoMiss();
      pruneNotes();
      drawNotes();
    }
    drawFloats();
    if (state === 'playing') rafId = requestAnimationFrame(loop);
  }

  function resetGameState() {
    hearts = 3;
    score = 0;
    combo = 0;
    totalHits = 0;
    notes = [];
    cycleFrontier = 0;
    cycleCounter = 0;
    syncMap = {};
    laneFlash = [0, 0];
    floatTexts = [];
    updateHud();
  }

  function beginRun() {
    ensureAudio();
    resetGameState();
    introOverlay.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    runStartAudioTime = audioCtx.currentTime + 0.15;
    state = 'playing';
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', beginRun);
  retryBtn.addEventListener('click', beginRun);

  updateHud();
  drawBackground();
})();
