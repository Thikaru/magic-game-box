(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const holdBtn = document.getElementById('holdBtn');
  const livesLabel = document.getElementById('livesLabel');
  const comboLabel = document.getElementById('comboLabel');
  const scoreLabel = document.getElementById('scoreLabel');
  const progBar = document.getElementById('progBar');

  const GOAL = 900;
  const BASE_SPEED = 95; // units per second while holding

  let state = 'intro'; // intro | playing | gameover | clear
  let distance = 0;
  let lives = 3;
  let combo = 0;
  let bestCombo = 0;
  let holding = false;
  let lastTime = null;
  let flashColor = null; // null | 'red' | 'orange'
  let flashUntil = 0;
  let nextFlashAt = 0;
  let penaltyUntil = 0;
  let startTime = 0;
  let legPhase = 0;
  let shakeUntil = 0;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  function beep(freq, dur, type, vol) {
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol == null ? 0.12 : vol;
    osc.connect(gain).connect(ac.destination);
    const now = ac.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }

  function progressRatio() {
    return Math.min(distance / GOAL, 1);
  }

  function scheduleNextFlash(now) {
    const t = progressRatio();
    const minGap = 1200 - t * 700;
    const maxGap = 2400 - t * 1100;
    nextFlashAt = now + minGap + Math.random() * (maxGap - minGap);
  }

  function startFlash(now) {
    const t = progressRatio();
    const redChance = 0.5 + t * 0.15;
    flashColor = Math.random() < redChance ? 'red' : 'orange';
    let dur;
    if (flashColor === 'red') {
      dur = Math.max(500, 1100 - t * 450);
    } else {
      dur = Math.max(350, 850 - t * 300);
    }
    flashUntil = now + dur;
    beep(flashColor === 'red' ? 220 : 520, 0.09, 'square', 0.08);
  }

  function endFlash(now) {
    if (flashColor === 'red') {
      if (holding) {
        onCaught(now);
      } else {
        combo++;
        bestCombo = Math.max(bestCombo, combo);
        beep(880, 0.08, 'sine', 0.1);
      }
    } else if (flashColor === 'orange') {
      if (holding) {
        combo++;
        bestCombo = Math.max(bestCombo, combo);
      } else {
        combo = 0;
      }
    }
    flashColor = null;
    scheduleNextFlash(now);
  }

  function onCaught(now) {
    lives--;
    combo = 0;
    flashColor = null;
    shakeUntil = now + 400;
    beep(110, 0.25, 'sawtooth', 0.15);
    if (lives <= 0) {
      state = 'gameover';
      holding = false;
      holdBtn.classList.remove('active');
      const score = Math.round(distance) + bestCombo * 10;
      resultTitleEl.textContent = 'つかまった…';
      resultTextEl.innerHTML = `到達距離 ${Math.round(distance)}m / 900m<br>ベストコンボ ${bestCombo}<br>スコア ${score}`;
      resultEl.classList.remove('hidden');
    } else {
      penaltyUntil = now + 700;
      holding = false;
      holdBtn.classList.remove('active');
    }
  }

  function onClear(now) {
    state = 'clear';
    holding = false;
    holdBtn.classList.remove('active');
    const totalSec = (now - startTime) / 1000;
    const score = Math.round((GOAL * 12) / Math.max(totalSec, 1)) + bestCombo * 15;
    resultTitleEl.textContent = 'ゴール!!';
    resultTextEl.innerHTML = `タイム ${totalSec.toFixed(1)}秒<br>ベストコンボ ${bestCombo}<br>スコア ${score}`;
    resultEl.classList.remove('hidden');
    beep(660, 0.15, 'sine', 0.12);
    setTimeout(() => beep(990, 0.2, 'sine', 0.12), 120);
  }

  function resetGame() {
    distance = 0;
    lives = 3;
    combo = 0;
    bestCombo = 0;
    holding = false;
    flashColor = null;
    legPhase = 0;
    shakeUntil = 0;
    lastTime = null;
    const now = performance.now();
    startTime = now;
    scheduleNextFlash(now);
    state = 'playing';
    resultEl.classList.add('hidden');
  }

  function updateHud() {
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(3 - Math.max(lives, 0));
    comboLabel.textContent = 'COMBO ' + combo;
    const score = Math.round(distance) + bestCombo * 10;
    scoreLabel.textContent = 'SCORE ' + score;
    progBar.style.width = (progressRatio() * 100).toFixed(1) + '%';
  }

  function render(now) {
    ctx.save();
    if (now < shakeUntil) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    ctx.fillStyle = '#081410';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#123028');
    g.addColorStop(1, '#0a1f1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.7);

    // signal light
    const cx = W / 2, cy = 70, r = 34;
    let lightColor = '#3ee06b';
    if (now < penaltyUntil) lightColor = '#ff4d5e';
    else if (flashColor === 'red') lightColor = '#ff4d5e';
    else if (flashColor === 'orange') lightColor = '#ffa73b';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = lightColor;
    ctx.shadowColor = lightColor;
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 4;
    ctx.stroke();

    if (now < penaltyUntil) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('捕まった!', W / 2, 150);
    }

    // road
    const roadTop = H * 0.62, roadH = H * 0.3;
    ctx.fillStyle = '#1c2f28';
    ctx.fillRect(0, roadTop, W, roadH);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([22, 18]);
    const dashOffset = -(distance * 1.8) % 40;
    ctx.beginPath();
    ctx.moveTo(dashOffset, roadTop + roadH / 2);
    ctx.lineTo(W + 40, roadTop + roadH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // finish line marker as distance nears goal
    const remain = GOAL - distance;
    if (remain < 220) {
      const fx = W * 0.28 + remain * 2.4;
      if (fx < W + 20) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#fff' : '#12181a';
          ctx.fillRect(fx, roadTop - 6 + i * (roadH / 6), 10, roadH / 6);
        }
      }
    }

    // character
    const px = W * 0.28, py = roadTop - 4;
    const moving = holding && now >= penaltyUntil;
    const bob = moving ? Math.sin(legPhase) * 6 : 0;
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏃', px, py + bob);

    ctx.restore();
  }

  function tick(now) {
    if (state === 'playing') {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;

      if (now >= penaltyUntil) {
        if (flashColor) {
          if (now >= flashUntil) endFlash(now);
        } else if (now >= nextFlashAt) {
          startFlash(now);
        }
        if (holding) {
          distance += BASE_SPEED * dt;
          legPhase += dt * 14;
          if (distance >= GOAL) {
            distance = GOAL;
            onClear(now);
          }
        }
      }
      updateHud();
      render(now);
    }
    requestAnimationFrame(tick);
  }

  function setHolding(v) {
    if (state !== 'playing') return;
    holding = v;
    holdBtn.classList.toggle('active', v);
  }

  holdBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); setHolding(true); });
  holdBtn.addEventListener('pointerup', (e) => { e.preventDefault(); setHolding(false); });
  holdBtn.addEventListener('pointerleave', () => setHolding(false));
  holdBtn.addEventListener('pointercancel', () => setHolding(false));
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      ensureAudio();
      setHolding(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      setHolding(false);
    }
  });

  startBtn.addEventListener('click', () => {
    ensureAudio();
    introEl.classList.add('hidden');
    resetGame();
  });

  retryBtn.addEventListener('click', () => {
    ensureAudio();
    resetGame();
  });

  updateHud();
  requestAnimationFrame(tick);
})();
