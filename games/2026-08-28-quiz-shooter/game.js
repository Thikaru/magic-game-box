(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 4;
  const LANE_W = W / LANES;
  const QUESTION_Y = 46;
  const START_Y = 74;
  const LOSE_LINE_Y = H - 90;
  const TARGET_R = 26;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const levelLabel = document.getElementById('levelLabel');

  let state = 'intro'; // intro | playing | transition | gameover
  let score = 0, combo = 0, lives = 3, level = 1, correctCount = 0;
  let targets = [];
  let particles = [];
  let questionText = '';
  let roundBonus = false;
  let lastType = null;
  let transitionTimer = 0;
  let lastTs = 0;
  let rafId = null;

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq, dur, type, vol, delay) {
    const ac = ensureAudio();
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playCorrect() { beep(660, 0.1, 'sine', 0.2); beep(880, 0.14, 'sine', 0.18, 0.06); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(880, 0.1, 'sine', 0.2, 0.06); beep(1100, 0.14, 'sine', 0.2, 0.12); }
  function playWrong() { beep(200, 0.16, 'sawtooth', 0.18); }
  function playMiss() { beep(140, 0.26, 'sawtooth', 0.2); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }
  function playNewRound() { beep(520, 0.06, 'triangle', 0.12); }

  function laneCenterX(lane) { return LANE_W * lane + LANE_W / 2; }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; correctCount = 0;
    targets = []; particles = []; roundBonus = false; lastType = null;
    transitionTimer = 0;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    levelLabel.textContent = 'LV ' + level;
  }

  function multiplier() { return 1 + Math.floor(combo / 5) * 0.5; }

  function fallDuration() {
    const base = Math.max(1.35, 3.3 - level * 0.16);
    return roundBonus ? base + 1.0 : base;
  }

  function genDistractors(correct, count, spread, minVal) {
    const set = new Set([correct]);
    const found = [];
    let tries = 0;
    while (found.length < count && tries < 60) {
      tries++;
      const delta = (Math.floor(Math.random() * spread) + 1) * (Math.random() < 0.5 ? -1 : 1);
      const cand = correct + delta;
      if (cand < minVal) continue;
      if (set.has(cand)) continue;
      set.add(cand); found.push(cand);
    }
    let extra = correct + spread + 1;
    while (found.length < count) {
      if (!set.has(extra)) { set.add(extra); found.push(extra); }
      extra++;
    }
    return found;
  }

  function buildKeisan() {
    const useSub = level >= 2 && Math.random() < 0.45;
    const range = Math.min(9 + level * 3, 40);
    let a, b, correct, text;
    if (useSub) {
      a = 2 + Math.floor(Math.random() * range);
      b = Math.floor(Math.random() * (a + 1));
      correct = a - b;
      text = `${a} − ${b} = ?`;
    } else {
      a = 1 + Math.floor(Math.random() * range);
      b = 1 + Math.floor(Math.random() * range);
      correct = a + b;
      text = `${a} + ${b} = ?`;
    }
    const spread = Math.max(2, Math.min(6, 2 + Math.floor(level / 2)));
    const wrongs = genDistractors(correct, 3, spread, 0);
    return { text, correct, values: [correct, ...wrongs], points: 100 };
  }

  function buildHikaku() {
    const wantMax = Math.random() < 0.5;
    const range = Math.min(20 + level * 8, 200);
    const set = new Set();
    while (set.size < 4) set.add(1 + Math.floor(Math.random() * range));
    const values = Array.from(set);
    const correct = wantMax ? Math.max(...values) : Math.min(...values);
    const text = wantMax ? 'いちばん大きい数はどれ?' : 'いちばん小さい数はどれ?';
    return { text, correct, values, points: 90 };
  }

  function newRound() {
    state = 'playing';
    roundBonus = combo > 0 && combo % 5 === 0;
    let type = Math.random() < 0.6 ? 'keisan' : 'hikaku';
    if (type === lastType) type = type === 'keisan' ? 'hikaku' : 'keisan';
    lastType = type;
    const q = type === 'keisan' ? buildKeisan() : buildHikaku();
    questionText = (roundBonus ? '🌟ボーナス問題🌟 ' : '') + q.text;

    const lanes = [0, 1, 2, 3];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const vy = (LOSE_LINE_Y - START_Y) / fallDuration();
    targets = q.values.map((v, idx) => ({
      lane: lanes[idx],
      x: laneCenterX(lanes[idx]),
      y: START_Y,
      r: TARGET_R,
      value: v,
      correct: v === q.correct,
      points: q.points,
    }));
    playNewRound();
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.4, maxLife: 0.4, color });
    }
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(correctCount / 4) + 1;
    if (newLevel !== level) level = newLevel;
  }

  function endRound(nextDelay) {
    state = 'transition';
    transitionTimer = nextDelay;
  }

  function hitCorrect(target) {
    const bonusPts = target.y < LOSE_LINE_Y * 0.55 ? 30 : 0;
    const mult = roundBonus ? 2 : multiplier();
    score += Math.round((target.points + bonusPts) * mult);
    combo++;
    correctCount++;
    if (roundBonus) playGold(); else playCorrect();
    spawnParticles(target.x, target.y, '#7dffb3');
    updateHud();
    maybeLevelUp();
    targets = [];
    endRound(0.35);
  }

  function hitWrong(i) {
    const target = targets[i];
    targets.splice(i, 1);
    lives--;
    combo = 0;
    playWrong();
    spawnParticles(target.x, target.y, '#ff5d6c');
    updateHud();
    if (lives <= 0) endGame();
  }

  function missCorrect() {
    lives--;
    combo = 0;
    playMiss();
    updateHud();
    targets = [];
    if (lives <= 0) { endGame(); return; }
    endRound(0.4);
  }

  function endGame() {
    state = 'gameover';
    targets = [];
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${score} / レベル ${level} まで到達!`;
    resultEl.classList.remove('hidden');
  }

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height),
    };
  }

  function tryShootAt(px, py) {
    if (state !== 'playing') return;
    let bestI = -1, bestDist = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const dist = Math.hypot(px - t.x, py - t.y);
      if (dist <= t.r + 8 && dist < bestDist) { bestDist = dist; bestI = i; }
    }
    if (bestI < 0) return;
    const t = targets[bestI];
    if (t.correct) hitCorrect(t); else hitWrong(bestI);
  }

  function shootLane(lane) {
    if (state !== 'playing') return;
    const i = targets.findIndex(t => t.lane === lane);
    if (i < 0) return;
    const t = targets[i];
    if (t.correct) hitCorrect(t); else hitWrong(i);
  }

  canvas.addEventListener('mousedown', e => {
    const p = canvasPoint(e.clientX, e.clientY);
    tryShootAt(p.x, p.y);
  });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = canvasPoint(t.clientX, t.clientY);
      tryShootAt(p.x, p.y);
    }
  }, { passive: false });

  const LANE_KEYS = { '1': 0, '2': 1, '3': 2, '4': 3 };
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key in LANE_KEYS) { e.preventDefault(); shootLane(LANE_KEYS[e.key]); }
  });

  function update(dt) {
    if (state === 'transition') {
      transitionTimer -= dt;
      if (transitionTimer <= 0) newRound();
      return;
    }
    if (state !== 'playing') return;

    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      t.y += (LOSE_LINE_Y - START_Y) / fallDuration() * dt;
      if (t.y + t.r >= LOSE_LINE_Y) {
        if (t.correct) {
          missCorrect();
          return;
        } else {
          targets.splice(i, 1);
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawTarget(t) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fillStyle = roundBonus ? '#ffd23f' : '#4de3ff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.stroke();
    ctx.fillStyle = roundBonus ? '#5a4400' : '#0a1020';
    ctx.font = 'bold 17px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(t.value), t.x, t.y + 1);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(LANE_W * i, START_Y - 20);
      ctx.lineTo(LANE_W * i, H);
      ctx.stroke();
    }

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, LOSE_LINE_Y);
    ctx.lineTo(W, LOSE_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = roundBonus ? 'rgba(255,210,63,.16)' : 'rgba(125,255,179,.08)';
    ctx.fillRect(0, 0, W, START_Y - 10);
    ctx.fillStyle = roundBonus ? '#ffd23f' : '#f5f7ff';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (questionText) {
      const words = questionText;
      ctx.fillText(words, W / 2, QUESTION_Y, W - 20);
    }

    for (const t of targets) drawTarget(t);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    reset();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    lastTs = 0;
    playStart();
    newRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  draw();
  rafId = requestAnimationFrame(loop);
})();
