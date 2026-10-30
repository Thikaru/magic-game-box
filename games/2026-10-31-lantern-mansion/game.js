(function () {
  'use strict';

  var GW = 17, GH = 21, T = 28, W = GW * T, H = GH * T;
  var OIL_MAX = 60, CANDIES = 5, OILS = 3, OIL_GAIN = 15, MOVE_DT = 0.13, GHOST_DT = 0.46;
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // ---- maze (pure) ----
  function makeMaze() {
    var g = [], x, y;
    for (y = 0; y < GH; y++) { g.push([]); for (x = 0; x < GW; x++) g[y].push(1); }
    var stack = [[1, 1]]; g[1][1] = 0;
    while (stack.length) {
      var c = stack[stack.length - 1], opts = [];
      [[2, 0], [-2, 0], [0, 2], [0, -2]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1];
        if (nx > 0 && ny > 0 && nx < GW - 1 && ny < GH - 1 && g[ny][nx] === 1) opts.push(d);
      });
      if (!opts.length) { stack.pop(); continue; }
      var d = opts[Math.floor(Math.random() * opts.length)];
      g[c[1] + d[1] / 2][c[0] + d[0] / 2] = 0;
      g[c[1] + d[1]][c[0] + d[0]] = 0;
      stack.push([c[0] + d[0], c[1] + d[1]]);
    }
    for (var k = 0; k < 14; k++) { // knock out a few walls so there are loops to run around
      var wx = 1 + Math.floor(Math.random() * (GW - 2)), wy = 1 + Math.floor(Math.random() * (GH - 2));
      if (g[wy][wx] === 1 && ((wx % 2 === 0) !== (wy % 2 === 0))) g[wy][wx] = 0;
    }
    return g;
  }
  function bfs(g, sx, sy) {
    var dist = [], x, y;
    for (y = 0; y < GH; y++) { dist.push([]); for (x = 0; x < GW; x++) dist[y].push(-1); }
    var q = [[sx, sy]]; dist[sy][sx] = 0;
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      for (var k in DIRS) {
        var nx = c[0] + DIRS[k][0], ny = c[1] + DIRS[k][1];
        if (g[ny] && g[ny][nx] === 0 && dist[ny][nx] < 0) { dist[ny][nx] = dist[c[1]][c[0]] + 1; q.push([nx, ny]); }
      }
    }
    return dist;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { makeMaze: makeMaze, bfs: bfs, GW: GW, GH: GH };
  if (typeof document === 'undefined') return;

  // ---- DOM ----
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var intro = document.getElementById('intro'), result = document.getElementById('result');
  var candyEl = document.getElementById('candyLabel'), heartEl = document.getElementById('heartLabel'), bestEl = document.getElementById('bestLabel');
  var oilBar = document.getElementById('oilBar'), pad = document.getElementById('pad'), toggleBtn = document.getElementById('toggleBtn');
  var best = 0;
  try { best = parseInt(localStorage.getItem('lanternMansionBest') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = 'BEST ' + best;

  var st = null, raf = 0, last = 0, held = null, keys = {}, toast = '', toastT = 0;
  var EXIT = { x: GW - 2, y: GH - 2 };

  function rnd(n) { return Math.floor(Math.random() * n); }
  function say(s) { toast = s; toastT = 1.6; }

  function newGame() {
    var g = makeMaze(), dist = bfs(g, 1, 1), cells = [], x, y;
    for (y = 1; y < GH - 1; y++) for (x = 1; x < GW - 1; x++)
      if (g[y][x] === 0 && dist[y][x] >= 6 && !(x === EXIT.x && y === EXIT.y)) cells.push([x, y]);
    function take() { return cells.splice(rnd(cells.length), 1)[0]; }
    var candies = [], oils = [], ghosts = [], i, c;
    for (i = 0; i < CANDIES; i++) { c = take(); candies.push({ x: c[0], y: c[1], got: false }); }
    for (i = 0; i < OILS; i++) { c = take(); oils.push({ x: c[0], y: c[1], got: false }); }
    for (i = 0; i < 2; i++) { c = take(); ghosts.push({ x: c[0], y: c[1], px: c[0], py: c[1], t: 0, dir: null, flash: 0 }); }
    st = { g: g, px: 1, py: 1, fx: 1, fy: 1, moveT: 0, candies: candies, oils: oils, ghosts: ghosts,
      oil: OIL_MAX, hearts: 3, got: 0, inv: 0, time: 0, over: false };
    held = null; toast = ''; toastT = 0;
    hud();
  }

  function hud() {
    candyEl.textContent = '🍬 ' + st.got + '/' + CANDIES;
    var h = ''; for (var i = 0; i < 3; i++) h += i < st.hearts ? '♥' : '♡';
    heartEl.textContent = h;
    oilBar.style.width = Math.max(0, st.oil / OIL_MAX * 100) + '%';
  }

  function radius() { return (1.7 + 3.6 * Math.max(0, st.oil) / OIL_MAX) * T; }

  function tryMove(dx, dy) {
    var nx = st.px + dx, ny = st.py + dy;
    if (st.g[ny] && st.g[ny][nx] === 0) { st.px = nx; st.py = ny; arrive(); }
  }
  function arrive() {
    st.candies.forEach(function (c) { if (!c.got && c.x === st.px && c.y === st.py) { c.got = true; st.got++; say('🍬 ゲット!'); } });
    st.oils.forEach(function (o) { if (!o.got && o.x === st.px && o.y === st.py) { o.got = true; st.oil = Math.min(OIL_MAX, st.oil + OIL_GAIN); say('🛢️ 油ほじゅう!'); } });
    if (st.px === EXIT.x && st.py === EXIT.y) {
      if (st.got >= CANDIES) finish(true); else say('キャンディがあと ' + (CANDIES - st.got) + 'こ!');
    }
    hud();
  }

  function curDir() {
    if (held) return held;
    if (keys.ArrowUp || keys.w) return 'up';
    if (keys.ArrowDown || keys.s) return 'down';
    if (keys.ArrowLeft || keys.a) return 'left';
    if (keys.ArrowRight || keys.d) return 'right';
    return null;
  }

  function moveGhost(gh) {
    var opts = [], k;
    for (k in DIRS) {
      var nx = gh.x + DIRS[k][0], ny = gh.y + DIRS[k][1];
      if (st.g[ny][nx] === 0) opts.push({ k: k, x: nx, y: ny });
    }
    var rev = { up: 'down', down: 'up', left: 'right', right: 'left' }[gh.dir];
    var fwd = opts.filter(function (o) { return o.k !== rev; });
    if (fwd.length) opts = fwd;
    var pick = opts[rnd(opts.length)];
    var near = Math.abs(gh.x - st.px) + Math.abs(gh.y - st.py) <= 9;
    if (near && Math.random() < 0.7) {
      var d = bfs(st.g, st.px, st.py), bestO = null;
      opts.forEach(function (o) { if (!bestO || d[o.y][o.x] < d[bestO.y][bestO.x]) bestO = o; });
      if (bestO) pick = bestO;
    }
    gh.px = gh.x; gh.py = gh.y; gh.x = pick.x; gh.y = pick.y; gh.dir = pick.k; gh.t = 0;
  }

  function hit(gh) {
    st.hearts--; st.inv = 1.8; say('👻 ひゃっ!');
    var d = bfs(st.g, st.px, st.py), far = [];
    for (var y = 1; y < GH - 1; y++) for (var x = 1; x < GW - 1; x++) if (st.g[y][x] === 0 && d[y][x] >= 10) far.push([x, y]);
    var c = far[rnd(far.length)] || [EXIT.x, EXIT.y];
    gh.x = gh.px = c[0]; gh.y = gh.py = c[1]; gh.dir = null; gh.t = 0;
    hud();
    if (st.hearts <= 0) finish(false, 'おばけにつかまっちゃった…');
  }

  function finish(win, why) {
    if (st.over) return;
    st.over = true; cancelAnimationFrame(raf);
    var score = 0;
    if (win) score = 500 + Math.round(st.oil) * 10 + st.hearts * 100;
    if (score > best) { best = score; try { localStorage.setItem('lanternMansionBest', String(best)); } catch (e) {} bestEl.textContent = 'BEST ' + best; }
    document.getElementById('resultTitle').textContent = win ? '🎉 だっしゅつ成功!' : 'ゲームオーバー';
    document.getElementById('resultText').innerHTML = win
      ? 'のこりの油 ' + Math.round(st.oil) + ' ・ ハート ' + st.hearts + '<br>SCORE <b>' + score + '</b>' + (score >= best ? ' (ベスト!)' : '')
      : (why || 'ランタンの油がきれちゃった…') + '<br>キャンディ ' + st.got + '/' + CANDIES;
    draw();
    result.classList.remove('hidden');
  }

  function update(dt) {
    st.time += dt;
    st.oil -= dt; st.inv = Math.max(0, st.inv - dt); toastT = Math.max(0, toastT - dt);
    st.moveT -= dt;
    var dir = curDir();
    if (dir && st.moveT <= 0) { st.moveT = MOVE_DT; tryMove(DIRS[dir][0], DIRS[dir][1]); }
    if (st.over) return;
    st.ghosts.forEach(function (gh) {
      gh.t += dt;
      if (gh.t >= GHOST_DT) moveGhost(gh);
      if (st.inv <= 0 && gh.x === st.px && gh.y === st.py && !st.over) hit(gh);
    });
    if (!st.over && st.oil <= 0) { st.oil = 0; hud(); finish(false); return; }
    hud();
  }

  // ---- draw ----
  function px(v) { return v * T; }
  function draw() {
    ctx.fillStyle = '#1b1226'; ctx.fillRect(0, 0, W, H);
    var x, y;
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      if (st.g[y][x] === 1) { ctx.fillStyle = '#4a3166'; ctx.fillRect(px(x), px(y), T, T); ctx.fillStyle = '#5c3f7e'; ctx.fillRect(px(x) + 2, px(y) + 2, T - 4, T - 4); }
      else { ctx.fillStyle = ((x + y) & 1) ? '#2c2038' : '#322640'; ctx.fillRect(px(x), px(y), T, T); }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = (T - 6) + 'px serif';
    var open = st.got >= CANDIES;
    ctx.globalAlpha = open ? 1 : 0.55; ctx.fillText('🚪', px(EXIT.x) + T / 2, px(EXIT.y) + T / 2); ctx.globalAlpha = 1;
    st.candies.forEach(function (c) { if (!c.got) ctx.fillText('🍬', px(c.x) + T / 2, px(c.y) + T / 2); });
    st.oils.forEach(function (o) { if (!o.got) ctx.fillText('🛢️', px(o.x) + T / 2, px(o.y) + T / 2); });
    var pcx = px(st.px) + T / 2, pcy = px(st.py) + T / 2, r = radius();
    st.ghosts.forEach(function (gh) {
      var k = Math.min(1, gh.t / GHOST_DT), gx = px(gh.px + (gh.x - gh.px) * k) + T / 2, gy = px(gh.py + (gh.y - gh.py) * k) + T / 2 + Math.sin(st.time * 5 + gh.x) * 2;
      if (Math.hypot(gx - pcx, gy - pcy) < r * 0.92) ctx.fillText('👻', gx, gy);
    });
    if (st.inv <= 0 || Math.floor(st.time * 10) % 2) ctx.fillText('🎃', pcx, pcy);
    // darkness with a lantern-shaped hole
    var grd = ctx.createRadialGradient(pcx, pcy, r * 0.35, pcx, pcy, r);
    grd.addColorStop(0, 'rgba(8,3,14,0)'); grd.addColorStop(1, 'rgba(8,3,14,0.965)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    if (toastT > 0) {
      ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillStyle = '#ffd9a0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.strokeText(toast, W / 2, 24); ctx.fillText(toast, W / 2, 24);
    }
  }

  function loop(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    update(dt);
    if (!st.over) { draw(); raf = requestAnimationFrame(loop); }
  }

  function start() {
    cancelAnimationFrame(raf);
    newGame();
    intro.classList.add('hidden'); result.classList.add('hidden');
    last = performance.now(); raf = requestAnimationFrame(loop);
  }

  // ---- input ----
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('retryBtn').addEventListener('click', start);
  window.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (/^Arrow/.test(k) || 'wasd'.indexOf(k) >= 0 && k.length === 1) { keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; held = null; });

  [['bUp', 'up'], ['bDown', 'down'], ['bLeft', 'left'], ['bRight', 'right']].forEach(function (p) {
    var b = document.getElementById(p[0]);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); held = p[1]; if (st) st.moveT = 0; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { if (held === p[1]) held = null; }); });
  });

  // swipe on the canvas: direction follows the latest drag, released on lift
  var anchor = null;
  cv.addEventListener('pointerdown', function (e) { anchor = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointermove', function (e) {
    if (!anchor) return;
    var dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    if (Math.hypot(dx, dy) < 14) return;
    held = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    anchor = { x: e.clientX, y: e.clientY };
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { anchor = null; held = null; }); });

  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) pad.classList.remove('hidden'); else pad.classList.add('hidden');
  toggleBtn.addEventListener('click', function () { pad.classList.toggle('hidden'); });

  // idle preview behind the intro
  newGame(); draw();
})();
