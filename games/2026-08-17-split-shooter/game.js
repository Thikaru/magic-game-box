(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 5;
  const LANE_W = W / LANES;
  const LOSE_LINE_Y = H - 90;
  const SPAWN_GAP_Y = 120;

  const RADIUS = { large: 25, medium: 18, small: 12, gold: 15 };
  const POINTS = { large: 40, medium: 25, small: 12, gold: 150 };
  const COLORS = { large: '#ff5d6c', medium: '#ffa64d', small: '#4de3ff', gold: '#ffd23f' };

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, level = 1, kills = 0;
  let enemies = [];
  let particles = [];
  let spawnTimer = 0, spawnInterval = 900;
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
  function playHit(type) {
    if (type === 'large') beep(180, 0.16, 'sawtooth', 0.18);
    else if (type === 'medium') beep(320, 0.13, 'triangle', 0.18);
    else if (type === 'small') beep(560, 0.09, 'square', 0.14);
    else if (type === 'gold') { beep(660, 0.1, 'sine', 0.22); beep(990, 0.12, 'sine', 0.2, 0.06); }
  }
  function playSplit() { beep(240, 0.08, 'square', 0.1); beep(180, 0.08, 'square', 0.08, 0.05); }
  function playLifeLoss() { beep(140, 0.28, 'sawtooth', 0.22); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function laneCenterX(lane) { return LANE_W * lane + LANE_W / 2; }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; kills = 0;
    enemies = []; particles = []; spawnTimer = 0; spawnInterval = 900;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  function multiplier() { return 1 + Math.floor(combo / 8) * 0.5; }

  function pickLane() {
    const candidates = [];
    for (let i = 0; i < LANES; i++) {
      let topMost = Infinity;
      for (const en of enemies) if (en.lane === i) topMost = Math.min(topMost, en.y);
      if (topMost > SPAWN_GAP_Y) candidates.push(i);
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function rollType() {
    if (Math.random() < 0.08) return 'gold';
    const r = Math.random();
    const largeW = Math.min(0.36, 0.24 + level * 0.012);
    if (r < largeW) return 'large';
    if (r < largeW + 0.38) return 'medium';
    return 'small';
  }

  function vyFor(type) {
    const base = 42 + level * 7;
    const mult = { large: 0.7, medium: 0.95, small: 1.35, gold: 1.0 }[type];
    return base * mult + Math.random() * 10;
  }

  function trySpawn() {
    const lane = pickLane();
    if (lane == null) return;
    const type = rollType();
    enemies.push({ lane, x: laneCenterX(lane), y: -24, r: RADIUS[type], type, vy: vyFor(type) });
  }

  function childLanes(lane) {
    if (lane > 0 && lane < LANES - 1) return [lane - 1, lane + 1];
    if (lane === 0) return [1, 1];
    return [LANES - 2, LANES - 2];
  }

  function spawnChildren(parent, childType) {
    const lanes = childLanes(parent.lane);
    const y = Math.min(parent.y, LOSE_LINE_Y - 90);
    const vy = parent.vy * 1.18;
    const sameLane = lanes[0] === lanes[1];
    lanes.forEach((lane, idx) => {
      const offset = sameLane ? (idx === 0 ? -14 : 14) : 0;
      enemies.push({ lane, x: laneCenterX(lane) + offset, y, r: RADIUS[childType], type: childType, vy });
    });
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.4, maxLife: 0.4, color });
    }
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(kills / 8) + 1;
    if (newLevel !== level) {
      level = newLevel;
      spawnInterval = Math.max(360, 900 - level * 55);
    }
  }

  function killEnemy(i) {
    const en = enemies[i];
    enemies.splice(i, 1);
    score += Math.round(POINTS[en.type] * multiplier());
    combo++;
    kills++;
    updateHud();
    spawnParticles(en.x, en.y, COLORS[en.type]);
    playHit(en.type);
    if (en.type === 'large') { spawnChildren(en, 'medium'); playSplit(); }
    else if (en.type === 'medium') { spawnChildren(en, 'small'); playSplit(); }
    maybeLevelUp();
  }

  function loseLife() {
    lives--;
    combo = 0;
    updateHud();
    playLifeLoss();
    if (lives <= 0) endGame();
  }

  function endGame() {
    state = 'gameover';
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
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      const dist = Math.hypot(px - en.x, py - en.y);
      if (dist <= en.r + 8 && dist < bestDist) { bestDist = dist; bestI = i; }
    }
    if (bestI >= 0) killEnemy(bestI);
  }

  function shootLane(lane) {
    if (state !== 'playing') return;
    let bestI = -1, bestY = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      if (en.lane === lane && en.y > bestY) { bestY = en.y; bestI = i; }
    }
    if (bestI >= 0) killEnemy(bestI);
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

  const LANE_KEYS = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key in LANE_KEYS) { e.preventDefault(); shootLane(LANE_KEYS[e.key]); }
  });

  function update(dt) {
    spawnTimer += dt * 1000;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; trySpawn(); }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      en.y += en.vy * dt;
      if (en.y + en.r >= LOSE_LINE_Y) {
        enemies.splice(i, 1);
        loseLife();
        if (state !== 'playing') return;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawEnemy(en) {
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[en.type];
    ctx.fill();
    if (en.type === 'gold') {
      ctx.fillStyle = '#5a4400';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', en.x, en.y + 1);
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      ctx.beginPath();
      ctx.moveTo(LANE_W * i, 0);
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

    for (const en of enemies) drawEnemy(en);

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
    if (state === 'playing') update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    reset();
    state = 'playing';
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    lastTs = 0;
    playStart();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  draw();
  rafId = requestAnimationFrame(loop);
})();
