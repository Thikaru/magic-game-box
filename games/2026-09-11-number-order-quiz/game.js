(function () {
  'use strict';

  var MAX_LIVES = 3;
  var KANJI_DIGIT = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  var cardsEl = document.getElementById('cards');
  var progressEl = document.getElementById('progressStrip');
  var instrEl = document.getElementById('instr');
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
  var cardCount, roundTime, isBonusRound;
  var cards, targetOrder, pickedCount;
  var ascending, roundActive, goldIdx;
  var rafId, lastTs, timeLeft;
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

  function sndPick() { beep(560, 0.09, 'square', 0.13); }
  function sndGold() {
    beep(760, 0.09, 'sawtooth', 0.16, 0);
    beep(1080, 0.11, 'sawtooth', 0.18, 0.08);
  }
  function sndClear() {
    beep(660, 0.1, 'triangle', 0.2, 0);
    beep(880, 0.1, 'triangle', 0.2, 0.09);
    beep(1100, 0.16, 'triangle', 0.22, 0.18);
  }
  function sndBonus() {
    beep(700, 0.1, 'sawtooth', 0.15, 0);
    beep(1000, 0.1, 'sawtooth', 0.15, 0.09);
    beep(1300, 0.14, 'sawtooth', 0.18, 0.18);
  }
  function sndWrong() { beep(180, 0.3, 'sawtooth', 0.2); }
  function sndGameOver() {
    beep(300, 0.2, 'sawtooth', 0.2, 0);
    beep(220, 0.2, 'sawtooth', 0.2, 0.18);
    beep(140, 0.35, 'sawtooth', 0.22, 0.36);
  }

  function toKanji(n) {
    if (n <= 0) return '〇';
    if (n < 10) return KANJI_DIGIT[n];
    if (n < 20) return '十' + (n % 10 === 0 ? '' : KANJI_DIGIT[n % 10]);
    var tens = Math.floor(n / 10), ones = n % 10;
    return (tens > 1 ? KANJI_DIGIT[tens] : '') + '十' + (ones ? KANJI_DIGIT[ones] : '');
  }

  function difficultyFor(tc) {
    return {
      cardCount: Math.min(6, 4 + Math.floor(tc / 6)),
      minVal: 1,
      maxVal: Math.min(60, 9 + tc * 3),
      roundTime: Math.max(6, 13 - tc * 0.4),
      dotsUnlocked: tc >= 2,
      kanjiUnlocked: tc >= 5
    };
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  function updateHud() {
    roundLabelEl.textContent = 'ROUND ' + (totalClears + 1) + (isBonusRound ? ' 🌟' : '');
    scoreLabelEl.textContent = 'SCORE ' + score;
    livesLabelEl.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(MAX_LIVES - Math.max(0, lives));
  }

  function pickDistinct(min, max, count) {
    var lo = min, hi = Math.max(max, min + count + 3);
    var pool = [];
    for (var i = lo; i <= hi; i++) pool.push(i);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, count);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function renderCards() {
    cardsEl.className = 'cards ' + (cardCount <= 4 ? 'cols2' : 'cols3');
    cardsEl.innerHTML = '';
    cards.forEach(function (c, i) {
      var d = document.createElement('div');
      d.className = 'card' + (c.gold ? ' gold' : '');
      var k = document.createElement('span');
      k.className = 'k';
      k.textContent = String(i + 1);
      d.appendChild(k);
      var body;
      if (c.type === 'dots') {
        body = document.createElement('span');
        body.className = 'dots';
        body.textContent = '●'.repeat(c.value);
      } else {
        body = document.createElement('span');
        body.textContent = c.type === 'kanji' ? toKanji(c.value) : String(c.value);
      }
      d.appendChild(body);
      d.addEventListener('click', function () { pickCard(i); });
      cardsEl.appendChild(d);
      c.el = d;
    });
  }

  function renderProgress() {
    progressEl.innerHTML = '';
    for (var i = 0; i < pickedCount; i++) {
      var v = targetOrder[i];
      var chip = document.createElement('span');
      chip.className = 'chip' + (v.gold ? ' gold' : '');
      chip.textContent = v.value;
      progressEl.appendChild(chip);
    }
  }

  function pickCard(i) {
    if (!roundActive) return;
    var c = cards[i];
    if (c.el.classList.contains('picked') || c.el.classList.contains('disabled')) return;
    var expected = targetOrder[pickedCount];
    if (c.value === expected.value) {
      c.el.classList.add('picked', 'disabled');
      pickedCount++;
      renderProgress();
      if (c.gold) {
        sndGold();
        if (lives < MAX_LIVES) lives++;
        score += 30;
        showToast('⭐ ゴールド! +30 ライフ回復');
        updateHud();
      } else {
        sndPick();
      }
      if (pickedCount >= cardCount) {
        onClear();
      }
    } else {
      onWrong(i);
    }
  }

  function onWrong(i) {
    roundActive = false;
    cards[i].el.classList.add('wrong');
    cards.forEach(function (c, idx) {
      c.el.classList.add('disabled');
      if (idx !== i && !c.el.classList.contains('picked')) c.el.classList.add('reveal');
    });
    sndWrong();
    lives--;
    combo = 0;
    updateHud();
    var orderText = targetOrder.map(function (v) { return v.value; }).join(' → ');
    showToast('正解の順番: ' + orderText);
    if (lives <= 0) {
      setTimeout(gameOver, 900);
    } else {
      setTimeout(startRound, 1500);
    }
  }

  function onTimeout() {
    if (!roundActive) return;
    roundActive = false;
    cards.forEach(function (c) {
      c.el.classList.add('disabled');
      if (!c.el.classList.contains('picked')) c.el.classList.add('reveal');
    });
    sndWrong();
    lives--;
    combo = 0;
    updateHud();
    var orderText = targetOrder.map(function (v) { return v.value; }).join(' → ');
    showToast('⏰ 時間切れ! 正解: ' + orderText);
    if (lives <= 0) {
      setTimeout(gameOver, 900);
    } else {
      setTimeout(startRound, 1500);
    }
  }

  function onClear() {
    roundActive = false;
    sndClear();
    var base = 30 * cardCount + Math.floor(timeLeft) * 3;
    var mult = 1 + Math.floor(combo / 5) * 0.5;
    var gained = Math.round(base * mult * (isBonusRound ? 2 : 1));
    score += gained;
    combo++;
    totalClears++;
    if (isBonusRound) sndBonus();
    showToast((isBonusRound ? '🌟 ボーナスクリア!' : '✅ せいかい!') + ' +' + gained);
    updateHud();
    setTimeout(startRound, 900);
  }

  function buildRound() {
    var diff = difficultyFor(totalClears);
    isBonusRound = combo > 0 && combo % 5 === 0;
    cardCount = isBonusRound ? Math.max(3, diff.cardCount - 1) : diff.cardCount;
    roundTime = diff.roundTime + (isBonusRound ? 6 : 0);
    ascending = Math.random() < 0.5;

    var values = pickDistinct(diff.minVal, diff.maxVal, cardCount);
    var goldPos = (Math.random() < 0.18) ? Math.floor(Math.random() * cardCount) : -1;

    cards = values.map(function (v, idx) {
      var type = 'digit';
      if (!isBonusRound) {
        var options = ['digit'];
        if (diff.dotsUnlocked && v <= 12) options.push('dots');
        if (diff.kanjiUnlocked) options.push('kanji');
        type = options[Math.floor(Math.random() * options.length)];
      }
      return { value: v, type: type, gold: idx === goldPos };
    });
    cards = shuffle(cards);

    var sorted = values.slice().sort(function (a, b) { return ascending ? a - b : b - a; });
    targetOrder = sorted.map(function (v) {
      var match = cards.filter(function (c) { return c.value === v; })[0];
      return { value: v, gold: match.gold };
    });
    pickedCount = 0;
    goldIdx = goldPos;
  }

  function startRound() {
    resultEl.classList.add('hidden');
    buildRound();
    instrEl.textContent = (ascending ? '⬆️ 小さい順にタップ!' : '⬇️ 大きい順にタップ!');
    renderCards();
    renderProgress();
    updateHud();
    timerBarEl.style.width = '100%';
    timerBarEl.classList.remove('warn');

    timeLeft = roundTime;
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
    resultTextEl.textContent = 'スコア: ' + score + '　クリアしたラウンド数: ' + totalClears;
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
    if (e.key >= '1' && e.key <= '6') {
      var idx = parseInt(e.key, 10) - 1;
      if (idx < cardCount) pickCard(idx);
    }
  });
})();
