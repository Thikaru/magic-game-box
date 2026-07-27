(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PLAYER_Y = H - 110;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const bestLabel = document.getElementById('bestLabel');
  const livesLabel = document.getElementById('livesLabel');
  const comboLabel = document.getElementById('comboLabel');
  const gripLabel = document.getElementById('gripLabel');

  const BEST_KEY = 'iceRoadDriftBest';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  bestLabel.textContent = best;

  const ACCEL = 900;
  const DRAG_NORMAL = 1.15;
  const DRAG_GRIP = 4.6;
  const MAX_VX = 260;
  const PLAYER_HALF_W = 15;
  const BASE_WIDTH = 190;
  const MIN_WIDTH = 78;
  const WIDTH_SHRINK = 0.012;
  const PICKUP_RADIUS = 27;

  function roadOffset(d) {
    return Math.sin(d * 0.0055) * 70 + Math.sin(d * 0.014 + 1.3) * 42 + Math.sin(d * 0.031 + 2.1) * 25;
  }
  function roadWidth(d) {
    return Math.max(MIN_WIDTH, BASE_WIDTH - d * WIDTH_SHRINK);
  }
  function roadSpeed(d) {
    return Math.min(340, 150 + d * 0.028);
  }
  function roadCenter(d) {
    return W / 2 + roadOffset(d);
  }

  let state = 'intro'; // intro | playing | gameover
  let paused = false;
  let playerX, vx, progress, scoreFloat, lives, comboCount, gripTimer, invincibleTimer;
  let bonfires, bonfireHorizon, holdLeft, holdRight, dragSide;

  function resetGame() {
    playerX = roadCenter(0);
    vx = 0;
    progress = 0;
    scoreFloat = 0;
    lives = 3;
    comboCount = 0;
    gripTimer = 0;
    invincibleTimer = 1.0;
    bonfires = [];
    bonfireHorizon = 380;
    holdLeft = false;
    holdRight = false;
    dragSide = 0;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = Math.floor(scoreFloat);
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
    comboLabel.textContent = comboCount;
    gripLabel.classList.toggle('hidden', gripTimer <= 0);
  }

  // --- 入力: キーボード(長押しで舵きり) ---
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = true;
  }, { passive: false });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') holdLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') holdRight = false;
  });

  // --- 入力: 画面タッチ長押し(左半分/右半分) ---
  let touching = false;
  function updateDragSide(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    dragSide = x < rect.width / 2 ? -1 : 1;
  }
  canvas.addEventListener('pointerdown', (e) => { touching = true; updateDragSide(e.clientX); });
  canvas.addEventListener('pointermove', (e) => { if (touching) updateDragSide(e.clientX); });
  window.addEventListener('pointerup', () => { touching = false; dragSide = 0; });
  canvas.addEventListener('pointercancel', () => { touching = false; dragSide = 0; });

  function spawnBonfiresAhead() {
    while (bonfireHorizon - progress < H * 1.6) {
      const d = bonfireHorizon + 320 + Math.random() * 200;
      const hw = roadWidth(d) / 2;
      const x = roadCenter(d) + (Math.random() * 2 - 1) * hw * 0.55;
      bonfires.push({ d, x, resolved: false });
      bonfireHorizon = d;
    }
  }

  function crash() {
    lives -= 1;
    invincibleTimer = 1.3;
    comboCount = 0;
    gripTimer = 0;
    vx = 0;
    playerX = roadCenter(progress);
    updateHud();
    if (lives <= 0) gameOver();
  }

  function update(dt) {
    const left = holdLeft || dragSide === -1;
    const right = holdRight || dragSide === 1;
    if (left) vx -= ACCEL * dt;
    if (right) vx += ACCEL * dt;
    const drag = gripTimer > 0 ? DRAG_GRIP : DRAG_NORMAL;
    vx -= vx * drag * dt;
    vx = Math.max(-MAX_VX, Math.min(MAX_VX, vx));
    playerX += vx * dt;
    playerX = Math.max(14, Math.min(W - 14, playerX));

    const speed = roadSpeed(progress);
    progress += speed * dt;
    scoreFloat += speed * dt * 0.35;

    if (invincibleTimer > 0) invincibleTimer -= dt;
    if (gripTimer > 0) gripTimer -= dt;

    spawnBonfiresAhead();
    for (let i = bonfires.length - 1; i >= 0; i--) {
      const b = bonfires[i];
      if (!b.resolved && b.d <= progress) {
        b.resolved = true;
        if (Math.abs(playerX - b.x) < PICKUP_RADIUS + PLAYER_HALF_W) {
          comboCount += 1;
          const mult = Math.min(1 + comboCount * 0.4, 4);
          scoreFloat += 120 * mult;
          gripTimer = 3.0;
        } else {
          comboCount = 0;
        }
        updateHud();
      }
      if (progress - b.d > H * 1.4) bonfires.splice(i, 1);
    }

    if (invincibleTimer <= 0) {
      const center = roadCenter(progress);
      const halfWidth = roadWidth(progress) / 2;
      if (playerX < center - halfWidth || playerX > center + halfWidth) crash();
    }
    updateHud();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eaf6ff';
    ctx.fillRect(0, 0, W, H);

    const step = 6;
    for (let y = 0; y <= H; y += step) {
      const d = progress + (PLAYER_Y - y);
      const center = roadCenter(d);
      const hw = roadWidth(d) / 2;
      const shade = 190 + Math.round(Math.sin(d * 0.01) * 12);
      ctx.fillStyle = `rgb(${shade - 50},${shade + 10},${shade + 30})`;
      ctx.fillRect(center - hw, y, hw * 2, step + 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = 0; y <= H; y += step) {
      const d = progress + (PLAYER_Y - y);
      const center = roadCenter(d);
      const hw = roadWidth(d) / 2;
      if (y === 0) { ctx.moveTo(center - hw, y); } else { ctx.lineTo(center - hw, y); }
    }
    ctx.stroke();
    ctx.beginPath();
    for (let y = 0; y <= H; y += step) {
      const d = progress + (PLAYER_Y - y);
      const center = roadCenter(d);
      const hw = roadWidth(d) / 2;
      if (y === 0) { ctx.moveTo(center + hw, y); } else { ctx.lineTo(center + hw, y); }
    }
    ctx.stroke();

    if (state !== 'playing') return;

    ctx.font = '30px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of bonfires) {
      const screenY = PLAYER_Y + progress - b.d;
      if (screenY < -30 || screenY > H + 30) continue;
      ctx.save();
      if (!b.resolved) { ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 16; }
      ctx.globalAlpha = b.resolved ? 0.25 : 1;
      ctx.fillText('🔥', b.x, screenY);
      ctx.restore();
    }

    const blinking = invincibleTimer > 0 && Math.floor(invincibleTimer * 12) % 2 === 0;
    if (!blinking) {
      ctx.save();
      if (gripTimer > 0) { ctx.shadowColor = '#4dd8ff'; ctx.shadowBlur = 18; }
      ctx.font = '34px serif';
      ctx.fillText('🛷', playerX, PLAYER_Y);
      ctx.restore();
    }
  }

  let lastTime = null;
  function loop(t) {
    if (state === 'playing' && !paused) {
      if (lastTime === null) lastTime = t;
      const dt = Math.min(0.05, (t - lastTime) / 1000);
      lastTime = t;
      update(dt);
    } else {
      lastTime = null;
    }
    render();
    requestAnimationFrame(loop);
  }

  function startGame() {
    resetGame();
    state = 'playing';
    paused = false;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    pauseOverlayEl.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  }

  function gameOver() {
    state = 'gameover';
    const finalScore = Math.floor(scoreFloat);
    if (finalScore > best) {
      best = finalScore;
      localStorage.setItem(BEST_KEY, String(best));
    }
    bestLabel.textContent = best;
    resultTitleEl.textContent = 'クラッシュ!';
    resultTextEl.innerHTML = `走行スコア <b>${finalScore}</b><br>ベストスコア <b>${best}</b>`;
    resultEl.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }

  const pauseBtn = document.getElementById('pauseBtn');
  const pauseOverlayEl = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');

  pauseBtn.addEventListener('click', () => {
    if (state !== 'playing' || paused) return;
    paused = true;
    pauseOverlayEl.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  });
  resumeBtn.addEventListener('click', () => {
    if (!paused) return;
    paused = false;
    pauseOverlayEl.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  });
  restartBtn.addEventListener('click', () => {
    pauseOverlayEl.classList.add('hidden');
    startGame();
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  resetGame();
  requestAnimationFrame(loop);
})();

