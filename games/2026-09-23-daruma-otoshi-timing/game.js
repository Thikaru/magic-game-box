(function () {
  'use strict';

  var introOverlay = document.getElementById('intro');
  var resultOverlay = document.getElementById('result');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var hitBtn = document.getElementById('hitBtn');
  var livesEl = document.getElementById('livesEl');
  var scoreEl = document.getElementById('scoreEl');
  var comboEl = document.getElementById('comboEl');
  var roundBanner = document.getElementById('roundBanner');
  var tiltFill = document.getElementById('tiltFill');
  var tiltPct = document.getElementById('tiltPct');
  var towerEl = document.getElementById('tower');
  var attemptMsg = document.getElementById('attemptMsg');
  var track = document.getElementById('track');
  var zoneGood = document.getElementById('zoneGood');
  var zonePerfect = document.getElementById('zonePerfect');
  var marker = document.getElementById('marker');
  var stage = document.getElementById('stage');
  var resultTitle = document.getElementById('resultTitle');
  var finalTowers = document.getElementById('finalTowers');
  var finalCombo = document.getElementById('finalCombo');
  var finalScore = document.getElementById('finalScore');

  var LIFE_MAX = 3;
  var GOLD_CHANCE = 0.16;
  var MISS_TILT = 24;
  var GOOD_TILT = 9;
  var PERFECT_RELIEF = 2;
  var GOLD_RELIEF = 25;

  var lives, score, towersCleared, combo, maxCombo, tilt, gameActive;
  var round, blocksTotal, blocksRemaining, isBonusRound, targetGold;
  var attemptState, attemptStartTime, period, zoneCenter, perfectHalf, goodHalf;
  var pendingTimeoutId = null;
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

  function noiseBurst(dur, gain) {
    if (!audioCtx) return;
    var bufferSize = Math.floor(audioCtx.sampleRate * dur);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(gain || 0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    src.connect(g);
    g.connect(audioCtx.destination);
    src.start();
  }

  function sndPerfect() { beep(880, 0.08, 'triangle', 0.2); beep(1320, 0.1, 'triangle', 0.16, 0.06); }
  function sndGood() { beep(520, 0.1, 'sine', 0.18); }
  function sndMiss() { beep(180, 0.18, 'sawtooth', 0.2); }
  function sndGold() { beep(1000, 0.09, 'triangle', 0.2); beep(1400, 0.12, 'triangle', 0.18, 0.08); }
  function sndTowerClear(bonus) {
    beep(660, 0.1, 'sine', 0.2);
    beep(880, 0.1, 'sine', 0.2, 0.1);
    beep(1100, 0.14, 'sine', 0.22, 0.2);
    if (bonus) beep(1320, 0.18, 'sine', 0.2, 0.32);
  }
  function sndCollapse() {
    noiseBurst(0.4, 0.3);
    beep(140, 0.3, 'sawtooth', 0.18, 0.05);
  }
  function sndGameOver() {
    beep(300, 0.18, 'sawtooth', 0.2);
    beep(220, 0.18, 'sawtooth', 0.2, 0.16);
    beep(140, 0.32, 'sawtooth', 0.2, 0.32);
  }

  function blocksForRound(r) { return Math.min(10, 4 + r); }
  function periodForRound(r) { return Math.max(650, 1500 - (r - 1) * 70); }
  function perfectHalfForRound(r) { return Math.max(4, 11 - (r - 1) * 0.6); }
  function goodHalfForRound(r) { return perfectHalfForRound(r) + 9; }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(LIFE_MAX - lives);
    scoreEl.textContent = String(score);
    comboEl.textContent = String(maxCombo);
    tiltPct.textContent = Math.round(tilt) + '%';
    tiltFill.style.width = tilt + '%';
    tiltFill.classList.toggle('danger', tilt >= 65);
  }

  function clearPending() {
    if (pendingTimeoutId) { clearTimeout(pendingTimeoutId); pendingTimeoutId = null; }
  }

  function shakeStage() {
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }

  function renderTower() {
    towerEl.innerHTML = '';
    towerEl.style.transform = 'rotate(' + (tilt * 0.16).toFixed(1) + 'deg)';
    for (var i = 0; i < blocksRemaining; i++) {
      var b = document.createElement('div');
      var isTarget = (i === 0);
      b.className = 'block ' + (isTarget ? 'target' : 'plain') + (isTarget && targetGold ? ' gold' : '');
      b.textContent = isTarget ? (targetGold ? '⭐ねらえ' : 'ねらえ!') : '';
      towerEl.appendChild(b);
    }
    var face = document.createElement('div');
    face.className = 'face';
    face.textContent = '😊';
    towerEl.appendChild(face);
  }

  function setRoundBanner() {
    roundBanner.textContent = 'タワー ' + round + (isBonusRound ? ' 🌟ボーナスタワー!' : '') + '(のこり' + blocksRemaining + '個)';
    roundBanner.className = 'roundBanner' + (isBonusRound ? ' bonus' : '');
  }

  function startNewTowerAttempt() {
    blocksTotal = blocksForRound(round);
    blocksRemaining = blocksTotal;
    tilt = 0;
    targetGold = Math.random() < GOLD_CHANCE;
    setRoundBanner();
    renderTower();
    updateHud();
    startAttempt();
  }

  function startAttempt() {
    period = periodForRound(round);
    perfectHalf = perfectHalfForRound(round) + (isBonusRound ? 4 : 0);
    goodHalf = goodHalfForRound(round) + (isBonusRound ? 4 : 0);
    var margin = goodHalf + 5;
    zoneCenter = margin + Math.random() * (100 - margin * 2);

    zonePerfect.style.left = (zoneCenter - perfectHalf) + '%';
    zonePerfect.style.width = (perfectHalf * 2) + '%';
    zoneGood.style.left = (zoneCenter - goodHalf) + '%';
    zoneGood.style.width = (goodHalf * 2) + '%';

    attemptStartTime = performance.now();
    attemptState = 'moving';
    marker.style.left = '0%';
  }

  function tick() {
    if (!gameActive) return;
    if (attemptState === 'moving') {
      var elapsed = performance.now() - attemptStartTime;
      var phase = (elapsed % period) / period;
      var pos = phase < 0.5 ? phase * 200 : (1 - phase) * 200;
      marker.style.left = pos + '%';
    }
    requestAnimationFrame(tick);
  }

  function currentMarkerPos() {
    var elapsed = performance.now() - attemptStartTime;
    var phase = (elapsed % period) / period;
    return phase < 0.5 ? phase * 200 : (1 - phase) * 200;
  }

  function hit() {
    if (!gameActive || attemptState !== 'moving') return;
    var pos = currentMarkerPos();
    marker.style.left = pos + '%';
    attemptState = 'frozen';

    var diff = Math.abs(pos - zoneCenter);
    var judge;
    if (diff <= perfectHalf) judge = 'perfect';
    else if (diff <= goodHalf) judge = 'good';
    else judge = 'miss';

    resolveHit(judge);
  }

  function resolveHit(judge) {
    var bonusMult = isBonusRound ? 2 : 1;
    var gained = 0;
    var goldBonus = 0;

    if (judge === 'perfect') {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      tilt = Math.max(0, tilt - PERFECT_RELIEF);
      gained = Math.round(25 * (1 + Math.min(combo, 10) * 0.12)) * bonusMult;
      attemptMsg.textContent = '会心!';
      attemptMsg.className = 'attemptMsg perfect';
      sndPerfect();
    } else if (judge === 'good') {
      combo = 0;
      tilt = Math.min(100, tilt + GOOD_TILT);
      gained = 10 * bonusMult;
      attemptMsg.textContent = 'おしい';
      attemptMsg.className = 'attemptMsg good';
      sndGood();
      shakeStage();
    } else {
      combo = 0;
      tilt = Math.min(100, tilt + MISS_TILT);
      attemptMsg.textContent = 'ミス!ぐらっ…';
      attemptMsg.className = 'attemptMsg miss';
      sndMiss();
      shakeStage();
    }

    if (judge !== 'miss' && targetGold) {
      goldBonus = 40 * bonusMult;
      tilt = Math.max(0, tilt - GOLD_RELIEF);
      sndGold();
    }

    score += gained + goldBonus;
    updateHud();
    renderTower();

    clearPending();
    pendingTimeoutId = setTimeout(function () {
      if (!gameActive) return;
      if (tilt >= 100) {
        collapseFlow();
        return;
      }
      if (judge !== 'miss') {
        blocksRemaining--;
        if (blocksRemaining <= 0) {
          towerClearFlow();
          return;
        }
        targetGold = Math.random() < GOLD_CHANCE;
      }
      setRoundBanner();
      renderTower();
      attemptMsg.textContent = ' ';
      startAttempt();
    }, judge === 'perfect' ? 450 : 700);
  }

  function towerClearFlow() {
    var bonusMult = isBonusRound ? 2 : 1;
    var clearBonus = 40 * round * bonusMult;
    score += clearBonus;
    updateHud();
    attemptMsg.textContent = 'タワークリア! +' + clearBonus;
    attemptMsg.className = 'attemptMsg clear';
    sndTowerClear(isBonusRound);

    towersCleared++;
    round = towersCleared + 1;
    isBonusRound = towersCleared > 0 && towersCleared % 5 === 0;

    clearPending();
    pendingTimeoutId = setTimeout(function () {
      if (!gameActive) return;
      attemptMsg.textContent = ' ';
      startNewTowerAttempt();
    }, 1000);
  }

  function collapseFlow() {
    shakeStage();
    sndCollapse();
    lives--;
    combo = 0;
    tilt = 100;
    updateHud();
    renderTower();
    attemptMsg.textContent = 'タワーがくずれた…';
    attemptMsg.className = 'attemptMsg miss';

    clearPending();
    if (lives <= 0) {
      pendingTimeoutId = setTimeout(gameOver, 800);
      return;
    }
    pendingTimeoutId = setTimeout(function () {
      if (!gameActive) return;
      attemptMsg.textContent = ' ';
      startNewTowerAttempt();
    }, 900);
  }

  function gameOver() {
    gameActive = false;
    sndGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    finalTowers.textContent = String(towersCleared);
    finalCombo.textContent = String(maxCombo);
    finalScore.textContent = 'SCORE ' + score;
    resultOverlay.classList.remove('hidden');
  }

  function resetState() {
    lives = LIFE_MAX;
    score = 0;
    towersCleared = 0;
    combo = 0;
    maxCombo = 0;
    tilt = 0;
    round = 1;
    isBonusRound = false;
    attemptState = 'idle';
    clearPending();
    attemptMsg.textContent = ' ';
    updateHud();
  }

  function beginGame() {
    resetState();
    resultOverlay.classList.add('hidden');
    introOverlay.classList.add('hidden');
    gameActive = true;
    startNewTowerAttempt();
    requestAnimationFrame(tick);
  }

  startBtn.addEventListener('click', function () {
    initAudio();
    beginGame();
  });

  retryBtn.addEventListener('click', function () {
    initAudio();
    beginGame();
  });

  hitBtn.addEventListener('click', function () {
    hit();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') {
      if (gameActive) e.preventDefault();
      hit();
    }
  });

  resetState();
})();
