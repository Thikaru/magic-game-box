(function () {
  'use strict';
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  var $ = function (id) { return document.getElementById(id); };

  var TIME_LIMIT = 75, MAX_LIVES = 3;
  var TRACK = { x: 250, y: 90, w: 64, h: 400 };
  var FISH = [
    { e: '👞', n: 'ながぐつ', pts: 5, zone: 160, sp: 70, gain: 32 },
    { e: '🐟', n: 'こざかな', pts: 10, zone: 140, sp: 110, gain: 28 },
    { e: '🐠', n: 'ねったいぎょ', pts: 20, zone: 118, sp: 150, gain: 26 },
    { e: '🐡', n: 'ふぐ', pts: 35, zone: 100, sp: 195, gain: 24 },
    { e: '🦑', n: 'イカ', pts: 55, zone: 88, sp: 235, gain: 22 },
    { e: '🐋', n: 'ぬし', pts: 100, zone: 76, sp: 280, gain: 20 }
  ];

  var st = {};
  var holding = false, last = 0, raf = 0, running = false;
  var best = 0;
  try { best = parseInt(localStorage.getItem('tsuriBest') || '0', 10) || 0; } catch (e) {}

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function reset() {
    st = {
      phase: 'wait', t: TIME_LIMIT, lives: MAX_LIVES, score: 0, caught: 0,
      timer: rnd(1.5, 3.5), biteLeft: 0, msg: '', msgT: 0, fish: null,
      zy: TRACK.h / 2, zv: 0, fy: TRACK.h / 2, ty: TRACK.h / 2, tt: 0, prog: 30,
      bob: 0, list: []
    };
  }

  function say(m, sec) { st.msg = m; st.msgT = sec || 1.2; }

  function pickFish() {
    var el = TIME_LIMIT - st.t; // 経過秒
    var w = [14, 30, 26, 16 + el / 6, 8 + el / 5, 2 + el / 12];
    var sum = 0, i;
    for (i = 0; i < w.length; i++) sum += w[i];
    var r = Math.random() * sum;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return FISH[i]; }
    return FISH[1];
  }

  function press() {
    if (!running) return;
    if (st.phase === 'wait') {
      st.timer = rnd(2, 3.5); st.t -= 3; say('はやすぎ!逃げた… -3秒', 1.2);
    } else if (st.phase === 'bite') {
      st.phase = 'reel'; st.fish = st.fish || pickFish();
      st.zy = TRACK.h / 2; st.zv = 0; st.fy = TRACK.h / 2; st.ty = st.fy; st.tt = 0; st.prog = 30;
      say('ヒット!', 0.8);
    }
  }
  function setHold(v) {
    holding = v;
    $('holdBtn').classList.toggle('on', v);
    if (v) press();
  }

  function update(dt) {
    if (st.msgT > 0) st.msgT -= dt;
    st.bob += dt;
    st.t -= dt;
    if (st.t <= 0 || st.lives <= 0) { end(); return; }
    var f = st.fish;
    if (st.phase === 'wait') {
      st.timer -= dt;
      if (st.timer <= 0) { st.phase = 'bite'; st.fish = pickFish(); st.biteLeft = 0.9; }
    } else if (st.phase === 'bite') {
      st.biteLeft -= dt;
      if (st.biteLeft <= 0) {
        st.phase = 'wait'; st.fish = null; st.timer = rnd(1.5, 3); say('逃げられた…', 1);
      }
    } else if (st.phase === 'reel') {
      var zh = f.zone, maxY = TRACK.h - zh;
      st.zv += (holding ? -900 : 700) * dt;
      if (st.zv > 360) st.zv = 360;
      if (st.zv < -360) st.zv = -360;
      st.zy += st.zv * dt;
      if (st.zy < 0) { st.zy = 0; st.zv = 0; }
      if (st.zy > maxY) { st.zy = maxY; st.zv = -st.zv * 0.3; }
      st.tt -= dt;
      if (st.tt <= 0) { st.ty = rnd(10, TRACK.h - 40); st.tt = rnd(0.5, 1.3); }
      var d = st.ty - st.fy, step = f.sp * dt;
      st.fy += Math.abs(d) < step ? d : (d > 0 ? step : -step);
      var c = st.fy + 15;
      var inside = c >= st.zy && c <= st.zy + zh;
      st.prog += (inside ? f.gain : -17) * dt;
      if (st.prog >= 100) {
        st.score += f.pts; st.caught++; st.list.push(f.e);
        say(f.e + ' ' + f.n + ' ゲット! +' + f.pts, 1.4);
        st.phase = 'wait'; st.fish = null; st.timer = rnd(1.2, 3);
      } else if (st.prog <= 0) {
        st.lives--; say('にげられた…', 1.2);
        st.phase = 'wait'; st.fish = null; st.timer = rnd(1.5, 3);
      }
    }
  }

  function draw() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd3ff'); g.addColorStop(0.18, '#8fd3ff');
    g.addColorStop(0.18, '#1b73b8'); g.addColorStop(1, '#073560');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (var i = 0; i < 5; i++) {
      var wx = (i * 80 + st.bob * 20) % (W + 40) - 20;
      ctx.fillRect(wx, 94 + (i % 2) * 6, 30, 3);
    }
    // HUD
    ctx.fillStyle = '#073560'; ctx.font = 'bold 18px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('⏱ ' + Math.max(0, Math.ceil(st.t)) + 's', 10, 28);
    ctx.fillText('SCORE ' + st.score, 10, 56);
    ctx.textAlign = 'right';
    var hs = ''; for (i = 0; i < MAX_LIVES; i++) hs += i < st.lives ? '❤️' : '🖤';
    ctx.fillText(hs, W - 10, 28);
    ctx.font = '12px system-ui,sans-serif'; ctx.fillText('BEST ' + best, W - 10, 56);
    // 釣り人と糸
    ctx.textAlign = 'center'; ctx.font = '34px serif';
    ctx.fillText('🚣', 60, 80);
    var bx = 130, by = 170;
    var dip = 0;
    if (st.phase === 'bite') dip = 22 * Math.abs(Math.sin(st.bob * 30));
    if (st.phase === 'reel') dip = 30;
    by += dip + Math.sin(st.bob * 2) * 3;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(78, 66); ctx.lineTo(bx, by); ctx.stroke();
    ctx.font = '28px serif'; ctx.fillText('🔴', bx, by + 8);
    if (st.phase === 'bite') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui,sans-serif';
      ctx.fillText('いまだ!タップ!', 125, 250);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(40, 262, 170 * (st.biteLeft / 0.9), 8);
    }
    if (st.phase === 'wait') {
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '15px system-ui,sans-serif';
      ctx.fillText('あたりを待て…', 125, 250);
    }
    // 魚影
    if (st.fish && st.phase !== 'wait') {
      ctx.globalAlpha = st.phase === 'bite' ? 0.45 : 1; ctx.font = '40px serif';
      ctx.fillText(st.fish.e, 125 + Math.sin(st.bob * 5) * 8, 330);
      ctx.globalAlpha = 1;
    }
    // メッセージ
    if (st.msgT > 0) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#073560'; ctx.lineWidth = 4;
      ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.strokeText(st.msg, 125, 420); ctx.fillText(st.msg, 125, 420);
    }
    // リール筒
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(TRACK.x, TRACK.y, TRACK.w, TRACK.h);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.strokeRect(TRACK.x, TRACK.y, TRACK.w, TRACK.h);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(TRACK.x + TRACK.w + 6, TRACK.y, 14, TRACK.h);
    if (st.phase === 'reel') {
      var f = st.fish;
      ctx.fillStyle = 'rgba(80,220,120,.55)';
      ctx.fillRect(TRACK.x + 2, TRACK.y + st.zy, TRACK.w - 4, f.zone);
      ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = 2;
      ctx.strokeRect(TRACK.x + 2, TRACK.y + st.zy, TRACK.w - 4, f.zone);
      ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(f.e, TRACK.x + TRACK.w / 2, TRACK.y + st.fy + 28);
      var p = Math.max(0, Math.min(100, st.prog)) / 100;
      ctx.fillStyle = p < 0.3 ? '#ff6b6b' : '#ffd23f';
      ctx.fillRect(TRACK.x + TRACK.w + 6, TRACK.y + TRACK.h * (1 - p), 14, TRACK.h * p);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '13px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('リール', TRACK.x + TRACK.w / 2, TRACK.y + TRACK.h / 2);
    }
  }

  function loop(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    if (running) { draw(); raf = requestAnimationFrame(loop); }
  }

  function start() {
    reset(); holding = false;
    $('holdBtn').classList.remove('on');
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    running = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function end() {
    running = false; cancelAnimationFrame(raf); draw();
    var nb = st.score > best;
    if (nb) { best = st.score; try { localStorage.setItem('tsuriBest', String(best)); } catch (e) {} }
    $('resultTitle').textContent = st.lives <= 0 ? '😵 逃げられすぎ!' : '⏰ タイムアップ!';
    $('resultText').innerHTML = 'スコア <b>' + st.score + '</b>' + (nb ? ' 🎉ベスト更新!' : '') +
      '<br>つれた数 ' + st.caught + '<br>' + (st.list.join(' ') || '(なし)') + '<br>BEST ' + best;
    $('result').classList.remove('hidden');
  }

  var stage = document.querySelector('.stage');
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.overlay:not(.hidden)')) return;
    setHold(true);
  });
  window.addEventListener('pointerup', function () { setHold(false); });
  window.addEventListener('pointercancel', function () { setHold(false); });
  var hb = $('holdBtn');
  hb.addEventListener('pointerdown', function (e) { e.preventDefault(); setHold(true); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) setHold(true); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') setHold(false);
  });
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  reset(); draw();
})();
