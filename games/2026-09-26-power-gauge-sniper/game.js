(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const fireBtn = document.getElementById('fireBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');

  const LINE_Y = H * 0.56;
  const ENEMY_START_Y = 46;
  const GAUGE_Y = H - 92;
  const GAUGE_H = 34;
  const GAUGE_X = 24;
  const GAUGE_W = W - 48;
  const MAX_LIVES = 3;

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function beep(freq, dur, type, vol, delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sfxFire() { beep(520, 0.08, 'square', 0.15); }
  function sfxHit(precise) {
    if (precise) { beep(880, 0.1, 'triangle', 0.22); beep(1320, 0.12, 'triangle', 0.18, 0.05); }
    else { beep(660, 0.12, 'triangle', 0.2); }
  }
  function sfxGold() { beep(990, 0.1, 'sine', 0.2); beep(1320, 0.12, 'sine', 0.2, 0.08); beep(1760, 0.16, 'sine', 0.2, 0.16); }
  function sfxMiss() { beep(180, 0.14, 'sawtooth', 0.16); }
  function sfxLifeLost() { beep(140, 0.28, 'sawtooth', 0.22); }
  function sfxGameOver() {
    beep(300, 0.18, 'sawtooth', 0.2); beep(230, 0.18, 'sawtooth', 0.2, 0.16); beep(160, 0.3, 'sawtooth', 0.2, 0.32);
  }

  let running = false;
  let lastT = 0;
  let score = 0, combo = 0, lives = MAX_LIVES;
  let totalHits = 0; // never resets; drives difficulty
  let gaugePhase = 0;
  let enemy = null;
  let fireCooldown = 0;
  let flashMsg = null, flashTimer = 0;

  function difficulty() {
    const zoneHalf = Math.max(5, 14 - Math.floor(totalHits / 4));
    const freq = Math.min(1.7, 0.55 + totalHits * 0.03); // Hz
    const fallMs = Math.max(1900, 4600 - totalHits * 70);
    return { zoneHalf, freq, fallMs };
  }

  function spawnEnemy() {
    const d = difficulty();
    const isGold = totalHits > 0 && totalHits % 6 === 0 && (!enemy || !enemy.wasGold);
    const zoneHalf = isGold ? Math.min(22, d.zoneHalf + 8) : d.zoneHalf;
    const margin = zoneHalf + 4;
    const center = margin + Math.random() * (100 - margin * 2);
    enemy = {
      gold: isGold,
      wasGold: isGold,
      y: ENEMY_START_Y,
      startTime: performance.now(),
      fallMs: isGold ? d.fallMs * 1.15 : d.fallMs,
      zoneCenter: center,
      zoneHalf: zoneHalf,
      emoji: isGold ? '⭐' : ['👾', '👹', '🤖', '🦇'][Math.floor(Math.random() * 4)],
      dead: false,
    };
  }

  function resetGame() {
    score = 0; combo = 0; lives = MAX_LIVES; totalHits = 0;
    gaugePhase = 0; fireCooldown = 0; flashMsg = null;
    spawnEnemy();
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(MAX_LIVES - Math.max(0, lives));
  }

  function gaugeValue() {
    return (Math.sin(gaugePhase) + 1) / 2 * 100; // 0-100
  }

  function doFire() {
    if (!running || !enemy || enemy.dead) return;
    if (fireCooldown > 0) return;
    ensureAudio();
    sfxFire();
    const v = gaugeValue();
    const diff = Math.abs(v - enemy.zoneCenter);
    if (diff <= enemy.zoneHalf) {
      const precise = diff <= enemy.zoneHalf / 2;
      const gold = enemy.gold;
      combo++;
      totalHits++;
      let gained = 100 + combo * 8;
      if (precise) gained += 60;
      if (gold) gained *= 2;
      score += Math.round(gained);
      if (gold) {
        lives = Math.min(MAX_LIVES, lives + 1);
        sfxGold();
        flashMsg = '★ ボーナス撃破!';
      } else if (precise) {
        sfxHit(true);
        flashMsg = '会心!';
      } else {
        sfxHit(false);
        flashMsg = 'ヒット!';
      }
      flashTimer = 0.7;
      enemy.dead = true;
      updateHud();
      setTimeout(() => { if (running) spawnEnemy(); }, 260);
    } else {
      sfxMiss();
      fireCooldown = 0.28;
      flashMsg = 'ダメ!';
      flashTimer = 0.5;
    }
  }

  function loseLife() {
    lives--;
    combo = 0;
    sfxLifeLost();
    updateHud();
    if (lives <= 0) {
      endGame();
    } else {
      spawnEnemy();
    }
  }

  function endGame() {
    running = false;
    sfxGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = 'スコア ' + score + ' / 撃破数 ' + totalHits;
    result.classList.remove('hidden');
  }

  function drawGauge() {
    const v = gaugeValue();
    ctx.save();
    ctx.strokeStyle = '#3a4a70';
    ctx.lineWidth = 2;
    ctx.strokeRect(GAUGE_X, GAUGE_Y, GAUGE_W, GAUGE_H);
    ctx.fillStyle = 'rgba(20,26,48,0.9)';
    ctx.fillRect(GAUGE_X, GAUGE_Y, GAUGE_W, GAUGE_H);

    if (enemy && !enemy.dead) {
      const zx = GAUGE_X + (enemy.zoneCenter - enemy.zoneHalf) / 100 * GAUGE_W;
      const zw = (enemy.zoneHalf * 2) / 100 * GAUGE_W;
      ctx.fillStyle = enemy.gold ? 'rgba(255,210,63,0.55)' : 'rgba(125,255,179,0.4)';
      ctx.fillRect(zx, GAUGE_Y, zw, GAUGE_H);
      ctx.strokeStyle = enemy.gold ? '#ffd23f' : '#7dffb3';
      ctx.lineWidth = 2;
      ctx.strokeRect(zx, GAUGE_Y, zw, GAUGE_H);
    }

    const nx = GAUGE_X + v / 100 * GAUGE_W;
    ctx.fillStyle = fireCooldown > 0 ? '#ff5d6c' : '#f5f7ff';
    ctx.fillRect(nx - 2, GAUGE_Y - 6, 4, GAUGE_H + 12);
    ctx.restore();
  }

  function drawEnemy() {
    if (!enemy || enemy.dead) return;
    const now = performance.now();
    const t = Math.min(1, (now - enemy.startTime) / enemy.fallMs);
    const y = ENEMY_START_Y + t * (LINE_Y - ENEMY_START_Y);
    ctx.save();
    ctx.font = enemy.gold ? '40px sans-serif' : '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enemy.emoji, W / 2, y);
    ctx.restore();
    if (t >= 1) {
      enemy.dead = true;
      setTimeout(() => { if (running) loseLife(); }, 0);
    }
  }

  function drawScene() {
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0c1230');
    grad.addColorStop(1, '#080b18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,93,108,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, LINE_Y);
    ctx.lineTo(W, LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,93,108,0.8)';
    ctx.fillText('ライン', 8, LINE_Y - 6);
    ctx.restore();

    drawEnemy();
    drawGauge();

    if (flashMsg && flashTimer > 0) {
      ctx.save();
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = flashMsg.includes('ダメ') ? '#ff5d6c' : (flashMsg.includes('★') ? '#ffd23f' : '#7dffb3');
      ctx.globalAlpha = Math.min(1, flashTimer * 2);
      ctx.fillText(flashMsg, W / 2, GAUGE_Y - 26);
      ctx.restore();
    }
  }

  function tick(now) {
    if (!running) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;

    const d = difficulty();
    gaugePhase += dt * d.freq * Math.PI * 2;
    if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);
    if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);

    drawScene();
    requestAnimationFrame(tick);
  }

  function startGame() {
    ensureAudio();
    resetGame();
    result.classList.add('hidden');
    intro.classList.add('hidden');
    running = true;
    lastT = 0;
    requestAnimationFrame(tick);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  fireBtn.addEventListener('click', (e) => { e.preventDefault(); doFire(); });
  fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doFire(); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (running) doFire();
    }
  });

  updateHud();
  drawScene();
})();
