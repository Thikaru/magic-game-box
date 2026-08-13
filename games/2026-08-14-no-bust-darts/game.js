(function () {
  'use strict';

  var SECTORS = 20;               // values 1..20 around the dial
  var SECTOR_DEG = 360 / SECTORS; // 18deg per sector
  var LIVES_START = 3;
  var BASE_TARGET = 40;
  var TARGET_STEP = 14;
  var BONUS_EVERY = 4;
  var BASE_SPEED = 70;            // deg/sec
  var SPEED_STEP = 14;
  var MAX_SPEED = 420;
  var DOUBLE_INTERVAL = 4.0;      // seconds between double-zone relocations
  var THROW_COOLDOWN_MS = 140;

  var dialEl = document.getElementById('dial');
  var numLayerEl = document.getElementById('numLayer');
  var doubleZoneEl = document.getElementById('doubleZone');
  var needleEl = document.getElementById('needle');
  var remainBoxEl = document.getElementById('remainBox');
  var remainNumEl = document.getElementById('remainNum');
  var roundLabel = document.getElementById('roundLabel');
  var comboLabel = document.getElementById('comboLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var livesLabel = document.getElementById('livesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var throwBtn = document.getElementById('throwBtn');

  var state = null;
  var rafId = null;
  var lastTime = 0;
  var lastThrow = 0;
  var audioCtx = null;

  // ---- build static dial background (alternating sectors) + number labels ----
  (function buildDial() {
    var stops = [];
    for (var i = 0; i < SECTORS; i++) {
      var color = (i % 2 === 0) ? '#33255c' : '#2a1f4d';
      stops.push(color + ' ' + (i * SECTOR_DEG) + 'deg ' + ((i + 1) * SECTOR_DEG) + 'deg');
    }
    dialEl.style.background = 'conic-gradient(from -90deg, ' + stops.join(', ') + ')';

    var cx = 130, cy = 130, r = 108;
    for (var v = 1; v <= SECTORS; v++) {
      var mid = (v - 1) * SECTOR_DEG + SECTOR_DEG / 2;
      var rad = (mid - 90) * Math.PI / 180;
      var x = cx + r * Math.cos(rad);
      var y = cy + r * Math.sin(rad);
      var lbl = document.createElement('div');
      lbl.className = 'dialNum';
      lbl.style.left = x + 'px';
      lbl.style.top = y + 'px';
      lbl.style.transform = 'translate(-50%,-50%)';
      lbl.textContent = String(v);
      numLayerEl.appendChild(lbl);
    }
  })();

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, dur, type, gainPeak) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.18, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxHit() { beep(760, 0.14, 'square', 0.15); }
  function sfxDouble() { beep(920, 0.12, 'square', 0.15); setTimeout(function () { beep(1240, 0.14, 'square', 0.13); }, 70); }
  function sfxBust() { beep(150, 0.26, 'sawtooth', 0.17); }
  function sfxRoundClear() { beep(660, 0.12, 'square', 0.14); setTimeout(function () { beep(990, 0.2, 'square', 0.14); }, 100); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  function roundTarget(round) {
    var t = BASE_TARGET + (round - 1) * TARGET_STEP;
    if (round % BONUS_EVERY === 0) t = Math.max(20, Math.round(t * 0.55));
    return t;
  }
  function roundSpeed(round) {
    return Math.min(MAX_SPEED, BASE_SPEED + (round - 1) * SPEED_STEP);
  }
  function isBonusRound(round) { return round % BONUS_EVERY === 0; }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  function relocateDoubleZone() {
    var sector = Math.floor(Math.random() * SECTORS);
    if (state) {
      var prev = state.doubleSector;
      var tries = 0;
      while (sector === prev && tries < 5) { sector = Math.floor(Math.random() * SECTORS); tries++; }
      state.doubleSector = sector;
      state.doubleTimer = 0;
    }
    var start = sector * SECTOR_DEG;
    var end = start + SECTOR_DEG;
    doubleZoneEl.style.background =
      'conic-gradient(from -90deg, transparent 0deg ' + start + 'deg, ' +
      'rgba(255,210,63,.55) ' + start + 'deg ' + end + 'deg, ' +
      'transparent ' + end + 'deg 360deg)';
  }

  function updateHud() {
    roundLabel.textContent = 'ROUND ' + state.round;
    comboLabel.textContent = 'COMBO ' + state.combo;
    scoreLabel.textContent = 'SCORE ' + state.score;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
    remainNumEl.textContent = String(state.remaining);
    remainBoxEl.classList.toggle('bonus', isBonusRound(state.round));
  }

  function pulseRemain() {
    remainNumEl.classList.add('pulse');
    setTimeout(function () { remainNumEl.classList.remove('pulse'); }, 130);
  }

  function newRound() {
    state.target = roundTarget(state.round);
    state.remaining = state.target;
    state.speed = roundSpeed(state.round);
    relocateDoubleZone();
    showToast((isBonusRound(state.round) ? '✨ボーナス ' : '') + 'ROUND ' + state.round);
    updateHud();
  }

  function currentValue() {
    var a = ((state.angle % 360) + 360) % 360;
    var sector = Math.floor(a / SECTOR_DEG);
    var value = sector + 1;
    var isDouble = (sector === state.doubleSector);
    return { value: value, isDouble: isDouble };
  }

  function doThrow() {
    if (!state || !state.playing) return;
    var now = performance.now();
    if (now - lastThrow < THROW_COOLDOWN_MS) return;
    lastThrow = now;

    var hit = currentValue();
    var value = hit.isDouble ? hit.value * 2 : hit.value;

    if (value <= state.remaining) {
      state.remaining -= value;
      var mult = isBonusRound(state.round) ? 2 : 1;
      state.score += value * 10 * mult + state.combo * 2;
      state.combo++;
      pulseRemain();
      if (hit.isDouble) { sfxDouble(); showToast('ダブル命中! ×2'); }
      else { sfxHit(); }
      updateHud();
      if (state.remaining === 0) {
        clearRound();
        return;
      }
    } else {
      state.lives--;
      state.combo = 0;
      sfxBust();
      dialEl.classList.remove('flash');
      void dialEl.offsetWidth;
      dialEl.classList.add('flash');
      showToast('バースト!(' + value + ')');
      updateHud();
      if (state.lives <= 0) {
        gameOver();
        return;
      }
    }
    relocateDoubleZone();
  }

  function clearRound() {
    state.playing = false;
    var bonus = 60 + state.round * 8;
    if (isBonusRound(state.round)) bonus *= 2;
    state.score += bonus;
    sfxRoundClear();
    updateHud();
    showToast('クリア! +' + bonus);
    setTimeout(function () {
      state.round++;
      state.playing = true;
      newRound();
    }, 900);
  }

  function gameOver() {
    state.playing = false;
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '到達ラウンド: ' + state.round + '\n最大コンボ: ' + state.maxCombo + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function loop(ts) {
    if (!state) { rafId = null; return; }
    var dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    dt = Math.min(dt, 0.1);

    if (state.playing) {
      state.angle = (state.angle + state.speed * dt) % 360;
      needleEl.style.transform = 'rotate(' + state.angle + 'deg)';
      state.doubleTimer += dt;
      if (state.doubleTimer >= DOUBLE_INTERVAL) relocateDoubleZone();
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = {
      round: 1, score: 0, lives: LIVES_START, combo: 0, maxCombo: 0,
      playing: true, angle: 0, speed: BASE_SPEED, doubleSector: -1, doubleTimer: 0,
      target: 0, remaining: 0
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    newRound();
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  throwBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    doThrow();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      doThrow();
    }
  });
})();
