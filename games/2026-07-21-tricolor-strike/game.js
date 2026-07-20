(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const COLORS = { red: '#ff5d6c', blue: '#4da6ff', yellow: '#ffd23f' };
  const ORDER = ['red', 'blue', 'yellow'];

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const colorBtns = {
    red: document.getElementById('btnRed'),
    blue: document.getElementById('btnBlue'),
    yellow: document.getElementById('btnYellow'),
  };

  let state = null;

  function freshState() {
    return {
      running: false,
      player: { x: W / 2, y: H - 46, w: 30, h: 26, color: 'red', vx: 0 },
      bullets: [],
      enemies: [],
      particles: [],
      score: 0,
      combo: 0,
      lives: 3,
      level: 1,
      elapsed: 0,
      spawnTimer: 0,
      fireTimer: 0,
      levelTimer: 0,
      dragging: false,
      keys: {},
      shake: 0,
    };
  }

  function setPlayerColor(c) {
    state.player.color = c;
    for (const k of ORDER) colorBtns[k].classList.toggle('active', k === c);
  }

  function multiplier() { return 1 + Math.floor(state.combo / 5); }

  function spawnEnemy() {
    const isRainbow = Math.random() < 0.1;
    const r = isRainbow ? 15 : 13;
    const color = isRainbow ? null : ORDER[(Math.random() * 3) | 0];
    const speed = 62 + state.level * 9 + Math.random() * 20;
    state.enemies.push({
      x: r + Math.random() * (W - r * 2),
      y: -r,
      r, color, isRainbow,
      hp: 2, vy: speed,
    });
  }

  function fireBullet() {
    state.bullets.push({ x: state.player.x, y: state.player.y - state.player.h / 2, color: state.player.color, vy: -380 });
  }

  function spark(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      state.particles.push({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.35, color });
    }
  }

  function update(dt) {
    const s = state;
    s.elapsed += dt;

    // level progression
    s.levelTimer += dt;
    if (s.levelTimer > 9) { s.levelTimer = 0; s.level++; }

    // player movement via keys
    const speed = 260;
    let vx = 0;
    if (s.keys['ArrowLeft'] || s.keys['a'] || s.keys['A']) vx -= speed;
    if (s.keys['ArrowRight'] || s.keys['d'] || s.keys['D']) vx += speed;
    if (!s.dragging) s.player.x += vx * dt;
    s.player.x = Math.max(s.player.w / 2 + 4, Math.min(W - s.player.w / 2 - 4, s.player.x));

    // fire
    s.fireTimer -= dt;
    const fireInterval = Math.max(0.14, 0.28 - s.level * 0.012);
    if (s.fireTimer <= 0) { fireBullet(); s.fireTimer = fireInterval; }

    // spawn
    s.spawnTimer -= dt;
    const spawnInterval = Math.max(0.35, 0.95 - s.level * 0.06);
    if (s.spawnTimer <= 0) { spawnEnemy(); s.spawnTimer = spawnInterval; }

    // bullets
    for (const b of s.bullets) b.y += b.vy * dt;
    s.bullets = s.bullets.filter(b => b.y > -10);

    // enemies
    for (const e of s.enemies) e.y += e.vy * dt;

    // bullet-enemy collision
    for (const b of s.bullets) {
      if (b.dead) continue;
      for (const e of s.enemies) {
        if (e.dead) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < e.r * e.r) {
          b.dead = true;
          const matched = e.isRainbow || e.color === b.color;
          e.hp -= matched ? 2 : 1;
          if (e.hp <= 0) {
            e.dead = true;
            spark(e.x, e.y, e.isRainbow ? '#ffffff' : COLORS[e.color]);
            if (matched) {
              s.combo++;
              s.score += (e.isRainbow ? 40 : 15) * multiplier();
            } else {
              s.combo = 0;
              s.score += 5;
            }
          }
          break;
        }
      }
    }
    s.bullets = s.bullets.filter(b => !b.dead);

    // enemy reaches bottom
    for (const e of s.enemies) {
      if (e.dead) continue;
      if (e.y - e.r > H) {
        e.dead = true;
        s.lives--;
        s.combo = 0;
        s.shake = 0.2;
      }
    }

    // enemy-player collision
    for (const e of s.enemies) {
      if (e.dead) continue;
      const dx = e.x - s.player.x, dy = e.y - s.player.y;
      const rr = e.r + s.player.w / 2;
      if (dx * dx + dy * dy < rr * rr) {
        e.dead = true;
        const safe = e.isRainbow || e.color === s.player.color;
        if (safe) {
          s.combo++;
          s.score += 5;
          spark(e.x, e.y, '#7dffb3');
        } else {
          s.lives--;
          s.combo = 0;
          s.shake = 0.25;
          spark(e.x, e.y, '#ff5d6c');
        }
      }
    }
    s.enemies = s.enemies.filter(e => !e.dead);

    // particles
    for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    s.particles = s.particles.filter(p => p.life > 0);

    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);

    if (s.lives <= 0) endGame();
  }

  function draw() {
    const s = state;
    ctx.save();
    if (s.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 6 * s.shake, (Math.random() - 0.5) * 6 * s.shake);
    }
    ctx.clearRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = '#080b18';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // starfield-ish backdrop
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 18; i++) {
      const y = ((i * 71 + (s.elapsed * 40)) % H);
      ctx.fillRect((i * 53) % W, y, 2, 2);
    }

    // bullets
    for (const b of s.bullets) {
      ctx.fillStyle = COLORS[b.color];
      ctx.fillRect(b.x - 2, b.y - 6, 4, 10);
    }

    // enemies
    for (const e of s.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = e.isRainbow ? '#ffffff' : COLORS[e.color];
      ctx.fill();
      if (e.isRainbow) {
        ctx.fillStyle = '#12162a';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', e.x, e.y + 1);
      } else if (e.hp < 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // particles
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.35);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    }

    // player ship
    const p = s.player;
    ctx.fillStyle = COLORS[p.color];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.h / 2);
    ctx.lineTo(p.x - p.w / 2, p.y + p.h / 2);
    ctx.lineTo(p.x + p.w / 2, p.y + p.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    comboLabel.textContent = 'COMBO ' + state.combo + ' (x' + multiplier().toFixed(1) + ')';
    livesLabel.textContent = '♥'.repeat(Math.max(0, state.lives)) + '☆'.repeat(Math.max(0, 3 - state.lives));
  }

  let lastTime = null;
  function loop(ts) {
    if (!state.running) return;
    if (lastTime === null) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    lastTime = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    updateHud();
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    let msg;
    if (state.score >= 800) msg = '色さばき完璧!トライカラー・マスター!';
    else if (state.score >= 400) msg = 'なかなかの腕前!';
    else msg = 'つぎは色あわせを意識してみよう!';
    resultTitleEl.textContent = 'GAME OVER';
    resultTextEl.textContent = `スコア: ${state.score} / 最大コンボ倍率 x${multiplier().toFixed(1)}\n${msg}`;
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    state = freshState();
    setPlayerColor('red');
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    lastTime = null;
    state.running = true;
    updateHud();
    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  for (const k of ORDER) {
    colorBtns[k].addEventListener('click', () => { if (state && state.running) setPlayerColor(k); });
  }

  window.addEventListener('keydown', (e) => {
    if (!state) return;
    state.keys[e.key] = true;
    if (!state.running) return;
    if (e.key === '1') setPlayerColor('red');
    if (e.key === '2') setPlayerColor('blue');
    if (e.key === '3') setPlayerColor('yellow');
  });
  window.addEventListener('keyup', (e) => {
    if (!state) return;
    state.keys[e.key] = false;
  });

  function pointerToX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state || !state.running) return;
    state.dragging = true;
    state.player.x = pointerToX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state || !state.dragging) return;
    state.player.x = pointerToX(e.clientX);
  });
  canvas.addEventListener('pointerup', () => { if (state) state.dragging = false; });
  canvas.addEventListener('pointercancel', () => { if (state) state.dragging = false; });

  // initial idle render behind the intro overlay
  state = freshState();
  draw();
})();
