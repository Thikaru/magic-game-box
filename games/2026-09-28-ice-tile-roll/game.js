(function () {
  'use strict';

  var EMPTY = 0, WALL = 1, PIT = 2, GOAL = 3, STAR = 4;
  var DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var CANVAS_SIZE = canvas.width;

  var levelLabel = document.getElementById('levelLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var livesLabel = document.getElementById('livesLabel');
  var movesLabel = document.getElementById('movesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var vpadToggle = document.getElementById('vpadToggle');
  var vpadWrap = document.getElementById('vpadWrap');

  var state = null; // set in newGame
  var toastTimer = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1400);
  }

  // ---------- audio ----------
  var actx = null;
  function ensureAudio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
  }
  function beep(freq, dur, type, vol, delay) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var osc = actx.createOscillator();
    var gain = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sndSlide() { beep(320, 0.08, 'triangle', 0.12); }
  function sndBlocked() { beep(140, 0.07, 'square', 0.08); }
  function sndStar() { beep(880, 0.12, 'sine', 0.2); beep(1320, 0.14, 'sine', 0.16, 0.08); }
  function sndClear() { beep(660, 0.1, 'sine', 0.2); beep(880, 0.12, 'sine', 0.2, 0.09); beep(1100, 0.18, 'sine', 0.2, 0.18); }
  function sndBonus() { beep(520, 0.1, 'square', 0.18); beep(780, 0.1, 'square', 0.18, 0.08); beep(1040, 0.16, 'square', 0.2, 0.16); }
  function sndFail() { beep(220, 0.25, 'sawtooth', 0.18); beep(140, 0.3, 'sawtooth', 0.16, 0.1); }
  function sndOver() { beep(300, 0.2, 'sawtooth', 0.18); beep(200, 0.2, 'sawtooth', 0.18, 0.15); beep(120, 0.4, 'sawtooth', 0.18, 0.3); }

  // ---------- level parameters ----------
  function levelParams(level) {
    var n = Math.min(5 + Math.floor((level - 1) / 3), 8);
    var wallCount = Math.min(4 + Math.floor(level / 2), Math.floor(n * n * 0.22));
    var pitCount = level >= 3 ? Math.min(1 + Math.floor((level - 3) / 4), 4) : 0;
    var starChance = level >= 2 ? 0.65 : 0;
    var buffer = Math.max(1, 4 - Math.floor(level / 5));
    return { n: n, wallCount: wallCount, pitCount: pitCount, starChance: starChance, buffer: buffer };
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  // ---------- physics simulation ----------
  function simulateSlide(grid, n, r, c, dr, dc) {
    var cr = r, cc = c;
    var path = [];
    while (true) {
      var nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) break;
      var cell = grid[nr][nc];
      if (cell === WALL) break;
      cr = nr; cc = nc;
      path.push({ r: cr, c: cc, type: cell });
      if (cell === PIT) {
        return { r: cr, c: cc, path: path, fell: true };
      }
    }
    return { r: cr, c: cc, path: path, fell: false };
  }

  function bfsShortest(grid, n, start, goal) {
    var seen = {};
    var key0 = start.r + ',' + start.c;
    seen[key0] = 0;
    var queue = [start];
    var qi = 0;
    while (qi < queue.length) {
      var cur = queue[qi++];
      var curKey = cur.r + ',' + cur.c;
      var d = seen[curKey];
      if (cur.r === goal.r && cur.c === goal.c) return d;
      var dirNames = ['up', 'down', 'left', 'right'];
      for (var i = 0; i < dirNames.length; i++) {
        var dd = DIRS[dirNames[i]];
        var res = simulateSlide(grid, n, cur.r, cur.c, dd.dr, dd.dc);
        if (res.fell) continue;
        var key = res.r + ',' + res.c;
        if (!(key in seen)) {
          seen[key] = d + 1;
          queue.push({ r: res.r, c: res.c });
        }
      }
    }
    return -1;
  }

  function generateBoard(level, forceStar) {
    var p = levelParams(level);
    var n = p.n;
    var best = null;
    for (var attempt = 0; attempt < 260; attempt++) {
      var grid = [];
      for (var r = 0; r < n; r++) { grid.push(new Array(n).fill(EMPTY)); }

      var wallsToPlace = p.wallCount;
      var tries = 0;
      while (wallsToPlace > 0 && tries < 400) {
        tries++;
        var wr = randInt(n), wc = randInt(n);
        if (grid[wr][wc] === EMPTY) { grid[wr][wc] = WALL; wallsToPlace--; }
      }

      var pitsToPlace = p.pitCount;
      tries = 0;
      while (pitsToPlace > 0 && tries < 400) {
        tries++;
        var pr = randInt(n), pc = randInt(n);
        if (grid[pr][pc] === EMPTY) { grid[pr][pc] = PIT; pitsToPlace--; }
      }

      var emptyCells = [];
      for (var rr = 0; rr < n; rr++) {
        for (var cc2 = 0; cc2 < n; cc2++) {
          if (grid[rr][cc2] === EMPTY) emptyCells.push({ r: rr, c: cc2 });
        }
      }
      if (emptyCells.length < 2) continue;

      var startIdx = randInt(emptyCells.length);
      var start = emptyCells[startIdx];
      var goalCandidates = emptyCells.filter(function (cell) { return cell !== start; });
      var goal = goalCandidates[randInt(goalCandidates.length)];

      var testGrid = grid.map(function (row) { return row.slice(); });
      testGrid[goal.r][goal.c] = GOAL;

      var dist = bfsShortest(testGrid, n, start, goal);
      if (dist < 1 || dist > 7) continue;

      var candidate = { grid: testGrid, n: n, start: start, goal: goal, dist: dist };
      if (!best || Math.abs(dist - 3) < Math.abs(best.dist - 3)) best = candidate;
      if (dist >= 2 && dist <= 5) { best = candidate; break; }
    }

    if (!best) {
      // Fallback: minimal guaranteed-solvable board.
      var fn = Math.max(4, Math.min(n, 5));
      var fgrid = [];
      for (var fr = 0; fr < fn; fr++) fgrid.push(new Array(fn).fill(EMPTY));
      fgrid[fn - 1][fn - 1] = GOAL;
      best = { grid: fgrid, n: fn, start: { r: 0, c: 0 }, goal: { r: fn - 1, c: fn - 1 }, dist: 2 };
    }

    // place a star on a reachable empty cell, away from start/goal.
    var hasStar = forceStar || Math.random() < p.starChance;
    if (hasStar) {
      var starCells = [];
      for (var sr = 0; sr < best.n; sr++) {
        for (var sc = 0; sc < best.n; sc++) {
          if (best.grid[sr][sc] === EMPTY &&
            !(sr === best.start.r && sc === best.start.c) &&
            !(sr === best.goal.r && sc === best.goal.c)) {
            starCells.push({ r: sr, c: sc });
          }
        }
      }
      if (starCells.length > 0) {
        var starPick = starCells[randInt(starCells.length)];
        best.grid[starPick.r][starPick.c] = STAR;
      }
    }

    return best;
  }

  // ---------- game state ----------
  function newGame() {
    state = {
      level: 1,
      score: 0,
      lives: 3,
      clears: 0,
      board: null,
      ballR: 0, ballC: 0,
      movesLeft: 0,
      animating: false,
      bonusRound: false
    };
    startLevel(1);
  }

  function startLevel(level, isBonus) {
    state.level = level;
    state.bonusRound = !!isBonus;
    var board = generateBoard(level, isBonus);
    state.board = board;
    state.ballR = board.start.r;
    state.ballC = board.start.c;
    var p = levelParams(level);
    var buffer = p.buffer + (isBonus ? 2 : 0);
    state.movesLeft = board.dist + buffer;
    state.animating = false;
    state.ballPx = cellCenterPx(board, state.ballR, state.ballC);
    updateHud();
    render();
    if (isBonus) showToast('🌟 ボーナス盤面!');
  }

  function updateHud() {
    levelLabel.textContent = 'LEVEL ' + state.level + (state.bonusRound ? ' 🌟' : '');
    scoreLabel.textContent = 'SCORE ' + state.score;
    livesLabel.textContent = '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(Math.max(0, 3 - state.lives));
    movesLabel.textContent = state.movesLeft;
  }

  function cellCenterPx(board, r, c) {
    var cell = CANVAS_SIZE / board.n;
    return { x: c * cell + cell / 2, y: r * cell + cell / 2, cell: cell };
  }

  // ---------- rendering ----------
  function render() {
    var board = state.board;
    var n = board.n;
    var cell = CANVAS_SIZE / n;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#081522';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var x = c * cell, y = r * cell;
        var t = board.grid[r][c];
        ctx.save();
        var pad = 2;
        if (t === WALL) {
          ctx.fillStyle = '#233a52';
          roundRect(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, 6);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.15)';
          roundRect(ctx, x + pad + 3, y + pad + 3, cell - pad * 2 - 6, (cell - pad * 2 - 6) * 0.3, 4);
          ctx.fill();
        } else {
          ctx.fillStyle = ((r + c) % 2 === 0) ? '#0d2136' : '#0f2740';
          roundRect(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, 6);
          ctx.fill();
        }
        if (t === PIT) {
          ctx.fillStyle = '#020509';
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.34, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ff5d7a';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (t === GOAL) {
          ctx.font = (cell * 0.55) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🚩', x + cell / 2, y + cell / 2 + 1);
        } else if (t === STAR) {
          ctx.font = (cell * 0.5) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', x + cell / 2, y + cell / 2 + 1);
        }
        ctx.restore();
      }
    }

    // ball
    var px = state.ballPx;
    var r0 = px.cell * 0.32;
    var grad = ctx.createRadialGradient(px.x - r0 * 0.3, px.y - r0 * 0.3, r0 * 0.1, px.x, px.y, r0);
    grad.addColorStop(0, '#eaffff');
    grad.addColorStop(0.5, '#7fd7ff');
    grad.addColorStop(1, '#1f7cc4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px.x, px.y, r0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function roundRect(c, x, y, w, h, rad) {
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }

  // ---------- move handling ----------
  function tryMove(dirName) {
    if (!state || state.animating) return;
    if (!introEl.classList.contains('hidden') || !resultEl.classList.contains('hidden')) return;
    var dd = DIRS[dirName];
    var board = state.board;
    var res = simulateSlide(board.grid, board.n, state.ballR, state.ballC, dd.dr, dd.dc);
    if (res.path.length === 0) {
      sndBlocked();
      return;
    }
    state.movesLeft--;
    state.animating = true;
    updateHud();

    var from = cellCenterPx(board, state.ballR, state.ballC);
    var to = cellCenterPx(board, res.r, res.c);
    var dist = Math.max(Math.abs(res.r - state.ballR), Math.abs(res.c - state.ballC));
    var duration = Math.min(420, 90 * dist + 90);
    var startTime = performance.now();
    sndSlide();

    function step(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var ease = 1 - Math.pow(1 - t, 2);
      state.ballPx = {
        x: from.x + (to.x - from.x) * ease,
        y: from.y + (to.y - from.y) * ease,
        cell: from.cell
      };
      render();
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        finishMove(res);
      }
    }
    requestAnimationFrame(step);
  }

  function finishMove(res) {
    state.ballR = res.r;
    state.ballC = res.c;
    var board = state.board;

    // star collection along the path
    var collected = false;
    for (var i = 0; i < res.path.length; i++) {
      var cell = res.path[i];
      if (cell.type === STAR) {
        board.grid[cell.r][cell.c] = EMPTY;
        collected = true;
      }
    }
    if (collected) {
      state.score += 80;
      state.lives = Math.min(3, state.lives + 1);
      sndStar();
      showToast('⭐ ボーナス+80 ライフ回復!');
    }

    if (res.fell) {
      state.animating = false;
      sndFail();
      showToast('こおりが割れた…');
      state.lives--;
      updateHud();
      handleLifeLoss();
      return;
    }

    var onGoal = (res.r === board.goal.r && res.c === board.goal.c);
    if (onGoal) {
      var multiplier = state.bonusRound ? 2 : 1;
      var gained = Math.round((100 + state.movesLeft * 15) * multiplier);
      state.score += gained;
      state.clears++;
      state.animating = false;
      sndClear();
      showToast('クリア! +' + gained);
      updateHud();
      setTimeout(function () {
        var nextLevel = state.level + 1;
        var isBonus = (state.clears % 5 === 0);
        if (isBonus) sndBonus();
        startLevel(nextLevel, isBonus);
      }, 700);
      return;
    }

    if (state.movesLeft <= 0) {
      state.animating = false;
      sndFail();
      showToast('手数切れ…');
      state.lives--;
      updateHud();
      handleLifeLoss();
      return;
    }

    state.animating = false;
    updateHud();
    render();
  }

  function handleLifeLoss() {
    if (state.lives <= 0) {
      setTimeout(gameOver, 500);
    } else {
      setTimeout(function () {
        startLevel(state.level, false);
      }, 700);
    }
  }

  function gameOver() {
    sndOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.innerHTML = 'スコア: ' + state.score + '<br>到達レベル: ' + state.level + '<br>クリア数: ' + state.clears;
    resultEl.classList.remove('hidden');
  }

  // ---------- input ----------
  window.addEventListener('keydown', function (e) {
    var map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    var dir = map[e.key];
    if (dir) {
      e.preventDefault();
      tryMove(dir);
    }
  });

  var vpadButtons = document.querySelectorAll('.vpadBtn');
  vpadButtons.forEach(function (btn) {
    var dir = btn.getAttribute('data-dir');
    btn.addEventListener('touchstart', function (e) { e.preventDefault(); tryMove(dir); }, { passive: false });
    btn.addEventListener('click', function () { tryMove(dir); });
  });

  // swipe on canvas
  var touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      tryMove(dx > 0 ? 'right' : 'left');
    } else {
      tryMove(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });

  // ---------- virtual controller visibility ----------
  function setupVpad() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) vpadWrap.classList.remove('hidden');
    vpadToggle.addEventListener('click', function () {
      vpadWrap.classList.toggle('hidden');
    });
  }

  // ---------- overlay wiring ----------
  startBtn.addEventListener('click', function () {
    ensureAudio();
    introEl.classList.add('hidden');
    newGame();
  });
  retryBtn.addEventListener('click', function () {
    ensureAudio();
    resultEl.classList.add('hidden');
    newGame();
  });

  setupVpad();
})();
