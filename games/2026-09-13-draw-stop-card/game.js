(function () {
  'use strict';

  var LIVES_START = 3;
  var BASE_TARGET = 15;
  var TARGET_STEP_EVERY = 2;   // successCount per +1 target
  var TIME_START = 3000;       // ms per decision at successCount=0
  var TIME_STEP = 55;          // ms faster per success
  var TIME_MIN = 1100;
  var BONUS_EVERY = 5;
  var BONUS_TIME_MULT = 1.6;
  var BONUS_SCORE_MULT = 2;
  var GOLDEN_CHANCE = 0.14;

  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');
  var targetNum = document.getElementById('targetNum');
  var bonusTag = document.getElementById('bonusTag');
  var totalNum = document.getElementById('totalNum');
  var totalSub = document.getElementById('totalSub');
  var timerBar = document.getElementById('timerBar');
  var cardsEl = document.getElementById('cards');
  var hitBtn = document.getElementById('hitBtn');
  var standBtn = document.getElementById('standBtn');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
  var timerHandle = null;
  var roundEndHandle = null;
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, dur, type, gainPeak, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.16, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxDraw(total, target) {
    var f = 320 + Math.min(1, total / target) * 380;
    beep(f, 0.06, 'square', 0.09);
  }
  function sfxStand() { beep(560, 0.1, 'triangle', 0.15); beep(840, 0.14, 'triangle', 0.13, 0.07); }
  function sfxPerfect() {
    beep(700, 0.1, 'square', 0.16); beep(1000, 0.1, 'square', 0.15, 0.07); beep(1350, 0.18, 'square', 0.14, 0.14);
  }
  function sfxGolden() { beep(980, 0.1, 'square', 0.15); beep(1320, 0.1, 'square', 0.14, 0.06); beep(1660, 0.16, 'square', 0.13, 0.12); }
  function sfxBust() { beep(220, 0.2, 'sawtooth', 0.17); beep(140, 0.28, 'sawtooth', 0.15, 0.09); }
  function sfxForced() { beep(500, 0.05, 'sawtooth', 0.1); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); beep(140, 0.45, 'sawtooth', 0.14, 0.14); }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  function computeTarget(successCount) {
    return BASE_TARGET + Math.floor(successCount / TARGET_STEP_EVERY);
  }
  function computeTimer(successCount) {
    return Math.max(TIME_MIN, TIME_START - successCount * TIME_STEP);
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    comboLabel.textContent = 'COMBO ' + state.comboStreak;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
    targetNum.textContent = state.target;
    bonusTag.classList.toggle('hidden', !state.bonus);
  }

  function renderCards() {
    cardsEl.innerHTML = '';
    state.cardsThisRound.forEach(function (c) {
      var chip = document.createElement('div');
      chip.className = 'chip' + (c.golden ? ' golden' : '');
      chip.textContent = c.value;
      cardsEl.appendChild(chip);
    });
  }

  function renderTotal(mode) {
    totalNum.textContent = state.total;
    totalNum.className = 'totalNum' + (mode === 'over' ? ' over' : mode === 'hit' ? ' hit' : '');
  }

  function armTimer() {
    clearTimeout(timerHandle);
    var dur = computeTimer(state.successCount) * (state.bonus ? BONUS_TIME_MULT : 1);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    timerBar.classList.remove('danger');
    // force reflow so the next transition actually animates
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + dur + 'ms linear';
    timerBar.style.width = '0%';
    clearTimeout(armTimer._dangerT);
    armTimer._dangerT = setTimeout(function () { timerBar.classList.add('danger'); }, dur * 0.6);
    timerHandle = setTimeout(function () {
      if (!state || !state.playing) return;
      sfxForced();
      showToast('タイムアップ!強制ドロー');
      hit();
    }, dur);
  }

  function stopTimer() {
    clearTimeout(timerHandle);
    clearTimeout(armTimer._dangerT);
  }

  function newRound() {
    state.target = computeTarget(state.successCount);
    state.bonus = state.bonusRoundsLeft > 0;
    if (state.bonusRoundsLeft > 0) state.bonusRoundsLeft--;
    state.total = 0;
    state.cardsThisRound = [];
    state.roundHasGolden = false;
    renderCards();
    renderTotal();
    totalSub.textContent = '「ひく」で1枚目を引こう';
    standBtn.disabled = true;
    hitBtn.disabled = false;
    updateHud();
  }

  function drawCard() {
    var value = 1 + Math.floor(Math.random() * 9);
    var golden = Math.random() < GOLDEN_CHANCE;
    return { value: value, golden: golden };
  }

  function hit() {
    if (!state || !state.playing) return;
    stopTimer();
    var card = drawCard();
    state.cardsThisRound.push(card);
    if (card.golden) state.roundHasGolden = true;
    state.total += card.value;
    sfxDraw(state.total, state.target);
    renderCards();

    if (state.total > state.target) {
      renderTotal('over');
      totalSub.textContent = 'オーバー!バースト';
      bust();
    } else if (state.total === state.target) {
      renderTotal('hit');
      totalSub.textContent = 'ジャストヒット!';
      hitBtn.disabled = true;
      standBtn.disabled = true;
      success(true);
    } else {
      renderTotal();
      totalSub.textContent = 'つづけて引く?ここでとめる?';
      standBtn.disabled = false;
      armTimer();
    }
    updateHud();
  }

  function stand() {
    if (!state || !state.playing || state.total === 0) return;
    stopTimer();
    hitBtn.disabled = true;
    standBtn.disabled = true;
    success(false);
  }

  function success(isPerfect) {
    var diff = state.target - state.total;
    var base = isPerfect ? 150 : Math.max(20, 100 - diff * 8);
    var comboBonus = state.comboStreak * 6;
    var mult = state.bonus ? BONUS_SCORE_MULT : 1;
    var gained = Math.round((base + comboBonus) * mult);
    var golden = state.roundHasGolden;
    if (golden) {
      gained += 50;
      if (state.lives < LIVES_START) state.lives++;
    }
    state.score += gained;
    state.comboStreak++;
    state.maxCombo = Math.max(state.maxCombo, state.comboStreak);
    state.successCount++;

    if (golden) { sfxGolden(); showToast('⭐ゴールド成功! +' + gained); }
    else if (isPerfect) { sfxPerfect(); showToast('ジャスト!! +' + gained); }
    else { sfxStand(); showToast((state.bonus ? '🌟ボーナス成功! +' : 'ストップ成功! +') + gained); }

    if (state.successCount % BONUS_EVERY === 0) {
      state.bonusRoundsLeft = 1;
      showToast('🌟次はボーナスラウンド!');
    }
    updateHud();

    clearTimeout(roundEndHandle);
    roundEndHandle = setTimeout(function () {
      if (state && state.playing) newRound();
    }, 900);
  }

  function bust() {
    stopTimer();
    hitBtn.disabled = true;
    standBtn.disabled = true;
    state.lives--;
    state.comboStreak = 0;
    sfxBust();
    showToast('バースト!ライフ-1');
    updateHud();
    if (state.lives <= 0) {
      clearTimeout(roundEndHandle);
      roundEndHandle = setTimeout(gameOver, 500);
      return;
    }
    clearTimeout(roundEndHandle);
    roundEndHandle = setTimeout(function () {
      if (state && state.playing) newRound();
    }, 900);
  }

  function gameOver() {
    state.playing = false;
    stopTimer();
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '通算成功回数: ' + state.successCount + '\n最大コンボ: ' + state.maxCombo + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    stopTimer();
    clearTimeout(roundEndHandle);
    state = {
      playing: true, score: 0, lives: LIVES_START, comboStreak: 0, maxCombo: 0,
      successCount: 0, bonusRoundsLeft: 0, bonus: false,
      target: BASE_TARGET, total: 0, cardsThisRound: [], roundHasGolden: false
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    newRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  hitBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); hit(); });
  standBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); stand(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'h' || e.key === 'H' || e.key === 'Enter') {
      e.preventDefault();
      hit();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') {
      e.preventDefault();
      stand();
    }
  });
})();
