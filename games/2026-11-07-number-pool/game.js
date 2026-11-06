(function () {
  'use strict';
  var W = 360, H = 520, M = 24, R = 11, PR = 19, MAXLV = 4;
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var pockets = [[M, M], [W - M, M], [M, H / 2], [W - M, H / 2], [M, H - M], [W - M, H - M]];
  var COLORS = ['', '#e8c21a', '#2d6be0', '#e03a3a', '#8a3ad0', '#e8832a'];

  var level, score, shotsLeft, balls, cue, next, state, aim, power, drag, msg, msgT, tot;

  function show(el, on) { el.classList.toggle('hidden', !on); }
  function hud() {
    $('lv').textContent = 'LEVEL ' + level;
    $('shots').textContent = 'のこり ' + shotsLeft + ' 打';
    $('score').textContent = score + '点';
    $('info').textContent = state === 'moving' ? '…' : 'つぎは「' + next + '」番を落とそう!' + (msg ? '  ' + msg : '');
  }
  function free(x, y) {
    var all = balls.concat([cue]);
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (Math.hypot(b.x - x, b.y - y) < R * 2.6) return false;
    }
    for (var j = 0; j < pockets.length; j++)
      if (Math.hypot(pockets[j][0] - x, pockets[j][1] - y) < PR + R + 12) return false;
    return true;
  }
  function place(b, ymin, ymax) {
    for (var t = 0; t < 400; t++) {
      var x = M + R + 6 + Math.random() * (W - 2 * M - 2 * R - 12);
      var y = ymin + Math.random() * (ymax - ymin);
      if (free(x, y)) { b.x = x; b.y = y; return; }
    }
    b.x = W / 2; b.y = (ymin + ymax) / 2;
  }
  function setup() {
    var n = level + 1;
    tot = n;
    shotsLeft = n + 3 + (level > 2 ? 0 : 1);
    cue = { x: W / 2, y: H - 90, vx: 0, vy: 0, n: 0, in: false };
    balls = [];
    for (var i = 1; i <= n; i++) {
      var b = { x: -99, y: -99, vx: 0, vy: 0, n: i, in: false };
      place(b, M + 50, H - 150);
      balls.push(b);
    }
    next = 1; aim = -Math.PI / 2; power = 0.55; msg = ''; state = 'aim';
    hud();
  }
  function startGame() {
    level = 1; score = 0;
    setup();
    show($('intro'), false); show($('result'), false);
  }
  function endGame(win) {
    state = 'over';
    $('rTitle').textContent = win ? '🎉 全クリア!' : '😵 打数ぎれ…';
    $('rText').innerHTML = win ? 'LEVEL 4 までクリア!<br>スコア ' + score + ' 点' : 'LEVEL ' + level + ' で終了。<br>スコア ' + score + ' 点';
    show($('result'), true);
  }

  function shoot() {
    if (state !== 'aim') return;
    var sp = 3 + power * 15;
    cue.vx = Math.cos(aim) * sp; cue.vy = Math.sin(aim) * sp;
    shotsLeft--; state = 'moving'; msg = ''; hud();
  }

  function pot(b) {
    b.in = true; b.vx = b.vy = 0;
    if (b === cue) { msg = '白い玉が落ちた…'; return; }
    if (b.n === next) {
      next++; score += 100 + shotsLeft * 10; msg = '✨ ナイス!';
    } else {
      msg = '順番がちがう!もどされた';
    }
  }

  function step() {
    var all = balls.concat([cue]), i, j, b;
    for (i = 0; i < all.length; i++) {
      b = all[i]; if (b.in) continue;
      b.x += b.vx; b.y += b.vy;
      if (b.x < M + R) { b.x = M + R; b.vx = Math.abs(b.vx) * 0.9; }
      if (b.x > W - M - R) { b.x = W - M - R; b.vx = -Math.abs(b.vx) * 0.9; }
      if (b.y < M + R) { b.y = M + R; b.vy = Math.abs(b.vy) * 0.9; }
      if (b.y > H - M - R) { b.y = H - M - R; b.vy = -Math.abs(b.vy) * 0.9; }
      b.vx *= 0.992; b.vy *= 0.992;
      if (Math.hypot(b.vx, b.vy) < 0.04) { b.vx = 0; b.vy = 0; }
      for (j = 0; j < pockets.length; j++) {
        if (Math.hypot(pockets[j][0] - b.x, pockets[j][1] - b.y) < PR) { pot(b); break; }
      }
    }
    for (i = 0; i < all.length; i++) for (j = i + 1; j < all.length; j++) {
      var a = all[i], c = all[j];
      if (a.in || c.in) continue;
      var dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < R * 2 && d > 0.001) {
        var nx = dx / d, ny = dy / d, ov = R * 2 - d;
        a.x -= nx * ov / 2; a.y -= ny * ov / 2; c.x += nx * ov / 2; c.y += ny * ov / 2;
        var rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel > 0) {
          a.vx -= rel * nx; a.vy -= rel * ny; c.vx += rel * nx; c.vy += rel * ny;
        }
      }
    }
  }
  function moving() {
    var all = balls.concat([cue]);
    for (var i = 0; i < all.length; i++) if (!all[i].in && (all[i].vx || all[i].vy)) return true;
    return false;
  }
  function settle() {
    var i, b;
    // wrong-order potted balls return; correct ones stay removed
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.in && b.n >= next) { b.in = false; place(b, M + 50, H - 150); }
    }
    if (cue.in) { cue.in = false; cue.x = W / 2; cue.y = H - 60; if (!free(cue.x, cue.y)) place(cue, H - 110, H - 40); }
    var remain = balls.filter(function (x) { return !x.in; }).length;
    if (remain === 0) {
      score += shotsLeft * 50;
      if (level >= MAXLV) { hud(); endGame(true); return; }
      level++; setup(); msg = '🎊 LEVEL UP!'; hud(); return;
    }
    if (shotsLeft <= 0) { hud(); endGame(false); return; }
    state = 'aim'; hud();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f7a4a'; ctx.fillRect(M - 6, M - 6, W - 2 * M + 12, H - 2 * M + 12);
    ctx.fillStyle = '#111';
    pockets.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], PR, 0, 7); ctx.fill(); });
    var i, b;
    for (i = 0; i < balls.length; i++) {
      b = balls[i]; if (b.in) continue;
      ctx.fillStyle = COLORS[b.n]; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7); ctx.fill();
      if (b.n === next) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.n, b.x, b.y + 0.5);
    }
    if (!cue.in) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cue.x, cue.y, R, 0, 7); ctx.fill(); }
    if (state === 'aim') {
      var len = 40 + power * 120;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(cue.x + Math.cos(aim) * len * 2, cue.y + Math.sin(aim) * len * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cue.x - Math.cos(aim) * (R + 4), cue.y - Math.sin(aim) * (R + 4));
      ctx.lineTo(cue.x - Math.cos(aim) * (R + 4 + len * 0.6), cue.y - Math.sin(aim) * (R + 4 + len * 0.6)); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('パワー ' + Math.round(power * 100) + '%', 12, H - 6);
    }
  }

  function loop() {
    if (state === 'moving') {
      for (var k = 0; k < 2; k++) step();
      if (!moving()) settle(); else hud();
    }
    draw();
    requestAnimationFrame(loop);
  }

  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  cv.addEventListener('pointerdown', function (e) {
    if (state !== 'aim') return;
    e.preventDefault();
    drag = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    upd(pos(e));
  });
  cv.addEventListener('pointermove', function (e) { if (drag) upd(pos(e)); });
  function upd(p) {
    var dx = cue.x - p.x, dy = cue.y - p.y, d = Math.hypot(dx, dy);
    if (d > 6) { aim = Math.atan2(dy, dx); power = Math.min(1, d / 140); if (power < 0.1) power = 0.1; }
  }
  function release() {
    if (!drag) return; drag = false;
    shoot();
  }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', function () { drag = false; });

  function turn(d) { if (state === 'aim') aim += d; }
  var hold = null;
  function bindHold(id, d) {
    var el = $(id);
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault(); turn(d); clearInterval(hold); hold = setInterval(function () { turn(d); }, 40);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      el.addEventListener(ev, function () { clearInterval(hold); });
    });
  }
  bindHold('leftBtn', -0.02); bindHold('rightBtn', 0.02);
  $('shootBtn').addEventListener('click', shoot);
  document.addEventListener('keydown', function (e) {
    if (state !== 'aim') return;
    if (e.key === 'ArrowLeft') { turn(-0.04); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { turn(0.04); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { power = Math.min(1, power + 0.04); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { power = Math.max(0.1, power - 0.04); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); shoot(); }
  });
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);

  level = 1; score = 0; state = 'intro'; shotsLeft = 0; next = 1; balls = []; cue = { x: W / 2, y: H - 90, in: false };
  loop();
})();
