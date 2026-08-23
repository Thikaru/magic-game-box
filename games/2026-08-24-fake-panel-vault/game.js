(function () {
  'use strict';

  var PANEL_COUNT = 9;
  var CODE_LEN = 3;
  var LIVES_START = 3;

  var panelsEl = document.getElementById('panels');
  var codeSlotsEl = document.getElementById('codeSlots');
  var timerBarEl = document.getElementById('timerBar');
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
  var lastTs = 0;
  var audioCtx = null;
  var toastTimer = null;

  // ---- audio ----
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function tone(freq, dur, type, vol, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.2 : vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sndCorrect(slotIndex) {
    tone(440 + slotIndex * 110, 0.14, 'triangle', 0.22);
  }
  function sndWrong() {
    tone(260, 0.1, 'sine', 0.14);
  }
  function sndFake() {
    tone(140, 0.22, 'sawtooth', 0.22);
    tone(95, 0.28, 'sawtooth', 0.18, 0.05);
  }
  function sndGold() {
    tone(660, 0.1, 'triangle', 0.2);
    tone(880, 0.14, 'triangle', 0.2, 0.08);
  }
  function sndClear() {
    tone(523, 0.1, 'square', 0.18);
    tone(659, 0.1, 'square', 0.18, 0.09);
    tone(784, 0.16, 'square', 0.2, 0.18);
  }
  function sndLifeLost() {
    tone(300, 0.18, 'sawtooth', 0.2);
    tone(200, 0.22, 'sawtooth', 0.18, 0.1);
  }
  function sndGameOver() {
    tone(220, 0.3, 'sawtooth', 0.2);
    tone(160, 0.35, 'sawtooth', 0.18, 0.16);
    tone(110, 0.5, 'sawtooth', 0.18, 0.34);
  }

  // ---- toast ----
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  // ---- dom build ----
  var panelEls = [];
  function buildPanelsDom() {
    panelsEl.innerHTML = '';
    panelEls = [];
    for (var i = 0; i < PANEL_COUNT; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = String(i);
      cell.innerHTML = '<span class="idx">' + (i + 1) + '</span><span class="digit">0</span>';
      panelsEl.appendChild(cell);
      panelEls.push({ root: cell, digitEl: cell.querySelector('.digit') });
    }
  }
  buildPanelsDom();

  var slotEls = [];
  function buildSlotsDom() {
    codeSlotsEl.innerHTML = '';
    slotEls = [];
    for (var i = 0; i < CODE_LEN; i++) {
      var s = document.createElement('div');
      s.className = 'slot';
      codeSlotsEl.appendChild(s);
      slotEls.push(s);
    }
  }
  buildSlotsDom();

  // ---- helpers ----
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function randDigit() { return Math.floor(Math.random() * 10); }

  function timeLimitFor(round) {
    return Math.max(11 - (round - 1) * 0.5, 5.5);
  }
  function fakeCountFor(round) {
    return Math.min(2 + Math.floor((round - 1) / 2), 5);
  }

  function updateHud() {
    roundLabel.textContent = 'ROOM ' + state.round;
    scoreLabel.textContent = 'SCORE ' + state.score;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += i < state.lives ? '♥' : '♡';
    livesLabel.textContent = hearts;
  }

  function updateSlots() {
    for (var i = 0; i < CODE_LEN; i++) {
      var s = slotEls[i];
      s.classList.remove('filled', 'active');
      if (i < state.filled) {
        s.textContent = state.code[i];
        s.classList.add('filled');
      } else if (i === state.filled) {
        s.textContent = state.code[i];
        s.classList.add('active');
      } else {
        s.textContent = state.code[i];
      }
    }
  }

  function renderPanel(i) {
    var p = state.panels[i];
    var el = panelEls[i];
    el.digitEl.textContent = String(p.digit);
    var cls = 'cell';
    if (p.gold) cls += ' gold';
    else if (p.fake) cls += ' fake';
    if (p.status === 'correct') cls += ' correct disabled';
    else if (p.status === 'spent') cls += ' spent disabled';
    else if (p.status === 'busted') cls += ' busted disabled';
    el.root.className = cls;
  }

  function newRoom() {
    var round = state.round;
    var digits = shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0, CODE_LEN);
    state.code = digits;
    state.filled = 0;

    var fakeCount = fakeCountFor(round);
    var slots = [];
    for (var i = 0; i < PANEL_COUNT; i++) slots.push(i);
    shuffle(slots);

    var panels = new Array(PANEL_COUNT);
    // correct steady panels, one per target digit
    for (var c = 0; c < CODE_LEN; c++) {
      var idx = slots[c];
      panels[idx] = { digit: digits[c], fake: false, gold: false, status: 'idle' };
    }
    var rest = slots.slice(CODE_LEN);
    var goldChance = Math.random() < 0.12;
    for (var r = 0; r < rest.length; r++) {
      var idx2 = rest[r];
      var isFake = r < fakeCount;
      panels[idx2] = { digit: randDigit(), fake: isFake, gold: false, status: 'idle' };
    }
    if (goldChance && rest.length > 0) {
      var goldIdx = rest[Math.floor(Math.random() * rest.length)];
      panels[goldIdx].gold = true;
      panels[goldIdx].fake = false;
    }
    state.panels = panels;

    for (var k = 0; k < PANEL_COUNT; k++) renderPanel(k);
    updateSlots();
    updateHud();

    state.timeLimit = timeLimitFor(round);
    state.timeLeft = state.timeLimit;
    timerBarEl.style.width = '100%';
    timerBarEl.classList.remove('warn');
  }

  function loseLife(reasonMsg) {
    state.lives--;
    state.combo = 0;
    updateHud();
    if (reasonMsg) showToast(reasonMsg);
    sndLifeLost();
    if (state.lives <= 0) {
      gameOver();
      return true;
    }
    return false;
  }

  function roomClear() {
    sndClear();
    state.score += 100 * state.round;
    showToast('ROOM CLEAR!');
    state.round++;
    updateHud();
    state.paused = true;
    setTimeout(function () {
      if (!state || state.over) return;
      state.paused = false;
      newRoom();
    }, 700);
  }

  function tapPanel(i) {
    if (!state || state.over || state.paused || !state.running) return;
    var p = state.panels[i];
    if (!p || p.status !== 'idle') return;

    if (p.gold) {
      p.status = 'correct';
      renderPanel(i);
      state.combo++;
      state.score += 50 + state.combo * 5;
      state.filled++;
      sndGold();
      updateSlots();
      updateHud();
      if (state.filled >= CODE_LEN) roomClear();
      return;
    }

    if (p.fake) {
      p.status = 'busted';
      renderPanel(i);
      sndFake();
      loseLife('ニセモノだった!');
      return;
    }

    var needed = state.code[state.filled];
    if (p.digit === needed) {
      p.status = 'correct';
      renderPanel(i);
      state.combo++;
      state.score += 20 + state.combo * 5;
      state.filled++;
      sndCorrect(state.filled);
      updateSlots();
      updateHud();
      if (state.filled >= CODE_LEN) roomClear();
    } else {
      p.status = 'spent';
      renderPanel(i);
      sndWrong();
    }
  }

  function loop(ts) {
    if (!state || state.over) return;
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (state.running && !state.paused) {
      state.timeLeft -= dt;
      var pct = Math.max(state.timeLeft / state.timeLimit, 0) * 100;
      timerBarEl.style.width = pct + '%';
      timerBarEl.classList.toggle('warn', pct < 30);
      if (state.timeLeft <= 0) {
        state.running = false;
        var died = loseLife('タイムアップ!');
        if (!died) {
          state.paused = true;
          setTimeout(function () {
            if (!state || state.over) return;
            state.paused = false;
            state.running = true;
            newRoom();
          }, 600);
        }
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    state.over = true;
    state.running = false;
    sndGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = 'スコア ' + state.score + ' / 到達ルーム ' + state.round;
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    state = {
      round: 1, score: 0, lives: LIVES_START, combo: 0,
      code: [], filled: 0, panels: [],
      timeLimit: 10, timeLeft: 10,
      running: true, paused: false, over: false
    };
    lastTs = 0;
    newRoom();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  panelsEl.addEventListener('click', function (e) {
    var cell = e.target.closest ? e.target.closest('.cell') : null;
    if (!cell) return;
    var idx = Number(cell.dataset.index);
    if (!isNaN(idx)) tapPanel(idx);
  });

  document.addEventListener('keydown', function (e) {
    if (!introEl.classList.contains('hidden')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
      return;
    }
    if (!resultEl.classList.contains('hidden')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
      return;
    }
    var n = Number(e.key);
    if (!isNaN(n) && n >= 1 && n <= 9) {
      tapPanel(n - 1);
    }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
})();
