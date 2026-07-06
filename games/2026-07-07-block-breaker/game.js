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
  const effectsLabel = document.getElementById('effectsLabel');

  const COLORS = ['#ff5da2', '#ffd23f', '#4dd8e6', '#9dff5d', '#c592ff'];

  // ---- パワーアップ設定 ----
  const PADDLE_BASE_W = 90;
  const PADDLE_WIDE_W = 140;
  const SLOW_MUL = 0.55;
  const MAX_BALLS = 5;
  const POWERUP_DROP_CHANCE = 0.25;
  const POWERUP_TYPES = {
    wide:  { label: 'W', color: '#ffd23f', duration: 10000 },
    slow:  { label: 'S', color: '#4dd8e6', duration: 8000 },
    multi: { label: 'M', color: '#ff5da2', duration: 0 },
  };

  let state = null;
  let running = false;
  let rafId = 0;

  function freshBall() {
    return { x: W / 2, y: H - 70, r: 8, vx: 4 * (Math.random() < .5 ? 1 : -1), vy: -5 };
  }

  // ---- 初期状態を作る(リトライはこれを呼び直すだけ) ----
  function newState() {
    const rows = 5, cols = 8, bw = 52, bh = 20, gapX = 6, gapY = 8;
    const offsetX = (W - cols * bw - (cols - 1) * gapX) / 2;
    const bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        bricks.push({ x: offsetX + c * (bw + gapX), y: 60 + r * (bh + gapY), w: bw, h: bh, color: COLORS[r], alive: true });
    return {
      paddle: { x: W / 2 - PADDLE_BASE_W / 2, y: H - 40, w: PADDLE_BASE_W, h: 14 },
      balls: [freshBall()],
      powerups: [],
      effects: { wideUntil: 0, slowUntil: 0 },
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

  // ---- パワーアップ ----
  function maybeSpawnPowerup(brick) {
    if (Math.random() >= POWERUP_DROP_CHANCE) return;
    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    state.powerups.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, vy: 2.4, type });
  }

  function applyPowerup(type) {
    const now = Date.now();
    if (type === 'wide') state.effects.wideUntil = now + POWERUP_TYPES.wide.duration;
    else if (type === 'slow') state.effects.slowUntil = now + POWERUP_TYPES.slow.duration;
    else if (type === 'multi') {
      const snapshot = state.balls.slice();
      for (const b of snapshot) {
        if (state.balls.length >= MAX_BALLS) break;
        state.balls.push({ x: b.x, y: b.y, r: b.r, vx: -b.vx + (Math.random() * 1.4 - 0.7), vy: b.vy });
      }
    }
  }

  // ---- 更新 ----
  function update() {
    const s = state, p = s.paddle;
    if (s.keys.ArrowLeft) p.x = Math.max(0, p.x - 8);
    if (s.keys.ArrowRight) p.x = Math.min(W - p.w, p.x + 8);

    const now = Date.now();
    p.w = now < s.effects.wideUntil ? PADDLE_WIDE_W : PADDLE_BASE_W;
    p.x = Math.max(0, Math.min(W - p.w, p.x));
    const speedMul = now < s.effects.slowUntil ? SLOW_MUL : 1;

    for (const b of s.balls) {
      b.x += b.vx * speedMul; b.y += b.vy * speedMul;
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
          maybeSpawnPowerup(br);
          const fromSide = Math.min(Math.abs(b.x - br.x), Math.abs(b.x - (br.x + br.w))) <
                           Math.min(Math.abs(b.y - br.y), Math.abs(b.y - (br.y + br.h)));
          if (fromSide) b.vx *= -1; else b.vy *= -1;
          break;
        }
      }
    }

    // 落下したボールを取り除く。全部落ちたら残機を減らして1個だけ再スタート
    s.balls = s.balls.filter(b => b.y <= H + b.r);
    if (s.balls.length === 0) {
      s.lives--;
      if (s.lives <= 0) return endGame(false);
      s.balls.push(freshBall());
    }

    // 降ってくるパワーアップアイテム
    for (const pu of s.powerups) pu.y += pu.vy;
    s.powerups = s.powerups.filter(pu => {
      if (pu.y > H + 12) return false;
      if (pu.y + 10 >= p.y && pu.y - 10 <= p.y + p.h && pu.x >= p.x - 10 && pu.x <= p.x + p.w + 10) {
        applyPowerup(pu.type);
        return false;
      }
      return true;
    });

    if (s.bricks.every(br => !br.alive)) return endGame(true);
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    livesLabel.textContent = '♥'.repeat(state.lives) || '-';
    const now = Date.now();
    const tags = [];
    if (now < state.effects.wideUntil) tags.push('WIDE ' + Math.ceil((state.effects.wideUntil - now) / 1000) + 's');
    if (now < state.effects.slowUntil) tags.push('SLOW ' + Math.ceil((state.effects.slowUntil - now) / 1000) + 's');
    if (state.balls.length > 1) tags.push('BALL×' + state.balls.length);
    effectsLabel.textContent = tags.join(' ');
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
    for (const b of state.balls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pu of state.powerups) {
      const info = POWERUP_TYPES[pu.type];
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();
      ctx.fillStyle = '#1c1c28';
      ctx.fillText(info.label, pu.x, pu.y + 1);
    }
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
