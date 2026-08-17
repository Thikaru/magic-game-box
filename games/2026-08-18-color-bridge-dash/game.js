(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const CART_X = 76;
  const GROUND_Y = 300;
  const BRIDGE_H = 30;
  const TILE_W = 46;
  const REACT_WINDOW = 300;

  const PALETTE = [
    { key: 'red', color: '#ff4757' },
    { key: 'blue', color: '#3b82f6' },
    { key: 'green', color: '#2ecc71' },
    { key: 'purple', color: '#9b59b6' },
    { key: 'orange', color: '#ffa726' },
  ];
  const COLOR_OF = {};
  PALETTE.forEach(p => COLOR_OF[p.key] = p.color);
  COLOR_OF.gold = '#ffd23f';

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const colorButtons = Array.from(document.querySelectorAll('.colorBtn'));

  let state = 'intro'; // intro | playing | gameover
  let score = 0, combo = 0, lives = 3, level = 1;
  let scrollX = 0, genDist = 0, speed = 90;
  let segments = [];
  let activeIdx = 0;
  let gapsCleared = 0, paletteSize = 3;
  let particles = [];
  let flashTimer = 0, cartDip = 0;
  let lastTs = 0;
  let rafId = null;

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
  function playFill() { beep(420, 0.09, 'square', 0.16); }
  function playClear() { beep(520, 0.09, 'triangle', 0.18); beep(760, 0.11, 'triangle', 0.16, 0.06); }
  function playGold() { beep(660, 0.1, 'sine', 0.22); beep(880, 0.12, 'sine', 0.2, 0.06); beep(1100, 0.14, 'sine', 0.18, 0.12); }
  function playWrong() { beep(180, 0.14, 'sawtooth', 0.16); }
  function playFall() { beep(140, 0.3, 'sawtooth', 0.22); }
  function playGameOver() {
    [330, 262, 220, 165].forEach((f, i) => beep(f, 0.24, 'triangle', 0.2, i * 0.14));
  }
  function playStart() { beep(440, 0.08, 'sine', 0.15); beep(660, 0.12, 'sine', 0.15, 0.08); }

  function multiplier() { return 1 + Math.floor(combo / 8) * 0.5; }

  function minSolidLen() { return Math.max(150, 260 - level * 9); }

  function genNext() {
    const solidLen = minSolidLen() + Math.random() * 110;
    segments.push({ type: 'solid', worldStart: genDist, worldEnd: genDist + solidLen });
    genDist += solidLen;

    let numTiles = 1;
    if (level >= 3 && Math.random() < 0.35) numTiles = 2;
    const isGold = numTiles === 1 && Math.random() < 0.08;
    const colors = [];
    for (let i = 0; i < numTiles; i++) {
      colors.push(isGold ? 'gold' : PALETTE[Math.floor(Math.random() * paletteSize)].key);
    }
    const gapLen = TILE_W * numTiles;
    segments.push({
      type: 'gap', worldStart: genDist, worldEnd: genDist + gapLen,
      colors, filled: new Array(numTiles).fill(false), resolved: false, failed: false, isGold,
    });
    genDist += gapLen;
  }

  function ensureTrackGenerated() {
    while (genDist < scrollX + W + 500) genNext();
    let removed = 0;
    while (segments.length && segments[0].worldEnd < scrollX - 260) { segments.shift(); removed++; }
    if (removed) activeIdx = Math.max(0, activeIdx - removed);
  }

  function reset() {
    score = 0; combo = 0; lives = 3; level = 1;
    scrollX = 0; genDist = 0; speed = 90;
    segments = []; activeIdx = 0; gapsCleared = 0; paletteSize = 3;
    particles = []; flashTimer = 0; cartDip = 0;
    updatePaletteButtons();
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + Math.floor(score);
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  function updatePaletteButtons() {
    colorButtons.forEach((btn, i) => btn.classList.toggle('hidden', i >= paletteSize));
  }

  function maybeLevelUp() {
    const newLevel = Math.floor(gapsCleared / 5) + 1;
    if (newLevel !== level) {
      level = newLevel;
      speed = Math.min(280, 90 + level * 14);
    }
    const newPalette = Math.min(5, 3 + Math.floor(gapsCleared / 8));
    if (newPalette !== paletteSize) { paletteSize = newPalette; updatePaletteButtons(); }
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 100;
      particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 40, life: 0.45, maxLife: 0.45, color });
    }
  }

  function loseLife() {
    lives--;
    combo = 0;
    flashTimer = 0.35;
    cartDip = 1;
    playFall();
    updateHud();
    if (lives <= 0) endGame();
  }

  function currentGap() {
    const seg = segments[activeIdx];
    return (seg && seg.type === 'gap' && !seg.resolved) ? seg : null;
  }

  function tryFill(colorKey) {
    if (state !== 'playing') return;
    const seg = currentGap();
    if (!seg) return;
    const nextIdx = seg.filled.findIndex(f => !f);
    if (nextIdx === -1) return;
    const need = seg.colors[nextIdx];
    const ok = seg.isGold || need === colorKey;
    if (ok) {
      seg.filled[nextIdx] = true;
      combo++;
      score += (seg.isGold ? 60 : 20) * multiplier();
      playFill();
      spawnParticles(CART_X + 30, GROUND_Y - 6, COLOR_OF[need]);
      if (seg.filled.every(f => f)) {
        seg.resolved = true;
        gapsCleared++;
        score += 30 * multiplier();
        if (seg.isGold) {
          lives = Math.min(3, lives + 1);
          playGold();
        } else {
          playClear();
        }
        maybeLevelUp();
      }
      updateHud();
    } else {
      combo = 0;
      playWrong();
      updateHud();
    }
  }

  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => tryFill(btn.dataset.color));
  });
  const KEY_COLOR = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (e.key in KEY_COLOR) {
      const idx = KEY_COLOR[e.key];
      if (idx < paletteSize) { e.preventDefault(); tryFill(PALETTE[idx].key); }
    }
  });

  function update(dt) {
    scrollX += speed * dt;
    score += dt * speed * 0.03 * multiplier();
    ensureTrackGenerated();

    while (activeIdx < segments.length) {
      const seg = segments[activeIdx];
      if (seg.type !== 'gap' || seg.resolved) { activeIdx++; continue; }
      if (seg.worldEnd <= scrollX) {
        seg.resolved = true;
        seg.failed = true;
        const filledCount = seg.filled.filter(Boolean).length;
        if (filledCount) score += filledCount * 5;
        loseLife();
        if (state !== 'playing') return;
        activeIdx++;
        continue;
      }
      break;
    }

    if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);
    if (cartDip > 0) cartDip = Math.max(0, cartDip - dt * 2.4);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function endGame() {
    state = 'gameover';
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = `スコア ${Math.floor(score)} / レベル ${level} まで到達!橋をかけた数 ${gapsCleared}`;
    resultEl.classList.remove('hidden');
  }

  function drawTrack() {
    for (const seg of segments) {
      const sx = seg.worldStart - scrollX + CART_X;
      const ex = seg.worldEnd - scrollX + CART_X;
      if (ex < -20 || sx > W + 20) continue;
      const w = ex - sx;
      if (seg.type === 'solid') {
        ctx.fillStyle = '#3a4a63';
        ctx.fillRect(sx, GROUND_Y, w, BRIDGE_H);
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.fillRect(sx, GROUND_Y, w, 4);
      } else {
        if (seg.resolved && !seg.failed) {
          const per = w / seg.colors.length;
          seg.colors.forEach((c, i) => {
            ctx.fillStyle = seg.isGold ? COLOR_OF.gold : COLOR_OF[c];
            ctx.fillRect(sx + i * per, GROUND_Y, per - 1, BRIDGE_H);
          });
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.fillRect(sx, GROUND_Y, w, 4);
        } else if (seg.failed) {
          ctx.fillStyle = '#050810';
          ctx.fillRect(sx, GROUND_Y, w, BRIDGE_H);
        } else {
          const per = w / seg.colors.length;
          seg.colors.forEach((c, i) => {
            const tileX = sx + i * per;
            if (seg.filled[i]) {
              ctx.fillStyle = seg.isGold ? COLOR_OF.gold : COLOR_OF[c];
              ctx.fillRect(tileX, GROUND_Y, per - 1, BRIDGE_H);
            } else {
              ctx.fillStyle = '#050810';
              ctx.fillRect(tileX, GROUND_Y, per - 1, BRIDGE_H);
              ctx.strokeStyle = seg.isGold ? COLOR_OF.gold : COLOR_OF[c];
              ctx.lineWidth = 2;
              ctx.setLineDash(seg.isGold ? [] : [4, 3]);
              ctx.strokeRect(tileX + 1, GROUND_Y + 1, per - 3, BRIDGE_H - 2);
              ctx.setLineDash([]);
              if (seg.isGold) {
                ctx.fillStyle = COLOR_OF.gold;
                ctx.font = 'bold 16px system-ui';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('★', tileX + per / 2, GROUND_Y + BRIDGE_H / 2 + 1);
              }
            }
          });
        }
      }
    }
  }

  function drawCart() {
    const y = GROUND_Y - 26 + cartDip * 60;
    const alpha = 1 - cartDip * 0.7;
    ctx.globalAlpha = Math.max(0.15, alpha);
    ctx.fillStyle = '#f2f6ff';
    ctx.fillRect(CART_X - 18, y, 36, 22);
    ctx.fillStyle = '#5be3c9';
    ctx.fillRect(CART_X - 18, y, 36, 6);
    ctx.beginPath();
    ctx.arc(CART_X - 10, y + 24, 5, 0, Math.PI * 2);
    ctx.arc(CART_X + 10, y + 24, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1420';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawIndicator() {
    const seg = currentGap();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('つぎに必要な色', W / 2, 20);
    if (!seg) return;

    const n = seg.colors.length;
    const cx = W / 2 - (n - 1) * 22;
    for (let i = 0; i < n; i++) {
      const x = cx + i * 44;
      const y = 42;
      const done = seg.filled[i];
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = done ? 'rgba(255,255,255,.15)' : (seg.isGold ? COLOR_OF.gold : COLOR_OF[seg.colors[i]]);
      ctx.fill();
      if (!done) {
        const isNext = seg.filled.slice(0, i).every(f => f);
        if (isNext) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#0d1420';
        ctx.font = 'bold 14px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', x, y + 1);
      }
      if (seg.isGold && !done) {
        ctx.fillStyle = '#5a4400';
        ctx.font = 'bold 13px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x, y + 1);
      }
    }

    const dist = seg.worldStart - scrollX;
    const frac = Math.max(0, Math.min(1, dist / REACT_WINDOW));
    const barW = 200, barX = W / 2 - barW / 2, barY = 68;
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = frac < 0.25 ? '#ff5d6c' : '#5be3c9';
    ctx.fillRect(barX, barY, barW * frac, 8);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, H);

    drawIndicator();

    ctx.fillStyle = 'rgba(255,255,255,.03)';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, 100 + i * 40, W, 1);

    const abyssGrad = ctx.createLinearGradient(0, GROUND_Y + BRIDGE_H, 0, H);
    abyssGrad.addColorStop(0, '#040608');
    abyssGrad.addColorStop(1, '#000102');
    ctx.fillStyle = abyssGrad;
    ctx.fillRect(0, GROUND_Y + BRIDGE_H, W, H - (GROUND_Y + BRIDGE_H));

    drawTrack();
    drawCart();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (flashTimer > 0) {
      ctx.fillStyle = `rgba(255,60,70,${(flashTimer / 0.35) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
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
