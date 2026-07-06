// ブロックくずし — 説明→プレイ→リザルト→リトライ の見本実装
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const scoreLabel = document.getElementById('scoreLabel');
  const livesLabel = document.getElementById('livesLabel');

  const COLORS = ['#ff5da2', '#ffd23f', '#4dd8e6', '#9dff5d', '#c592ff'];
  let state = null;
  let running = false;
  let rafId = 0;

  // ---- 初期状態を作る(リトライはこれを呼び直すだけ) ----
  function newState() {
    const rows = 5, cols = 8, bw = 52, bh = 20, gapX = 6, gapY = 8;
    const offsetX = (W - cols * bw - (cols - 1) * gapX) / 2;
    const bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        bricks.push({ x: offsetX + c * (bw + gapX), y: 60 + r * (bh + gapY), w: bw, h: bh, color: COLORS[r], alive: true });
    return {
      paddle: { x: W / 2 - 45, y: H - 40, w: 90, h: 14 },
      ball: { x: W / 2, y: H - 70, r: 8, vx: 4 * (Math.random() < .5 ? 1 : -1), vy: -5 },
      bricks, score: 0, lives: 3, keys: {}
    };
  }

  // ---- 入力 ----
  addEventListener('keydown', e => { if (state) state.keys[e.key] = true; });
  addEventListener('keyup', e => { if (state) state.keys[e.key] = false; });
  function pointerMove(clientX) {
    if (!state) return;
    const rect = cv.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * W;
    state.paddle.x = Math.max(0, Math.min(W - state.paddle.w, x - state.paddle.w / 2));
  }
  cv.addEventListener('mousemove', e => pointerMove(e.clientX));
  cv.addEventListener('touchmove', e => { e.preventDefault(); pointerMove(e.touches[0].clientX); }, { passive: false });
  cv.addEventListener('touchstart', e => { e.preventDefault(); pointerMove(e.touches[0].clientX); }, { passive: false });

  // ---- 更新 ----
  function update() {
    const s = state, p = s.paddle, b = s.ball;
    if (s.keys.ArrowLeft) p.x = Math.max(0, p.x - 8);
    if (s.keys.ArrowRight) p.x = Math.min(W - p.w, p.x + 8);

    b.x += b.vx; b.y += b.vy;
    if (b.x < b.r || b.x > W - b.r) { b.vx *= -1; b.x = Math.max(b.r, Math.min(W - b.r, b.x)); }
    if (b.y < b.r) { b.vy *= -1; b.y = b.r; }

    // パドル反射(当たった位置で角度が変わる)
    if (b.vy > 0 && b.y + b.r >= p.y && b.y + b.r <= p.y + p.h + 10 && b.x >= p.x && b.x <= p.x + p.w) {
      const t = (b.x - (p.x + p.w / 2)) / (p.w / 2);
      const speed = Math.hypot(b.vx, b.vy);
      const angle = t * Math.PI / 3;
      b.vx = speed * Math.sin(angle);
      b.vy = -Math.abs(speed * Math.cos(angle));
      b.y = p.y - b.r;
    }

    // ブロック衝突
    for (const br of s.bricks) {
      if (!br.alive) continue;
      if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
        br.alive = false;
        s.score += 10;
        const fromSide = Math.min(Math.abs(b.x - br.x), Math.abs(b.x - (br.x + br.w))) <
                         Math.min(Math.abs(b.y - br.y), Math.abs(b.y - (br.y + br.h)));
        if (fromSide) b.vx *= -1; else b.vy *= -1;
        break;
      }
    }

    // 落下
    if (b.y > H + b.r) {
      s.lives--;
      if (s.lives <= 0) return endGame(false);
      Object.assign(b, { x: W / 2, y: H - 70, vx: 4 * (Math.random() < .5 ? 1 : -1), vy: -5 });
    }

    if (s.bricks.every(br => !br.alive)) return endGame(true);
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    livesLabel.textContent = '♥'.repeat(state.lives) || '-';
  }

  // ---- 描画 ----
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const br of state.bricks) {
      if (!br.alive) continue;
      ctx.fillStyle = br.color;
      ctx.fillRect(br.x, br.y, br.w, br.h);
    }
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.w, state.paddle.h);
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }

  function loop() {
    if (!running) return;
    update();
    if (running) { draw(); rafId = requestAnimationFrame(loop); }
  }

  // ---- 画面遷移 ----
  function startGame() {
    state = newState();
    updateHud();
    intro.classList.add('hidden');
    result.classList.add('hidden');
    running = true;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function endGame(cleared) {
    running = false;
    draw();
    resultTitle.textContent = cleared ? 'クリア！' : 'ゲームオーバー';
    resultText.textContent = 'スコア: ' + state.score;
    result.classList.remove('hidden');
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
})();
