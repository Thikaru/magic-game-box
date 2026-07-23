(() => {
  'use strict';

  // Directions: 0=N, 1=E, 2=S, 3=W
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const OPP = [2, 3, 0, 1];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const levelLabel = document.getElementById('levelLabel');
  const livesLabel = document.getElementById('livesLabel');
  const timerBar = document.getElementById('timerBar');

  const MARGIN = 26;
  const TILE = 58;

  let state = null; // current game state
  let tickHandle = null;

  function rand(n) { return Math.floor(Math.random() * n); }
  function choice(arr) { return arr[rand(arr.length)]; }

  function levelConfig(level) {
    const cols = Math.min(4 + (level - 1), 6);
    const rows = Math.min(5 + Math.floor((level - 1) / 3), 6);
    const timeLimit = Math.max(24 - (level - 1) * 2, 11);
    return { cols, rows, timeLimit };
  }

  // base connection sets at rot=0
  const SHAPE_BASE = { I: [0, 2], L: [0, 1], T: [0, 1, 2], X: [0, 1, 2, 3] };

  function connections(shape, rot) {
    return SHAPE_BASE[shape].map(d => (d + rot) % 4);
  }

  function setsEqual(a, b) {
    const sa = [...a].sort().join(',');
    const sb = [...b].sort().join(',');
    return sa === sb;
  }

  function findRotFor(shape, targetDirs) {
    for (let rot = 0; rot < 4; rot++) {
      if (setsEqual(connections(shape, rot), targetDirs)) return rot;
    }
    return 0;
  }

  function randomRotAvoiding(shape, avoidRot) {
    const options = [0, 1, 2, 3].filter(r => {
      if (shape === 'I') return (r % 2) !== (avoidRot % 2); // I has 2 visually distinct states
      return r !== avoidRot;
    });
    if (!options.length) return (avoidRot + 1) % 4;
    return choice(options);
  }

  function cellKey(r, c) { return r + ',' + c; }

  function buildPuzzle(level) {
    const { cols, rows, timeLimit } = levelConfig(level);
    const startRow = rand(rows);
    const goalRow = rand(rows);

    // monotonic-per-column random path guaranteed to reach (goalRow, cols-1) with no revisits
    let r = startRow, c = 0;
    const path = [{ r, c }];
    while (c < cols - 1 || r !== goalRow) {
      const canRight = c < cols - 1;
      const needVertical = r !== goalRow;
      let moveRight;
      if (canRight && needVertical) moveRight = Math.random() < 0.55;
      else moveRight = canRight;
      if (moveRight) c += 1;
      else r += (goalRow > r ? 1 : -1);
      path.push({ r, c });
    }

    const tiles = {};
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        const shape = choice(['I', 'L', 'L', 'T', 'I']);
        const rot = rand(4);
        tiles[cellKey(rr, cc)] = { shape, rot, isPath: false };
      }
    }

    const pathSet = new Set(path.map(p => cellKey(p.r, p.c)));

    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      const inDir = i === 0 ? 3 : OPP[dirBetween(path[i - 1], cell)];
      const outDir = i === path.length - 1 ? 1 : dirBetween(cell, path[i + 1]);
      const target = [inDir, outDir];
      const shape = (inDir === OPP[outDir]) ? 'I' : 'L';
      const solvedRot = findRotFor(shape, target);
      tiles[cellKey(cell.r, cell.c)] = {
        shape, rot: randomRotAvoiding(shape, solvedRot), isPath: true, inDir, outDir
      };
    }

    // bonus star branch: upgrade one interior path cell to a T with a spare direction toward a non-path neighbor
    let bonusCell = null;
    let bonusFrom = null;
    if (path.length >= 3) {
      const interiorIdx = [];
      for (let i = 1; i < path.length - 1; i++) interiorIdx.push(i);
      for (let tries = 0; tries < interiorIdx.length && !bonusCell; tries++) {
        const idx = choice(interiorIdx);
        const cell = path[idx];
        const key = cellKey(cell.r, cell.c);
        const used = new Set([tiles[key].inDir, tiles[key].outDir]);
        const spare = [0, 1, 2, 3].filter(d => !used.has(d));
        for (const d3 of spare) {
          const nr = cell.r + DY[d3], nc = cell.c + DX[d3];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (pathSet.has(cellKey(nr, nc))) continue;
          // found a valid bonus branch
          const dOmit = [0, 1, 2, 3].find(d => d !== tiles[key].inDir && d !== tiles[key].outDir && d !== d3);
          const rot = (dOmit + 1) % 4;
          tiles[key] = {
            shape: 'T', rot: randomRotAvoiding('T', rot), isPath: true,
            inDir: tiles[key].inDir, outDir: tiles[key].outDir, bonusDir: d3
          };
          const bd = OPP[d3];
          const otherDir = (bd + 1) % 4;
          const bShape = (bd === OPP[otherDir]) ? 'I' : 'L';
          const bSolvedRot = findRotFor(bShape, [bd, otherDir]);
          tiles[cellKey(nr, nc)] = {
            shape: bShape, rot: randomRotAvoiding(bShape, bSolvedRot), isPath: false, isBonus: true
          };
          bonusCell = { r: nr, c: nc };
          bonusFrom = { r: cell.r, c: cell.c };
          break;
        }
      }
    }

    return {
      cols, rows, timeLimit, tiles,
      start: { r: startRow, c: 0 },
      goal: { r: goalRow, c: cols - 1 },
      bonusCell, bonusFrom
    };
  }

  function dirBetween(a, b) {
    if (b.c > a.c) return 1;
    if (b.c < a.c) return 3;
    if (b.r > a.r) return 2;
    return 0;
  }

  function computeFlow(puzzle) {
    const { rows, cols, tiles, start, goal } = puzzle;
    const startTile = tiles[cellKey(start.r, start.c)];
    const startConns = connections(startTile.shape, startTile.rot);
    const reached = new Set();
    if (!startConns.includes(3)) return { reached, solved: false, bonus: false };
    const queue = [{ r: start.r, c: start.c }];
    reached.add(cellKey(start.r, start.c));
    while (queue.length) {
      const cur = queue.shift();
      const tile = tiles[cellKey(cur.r, cur.c)];
      const conns = connections(tile.shape, tile.rot);
      for (const d of conns) {
        const nr = cur.r + DY[d], nc = cur.c + DX[d];
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const key = cellKey(nr, nc);
        if (reached.has(key)) continue;
        const ntile = tiles[key];
        const nconns = connections(ntile.shape, ntile.rot);
        if (nconns.includes(OPP[d])) {
          reached.add(key);
          queue.push({ r: nr, c: nc });
        }
      }
    }
    const goalTile = tiles[cellKey(goal.r, goal.c)];
    const goalConns = connections(goalTile.shape, goalTile.rot);
    const solved = reached.has(cellKey(goal.r, goal.c)) && goalConns.includes(1);
    const bonus = puzzle.bonusCell ? reached.has(cellKey(puzzle.bonusCell.r, puzzle.bonusCell.c)) : false;
    return { reached, solved, bonus };
  }

  function newGame() {
    state = {
      level: 1,
      score: 0,
      lives: 3,
      puzzle: null,
      cursor: { r: 0, c: 0 },
      timeLeft: 0,
      running: false
    };
    startLevel();
  }

  function startLevel() {
    const puzzle = buildPuzzle(state.level);
    state.puzzle = puzzle;
    state.timeLeft = puzzle.timeLimit;
    state.cursor = { r: puzzle.start.r, c: 0 };
    canvas.width = puzzle.cols * TILE + MARGIN * 2;
    canvas.height = puzzle.rows * TILE + MARGIN * 2;
    state.running = true;
    updateHud();
    render();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    levelLabel.textContent = 'LEVEL ' + state.level;
    livesLabel.textContent = '♥'.repeat(Math.max(state.lives, 0)) + '♡'.repeat(Math.max(3 - state.lives, 0));
    const pct = Math.max(0, state.timeLeft / state.puzzle.timeLimit) * 100;
    timerBar.style.width = pct + '%';
  }

  function tileCenter(r, c) {
    return { x: MARGIN + c * TILE + TILE / 2, y: MARGIN + r * TILE + TILE / 2 };
  }

  function render() {
    const { puzzle } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#06202f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const flow = computeFlow(puzzle);

    // grid background
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#0a2c3f' : '#0d3247';
        ctx.fillRect(MARGIN + c * TILE, MARGIN + r * TILE, TILE, TILE);
      }
    }

    // pipes
    for (let r = 0; r < puzzle.rows; r++) {
      for (let c = 0; c < puzzle.cols; c++) {
        drawTile(r, c, flow.reached.has(cellKey(r, c)));
      }
    }

    // start/goal markers
    const s = tileCenter(puzzle.start.r, 0);
    ctx.strokeStyle = '#33e0b0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(MARGIN - 16, s.y);
    ctx.lineTo(MARGIN, s.y);
    ctx.stroke();
    ctx.fillStyle = '#33e0b0';
    ctx.font = 'bold 13px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('IN', 2, s.y - 12);

    const g = tileCenter(puzzle.goal.r, puzzle.goal.c);
    const rightEdge = MARGIN + puzzle.cols * TILE;
    ctx.beginPath();
    ctx.moveTo(rightEdge, g.y);
    ctx.lineTo(rightEdge + 16, g.y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText('OUT', canvas.width - 2, g.y - 12);

    // cursor highlight (keyboard)
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.strokeRect(MARGIN + state.cursor.c * TILE + 2, MARGIN + state.cursor.r * TILE + 2, TILE - 4, TILE - 4);

    updateHud();

    if (flow.solved) {
      onSolved(flow.bonus);
    }
  }

  function drawTile(r, c, active) {
    const tile = state.puzzle.tiles[cellKey(r, c)];
    const conns = connections(tile.shape, tile.rot);
    const cx = MARGIN + c * TILE + TILE / 2;
    const cy = MARGIN + r * TILE + TILE / 2;
    const half = TILE / 2;

    ctx.lineCap = 'round';
    ctx.strokeStyle = active ? '#33e0b0' : '#4a7288';
    ctx.lineWidth = active ? 14 : 12;
    ctx.beginPath();
    for (const d of conns) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + DX[d] * half, cy + DY[d] * half);
    }
    ctx.stroke();

    ctx.fillStyle = active ? '#5df5c8' : '#6a93a8';
    ctx.beginPath();
    ctx.arc(cx, cy, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();

    if (tile.isBonus) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', cx, cy);
    }
  }

  function rotateTile(r, c) {
    if (!state.running) return;
    const tile = state.puzzle.tiles[cellKey(r, c)];
    if (tile.shape === 'X') return;
    tile.rot = (tile.rot + 1) % 4;
    render();
  }

  function onSolved(gotBonus) {
    state.running = false;
    stopTicker();
    const timeBonus = Math.round(state.timeLeft * 10);
    const levelBonus = state.level * 20;
    const starBonus = gotBonus ? 150 : 0;
    state.score += timeBonus + levelBonus + starBonus;
    updateHud();
    setTimeout(() => {
      state.level += 1;
      startLevel();
      startTicker();
    }, 600);
  }

  function loseLife() {
    state.running = false;
    stopTicker();
    state.lives -= 1;
    updateHud();
    if (state.lives <= 0) {
      showGameOver();
    } else {
      setTimeout(() => {
        startLevel();
        startTicker();
      }, 700);
    }
  }

  function showGameOver() {
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML = 'スコア: ' + state.score + '<br>到達レベル: ' + state.level;
    resultEl.classList.remove('hidden');
  }

  function startTicker() {
    stopTicker();
    tickHandle = setInterval(() => {
      if (!state.running) return;
      state.timeLeft -= 0.1;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHud();
        loseLife();
        return;
      }
      updateHud();
    }, 100);
  }

  function stopTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function cellFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (evt.clientX - rect.left) * scaleX;
    const py = (evt.clientY - rect.top) * scaleY;
    const c = Math.floor((px - MARGIN) / TILE);
    const r = Math.floor((py - MARGIN) / TILE);
    if (r < 0 || c < 0 || r >= state.puzzle.rows || c >= state.puzzle.cols) return null;
    return { r, c };
  }

  canvas.addEventListener('pointerdown', (evt) => {
    if (!state || !state.running) return;
    const cell = cellFromEvent(evt);
    if (!cell) return;
    state.cursor = cell;
    rotateTile(cell.r, cell.c);
  });

  window.addEventListener('keydown', (evt) => {
    if (!state || !state.running) return;
    const { rows, cols } = state.puzzle;
    let handled = true;
    switch (evt.key) {
      case 'ArrowUp': state.cursor.r = Math.max(0, state.cursor.r - 1); break;
      case 'ArrowDown': state.cursor.r = Math.min(rows - 1, state.cursor.r + 1); break;
      case 'ArrowLeft': state.cursor.c = Math.max(0, state.cursor.c - 1); break;
      case 'ArrowRight': state.cursor.c = Math.min(cols - 1, state.cursor.c + 1); break;
      case ' ':
      case 'Enter':
        rotateTile(state.cursor.r, state.cursor.c);
        break;
      default: handled = false;
    }
    if (handled) {
      evt.preventDefault();
      render();
    }
  });

  startBtn.addEventListener('click', () => {
    introEl.classList.add('hidden');
    newGame();
    startTicker();
  });

  retryBtn.addEventListener('click', () => {
    resultEl.classList.add('hidden');
    newGame();
    startTicker();
  });
})();
