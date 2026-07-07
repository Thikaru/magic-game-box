(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LANES = 3;
  const LANE_W = W / LANES;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const bestLabel = document.getElementById('bestLabel');
  const livesLabel = document.getElementById('livesLabel');
  const controllerEl = document.getElementById('controller');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const toggleBtn = document.getElementById('toggleBtn');

  const BEST_KEY = 'nightHighwayBest';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  bestLabel.textContent = best;

  function laneCenterX(lane) { return LANE_W * (lane + 0.5); }

  let state = 'intro'; // intro | playing | gameover
  let player, obstacles, score, lives, elapsed, spawnTimer, scrollSpeed, nitroTimer, hitFlash, lastSpawnLane;

  function resetGame() {
    player = { lane: 1, x: laneCenterX(1), targetLane: 1, w: 46, h: 74, y: H - 100 };
    obstacles = [];
    score = 0;
    lives = 3;
    elapsed = 0;
    spawnTimer = 0.9;
    scrollSpeed = 210;
    nitroTimer = 0;
    hitFlash = 0;
    lastSpawnLane = -1;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = Math.floor(score);
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
  }

  function moveLane(dir) {
    if (state !== 'playing') return;
    player.targetLane = Math.min(LANES - 1, Math.max(0, player.targetLane + dir));
  }

  // --- 入力: キーボード ---
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveLane(-1);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveLane(1);
  }, { passive: false });

  // --- 入力: スワイプ ---
  let touchStartX = null;
  canvas.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 28) moveLane(dx > 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });

  // --- 入力: 仮想コントローラ ---
  function bindPad(btn, dir) {
    const fire = (e) => { e.preventDefault(); moveLane(dir); };
    btn.addEventListener('pointerdown', fire);
  }
  bindPad(leftBtn, -1);
  bindPad(rightBtn, 1);

  function applyControllerVisibility() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    controllerVisible = coarse;
    controllerEl.querySelector('.padBtns').style.display = controllerVisible ? 'flex' : 'none';
  }
  let controllerVisible = true;
  applyControllerVisibility();
  toggleBtn.addEventListener('click', () => {
    controllerVisible = !controllerVisible;
    controllerEl.querySelector('.padBtns').style.display = controllerVisible ? 'flex' : 'none';
  });

  function spawnObstacle() {
    const roll = Math.random();
    let type = 'car';
    if (roll < 0.12) type = 'nitro';
    else if (roll < 0.45) type = 'coin';

    let lane = Math.floor(Math.random() * LANES);
    if (lane === lastSpawnLane && Math.random() < 0.6) {
      lane = (lane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;
    }
    lastSpawnLane = lane;

    const size = type === 'car' ? { w: 44, h: 70 } : { w: 30, h: 30 };
    obstacles.push({
      type, lane, x: laneCenterX(lane), y: -size.h,
      w: size.w, h: size.h, emoji: type === 'car' ? ['🚗', '🚙', '🚕'][Math.floor(Math.random() * 3)] : (type === 'coin' ? '🪙' : '⚡'),
    });
  }

  function rectsOverlap(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 6;
  }

  function update(dt) {
    elapsed += dt;
    scrollSpeed = Math.min(210 + elapsed * 9, 520);

    // プレイヤーのレーン移動をなめらかに補間
    const targetX = laneCenterX(player.targetLane);
    player.x += (targetX - player.x) * Math.min(1, dt * 10);
    player.lane = player.targetLane;

    if (nitroTimer > 0) nitroTimer -= dt;
    if (hitFlash > 0) hitFlash -= dt;

    const invincible = nitroTimer > 0 || hitFlash > 0;
    const scoreRate = nitroTimer > 0 ? 2 : 1;
    score += dt * (scrollSpeed / 6) * scoreRate;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      const minGap = Math.max(0.42, 0.95 - elapsed * 0.01);
      spawnTimer = minGap + Math.random() * 0.35;
    }

    const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += scrollSpeed * dt;
      if (o.y - o.h / 2 > H) { obstacles.splice(i, 1); continue; }

      if (rectsOverlap(playerRect, o)) {
        if (o.type === 'coin') {
          score += 30;
          obstacles.splice(i, 1);
        } else if (o.type === 'nitro') {
          nitroTimer = 3;
          obstacles.splice(i, 1);
        } else if (o.type === 'car') {
          if (invincible) {
            score += 20;
            obstacles.splice(i, 1);
          } else {
            lives -= 1;
            hitFlash = 1.4;
            obstacles.splice(i, 1);
            updateHud();
            if (lives <= 0) { gameOver(); return; }
          }
        }
      }
    }
    updateHud();
  }

  function drawCar(x, y, w, h, emoji, glow) {
    ctx.save();
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
    }
    ctx.font = `${h}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y + 2);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // 道路
    ctx.fillStyle = '#1b1f2e';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    const dashOffset = (elapsed * scrollSpeed) % 48;
    for (let lane = 1; lane < LANES; lane++) {
      ctx.beginPath();
      ctx.moveTo(lane * LANE_W, -48 + dashOffset);
      ctx.lineTo(lane * LANE_W, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (state !== 'playing') return;

    for (const o of obstacles) {
      const glow = o.type === 'coin' ? '#ffcb3d' : (o.type === 'nitro' ? '#ff5da2' : null);
      drawCar(o.x, o.y, o.w, o.h, o.emoji, glow);
    }

    const blinking = hitFlash > 0 && Math.floor(hitFlash * 12) % 2 === 0;
    if (!blinking) {
      drawCar(player.x, player.y, player.w, player.h, '🚓', nitroTimer > 0 ? '#4dd8ff' : null);
    }
  }

  let lastTime = null;
  function loop(t) {
    if (state === 'playing') {
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
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
  }

  function gameOver() {
    state = 'gameover';
    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem(BEST_KEY, String(best));
    }
    bestLabel.textContent = best;
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML = `走行スコア <b>${Math.floor(score)}</b><br>ベストスコア <b>${best}</b>`;
    resultEl.classList.remove('hidden');
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  resetGame();
  requestAnimationFrame(loop);
})();
