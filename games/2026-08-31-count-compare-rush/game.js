(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var FIELD_TOP = 70;
  var MID_X = W / 2;

  var COLORS = [
    { name: 'あお', css: '#4f9dff' },
    { name: 'あか', css: '#ff5d6c' },
    { name: 'みどり', css: '#4ade80' },
    { name: 'むらさき', css: '#b98aff' }
  ];

  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var leftBtn = document.getElementById('leftBtn');
  var rightBtn = document.getElementById('rightBtn');
  var equalBtn = document.getElementById('equalBtn');
  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');

  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  function sfxCorrect() { beep(880, 0.12, 'square', 0.18); beep(1320, 0.12, 'square', 0.14, 0.06); }
  function sfxWrong() { beep(180, 0.25, 'sawtooth', 0.2); }
  function sfxGold() { beep(1200, 0.08, 'sine', 0.2); beep(1600, 0.08, 'sine', 0.18, 0.08); beep(2000, 0.12, 'sine', 0.16, 0.16); }
  function sfxGameOver() { beep(300, 0.2, 'sawtooth', 0.2); beep(220, 0.3, 'sawtooth', 0.2, 0.2); beep(140, 0.4, 'sawtooth', 0.2, 0.4); }
  function sfxRound() { beep(520, 0.06, 'square', 0.1); }
  function sfxBonus() { beep(660, 0.1, 'triangle', 0.15); beep(880, 0.12, 'triangle', 0.15, 0.08); }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  var state = 'intro'; // intro | playing | feedback | gameover
  var score = 0, combo = 0, lives = 3, correctCount = 0, bestCombo = 0;
  var nextIsBonus = false;
  var round = null;
  var roundStartT = 0;
  var feedbackData = null;
  var feedbackTimer = null;

  function level() { return Math.min(Math.floor(correctCount / 3), 12); }

  function placeDots(n, colorCss, side) {
    var pts = [];
    var minX = side === 'left' ? 14 : MID_X + 14;
    var maxX = side === 'left' ? MID_X - 14 : W - 14;
    var minY = FIELD_TOP + 14;
    var maxY = H - 14;
    var r = 10;
    for (var i = 0; i < n; i++) {
      var x, y, ok, tries = 0;
      do {
        x = minX + Math.random() * (maxX - minX);
        y = minY + Math.random() * (maxY - minY);
        ok = true;
        for (var k = 0; k < pts.length; k++) {
          if (Math.hypot(pts[k].x - x, pts[k].y - y) < r * 2.1) { ok = false; break; }
        }
        tries++;
      } while (!ok && tries < 60);
      pts.push({ x: x, y: y, r: r, color: colorCss });
    }
    return pts;
  }

  function randomPointInHalf(side) {
    var minX = side === 'left' ? 24 : MID_X + 24;
    var maxX = side === 'left' ? MID_X - 24 : W - 24;
    return {
      x: minX + Math.random() * (maxX - minX),
      y: FIELD_TOP + 24 + Math.random() * (H - FIELD_TOP - 48)
    };
  }

  function newRound() {
    var lv = level();
    var bonus = nextIsBonus;
    nextIsBonus = false;

    var tMin = Math.min(2 + Math.floor(lv / 3), 7);
    var tMax = Math.min(tMin + 3, 10);
    var dMin = Math.min(2 + Math.floor(lv / 4), 6);
    var dMax = Math.min(dMin + 3, 9);
    var maxGap = Math.max(4 - Math.floor(lv / 3), 1);

    var idx = shuffle([0, 1, 2, 3]);
    var targetColor = COLORS[idx[0]];
    var decoyColor = COLORS[idx[1]];

    var leftT = randInt(tMin, tMax);
    var rightT;
    if (Math.random() < 0.28) {
      rightT = leftT;
    } else {
      var gap = randInt(1, maxGap);
      if (Math.random() < 0.5) {
        rightT = leftT + gap;
      } else {
        rightT = leftT - gap;
        if (rightT < 0) rightT = leftT + gap;
      }
    }
    var leftD = randInt(dMin, dMax);
    var rightD = randInt(dMin, dMax);

    var hasStar = Math.random() < (bonus ? 0.6 : 0.12);
    var starSide = Math.random() < 0.5 ? 'left' : 'right';

    var leftDots = placeDots(leftT, targetColor.css, 'left').concat(placeDots(leftD, decoyColor.css, 'left'));
    var rightDots = placeDots(rightT, targetColor.css, 'right').concat(placeDots(rightD, decoyColor.css, 'right'));

    var duration = Math.max((bonus ? 3100 : 2600) - lv * 130, bonus ? 1500 : 1000);

    round = {
      targetColor: targetColor, decoyColor: decoyColor,
      leftT: leftT, rightT: rightT, leftD: leftD, rightD: rightD,
      leftDots: leftDots, rightDots: rightDots,
      bonus: bonus, hasStar: hasStar,
      starPos: hasStar ? randomPointInHalf(starSide) : null,
      duration: duration,
      answered: false
    };
    roundStartT = performance.now();
    state = 'playing';
    sfxRound();
    if (bonus) sfxBonus();
    updateHud();
  }

  function evaluate(choice) {
    if (!round || round.answered) return;
    round.answered = true;
    var correctAns = round.leftT > round.rightT ? 'left' : (round.rightT > round.leftT ? 'right' : 'equal');
    var timeout = choice === null;
    var isCorrect = !timeout && choice === correctAns;
    var starBonus = false;

    if (isCorrect) {
      correctCount++;
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      var lv = level();
      var gained = 10 + lv * 3;
      var comboMult = 1 + Math.min(Math.floor(combo / 5), 4) * 0.5;
      gained = Math.round(gained * comboMult);
      if (round.bonus) gained *= 2;
      if (round.hasStar) { gained += 40; starBonus = true; lives = Math.min(3, lives + 1); }
      score += gained;
      sfxCorrect();
      if (round.hasStar) sfxGold();
      if (combo > 0 && combo % 5 === 0) nextIsBonus = true;
    } else {
      combo = 0;
      lives--;
      sfxWrong();
    }

    feedbackData = { correct: isCorrect, timeout: timeout, starBonus: starBonus };
    state = 'feedback';
    updateHud();

    if (feedbackTimer) clearTimeout(feedbackTimer);
    if (lives <= 0) {
      feedbackTimer = setTimeout(gameOver, 900);
    } else {
      feedbackTimer = setTimeout(function () {
        if (state === 'feedback') newRound();
      }, 900);
    }
  }

  function gameOver() {
    state = 'gameover';
    sfxGameOver();
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML = 'スコア: <b>' + score + '</b><br>さいだいコンボ: ' + bestCombo + '<br>せいかい数: ' + correctCount;
    resultEl.classList.remove('hidden');
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
  }

  function tryAnswer(choice) {
    if (state !== 'playing') return;
    evaluate(choice);
  }

  leftBtn.addEventListener('click', function () { tryAnswer('left'); });
  rightBtn.addEventListener('click', function () { tryAnswer('right'); });
  equalBtn.addEventListener('click', function () { tryAnswer('equal'); });

  window.addEventListener('keydown', function (e) {
    if (state !== 'playing') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { tryAnswer('left'); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { tryAnswer('right'); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === ' ') { e.preventDefault(); tryAnswer('equal'); }
  });

  function resetGame() {
    score = 0; combo = 0; lives = 3; correctCount = 0; bestCombo = 0; nextIsBonus = false;
    round = null; feedbackData = null;
    if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
    updateHud();
  }

  startBtn.addEventListener('click', function () {
    ensureAudio();
    introEl.classList.add('hidden');
    resetGame();
    newRound();
  });
  retryBtn.addEventListener('click', function () {
    ensureAudio();
    resultEl.classList.add('hidden');
    resetGame();
    newRound();
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, W, FIELD_TOP);

    if (round) {
      ctx.fillStyle = '#f2f6ff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('かぞえる色', 12, 22);
      ctx.beginPath();
      ctx.arc(102, 17, 10, 0, Math.PI * 2);
      ctx.fillStyle = round.targetColor.css;
      ctx.fill();

      if (round.bonus) {
        ctx.fillStyle = '#ffd23f';
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText('🌟ボーナス', W - 12, 22);
      }

      var elapsed = (state === 'playing') ? (performance.now() - roundStartT) : round.duration;
      var remain = Math.max(0, 1 - elapsed / round.duration);
      ctx.fillStyle = '#2a3348';
      ctx.fillRect(12, 34, W - 24, 10);
      ctx.fillStyle = remain > 0.3 ? '#5be3c9' : '#ff5d6c';
      ctx.fillRect(12, 34, (W - 24) * remain, 10);

      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.beginPath();
      ctx.moveTo(MID_X, FIELD_TOP);
      ctx.lineTo(MID_X, H);
      ctx.stroke();

      var allDots = round.leftDots.concat(round.rightDots);
      for (var i = 0; i < allDots.length; i++) {
        var d = allDots[i];
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
      }

      if (round.hasStar && round.starPos) {
        ctx.font = '26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', round.starPos.x, round.starPos.y);
        ctx.textBaseline = 'alphabetic';
      }

      if (state === 'feedback' && feedbackData) {
        ctx.fillStyle = 'rgba(8,13,22,.55)';
        ctx.fillRect(0, FIELD_TOP, W, H - FIELD_TOP);
        ctx.textAlign = 'center';
        ctx.fillStyle = feedbackData.correct ? '#5be3c9' : '#ff5d6c';
        ctx.font = 'bold 24px system-ui, sans-serif';
        var msg = feedbackData.correct ? '✔ せいかい!' : (feedbackData.timeout ? '⌛ じかんぎれ' : '✘ ざんねん');
        ctx.fillText(msg, MID_X, FIELD_TOP + 60);
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillStyle = '#f2f6ff';
        ctx.fillText('ひだり ' + round.leftT + '　みぎ ' + round.rightT, MID_X, FIELD_TOP + 92);
        if (feedbackData.starBonus) {
          ctx.fillStyle = '#ffd23f';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillText('⭐ラッキーボーナス!', MID_X, FIELD_TOP + 118);
        }
      }
    }
  }

  function loop() {
    if (state === 'playing' && round) {
      var elapsed = performance.now() - roundStartT;
      if (elapsed >= round.duration) {
        evaluate(null);
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  updateHud();
  requestAnimationFrame(loop);
})();
