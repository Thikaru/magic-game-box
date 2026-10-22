(function () {
  'use strict';

  var W = 480, H = 600, WATER = 560, G = 1000, STEP = 1 / 120;
  var GRAB_R = 64, LEAF_LIFE = 1.6, MAX_AMP = 1.35, START_LIVES = 3;

  // ---- pure physics (also used by the headless check) ----
  function rope(anchor, px, py) {
    var dx = px - anchor.x, dy = py - anchor.y;
    var L = Math.max(80, Math.min(150, Math.hypot(dx, dy)));
    return { L: L, th: Math.atan2(dx, dy) };
  }
  function swingStep(s, dt) {
    s.w += -(G / s.L) * Math.sin(s.th) * dt;
    if (Math.abs(s.th) < MAX_AMP && Math.abs(s.w) > 0.05) s.w += (s.w > 0 ? 1 : -1) * 1.2 * dt;
    s.th += s.w * dt;
  }
  function swingPos(a, s) { return { x: a.x + s.L * Math.sin(s.th), y: a.y + s.L * Math.cos(s.th) }; }
  function swingVel(s) { return { vx: s.L * s.w * Math.cos(s.th), vy: -s.L * s.w * Math.sin(s.th) }; }
  function grabVel(a, s, vx, vy) { // keep only the part of the velocity along the rope's tangent
    return (vx * Math.cos(s.th) - vy * Math.sin(s.th)) / s.L;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rope: rope, swingStep: swingStep, swingPos: swingPos, swingVel: swingVel, grabVel: grabVel,
      G: G, STEP: STEP, GRAB_R: GRAB_R, WATER: WATER };
  }
  if (typeof document === 'undefined') return;

  // ---- game ----
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var intro = document.getElementById('intro'), result = document.getElementById('result');
  var scoreEl = document.getElementById('scoreLabel'), bestEl = document.getElementById('bestLabel'), livesEl = document.getElementById('livesLabel');
  var best = 0;
  try { best = parseInt(localStorage.getItem('swingMonkeyBest') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = 'BEST ' + best;

  var st = null, raf = 0, last = 0, acc = 0, pressQueued = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function addAnchor() {
    var p = st.anchors[st.anchors.length - 1], i = st.anchors.length;
    var gap = rnd(120, 170) + Math.min(i * 4, 60);
    var y = Math.max(80, Math.min(230, p.y + rnd(-60, 60)));
    var leaf = i >= 3 && Math.random() < Math.min(0.15 + i * 0.03, 0.5) && !p.leaf;
    var a = { x: p.x + gap, y: y, leaf: leaf, idx: i, crack: 0 };
    st.anchors.push(a);
    var bx = (p.x + a.x) / 2, by = Math.min(p.y, a.y) - rnd(10, 60);
    if (Math.random() < 0.7) st.bananas.push({ x: bx, y: by, got: false });
  }

  function newGame() {
    st = { anchors: [{ x: 120, y: 120, leaf: false, idx: 0, crack: 0 }], bananas: [], cam: 0,
      mode: 'swing', cur: null, sw: null, x: 0, y: 0, vx: 0, vy: 0, cool: 0, reached: 0, score: 0, lives: START_LIVES,
      safe: 0, t: 0, over: false, last: null };
    for (var i = 0; i < 8; i++) addAnchor();
    attach(st.anchors[0], 0.9, 0);
    st.last = st.anchors[0];
    updateHud();
  }

  function attach(a, th, w) {
    st.mode = 'swing'; st.cur = a;
    st.sw = { L: 125, th: th, w: w };
    a.crack = 0;
    var p = swingPos(a, st.sw); st.x = p.x; st.y = p.y;
  }

  function grab(a) {
    var s = rope(a, st.x, st.y);
    s.w = grabVel(a, s, st.vx, st.vy);
    st.sw = s; st.cur = a; st.mode = 'swing';
    if (a.idx > st.reached) { st.reached = a.idx; st.score += 100; }
    st.last = a;
    a.crack = 0;
    updateHud();
  }

  function release() {
    var v = swingVel(st.sw);
    st.vx = v.vx; st.vy = v.vy;
    st.cool = 0.25; st.cur.used = true; st.mode = 'fly';
    var p = swingPos(st.cur, st.sw); st.x = p.x; st.y = p.y;
    st.prev = st.cur; st.cur = null;
  }

  function press() {
    if (!st || st.over) return;
    if (st.mode === 'swing') { release(); return; }
    var best = null, bd = GRAB_R;
    for (var i = 0; i < st.anchors.length; i++) {
      var a = st.anchors[i];
      if (a === st.prev && st.cool > 0) continue;
      var d = Math.hypot(a.x - st.x, a.y - st.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) grab(best);
    else st.buffer = 0.12; // a slightly-early tap still counts
  }

  function loseLife() {
    st.lives--;
    updateHud();
    if (st.lives <= 0) { finish(); return; }
    var a = st.last;
    a.leaf = false;
    attach(a, a.x > st.x ? -0.9 : 0.9, 0);
    st.safe = 1;
  }

  function update(dt) {
    st.t += dt;
    if (st.cool > 0) st.cool -= dt;
    if (st.safe > 0) st.safe -= dt;
    if (st.buffer > 0) {
      st.buffer -= dt;
      if (st.mode === 'fly') { var b = st.buffer; st.buffer = 0; press(); if (st.mode === 'fly') st.buffer = b; }
    }
    if (st.mode === 'swing') {
      swingStep(st.sw, dt);
      var p = swingPos(st.cur, st.sw); st.x = p.x; st.y = p.y;
      if (st.cur.leaf) {
        st.cur.crack += dt;
        if (st.cur.crack >= LEAF_LIFE) { st.cur.gone = true; release(); st.prev = null; st.cool = 0; }
      }
    } else {
      st.vy += G * dt; st.x += st.vx * dt; st.y += st.vy * dt;
      if (st.y > WATER) { loseLife(); return; }
      if (st.x < st.cam - 30) { loseLife(); return; }
    }
    for (var i = 0; i < st.bananas.length; i++) {
      var bn = st.bananas[i];
      if (!bn.got && Math.hypot(bn.x - st.x, bn.y - st.y) < 32) { bn.got = true; st.score += 20; updateHud(); }
    }
    var target = Math.max(st.cam, st.x - 170);
    st.cam += (target - st.cam) * Math.min(1, dt * 6);
    while (st.anchors[st.anchors.length - 1].x < st.cam + W + 300) addAnchor();
  }

  function updateHud() {
    scoreEl.textContent = 'SCORE ' + st.score;
    var h = ''; for (var i = 0; i < START_LIVES; i++) h += i < st.lives ? '♥' : '♡';
    livesEl.textContent = h;
  }

  function finish() {
    st.over = true;
    var newBest = st.score > best;
    if (newBest) { best = st.score; try { localStorage.setItem('swingMonkeyBest', String(best)); } catch (e) {} }
    bestEl.textContent = 'BEST ' + best;
    document.getElementById('resultTitle').textContent = newBest ? '🎉 ベスト更新!' : 'ゲームオーバー';
    document.getElementById('resultText').innerHTML = '🐒 ' + st.reached + ' 本のロープをわたったよ<br>SCORE ' + st.score;
    result.classList.remove('hidden');
  }

  // ---- drawing ----
  function draw() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd8ff'); g.addColorStop(1, '#d9f6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var c = st.cam;
    ctx.fillStyle = '#7fcf8e';
    for (var i = -1; i < 6; i++) { var hx = i * 160 - (c * 0.3) % 160; ctx.beginPath(); ctx.arc(hx + 80, 520, 110, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#4fae66';
    for (i = -1; i < 4; i++) { hx = i * 240 - (c * 0.55) % 240; ctx.beginPath(); ctx.arc(hx + 120, 560, 120, Math.PI, 0); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    st.anchors.forEach(function (a) {
      if (a.gone) return;
      var sx = a.x - c; if (sx < -60 || sx > W + 60) return;
      ctx.fillStyle = a.leaf ? '#2e9e4a' : '#8b5a2b';
      ctx.fillRect(sx - 3, 0, 6, a.y - 4);
      ctx.beginPath(); ctx.arc(sx, a.y, 12, 0, 7); ctx.fill();
      ctx.font = '22px sans-serif';
      ctx.fillText(a.leaf ? '🍃' : '🪵', sx, a.y);
      if (st.mode === 'fly' && Math.hypot(a.x - st.x, a.y - st.y) < GRAB_R) {
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, a.y, 22, 0, 7); ctx.stroke();
      }
    });
    ctx.font = '26px sans-serif';
    st.bananas.forEach(function (b) { if (!b.got && b.x - c > -30 && b.x - c < W + 30) ctx.fillText('🍌', b.x - c, b.y); });

    if (st.mode === 'swing') {
      var a = st.cur;
      ctx.strokeStyle = a.leaf && a.crack > LEAF_LIFE * 0.6 && Math.floor(st.t * 14) % 2 ? '#ff5a4d' : '#6b4423';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(a.x - c, a.y); ctx.lineTo(st.x - c, st.y); ctx.stroke();
    }
    ctx.globalAlpha = st.safe > 0 && Math.floor(st.t * 12) % 2 ? 0.4 : 1;
    ctx.font = '40px sans-serif';
    ctx.fillText('🐒', st.x - c, st.y);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#2a8fd6'; ctx.fillRect(0, WATER + 8, W, H - WATER);
    ctx.fillStyle = '#5bb8f0';
    for (var x = 0; x < W + 40; x += 40) { var wx = x - (c * 0.8) % 40; ctx.beginPath(); ctx.arc(wx, WATER + 8 + Math.sin(st.t * 2 + x) * 3, 22, Math.PI, 0); ctx.fill(); }
  }

  function frame(ts) {
    var dt = Math.min((ts - last) / 1000, 0.05); last = ts;
    if (st && !st.over && intro.classList.contains('hidden')) {
      acc += dt;
      while (acc >= STEP && !st.over) { update(STEP); acc -= STEP; }
    }
    if (st) draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    intro.classList.add('hidden'); result.classList.add('hidden');
    newGame(); acc = 0;
  }

  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('retryBtn').addEventListener('click', start);
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); if (!intro.classList.contains('hidden')) return; press(); });
  var act = document.getElementById('actBtn');
  act.addEventListener('pointerdown', function (e) { e.preventDefault(); if (!intro.classList.contains('hidden')) return; press(); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (!e.repeat && intro.classList.contains('hidden') && result.classList.contains('hidden')) press();
    }
  });

  newGame();
  last = performance.now();
  raf = requestAnimationFrame(frame);
})();
