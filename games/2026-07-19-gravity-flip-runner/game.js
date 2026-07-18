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
  const levelLabelEl = document.getElementById('levelLabel');
  const flashMsgEl = document.getElementById('flashMsg');

  let W = 360, H = 380, DPR = 1;
  let CEIL_Y = 40, FLOOR_Y = 340, PLAYER_X = 90;
  const PLAYER_R = 15;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CEIL_Y = Math.round(H * 0.12);
    FLOOR_Y = Math.round(H * 0.88);
    PLAYER_X = Math.round(W * 0.24);
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
  const sfxFlip = () => beep(520, 0.08, 'square', 0.06);
  const sfxGem = (combo) => beep(700 + Math.min(combo, 8) * 60, 0.14, 'triangle', 0.09);
  const sfxHit = () => { beep(160, 0.22, 'sawtooth', 0.1); };
  const sfxLevel = () => { beep(660, 0.1, 'triangle', 0.08); setTimeout(() => beep(880, 0.12, 'triangle', 0.08), 90); };
  const sfxOver = () => { beep(300, 0.2, 'sawtooth', 0.09); setTimeout(() => beep(160, 0.35, 'sawtooth', 0.09), 150); };

  // ---- constants ----
  const BASE_SPEED = 170, SPEED_STEP = 11, MAX_SPEED = 360;
  const LEVEL_UP_EVERY = 6;
  const INVINCIBLE_TIME = 0.9;
  const OBS_W = 26, OBS_H = 44, GEM_R = 13;
  const GEM_CHANCE = 0.26;

  // ---- state ----
  let state = 'intro'; // intro | playing | over
  let player, obstacles, particles;
  let lives, score, level, obstaclesCleared, comboGem, bestComboGem;
  let invincibleTimer, spawnTimer, flashTimer;
  let lastTime = 0;

  function speedFor() { return Math.min(MAX_SPEED, BASE_SPEED + level * SPEED_STEP); }
  function spawnIntervalFor() { return Math.max(780, 1450 - level * 65); }

  function resetGame() {
    player = { rail: 1, visualY: 0, tilt: 0 };
    player.visualY = FLOOR_Y - PLAYER_R - 4;
    obstacles = [];
    particles = [];
    lives = 3; score = 0; level = 0; obstaclesCleared = 0;
    comboGem = 0; bestComboGem = 0;
    invincibleTimer = 0; spawnTimer = 500; flashTimer = 0;
    updateHud();
  }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
    scoreLabelEl.textContent = 'SCORE ' + score;
    levelLabelEl.textContent = 'Lv.' + (level + 1);
  }

  function showFlash(text, cls) {
    flashMsgEl.textContent = text;
    flashMsgEl.className = 'flashMsg ' + cls;
    flashTimer = 0.7;
  }

  function railCenterY(rail) {
    return rail === 0 ? CEIL_Y + PLAYER_R + 8 : FLOOR_Y - PLAYER_R - 8;
  }

  function flip() {
    if (state !== 'playing') return;
    player.rail = player.rail === 0 ? 1 : 0;
    sfxFlip();
  }

  function spawnObstacle(xOverride, forceRail) {
    const rail = forceRail !== undefined ? forceRail : (Math.random() < 0.5 ? 0 : 1);
    const isGem = forceRail === undefined && Math.random() < GEM_CHANCE;
    obstacles.push({
      x: xOverride !== undefined ? xOverride : W + 40,
      rail,
      type: isGem ? 'gem' : 'spike',
      resolved: false,
    });
    // 上級レベルでは、まれに反対レールのペアを近距離に配置して素早い二段フリップを要求する
    if (forceRail === undefined && level >= 3 && !isGem && Math.random() < 0.22) {
      const gap = 130 + Math.random() * 40;
      obstacles.push({
        x: (xOverride !== undefined ? xOverride : W + 40) + gap,
        rail: rail === 0 ? 1 : 0,
        type: 'spike',
        resolved: false,
      });
    }
  }

  function addParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 100;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.5, color });
    }
  }

  function loseLife() {
    lives--;
    comboGem = 0;
    invincibleTimer = INVINCIBLE_TIME;
    sfxHit();
    showFlash('ダメージ!', 'bad');
    updateHud();
    if (lives <= 0) {
      endGame();
    }
  }

  function collectGem(x, y) {
    comboGem++;
    bestComboGem = Math.max(bestComboGem, comboGem);
    const gain = 20 + comboGem * 10;
    score += gain;
    addParticles(x, y, '#ffd166', 14);
    sfxGem(comboGem);
    showFlash(comboGem >= 3 ? `コンボ${comboGem}! +${gain}` : `ジェム! +${gain}`, 'bonus');
    updateHud();
  }

  function clearObstacle() {
    score += 10;
    obstaclesCleared++;
    updateHud();
    const newLevel = Math.floor(obstaclesCleared / LEVEL_UP_EVERY);
    if (newLevel > level) {
      level = newLevel;
      sfxLevel();
      showFlash('スピードアップ!', 'ok');
      updateHud();
    }
  }

  function endGame() {
    state = 'over';
    sfxOver();
    resultTitleEl.textContent = 'ゲーム終了';
    resultTextEl.innerHTML =
      'スコア <b>' + score + '</b><br>' +
      '突破したレール数 ' + obstaclesCleared + '<br>' +
      'ベストジェムコンボ ' + bestComboGem;
    resultEl.classList.remove('hidden');
  }

  // ---- input ----
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flip(); });
  window.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      flip();
    }
  });

  // ---- update ----
  function update(dt) {
    const speed = speedFor();

    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = spawnIntervalFor();
    }

    for (const o of obstacles) {
      o.x -= speed * dt;
      if (!o.resolved) {
        const w = o.type === 'gem' ? GEM_R * 2 : OBS_W;
        const overlaps = (o.x - w / 2) <= (PLAYER_X + PLAYER_R) && (o.x + w / 2) >= (PLAYER_X - PLAYER_R);
        if (overlaps) {
          o.resolved = true;
          const oy = railCenterY(o.rail);
          if (o.type === 'gem') {
            if (o.rail === player.rail) collectGem(o.x, oy);
            else comboGem = 0;
          } else {
            if (o.rail === player.rail && invincibleTimer <= 0) {
              loseLife();
              addParticles(PLAYER_X, player.visualY, '#ff5d5d', 12);
            } else if (o.rail === player.rail) {
              // 無敵中はすり抜け
            } else {
              clearObstacle();
            }
          }
        }
      }
    }
    obstacles = obstacles.filter(o => o.x > -60);

    for (const p of particles.slice()) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(particles.indexOf(p), 1);
    }

    const targetY = railCenterY(player.rail);
    player.visualY += (targetY - player.visualY) * Math.min(1, dt * 12);
    const targetTilt = player.rail === 0 ? -0.22 : 0.22;
    player.tilt += (targetTilt - player.tilt) * Math.min(1, dt * 10);

    if (invincibleTimer > 0) invincibleTimer -= dt;
    if (flashTimer > 0) flashTimer -= dt;
  }

  // ---- render ----
  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c1836'); g.addColorStop(1, '#050a1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(77,216,255,.08)';
    ctx.lineWidth = 1;
    for (let x = (W % 30); x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, CEIL_Y); ctx.lineTo(x, FLOOR_Y); ctx.stroke();
    }
  }

  function drawRails() {
    ctx.fillStyle = '#2f5adb';
    ctx.fillRect(0, CEIL_Y - 6, W, 6);
    ctx.fillRect(0, FLOOR_Y, W, 6);
    ctx.fillStyle = 'rgba(77,216,255,.5)';
    ctx.fillRect(0, CEIL_Y - 2, W, 2);
    ctx.fillRect(0, FLOOR_Y + 4, W, 2);
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.type === 'spike') {
        ctx.fillStyle = o.resolved && o.rail !== player.rail ? 'rgba(255,93,93,.35)' : '#ff5d5d';
        ctx.beginPath();
        if (o.rail === 0) {
          ctx.moveTo(o.x - OBS_W / 2, CEIL_Y);
          ctx.lineTo(o.x + OBS_W / 2, CEIL_Y);
          ctx.lineTo(o.x, CEIL_Y + OBS_H);
        } else {
          ctx.moveTo(o.x - OBS_W / 2, FLOOR_Y);
          ctx.lineTo(o.x + OBS_W / 2, FLOOR_Y);
          ctx.lineTo(o.x, FLOOR_Y - OBS_H);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        const y = railCenterY(o.rail);
        const grad = ctx.createRadialGradient(o.x - 4, y - 4, 2, o.x, y, GEM_R);
        grad.addColorStop(0, '#fff4cf');
        grad.addColorStop(1, o.resolved ? 'rgba(255,209,102,.25)' : '#ffd166');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, y, GEM_R, 0, Math.PI * 2);
        ctx.fill();
        if (!o.resolved) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  function drawPlayer() {
    const blink = invincibleTimer > 0 && Math.floor(invincibleTimer * 14) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(PLAYER_X, player.visualY);
    ctx.rotate(player.tilt);
    ctx.fillStyle = '#4dd8ff';
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#071022';
    const eyeDir = player.rail === 0 ? -1 : 1;
    ctx.beginPath(); ctx.arc(4, eyeDir * 2, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-5, eyeDir * 3, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(p.life / 0.5, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawComboLabel() {
    if (comboGem <= 0) return;
    ctx.fillStyle = 'rgba(255,209,102,.9)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GEM COMBO ' + comboGem, W / 2, H - 8);
  }

  function render() {
    drawBackground();
    drawRails();
    drawObstacles();
    drawPlayer();
    drawParticles();
    drawComboLabel();
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
    resize();
    resetGame();
    state = 'playing';
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    flashMsgEl.textContent = '';
    flashMsgEl.className = 'flashMsg';
    lastTime = 0;
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  resize();
  resetGame();
  requestAnimationFrame(loop);
})();
