(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const livesEl = document.getElementById('lives');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const targetNumEl = document.getElementById('targetNum');

  let W = 360, H = 480, DPR = 1;
  let stars = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (stars.length === 0) {
      for (let i = 0; i < 50; i++) {
        stars.push({ fx: Math.random(), fy: Math.random(), r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.6 + 0.3 });
      }
    }
  }
  window.addEventListener('resize', resize);

  // ---- audio (created only after a user gesture) ----
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
  }
  function beep(freq, dur, type, vol) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.08;
    osc.connect(gain).connect(actx.destination);
    const now = actx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }
  const sfxHit = () => beep(880, 0.12, 'square', 0.09);
  const sfxWrong = () => beep(140, 0.18, 'sawtooth', 0.08);
  const sfxLife = () => beep(90, 0.3, 'sawtooth', 0.1);
  const sfxLevel = () => { beep(660, 0.1, 'triangle', 0.08); setTimeout(() => beep(990, 0.14, 'triangle', 0.08), 90); };
  const sfxOver = () => { beep(320, 0.2, 'sawtooth', 0.09); setTimeout(() => beep(180, 0.35, 'sawtooth', 0.09), 150); };

  // ---- game state ----
  let state = 'intro'; // intro | playing | over
  let meteors = [];
  let particles = [];
  let target = 1;
  let level = 0;
  let score = 0;
  let combo = 0;
  let lives = 3;
  let spawnTimer = 0;
  let flashTimer = 0;
  let lastTime = 0;

  function baseSpeed() { return 55 + level * 16; }
  function spawnInterval() { return Math.max(420, 1250 - level * 60); }

  function resetGame() {
    meteors = [];
    particles = [];
    target = 1;
    level = 0;
    score = 0;
    combo = 0;
    lives = 3;
    spawnTimer = 0;
    flashTimer = 0;
    updateHud();
  }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
    scoreLabelEl.textContent = 'SCORE ' + score;
    targetNumEl.textContent = String(target);
  }

  function spawnMeteor() {
    const r = 20 + Math.random() * 6;
    const forceTarget = Math.random() < 0.35;
    const num = forceTarget ? target : (1 + Math.floor(Math.random() * 9));
    const x = r + Math.random() * (W - r * 2);
    const speed = baseSpeed() * (0.85 + Math.random() * 0.35);
    meteors.push({ x, y: -r, r, num, vy: speed, hitFlash: 0 });
  }

  function addParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.5, color });
    }
  }

  function advanceTarget() {
    target = target % 9 + 1;
    if (target === 1) {
      level++;
      sfxLevel();
    }
    updateHud();
  }

  function hitMeteor(m) {
    if (m.num === target) {
      score += 10 + combo * 2;
      combo++;
      addParticles(m.x, m.y, '#5fe6ff', 14);
      sfxHit();
      removeMeteor(m);
      advanceTarget();
    } else {
      combo = 0;
      addParticles(m.x, m.y, '#ff5d5d', 10);
      sfxWrong();
      flashTimer = 0.18;
      removeMeteor(m);
      updateHud();
    }
  }

  function removeMeteor(m) {
    const idx = meteors.indexOf(m);
    if (idx >= 0) meteors.splice(idx, 1);
  }

  function loseLife() {
    lives--;
    combo = 0;
    flashTimer = 0.25;
    sfxLife();
    updateHud();
    if (lives <= 0) {
      gameOver();
    }
  }

  function gameOver() {
    state = 'over';
    sfxOver();
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML = 'スコア <b>' + score + '</b><br>到達レベル ' + (level + 1) + '<br>最大コンボ表示なし… また挑戦しよう!';
    resultEl.classList.remove('hidden');
  }

  function pointFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else if (evt.changedTouches && evt.changedTouches.length) {
      clientX = evt.changedTouches[0].clientX;
      clientY = evt.changedTouches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function handlePointer(evt) {
    if (state !== 'playing') return;
    evt.preventDefault();
    const p = pointFromEvent(evt);
    let best = null, bestD = Infinity;
    for (const m of meteors) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d <= m.r + 14 && d < bestD) { best = m; bestD = d; }
    }
    if (best) hitMeteor(best);
  }
  canvas.addEventListener('pointerdown', handlePointer);

  window.addEventListener('keydown', (evt) => {
    if (state !== 'playing') return;
    if (evt.key >= '1' && evt.key <= '9') {
      const num = parseInt(evt.key, 10);
      let best = null, bestY = -Infinity;
      for (const m of meteors) {
        if (m.num === num && m.y > bestY) { best = m; bestY = m.y; }
      }
      if (best) hitMeteor(best);
    }
  });

  function update(dt) {
    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnMeteor();
      spawnTimer = spawnInterval();
    }

    for (const m of meteors.slice()) {
      m.y += m.vy * dt;
      if (m.y - m.r > H) {
        const wasTarget = m.num === target;
        removeMeteor(m);
        if (wasTarget) {
          loseLife();
          if (state !== 'playing') return;
          advanceTarget();
        }
      }
    }

    for (const p of particles.slice()) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(particles.indexOf(p), 1);
    }

    if (flashTimer > 0) flashTimer -= dt;
  }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#bcd4ff';
      ctx.beginPath();
      ctx.arc(s.fx * W, s.fy * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (flashTimer > 0) {
      ctx.fillStyle = 'rgba(255,80,80,' + (flashTimer / 0.25 * 0.25) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawMeteors() {
    for (const m of meteors) {
      const isTarget = m.num === target;
      ctx.beginPath();
      const grad = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.2, m.x, m.y, m.r);
      if (isTarget) {
        grad.addColorStop(0, '#fff4cf');
        grad.addColorStop(1, '#ffcf4d');
      } else {
        grad.addColorStop(0, '#8ea6d8');
        grad.addColorStop(1, '#3a4f8a');
      }
      ctx.fillStyle = grad;
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      if (isTarget) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      ctx.fillStyle = isTarget ? '#3a2a00' : '#eaf2ff';
      ctx.font = 'bold ' + Math.round(m.r * 1.1) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(m.num), m.x, m.y + 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(p.life / 0.5, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTurretLine() {
    ctx.strokeStyle = 'rgba(95,230,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 4);
    ctx.lineTo(W, H - 4);
    ctx.stroke();
  }

  function render() {
    drawBackground();
    drawTurretLine();
    drawMeteors();
    drawParticles();
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    lastTime = ts;
    if (dt > 0.05) dt = 0.05;
    if (state === 'playing') update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    resetGame();
    state = 'playing';
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    spawnTimer = 300;
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  resize();
  updateHud();
  requestAnimationFrame(loop);
})();
