(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const ROAD_LEFT = 30, LANE_W = 100, LANE_COUNT = 3;
  const PLAYER_TOP = H - 130, PLAYER_H = 60, PLAYER_W = 42;
  const COLLISION_GAP = 8;
  const GREAT_GAP = 45;
  const GOOD_GAP = 100;

  const CAR_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d'];

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, level = 1, passedCount = 0;
  let speed = 150, spawnTimer = 600, roadScroll = 0;
  let player = { lane: 1, x: laneX(1), targetX: laneX(1) };
  let obstacles = [];
  let floatTexts = [];
  let particles = [];
  let flashTimer = 0, flashColor = '255,60,70';
  let shakeTimer = 0;
  let lastTs = 0;
  let rafId = null;

  function laneX(i) { return ROAD_LEFT + LANE_W * i + LANE_W / 2; }

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
  function playSwitch() { beep(500, 0.05, 'square', 0.08); }
  function playGood() { beep(560, 0.08, 'triangle', 0.16); beep(760, 0.09, 'triangle', 0.14, 0.05); }
  function playGreat() { beep(700, 0.09, 'sine', 0.2); beep(940, 0.1, 'sine', 0.18, 0.06); beep(1180, 0.12, 'sine', 0.16, 0.12); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(880, 0.12, 'sine', 0.2, 0.06); beep(1100, 0.14, 'sine', 0.18, 0.12); }
  function playCrash() { beep(140, 0.28, 'sawtooth', 0.24); beep(90, 0.3, 'sawtooth', 0.2, 0.05); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function multiplier() { return 1 + Math.floor(combo / 8) * 0.5; }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1; passedCount = 0;
    speed = 150; spawnTimer = 500; roadScroll = 0;
    player = { lane: 1, x: laneX(1), targetX: laneX(1) };
    obstacles = []; floatTexts = []; particles = [];
    flashTimer = 0; shakeTimer = 0;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  function setLane(n) {
    if (state !== 'playing') return;
    n = Math.max(0, Math.min(LANE_COUNT - 1, n));
    if (n === player.lane) return;
    player.lane = n;
    player.targetX = laneX(n);
    playSwitch();
  }

  leftBtn.addEventListener('click', () => setLane(player.lane - 1));
  rightBtn.addEventListener('click', () => setLane(player.lane + 1));
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) * (W / rect.width);
    setLane(player.lane + (relX < W / 2 ? -1 : 1));
  });
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); setLane(player.lane - 1); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); setLane(player.lane + 1); }
  });

  function spawnFloatText(text, x, y, color) {
    floatTexts.push({ text, x, y, life: 0.8, maxLife: 0.8, color });
  }
  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < (n || 10); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 30, life: 0.5, maxLife: 0.5, color });
    }
  }

  function spawnMinMax() {
    const lv = Math.min(level, 14);
    return [Math.max(360, 950 - lv * 42), Math.max(560, 1350 - lv * 55)];
  }

  function spawnObstacle() {
    const isTruck = level >= 3 && Math.random() < 0.22;
    let lanes, w, h, isGold = false;
    if (isTruck) {
      const pairs = [[0, 1], [1, 2]];
      lanes = pairs[Math.floor(Math.random() * pairs.length)];
      w = LANE_W * 2 - 24; h = 74;
    } else {
      lanes = [Math.floor(Math.random() * LANE_COUNT)];
      w = 50; h = 62;
      isGold = Math.random() < 0.08;
    }
    const cx = lanes.length === 2 ? (laneX(lanes[0]) + laneX(lanes[1])) / 2 : laneX(lanes[0]);
    obstacles.push({
      lanes, x: cx - w / 2, y: -h - 10, w, h, isGold, isTruck,
      color: isGold ? '#ffd23f' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      resolved: false, wasSameLane: false, bestGap: Infinity,
    });
  }

  function resolveCollision(o) {
    o.resolved = true;
    lives--; combo = 0;
    flashTimer = 0.35; flashColor = '255,60,70';
    shakeTimer = 0.3;
    playCrash();
    spawnParticles(player.x, PLAYER_TOP + PLAYER_H / 2, '#ff5d6c', 14);
    updateHud();
    passedCount++;
    maybeLevelUp();
    if (lives <= 0) endGame();
  }

  function resolveDodge(o) {
    o.resolved = true;
    let tier = o.bestGap < GREAT_GAP ? 'GREAT' : (o.bestGap < GOOD_GAP ? 'GOOD' : 'SAFE');
    combo++;
    const table = o.isGold ? { GREAT: 90, GOOD: 60, SAFE: 40 } : { GREAT: 50, GOOD: 25, SAFE: 8 };
    score += table[tier] * multiplier();
    if (tier === 'GREAT') {
      spawnFloatText('🌟ニアミス!', player.x, PLAYER_TOP - 6, '#ffd23f');
      playGreat();
    } else if (tier === 'GOOD') {
      spawnFloatText('ナイス!', player.x, PLAYER_TOP - 6, '#5be3c9');
      playGood();
    }
    if (o.isGold && tier !== 'SAFE') {
      if (lives < 3) { lives++; playGold(); } else { score += 30 * multiplier(); playGold(); }
    }
    updateHud();
    passedCount++;
    maybeLevelUp();
  }

  function resolveFreePass(o) {
    o.resolved = true;
    passedCount++;
    maybeLevelUp();
  }

  function maybeLevelUp() {
    const nl = Math.floor(passedCount / 8) + 1;
    if (nl !== level) {
      level = nl;
      speed = Math.min(340, 150 + level * 18);
    }
  }

  function update(dt) {
    roadScroll += speed * dt;
    score += dt * speed * 0.02 * multiplier();

    player.x += (player.targetX - player.x) * Math.min(1, dt * 12);

    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnObstacle();
      const [mn, mx] = spawnMinMax();
      spawnTimer = mn + Math.random() * (mx - mn);
    }

    for (const o of obstacles) {
      if (o.resolved) { o.y += speed * dt; continue; }
      o.y += speed * dt;
      const isSameLane = o.lanes.includes(player.lane);
      if (isSameLane) {
        const gap = PLAYER_TOP - (o.y + o.h);
        if (gap <= COLLISION_GAP) {
          resolveCollision(o);
        } else {
          o.bestGap = Math.min(o.bestGap, gap);
          o.wasSameLane = true;
        }
      } else if (o.wasSameLane) {
        resolveDodge(o);
      }
      if (!o.resolved && o.y > H + 40) resolveFreePass(o);
    }
    obstacles = obstacles.filter(o => o.y < H + 80);

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      f.y -= 40 * dt; f.life -= dt;
      if (f.life <= 0) floatTexts.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
  }

  function endGame() {
    state = 'gameover';
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${Math.floor(score)} / レベル ${level} まで到達!`;
    resultEl.classList.remove('hidden');
  }

  function drawRoad() {
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(ROAD_LEFT, 0, LANE_W * LANE_COUNT, H);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT, 0); ctx.lineTo(ROAD_LEFT, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROAD_LEFT + LANE_W * LANE_COUNT, 0); ctx.lineTo(ROAD_LEFT + LANE_W * LANE_COUNT, H); ctx.stroke();

    const dashLen = 30, gapLen = 24, period = dashLen + gapLen;
    const offset = roadScroll % period;
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 4;
    ctx.setLineDash([dashLen, gapLen]);
    for (let i = 1; i < LANE_COUNT; i++) {
      const x = ROAD_LEFT + LANE_W * i;
      ctx.beginPath();
      ctx.moveTo(x, -period + offset);
      ctx.lineTo(x, H + period);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(cx, topY, w, h, color, facingDown) {
    ctx.fillStyle = color;
    roundRect(cx - w / 2, topY, w, h, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,25,35,.55)';
    const wy = facingDown ? topY + h * 0.16 : topY + h * 0.55;
    roundRect(cx - w / 2 + 6, wy, w - 12, h * 0.32, 4);
    ctx.fill();
    ctx.fillStyle = '#12161d';
    const wheelY1 = topY + 8, wheelY2 = topY + h - 12;
    ctx.fillRect(cx - w / 2 - 2, wheelY1, 5, 12);
    ctx.fillRect(cx + w / 2 - 3, wheelY1, 5, 12);
    ctx.fillRect(cx - w / 2 - 2, wheelY2, 5, 12);
    ctx.fillRect(cx + w / 2 - 3, wheelY2, 5, 12);
  }

  function draw() {
    ctx.save();
    if (shakeTimer > 0) {
      ctx.translate((Math.random() - 0.5) * 6 * (shakeTimer / 0.3), (Math.random() - 0.5) * 6 * (shakeTimer / 0.3));
    }
    drawRoad();

    for (const o of obstacles) {
      const cx = o.x + o.w / 2;
      ctx.globalAlpha = o.resolved ? 0.55 : 1;
      drawCar(cx, o.y, o.w, o.h, o.color, true);
      if (o.isGold && !o.resolved) {
        ctx.fillStyle = '#5a4400';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('★', cx, o.y - 6);
      }
      ctx.globalAlpha = 1;
    }

    drawCar(player.x, PLAYER_TOP, PLAYER_W, PLAYER_H, '#5be3c9', false);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of floatTexts) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (flashTimer > 0) {
      ctx.fillStyle = `rgba(${flashColor},${(flashTimer / 0.35) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
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

  reset();
  draw();
  rafId = requestAnimationFrame(loop);
})();
