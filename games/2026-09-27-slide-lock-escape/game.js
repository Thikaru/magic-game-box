(function () {
  'use strict';

  var MAX_LIVES = 3;

  var gridEl = document.getElementById('grid');
  var hintBarEl = document.getElementById('hintBar');
  var roundLabelEl = document.getElementById('roundLabel');
  var scoreLabelEl = document.getElementById('scoreLabel');
  var livesLabelEl = document.getElementById('livesLabel');
  var timerBarEl = document.getElementById('timerBar');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var lives, score, combo, totalClears;
  var size, roundTime, shuffleMoves;
  var board, blankIndex, timeLeft;
  var goldenValue, goldenTriggered;
  var roundActive, isBonusRound;
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

  function sndSlide() { beep(440, 0.06, 'square', 0.1); }
  function sndGolden() {
    beep(760, 0.1, 'sawtooth', 0.16, 0);
    beep(1050, 0.12, 'sawtooth', 0.18, 0.09);
  }
  function sndUnlock() {
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
  function sndGameOver() {
    beep(300, 0.2, 'sawtooth', 0.2, 0);
    beep(220, 0.2, 'sawtooth', 0.2, 0.18);
    beep(140, 0.35, 'sawtooth', 0.22, 0.36);
  }

  function difficultyFor(tc) {
    if (tc < 3) {
      return {
        size: 3,
        roundTime: Math.max(20, 40 - tc * 3),
        shuffleMoves: 16 + tc * 3
      };
    }
    var t4 = tc - 3;
    return {
      size: 4,
      roundTime: Math.max(28, 60 - t4 * 3),
      shuffleMoves: 30 + t4 * 4
    };
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1300);
  }

  function updateHud() {
    roundLabelEl.textContent = 'LOCK ' + (totalClears + 1) + (isBonusRound ? ' 🌟' : '');
    scoreLabelEl.textContent = 'SCORE ' + score;
    livesLabelEl.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(MAX_LIVES - Math.max(0, lives));
  }

  function neighborsOf(idx, n) {
    var row = Math.floor(idx / n);
    var col = idx % n;
    var list = [];
    if (row > 0) list.push(idx - n);
    if (row < n - 1) list.push(idx + n);
    if (col > 0) list.push(idx - 1);
    if (col < n - 1) list.push(idx + 1);
    return list;
  }

  function isSolved(b) {
    for (var i = 0; i < b.length - 1; i++) {
      if (b[i] !== i + 1) return false;
    }
    return b[b.length - 1] === 0;
  }

  function generateBoard(n, moves) {
    var total = n * n;
    var b = [];
    for (var i = 1; i < total; i++) b.push(i);
    b.push(0);
    var blank = total - 1;
    var prevBlank = -1;
    for (var k = 0; k < moves; k++) {
      var opts = neighborsOf(blank, n).filter(function (x) { return x !== prevBlank; });
      if (opts.length === 0) opts = neighborsOf(blank, n);
      var pick = opts[Math.floor(Math.random() * opts.length)];
      b[blank] = b[pick];
      b[pick] = 0;
      prevBlank = blank;
      blank = pick;
    }
    return { board: b, blank: blank };
  }

  function render() {
    gridEl.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';
    gridEl.innerHTML = '';
    var fontSize = size >= 4 ? '1.15rem' : '1.4rem';
    for (var i = 0; i < board.length; i++) {
      var v = board[i];
      var t = document.createElement('button');
      t.className = 'tile';
      t.style.fontSize = fontSize;
      if (v === 0) {
        t.classList.add('blank');
      } else {
        t.textContent = String(v);
        if (v === i + 1) t.classList.add('solved');
        if (goldenValue !== null && v === goldenValue) t.classList.add('golden');
        (function (idx) {
          t.addEventListener('click', function () { trySlide(idx); });
        })(i);
      }
      gridEl.appendChild(t);
    }
  }

  function trySlide(idx) {
    if (!roundActive) return;
    var neigh = neighborsOf(blankIndex, size);
    if (neigh.indexOf(idx) === -1) return;
    board[blankIndex] = board[idx];
    board[idx] = 0;
    blankIndex = idx;
    sndSlide();
    checkGolden();
    render();
    if (isSolved(board)) {
      onUnlock();
    }
  }

  function checkGolden() {
    if (goldenValue === null || goldenTriggered) return;
    var targetIdx = goldenValue - 1;
    if (board[targetIdx] === goldenValue) {
      goldenTriggered = true;
      var bonusScore = 100 + size * 20;
      var bonusTime = 7;
      score += bonusScore;
      timeLeft += bonusTime;
      goldenValue = null;
      sndGolden();
      showToast('⭐ ゴールデンパネル! +' + bonusScore + ' 時間+' + bonusTime + 's');
      updateHud();
    }
  }

  function onUnlock() {
    roundActive = false;
    var base = 50 * size * size + Math.floor(timeLeft) * 4;
    var mult = 1 + Math.floor(combo / 5) * 0.5;
    var gained = Math.round(base * mult * (isBonusRound ? 2 : 1));
    score += gained;
    combo++;
    totalClears++;
    if (isBonusRound) sndBonus(); else sndUnlock();
    showToast((isBonusRound ? '🌟 ボーナス解錠!' : '🔓 解錠!') + ' +' + gained);
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
      showToast('⏱ 時間切れ… ライフ-1');
      setTimeout(startRound, 1000);
    }
  }

  function startRound() {
    var diff = difficultyFor(totalClears);
    isBonusRound = combo > 0 && combo % 5 === 0;
    size = diff.size;
    roundTime = diff.roundTime + (isBonusRound ? 15 : 0);
    shuffleMoves = diff.shuffleMoves;

    var gen = generateBoard(size, shuffleMoves);
    board = gen.board;
    blankIndex = gen.blank;
    timeLeft = roundTime;

    goldenValue = null;
    goldenTriggered = false;
    if (Math.random() < 0.4) {
      var candidates = [];
      for (var i = 1; i < size * size; i++) {
        if (board[i - 1] !== i) candidates.push(i);
      }
      if (candidates.length > 0) {
        goldenValue = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    hintBarEl.textContent = goldenValue !== null ? '⭐ 金色のパネルを正しい位置へ!' : '';
    render();
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
    var pct = Math.max(0, Math.min(100, (timeLeft / roundTime) * 100));
    timerBarEl.style.width = pct + '%';
    if (pct < 30) timerBarEl.classList.add('warn');
    if (timeLeft <= 0) {
      onFail();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function gameOver() {
    resultTitleEl.textContent = '💥 ゲームオーバー';
    resultTextEl.textContent = 'スコア: ' + score + '　解錠したロック数: ' + totalClears;
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

  document.addEventListener('keydown', function (e) {
    if (!introEl.classList.contains('hidden')) return;
    if (!resultEl.classList.contains('hidden')) return;
    if (!roundActive) return;
    var row = Math.floor(blankIndex / size);
    var col = blankIndex % size;
    var targetIdx = null;
    if (e.key === 'ArrowUp' && row > 0) targetIdx = blankIndex - size;
    else if (e.key === 'ArrowDown' && row < size - 1) targetIdx = blankIndex + size;
    else if (e.key === 'ArrowLeft' && col > 0) targetIdx = blankIndex - 1;
    else if (e.key === 'ArrowRight' && col < size - 1) targetIdx = blankIndex + 1;
    if (targetIdx !== null) {
      e.preventDefault();
      trySlide(targetIdx);
    }
  });
})();
