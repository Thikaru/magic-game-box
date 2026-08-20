(() => {
  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const weightLabel = document.getElementById('weightLabel');
  const weightNum = document.getElementById('weightNum');
  const timerBar = document.getElementById('timerBar');
  const beam = document.getElementById('beam');
  const panLeft = document.getElementById('panLeft');
  const panRight = document.getElementById('panRight');
  const diffReadout = document.getElementById('diffReadout');
  const feedback = document.getElementById('feedback');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const sideRow = document.getElementById('sideRow');

  const START_TOLERANCE = 16;
  const MIN_TOLERANCE = 6;
  const TOLERANCE_DROP_EVERY = 4;
  const START_TIME = 3000;
  const TIME_STEP = 55;
  const FLOOR_TIME = 1000;
  const NEXT_ROUND_DELAY = 600;
  const MAX_ANGLE = 30;
  const ANGLE_SCALE = 1.9;

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.18, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sndOk() { beep(600, 0.1, 'square', 0.15); beep(900, 0.09, 'square', 0.1); }
  function sndGold() { beep(880, 0.1, 'triangle', 0.18); beep(1320, 0.14, 'triangle', 0.16); beep(1760, 0.12, 'triangle', 0.12); }
  function sndTip() { beep(200, 0.24, 'sawtooth', 0.22); }
  function sndGameOver() { beep(300, 0.15, 'sawtooth', 0.2); setTimeout(() => beep(180, 0.3, 'sawtooth', 0.2), 130); }

  let running = false;
  let score = 0;
  let combo = 0;
  let lives = 3;
  let roundIndex = 0;
  let leftSum = 0;
  let rightSum = 0;
  let currentValue = 0;
  let isGolden = false;
  let answered = false;
  let timeoutHandle = null;

  function toleranceFor() {
    return Math.max(MIN_TOLERANCE, START_TOLERANCE - Math.floor(combo / TOLERANCE_DROP_EVERY));
  }
  function timeFor() {
    return Math.max(FLOOR_TIME, START_TIME - roundIndex * TIME_STEP);
  }
  function maxValueFor() {
    return Math.min(20, 6 + Math.floor(combo / 6));
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '🖤'.repeat(3 - Math.max(0, lives));
  }

  function updateBeam() {
    panLeft.textContent = leftSum;
    panRight.textContent = rightSum;
    const diff = leftSum - rightSum;
    const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, diff * ANGLE_SCALE));
    beam.style.transform = 'rotate(' + angle + 'deg)';
    const tol = toleranceFor();
    diffReadout.textContent = '差 ' + Math.abs(diff) + ' / きょよう ' + tol;
    diffReadout.classList.toggle('warn', tol - Math.abs(diff) <= 2 && !isGolden);
  }

  function startRound() {
    answered = false;
    feedback.textContent = '';
    feedback.className = 'feedback';

    isGolden = roundIndex >= 4 && Math.random() < 0.12;
    currentValue = 1 + Math.floor(Math.random() * maxValueFor());

    weightNum.textContent = isGolden ? '⭐' : String(currentValue);
    weightNum.classList.remove('pop');
    void weightNum.offsetWidth;
    weightNum.classList.add('pop');
    weightLabel.textContent = isGolden ? '⭐ てんびんリセットの おもり!' : 'つぎのおもり';

    const time = timeFor();
    timerBar.classList.toggle('golden', isGolden);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + time + 'ms linear';
    timerBar.style.width = '0%';

    timeoutHandle = setTimeout(() => handlePlace(null), time);
  }

  function handlePlace(side) {
    if (!running || answered) return;
    answered = true;
    clearTimeout(timeoutHandle);

    const actualSide = side || (Math.random() < 0.5 ? 'left' : 'right');
    const timedOut = side === null;
    const mult = Math.min(4, 1 + Math.floor(combo / 6));

    if (isGolden) {
      leftSum = 0;
      rightSum = 0;
      combo++;
      const gained = 150 * mult;
      score += gained;
      feedback.textContent = '⭐ てんびんリセット! +' + gained;
      feedback.classList.add('gold');
      sndGold();
    } else {
      if (actualSide === 'left') leftSum += currentValue; else rightSum += currentValue;
      const absDiff = Math.abs(leftSum - rightSum);
      const tol = toleranceFor();
      if (absDiff > tol) {
        lives--;
        combo = 0;
        leftSum = 0;
        rightSum = 0;
        beam.classList.remove('shake');
        void beam.offsetWidth;
        beam.classList.add('shake');
        feedback.textContent = (timedOut ? '時間切れで自動配置…' : '') + 'かたむきすぎ!';
        feedback.classList.add('ng');
        sndTip();
      } else {
        combo++;
        const gained = 60 * mult;
        score += gained;
        feedback.textContent = (timedOut ? '時間切れで自動配置… ' : '') + 'セーフ! +' + gained;
        feedback.classList.add('ok');
        sndOk();
      }
    }

    updateHud();
    updateBeam();

    if (lives <= 0) {
      setTimeout(gameOver, 550);
      return;
    }
    roundIndex++;
    setTimeout(startRound, NEXT_ROUND_DELAY);
  }

  function gameOver() {
    running = false;
    sndGameOver();
    resultTitle.textContent = 'てんびん、崩壊';
    resultText.textContent = '置いたおもり ' + roundIndex + ' 個 / スコア ' + score;
    result.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    score = 0; combo = 0; lives = 3; roundIndex = 0; leftSum = 0; rightSum = 0;
    updateHud();
    updateBeam();
    result.classList.add('hidden');
    intro.classList.add('hidden');
    running = true;
    startRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  sideRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.sideBtn');
    if (!btn || !running) return;
    handlePlace(btn.dataset.side);
  });

  beam.addEventListener('click', (e) => {
    if (!running) return;
    const rect = beam.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    handlePlace(e.clientX < mid ? 'left' : 'right');
  });

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') handlePlace('left');
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') handlePlace('right');
  });

  updateHud();
  updateBeam();
})();
