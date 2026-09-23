(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const TRACK_LEFT = 40, TRACK_RIGHT = 320;
  const TRACK_W = TRACK_RIGHT - TRACK_LEFT;
  const PLAYER_Y = H - 90;
  const PLAYER_R = 14;
  const GATE_SPAWN_Y = 60;
  const KEY_SPEED = 300; // px/s while holding arrow/AD keys

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

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, clearedCount = 0;
  let playerX = W / 2;
  let keyLeft = false, keyRight = false;
  let dragging = false;
  let gate = null; // {y, openLeft, openRight, side, type}
  let gateIndex = 0;
  let gateTimer = 0.6;
  let forceGoldNext = false;
  let lastComboMilestone = 0;
  let slopeOffset = 0;
  let crashFlash = 0;
  let judgeFlash = null; // {text, color, t}
  let trees = [];
  let lastTs = 0;
  let rafId = null;

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
  function noiseBurst(dur, vol) {
    const ac = ensureAudio();
    const bufferSize = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol || 0.25, ac.currentTime);
    src.connect(gain).connect(ac.destination);
    src.start();
  }
  function playJust() { beep(760, 0.09, 'triangle', 0.2); beep(1140, 0.13, 'triangle', 0.18, 0.06); }
  function playNice() { beep(560, 0.1, 'sine', 0.18); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(990, 0.16, 'sine', 0.2, 0.07); beep(1320, 0.16, 'sine', 0.16, 0.14); }
  function playCrash() { noiseBurst(0.22, 0.3); beep(120, 0.2, 'sawtooth', 0.2, 0.02); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function reset() {
    score = 0; combo = 0; lives = 3; clearedCount = 0;
    playerX = W / 2; gate = null; gateIndex = 0; gateTimer = 0.5;
    forceGoldNext = false; lastComboMilestone = 0; slopeOffset = 0;
    crashFlash = 0; judgeFlash = null;
    trees = [];
    for (let i = 0; i < 8; i++) {
      trees.push({ side: Math.random() < 0.5 ? 'l' : 'r', y: Math.random() * H, s: 0.7 + Math.random() * 0.6 });
    }
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    clearLabel.textContent = '通過 ' + clearedCount;
  }

  function multiplier() { return 1 + Math.floor(combo / 5) * 0.5; }
  function gateSpeed() { return Math.min(260, 120 + clearedCount * 6); }
  function openWidth() { return Math.max(62, 148 - clearedCount * 3); }
  function gateGap() { return Math.max(0.28, 0.55 - clearedCount * 0.01); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function spawnGate() {
    let type = 'normal';
    if (forceGoldNext) { type = 'gold'; forceGoldNext = false; }
    const side = gateIndex % 2 === 0 ? 'red' : 'blue';
    gateIndex++;

    let width, center;
    if (type === 'gold') {
      width = 210;
      center = W / 2 + (Math.random() * 40 - 20);
    } else {
      width = openWidth();
      const base = side === 'red' ? TRACK_LEFT + TRACK_W * 0.30 : TRACK_LEFT + TRACK_W * 0.70;
      center = base + (Math.random() * 30 - 15);
    }
    const half = width / 2;
    center = clamp(center, TRACK_LEFT + half + 4, TRACK_RIGHT - half - 4);
    gate = { y: GATE_SPAWN_Y, openLeft: center - half, openRight: center + half, side, type };
  }

  function judgeGate() {
    const inside = playerX >= gate.openLeft && playerX <= gate.openRight;
    if (!inside) {
      lives--;
      combo = 0;
      crashFlash = 0.35;
      judgeFlash = { text: 'クラッシュ!', color: '#ff5d6c', t: 0.7 };
      playCrash();
      updateHud();
      if (lives <= 0) { endGame(); gate = null; gateTimer = 999; return; }
    } else {
      clearedCount++;
      const center = (gate.openLeft + gate.openRight) / 2;
      const half = (gate.openRight - gate.openLeft) / 2;
      const off = Math.abs(playerX - center);
      let bonus, text, color;
      if (gate.type === 'gold') {
        bonus = 150; text = '⭐ボーナス!'; color = '#ffd23f';
        lives = Math.min(3, lives + 1);
        playGold();
      } else if (off <= half * 0.35) {
        bonus = 110; text = 'ジャストライン!'; color = '#7dd8ff';
        playJust();
      } else {
        bonus = 55; text = 'クリア!'; color = '#6be08a';
        playNice();
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
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${Math.floor(score)} / ${clearedCount}ゲート通過!`;
    resultEl.classList.remove('hidden');
  }

  function canvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  }

  function setPlayerX(x) {
    playerX = clamp(x, TRACK_LEFT + PLAYER_R, TRACK_RIGHT - PLAYER_R);
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing') return;
    dragging = true;
    setPlayerX(canvasX(e.clientX));
  });
  window.addEventListener('pointermove', e => {
    if (!dragging || state !== 'playing') return;
    setPlayerX(canvasX(e.clientX));
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); keyLeft = true; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); keyRight = true; }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyLeft = false; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyRight = false; }
  });

  function update(dt) {
    if (keyLeft && !keyRight) setPlayerX(playerX - KEY_SPEED * dt);
    else if (keyRight && !keyLeft) setPlayerX(playerX + KEY_SPEED * dt);

    const spd = gateSpeed();
    slopeOffset += spd * dt;
    score += spd * dt * 0.06 * multiplier();

    for (const t of trees) {
      t.y += spd * dt * 0.9;
      if (t.y > H + 20) { t.y = -20; t.s = 0.7 + Math.random() * 0.6; }
    }

    if (gate) {
      gate.y += spd * dt;
      if (gate.y >= PLAYER_Y) judgeGate();
    } else {
      gateTimer -= dt;
      if (gateTimer <= 0) spawnGate();
    }

    if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt);
    if (judgeFlash) { judgeFlash.t -= dt; if (judgeFlash.t <= 0) judgeFlash = null; }

    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
  }

  function drawSlope() {
    ctx.fillStyle = '#eef6ff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dceeff';
    ctx.fillRect(TRACK_LEFT, 0, TRACK_W, H);

    ctx.strokeStyle = 'rgba(120,160,210,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(TRACK_LEFT, 0); ctx.lineTo(TRACK_LEFT, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(TRACK_RIGHT, 0); ctx.lineTo(TRACK_RIGHT, H); ctx.stroke();

    ctx.setLineDash([16, 20]);
    ctx.lineDashOffset = -slopeOffset;
    ctx.strokeStyle = 'rgba(120,160,210,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo((TRACK_LEFT + TRACK_RIGHT) / 2, 0); ctx.lineTo((TRACK_LEFT + TRACK_RIGHT) / 2, H); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '22px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of trees) {
      const x = t.side === 'l' ? TRACK_LEFT - 20 : TRACK_RIGHT + 20;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = (22 * t.s) + 'px system-ui';
      ctx.fillText('🌲', x, t.y);
      ctx.restore();
    }
  }

  function drawGate() {
    if (!gate) return;
    const isGold = gate.type === 'gold';
    const barColor = isGold ? 'rgba(255,210,63,.55)' : (gate.side === 'red' ? 'rgba(255,93,108,.4)' : 'rgba(125,216,255,.45)');
    ctx.fillStyle = barColor;
    ctx.fillRect(TRACK_LEFT, gate.y - 9, gate.openLeft - TRACK_LEFT, 18);
    ctx.fillRect(gate.openRight, gate.y - 9, TRACK_RIGHT - gate.openRight, 18);

    ctx.font = '22px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const flag = isGold ? '⭐' : (gate.side === 'red' ? '🚩' : '🔵');
    ctx.fillText(flag, gate.openLeft, gate.y);
    ctx.fillText(flag, gate.openRight, gate.y);
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(playerX, PLAYER_Y);
    ctx.font = '34px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛷️', 0, 0);
    ctx.restore();
  }

  function drawFlash() {
    if (crashFlash > 0) {
      ctx.fillStyle = `rgba(255,0,30,${crashFlash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (judgeFlash) {
      const a = Math.min(1, judgeFlash.t / 0.3);
      ctx.globalAlpha = a;
      ctx.fillStyle = judgeFlash.color;
      ctx.font = 'bold 24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(13,27,46,.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(judgeFlash.text, W / 2, PLAYER_Y - 70);
      ctx.fillText(judgeFlash.text, W / 2, PLAYER_Y - 70);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawSlope();
    drawGate();
    drawPlayer();
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
    ensureAudio();
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
