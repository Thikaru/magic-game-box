(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const ROAD_LEFT = 46, ROAD_RIGHT = W - 46;
  const CAR_X = W / 2, CAR_Y = H - 96;
  const GATE_SPAWN_Y = 74;
  const GATE_SCALE = 2.15; // px per (speed-unit * second)
  const BRAKE_DECEL = 92; // speed units per second while braking
  const MAX_SPEED = 100;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const clearLabel = document.getElementById('clearLabel');
  const brakeBtn = document.getElementById('brakeBtn');

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, clearedCount = 0;
  let speed = 30;
  let braking = false;
  let gate = null; // {y, limit, type, }
  let gateTimer = 0.6;
  let forceGoldNext = false;
  let lastComboMilestone = 0;
  let roadOffset = 0;
  let crashFlash = 0;
  let judgeFlash = null; // {text, color, t}
  let lastTs = 0;
  let rafId = null;

  let audioCtx = null;
  let engineOsc = null, engineGain = null;
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
  function playPerfect() { beep(720, 0.08, 'triangle', 0.2); beep(1080, 0.12, 'triangle', 0.18, 0.06); }
  function playNice() { beep(560, 0.09, 'triangle', 0.18); }
  function playSafe() { beep(420, 0.09, 'sine', 0.14); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(990, 0.16, 'sine', 0.2, 0.07); beep(1320, 0.16, 'sine', 0.16, 0.14); }
  function playCrash() { beep(140, 0.22, 'sawtooth', 0.24); beep(90, 0.28, 'square', 0.2, 0.05); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function startEngine() {
    const ac = ensureAudio();
    if (engineOsc) return;
    engineOsc = ac.createOscillator();
    engineGain = ac.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(60, ac.currentTime);
    engineGain.gain.setValueAtTime(0.035, ac.currentTime);
    engineOsc.connect(engineGain).connect(ac.destination);
    engineOsc.start();
  }
  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch (e) { /* already stopped */ }
    engineOsc.disconnect(); engineGain.disconnect();
    engineOsc = null; engineGain = null;
  }
  function updateEngine() {
    if (!engineOsc) return;
    const f = 55 + (speed / MAX_SPEED) * 150;
    engineOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.05);
  }

  function reset() {
    score = 0; combo = 0; lives = 3; clearedCount = 0;
    speed = 30; braking = false; gate = null; gateTimer = 0.6;
    forceGoldNext = false; lastComboMilestone = 0; roadOffset = 0;
    crashFlash = 0; judgeFlash = null;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    clearLabel.textContent = '通過 ' + clearedCount;
  }

  function multiplier() { return 1 + Math.floor(combo / 5) * 0.5; }

  function accelRate() { return Math.min(46, 16 + clearedCount * 0.9); }

  function gateGap() { return Math.max(0.35, 1.15 - clearedCount * 0.02); }

  function spawnGate() {
    let type = 'normal';
    if (forceGoldNext) { type = 'gold'; forceGoldNext = false; }

    let limit;
    if (type === 'gold') {
      limit = 90;
    } else {
      const t = clearedCount;
      const width = Math.max(8, 30 - t * 0.4);
      const center = Math.max(38, 85 - t * 1.0);
      const minLimit = Math.max(15, center - width / 2);
      const maxLimit = Math.min(98, center + width / 2);
      limit = Math.round((minLimit + Math.random() * (maxLimit - minLimit)) / 2) * 2;
    }
    gate = { y: GATE_SPAWN_Y, limit, type };
  }

  function judgeGate() {
    const margin = gate.limit - speed;
    if (margin < 0) {
      lives--;
      combo = 0;
      speed = Math.max(10, gate.limit * 0.4);
      crashFlash = 0.35;
      judgeFlash = { text: 'クラッシュ!', color: '#ff5d6c', t: 0.7 };
      playCrash();
      updateHud();
      if (lives <= 0) { endGame(); gate = null; gateTimer = 999; return; }
    } else {
      clearedCount++;
      let tier, bonus, text, color;
      if (gate.type === 'gold') {
        tier = 'gold'; bonus = 150; text = '⭐ボーナス!'; color = '#ffd23f';
        lives = Math.min(3, lives + 1);
        playGold();
      } else if (margin <= 6) {
        tier = 'perfect'; bonus = 120; text = 'ジャスト!!'; color = '#7dd8ff';
        playPerfect();
      } else if (margin <= 20) {
        tier = 'nice'; bonus = 60; text = 'ナイス!'; color = '#6be08a';
        playNice();
      } else {
        tier = 'safe'; bonus = 25; text = 'セーフ'; color = '#cfd0e0';
        playSafe();
      }
      combo++;
      score += bonus * multiplier();
      judgeFlash = { text, color, t: 0.6 };
      if (combo > 0 && combo % 5 === 0 && combo !== lastComboMilestone) {
        lastComboMilestone = combo;
        forceGoldNext = true;
      }
      updateHud();
    }
    gate = null;
    gateTimer = gateGap();
  }

  function endGame() {
    state = 'gameover';
    stopEngine();
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${Math.floor(score)} / ${clearedCount}コーナー通過!`;
    resultEl.classList.remove('hidden');
  }

  function setBraking(on) {
    if (state !== 'playing') return;
    braking = on;
    brakeBtn.classList.toggle('on', on);
  }

  brakeBtn.addEventListener('pointerdown', e => { e.preventDefault(); setBraking(true); });
  window.addEventListener('pointerup', () => setBraking(false));
  brakeBtn.addEventListener('pointercancel', () => setBraking(false));
  brakeBtn.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setBraking(true); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setBraking(false); }
  });

  function update(dt) {
    if (braking) speed -= BRAKE_DECEL * dt;
    else speed += accelRate() * dt;
    speed = Math.max(0, Math.min(MAX_SPEED, speed));

    score += speed * dt * 0.12 * multiplier();

    roadOffset += speed * dt * 1.4;

    if (gate) {
      gate.y += speed * dt * GATE_SCALE;
      if (gate.y >= CAR_Y) judgeGate();
    } else {
      gateTimer -= dt;
      if (gateTimer <= 0) spawnGate();
    }

    if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt);
    if (judgeFlash) { judgeFlash.t -= dt; if (judgeFlash.t <= 0) judgeFlash = null; }

    updateEngine();
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
  }

  function drawRoad() {
    ctx.fillStyle = '#232330';
    ctx.fillRect(ROAD_LEFT - 14, 0, (ROAD_RIGHT - ROAD_LEFT) + 28, H);
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, ROAD_LEFT - 14, H);
    ctx.fillRect(ROAD_RIGHT + 14, 0, W - (ROAD_RIGHT + 14), H);

    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -roadOffset;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(CAR_X, 0);
    ctx.lineTo(CAR_X, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawGate() {
    if (!gate) return;
    const isGold = gate.type === 'gold';
    ctx.fillStyle = isGold ? 'rgba(255,210,63,.85)' : 'rgba(125,216,255,.7)';
    ctx.fillRect(ROAD_LEFT - 14, gate.y - 9, (ROAD_RIGHT - ROAD_LEFT) + 28, 18);
    ctx.fillStyle = isGold ? '#5a4400' : '#08202b';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((isGold ? '⭐ ' : '') + '≤' + gate.limit, CAR_X, gate.y + 1);
  }

  function drawCar() {
    ctx.save();
    ctx.translate(CAR_X, CAR_Y);
    if (braking) {
      ctx.fillStyle = 'rgba(255,93,108,.55)';
      ctx.beginPath();
      ctx.moveTo(-14, 30); ctx.lineTo(14, 30); ctx.lineTo(0, 52);
      ctx.fill();
    }
    ctx.font = '38px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏎️', 0, 0);
    ctx.restore();
  }

  function drawSpeedGauge() {
    const gx = 16, gy = 16, gw = W - 32, gh = 18;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(gx, gy, gw, gh);
    const pct = speed / MAX_SPEED;
    ctx.fillStyle = pct > 0.85 ? '#ff5d6c' : pct > 0.6 ? '#ffd23f' : '#6be08a';
    ctx.fillRect(gx, gy, gw * pct, gh);
    if (gate) {
      const lx = gx + gw * (gate.limit / MAX_SPEED);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, gy - 3);
      ctx.lineTo(lx, gy + gh + 3);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('速度 ' + Math.round(speed), gx + gw / 2, gy + gh / 2);
  }

  function drawFlash() {
    if (crashFlash > 0) {
      ctx.fillStyle = `rgba(255,0,30,${crashFlash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (judgeFlash) {
      const a = Math.min(1, judgeFlash.t / 0.3);
      ctx.globalAlpha = a;
      ctx.fillStyle = judgeFlash.color;
      ctx.font = 'bold 26px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(judgeFlash.text, CAR_X, CAR_Y - 60);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawRoad();
    drawGate();
    drawCar();
    drawSpeedGauge();
    drawFlash();
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
    startEngine();
    playStart();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  draw();
  rafId = requestAnimationFrame(loop);
})();
