(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height, BALL_Y = 360, GOAL = 9000, LIMIT = 60, WALL = 8;
  const R0 = 14, RMAX = 44;

  let objs, x, targetX, r, dist, timeLeft, slow, slowT, keys, running, last, rot, popups, hits, best = 0;

  function reset() {
    objs = []; x = W / 2; targetX = x; r = R0; dist = 0; timeLeft = LIMIT; slow = 1; slowT = 0;
    rot = 0; popups = []; hits = 0; keys = { l: false, r: false };
    let d = 350, n = 0;
    while (d < GOAL - 300) {
      n++;
      if (n % 5 === 0) {
        const gap = Math.max(54, 112 - d / 130 + Math.random() * 14);
        objs.push({ k: 'gate', d, gx: 60 + Math.random() * (W - 120), gap, done: false });
        d += 150;
      } else if (Math.random() < 0.3) {
        const cx = 40 + Math.random() * (W - 80);
        objs.push({ k: 'tree', d, x: cx, done: false });
        if (Math.random() < 0.6) objs.push({ k: 'tree', d: d + 20, x: Math.min(W - 30, cx + 60 + Math.random() * 40), done: false });
        d += 120;
      } else {
        const cx = 50 + Math.random() * (W - 100), dir = Math.random() < .5 ? -1 : 1;
        for (let i = 0; i < 4; i++) objs.push({ k: 'snow', d: d + i * 38, x: Math.max(30, Math.min(W - 30, cx + dir * i * 18)), done: false });
        d += 170;
      }
    }
    update(0);
  }

  function speed() { return (110 + r * 5.5) * slow; }
  function pop(t, px, py) { popups.push({ t, x: px, y: py, life: 0.8 }); }

  function update(dt) {
    if (keys.l) targetX -= 330 * dt;
    if (keys.r) targetX += 330 * dt;
    targetX = Math.max(WALL + r, Math.min(W - WALL - r, targetX));
    const dx = targetX - x, step = 380 * dt;
    x += Math.abs(dx) < step ? dx : Math.sign(dx) * step;
    x = Math.max(WALL + r, Math.min(W - WALL - r, x));
    if (slowT > 0) { slowT -= dt; if (slowT <= 0) slow = 1; }
    const v = speed();
    dist += v * dt; rot += v * dt / Math.max(r, 10);
    timeLeft -= dt;
    for (const o of objs) {
      if (o.done) continue;
      const rel = o.d - dist; // >0 ahead
      if (o.k === 'snow') {
        if (Math.abs(rel) < r + 12 && Math.hypot(x - o.x, rel) < r + 14) { o.done = true; r = Math.min(RMAX, r + 2.2); pop('+', o.x, BALL_Y - rel); }
      } else if (o.k === 'tree') {
        if (Math.abs(rel) < r + 16 && Math.hypot(x - o.x, rel) < r + 14) {
          o.done = true; r = Math.max(R0, r * 0.82); slow = 0.5; slowT = 0.8; hits++; pop('ドン!', o.x, BALL_Y - rel);
        }
      } else if (o.k === 'gate') {
        if (rel < 0 && rel > -12) {
          o.done = true;
          const lo = o.gx - o.gap / 2, hi = o.gx + o.gap / 2;
          if (x - r < lo || x + r > hi) {
            r = Math.max(R0, Math.min(r * 0.7, o.gap / 2 - 3)); slow = 0.4; slowT = 1.0; hits++;
            pop('ガツン!', x, BALL_Y - 40);
          } else pop('ナイス!', x, BALL_Y - 40);
        }
      }
    }
    popups.forEach(p => p.life -= dt);
    popups = popups.filter(p => p.life > 0);
    hud();
  }

  function hud() {
    $('hTime').textContent = 'のこり ' + Math.max(0, Math.ceil(timeLeft));
    $('hSize').textContent = 'おおきさ ' + Math.round(r);
    const pct = Math.min(100, dist / GOAL * 100);
    $('hDist').textContent = Math.floor(pct) + '%';
    $('bar').style.width = pct + '%';
  }

  function draw() {
    g.fillStyle = '#eaf6ff'; g.fillRect(0, 0, W, H);
    // slope stripes scrolling
    g.strokeStyle = '#d3ebfa'; g.lineWidth = 2;
    const off = dist % 60;
    for (let y = -60; y < H + 60; y += 60) { g.beginPath(); g.moveTo(0, y + off); g.lineTo(W, y + off + 14); g.stroke(); }
    // side walls (pine forest)
    g.fillStyle = '#b6d8ee'; g.fillRect(0, 0, WALL, H); g.fillRect(W - WALL, 0, WALL, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // goal line
    const gy = BALL_Y - (GOAL - dist);
    if (gy > -30 && gy < H + 30) {
      g.fillStyle = '#222';
      for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#fff' : '#222'; g.fillRect(i * 20, gy - 8, 20, 16); }
      g.font = '22px sans-serif'; g.fillStyle = '#c0392b'; g.fillText('GOAL', W / 2, gy - 22);
    }
    for (const o of objs) {
      if (o.done) continue;
      const y = BALL_Y - (o.d - dist);
      if (y < -50 || y > H + 50) continue;
      if (o.k === 'snow') { g.font = '26px sans-serif'; g.fillText('❄️', o.x, y); }
      else if (o.k === 'tree') { g.font = '34px sans-serif'; g.fillText('🌲', o.x, y); }
      else {
        const lo = o.gx - o.gap / 2, hi = o.gx + o.gap / 2;
        g.fillStyle = '#6b7280'; g.fillRect(0, y - 10, lo, 20); g.fillRect(hi, y - 10, W - hi, 20);
        g.fillStyle = '#4b5563'; g.fillRect(0, y + 4, lo, 6); g.fillRect(hi, y + 4, W - hi, 6);
        g.fillStyle = '#e74c3c'; g.fillRect(lo - 4, y - 10, 4, 20); g.fillRect(hi, y - 10, 4, 20);
      }
    }
    // ball shadow + ball
    g.fillStyle = 'rgba(0,40,80,.15)'; g.beginPath(); g.ellipse(x + 4, BALL_Y + r * 0.9, r, r * 0.35, 0, 0, 7); g.fill();
    const gr = g.createRadialGradient(x - r * .35, BALL_Y - r * .35, r * .1, x, BALL_Y, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#a9cfe8');
    g.fillStyle = gr; g.beginPath(); g.arc(x, BALL_Y, r, 0, 7); g.fill();
    g.strokeStyle = '#8fb8d4'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#7aa7c4';
    for (let i = 0; i < 3; i++) { const a = rot + i * 2.1; g.beginPath(); g.arc(x + Math.cos(a) * r * .5, BALL_Y + Math.sin(a) * r * .5, Math.max(2, r * .1), 0, 7); g.fill(); }
    g.font = Math.max(12, r * .9) + 'px sans-serif'; g.fillStyle = '#000'; g.fillText('•ᴗ•', x, BALL_Y - r * .05);
    // popups
    g.font = 'bold 18px sans-serif';
    for (const p of popups) { g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = '#c0392b'; g.fillText(p.t, p.x, p.y - (0.8 - p.life) * 40); }
    g.globalAlpha = 1;
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    update(dt);
    draw();
    if (dist >= GOAL) return finish(true);
    if (timeLeft <= 0) { timeLeft = 0; hud(); return finish(false); }
    requestAnimationFrame(loop);
  }

  function finish(win) {
    running = false;
    const pct = Math.min(100, Math.floor(dist / GOAL * 100));
    let score;
    if (win) score = 1000 + Math.round(timeLeft * 40) + Math.round(r * 10) - hits * 30;
    else score = pct * 8;
    best = Math.max(best, score);
    $('endTitle').textContent = win ? '🏁 ゴール!' : '⏰ タイムアップ…';
    $('endText').innerHTML = win
      ? `のこり ${timeLeft.toFixed(1)} 秒 / ゴール時の大きさ ${Math.round(r)} / ぶつかった ${hits} 回<br>スコア <b>${score}</b>(ベスト ${best})`
      : `${pct}% まで進んだよ。ぶつかった ${hits} 回<br>スコア <b>${score}</b>(ベスト ${best})<br>❄️をひろって加速しよう!`;
    $('ovEnd').classList.remove('hide');
  }

  function start() {
    $('ovStart').classList.add('hide'); $('ovEnd').classList.add('hide');
    reset(); draw();
    running = true; last = performance.now();
    requestAnimationFrame(loop);
  }

  function pointerX(e) {
    const rc = cv.getBoundingClientRect();
    return (e.clientX - rc.left) / rc.width * W;
  }
  let dragging = false;
  cv.addEventListener('pointerdown', e => { dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} if (running) targetX = pointerX(e); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (dragging && running) targetX = pointerX(e); });
  const up = () => { dragging = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys && (keys.l = true); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd') { keys && (keys.r = true); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys && (keys.l = false);
    if (e.key === 'ArrowRight' || e.key === 'd') keys && (keys.r = false);
  });
  $('btnStart').addEventListener('click', start);
  $('btnRetry').addEventListener('click', start);
  reset(); draw();
})();
