(function () {
  'use strict';

  var introOverlay = document.getElementById('introOverlay');
  var overOverlay = document.getElementById('overOverlay');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var livesEl = document.getElementById('livesEl');
  var scoreEl = document.getElementById('scoreEl');
  var comboEl = document.getElementById('comboEl');
  var roundBanner = document.getElementById('roundBanner');
  var timerFill = document.getElementById('timerFill');
  var lampGrid = document.getElementById('lampGrid');
  var roundMsg = document.getElementById('roundMsg');
  var finalScore = document.getElementById('finalScore');
  var finalClears = document.getElementById('finalClears');

  var MAX_LAMPS = 7;
  var MIN_LAMPS = 3;
  var LIFE_MAX = 3;

  var lives, score, clears, combo, lamps, roundActive, roundTimeoutId, roundMsgTimeoutId, nextRoundTimeoutId;
  var audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(freq, dur, type, gain, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sndCorrect() { beep(760, 0.09, 'square', 0.15); }
  function sndGold() { beep(660, 0.09, 'triangle', 0.2); beep(990, 0.11, 'triangle', 0.2, 0.09); }
  function sndNogo() { beep(160, 0.22, 'sawtooth', 0.22); }
  function sndClear(bonus) {
    beep(520, 0.09, 'sine', 0.18);
    beep(780, 0.09, 'sine', 0.18, 0.09);
    if (bonus) beep(1040, 0.16, 'sine', 0.2, 0.18);
  }
  function sndFailTimeout() { beep(220, 0.28, 'sawtooth', 0.2); }
  function sndGameOver() {
    beep(300, 0.18, 'sawtooth', 0.2);
    beep(220, 0.18, 'sawtooth', 0.2, 0.16);
    beep(140, 0.32, 'sawtooth', 0.2, 0.32);
  }

  function lampCountForClears(c) {
    return Math.min(MAX_LAMPS, MIN_LAMPS + Math.floor(c / 2));
  }
  function durationForClears(c, bonus) {
    var d = Math.max(1500, 3300 - c * 90);
    return bonus ? d + 1200 : d;
  }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(LIFE_MAX - lives);
    scoreEl.textContent = 'SCORE ' + score;
    comboEl.textContent = combo >= 2 ? (combo + 'コンボ!') : '';
  }

  function showRoundMsg(text, cls) {
    roundMsg.textContent = text;
    roundMsg.className = 'roundMsg ' + (cls || '');
  }

  function clearTimers() {
    if (roundTimeoutId) { clearTimeout(roundTimeoutId); roundTimeoutId = null; }
    if (roundMsgTimeoutId) { clearTimeout(roundMsgTimeoutId); roundMsgTimeoutId = null; }
    if (nextRoundTimeoutId) { clearTimeout(nextRoundTimeoutId); nextRoundTimeoutId = null; }
  }

  function startRound() {
    var roundNum = clears + 1;
    var bonus = roundNum % 5 === 0;
    var n = lampCountForClears(clears);
    var duration = durationForClears(clears, bonus);

    lamps = [];
    var goIndices = [];
    for (var i = 0; i < n; i++) {
      var isGo = Math.random() < 0.55;
      lamps.push({ type: isGo ? 'go' : 'nogo', gold: false, tapped: false });
      if (isGo) goIndices.push(i);
    }
    if (goIndices.length > 0 && Math.random() < 0.18) {
      var gi = goIndices[Math.floor(Math.random() * goIndices.length)];
      lamps[gi].gold = true;
    }

    roundBanner.textContent = bonus ? '🌟ボーナスラウンド!' : ('ラウンド ' + roundNum);
    roundBanner.className = 'roundBanner' + (bonus ? ' bonus' : '');
    showRoundMsg('', '');

    renderLamps();

    timerFill.className = 'timerFill';
    timerFill.style.transition = 'none';
    timerFill.style.width = '100%';
    // force reflow so the next transition actually animates
    void timerFill.offsetWidth;
    timerFill.style.transition = 'width ' + duration + 'ms linear';
    timerFill.style.width = '0%';
    if (duration < 1900) timerFill.classList.add('danger');

    roundActive = true;
    roundTimeoutId = setTimeout(function () { onRoundTimeout(); }, duration);
  }

  function renderLamps() {
    lampGrid.innerHTML = '';
    lamps.forEach(function (lamp, idx) {
      var slot = document.createElement('div');
      slot.className = 'lampSlot';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lamp';
      btn.textContent = lamp.gold ? '⭐' : (lamp.type === 'go' ? '⭕' : '✖️');
      btn.addEventListener('click', function () { handleLampTap(idx); });

      var key = document.createElement('div');
      key.className = 'lampKey';
      key.textContent = String(idx + 1);

      slot.appendChild(btn);
      slot.appendChild(key);
      lampGrid.appendChild(slot);
      lamp.el = btn;
    });
  }

  function remainingGoCount() {
    var n = 0;
    for (var i = 0; i < lamps.length; i++) {
      if (lamps[i].type === 'go' && !lamps[i].tapped) n++;
    }
    return n;
  }

  function handleLampTap(idx) {
    if (!roundActive) return;
    var lamp = lamps[idx];
    if (!lamp || lamp.tapped) return;
    lamp.tapped = true;

    if (lamp.type === 'nogo') {
      lamp.el.classList.add('bad');
      sndNogo();
      resolveRound(false, 'nogo');
      return;
    }

    lamp.el.classList.add('good');
    if (lamp.gold) lamp.el.classList.add('gold');

    if (lamp.gold) {
      score += 50;
      lives = Math.min(LIFE_MAX, lives + 1);
      sndGold();
    } else {
      score += 10;
      sndCorrect();
    }
    updateHud();

    if (remainingGoCount() === 0) {
      resolveRound(true, 'alltapped');
    }
  }

  function onRoundTimeout() {
    if (!roundActive) return;
    if (remainingGoCount() === 0) {
      resolveRound(true, 'timeoutclear');
    } else {
      resolveRound(false, 'timeout');
    }
  }

  function resolveRound(success, reason) {
    if (!roundActive) return;
    roundActive = false;
    if (roundTimeoutId) { clearTimeout(roundTimeoutId); roundTimeoutId = null; }
    // freeze the timer bar at its current visual position instead of snapping to empty
    var trackWidth = timerFill.parentElement.clientWidth;
    var currentWidth = timerFill.getBoundingClientRect().width;
    var pct = trackWidth > 0 ? (currentWidth / trackWidth * 100) : 0;
    timerFill.style.transition = 'none';
    timerFill.style.width = pct + '%';

    var roundNum = clears + 1;
    var bonus = roundNum % 5 === 0;

    if (success) {
      clears++;
      combo++;
      var n = lamps.length;
      var base = n * 10 * (bonus ? 2 : 1);
      var comboMult = 1 + Math.min(combo - 1, 10) * 0.1;
      var roundScore = Math.round(base * comboMult);
      score += roundScore;
      showRoundMsg((reason === 'timeoutclear' ? 'せいかい!何もしないのが正解 +' : 'クリア! +') + roundScore, 'ok');
      sndClear(bonus);
    } else {
      lives--;
      combo = 0;
      showRoundMsg(reason === 'nogo' ? 'しっぱい…✖️に反応した' : 'しっぱい…間に合わなかった', 'ng');
      if (reason === 'timeout') sndFailTimeout();
    }
    updateHud();

    if (lives <= 0) {
      nextRoundTimeoutId = setTimeout(gameOver, 700);
      return;
    }
    nextRoundTimeoutId = setTimeout(startRound, 850);
  }

  function gameOver() {
    sndGameOver();
    finalScore.textContent = 'SCORE ' + score;
    finalClears.textContent = 'クリアラウンド数: ' + clears;
    overOverlay.classList.remove('hidden');
  }

  function resetState() {
    lives = LIFE_MAX;
    score = 0;
    clears = 0;
    combo = 0;
    roundActive = false;
    clearTimers();
    updateHud();
    showRoundMsg('', '');
  }

  function beginGame() {
    resetState();
    overOverlay.classList.add('hidden');
    introOverlay.classList.add('hidden');
    startRound();
  }

  startBtn.addEventListener('click', function () {
    initAudio();
    beginGame();
  });

  retryBtn.addEventListener('click', function () {
    initAudio();
    beginGame();
  });

  document.addEventListener('keydown', function (e) {
    if (!roundActive) return;
    var num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= lamps.length) {
      handleLampTap(num - 1);
    }
  });

  updateHud();
})();
