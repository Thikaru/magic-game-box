(function () {
  'use strict';

  var LIVES_START = 3;
  var COLORS = ['#ff5d7a', '#4dd8e6', '#ffd23f', '#6be08a', '#b98cff', '#ff9f43'];
  var CANVAS_SIZE = 320;

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var paletteEl = document.getElementById('palette');
  var levelLabel = document.getElementById('levelLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var movesLabel = document.getElementById('movesLabel');
  var livesLabel = document.getElementById('livesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
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
    gain.gain.linearRampToValueAtTime(gainPeak || 0.15, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxFlood() { beep(440, 0.08, 'sine', 0.12); }
  function sfxStar() { beep(740, 0.1, 'square', 0.15); setTimeout(function () { beep(990, 0.14, 'square', 0.14); }, 90); }
  function sfxClear() { beep(660, 0.12, 'square', 0.14); setTimeout(function () { beep(880, 0.12, 'square', 0.14); }, 90); setTimeout(function () { beep(1180, 0.18, 'square', 0.14); }, 180); }
  function sfxLifeLost() { beep(220, 0.3, 'sawtooth', 0.15); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  // レベルごとの盤面サイズ・色数・壁マス数・手数上限。
  // 手数上限は「同色ブロックの貪欲な塗り方」をシミュレーションした所要手数の
  // 上位1割ライン(p90)に+3手のゆとりを足して算出した値(games-log.md参照)。
  var LEVEL_TABLE = [
    { size: 5, colors: 4, walls: 1, moves: 12 },
    { size: 5, colors: 4, walls: 1, moves: 11 },
    { size: 6, colors: 4, walls: 2, moves: 13 },
    { size: 6, colors: 5, walls: 2, moves: 16 },
    { size: 7, colors: 5, walls: 3, moves: 17 },
    { size: 7, colors: 5, walls: 3, moves: 17 },
    { size: 8, colors: 6, walls: 4, moves: 21 },
    { size: 8, colors: 6, walls: 4, moves: 22 },
    { size: 9, colors: 6, walls: 5, moves: 24 },
    { size: 9, colors: 6, walls: 5, moves: 24 },
    { size: 9, colors: 6, walls: 6, moves: 24 },
    { size: 9, colors: 6, walls: 6, moves: 24 },
    { size: 9, colors: 6, walls: 7, moves: 25 },
    { size: 9, colors: 6, walls: 7, moves: 25 }
  ];

  function paramsForLevel(level) {
    if (level <= LEVEL_TABLE.length) {
      var row = LEVEL_TABLE[level - 1];
      return { size: row.size, colors: row.colors, walls: row.walls, moves: row.moves };
    }
    var extra = level - LEVEL_TABLE.length;
    var walls = Math.min(7 + Math.floor(extra / 4), 9);
    var moves = Math.max(19, 25 - Math.floor(extra / 2));
    return { size: 9, colors: 6, walls: walls, moves: moves };
  }

  function key(r, c) { return r + ',' + c; }

  function neighbors(r, c, size) {
    var list = [];
    if (r > 0) list.push([r - 1, c]);
    if (r < size - 1) list.push([r + 1, c]);
    if (c > 0) list.push([r, c - 1]);
    if (c < size - 1) list.push([r, c + 1]);
    return list;
  }

  function generateBoard(size, colorsCount, wallCount) {
    for (var attempt = 0; attempt < 60; attempt++) {
      var grid = [];
      for (var r = 0; r < size; r++) {
        var row = [];
        for (var c = 0; c < size; c++) row.push(Math.floor(Math.random() * colorsCount));
        grid.push(row);
      }
      var cells = [];
      for (var rr = 0; rr < size; rr++) {
        for (var cc = 0; cc < size; cc++) {
          if (!(rr === 0 && cc === 0)) cells.push([rr, cc]);
        }
      }
      for (var i = cells.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp;
      }
      var walls = {};
      for (var w = 0; w < wallCount && w < cells.length; w++) walls[key(cells[w][0], cells[w][1])] = true;

      var seen = [];
      for (var y = 0; y < size; y++) seen.push(new Array(size).fill(false));
      var queue = [[0, 0]];
      seen[0][0] = true;
      var count = 1;
      while (queue.length) {
        var cur = queue.shift();
        var nbrs = neighbors(cur[0], cur[1], size);
        for (var n = 0; n < nbrs.length; n++) {
          var nr = nbrs[n][0], nc = nbrs[n][1];
          if (walls[key(nr, nc)]) continue;
          if (seen[nr][nc]) continue;
          seen[nr][nc] = true;
          count++;
          queue.push([nr, nc]);
        }
      }
      var totalNonWall = size * size - wallCount;
      if (count === totalNonWall) {
        // 壁マス以外の非壁マスと重ならない位置にスターマスを1つ配置
        var starCandidates = cells.filter(function (p) { return !walls[key(p[0], p[1])]; });
        var star = starCandidates.length ? starCandidates[Math.floor(Math.random() * starCandidates.length)] : null;
        return { grid: grid, walls: walls, size: size, star: star, totalNonWall: totalNonWall };
      }
    }
    // 生成に失敗した場合は壁を1つ減らして再挑戦(理論上ほぼ発生しない保険)
    if (wallCount > 0) return generateBoard(size, colorsCount, wallCount - 1);
    throw new Error('board generation failed');
  }

  function floodExpand(board, owned, newColor) {
    var size = board.size;
    var queue = [];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (owned[r][c]) queue.push([r, c]);
      }
    }
    var qi = 0;
    var gainedStar = false;
    while (qi < queue.length) {
      var cur = queue[qi++];
      var nbrs = neighbors(cur[0], cur[1], size);
      for (var n = 0; n < nbrs.length; n++) {
        var nr = nbrs[n][0], nc = nbrs[n][1];
        if (board.walls[key(nr, nc)]) continue;
        if (owned[nr][nc]) continue;
        if (board.grid[nr][nc] !== newColor) continue;
        owned[nr][nc] = true;
        queue.push([nr, nc]);
        if (board.star && board.star[0] === nr && board.star[1] === nc) gainedStar = true;
      }
    }
    return gainedStar;
  }

  function ownedCount(owned, size) {
    var n = 0;
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (owned[r][c]) n++;
    return n;
  }

  function buildPalette(colorsCount) {
    paletteEl.innerHTML = '';
    var btns = [];
    for (var i = 0; i < colorsCount; i++) {
      var btn = document.createElement('button');
      btn.className = 'colorBtn';
      btn.style.background = COLORS[i];
      btn.dataset.index = String(i);
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      btn.appendChild(num);
      paletteEl.appendChild(btn);
      btns.push(btn);
    }
    return btns;
  }

  function updatePalette() {
    for (var i = 0; i < state.paletteEls.length; i++) {
      state.paletteEls[i].classList.toggle('current', i === state.regionColor);
    }
  }

  function drawBoard() {
    var size = state.board.size;
    var cell = CANVAS_SIZE / size;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var x = c * cell, y = r * cell;
        if (state.board.walls[key(r, c)]) {
          ctx.fillStyle = '#1c1726';
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = 'rgba(255,255,255,.08)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          ctx.font = (cell * 0.5) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🧱', x + cell / 2, y + cell / 2 + 1);
        } else {
          var colorIdx = state.owned[r][c] ? state.regionColor : state.board.grid[r][c];
          ctx.fillStyle = COLORS[colorIdx];
          ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          if (state.owned[r][c]) {
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5);
          }
          if (!state.starClaimed && state.board.star && state.board.star[0] === r && state.board.star[1] === c) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + (cell * 0.55) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', x + cell / 2, y + cell / 2 + 1);
          }
        }
      }
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1200);
  }

  function updateHud() {
    levelLabel.textContent = 'LEVEL ' + state.level + (state.isBonus ? ' 🌟' : '');
    scoreLabel.textContent = 'SCORE ' + state.score;
    movesLabel.textContent = 'のこり手数 ' + state.movesLeft;
    movesLabel.classList.toggle('low', state.movesLeft <= 3);
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
  }

  function newLevel() {
    var params = paramsForLevel(state.level);
    var isBonus = state.bonusPending;
    state.bonusPending = false;
    state.isBonus = isBonus;
    var moveLimit = params.moves + (isBonus ? 5 : 0);

    state.board = generateBoard(params.size, params.colors, params.walls);
    state.owned = [];
    for (var r = 0; r < params.size; r++) state.owned.push(new Array(params.size).fill(false));
    state.owned[0][0] = true;
    state.regionColor = state.board.grid[0][0];
    floodExpand(state.board, state.owned, state.regionColor);
    state.starClaimed = false;
    state.movesLeft = moveLimit;
    state.moveLimit = moveLimit;
    state.paletteEls = buildPalette(params.colors);
    attachPaletteEvents();
    updatePalette();
    drawBoard();
    updateHud();
  }

  function attachPaletteEvents() {
    for (var i = 0; i < state.paletteEls.length; i++) {
      state.paletteEls[i].addEventListener('click', makeClickHandler(i));
    }
  }

  function makeClickHandler(index) {
    return function () { pickColor(index); };
  }

  function pickColor(colorIndex) {
    if (!state || !state.playing) return;
    if (colorIndex < 0 || colorIndex >= state.paletteEls.length) return;
    if (colorIndex === state.regionColor) return;

    var gainedStar = floodExpand(state.board, state.owned, colorIndex);
    state.regionColor = colorIndex;
    state.movesLeft--;
    sfxFlood();

    if (gainedStar && !state.starClaimed) {
      state.starClaimed = true;
      state.movesLeft = Math.min(state.movesLeft + 1, state.moveLimit);
      state.score += 25;
      sfxStar();
      showToast('★ボーナス!手数+1');
    }

    drawBoard();
    updatePalette();
    updateHud();

    var total = ownedCount(state.owned, state.board.size);
    if (total === state.board.totalNonWall) {
      handleClear();
      return;
    }
    if (state.movesLeft <= 0) {
      handleOutOfMoves();
    }
  }

  function handleClear() {
    state.playing = false;
    state.combo = (state.combo || 0) + 1;
    var base = 40 + state.level * 5;
    var moveBonus = state.movesLeft * 6;
    var total = (base + moveBonus) * (state.isBonus ? 2 : 1);
    state.score += total;
    sfxClear();
    updateHud();
    var willBeBonus = state.combo > 0 && state.combo % 5 === 0;
    state.bonusPending = willBeBonus;
    showToast('クリア! +' + total + (willBeBonus ? '(次は🌟ボーナスラウンド!)' : ''));
    setTimeout(function () {
      state.level++;
      state.playing = true;
      newLevel();
    }, 1100);
  }

  function handleOutOfMoves() {
    state.playing = false;
    state.lives--;
    state.combo = 0;
    sfxLifeLost();
    updateHud();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    showToast('手数切れ!おなじレベルでもう一度');
    setTimeout(function () {
      state.playing = true;
      newLevel();
    }, 1000);
  }

  function gameOver() {
    state.playing = false;
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = '到達レベル: ' + state.level + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    state = {
      level: 1,
      score: 0,
      lives: LIVES_START,
      playing: true,
      combo: 0,
      bonusPending: false,
      isBonus: false
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    newLevel();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  document.addEventListener('keydown', function (e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) pickColor(n - 1);
  });
})();
