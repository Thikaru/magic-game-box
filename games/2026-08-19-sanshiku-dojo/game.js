(() => {
  const STANCES = ['up', 'mid', 'down'];
  const COUNTER = { up: 'mid', mid: 'down', down: 'up' };
  const ICON = { up: '⬆️', mid: '➡️', down: '⬇️' };
  const LABEL = { up: '上段', mid: '中段', down: '下段' };

  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const foeIcon = document.getElementById('foeIcon');
  const foeLabel = document.getElementById('foeLabel');
  const timerBar = document.getElementById('timerBar');
  const feedback = document.getElementById('feedback');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const stanceRow = document.getElementById('stanceRow');

  const START_TIME = 2200;
  const TIME_STEP = 45;
  const FLOOR_TIME = 650;
  const NEXT_ROUND_DELAY = 650;

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
  function sndHit() { beep(720, 0.12, 'square', 0.16); beep(1080, 0.1, 'square', 0.1); }
  function sndBonus() { beep(880, 0.1, 'triangle', 0.18); beep(1320, 0.14, 'triangle', 0.16); }
  function sndMiss() { beep(180, 0.22, 'sawtooth', 0.2); }
  function sndGameOver() { beep(300, 0.15, 'sawtooth', 0.2); setTimeout(() => beep(180, 0.3, 'sawtooth', 0.2), 130); }

  let running = false;
  let score = 0;
  let combo = 0;
  let lives = 3;
  let roundIndex = 0;
  let currentStance = null;
  let prevStance = null;
  let isBonus = false;
  let answered = false;
  let timeoutHandle = null;

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '🖤'.repeat(3 - Math.max(0, lives));
  }

  function responseTimeFor(idx) {
    return Math.max(FLOOR_TIME, START_TIME - idx * TIME_STEP);
  }

  function startRound() {
    answered = false;
    feedback.textContent = '';
    feedback.className = 'feedback';

    let stance;
    do {
      stance = STANCES[Math.floor(Math.random() * STANCES.length)];
    } while (stance === prevStance && Math.random() < 0.7);
    currentStance = stance;
    prevStance = stance;

    isBonus = roundIndex >= 3 && Math.random() < 0.15;

    foeIcon.textContent = ICON[stance];
    foeIcon.classList.remove('shake');
    void foeIcon.offsetWidth;
    foeIcon.classList.add('shake');
    foeLabel.textContent = isBonus ? '🌟 会心のスキ!相手の構え' : '相手の構え';

    let time = responseTimeFor(roundIndex);
    if (isBonus) time = Math.round(time * 1.7);

    timerBar.classList.toggle('bonus', isBonus);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + time + 'ms linear';
    timerBar.style.width = '0%';

    timeoutHandle = setTimeout(() => handleAnswer(null), time);
  }

  function handleAnswer(pressed) {
    if (!running || answered) return;
    answered = true;
    clearTimeout(timeoutHandle);

    const correct = COUNTER[currentStance];
    const success = pressed === correct;

    if (success) {
      combo++;
      const mult = Math.min(4, 1 + Math.floor(combo / 5));
      let gained = 80 * mult;
      if (isBonus) gained *= 2;
      score += gained;
      feedback.textContent = (isBonus ? '🌟 会心の一撃! +' : '見破った! +') + gained;
      feedback.classList.add('ok');
      if (isBonus) sndBonus(); else sndHit();
    } else {
      combo = 0;
      lives--;
      const why = pressed === null ? '反応できず…' : '見破れず…';
      feedback.textContent = why + `正解は ${ICON[correct]}${LABEL[correct]}`;
      feedback.classList.add('ng');
      sndMiss();
    }
    updateHud();

    if (lives <= 0) {
      setTimeout(gameOver, 500);
      return;
    }
    roundIndex++;
    setTimeout(startRound, NEXT_ROUND_DELAY);
  }

  function gameOver() {
    running = false;
    sndGameOver();
    resultTitle.textContent = '道場破りの旅、終幕';
    resultText.textContent = `見破った回数 ${roundIndex} 回 / スコア ${score}`;
    result.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    score = 0; combo = 0; lives = 3; roundIndex = 0; prevStance = null;
    updateHud();
    result.classList.add('hidden');
    intro.classList.add('hidden');
    running = true;
    startRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  stanceRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.stanceBtn');
    if (!btn || !running) return;
    handleAnswer(btn.dataset.stance);
  });

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === '1') handleAnswer('up');
    else if (e.key === '2') handleAnswer('mid');
    else if (e.key === '3') handleAnswer('down');
  });

  updateHud();
})();
