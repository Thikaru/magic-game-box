(function () {
  'use strict';

  var SIZE = 4;
  var TARGETS = [64, 128, 256, 512, 1024, 2048, 2048, 2048];
  var GOLDEN_CHANCE = 0.08;
  var GOLDEN_BONUS = 80;

  var state = null;
  var audioCtx = null;

  var boardEl = document.getElementById('board');
  var scoreEl = document.getElementById('score');
  var roundEl = document.getElementById('round');
  var targetEl = document.getElementById('target');
  var livesEl = document.getElementById('lives');
  var introOverlay = document.getElementById('intro-overlay');
  var toastOverlay = document.getElementById('toast-overlay');
  var toastTitle = document.getElementById('toast-title');
  var toastBody = document.getElementById('toast-body');
  var toastButton = document.getElementById('toast-button');
  var gameoverOverlay = document.getElementById('gameover-overlay');
  var finalScoreEl = document.getElementById('final-score');
  var finalRoundEl = document.getElementById('final-round');
  var startButton = document.getElementById('start-button');
  var retryButton = document.getElementById('retry-button');

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.08;
    osc.connect(g);
    g.connect(audioCtx.destination);
    var now = audioCtx.currentTime;
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }

  function sfxMove() { beep(220, 0.06, 'square', 0.04); }
  function sfxMerge(value) {
    var f = 220 + Math.log2(value) * 40;
    beep(f, 0.12, 'triangle', 0.08);
  }
  function sfxGolden() { beep(880, 0.2, 'sine', 0.09); beep(1320, 0.18, 'sine', 0.06); }
  function sfxRoundClear() {
    beep(523, 0.12, 'sine', 0.08);
    setTimeout(function () { beep(659, 0.12, 'sine', 0.08); }, 100);
    setTimeout(function () { beep(784, 0.2, 'sine', 0.08); }, 200);
  }
  function sfxStuck() { beep(160, 0.25, 'sawtooth', 0.07); }
  function sfxGameOver() {
    beep(200, 0.2, 'sawtooth', 0.08);
    setTimeout(function () { beep(140, 0.35, 'sawtooth', 0.08); }, 150);
  }

  function makeEmptyGrid() {
    var g = [];
    for (var r = 0; r < SIZE; r++) {
      g.push(new Array(SIZE).fill(null));
    }
    return g;
  }

  function cloneGrid(g) {
    return g.map(function (row) {
      return row.map(function (cell) {
        if (cell === null) return null;
        return Object.assign({}, cell);
      });
    });
  }

  function emptyCells(g) {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (g[r][c] === null) cells.push({ r: r, c: c });
      }
    }
    return cells;
  }

  function placeBlockers(g, count) {
    for (var i = 0; i < count; i++) {
      var cells = emptyCells(g);
      if (cells.length === 0) break;
      var pick = cells[Math.floor(Math.random() * cells.length)];
      g[pick.r][pick.c] = { blocker: true };
    }
  }

  function spawnTile(g) {
    var cells = emptyCells(g);
    if (cells.length === 0) return false;
    var pick = cells[Math.floor(Math.random() * cells.length)];
    var value = Math.random() < 0.9 ? 2 : 4;
    var golden = Math.random() < GOLDEN_CHANCE;
    g[pick.r][pick.c] = { value: value, golden: golden };
    return true;
  }

  function getLines(direction) {
    var lines = [];
    if (direction === 'left' || direction === 'right') {
      for (var r = 0; r < SIZE; r++) {
        var line = [];
        for (var c = 0; c < SIZE; c++) {
          line.push({ r: r, c: direction === 'left' ? c : SIZE - 1 - c });
        }
        lines.push(line);
      }
    } else {
      for (var c2 = 0; c2 < SIZE; c2++) {
        var line2 = [];
        for (var r2 = 0; r2 < SIZE; r2++) {
          line2.push({ r: direction === 'up' ? r2 : SIZE - 1 - r2, c: c2 });
        }
        lines.push(line2);
      }
    }
    return lines;
  }

  function getSegments(line, g) {
    var segments = [];
    var current = [];
    for (var i = 0; i < line.length; i++) {
      var coord = line[i];
      var cell = g[coord.r][coord.c];
      if (cell && cell.blocker) {
        if (current.length) segments.push(current);
        current = [];
      } else {
        current.push(coord);
      }
    }
    if (current.length) segments.push(current);
    return segments;
  }

  function collapseSegment(tokens) {
    var result = [];
    var scoreGained = 0;
    var goldenMerges = 0;
    var i = 0;
    while (i < tokens.length) {
      if (i + 1 < tokens.length && tokens[i].value === tokens[i + 1].value) {
        var newValue = tokens[i].value * 2;
        var golden = tokens[i].golden || tokens[i + 1].golden;
        result.push({ value: newValue, golden: false, merged: true });
        scoreGained += newValue;
        if (golden) goldenMerges++;
        i += 2;
      } else {
        result.push(tokens[i]);
        i += 1;
      }
    }
    return { result: result, scoreGained: scoreGained, goldenMerges: goldenMerges };
  }

  function applyMove(g, direction) {
    var clone = cloneGrid(g);
    var lines = getLines(direction);
    var changed = false;
    var totalScore = 0;
    var totalGolden = 0;

    lines.forEach(function (line) {
      var segments = getSegments(line, clone);
      segments.forEach(function (segment) {
        var before = segment.map(function (coord) {
          var cell = clone[coord.r][coord.c];
          return cell ? cell.value + (cell.golden ? 'g' : '') : '.';
        }).join(',');

        var tokens = segment
          .map(function (coord) { return clone[coord.r][coord.c]; })
          .filter(function (v) { return v !== null; });

        var collapsed = collapseSegment(tokens);
        totalScore += collapsed.scoreGained;
        totalGolden += collapsed.goldenMerges;

        for (var i = 0; i < segment.length; i++) {
          var coord = segment[i];
          clone[coord.r][coord.c] = collapsed.result[i] || null;
        }

        var after = segment.map(function (coord) {
          var cell = clone[coord.r][coord.c];
          return cell ? cell.value + (cell.golden ? 'g' : '') : '.';
        }).join(',');

        if (before !== after) changed = true;
      });
    });

    return { changed: changed, grid: clone, scoreGained: totalScore, goldenMerges: totalGolden };
  }

  function anyMovePossible(g) {
    var dirs = ['left', 'right', 'up', 'down'];
    for (var i = 0; i < dirs.length; i++) {
      if (applyMove(g, dirs[i]).changed) return true;
    }
    return false;
  }

  function newRoundState(round, score, lives) {
    var grid = makeEmptyGrid();
    var blockerCount = Math.min(round - 1, 4);
    placeBlockers(grid, blockerCount);
    spawnTile(grid);
    spawnTile(grid);
    return {
      grid: grid,
      round: round,
      target: TARGETS[Math.min(round - 1, TARGETS.length - 1)],
      score: score,
      lives: lives,
      locked: false
    };
  }

  function valueColor(value) {
    var colors = {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e'
    };
    return colors[value] || '#3c3a32';
  }

  function render(justSpawned) {
    boardEl.innerHTML = '';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = state.grid[r][c];
        var div = document.createElement('div');
        div.className = 'cell';
        if (cell && cell.blocker) {
          div.className += ' blocker';
          div.textContent = '🧱';
        } else if (cell) {
          div.className += ' tile';
          if (cell.value >= 8) div.classList.add('light-text');
          if (cell.golden) div.classList.add('golden');
          if (cell.merged) div.classList.add('pop');
          div.style.background = cell.golden ? '' : valueColor(cell.value);
          div.textContent = String(cell.value);
        }
        boardEl.appendChild(div);
      }
    }
    scoreEl.textContent = state.score;
    roundEl.textContent = state.round;
    targetEl.textContent = state.target;
    livesEl.textContent = '♥️'.repeat(state.lives) + '♡'.repeat(3 - state.lives);
  }

  function showToast(title, body, buttonLabel, onContinue) {
    toastTitle.textContent = title;
    toastBody.textContent = body;
    toastButton.textContent = buttonLabel;
    toastOverlay.classList.remove('hidden');
    state.locked = true;
    toastButton.onclick = function () {
      toastOverlay.classList.add('hidden');
      state.locked = false;
      onContinue();
    };
  }

  function handleRoundClear() {
    sfxRoundClear();
    var bonus = state.target * 2;
    state.score += bonus;
    var clearedRound = state.round;
    showToast(
      'ラウンドクリア！',
      '目標' + state.target + 'を達成！ボーナス+' + bonus,
      'つぎへ',
      function () {
        var next = newRoundState(clearedRound + 1, state.score, state.lives);
        state = next;
        render();
      }
    );
    render();
  }

  function handleStuck() {
    sfxStuck();
    state.lives -= 1;
    if (state.lives <= 0) {
      sfxGameOver();
      finalScoreEl.textContent = state.score;
      finalRoundEl.textContent = state.round;
      gameoverOverlay.classList.remove('hidden');
      state.locked = true;
      render();
      return;
    }
    var round = state.round;
    var score = state.score;
    var lives = state.lives;
    showToast(
      'もう動かせません！',
      'ライフが1減った！盤面を作り直して続けよう',
      'もういちど',
      function () {
        var next = newRoundState(round, score, lives);
        state = next;
        render();
      }
    );
    render();
  }

  function move(direction) {
    if (!state || state.locked) return;
    var res = applyMove(state.grid, direction);
    if (!res.changed) return;

    sfxMove();
    state.grid = res.grid;
    state.score += res.scoreGained;
    if (res.scoreGained > 0) {
      res.grid.forEach(function (row) {
        row.forEach(function (cell) {
          if (cell && cell.merged) sfxMerge(cell.value);
        });
      });
    }
    if (res.goldenMerges > 0) {
      state.score += res.goldenMerges * GOLDEN_BONUS;
      state.lives = Math.min(3, state.lives + res.goldenMerges);
      sfxGolden();
    }

    spawnTile(state.grid);

    var reachedTarget = false;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = state.grid[r][c];
        if (cell && !cell.blocker && cell.value >= state.target) reachedTarget = true;
      }
    }

    render();

    state.grid.forEach(function (row) {
      row.forEach(function (cell) {
        if (cell && cell.merged) cell.merged = false;
      });
    });

    if (reachedTarget) {
      handleRoundClear();
    } else if (!anyMovePossible(state.grid)) {
      handleStuck();
    }
  }

  function startGame() {
    ensureAudio();
    introOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    state = newRoundState(1, 0, 3);
    render();
  }

  startButton.addEventListener('click', startGame);
  retryButton.addEventListener('click', function () {
    ensureAudio();
    startGame();
  });

  window.addEventListener('keydown', function (e) {
    var map = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down'
    };
    var dir = map[e.key];
    if (dir) {
      e.preventDefault();
      move(dir);
    }
  }, { passive: false });

  document.querySelectorAll('.dpad-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      move(btn.dataset.dir);
    });
  });

  var touchStartX = 0, touchStartY = 0, touching = false;
  boardEl.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touching = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  boardEl.addEventListener('touchmove', function (e) {
    if (touching) e.preventDefault();
  }, { passive: false });

  boardEl.addEventListener('touchend', function (e) {
    if (!touching) return;
    touching = false;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    var absX = Math.abs(dx), absY = Math.abs(dy);
    var threshold = 20;
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });
})();
