(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 3;
  const LANE_W = W / LANES;
  const JUDGE_Y = H * 0.8;
  const TRAVEL_MS = 1500;
  const SPEED = JUDGE_Y / TRAVEL_MS; // px per ms

  const PERFECT_WINDOW = 90;
  const GOOD_WINDOW = 190;
  const RELEASE_GRACE = 90; // ms before hold end that counts as success point

  const introOverlay = document.getElementById('introOverlay');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const heartsEl = document.getElementById('hearts');
  const scoreEl = document.getElementById('scoreLabel');
  const stageEl = document.getElementById('stageLabel');
  const comboEl = document.getElementById('comboLabel');
  const laneBtns = Array.from(document.querySelectorAll('.laneBtn'));

  const LANE_COLORS = ['#ff6fae', '#4ecbff', '#ffd23f'];

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

  function playClick(when) { playTone(880, 0.045, 'square', 0.12, when); }
  function playHit(judge) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    if (judge === 'PERFECT') playTone(1320, 0.12, 'triangle', 0.22, t);
    else playTone(660, 0.12, 'triangle', 0.18, t);
  }
  function playMiss() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(160, 0.22, 'sawtooth', 0.18, t);
  }
  function playStageClear() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.18, 'triangle', 0.2, t + i * 0.09));
  }
  function playGameOver() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [440, 392, 349, 294].forEach((f, i) => playTone(f, 0.28, 'sawtooth', 0.16, t + i * 0.14));
  }

  const STAGE_COUNT = 3;
  const BASE_BPM = 100;
  const BPM_STEP = 16;
  const NOTES_PER_STAGE = 48;
  const LEAD_BEATS = 4;

  let state = 'intro'; // intro | playing | stageClear | gameOver | allClear
  let stageIndex = 0;
  let notes = [];
  let stageStartAudioTime = 0;
  let stageDurationMs = 0;
  let hearts = 3;
  let score = 0;
  let combo = 0;
  let holdState = [null, null, null]; // per-lane currently-held note ref
  let laneFlash = [0, 0, 0]; // frames of button flash
  let floatTexts = []; // {lane, text, color, t}
  let rafId = null;
  let stageTransitionTimer = 0;

  function buildStage(idx) {
    const bpm = BASE_BPM + idx * BPM_STEP;
    const beatMs = 60000 / bpm;
    const arr = [];
    let lastLane = -1;
    let prevWasHold = false;
    for (let i = 0; i < NOTES_PER_STAGE; i++) {
      let lane;
      // A hold note's tail can reach past the next beat, so the note right after
      // one must never share its lane (the player couldn't hit both in time).
      do { lane = Math.floor(Math.random() * LANES); } while (lane === lastLane && (prevWasHold || Math.random() < 0.7));
      lastLane = lane;
      const time = (LEAD_BEATS + i) * beatMs;
      const isHold = Math.random() < 0.28 && i < NOTES_PER_STAGE - 1;
      const dur = isHold ? beatMs * (Math.random() < 0.5 ? 1 : 1.5) : 0;
      arr.push({
        time, lane, type: isHold ? 'hold' : 'tap', dur,
        judged: false, holding: false, holdTier: null, missed: false
      });
      prevWasHold = isHold;
    }
    const last = arr[arr.length - 1];
    stageDurationMs = last.time + (last.dur || 0) + beatMs * 2;
    return arr;
  }

  function scheduleMetronome(bpm) {
    const beatMs = 60000 / bpm;
    const totalBeats = Math.ceil(stageDurationMs / beatMs) + 1;
    for (let i = 0; i < totalBeats; i++) {
      playClick(stageStartAudioTime + (i * beatMs) / 1000);
    }
  }

  function startStage(idx) {
    stageIndex = idx;
    notes = buildStage(idx);
    const bpm = BASE_BPM + idx * BPM_STEP;
    stageStartAudioTime = audioCtx.currentTime + 0.15;
    scheduleMetronome(bpm);
    holdState = [null, null, null];
    stageEl.textContent = `STAGE ${idx + 1}/${STAGE_COUNT}`;
    state = 'playing';
  }

  function elapsedMs() {
    return (audioCtx.currentTime - stageStartAudioTime) * 1000;
  }

  function addFloat(lane, text, color) {
    floatTexts.push({ lane, text, color, t: 0 });
  }

  function flashLane(lane) {
    laneFlash[lane] = 10;
  }

  function judgeTapPress(lane) {
    const el = elapsedMs();
    let target = null;
    let bestDiff = Infinity;
    for (const n of notes) {
      if (n.judged || n.holding || n.lane !== lane) continue;
      const diff = Math.abs(el - n.time);
      if (diff < bestDiff && diff <= GOOD_WINDOW) { bestDiff = diff; target = n; }
    }
    if (!target) return;
    if (target.type === 'tap') {
      finalizeNote(target, bestDiff <= PERFECT_WINDOW ? 'PERFECT' : 'GOOD');
    } else {
      target.holding = true;
      target.holdTier = bestDiff <= PERFECT_WINDOW ? 'PERFECT' : 'GOOD';
      holdState[lane] = target;
    }
  }

  function judgeLaneRelease(lane) {
    const held = holdState[lane];
    if (!held) return;
    const el = elapsedMs();
    const graceTime = held.time + held.dur - RELEASE_GRACE;
    if (el < graceTime) {
      held.holding = false;
      finalizeNote(held, 'MISS');
    }
    holdState[lane] = null;
  }

  function checkHoldCompletion() {
    for (let lane = 0; lane < LANES; lane++) {
      const n = holdState[lane];
      if (!n || n.judged) continue;
      const graceTime = n.time + n.dur - RELEASE_GRACE;
      if (elapsedMs() >= graceTime) {
        n.holding = false;
        finalizeNote(n, n.holdTier);
        holdState[lane] = null;
      }
    }
  }

  function finalizeNote(n, judge) {
    n.judged = true;
    n.missed = judge === 'MISS';
    if (judge === 'MISS') {
      combo = 0;
      hearts = Math.max(0, hearts - 1);
      playMiss();
      addFloat(n.lane, 'MISS', '#e6533f');
    } else {
      const tier = n.type === 'hold' ? (n.holdTier || judge) : judge;
      combo++;
      const mult = Math.min(4, 1 + Math.floor(combo / 8));
      const base = tier === 'PERFECT' ? 100 : 50;
      score += base * mult;
      playHit(tier);
      addFloat(n.lane, tier, tier === 'PERFECT' ? '#4ce07a' : '#4a90e2');
    }
    flashLane(n.lane);
    updateHud();
    if (hearts <= 0) {
      endGame(false);
    }
  }

  function updateHud() {
    heartsEl.textContent = '♥'.repeat(hearts) + '♡'.repeat(3 - hearts);
    scoreEl.textContent = 'SCORE ' + score;
    comboEl.textContent = combo >= 2 ? combo + ' COMBO!' : '';
  }

  function endGame(cleared) {
    state = cleared ? 'allClear' : 'gameOver';
    cancelAnimationFrame(rafId);
    if (cleared) {
      playStageClear();
      resultTitle.textContent = 'ALL CLEAR!';
      resultText.textContent = `全3ステージクリア!スコア ${score} でした。`;
    } else {
      playGameOver();
      resultTitle.textContent = 'GAME OVER';
      resultText.textContent = `STAGE ${stageIndex + 1} で力尽きた…スコア ${score}`;
    }
    resultOverlay.classList.remove('hidden');
  }

  function handleLaneDown(lane) {
    if (state !== 'playing') return;
    ensureAudio();
    judgeTapPress(lane);
  }
  function handleLaneUp(lane) {
    if (state !== 'playing') return;
    judgeLaneRelease(lane);
  }

  const KEY_MAP = { KeyA: 0, ArrowLeft: 0, KeyS: 1, ArrowDown: 1, KeyD: 2, ArrowRight: 2 };
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
    handleLaneUp(lane);
  });

  window.addEventListener('blur', () => {
    Object.keys(keyHeld).forEach((k) => { keyHeld[k] = false; });
    for (let lane = 0; lane < LANES; lane++) handleLaneUp(lane);
    laneBtns.forEach((b) => b.classList.remove('active'));
  });

  laneBtns.forEach((btn) => {
    const lane = Number(btn.dataset.lane);
    const down = (e) => { e.preventDefault(); btn.classList.add('active'); handleLaneDown(lane); };
    const up = (e) => { e.preventDefault(); btn.classList.remove('active'); handleLaneUp(lane); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', (e) => { if (btn.classList.contains('active')) up(e); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function drawBackground() {
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LANE_W, 0);
      ctx.lineTo(i * LANE_W, H);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f4c430';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, JUDGE_Y);
    ctx.lineTo(W, JUDGE_Y);
    ctx.stroke();
    for (let l = 0; l < LANES; l++) {
      if (laneFlash[l] > 0) {
        ctx.fillStyle = `rgba(244,196,48,${laneFlash[l] / 10 * 0.35})`;
        ctx.fillRect(l * LANE_W, 0, LANE_W, H);
        laneFlash[l]--;
      }
    }
  }

  function drawNotes() {
    const el = elapsedMs();
    for (const n of notes) {
      const cx = n.lane * LANE_W + LANE_W / 2;
      if (n.type === 'tap') {
        if (n.judged) continue;
        const y = JUDGE_Y - (n.time - el) * SPEED;
        if (y < -20 || y > H + 20) continue;
        ctx.beginPath();
        ctx.arc(cx, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        if (n.judged && !n.holding) continue;
        const headY = JUDGE_Y - (n.time - el) * SPEED;
        const tailY = JUDGE_Y - (n.time + n.dur - el) * SPEED;
        const top = Math.min(headY, tailY);
        const bottom = Math.max(headY, tailY);
        if (bottom < -20 || top > H + 20) continue;
        ctx.fillStyle = n.holding ? '#fff2a8' : LANE_COLORS[n.lane];
        ctx.globalAlpha = n.holding ? 1 : 0.85;
        const rw = 22;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(cx - rw / 2, top, rw, Math.max(bottom - top, 6), 8) :
          ctx.rect(cx - rw / 2, top, rw, Math.max(bottom - top, 6));
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    floatTexts.forEach((f) => {
      const cx = f.lane * LANE_W + LANE_W / 2;
      const y = JUDGE_Y - 30 - f.t * 1.4;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 30);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, cx, y);
      ctx.globalAlpha = 1;
      f.t++;
    });
    floatTexts = floatTexts.filter((f) => f.t < 30);
  }

  function checkAutoMiss() {
    const el = elapsedMs();
    for (const n of notes) {
      if (n.judged || n.holding) continue;
      if (el - n.time > GOOD_WINDOW) finalizeNote(n, 'MISS');
    }
  }

  function checkStageEnd() {
    if (state !== 'playing') return;
    const el = elapsedMs();
    if (el > stageDurationMs && notes.every((n) => n.judged)) {
      if (stageIndex + 1 >= STAGE_COUNT) {
        endGame(true);
      } else {
        state = 'stageClear';
        stageTransitionTimer = 60;
      }
    }
  }

  function loop() {
    drawBackground();
    if (state === 'playing') {
      checkHoldCompletion();
      checkAutoMiss();
      drawNotes();
      checkStageEnd();
    } else if (state === 'stageClear') {
      stageTransitionTimer--;
      ctx.fillStyle = '#f4c430';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`STAGE ${stageIndex + 1} CLEAR!`, W / 2, H / 2);
      if (stageTransitionTimer <= 0) {
        startStage(stageIndex + 1);
      }
    }
    drawFloats();
    if (state === 'playing' || state === 'stageClear') {
      rafId = requestAnimationFrame(loop);
    }
  }

  function resetGameState() {
    hearts = 3;
    score = 0;
    combo = 0;
    floatTexts = [];
    laneFlash = [0, 0, 0];
    updateHud();
  }

  function beginRun() {
    ensureAudio();
    resetGameState();
    introOverlay.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    startStage(0);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', beginRun);
  retryBtn.addEventListener('click', beginRun);

  updateHud();
  drawBackground();
})();
