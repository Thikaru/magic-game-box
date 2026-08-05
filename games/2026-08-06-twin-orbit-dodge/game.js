(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');

  // ---- audio: Web Audio API での自前生成音(外部ファイル不使用) ----
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    } else if (actx.state === 'suspended') {
      actx.resume();
    }
  }
  function beep(freq, dur, type, vol) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol == null ? 0.1 : vol;
    osc.connect(gain).connect(actx.destination);
    const now = actx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }
  function noiseBurst(dur, vol) {
    if (!actx) return;
    const bufSize = Math.floor(actx.sampleRate * dur);
    const buffer = actx.createBuffer(1, bufSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = actx.createBufferSource();
    src.buffer = buffer;
    const gain = actx.createGain();
    gain.gain.value = vol == null ? 0.12 : vol;
    src.connect(gain).connect(actx.destination);
    const now = actx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.start(now);
  }
  const sfxHit = () => noiseBurst(0.22, 0.16);
  const sfxNearMiss = () => beep(1300, 0.08, 'sine', 0.14);
  const sfxClear = () => beep(700, 0.06, 'triangle', 0.08);
  const sfxOver = () => { beep(280, 0.2, 'sawtooth', 0.1); setTimeout(() => beep(150, 0.35, 'sawtooth', 0.1), 140); };

  // ---- constants ----
  const ROD_R = 42;      // 棒の半径(中心からの距離)
  const END_R = 9;       // 端点の当たり半径
  const DOT_R = 5;       // 弾の半径
  const NEAR_MISS_MARGIN = 9; // このクリアランス以下ならニアミス
  const MOVE_SPEED = 230; // キーボード移動速度 px/s
  const PLAY_TOP = 50, PLAY_BOTTOM = H - 20;

  function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

  // 経過秒数から難易度パラメータを算出
  function paramsFor(elapsed) {
    let rotSpeed, spawnMs, gapWidth, fallSpeed, twoGapChance, diagonalChance;
    if (elapsed < 30) {
      const t = elapsed / 30;
      rotSpeed = lerp(0.6, 0.75, t);
      spawnMs = lerp(950, 850, t);
      gapWidth = lerp(170, 150, t);
      fallSpeed = lerp(140, 170, t);
      twoGapChance = 0;
      diagonalChance = 0;
    } else if (elapsed < 60) {
      const t = (elapsed - 30) / 30;
      rotSpeed = lerp(0.75, 1.0, t);
      spawnMs = lerp(850, 700, t);
      gapWidth = lerp(150, 125, t);
      fallSpeed = lerp(170, 210, t);
      twoGapChance = 0.15;
      diagonalChance = 0;
    } else if (elapsed < 120) {
      const t = (elapsed - 60) / 60;
      rotSpeed = lerp(1.0, 1.5, t);
      spawnMs = lerp(700, 550, t);
      gapWidth = lerp(125, 105, t);
      fallSpeed = lerp(210, 260, t);
      twoGapChance = 0.25;
      diagonalChance = 0.25;
    } else {
      const t = Math.min(1, (elapsed - 120) / 60);
      rotSpeed = lerp(1.5, 2.2, t);
      spawnMs = lerp(550, 420, t);
      gapWidth = lerp(105, 95, t);
      fallSpeed = lerp(260, 320, t);
      twoGapChance = 0.35;
      diagonalChance = 0.4;
    }
    return { rotSpeed, spawnMs, gapWidth, fallSpeed, twoGapChance, diagonalChance };
  }

  // ---- state ----
  let state = 'intro'; // intro | playing | over
  let px, py, angle, rotSign;
  let waves, particles;
  let score, lives, combo, invincibleT, nearMissCount, cleanWaves;
  let elapsed, spawnTimer, lastBreatherStage;
  let keys = {};
  let dragging = false;
  let lastTime = null;

  function resetGame() {
    px = W / 2; py = H - 110;
    angle = 0;
    rotSign = 1;
    waves = [];
    particles = [];
    score = 0;
    lives = 3;
    combo = 1;
    invincibleT = 0;
    nearMissCount = 0;
    cleanWaves = 0;
    elapsed = 0;
    spawnTimer = 500;
    lastBreatherStage = -1;
    keys = {};
    dragging = false;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
    comboLabel.textContent = '×' + combo.toFixed(1).replace(/\.0$/, '');
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
  }

  function endPoints() {
    const c = Math.cos(angle), s = Math.sin(angle);
    return {
      a: { x: px + ROD_R * c, y: py + ROD_R * s },
      b: { x: px - ROD_R * c, y: py - ROD_R * s },
    };
  }

  // ---- 入力 ----
  function clampPivot() {
    px = Math.max(ROD_R + END_R, Math.min(W - ROD_R - END_R, px));
    py = Math.max(PLAY_TOP + ROD_R + END_R, Math.min(PLAY_BOTTOM - END_R, py));
  }

  function pointFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const cx = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const cy = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    dragging = true;
    const p = pointFromEvent(e);
    px = p.x; py = p.y;
    clampPivot();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || state !== 'playing') return;
    const p = pointFromEvent(e);
    px = p.x; py = p.y;
    clampPivot();
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) e.preventDefault();
    keys[k] = true;
  }, { passive: false });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // ---- 弾壁の生成 ----
  function spawnWave() {
    const p = paramsFor(elapsed);
    const twoGaps = Math.random() < p.twoGapChance;
    const gaps = [];
    if (twoGaps) {
      gaps.push(30 + Math.random() * (W / 2 - 60));
      gaps.push(W / 2 + 30 + Math.random() * (W / 2 - 60));
    } else {
      gaps.push(30 + Math.random() * (W - 60));
    }
    const diagonal = Math.random() < p.diagonalChance;
    const vx = diagonal ? (Math.random() < 0.5 ? -34 : 34) : 0;

    const dots = [];
    const spacing = 16;
    for (let x = spacing / 2; x < W; x += spacing) {
      const inGap = gaps.some((g) => Math.abs(x - g) < p.gapWidth / 2);
      if (!inGap) dots.push(x);
    }
    waves.push({
      y: -10, vy: p.fallSpeed, vx, xShift: 0,
      dots, resolved: false, minClear: Infinity, hitThisWave: false,
    });
  }

  function nextSpawnDelay() {
    const p = paramsFor(elapsed);
    const stage = elapsed < 30 ? 0 : elapsed < 60 ? 1 : elapsed < 120 ? 2 : 3;
    let delay = p.spawnMs;
    if (stage !== lastBreatherStage && stage > 0) {
      delay *= 1.4; // 難易度帯が切り替わった直後は一呼吸おく
      lastBreatherStage = stage;
    }
    return delay;
  }

  // ---- 更新 ----
  function addParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.45, color });
    }
  }

  let shakeT = 0;

  function hitEnd(pt) {
    if (invincibleT > 0) return;
    lives--;
    combo = 1;
    cleanWaves = 0;
    invincibleT = 1.0;
    shakeT = 0.25;
    addParticles(pt.x, pt.y, '#ff5d7a', 14);
    sfxHit();
    updateHud();
    if (lives <= 0) {
      endGame();
    }
  }

  function update(dt) {
    elapsed += dt;
    const p = paramsFor(elapsed);

    angle += p.rotSpeed * rotSign * dt;

    let vx = 0, vy = 0;
    if (keys.arrowleft || keys.a) vx -= 1;
    if (keys.arrowright || keys.d) vx += 1;
    if (keys.arrowup || keys.w) vy -= 1;
    if (keys.arrowdown || keys.s) vy += 1;
    if (vx || vy) {
      const len = Math.hypot(vx, vy) || 1;
      px += (vx / len) * MOVE_SPEED * dt;
      py += (vy / len) * MOVE_SPEED * dt;
      clampPivot();
    }

    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnWave();
      spawnTimer = nextSpawnDelay();
    }

    const { a: endA, b: endB } = endPoints();
    score += dt * 10 * combo;

    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.y += w.vy * dt;
      w.xShift += w.vx * dt;

      // 自機の高さ付近にいる間、クリアランス(最小距離)を追跡
      if (!w.resolved && w.y > py - 60 && w.y < py + 60) {
        for (const dotX of w.dots) {
          const dx = dotX + w.xShift;
          const dA = Math.hypot(dx - endA.x, w.y - endA.y) - (DOT_R + END_R);
          const dB = Math.hypot(dx - endB.x, w.y - endB.y) - (DOT_R + END_R);
          const clear = Math.min(dA, dB);
          if (clear < w.minClear) w.minClear = clear;
          if (clear <= 0 && !w.hitThisWave) {
            w.hitThisWave = true;
            hitEnd(dA < dB ? endA : endB);
          }
        }
      }

      if (!w.resolved && w.y > py + 60) {
        w.resolved = true;
        if (!w.hitThisWave) {
          cleanWaves++;
          combo = Math.min(3, 1 + cleanWaves * 0.2);
          score += 15 * combo;
          sfxClear();
          if (w.minClear < NEAR_MISS_MARGIN) {
            nearMissCount++;
            score += 5;
            sfxNearMiss();
            addParticles((endA.x + endB.x) / 2, (endA.y + endB.y) / 2, '#9dfff0', 8);
          }
          updateHud();
        }
      }

      if (w.y - 20 > H) waves.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 160 * dt; pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }

    if (invincibleT > 0) invincibleT -= dt;
    if (shakeT > 0) shakeT -= dt;
  }

  // ---- 描画 ----
  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120c30'); g.addColorStop(1, '#0a0820');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(157,255,240,.12)';
    ctx.lineWidth = 1;
    for (let y = PLAY_TOP; y < H; y += 34) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawWaves() {
    ctx.fillStyle = '#ff5d7a';
    for (const w of waves) {
      for (const dotX of w.dots) {
        const x = dotX + w.xShift;
        if (x < -10 || x > W + 10) continue;
        ctx.beginPath();
        ctx.arc(x, w.y, DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRod() {
    if (invincibleT > 0 && Math.floor(invincibleT * 14) % 2 === 0) return;
    const { a: endA, b: endB } = endPoints();
    // 棒が縦向き(横幅が細い = 隙間を通りやすい)瞬間は、回転位相を読みやすいよう光らせる
    const horizWidth = Math.abs(2 * ROD_R * Math.cos(angle));
    const isNarrow = horizWidth < 35;

    ctx.save();
    if (isNarrow) {
      ctx.shadowColor = '#ffe98a';
      ctx.shadowBlur = 16;
    }
    ctx.strokeStyle = isNarrow ? '#ffe98a' : 'rgba(157,255,240,.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(endA.x, endA.y);
    ctx.lineTo(endB.x, endB.y);
    ctx.stroke();

    ctx.fillStyle = isNarrow ? '#ffe98a' : '#9dfff0';
    for (const pt of [endA, endB]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, END_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#12102a';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / 0.45);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 6 * (shakeT / 0.25), (Math.random() - 0.5) * 6 * (shakeT / 0.25));
    }
    drawBackground();
    if (state !== 'intro') {
      drawWaves();
      drawParticles();
      drawRod();
    }
    ctx.restore();
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
    lastTime = null;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
  }

  function endGame() {
    state = 'over';
    sfxOver();
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML =
      '生存タイム <b>' + elapsed.toFixed(1) + '秒</b><br>' +
      'スコア <b>' + Math.floor(score) + '</b><br>' +
      'ニアミス回数 <b>' + nearMissCount + '</b>';
    resultEl.classList.remove('hidden');
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  resetGame();
  requestAnimationFrame(loop);
})();
