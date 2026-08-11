(function () {
  'use strict';

  var CAPACITY = 4;
  var LIVES_START = 3;
  var MAX_COLORS = 6;
  var COLORS = ['#ff5d7a', '#4dd8e6', '#ffd23f', '#6be08a', '#b98cff', '#ff9f43'];

  var tubesEl = document.getElementById('tubes');
  var levelLabel = document.getElementById('levelLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var movesLabel = document.getElementById('movesLabel');
  var livesLabel = document.getElementById('livesLabel');
  var timebarEl = document.getElementById('timebar');
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
    gain.gain.linearRampToValueAtTime(gainPeak || 0.16, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxPour() { beep(520, 0.09, 'sine', 0.13); }
  function sfxWrong() { beep(160, 0.16, 'sawtooth', 0.14); }
  function sfxClear() { beep(660, 0.12, 'square', 0.14); setTimeout(function () { beep(990, 0.18, 'square', 0.14); }, 100); }
  function sfxLifeLost() { beep(220, 0.3, 'sawtooth', 0.15); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  function numColorsFor(level) { return Math.min(3 + Math.floor((level - 1) / 2), MAX_COLORS); }
  function numTubesFor(level) { return numColorsFor(level) + 2; }
  function parMovesFor(level) { return Math.min(10 + level * 3, 45); }
  function timeLimitFor(level) { return Math.max(22, 55 - (level - 1) * 2); }

  function buildSolvedTubes(numColors, numTubes) {
    var tubes = [];
    for (var c = 0; c < numColors; c++) {
      var t = [];
      for (var i = 0; i < CAPACITY; i++) t.push(c);
      tubes.push(t);
    }
    for (var e = numColors; e < numTubes; e++) tubes.push([]);
    return tubes;
  }

  function topColor(tube) { return tube.length ? tube[tube.length - 1] : null; }

  function canPour(tubes, from, to) {
    if (from === to) return false;
    var src = tubes[from], dst = tubes[to];
    if (!src.length) return false;
    if (dst.length >= CAPACITY) return false;
    if (dst.length === 0) return true;
    return topColor(dst) === topColor(src);
  }

  function pourAmount(tubes, from, to) {
    var src = tubes[from], dst = tubes[to];
    var color = topColor(src);
    var n = 0;
    for (var i = src.length - 1; i >= 0; i--) {
      if (src[i] === color) n++; else break;
    }
    return Math.min(n, CAPACITY - dst.length);
  }

  function doPour(tubes, from, to) {
    var n = pourAmount(tubes, from, to);
    var moved = [];
    for (var i = 0; i < n; i++) moved.push(tubes[from].pop());
    for (var j = moved.length - 1; j >= 0; j--) tubes[to].push(moved[j]);
    return n;
  }

  function isSolved(tubes) {
    return tubes.every(function (t) { return t.length === 0 || t.length === CAPACITY; });
  }

  function shuffleTubes(tubes, moves) {
    var lastMove = null;
    var count = 0, guard = 0;
    while (count < moves && guard < moves * 25) {
      guard++;
      var candidates = [];
      for (var f = 0; f < tubes.length; f++) {
        for (var t = 0; t < tubes.length; t++) {
          if (f === t) continue;
          if (!canPour(tubes, f, t)) continue;
          if (lastMove && lastMove[0] === t && lastMove[1] === f) continue;
          candidates.push([f, t]);
        }
      }
      if (!candidates.length) break;
      var pick = candidates[Math.floor(Math.random() * candidates.length)];
      doPour(tubes, pick[0], pick[1]);
      lastMove = pick;
      count++;
    }
    return count;
  }

  function generateTubes(level) {
    var nc = numColorsFor(level), nt = numTubesFor(level);
    var tubes, attempts = 0;
    do {
      tubes = buildSolvedTubes(nc, nt);
      shuffleTubes(tubes, parMovesFor(level));
      attempts++;
    } while (isSolved(tubes) && attempts < 8);
    return tubes;
  }

  function buildTubeDom(count) {
    tubesEl.innerHTML = '';
    var els = [];
    for (var i = 0; i < count; i++) {
      var tube = document.createElement('div');
      tube.className = 'tube';
      tube.dataset.index = String(i);
      tubesEl.appendChild(tube);
      els.push(tube);
    }
    return els;
  }

  function renderTubes() {
    for (var i = 0; i < state.tubes.length; i++) {
      var el = state.tubeEls[i];
      el.innerHTML = '';
      var tube = state.tubes[i];
      for (var b = 0; b < tube.length; b++) {
        var ball = document.createElement('div');
        ball.className = 'ball';
        ball.style.background = COLORS[tube[b]];
        el.appendChild(ball);
      }
      el.classList.toggle('done', tube.length === CAPACITY);
      el.classList.toggle('selected', state.selected === i);
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  function updateHud() {
    levelLabel.textContent = 'LEVEL ' + state.level;
    scoreLabel.textContent = 'SCORE ' + state.score;
    movesLabel.textContent = '手数 ' + state.movesUsed;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
  }

  function updateTimebar() {
    var ratio = Math.max(0, state.remaining / state.timeLimit);
    timebarEl.style.width = (ratio * 100) + '%';
    timebarEl.classList.toggle('low', ratio < 0.25);
  }

  function newLevel() {
    var nt = numTubesFor(state.level);
    state.tubes = generateTubes(state.level);
    state.tubeEls = buildTubeDom(nt);
    state.selected = null;
    state.movesUsed = 0;
    state.timeLimit = timeLimitFor(state.level);
    state.remaining = state.timeLimit;
    state.parMoves = parMovesFor(state.level);
    renderTubes();
    updateHud();
    updateTimebar();
  }

  function clearSelection() {
    state.selected = null;
    renderTubes();
  }

  function flashWrong(index) {
    var el = state.tubeEls[index];
    el.classList.add('wrong');
    setTimeout(function () { el.classList.remove('wrong'); }, 260);
  }

  function checkSolved() {
    if (!isSolved(state.tubes)) return;
    state.playing = false;
    var timeBonus = Math.round(state.remaining * 3);
    var moveBonus = Math.max(0, state.parMoves - state.movesUsed) * 4;
    var base = 60 + state.level * 8;
    state.score += base + timeBonus + moveBonus;
    sfxClear();
    updateHud();
    showToast('クリア! +' + (base + timeBonus + moveBonus));
    setTimeout(function () {
      state.level++;
      state.playing = true;
      newLevel();
      lastTime = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }, 1000);
  }

  function handleTimeUp() {
    state.playing = false;
    state.lives--;
    sfxLifeLost();
    updateHud();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    showToast('タイムアップ!');
    setTimeout(function () {
      state.playing = true;
      newLevel();
      lastTime = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }, 900);
  }

  function tapTube(index) {
    if (!state || !state.playing) return;
    if (state.selected === null) {
      if (!state.tubes[index].length) return;
      state.selected = index;
      renderTubes();
      return;
    }
    if (state.selected === index) {
      clearSelection();
      return;
    }
    var from = state.selected;
    var to = index;
    if (canPour(state.tubes, from, to)) {
      doPour(state.tubes, from, to);
      state.movesUsed++;
      state.selected = null;
      sfxPour();
      renderTubes();
      updateHud();
      checkSolved();
    } else {
      state.selected = null;
      renderTubes();
      flashWrong(index);
      sfxWrong();
    }
  }

  function gameOver() {
    state.playing = false;
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '到達レベル: ' + state.level + '\nスコア: ' + state.score;
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
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = { level: 1, score: 0, lives: LIVES_START, playing: true, tubes: [], tubeEls: [], selected: null, movesUsed: 0 };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    newLevel();
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  tubesEl.addEventListener('click', function (e) {
    var target = e.target.closest('.tube');
    if (!target) return;
    tapTube(parseInt(target.dataset.index, 10));
  });

  document.addEventListener('keydown', function (e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 8) tapTube(n - 1);
  });
})();
