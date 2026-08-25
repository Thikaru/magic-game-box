(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 5;
  const LANE_W = W / LANES;
  const LOSE_LINE_Y = H - 90;
  const SPAWN_GAP_Y = 120;
  const MAG_SIZE = 6;
  const RELOAD_TIME = 1.1;

  const RADIUS = { normal: 20, armored: 22, gold: 18 };
  const POINTS = { normal: 20, armored: 40, gold: 130 };
  const HP = { normal: 1, armored: 2, gold: 1 };
  const COLORS = { normal: '#4de3ff', armored: '#b892ff', gold: '#ffd23f' };
  const CRACK_COLOR = '#7a5fd0';

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const ammoLabel = document.getElementById('ammoLabel');
  const levelLabel = document.getElementById('levelLabel');
  const reloadBtn = document.getElementById('reloadBtn');

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, level = 1, kills = 0;
  let enemies = [];
  let particles = [];
  let spawnTimer = 0, spawnInterval = 950;
  let ammo = MAG_SIZE, reloading = false, reloadTimer = 0;
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
  function playShot() { beep(520, 0.07, 'square', 0.14); }
  function playCrack() { beep(300, 0.08, 'sawtooth', 0.16); }
  function playKill(type) {
    if (type === 'armored') beep(200, 0.16, 'sawtooth', 0.18);
    else beep(420, 0.1, 'triangle', 0.16);
  }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(990, 0.12, 'sine', 0.2, 0.06); }
  function playEmpty() { beep(140, 0.06, 'square', 0.1); }
  function playReloadStart() { beep(220, 0.1, 'sine', 0.12); }
  function playReloadDone() { beep(440, 0.08, 'sine', 0.16); beep(660, 0.14, 'sine', 0.18, 0.07); }
  function playLifeLoss() { beep(140, 0.28, 'sawtooth', 0.22); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function laneCenterX(lane) { return LANE_W * lane + LANE_W / 2; }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; kills = 0;
    enemies = []; particles = []; spawnTimer = 0; spawnInterval = 950;
    ammo = MAG_SIZE; reloading = false; reloadTimer = 0;
    reloadBtn.classList.remove('reloading');
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    ammoLabel.textContent = reloading ? 'AMMO --/' + MAG_SIZE : 'AMMO ' + ammo + '/' + MAG_SIZE;
    levelLabel.textContent = 'LV ' + level;
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
    if (Math.random() < 0.07) return 'gold';
    const armoredW = Math.min(0.42, 0.14 + level * 0.025);
    if (Math.random() < armoredW) return 'armored';
    return 'normal';
  }

  function vyFor(type) {
    const base = 38 + level * 6.5;
    const mult = { normal: 1, armored: 0.85, gold: 1.05 }[type];
    return base * mult + Math.random() * 8;
  }

  function trySpawn() {
    const lane = pickLane();
    if (lane == null) return;
    const type = rollType();
    enemies.push({ lane, x: laneCenterX(lane), y: -24, r: RADIUS[type], type, hp: HP[type], vy: vyFor(type) });
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.4, maxLife: 0.4, color });
    }
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(kills / 7) + 1;
    if (newLevel !== level) {
      level = newLevel;
      spawnInterval = Math.max(420, 950 - level * 55);
    }
  }

  function killEnemy(i) {
    const en = enemies[i];
    enemies.splice(i, 1);
    score += Math.round(POINTS[en.type] * multiplier());
    combo++;
    kills++;
    if (en.type === 'gold') {
      ammo = Math.min(MAG_SIZE, ammo + 2);
      playGold();
    } else {
      playKill(en.type);
    }
    updateHud();
    spawnParticles(en.x, en.y, COLORS[en.type]);
    maybeLevelUp();
  }

  function hitEnemy(i) {
    const en = enemies[i];
    en.hp--;
    if (en.hp <= 0) {
      killEnemy(i);
    } else {
      playCrack();
      spawnParticles(en.x, en.y, CRACK_COLOR);
    }
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

  function fireAt(i) {
    if (ammo <= 0 || reloading) { playEmpty(); return; }
    ammo--;
    playShot();
    updateHud();
    hitEnemy(i);
  }

  function tryShootAt(px, py) {
    if (state !== 'playing') return;
    let bestI = -1, bestDist = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      const dist = Math.hypot(px - en.x, py - en.y);
      if (dist <= en.r + 8 && dist < bestDist) { bestDist = dist; bestI = i; }
    }
    if (bestI >= 0) fireAt(bestI);
  }

  function shootLane(lane) {
    if (state !== 'playing') return;
    let bestI = -1, bestY = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      if (en.lane === lane && en.y > bestY) { bestY = en.y; bestI = i; }
    }
    if (bestI >= 0) fireAt(bestI);
  }

  function startReload() {
    if (state !== 'playing' || reloading) return;
    reloading = true;
    reloadTimer = 0;
    ammo = 0;
    reloadBtn.classList.add('reloading');
    playReloadStart();
    updateHud();
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

  reloadBtn.addEventListener('click', startReload);

  const LANE_KEYS = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key in LANE_KEYS) { e.preventDefault(); shootLane(LANE_KEYS[e.key]); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); startReload(); }
  });

  function update(dt) {
    if (reloading) {
      reloadTimer += dt;
      if (reloadTimer >= RELOAD_TIME) {
        reloading = false;
        ammo = MAG_SIZE;
        reloadBtn.classList.remove('reloading');
        playReloadDone();
        updateHud();
      }
    }

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
    ctx.fillStyle = en.type === 'armored' && en.hp < HP.armored ? CRACK_COLOR : COLORS[en.type];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.stroke();
    ctx.fillStyle = en.type === 'gold' ? '#5a4400' : '#0a1020';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (en.type === 'gold') ctx.fillText('★', en.x, en.y + 1);
    else if (en.type === 'armored') ctx.fillText('🛡', en.x, en.y + 1);
  }

  function drawAmmoPips() {
    const startX = W / 2 - (MAG_SIZE * 16) / 2 + 8;
    const y = 18;
    for (let i = 0; i < MAG_SIZE; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * 16, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = (!reloading && i < ammo) ? '#ffd23f' : 'rgba(255,255,255,.15)';
      ctx.fill();
    }
    if (reloading) {
      const pct = Math.min(1, reloadTimer / RELOAD_TIME);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('リロード中…', W / 2, y + 22);
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60, y + 32);
      ctx.lineTo(W / 2 + 60, y + 32);
      ctx.stroke();
      ctx.strokeStyle = '#7dffb3';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60, y + 32);
      ctx.lineTo(W / 2 - 60 + 120 * pct, y + 32);
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

    drawAmmoPips();
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
