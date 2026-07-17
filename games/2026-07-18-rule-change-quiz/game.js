(function () {
  'use strict';

  var GAME_TIME = 45;
  var MAX_TIME = GAME_TIME + 15;
  var MAX_LIVES = 3;
  var CORRECT_TIME_BONUS = 1;
  var WRONG_TIME_PENALTY = 4;
  var RUSH_LENGTH = 3;
  var RUSH_TRIGGER_COMBO = 5;

  var livesEl = document.getElementById('lives');
  var timeEl = document.getElementById('timeLabel');
  var scoreEl = document.getElementById('scoreLabel');
  var ruleBadgeEl = document.getElementById('ruleBadge');
  var rushBadgeEl = document.getElementById('rushBadge');
  var questionEl = document.getElementById('questionText');
  var flashEl = document.getElementById('flashMsg');
  var comboEl = document.getElementById('comboLabel');
  var trueBtn = document.getElementById('trueBtn');
  var falseBtn = document.getElementById('falseBtn');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
  var timerId = null;
  var audioCtx = null;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function beep(freq, dur, type) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (var i = 3; i * i <= n; i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  }

  function genCalc() {
    var ops = ['+', '-', '×'];
    var op = ops[randInt(0, 2)];
    var a, b, correct;
    if (op === '+') {
      a = randInt(2, 30); b = randInt(2, 30); correct = a + b;
    } else if (op === '-') {
      a = randInt(5, 40); b = randInt(1, a); correct = a - b;
    } else {
      a = randInt(2, 9); b = randInt(2, 9); correct = a * b;
    }
    var showTrue = Math.random() < 0.5;
    var shown = correct;
    if (!showTrue) {
      var delta = randInt(1, 5) * (Math.random() < 0.5 ? -1 : 1);
      shown = correct + delta;
      if (shown === correct) shown += 1;
    }
    return { text: a + ' ' + op + ' ' + b + ' = ' + shown, answer: showTrue };
  }

  function genPrime() {
    var n = randInt(2, 60);
    var actual = isPrime(n);
    var claimPrime = Math.random() < 0.5;
    var text = claimPrime ? (n + ' は素数') : (n + ' は素数ではない');
    var answer = claimPrime ? actual : !actual;
    return { text: text, answer: answer };
  }

  function genCompare() {
    var a = randInt(1, 99), b = randInt(1, 99);
    while (b === a) b = randInt(1, 99);
    var wantGreater = Math.random() < 0.5;
    var text = wantGreater ? (a + ' は ' + b + ' より大きい') : (a + ' は ' + b + ' より小さい');
    var answer = wantGreater ? (a > b) : (a < b);
    return { text: text, answer: answer };
  }

  function genMultiple() {
    var multiples = [2, 3, 4, 5, 6];
    var m = multiples[randInt(0, multiples.length - 1)];
    var forceMultiple = Math.random() < 0.5;
    var n;
    if (forceMultiple) {
      n = m * randInt(2, 20);
    } else {
      do { n = randInt(2, 99); } while (n % m === 0);
    }
    return { text: n + ' は ' + m + ' の倍数', answer: (n % m === 0) };
  }

  var RULES = [
    { key: 'calc', label: 'けいさん', cls: 'badge-calc', gen: genCalc },
    { key: 'prime', label: '素数', cls: 'badge-prime', gen: genPrime },
    { key: 'compare', label: '大小', cls: 'badge-compare', gen: genCompare },
    { key: 'multiple', label: '倍数', cls: 'badge-multiple', gen: genMultiple }
  ];

  function pickRule() {
    var prevKey = state.current ? state.current.rule.key : null;
    var rule, tries = 0;
    do {
      rule = RULES[randInt(0, RULES.length - 1)];
      tries++;
    } while (rule.key === prevKey && tries < 5);
    return rule;
  }

  function nextQuestion() {
    var rule = pickRule();
    var q = rule.gen();
    state.current = { rule: rule, answer: q.answer };
    state.awaitingNext = false;
    ruleBadgeEl.textContent = rule.label;
    ruleBadgeEl.className = 'ruleBadge ' + rule.cls;
    questionEl.textContent = q.text;
  }

  function flash(msg, cls) {
    flashEl.textContent = msg;
    flashEl.className = 'flashMsg' + (cls ? ' ' + cls : '');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { flashEl.textContent = ''; flashEl.className = 'flashMsg'; }, 700);
  }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(state.lives) + '♡'.repeat(MAX_LIVES - state.lives);
    scoreEl.textContent = 'SCORE ' + state.score;
    timeEl.textContent = Math.max(0, state.timeLeft).toFixed(1) + '秒';
    comboEl.textContent = state.combo > 0 ? ('コンボ x' + state.combo + '  倍率 ' + state.multiplier.toFixed(1)) : '';
    rushBadgeEl.classList.toggle('hidden', state.rushLeft <= 0);
  }

  function answer(playerSaysTrue) {
    if (!state || !state.running || state.awaitingNext) return;
    state.awaitingNext = true;
    var correct = (playerSaysTrue === state.current.answer);

    if (correct) {
      var rushActive = state.rushLeft > 0;
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.multiplier = 1 + Math.min(state.combo, 5) * 0.2;
      var gained = Math.round(10 * state.multiplier * (rushActive ? 2 : 1));
      state.score += gained;
      state.timeLeft = Math.min(MAX_TIME, state.timeLeft + CORRECT_TIME_BONUS);
      flash('せいかい! +' + gained, 'ok');
      beep(880, 0.12, 'triangle');

      if (rushActive) {
        state.rushLeft--;
      } else if (state.combo % RUSH_TRIGGER_COMBO === 0) {
        state.rushLeft = RUSH_LENGTH;
        flash('ラッシュタイム突入!', 'ok');
        beep(1200, 0.2, 'square');
      }
    } else {
      state.lives--;
      state.combo = 0;
      state.multiplier = 1;
      state.rushLeft = 0;
      state.timeLeft = Math.max(0, state.timeLeft - WRONG_TIME_PENALTY);
      flash('ちがう…', 'bad');
      beep(160, 0.3, 'sawtooth');
    }

    updateHud();

    if (state.lives <= 0 || state.timeLeft <= 0) {
      setTimeout(function () { endGame(state.lives <= 0 ? 'gameover' : 'timeup'); }, 300);
      return;
    }
    setTimeout(nextQuestion, correct ? 200 : 500);
  }

  function tick() {
    state.timeLeft = Math.round((state.timeLeft - 0.1) * 10) / 10;
    updateHud();
    if (state.timeLeft <= 0) {
      endGame('timeup');
    }
  }

  function endGame(reason) {
    if (!state || !state.running) return;
    state.running = false;
    clearInterval(timerId);
    timerId = null;
    resultTitleEl.textContent = reason === 'gameover' ? 'ライフがなくなった!' : 'タイムアップ!';
    resultTextEl.textContent = 'スコア: ' + state.score + '点 / 最高コンボ x' + state.bestCombo;
    resultEl.classList.remove('hidden');
  }

  function start() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    state = {
      running: true,
      score: 0,
      lives: MAX_LIVES,
      timeLeft: GAME_TIME,
      combo: 0,
      multiplier: 1,
      bestCombo: 0,
      rushLeft: 0,
      current: null,
      awaitingNext: false
    };

    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    updateHud();
    nextQuestion();

    clearInterval(timerId);
    timerId = setInterval(tick, 100);
  }

  trueBtn.addEventListener('click', function () { answer(true); });
  falseBtn.addEventListener('click', function () { answer(false); });
  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);

  document.addEventListener('keydown', function (e) {
    if (!state || !state.running) return;
    if (e.key === 'ArrowLeft' || e.key === 'o' || e.key === 'O' || e.key === 'z' || e.key === 'Z') {
      answer(true);
    } else if (e.key === 'ArrowRight' || e.key === 'x' || e.key === 'X') {
      answer(false);
    }
  });
})();
