(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const CW = canvas.width, CH = canvas.height;

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const toastEl = document.getElementById('toast');

  const roundLabel = document.getElementById('roundLabel');
  const livesLabel = document.getElementById('livesLabel');
  const scoreLabel = document.getElementById('scoreLabel');
  const questionText = document.getElementById('questionText');
  const hintText = document.getElementById('hintText');
  const timerInner = document.getElementById('timerInner');
  const guessDisplay = document.getElementById('guessDisplay');
  const confirmBtn = document.getElementById('confirmBtn');

  const padToggle = document.getElementById('padToggle');
  const padPanel = document.getElementById('padPanel');
  const padBack = document.getElementById('padBack');
  const padOk = document.getElementById('padOk');

  let state = 'intro'; // intro | showing | input | feedback | gameover
  let round = 0, life = 3, score = 0, combo = 0, bestCombo = 0;
  let roundType = 'dots', isFlash = false, actualValue = 0;
  let guess = '';
  let timeoutId = null;
  let audioCtx = null;

  const HIGH_KEY = 'nearpin-dojo-highscore';
  let highScore = 0;
  try { highScore = parseInt(localStorage.getItem(HIGH_KEY) || '0', 10) || 0; } catch (e) { highScore = 0; }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.15;
    osc.connect(g); g.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function sfx(tier) {
    if (!audioCtx) return;
    if (tier === 'bullseye') { beep(880, 0.18, 'square', 0.18); setTimeout(() => beep(1320, 0.16, 'square', 0.15), 90); }
    else if (tier === 'nearpin') { beep(660, 0.16, 'square', 0.15); }
    else if (tier === 'ok') { beep(440, 0.12, 'sine', 0.12); }
    else { beep(180, 0.28, 'sawtooth', 0.15); }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

  function updateHud() {
    roundLabel.textContent = 'ROUND ' + round;
    livesLabel.textContent = '♥'.repeat(Math.max(0, life)) + '♡'.repeat(Math.max(0, 3 - life));
    scoreLabel.textContent = 'SCORE ' + score;
  }

  function setGuessDisplay() {
    guessDisplay.textContent = (guess.length ? guess : '0') + (roundType === 'bar' ? '%' : '個');
  }

  function drawBlank(msg) {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(0, 0, CW, CH);
    if (msg) {
      ctx.fillStyle = '#b89a78';
      ctx.font = 'bold 28px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, CW / 2, CH / 2);
    }
  }

  function drawDots(n) {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(0, 0, CW, CH);
    const pad = 26;
    const hue = randSeedHue;
    for (let i = 0; i < n; i++) {
      const x = rand(pad, CW - pad);
      const y = rand(pad, CH - pad);
      const r = rand(5, 8.5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue + rand(-14, 14)}, 68%, ${rand(44, 58)}%)`;
      ctx.fill();
    }
  }

  let randSeedHue = 20;

  function drawBar(pct, revealed) {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(0, 0, CW, CH);
    const bx = 40, by = CH / 2 - 34, bw = CW - 80, bh = 68;
    ctx.strokeStyle = '#7a4a2b';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, bw, bh);
    // faint 25% gridlines
    ctx.strokeStyle = 'rgba(122,74,43,0.25)';
    ctx.lineWidth = 1;
    for (let p = 25; p < 100; p += 25) {
      const gx = bx + (bw * p / 100);
      ctx.beginPath(); ctx.moveTo(gx, by); ctx.lineTo(gx, by + bh); ctx.stroke();
    }
    if (revealed) {
      ctx.fillStyle = '#ff8a3d';
      ctx.fillRect(bx + 2, by + 2, (bw - 4) * (pct / 100), bh - 4);
    }
  }

  function showToast(text, cls) {
    toastEl.textContent = text;
    toastEl.className = 'toast' + (cls ? ' ' + cls : '');
    toastEl.classList.remove('hidden');
  }
  function hideToast() { toastEl.classList.add('hidden'); }

  function startTimer(seconds, onExpire) {
    timerInner.style.transition = 'none';
    timerInner.style.width = '100%';
    void timerInner.offsetWidth; // reflow
    timerInner.style.transition = `width ${seconds}s linear`;
    timerInner.style.width = '0%';
    clearTimeout(timeoutId);
    timeoutId = setTimeout(onExpire, seconds * 1000);
  }
  function stopTimer() {
    clearTimeout(timeoutId);
    timerInner.style.transition = 'none';
  }

  function difficultyTimeLimit() { return clamp(9.4 - round * 0.32, 4, 9.4); }
  function difficultyFlashMs() { return clamp(1700 - round * 42, 650, 1700); }

  function nextRound() {
    round++;
    life = life; // no-op, kept for clarity
    guess = '';
    setGuessDisplay();
    roundType = Math.random() < 0.5 ? 'dots' : 'bar';
    isFlash = round % 3 === 0;
    randSeedHue = randInt(0, 340);

    if (roundType === 'dots') {
      const min = clamp(12 + round * 2, 12, 160);
      const max = clamp(min + 22 + round, min + 15, 220);
      actualValue = randInt(min, max);
      questionText.textContent = '●の数はいくつ?';
    } else {
      actualValue = randInt(6, 94);
      questionText.textContent = 'バーは何%まで塗られてる?';
    }
    updateHud();

    if (isFlash) {
      hintText.textContent = 'よく見て覚えて!すぐ消えるよ';
      state = 'showing';
      if (roundType === 'dots') drawDots(actualValue); else drawBar(actualValue, true);
      const flashMs = difficultyFlashMs();
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        drawBlank('?');
        hintText.textContent = '思い出して入力!';
        beginInput();
      }, flashMs);
    } else {
      hintText.textContent = '';
      if (roundType === 'dots') drawDots(actualValue); else drawBar(actualValue, true);
      beginInput();
    }
  }

  function beginInput() {
    state = 'input';
    const t = difficultyTimeLimit();
    startTimer(t, () => submitGuess(true));
  }

  function judge(g) {
    let errorPct;
    if (roundType === 'dots') {
      errorPct = Math.abs(g - actualValue) / actualValue * 100;
    } else {
      errorPct = Math.abs(g - actualValue);
    }
    if (errorPct <= 5) return 'bullseye';
    if (errorPct <= 15) return 'nearpin';
    if (errorPct <= 30) return 'ok';
    return 'miss';
  }

  function submitGuess(timedOut) {
    if (state !== 'input') return;
    stopTimer();
    state = 'feedback';
    const g = guess.length ? parseInt(guess, 10) : (timedOut ? -1 : 0);
    const tier = g < 0 ? 'miss' : judge(g);

    ensureAudio();
    sfx(tier);

    let msg, cls, pts = 0;
    if (tier === 'bullseye') {
      combo++; bestCombo = Math.max(bestCombo, combo);
      const mult = clamp(1 + combo * 0.15, 1, 3);
      pts = Math.round(120 * mult);
      msg = `ど真ん中!! (正解:${actualValue}${roundType === 'bar' ? '%' : '個'}) +${pts}`;
      cls = 'good';
    } else if (tier === 'nearpin') {
      combo++; bestCombo = Math.max(bestCombo, combo);
      const mult = clamp(1 + combo * 0.15, 1, 3);
      pts = Math.round(60 * mult);
      msg = `ニアピン! (正解:${actualValue}${roundType === 'bar' ? '%' : '個'}) +${pts}`;
      cls = 'good';
    } else if (tier === 'ok') {
      combo = 0;
      pts = 20;
      msg = `おしい (正解:${actualValue}${roundType === 'bar' ? '%' : '個'}) +${pts}`;
      cls = '';
    } else {
      combo = 0;
      life--;
      pts = 0;
      msg = timedOut && !guess.length ? `タイムアップ… (正解:${actualValue}${roundType === 'bar' ? '%' : '個'})` : `はずれ… (正解:${actualValue}${roundType === 'bar' ? '%' : '個'})`;
      cls = 'bad';
    }
    score += pts;
    if (roundType === 'dots') drawDots(actualValue); else drawBar(actualValue, true);
    updateHud();
    showToast(msg, cls);

    setTimeout(() => {
      hideToast();
      if (life <= 0) gameOver();
      else nextRound();
    }, 1150);
  }

  function addDigit(d) {
    if (state !== 'input') return;
    if (guess.length >= 3) return;
    if (guess === '0') guess = '';
    guess += d;
    setGuessDisplay();
  }
  function backspace() {
    if (state !== 'input') return;
    guess = guess.slice(0, -1);
    setGuessDisplay();
  }

  function gameOver() {
    state = 'gameover';
    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem(HIGH_KEY, String(highScore)); } catch (e) { /* ignore */ }
    }
    resultTitle.textContent = 'どうじょう破門…';
    resultText.innerHTML = `スコア: <b>${score}</b><br>到達ラウンド: ${round}<br>ベストコンボ: ${bestCombo}<br>ハイスコア: ${highScore}`;
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    hideToast();
    round = 0; life = 3; score = 0; combo = 0; bestCombo = 0;
    updateHud();
    nextRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  confirmBtn.addEventListener('click', () => submitGuess(false));
  padOk.addEventListener('click', () => submitGuess(false));
  padBack.addEventListener('click', backspace);
  padPanel.querySelectorAll('.padBtn[data-d]').forEach(btn => {
    btn.addEventListener('click', () => addDigit(btn.dataset.d));
  });

  padToggle.addEventListener('click', () => padPanel.classList.toggle('hidden'));
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    padPanel.classList.remove('hidden');
  }

  document.addEventListener('keydown', (e) => {
    if (state === 'intro' && (e.key === 'Enter' || e.key === ' ')) { startGame(); return; }
    if (state === 'gameover' && (e.key === 'Enter' || e.key === ' ')) { startGame(); return; }
    if (state !== 'input') return;
    if (e.key >= '0' && e.key <= '9') { addDigit(e.key); }
    else if (e.key === 'Backspace') { backspace(); e.preventDefault(); }
    else if (e.key === 'Enter') { submitGuess(false); }
  });

  drawBlank('スタートを押してね');
})();
