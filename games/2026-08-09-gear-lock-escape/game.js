(function () {
  'use strict';

  var GEAR_COUNT = 4;
  var LIVES_START = 3;
  var BASE_SPEED = 1.4;       // digits per second at round 1
  var SPEED_STEP = 0.5;       // added per round
  var SPEED_VARIANCE = [0, 0.35, 0.7, 1.05]; // per-gear offset so gears feel distinct
  var TAP_COOLDOWN_MS = 120;

  var gearsEl = document.getElementById('gears');
  var roundLabel = document.getElementById('roundLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var livesLabel = document.getElementById('livesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
  var rafId = null;
  var lastTime = 0;
  var audioCtx = null;

  function buildGearDom() {
    gearsEl.innerHTML = '';
    var els = [];
    for (var i = 0; i < GEAR_COUNT; i++) {
      var gear = document.createElement('div');
      gear.className = 'gear';
      gear.dataset.index = String(i);
      gear.innerHTML =
        '<div class="target">めざす数字 <b class="targetDigit"></b></div>' +
        '<div class="reel">0</div>' +
        '<div class="status"></div>';
      gearsEl.appendChild(gear);
      els.push({
        root: gear,
        targetDigit: gear.querySelector('.targetDigit'),
        reel: gear.querySelector('.reel'),
        status: gear.querySelector('.status')
      });
    }
    return els;
  }

  var gearEls = buildGearDom();

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

  function sfxLock() { beep(880, 0.18, 'square', 0.16); beep(1320, 0.16, 'square', 0.12); }
  function sfxWrong() { beep(160, 0.22, 'sawtooth', 0.16); }
  function sfxRound() { beep(660, 0.12, 'square', 0.14); setTimeout(function () { beep(990, 0.18, 'square', 0.14); }, 100); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  function randDigit() { return Math.floor(Math.random() * 10); }

  function makeGear(index) {
    var speed = BASE_SPEED + state.round * SPEED_STEP + SPEED_VARIANCE[index];
    return {
      pos: Math.random() * 10,
      speed: speed,
      target: randDigit(),
      locked: false,
      lastTap: 0
    };
  }

  function currentDigit(g) {
    return Math.floor(g.pos) % 10;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  function newRound() {
    state.gears = [];
    for (var i = 0; i < GEAR_COUNT; i++) state.gears.push(makeGear(i));
    for (var j = 0; j < GEAR_COUNT; j++) {
      var el = gearEls[j];
      el.root.classList.remove('locked', 'wrong');
      el.targetDigit.textContent = String(state.gears[j].target);
      el.status.textContent = '';
    }
    showToast('ROUND ' + state.round);
    updateHud();
  }

  function updateHud() {
    roundLabel.textContent = 'ROUND ' + state.round;
    scoreLabel.textContent = 'SCORE ' + state.score;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
  }

  function handleTap(index) {
    if (!state || !state.playing) return;
    var g = state.gears[index];
    if (!g || g.locked) return;
    var now = performance.now();
    if (now - g.lastTap < TAP_COOLDOWN_MS) return;
    g.lastTap = now;

    var digit = currentDigit(g);
    var el = gearEls[index];
    if (digit === g.target) {
      g.locked = true;
      el.root.classList.add('locked');
      el.root.classList.remove('wrong');
      el.status.textContent = 'ロック解除!';
      state.score += 10 + state.round * 2;
      sfxLock();
      updateHud();
      checkRoundComplete();
    } else {
      state.lives--;
      el.root.classList.add('wrong');
      el.status.textContent = 'ズレ! (' + digit + ')';
      sfxWrong();
      updateHud();
      setTimeout(function () { el.root.classList.remove('wrong'); }, 260);
      if (state.lives <= 0) {
        gameOver();
      }
    }
  }

  function checkRoundComplete() {
    var allLocked = state.gears.every(function (g) { return g.locked; });
    if (!allLocked) return;
    state.score += 50 + state.round * 5;
    state.playing = false;
    sfxRound();
    updateHud();
    showToast('クリア!');
    setTimeout(function () {
      state.round++;
      state.playing = true;
      newRound();
      lastTime = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }, 900);
  }

  function gameOver() {
    state.playing = false;
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '到達ラウンド: ' + state.round + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function loop(ts) {
    if (!state || !state.playing) { rafId = null; return; }
    var dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    dt = Math.min(dt, 0.1);

    for (var i = 0; i < state.gears.length; i++) {
      var g = state.gears[i];
      if (g.locked) continue;
      g.pos += g.speed * dt;
      if (g.pos > 10000) g.pos = g.pos % 10;
      gearEls[i].reel.textContent = String(currentDigit(g));
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = { round: 1, score: 0, lives: LIVES_START, playing: true, gears: [] };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    newRound();
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  gearEls.forEach(function (el, index) {
    el.root.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      handleTap(index);
    });
  });

  document.addEventListener('keydown', function (e) {
    var map = { '1': 0, '2': 1, '3': 2, '4': 3 };
    if (map.hasOwnProperty(e.key)) {
      handleTap(map[e.key]);
    }
  });
})();
