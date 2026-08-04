(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const TURRET_X = W / 2, TURRET_Y = H - 48;
  const LOSE_LINE_Y = H - 90;
  const BULLET_SPEED = 420;
  const BULLET_R = 6;
  const MAX_AIM_DEG = 78;

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
  let aimDeg = 0;
  let dragging = false;
  let dragStartTouchId = null;

  let score = 0, combo = 0, lives = 3, level = 1, kills = 0;
  let enemies = [];
  let bullet = null;
  let spawnTimer = 0, spawnInterval = 950;
  let lastTs = 0;
  let rafId = null;

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; kills = 0;
    enemies = []; bullet = null; spawnTimer = 0; spawnInterval = 950;
    aimDeg = 0;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  function multiplier() {
    return 1 + Math.floor(combo / 5) * 0.5;
  }

  function spawnEnemy() {
    const x = 32 + Math.random() * (W - 64);
    const roll = Math.random();
    let type = 'normal';
    if (roll < 0.10) type = 'gold';
    else if (roll < 0.45) type = 'shield';
    const baseSpeed = 32 + level * 9;
    enemies.push({ x, y: -22, r: 17, type, vy: baseSpeed + Math.random() * 12 });
  }

  function fireBullet() {
    if (bullet || state !== 'playing') return;
    const rad = aimDeg * Math.PI / 180;
    bullet = {
      x: TURRET_X, y: TURRET_Y - 14,
      vx: Math.sin(rad) * BULLET_SPEED,
      vy: -Math.cos(rad) * BULLET_SPEED,
      bounces: 0, life: 0,
    };
  }

  function updateAimFromPoint(px, py) {
    const dx = px - TURRET_X;
    const dy = py - (TURRET_Y - 14);
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (dy > -10) {
      deg = dx >= 0 ? MAX_AIM_DEG : -MAX_AIM_DEG;
    }
    deg = Math.max(-MAX_AIM_DEG, Math.min(MAX_AIM_DEG, deg));
    aimDeg = deg;
  }

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height),
    };
  }

  function onPointerDown(clientX, clientY) {
    if (state !== 'playing') return;
    dragging = true;
    const p = canvasPoint(clientX, clientY);
    updateAimFromPoint(p.x, p.y);
  }
  function onPointerMove(clientX, clientY) {
    if (!dragging) return;
    const p = canvasPoint(clientX, clientY);
    updateAimFromPoint(p.x, p.y);
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    fireBullet();
  }

  canvas.addEventListener('mousedown', e => onPointerDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => onPointerUp());

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    dragStartTouchId = t.identifier;
    onPointerDown(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === dragStartTouchId) onPointerMove(t.clientX, t.clientY);
    }
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === dragStartTouchId) { onPointerUp(); dragStartTouchId = null; }
    }
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      aimDeg = Math.max(-MAX_AIM_DEG, aimDeg - 5);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      aimDeg = Math.min(MAX_AIM_DEG, aimDeg + 5);
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') {
      e.preventDefault();
      fireBullet();
    }
  });

  function reflectTrajectoryPoints(x0, y0, deg, maxTime) {
    const rad = deg * Math.PI / 180;
    let x = x0, y = y0;
    let vx = Math.sin(rad) * BULLET_SPEED, vy = -Math.cos(rad) * BULLET_SPEED;
    const pts = [{ x, y }];
    const dt = 1 / 60;
    let t = 0;
    while (t < maxTime && y > -10) {
      x += vx * dt; y += vy * dt; t += dt;
      if (x < 0) { x = 0; vx = -vx; }
      else if (x > W) { x = W; vx = -vx; }
      pts.push({ x, y });
    }
    return pts;
  }

  function stepBullet(dt) {
    if (!bullet) return;
    bullet.life += dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.x < BULLET_R) { bullet.x = BULLET_R; bullet.vx = -bullet.vx; bullet.bounces++; }
    else if (bullet.x > W - BULLET_R) { bullet.x = W - BULLET_R; bullet.vx = -bullet.vx; bullet.bounces++; }

    if (bullet.y < -20 || bullet.life > 3) { bullet = null; return; }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      const dx = bullet.x - en.x, dy = bullet.y - en.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BULLET_R + en.r) {
        if (en.type === 'shield' && bullet.bounces === 0) {
          continue; // passes through, un-echoed shot can't crack the shield
        }
        const base = en.type === 'gold' ? 300 : (en.type === 'shield' ? 200 : 100);
        score += Math.round(base * multiplier());
        combo++;
        kills++;
        enemies.splice(i, 1);
        bullet = null;
        updateHud();
        maybeLevelUp();
        return;
      }
    }
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(kills / 8) + 1;
    if (newLevel !== level) {
      level = newLevel;
      spawnInterval = Math.max(430, 950 - level * 65);
    }
  }

  function loseLife() {
    lives--;
    combo = 0;
    updateHud();
    if (lives <= 0) endGame();
  }

  function endGame() {
    state = 'gameover';
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${score} / レベル ${level} まで到達!`;
    resultEl.classList.remove('hidden');
  }

  function update(dt) {
    spawnTimer += dt * 1000;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnEnemy();
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      en.y += en.vy * dt;
      if (en.y + en.r >= LOSE_LINE_Y) {
        enemies.splice(i, 1);
        loseLife();
        if (state !== 'playing') return;
      }
    }
    stepBullet(dt);
  }

  function drawTurret() {
    ctx.save();
    ctx.translate(TURRET_X, TURRET_Y);
    ctx.fillStyle = '#7dffb3';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-16, 16);
    ctx.lineTo(16, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(en) {
    ctx.beginPath();
    ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2);
    if (en.type === 'gold') {
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.fillStyle = '#7a5a00';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', en.x, en.y + 1);
    } else if (en.type === 'shield') {
      ctx.fillStyle = '#4de3ff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ff5d6c';
      ctx.fill();
    }
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

    if (bullet) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, BULLET_R, 0, Math.PI * 2);
      ctx.fillStyle = bullet.bounces > 0 ? '#ffffff' : '#7dffb3';
      ctx.fill();
    } else if (state === 'playing') {
      const pts = reflectTrajectoryPoints(TURRET_X, TURRET_Y - 14, aimDeg, 1.1);
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = 'rgba(125,255,179,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawTurret();
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
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  draw();
  rafId = requestAnimationFrame(loop);
})();
