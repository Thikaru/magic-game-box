(function () {
  'use strict';

  var LIVES_START = 3;
  var MAX_VALUE = 9;
  var WILD_CHANCE = 0.13;
  var TOWER_COUNT = 3;
  var TIME_START = 3.4;
  var TIME_FLOOR = 1.4;
  var TIME_STEP = 0.05;
  var SUITS = [
    { sym: '♠', color: 'black' },
    { sym: '♥', color: 'red' },
    { sym: '♦', color: 'red' },
    { sym: '♣', color: 'black' }
  ];

  var towersEl = document.getElementById('towers');
  var drawCardEl = document.getElementById('drawCard');
  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');
  var timebarEl = document.getElementById('timebar');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var skipBtn = document.getElementById('skipBtn');

  var state = null;
  var rafId = null;
  var lastTime = 0;
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, dur, type, gainPeak, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.16, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxPlace() { beep(480, 0.09, 'sine', 0.14); }
  function sfxWild() { beep(660, 0.08, 'triangle', 0.14); beep(880, 0.1, 'triangle', 0.13, 0.07); }
  function sfxComplete() {
    beep(523, 0.12, 'square', 0.14);
    beep(659, 0.12, 'square', 0.14, 0.09);
    beep(880, 0.16, 'square', 0.14, 0.18);
  }
  function sfxSkip() { beep(300, 0.08, 'triangle', 0.08); }
  function sfxWrong() { beep(160, 0.16, 'sawtooth', 0.14); }
  function sfxLifeLost() { beep(220, 0.3, 'sawtooth', 0.15); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  function randSuit() { return SUITS[Math.floor(Math.random() * SUITS.length)]; }

  function drawCard() {
    if (Math.random() < WILD_CHANCE) return { wild: true };
    var value = 1 + Math.floor(Math.random() * MAX_VALUE);
    return { wild: false, value: value, suit: randSuit() };
  }

  function topValue(tower) { return tower.length ? tower[tower.length - 1].value : 0; }

  function canPlace(tower, card) {
    if (card.wild) return true;
    if (!tower.length) return true;
    return card.value > topValue(tower);
  }

  function timeLimitFor(placedCount) {
    return Math.max(TIME_FLOOR, TIME_START - placedCount * TIME_STEP);
  }

  function cardDom(card, extraClass) {
    var el = document.createElement('div');
    el.className = 'card ' + (extraClass || '') + (card.wild ? ' wild' : '');
    if (card.wild) {
      el.innerHTML = '<div class="val">★</div>';
    } else {
      el.innerHTML = '<div class="val">' + card.value + '</div>' +
        '<div class="suit ' + card.suit.color + '">' + card.suit.sym + '</div>';
    }
    return el;
  }

  function miniDom(entry) {
    var el = document.createElement('div');
    el.className = 'mini' + (entry.wild ? ' wild' : '');
    el.textContent = entry.wild ? '★' : entry.value;
    return el;
  }

  function buildTowerDom() {
    towersEl.innerHTML = '';
    var els = [];
    for (var i = 0; i < TOWER_COUNT; i++) {
      var t = document.createElement('div');
      t.className = 'tower';
      t.dataset.index = String(i);
      towersEl.appendChild(t);
      els.push(t);
    }
    return els;
  }

  function renderTowers() {
    for (var i = 0; i < state.towers.length; i++) {
      var el = state.towerEls[i];
      el.innerHTML = '';
      var tower = state.towers[i];
      for (var b = 0; b < tower.length; b++) {
        el.appendChild(miniDom(tower[b]));
      }
    }
  }

  function renderDrawCard() {
    drawCardEl.innerHTML = '';
    var inner = cardDom(state.current, 'drawcard pop');
    drawCardEl.className = 'card drawcard pop' + (state.current.wild ? ' wild' : '');
    drawCardEl.innerHTML = inner.innerHTML;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1000);
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    comboLabel.textContent = 'COMBO ' + state.combo;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
  }

  function updateTimebar() {
    var ratio = Math.max(0, state.remaining / state.timeLimit);
    timebarEl.style.width = (ratio * 100) + '%';
    timebarEl.classList.toggle('low', ratio < 0.25);
  }

  function flashWrong(index) {
    var el = state.towerEls[index];
    el.classList.add('wrong');
    setTimeout(function () { el.classList.remove('wrong'); }, 260);
  }

  function flashComplete(index) {
    var el = state.towerEls[index];
    el.classList.add('complete');
    setTimeout(function () { el.classList.remove('complete'); }, 500);
  }

  function nextCard() {
    state.current = drawCard();
    state.timeLimit = timeLimitFor(state.placedCount);
    state.remaining = state.timeLimit;
    renderDrawCard();
    updateHud();
    updateTimebar();
  }

  function loseLife() {
    state.lives--;
    updateHud();
    if (state.lives <= 0) {
      gameOver();
      return true;
    }
    return false;
  }

  function placeCard(index) {
    if (!state || !state.playing) return;
    var card = state.current;
    var tower = state.towers[index];
    if (!canPlace(tower, card)) {
      state.combo = 0;
      sfxWrong();
      flashWrong(index);
      updateHud();
      if (loseLife()) return;
      nextCard();
      return;
    }
    var newVal = card.wild ? (tower.length ? topValue(tower) + 1 : 1) : card.value;
    tower.push({ value: newVal, wild: card.wild });
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.placedCount++;
    var gained = 8 + newVal + state.combo * 2 + (card.wild ? 6 : 0);
    state.score += gained;

    if (card.wild) { sfxWild(); } else { sfxPlace(); }

    if (newVal >= MAX_VALUE) {
      var bonus = 40 + state.combo * 3;
      state.score += bonus;
      state.towers[index] = [];
      sfxComplete();
      flashComplete(index);
      showToast('タワー完成! +' + (gained + bonus));
    } else {
      showToast('+' + gained);
    }
    renderTowers();
    updateHud();
    nextCard();
  }

  function skipCard() {
    if (!state || !state.playing) return;
    state.combo = 0;
    sfxSkip();
    updateHud();
    nextCard();
  }

  function handleTimeUp() {
    state.combo = 0;
    sfxLifeLost();
    updateHud();
    if (loseLife()) return;
    showToast('タイムアップ!');
    nextCard();
  }

  function gameOver() {
    state.playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      'スコア: ' + state.score + '\n最大コンボ: ' + state.maxCombo + '\n積んだ枚数: ' + state.placedCount;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function loop(ts) {
    if (!state || !state.playing) { rafId = null; return; }
    var dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    dt = Math.min(dt, 0.1);

    state.remaining -= dt;
    updateTimebar();
    if (state.remaining <= 0) {
      state.remaining = 0;
      updateTimebar();
      handleTimeUp();
      if (!state.playing) return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = {
      playing: true, score: 0, combo: 0, maxCombo: 0, lives: LIVES_START,
      placedCount: 0, towers: [[], [], []], towerEls: [], current: null,
      timeLimit: TIME_START, remaining: TIME_START
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    state.towerEls = buildTowerDom();
    renderTowers();
    nextCard();
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  skipBtn.addEventListener('click', skipCard);

  towersEl.addEventListener('click', function (e) {
    var target = e.target.closest('.tower');
    if (!target) return;
    placeCard(parseInt(target.dataset.index, 10));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 's' || e.key === 'S') { skipCard(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= TOWER_COUNT) placeCard(n - 1);
  });
})();
