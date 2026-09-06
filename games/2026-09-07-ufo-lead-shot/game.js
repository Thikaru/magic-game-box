(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CANNON_X = W / 2, CANNON_Y = H - 34;
  const LOSE_LINE_Y = H - 96;
  const BULLET_SPEED = 900;

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

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, level = 1, kills = 0;
  let enemies = [];
  let particles = [];
  let bullet = null; // {x0,y0,x1,y1,t0,t1}
  let spawnTimer = 0, spawnInterval = 1100;
  let aim = { x: CANNON_X, y: H * 0.4 };
  let forceGoldNext = false;
  let lastComboMilestone = 0;
  let lastTs = 0;
  let clock = 0;
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
  function playFire() { beep(680, 0.06, 'square', 0.13); }
  function playHit() { beep(520, 0.05, 'triangle', 0.18); beep(780, 0.09, 'triangle', 0.15, 0.05); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(990, 0.14, 'sine', 0.2, 0.06); }
  function playMiss() { beep(180, 0.12, 'sine', 0.1); }
  function playEscape() { beep(140, 0.28, 'sawtooth', 0.22); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; kills = 0;
    enemies = []; particles = []; bullet = null;
    spawnTimer = 0; spawnInterval = 1100; clock = 0;
    forceGoldNext = false; lastComboMilestone = 0;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    levelLabel.textContent = 'LV ' + level;
  }

  function multiplier() { return 1 + Math.floor(combo / 6) * 0.5; }

  function zigzagChance() { return Math.min(0.5, level < 3 ? 0 : 0.15 + (level - 3) * 0.05); }

  function trySpawn() {
    let type = 'normal';
    if (forceGoldNext) { type = 'gold'; forceGoldNext = false; }
    else if (Math.random() < 0.08) type = 'gold';
    else if (Math.random() < zigzagChance()) type = 'zigzag';

    const x = 40 + Math.random() * (W - 80);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const speedScale = type === 'gold' ? 0.62 : 1;
    const vy = (46 + level * 7 + Math.random() * 10) * speedScale;
    const vx = dir * (26 + level * 5 + Math.random() * 16) * speedScale;
    const r = type === 'gold' ? 22 : 16;
    const en = { x, y: -20, vx, vy, r, type, flipAt: null };
    if (type === 'zigzag') en.flipAt = clock + 0.4 + Math.random() * 0.7;
    enemies.push(en);
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < (n || 9); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.4, maxLife: 0.4, color });
    }
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(kills / 6) + 1;
    if (newLevel !== level) {
      level = newLevel;
      spawnInterval = Math.max(480, 1100 - level * 65);
    }
  }

  function hitTolerance() {
    return Math.max(4, 14 - level);
  }

  function registerHit(en) {
    enemies.splice(enemies.indexOf(en), 1);
    const base = en.type === 'gold' ? 90 : 30;
    score += Math.round(base * multiplier());
    combo++;
    kills++;
    if (combo > 0 && combo % 5 === 0 && combo !== lastComboMilestone) {
      lastComboMilestone = combo;
      forceGoldNext = true;
    }
    if (en.type === 'gold') {
      lives = Math.min(3, lives + 1);
      playGold();
    } else {
      playHit();
    }
    spawnParticles(en.x, en.y, en.type === 'gold' ? '#ffd23f' : (en.type === 'zigzag' ? '#ff9d4d' : '#4de3ff'));
    updateHud();
    maybeLevelUp();
  }

  function resolveBullet() {
    const bx = bullet.x1, by = bullet.y1;
    let bestI = -1, bestDist = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      const d = Math.hypot(bx - en.x, by - en.y);
      if (d <= en.r + hitTolerance() && d < bestDist) { bestDist = d; bestI = i; }
    }
    if (bestI >= 0) {
      registerHit(enemies[bestI]);
    } else {
      combo = 0;
      playMiss();
      spawnParticles(bx, by, 'rgba(255,255,255,.5)', 5);
      updateHud();
    }
    bullet = null;
  }

  function loseLife() {
    lives--;
    combo = 0;
    updateHud();
    playEscape();
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

  function fireAt(x, y) {
    if (state !== 'playing' || bullet) return;
    const clampedY = Math.min(y, LOSE_LINE_Y - 4);
    const dist = Math.hypot(x - CANNON_X, y - CANNON_Y);
    const travel = dist / BULLET_SPEED;
    bullet = { x0: CANNON_X, y0: CANNON_Y, x1: x, y1: clampedY, t0: clock, t1: clock + travel };
    playFire();
  }

  canvas.addEventListener('mousedown', e => {
    const p = canvasPoint(e.clientX, e.clientY);
    aim = p;
    fireAt(p.x, p.y);
  });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = canvasPoint(t.clientX, t.clientY);
      aim = p;
      fireAt(p.x, p.y);
    }
  }, { passive: false });

  const AIM_STEP = 16;
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); aim.x = Math.max(10, aim.x - AIM_STEP); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); aim.x = Math.min(W - 10, aim.x + AIM_STEP); }
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); aim.y = Math.max(10, aim.y - AIM_STEP); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); aim.y = Math.min(H - 10, aim.y + AIM_STEP); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fireAt(aim.x, aim.y); }
  });

  function update(dt) {
    clock += dt;

    spawnTimer += dt * 1000;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; trySpawn(); }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.type === 'zigzag' && en.flipAt !== null && clock >= en.flipAt) {
        en.vx *= -1;
        en.flipAt = null;
      }
      en.x += en.vx * dt;
      en.y += en.vy * dt;
      if (en.x < en.r) { en.x = en.r; en.vx = Math.abs(en.vx); }
      if (en.x > W - en.r) { en.x = W - en.r; en.vx = -Math.abs(en.vx); }
      if (en.y >= LOSE_LINE_Y) {
        enemies.splice(i, 1);
        loseLife();
        if (state !== 'playing') return;
      }
    }

    if (bullet && clock >= bullet.t1) resolveBullet();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawEnemy(en) {
    ctx.save();
    ctx.translate(en.x, en.y);
    ctx.beginPath();
    ctx.ellipse(0, 2, en.r, en.r * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = en.type === 'gold' ? '#ffd23f' : (en.type === 'zigzag' ? '#ff9d4d' : '#4de3ff');
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -en.r * 0.35, en.r * 0.48, Math.PI, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = en.type === 'gold' ? '#5a4400' : '#0a1020';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (en.type === 'gold') ctx.fillText('★', en.x, en.y + 2);
    else if (en.type === 'zigzag') ctx.fillText('▲', en.x, en.y + 2);
  }

  function drawCannon() {
    const ang = Math.atan2(aim.y - CANNON_Y, aim.x - CANNON_X);
    ctx.save();
    ctx.translate(CANNON_X, CANNON_Y);
    ctx.fillStyle = '#3a4468';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = '#7dffb3';
    ctx.fillRect(0, -5, 30, 10);
    ctx.restore();

    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(125,255,179,.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CANNON_X, CANNON_Y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(125,255,179,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(aim.x - 8, aim.y);
    ctx.lineTo(aim.x + 8, aim.y);
    ctx.moveTo(aim.x, aim.y - 8);
    ctx.lineTo(aim.x, aim.y + 8);
    ctx.stroke();
  }

  function drawBullet() {
    if (!bullet) return;
    const pct = Math.min(1, (clock - bullet.t0) / Math.max(0.0001, bullet.t1 - bullet.t0));
    const bx = bullet.x0 + (bullet.x1 - bullet.x0) * pct;
    const by = bullet.y0 + (bullet.y1 - bullet.y0) * pct;
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, LOSE_LINE_Y);
    ctx.lineTo(W, LOSE_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const en of enemies) drawEnemy(en);
    drawBullet();
    drawCannon();

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
