(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 4;
  const LANE_W = W / LANES;
  const HIT_Y = H - 90;
  const NOTE_R = 20;

  const GAME_DURATION = 60000; // ms
  const END_GRACE = 1600; // wait for remaining notes to clear

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const timeLabel = document.getElementById('timeLabel');
  const laneBtns = Array.from(document.querySelectorAll('.lane-btn'));

  let state = 'intro'; // intro | playing | ending | result
  let rafId = null;
  let startTime = 0;
  let now = 0;
  let notes = [];
  let nextSpawnAt = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let flashes = []; // {lane, color, until}
  let popups = []; // {x, y, text, color, until}
  let lastLaneUsed = -1;

  function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

  function resetState() {
    notes = [];
    score = 0;
    combo = 0;
    maxCombo = 0;
    flashes = [];
    popups = [];
    nextSpawnAt = 500;
    lastLaneUsed = -1;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = String(score);
    comboLabel.textContent = String(combo);
    const remain = Math.max(0, Math.ceil((GAME_DURATION - now) / 1000));
    timeLabel.textContent = String(remain);
  }

  function pickLane() {
    let lane = Math.floor(Math.random() * LANES);
    let tries = 0;
    while (lane === lastLaneUsed && tries < 5) {
      lane = Math.floor(Math.random() * LANES);
      tries++;
    }
    lastLaneUsed = lane;
    return lane;
  }

  function spawnNote(t) {
    const progress = t / GAME_DURATION;
    const fallDuration = lerp(1500, 950, progress);
    const bombChance = lerp(0.12, 0.30, progress);
    const type = Math.random() < bombChance ? 'bomb' : 'normal';
    notes.push({
      lane: pickLane(),
      spawnTime: t,
      fallDuration,
      type,
      judged: false,
    });
  }

  function noteProgress(note, t) {
    return (t - note.spawnTime) / note.fallDuration; // 0 at spawn, 1 at hit line
  }

  function addPopup(lane, text, color) {
    popups.push({
      x: lane * LANE_W + LANE_W / 2,
      y: HIT_Y - 20,
      text, color,
      until: now + 500,
    });
  }

  function flashLane(lane, color) {
    flashes.push({ lane, color, until: now + 180 });
  }

  function judgeHit(lane) {
    if (state !== 'playing') return;
    // find nearest unjudged note in this lane within hittable window
    let best = null;
    let bestDist = Infinity;
    for (const n of notes) {
      if (n.lane !== lane || n.judged) continue;
      const p = noteProgress(n, now);
      if (p < 0.55 || p > 1.4) continue;
      const dist = Math.abs(p - 1);
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
    if (!best) {
      flashLane(lane, 'rgba(255,255,255,.25)');
      return;
    }
    best.judged = true;
    if (best.type === 'bomb') {
      score = Math.max(0, score - 80);
      combo = 0;
      addPopup(lane, 'あぶない!', '#ff4d6d');
      flashLane(lane, 'rgba(255,77,109,.55)');
    } else {
      if (bestDist <= 0.14) {
        score += 100;
        combo++;
        addPopup(lane, 'PERFECT', '#ffe14d');
      } else if (bestDist <= 0.32) {
        score += 50;
        combo++;
        addPopup(lane, 'GOOD', '#4de3ff');
      } else {
        combo = 0;
        addPopup(lane, 'MISS', '#9a8aa8');
      }
      flashLane(lane, 'rgba(77,227,255,.45)');
    }
    maxCombo = Math.max(maxCombo, combo);
    updateHud();
  }

  function loop(ts) {
    if (state === 'intro' || state === 'result') return;
    if (!startTime) startTime = ts;
    now = ts - startTime;

    if (state === 'playing') {
      while (now >= nextSpawnAt && now < GAME_DURATION) {
        spawnNote(nextSpawnAt);
        const progress = nextSpawnAt / GAME_DURATION;
        nextSpawnAt += lerp(700, 360, progress);
      }
      if (now >= GAME_DURATION) {
        state = 'ending';
      }
    }

    // auto-judge passed notes
    for (const n of notes) {
      if (n.judged) continue;
      const p = noteProgress(n, now);
      if (p > 1.4) {
        n.judged = true;
        if (n.type === 'normal') {
          combo = 0;
          addPopup(n.lane, 'MISS', '#9a8aa8');
        }
        // bomb passed safely = no penalty, no popup needed
      }
    }
    notes = notes.filter(n => !(n.judged && noteProgress(n, now) > 1.55));

    if (state === 'ending' && (notes.length === 0 || now >= GAME_DURATION + END_GRACE)) {
      finish();
      return;
    }

    updateHud();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(i * LANE_W, 0);
      ctx.lineTo(i * LANE_W, H);
      ctx.stroke();
    }

    // active flashes (lane background)
    flashes = flashes.filter(f => f.until > now);
    for (const f of flashes) {
      ctx.fillStyle = f.color;
      ctx.fillRect(f.lane * LANE_W, 0, LANE_W, H);
    }

    // hit line
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, HIT_Y);
    ctx.lineTo(W, HIT_Y);
    ctx.stroke();

    // notes
    for (const n of notes) {
      const p = noteProgress(n, now);
      if (p < -0.05 || p > 1.5) continue;
      const y = p * HIT_Y;
      const x = n.lane * LANE_W + LANE_W / 2;
      ctx.beginPath();
      if (n.type === 'bomb') {
        ctx.fillStyle = n.judged ? 'rgba(255,77,109,.25)' : '#ff4d6d';
        ctx.arc(x, y, NOTE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#160821';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y + 1);
      } else {
        ctx.fillStyle = n.judged ? 'rgba(77,227,255,.25)' : '#4de3ff';
        ctx.arc(x, y, NOTE_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // popups
    popups = popups.filter(p => p.until > now);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    for (const p of popups) {
      const remain = (p.until - now) / 500;
      ctx.globalAlpha = Math.max(0, remain);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - (1 - remain) * 20);
    }
    ctx.globalAlpha = 1;
  }

  function finish() {
    state = 'result';
    if (rafId) cancelAnimationFrame(rafId);
    let rank;
    if (score >= 5500) rank = 'S';
    else if (score >= 3800) rank = 'A';
    else if (score >= 2000) rank = 'B';
    else rank = 'C';
    resultTitleEl.textContent = `ランク ${rank}`;
    resultTextEl.innerHTML = `SCORE: ${score}<br>MAX COMBO: ${maxCombo}`;
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    resetState();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    state = 'playing';
    startTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  const keyToLane = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const lane = keyToLane[e.code];
    if (lane === undefined) return;
    e.preventDefault();
    judgeHit(lane);
    activateBtn(lane);
  });

  function activateBtn(lane) {
    const btn = laneBtns[lane];
    if (!btn) return;
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 120);
  }

  laneBtns.forEach((btn) => {
    const lane = Number(btn.dataset.lane);
    const handler = (e) => {
      e.preventDefault();
      judgeHit(lane);
      activateBtn(lane);
    };
    btn.addEventListener('pointerdown', handler);
  });

  // initial idle draw so canvas isn't blank behind the intro overlay
  draw();
})();