(() => {
  const MUSIC_TRACKS = ['pop', 'speed', 'dark', 'limit'];
  const musicSelect = document.getElementById('musicSelect');
  const musicToggle = document.getElementById('musicToggle');
  const bgm = new Audio();
  bgm.loop = true;
  bgm.volume = 0.5;
  let bgmStarted = false;
  let musicOn = true;

  function playTrack(key) {
    bgm.src = `../../assets/music/${key}.mp3`;
    bgm.currentTime = 0;
    bgm.play().catch(() => {});
  }

  musicSelect.addEventListener('change', () => playTrack(musicSelect.value));

  musicToggle.addEventListener('click', () => {
    musicOn = !musicOn;
    bgm.muted = !musicOn;
    musicToggle.textContent = musicOn ? '🔊 BGM ON' : '🔇 BGM OFF';
    if (musicOn && bgmStarted && bgm.paused) bgm.play().catch(() => {});
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    if (bgmStarted) return;
    bgmStarted = true;
    const randomKey = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    musicSelect.value = randomKey;
    playTrack(randomKey);
  }, { once: true });
})();

document.addEventListener('DOMContentLoaded', () => {
  const vpadWrap = document.getElementById('vpadWrap');
  const vpadToggle = document.getElementById('vpadToggle');
  const vpadR = document.getElementById('vpadR');

  function setVpadVisible(v) {
    vpadWrap.classList.toggle('hidden', !v);
  }
  let vpadVisible = false;
  setVpadVisible(vpadVisible);
  vpadToggle.addEventListener('click', () => {
    vpadVisible = !vpadVisible;
    setVpadVisible(vpadVisible);
  });

  function dispatchKey(type, key) {
    const target = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement : window;
    target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  }

  document.querySelectorAll('.vpadBtn').forEach((btn) => {
    const key = btn.dataset.key;
    const press = (e) => { e.preventDefault(); dispatchKey('keydown', key); };
    const release = (e) => { e.preventDefault(); dispatchKey('keyup', key); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  vpadR.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dispatchKey('keydown', 'Enter');
    dispatchKey('keyup', 'Enter');
  });
});
