(function () {
  'use strict';
  // size: 盤面の一辺 / taps: 解を作る手数 / ice: 氷マスの数
  var STAGES = [
    { size: 3, taps: 3, ice: 0 },
    { size: 4, taps: 4, ice: 0 },
    { size: 4, taps: 5, ice: 2 },
    { size: 5, taps: 6, ice: 3 },
    { size: 5, taps: 7, ice: 4 }
  ];
  var EXTRA = 2;
  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $('board'), catEl = $('cat'), msgEl = $('msg'), resetBtn = $('resetBtn');

  var phase = 'idle', stageIdx, resets, moves, size, grid, ice, initial, cur, locked, gen = 0;

  function later(fn, ms) {
    var g = gen;
    setTimeout(function () { if (g === gen) fn(); }, ms);
  }
  function setMsg(t) { msgEl.textContent = t || ' '; }
  function neighbors(i) {
    var r = Math.floor(i / size), c = i % size, out = [i];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }
  function applyTap(g, i) {
    neighbors(i).forEach(function (k) { if (!ice[k]) g[k] = !g[k]; });
  }
  function pick(n, total) {
    var a = [], i;
    for (i = 0; i < total; i++) a.push(i);
    for (i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, n);
  }
  function allOn(g) { return g.every(function (v) { return v; }); }

  function build(st) {
    var n = st.size * st.size, g, taps;
    size = st.size;
    ice = [];
    for (var i = 0; i < n; i++) ice.push(false);
    pick(st.ice, n).forEach(function (k) { ice[k] = true; });
    do {
      g = [];
      for (i = 0; i < n; i++) g.push(true);
      taps = pick(st.taps, n);
      taps.forEach(function (k) { applyTap(g, k); });
    } while (allOn(g));
    initial = g.slice();
    grid = g.slice();
    moves = st.taps + EXTRA;
  }

  function render() {
    boardEl.style.gridTemplateColumns = 'repeat(' + size + ',1fr)';
    boardEl.innerHTML = '';
    grid.forEach(function (on, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell' + (ice[i] ? ' ice' : on ? ' on' : '') + (i === cur ? ' cur' : '');
      b.textContent = ice[i] ? '❄️' : on ? '☀️' : '🌑';
      b.setAttribute('aria-label', ice[i] ? 'こおり' : on ? 'ひなた' : 'ひかげ');
      b.addEventListener('click', function () { cur = i; tap(i); });
      boardEl.appendChild(b);
    });
    $('stageLabel').textContent = 'ステージ ' + (stageIdx + 1) + '/' + STAGES.length;
    $('movesLabel').textContent = 'のこり ' + moves + ' 手';
    resetBtn.textContent = '↺ やりなおし(のこり' + resets + ')';
    resetBtn.disabled = resets <= 0 || locked;
    var lit = grid.filter(function (v) { return v; }).length;
    catEl.textContent = lit === grid.length ? '😴' : lit * 2 >= grid.length ? '😺' : '😾';
  }

  function startStage() {
    locked = false;
    cur = 0;
    build(STAGES[stageIdx]);
    setMsg(stageIdx === 2 ? '❄️ こおりのマスは動かないよ!' : 'ぜんぶ ☀️ にしよう');
    render();
  }

  function tap(i) {
    if (phase !== 'play' || locked) return;
    if (ice[i] && neighbors(i).every(function (k) { return ice[k]; })) return;
    applyTap(grid, i);
    moves--;
    if (allOn(grid)) {
      locked = true;
      render();
      setMsg('✨ おひるね成功!');
      later(nextStage, 900);
      return;
    }
    if (moves <= 0) {
      locked = true;
      render();
      setMsg('手数ぎれ…');
      later(function () { finish(false); }, 800);
      return;
    }
    setMsg('ぜんぶ ☀️ にしよう');
    render();
  }

  function nextStage() {
    stageIdx++;
    if (stageIdx >= STAGES.length) { finish(true); return; }
    startStage();
  }

  function finish(win) {
    phase = 'over';
    $('resultTitle').textContent = win ? '🎉 ぜんぶクリア!' : '😿 ねこがおこっちゃった';
    $('resultText').innerHTML = win
      ? 'ねこはぽかぽかでぐっすり。<br>やりなおしののこり: ' + resets + ' 回'
      : 'ステージ ' + (stageIdx + 1) + ' で手数がなくなったよ。<br>もういちど チャレンジしよう!';
    $('result').classList.remove('hidden');
  }

  function start() {
    gen++;
    phase = 'play';
    stageIdx = 0;
    resets = 3;
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    startStage();
  }

  resetBtn.addEventListener('click', function () {
    if (phase !== 'play' || locked || resets <= 0) return;
    resets--;
    grid = initial.slice();
    moves = STAGES[stageIdx].taps + EXTRA;
    setMsg('もとにもどしたよ');
    render();
  });
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  document.addEventListener('keydown', function (e) {
    if (phase !== 'play' || locked) return;
    var k = e.key, n = size;
    if (k === 'ArrowLeft' && cur % n > 0) cur--;
    else if (k === 'ArrowRight' && cur % n < n - 1) cur++;
    else if (k === 'ArrowUp' && cur >= n) cur -= n;
    else if (k === 'ArrowDown' && cur < n * (n - 1)) cur += n;
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); tap(cur); return; }
    else return;
    e.preventDefault();
    render();
  });
})();
