(() => {
  'use strict';

  const ICONS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '🟤', '⚪'];
  const MATCH_PROB = 0.42;
  const GOLD_PROB = 0.12;

  const board = document.getElementById('board');
  const bonusBanner = document.getElementById('bonusBanner');
  const nInfo = document.getElementById('nInfo');
  const timerBar = document.getElementById('timerBar');
  const card = document.getElementById('card');
  const cardIcon = document.getElementById('cardIcon');
  const goldBadge = document.getElementById('goldBadge');
  const practiceLabel = document.getElementById('practiceLabel');
  const judgeRow = document.getElementById('judgeRow');
  const diffBtn = document.getElementById('diffBtn');
  const sameBtn = document.getElementById('sameBtn');
  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');

  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type, gain, delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const playCorrect = () => { beep(660, 0.12, 'triangle', 0.15); beep(880, 0.14, 'triangle', 0.13, 0.06); };
  const playWrong = () => { beep(180, 0.25, 'sawtooth', 0.14); };
  const playGold = () => { beep(1046, 0.1, 'square', 0.12); beep(1318, 0.16, 'square', 0.12, 0.08); };
  const playBonus = () => { beep(523, 0.1, 'triangle', 0.13); beep(659, 0.1, 'triangle', 0.13, 0.08); beep(784, 0.18, 'triangle', 0.13, 0.16); };
  const playGameOver = () => { beep(392, 0.16, 'sawtooth', 0.15); beep(261, 0.35, 'sawtooth', 0.15, 0.15); };

  let history, score, combo, lives, correctCount, n, iconSetSize;
  let running, awaitingInput, currentGold, correctAnswer;
  let bonusActive, bonusPending;
  let answerTimeoutId, flashTimeoutId, nextTimeoutId, barRaf;

  function resetState() {
    history = [];
    score = 0; combo = 0; lives = 3; correctCount = 0;
    n = 1; iconSetSize = 4;
    running = true; awaitingInput = false; currentGold = false; correctAnswer = null;
    bonusActive = false; bonusPending = false;
    clearTimeout(answerTimeoutId); clearTimeout(flashTimeoutId); clearTimeout(nextTimeoutId);
    cancelAnimationFrame(barRaf);
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '🖤'.repeat(3 - Math.max(lives, 0));
  }

  function randomIcon(size) {
    return ICONS[Math.floor(Math.random() * size)];
  }
  function randomDifferentIcon(exclude, size) {
    if (size <= 1) return exclude;
    let icon;
    do { icon = ICONS[Math.floor(Math.random() * size)]; } while (icon === exclude);
    return icon;
  }

  function computeDifficulty() {
    n = correctCount >= 20 ? 3 : (correctCount >= 8 ? 2 : 1);
    iconSetSize = Math.min(4 + Math.floor(correctCount / 6), 8);
  }

  function showNextCard() {
    if (!running) return;
    computeDifficulty();
    const k = history.length;
    nInfo.innerHTML = 'いまは <b>' + n + '</b>こ前 と くらべる';

    card.classList.remove('flashOK', 'flashNG');
    goldBadge.classList.remove('show');
    cancelAnimationFrame(barRaf);

    if (k === 0) {
      // practice: no judgment yet, just build history
      const icon = randomIcon(iconSetSize);
      history.push(icon);
      cardIcon.textContent = icon;
      currentGold = false; correctAnswer = null;
      practiceLabel.classList.remove('hidden');
      judgeRow.classList.add('hidden');
      bonusBanner.classList.remove('show');
      timerBar.style.transition = 'none';
      timerBar.style.width = '100%';
      timerBar.className = 'timerBar';
      nextTimeoutId = setTimeout(showNextCard, 1300);
      return;
    }

    practiceLabel.classList.add('hidden');
    judgeRow.classList.remove('hidden');
    diffBtn.disabled = false; sameBtn.disabled = false;

    const baseWin = Math.max(1900 - correctCount * 35, 750);
    let winMs = baseWin;
    if (bonusPending) {
      bonusPending = false;
      bonusActive = true;
      winMs = Math.round(baseWin * 1.4);
      bonusBanner.classList.add('show');
      playBonus();
    } else {
      bonusActive = false;
      bonusBanner.classList.remove('show');
    }

    const target = history[k - n];
    const isMatch = Math.random() < MATCH_PROB;
    const icon = isMatch ? target : randomDifferentIcon(target, iconSetSize);
    history.push(icon);
    correctAnswer = isMatch ? 'same' : 'diff';
    cardIcon.textContent = icon;

    currentGold = Math.random() < GOLD_PROB;
    if (currentGold) goldBadge.classList.add('show');

    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    timerBar.className = 'timerBar';
    void timerBar.offsetWidth; // force reflow
    timerBar.style.transition = 'width ' + winMs + 'ms linear';
    timerBar.style.width = '0%';
    if (winMs < 1000) timerBar.classList.add('warn');
    if (winMs < 800) timerBar.classList.add('danger2');

    awaitingInput = true;
    answerTimeoutId = setTimeout(() => handleAnswer(null), winMs);
  }

  function handleAnswer(choice) {
    if (!awaitingInput || !running) return;
    awaitingInput = false;
    clearTimeout(answerTimeoutId);
    diffBtn.disabled = true; sameBtn.disabled = true;

    const correct = choice !== null && choice === correctAnswer;

    if (correct) {
      correctCount++;
      combo++;
      const mult = 1 + Math.min(Math.floor(combo / 5) * 0.5, 2);
      let gained = Math.round(100 * mult) * (bonusActive ? 2 : 1);
      if (currentGold) {
        gained += 150;
        lives = Math.min(3, lives + 1);
        playGold();
      } else {
        playCorrect();
      }
      score += gained;
      card.classList.add('flashOK');
      if (combo > 0 && combo % 5 === 0) bonusPending = true;
    } else {
      lives--;
      combo = 0;
      card.classList.add('flashNG');
      playWrong();
    }
    bonusActive = false;
    bonusBanner.classList.remove('show');
    updateHud();

    if (lives <= 0) {
      flashTimeoutId = setTimeout(gameOver, 400);
      return;
    }
    flashTimeoutId = setTimeout(showNextCard, 380);
  }

  function gameOver() {
    running = false;
    awaitingInput = false;
    clearTimeout(answerTimeoutId); clearTimeout(nextTimeoutId);
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      'スコア ' + score + ' てん・さいだい ' + n + 'こ前 まで到達!(通算正解 ' + correctCount + '問)';
    result.classList.remove('hidden');
  }

  function startGame() {
    result.classList.add('hidden');
    resetState();
    showNextCard();
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    intro.classList.add('hidden');
    startGame();
  });
  retryBtn.addEventListener('click', () => {
    initAudio();
    startGame();
  });

  diffBtn.addEventListener('click', () => handleAnswer('diff'));
  sameBtn.addEventListener('click', () => handleAnswer('same'));

  document.addEventListener('keydown', (e) => {
    if (!awaitingInput) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'z' || k === 'Z') {
      e.preventDefault();
      handleAnswer('diff');
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      handleAnswer('same');
    }
  });
})();
