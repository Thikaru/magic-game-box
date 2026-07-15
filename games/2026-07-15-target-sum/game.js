(function () {
  'use strict';

  var GRID_SIZE = 16;
  var GAME_TIME = 60;
  var MAX_LIVES = 3;
  var NEG_CHANCE = 0.15;

  var gridEl = document.getElementById('grid');
  var targetEl = document.getElementById('targetNum');
  var totalEl = document.getElementById('totalNum');
  var totalBadge = document.querySelector('.totalBadge span');
  var livesEl = document.getElementById('lives');
  var scoreEl = document.getElementById('scoreLabel');
  var timeEl = document.getElementById('timeLabel');
  var flashEl = document.getElementById('flashMsg');
  var comboEl = document.getElementById('comboLabel');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
  var timerId = null;
  var audioCtx = null;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function beep(freq, dur, type) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  function makeTile() {
    if (Math.random() < NEG_CHANCE) {
      return { value: -randInt(1, 3), used: false };
    }
    return { value: randInt(1, 9), used: false };
  }

  function generateGrid() {
    var tiles = [];
    for (var i = 0; i < GRID_SIZE; i++) tiles.push(makeTile());
    return tiles;
  }

  function pickTarget(tiles) {
    var positives = [];
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].value > 0) positives.push(i);
    }
    if (positives.length < 2) return null;
    // shuffle a copy
    var pool = positives.slice();
    for (var j = pool.length - 1; j > 0; j--) {
      var k = randInt(0, j);
      var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
    }
    var count = randInt(2, Math.min(4, pool.length));
    var sum = 0;
    for (var c = 0; c < count; c++) sum += tiles[pool[c]].value;
    return sum;
  }

  function newRound() {
    var tiles = null, target = null, tries = 0;
    do {
      tiles = generateGrid();
      target = pickTarget(tiles);
      tries++;
    } while (target === null && tries < 10);
    if (target === null) target = randInt(4, 12);
    state.tiles = tiles;
    state.target = target;
    state.total = 0;
    renderGrid();
    targetEl.textContent = target;
    totalEl.textContent = '0';
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    state.tiles.forEach(function (tile, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile' + (tile.value < 0 ? ' neg' : '');
      btn.textContent = String(tile.value);
      if (tile.used) btn.classList.add('used');
      btn.disabled = tile.used;
      btn.addEventListener('click', function () { tapTile(idx); });
      gridEl.appendChild(btn);
    });
  }

  function flash(msg, cls) {
    flashEl.textContent = msg;
    flashEl.className = 'flashMsg' + (cls ? ' ' + cls : '');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { flashEl.textContent = ''; flashEl.className = 'flashMsg'; }, 700);
  }

  function updateHud() {
    livesEl.textContent = '♥'.repeat(state.lives) + '♡'.repeat(MAX_LIVES - state.lives);
    scoreEl.textContent = 'SCORE ' + state.score;
    timeEl.textContent = state.timeLeft + '秒';
    comboEl.textContent = state.combo > 0 ? ('コンボ x' + state.combo + '  倍率 ' + state.multiplier.toFixed(1)) : '';
  }

  function tapTile(idx) {
    if (!state.running) return;
    var tile = state.tiles[idx];
    if (!tile || tile.used) return;

    tile.used = true;
    state.total += tile.value;
    renderGrid();
    totalEl.textContent = state.total;
    totalBadge.style.transform = 'scale(1.15)';
    setTimeout(function () { totalBadge.style.transform = 'scale(1)'; }, 120);
    beep(tile.value < 0 ? 320 : 520, 0.08, 'square');

    if (state.total === state.target) {
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.multiplier = 1 + Math.min(state.combo, 5) * 0.2;
      var gained = Math.round(100 * state.multiplier);
      state.score += gained;
      flash('ぴったり! +' + gained, 'ok');
      beep(880, 0.18, 'triangle');
      updateHud();
      setTimeout(newRound, 350);
    } else if (state.total > state.target) {
      state.lives--;
      state.combo = 0;
      state.multiplier = 1;
      flash('オーバー!', 'bad');
      beep(160, 0.3, 'sawtooth');
      updateHud();
      if (state.lives <= 0) {
        setTimeout(function () { endGame('gameover'); }, 400);
      } else {
        setTimeout(newRound, 500);
      }
    }
  }

  function tick() {
    state.timeLeft--;
    updateHud();
    if (state.timeLeft <= 0) {
      endGame('timeup');
    }
  }

  function endGame(reason) {
    state.running = false;
    clearInterval(timerId);
    timerId = null;
    resultTitleEl.textContent = reason === 'gameover' ? 'ライフがなくなった!' : 'タイムアップ!';
    resultTextEl.textContent = 'スコア: ' + state.score + '点 / 最高コンボ x' + state.bestCombo;
    resultEl.classList.remove('hidden');
  }

  function start() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    state = {
      running: true,
      score: 0,
      lives: MAX_LIVES,
      timeLeft: GAME_TIME,
      combo: 0,
      multiplier: 1,
      bestCombo: 0,
      tiles: [],
      target: 0,
      total: 0
    };

    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    updateHud();
    newRound();

    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);
})();
