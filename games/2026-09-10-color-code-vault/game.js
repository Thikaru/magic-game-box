(function () {
  'use strict';

  var COLORS = [
    { name: '赤', hex: '#ff5d7a', sym: '●' },
    { name: '橙', hex: '#ff8a4c', sym: '▲' },
    { name: '黄', hex: '#ffd23f', sym: '■' },
    { name: '緑', hex: '#5fe3a8', sym: '◆' },
    { name: '青', hex: '#4ea8ff', sym: '★' },
    { name: '紫', hex: '#b98bff', sym: '✚' }
  ];
  var MAX_LIVES = 3;

  var slotsEl = document.getElementById('slots');
  var paletteEl = document.getElementById('palette');
  var historyEl = document.getElementById('history');
  var hintBarEl = document.getElementById('hintBar');
  var roundLabelEl = document.getElementById('roundLabel');
  var scoreLabelEl = document.getElementById('scoreLabel');
  var livesLabelEl = document.getElementById('livesLabel');
  var timerBarEl = document.getElementById('timerBar');
  var toastEl = document.getElementById('toast');
  var backspaceBtn = document.getElementById('backspaceBtn');
  var submitBtn = document.getElementById('submitBtn');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var lives, score, combo, totalClears;
  var codeLength, numColors, maxGuesses, roundTime;
  var secret, currentGuess, guessesUsed, timeLeft;
  var roundActive, isBonusRound, hintPos, hintColorIdx;
  var rafId, lastTs;
  var audioCtx = null;
  var toastTimer = null;

  function initAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    }
  }

  function beep(freq, dur, type, vol, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sndTap() { beep(520, 0.08, 'square', 0.12); }
  function sndBackspace() { beep(300, 0.08, 'square', 0.1); }
  function sndSubmit() { beep(420, 0.1, 'triangle', 0.15); }
  function sndCrack() {
    beep(660, 0.12, 'triangle', 0.2, 0);
    beep(880, 0.12, 'triangle', 0.2, 0.1);
    beep(1100, 0.18, 'triangle', 0.22, 0.2);
  }
  function sndBonus() {
    beep(700, 0.1, 'sawtooth', 0.15, 0);
    beep(1000, 0.1, 'sawtooth', 0.15, 0.09);
    beep(1300, 0.14, 'sawtooth', 0.18, 0.18);
  }
  function sndFail() { beep(180, 0.3, 'sawtooth', 0.2); }
  function sndHint() { beep(950, 0.1, 'sine', 0.15); }
  function sndGameOver() {
    beep(300, 0.2, 'sawtooth', 0.2, 0);
    beep(220, 0.2, 'sawtooth', 0.2, 0.18);
    beep(140, 0.35, 'sawtooth', 0.22, 0.36);
  }

  function difficultyFor(tc) {
    return {
      codeLength: Math.min(6, 4 + Math.floor(tc / 4)),
      numColors: Math.min(6, 4 + Math.floor(tc / 3)),
      maxGuesses: Math.max(6, 9 - Math.floor(tc / 6)),
      roundTime: Math.max(24, 48 - tc * 2)
    };
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1300);
  }

  function updateHud() {
    roundLabelEl.textContent = 'CODE ' + (totalClears + 1) + (isBonusRound ? ' 🌟' : '');
    scoreLabelEl.textContent = 'SCORE ' + score;
    livesLabelEl.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(MAX_LIVES - Math.max(0, lives));
  }

  function renderSlots() {
    slotsEl.innerHTML = '';
    for (var i = 0; i < codeLength; i++) {
      var d = document.createElement('div');
      d.className = 'slot';
      var numSpan = document.createElement('span');
      numSpan.className = 'num';
      numSpan.textContent = String(i + 1);
      d.appendChild(numSpan);
      if (i < currentGuess.length) {
        var c = COLORS[currentGuess[i]];
        d.classList.add('filled');
        d.style.background = c.hex;
        d.style.color = '#0b0b12';
        d.style.borderColor = c.hex;
        var symSpan = document.createElement('span');
        symSpan.textContent = c.sym;
        d.appendChild(symSpan);
      }
      slotsEl.appendChild(d);
    }
    submitBtn.disabled = currentGuess.length !== codeLength;
  }

  function renderPalette() {
    paletteEl.innerHTML = '';
    for (var i = 0; i < numColors; i++) {
      var c = COLORS[i];
      var b = document.createElement('div');
      b.className = 'peg';
      b.style.background = c.hex;
      b.textContent = c.sym;
      var k = document.createElement('span');
      k.className = 'k';
      k.textContent = String(i + 1);
      b.appendChild(k);
      b.addEventListener('click', (function (idx) { return function () { pickColor(idx); }; })(i));
      paletteEl.appendChild(b);
    }
  }

  function renderHint() {
    if (hintPos !== null) {
      hintBarEl.textContent = '💡 ヒント: ' + (hintPos + 1) + '番目は' + COLORS[hintColorIdx].sym + COLORS[hintColorIdx].name;
    } else {
      hintBarEl.textContent = '';
    }
  }

  function pickColor(idx) {
    if (!roundActive) return;
    if (currentGuess.length >= codeLength) return;
    currentGuess.push(idx);
    sndTap();
    renderSlots();
  }

  function backspace() {
    if (!roundActive) return;
    if (currentGuess.length === 0) return;
    currentGuess.pop();
    sndBackspace();
    renderSlots();
  }

  function feedbackFor(guess, target) {
    var exact = 0;
    var secretRest = {};
    var guessRest = {};
    for (var i = 0; i < guess.length; i++) {
      if (guess[i] === target[i]) {
        exact++;
      } else {
        secretRest[target[i]] = (secretRest[target[i]] || 0) + 1;
        guessRest[guess[i]] = (guessRest[guess[i]] || 0) + 1;
      }
    }
    var colorOnly = 0;
    for (var key in guessRest) {
      var have = secretRest[key] || 0;
      colorOnly += Math.min(have, guessRest[key]);
    }
    return { exact: exact, colorOnly: colorOnly };
  }

  function addHistoryRow(guess, fb) {
    var row = document.createElement('div');
    row.className = 'histRow';
    var pegs = document.createElement('div');
    pegs.className = 'pegs';
    for (var i = 0; i < guess.length; i++) {
      var s = document.createElement('span');
      s.style.background = COLORS[guess[i]].hex;
      pegs.appendChild(s);
    }
    row.appendChild(pegs);
    var fbEl = document.createElement('span');
    fbEl.className = 'fb';
    fbEl.innerHTML = '🎯<b>' + fb.exact + '</b> 🎨<i>' + fb.colorOnly + '</i>';
    row.appendChild(fbEl);
    historyEl.insertBefore(row, historyEl.firstChild);
  }

  function submitGuess() {
    if (!roundActive) return;
    if (currentGuess.length !== codeLength) return;
    sndSubmit();
    var fb = feedbackFor(currentGuess, secret);
    addHistoryRow(currentGuess, fb);

    if (fb.exact === codeLength) {
      onCrack();
      return;
    }

    guessesUsed++;
    currentGuess = [];
    renderSlots();

    if (guessesUsed >= maxGuesses) {
      onFail();
    }
  }

  function onCrack() {
    roundActive = false;
    var remainingGuesses = maxGuesses - guessesUsed - 1;
    var base = 80 * codeLength + Math.max(0, remainingGuesses) * 15 + Math.floor(timeLeft) * 3;
    var mult = 1 + Math.floor(combo / 5) * 0.5;
    var gained = Math.round(base * mult * (isBonusRound ? 2 : 1));
    score += gained;
    combo++;
    totalClears++;
    if (isBonusRound) sndBonus(); else sndCrack();
    showToast((isBonusRound ? '🌟 ボーナス解除!' : '🔓 解除!') + ' +' + gained);
    updateHud();
    setTimeout(startRound, 900);
  }

  function onFail() {
    roundActive = false;
    lives--;
    combo = 0;
    sndFail();
    updateHud();
    if (lives <= 0) {
      setTimeout(gameOver, 500);
    } else {
      showToast('🔒 解除できず… ライフ-1');
      setTimeout(startRound, 1000);
    }
  }

  function onTimeout() {
    if (!roundActive) return;
    onFail();
  }

  function startRound() {
    var diff = difficultyFor(totalClears);
    isBonusRound = combo > 0 && combo % 5 === 0;
    codeLength = diff.codeLength - (isBonusRound ? 1 : 0);
    if (codeLength < 3) codeLength = 3;
    numColors = diff.numColors;
    maxGuesses = diff.maxGuesses;
    roundTime = diff.roundTime + (isBonusRound ? 15 : 0);

    secret = [];
    for (var i = 0; i < codeLength; i++) {
      secret.push(Math.floor(Math.random() * numColors));
    }
    currentGuess = [];
    guessesUsed = 0;
    timeLeft = roundTime;

    hintPos = null;
    hintColorIdx = null;
    if (isBonusRound || Math.random() < 0.15) {
      hintPos = Math.floor(Math.random() * codeLength);
      hintColorIdx = secret[hintPos];
      sndHint();
    }

    historyEl.innerHTML = '';
    renderSlots();
    renderPalette();
    renderHint();
    updateHud();
    timerBarEl.style.width = '100%';
    timerBarEl.classList.remove('warn');

    roundActive = true;
    lastTs = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick(ts) {
    if (!roundActive) return;
    if (lastTs === null) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    timeLeft -= dt;
    if (timeLeft < 0) timeLeft = 0;
    var pct = Math.max(0, (timeLeft / roundTime) * 100);
    timerBarEl.style.width = pct + '%';
    if (pct < 30) timerBarEl.classList.add('warn');
    if (timeLeft <= 0) {
      onTimeout();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function gameOver() {
    resultTitleEl.textContent = '💥 ゲームオーバー';
    resultTextEl.textContent = 'スコア: ' + score + '　解除したコード数: ' + totalClears;
    resultEl.classList.remove('hidden');
    sndGameOver();
  }

  function startGame() {
    lives = MAX_LIVES;
    score = 0;
    combo = 0;
    totalClears = 0;
    resultEl.classList.add('hidden');
    startRound();
  }

  startBtn.addEventListener('click', function () {
    initAudio();
    introEl.classList.add('hidden');
    startGame();
  });

  retryBtn.addEventListener('click', function () {
    resultEl.classList.add('hidden');
    startGame();
  });

  submitBtn.addEventListener('click', submitGuess);
  backspaceBtn.addEventListener('click', backspace);

  document.addEventListener('keydown', function (e) {
    if (!introEl.classList.contains('hidden')) return;
    if (!resultEl.classList.contains('hidden')) return;
    if (e.key >= '1' && e.key <= '6') {
      var idx = parseInt(e.key, 10) - 1;
      if (idx < numColors) pickColor(idx);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key === 'Enter') {
      submitGuess();
    }
  });
})();
