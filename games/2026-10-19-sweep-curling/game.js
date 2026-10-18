(function () {
  'use strict';
  var W = 360, H = 560;
  var HOME = { x: 180, y: 120 };
  var R1 = 18, R2 = 44, R3 = 70;      // まとの半径(3点/2点/1点)
  var SR = 14;                          // ストーン半径
  var START = { x: 180, y: 505 };
  var HOG_Y = 400;                      // ここまで届かないとショート
  var BACK_Y = 22;                      // これより奥はアウト
  var ENDS = 3, THROWS = 4;
  var DECEL = 60, DECEL_SWEEP = 20;
  var SWEEP_COST = 7, SWEEP_TIME = 0.45;
  var MAX_SPEED = 330;
  var STORE = 'sweep-curling-best';

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var introOv = $('introOv'), endOv = $('endOv'), overOv = $('overOv');
  var sweepBtn = $('sweepBtn');

  var state = 'intro';   // intro | aim | slide | endres | over
  var stones, cur, endNo, throwsLeft, total, endScores, meter, sweepT, toast, toastT;
  var drag = null;       // {px,py}
  var kAngle = 0, kPower = 0.6;
  var sparks = [], last = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function newEnd() {
    stones = [];
    var n = endNo + 1;           // 2,3,4個
    var tries = 0;
    while (stones.length < n && tries++ < 300) {
      var s = { x: rand(70, 290), y: rand(70, 230), vx: 0, vy: 0, team: 'cpu', alive: true };
      var ok = true;
      for (var i = 0; i < stones.length; i++) if (dist(s, stones[i]) < SR * 2 + 12) ok = false;
      if (dist(s, HOME) < 12) ok = false;
      if (ok) stones.push(s);
    }
    throwsLeft = THROWS;
    kAngle = 0; kPower = 0.6;
    prepareStone();
    updateHud();
  }

  function prepareStone() {
    cur = { x: START.x, y: START.y, vx: 0, vy: 0, team: 'me', alive: true };
    stones.push(cur);
    state = 'aim';
    sweepBtn.disabled = true;
  }

  function startGame() {
    endNo = 0; total = 0; endScores = [];
    toast = ''; toastT = 0; sparks = [];
    introOv.classList.add('hidden');
    endOv.classList.add('hidden');
    overOv.classList.add('hidden');
    newEnd();
  }

  function updateHud() {
    $('hudEnd').textContent = 'エンド ' + (endNo + 1) + '/' + ENDS;
    $('hudLeft').textContent = 'のこり ' + throwsLeft + '投';
    $('hudScore').textContent = '合計 ' + total + '点';
  }

  function say(t) { toast = t; toastT = 1.4; }

  function launch(vx, vy) {
    cur.vx = vx; cur.vy = vy;
    throwsLeft--;
    meter = 100; sweepT = 0;
    state = 'slide';
    sweepBtn.disabled = false;
    drag = null;
    updateHud();
  }

  function keyThrow() {
    var sp = (0.25 + kPower * 0.75) * MAX_SPEED;
    launch(Math.sin(kAngle) * sp, -Math.cos(kAngle) * sp);
  }

  function sweep() {
    if (state !== 'slide' || meter < SWEEP_COST) return;
    meter -= SWEEP_COST;
    sweepT = SWEEP_TIME;
  }

  // ---- 入力 ----
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  cv.addEventListener('pointerdown', function (e) {
    var p = pos(e);
    if (state === 'slide') { sweep(); return; }
    if (state === 'aim' && Math.hypot(p.x - cur.x, p.y - cur.y) < 70) {
      drag = { px: p.x, py: p.y };
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = pos(e); drag.px = p.x; drag.py = p.y;
  });
  function release() {
    if (!drag || state !== 'aim') { drag = null; return; }
    var dx = cur.x - drag.px, dy = cur.y - drag.py;
    var d = Math.hypot(dx, dy);
    if (d < 22 || dy >= 0) { drag = null; return; }
    var sp = Math.min(MAX_SPEED, d * 2.6);
    launch(dx / d * sp, dy / d * sp);
  }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', function () { drag = null; });

  sweepBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); sweep(); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state === 'aim') { e.preventDefault(); keyThrow(); }
      else if (state === 'slide') { e.preventDefault(); if (!e.repeat) sweep(); }
      return;
    }
    if (state !== 'aim') return;
    if (e.code === 'ArrowLeft')  { kAngle = Math.max(-0.7, kAngle - 0.04); e.preventDefault(); }
    if (e.code === 'ArrowRight') { kAngle = Math.min(0.7, kAngle + 0.04); e.preventDefault(); }
    if (e.code === 'ArrowUp')    { kPower = Math.min(1, kPower + 0.04); e.preventDefault(); }
    if (e.code === 'ArrowDown')  { kPower = Math.max(0, kPower - 0.04); e.preventDefault(); }
  });

  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);
  $('nextBtn').addEventListener('click', function () {
    endOv.classList.add('hidden');
    endNo++;
    newEnd();
  });

  // ---- 物理 ----
  function step(dt) {
    var moving = false, i, j, s;
    for (i = 0; i < stones.length; i++) {
      s = stones[i];
      if (!s.alive) continue;
      var sp = Math.hypot(s.vx, s.vy);
      if (sp > 0) {
        var a = (s === cur && sweepT > 0) ? DECEL_SWEEP : DECEL;
        var ns = Math.max(0, sp - a * dt);
        if (ns < 3) ns = 0;
        s.vx *= ns / sp; s.vy *= ns / sp;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (ns > 0) moving = true;
        if (s === cur && sweepT > 0 && Math.random() < 0.8)
          sparks.push({ x: s.x + rand(-10, 10), y: s.y + rand(10, 24), t: 0.4 });
      }
      if (s.x < SR) { s.x = SR; s.vx = Math.abs(s.vx) * 0.6; }
      if (s.x > W - SR) { s.x = W - SR; s.vx = -Math.abs(s.vx) * 0.6; }
      if (s.y < BACK_Y) { s.alive = false; if (s.team === 'me') say('バックラインアウト…'); }
      if (s.y > H - SR) { s.y = H - SR; s.vy = -Math.abs(s.vy) * 0.6; }
    }
    // 衝突
    for (i = 0; i < stones.length; i++) for (j = i + 1; j < stones.length; j++) {
      var p = stones[i], q = stones[j];
      if (!p.alive || !q.alive) continue;
      var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d >= SR * 2 || d === 0) continue;
      var nx = dx / d, ny = dy / d, ov = SR * 2 - d;
      p.x -= nx * ov / 2; p.y -= ny * ov / 2; q.x += nx * ov / 2; q.y += ny * ov / 2;
      var rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (rv < 0) {
        var jimp = -(1 + 0.9) * rv / 2;
        p.vx -= jimp * nx; p.vy -= jimp * ny; q.vx += jimp * nx; q.vy += jimp * ny;
        moving = true;
      }
    }
    return moving;
  }

  function houseScore() {
    var pts = 0, bad = 0;
    stones.forEach(function (s) {
      if (!s.alive) return;
      var d = dist(s, HOME);
      if (s.team === 'me') pts += d <= R1 ? 3 : d <= R2 ? 2 : d <= R3 ? 1 : 0;
      else if (d <= R3) bad++;
    });
    return { pts: pts, bad: bad, net: Math.max(0, pts - bad) };
  }

  function settled() {
    if (cur.alive && cur.y > HOG_Y) { cur.alive = false; say('ショート!とどかなかった'); }
    sweepBtn.disabled = true;
    sweepT = 0;
    var sc = houseScore();
    if (cur.alive) {
      var d = dist(cur, HOME);
      if (d <= R1) say('ナイス!ど真ん中!');
      else if (d <= R3) say('まとの中!');
      else say('まとの外…');
    }
    if (throwsLeft > 0) {
      updateHud();
      prepareStone();
    } else {
      endScores.push(sc.net);
      total += sc.net;
      updateHud();
      state = 'endres';
      setTimeout(showEnd, 900);
    }
  }

  function showEnd() {
    var sc = houseScore();
    var last = endNo === ENDS - 1;
    $('endTitle').textContent = 'エンド ' + (endNo + 1) + ' おわり';
    $('endBody').innerHTML = '自分のストーン: ' + sc.pts + '点<br>まとの中の灰色ストーン: -' + sc.bad + '点<br><b>このエンド ' + sc.net + '点</b><br>合計 ' + total + '点';
    $('nextBtn').textContent = last ? 'けっかを見る' : 'つぎのエンドへ';
    if (last) {
      $('nextBtn').onclick = function () { endOv.classList.add('hidden'); showFinal(); };
    } else {
      $('nextBtn').onclick = null;
    }
    endOv.classList.remove('hidden');
  }

  function showFinal() {
    state = 'over';
    var best = 0;
    try { best = parseInt(localStorage.getItem(STORE), 10) || 0; } catch (_) {}
    var isNew = total > best;
    if (isNew) { try { localStorage.setItem(STORE, String(total)); } catch (_) {} best = total; }
    var rank = total >= 20 ? '🏆 カーリングの達人!' : total >= 14 ? '🥇 ナイスストーン!' : total >= 8 ? '🥈 いい感じ!' : '🥉 次はもっとゴシゴシ!';
    $('finalScore').textContent = total + '点';
    $('finalRank').textContent = rank + '(各エンド: ' + endScores.join(' / ') + ')';
    $('finalBest').textContent = (isNew ? '🎉 ベスト更新! ' : '') + 'ベスト: ' + best + '点';
    overOv.classList.remove('hidden');
  }

  // ---- 描画 ----
  function draw() {
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#eaf8ff'); g.addColorStop(1, '#cfeaf9');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 氷のすじ
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    for (var k = 0; k < 8; k++) { ctx.beginPath(); ctx.moveTo(20 + k * 45, 0); ctx.lineTo(20 + k * 45, H); ctx.stroke(); }
    // まと
    [[R3, '#3b82d6'], [R2, '#ffffff'], [R1, '#e8454f']].forEach(function (r) {
      ctx.beginPath(); ctx.arc(HOME.x, HOME.y, r[0], 0, 7); ctx.fillStyle = r[1]; ctx.fill();
    });
    ctx.beginPath(); ctx.arc(HOME.x, HOME.y, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = 'rgba(18,48,90,.6)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('3', HOME.x, HOME.y + 4); ctx.fillText('2', HOME.x + 31, HOME.y + 4); ctx.fillText('1', HOME.x + 57, HOME.y + 4);
    // ホッグライン
    ctx.strokeStyle = '#e8454f'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, HOG_Y); ctx.lineTo(W, HOG_Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,69,79,.8)'; ctx.fillText('ここまでとどかないとショート', W / 2, HOG_Y + 16);
    // きらきら
    sparks.forEach(function (s) { ctx.fillStyle = 'rgba(255,255,255,' + (s.t * 2) + ')'; ctx.fillRect(s.x, s.y, 3, 3); });
    // ストーン
    stones.forEach(function (s) { if (s.alive) drawStone(s); });
    // 狙い線
    if (state === 'aim') {
      var tx, ty, pw;
      if (drag) {
        var dx = cur.x - drag.px, dy = cur.y - drag.py, d = Math.hypot(dx, dy) || 1;
        pw = Math.min(1, d * 2.6 / MAX_SPEED);
        tx = dx / d; ty = dy / d;
        if (dy >= 0) { tx = 0; ty = 0; }
        ctx.strokeStyle = 'rgba(18,48,90,.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(drag.px, drag.py); ctx.stroke();
      } else {
        pw = 0.25 + kPower * 0.75;
        tx = Math.sin(kAngle); ty = -Math.cos(kAngle);
      }
      if (tx || ty) {
        var len = 40 + pw * 150;
        ctx.strokeStyle = '#12305a'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(cur.x + tx * len, cur.y + ty * len); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#12305a'; ctx.fillRect(14, H - 22, 100, 10);
        ctx.fillStyle = '#ffc83d'; ctx.fillRect(15, H - 21, 98 * Math.min(1, pw), 8);
        ctx.fillStyle = '#12305a'; ctx.textAlign = 'left'; ctx.fillText('つよさ', 120, H - 13);
      }
      ctx.fillStyle = '#12305a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('↓ うしろに引っぱってなげる', START.x, H - 30);
    }
    // ゲージ
    if (state === 'slide') {
      ctx.fillStyle = '#12305a'; ctx.fillRect(14, H - 24, 140, 12);
      ctx.fillStyle = meter >= SWEEP_COST ? '#e8454f' : '#888'; ctx.fillRect(15, H - 23, 138 * meter / 100, 10);
      ctx.fillStyle = '#12305a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('ゴシゴシゲージ', 162, H - 13);
    }
    if (toastT > 0) {
      ctx.globalAlpha = Math.min(1, toastT * 2);
      ctx.fillStyle = 'rgba(18,48,90,.88)'; ctx.fillRect(40, 250, 280, 44);
      ctx.fillStyle = '#ffc83d'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(toast, W / 2, 278); ctx.globalAlpha = 1;
    }
  }

  function drawStone(s) {
    var me = s.team === 'me';
    ctx.beginPath(); ctx.arc(s.x + 2, s.y + 3, SR, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, SR, 0, 7); ctx.fillStyle = me ? '#e8454f' : '#8a8f98'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = me ? '#7a1820' : '#4a4f58'; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, SR - 5, 0, 7); ctx.fillStyle = me ? '#ff8a90' : '#c4c8cf'; ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(s.x - 5, s.y - 1.5, 10, 3);
  }

  function frame(t) {
    var dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    if (state === 'slide') {
      var sub = 4, moving = false;
      for (var i = 0; i < sub; i++) moving = step(dt / sub) || moving;
      if (sweepT > 0) sweepT -= dt;
      if (state === 'slide' && !moving) settled();
    }
    sparks.forEach(function (s) { s.t -= dt; });
    sparks = sparks.filter(function (s) { return s.t > 0; });
    if (toastT > 0) toastT -= dt;
    if (stones) draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
