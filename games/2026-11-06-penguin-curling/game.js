(() => {
  'use strict';
  const W = 360, H = 520, R = 14, CX = 180, CY = 110, SX = 180, SY = 460;
  const RINGS = [[20, 10], [45, 5], [75, 3]];
  const MAXV = 600, SHOTS = 6, CLEAR = 25;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const elInfo = $('info'), elShots = $('shots'), elScore = $('score');
  let stones, phase, shotsLeft, cur, drag, aimAngle, power, powDir, charging, sweep, last, raf, running = false;

  function newGame() {
    stones = [];
    const n = 3;
    for (let t = 0; stones.length < n && t < 500; t++) {
      const x = 70 + Math.random() * 220, y = 150 + Math.random() * 180;
      if (stones.every(s => Math.hypot(s.x - x, s.y - y) > R * 3)) stones.push({ x, y, vx: 0, vy: 0, mine: false });
    }
    shotsLeft = SHOTS; phase = 'aim'; drag = null; aimAngle = 0; power = 0; powDir = 1; charging = false; sweep = 0;
    cur = null; spawn(); hud();
    elInfo.textContent = '石を下へ引っぱってはなそう';
  }
  function spawn() { cur = { x: SX, y: SY, vx: 0, vy: 0, mine: true }; stones.push(cur); }
  function pts(s) {
    const d = Math.hypot(s.x - CX, s.y - CY);
    for (const [r, p] of RINGS) if (d <= r + R * 0.5) return p;
    return 0;
  }
  function score() {
    let t = 0;
    for (const s of stones) { const p = pts(s); if (p) t += s.mine ? p : -3; }
    return t;
  }
  function hud() {
    elShots.textContent = 'のこり ' + '🥌'.repeat(shotsLeft + (phase === 'aim' ? 0 : 0)) ;
    elScore.textContent = score() + '点';
  }
  function launch(vx, vy) {
    cur.vx = vx; cur.vy = vy; phase = 'slide'; sweep = 0; shotsLeft--; drag = null; charging = false;
    elInfo.textContent = 'ブラシ連打で のばせ!'; hud();
  }
  function doSweep() { if (phase === 'slide') sweep = Math.min(1, sweep + 0.35); }

  function step(dt) {
    if (phase === 'aim' && charging) {
      power += powDir * dt * 1.4;
      if (power >= 1) { power = 1; powDir = -1; } else if (power <= 0.05) { power = 0.05; powDir = 1; }
    }
    if (phase !== 'slide') return;
    sweep = Math.max(0, sweep - dt * 1.2);
    const fr = 150 * (1 - 0.6 * sweep);
    for (const s of stones) {
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - fr * dt);
        s.vx *= ns / sp; s.vy *= ns / sp;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (ns < 6) { s.vx = s.vy = 0; }
      }
    }
    for (let i = 0; i < stones.length; i++) for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i], b = stones[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < R * 2) {
        const nx = dx / d, ny = dy / d, ov = R * 2 - d;
        a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { const k = -rv * 0.95; a.vx -= nx * k; a.vy -= ny * k; b.vx += nx * k; b.vy += ny * k; }
      }
    }
    stones = stones.filter(s => s.x > R && s.x < W - R && s.y > -R);
    // 下に戻りすぎたものも除外
    stones = stones.filter(s => s.y < H + R);
    if (!stones.includes(cur) || stones.every(s => s.vx === 0 && s.vy === 0)) settle();
    hud();
  }
  function settle() {
    if (shotsLeft > 0) { phase = 'aim'; spawn(); elInfo.textContent = 'つぎの1投!'; hud(); }
    else finish();
  }
  function finish() {
    phase = 'over'; running = false;
    const sc = score(), ok = sc >= CLEAR;
    $('rTitle').textContent = ok ? '🏆 クリア!' : '🧊 ざんねん…';
    $('rText').innerHTML = '合計 <b>' + sc + '点</b>(クリアは ' + CLEAR + '点)<br>' +
      (sc >= 30 ? 'パーフェクト級!ペンギンたちも大よろこび🐧' : ok ? 'ナイスカーリング!もっと高得点をねらえる?' : 'あと少し!ブラシと力かげんがカギだよ');
    $('result').classList.remove('hidden');
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8f7ff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#9ac9e6'; ctx.lineWidth = 4; ctx.strokeRect(10, 0, W - 20, H);
    // house
    [[75, '#4a90d9'], [45, '#ffffff'], [20, '#e0524a']].forEach(([r, c]) => { ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.fillStyle = c; ctx.fill(); });
    ctx.beginPath(); ctx.arc(CX, CY, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#bcdcef'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 410); ctx.lineTo(W - 10, 410); ctx.stroke();
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#6a8fa8'; ctx.fillText('10', CX - 7, CY + 4); ctx.fillText('5', CX + 28, CY + 4); ctx.fillText('3', CX + 58, CY + 4);
    for (const s of stones) {
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7);
      ctx.fillStyle = s.mine ? '#2f6fe0' : '#d84a4a'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#f2f2f2'; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.fillStyle = '#ddd'; ctx.fill();
    }
    if (phase === 'aim' && cur) {
      let ax, ay, p;
      if (drag) { ax = SX - drag.x; ay = SY - drag.y; p = Math.min(1, Math.hypot(ax, ay) / 140); }
      else { ax = Math.sin(aimAngle); ay = -Math.cos(aimAngle); p = charging ? power : 0.3; }
      const len = Math.hypot(ax, ay) || 1; ax /= len; ay /= len;
      if (ay < 0) {
        ctx.setLineDash([6, 6]); ctx.strokeStyle = '#2f6fe0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(cur.x + ax * (40 + 200 * p), cur.y + ay * (40 + 200 * p)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = '#2a4b66'; ctx.fillRect(20, H - 18, 120, 8);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(20, H - 18, 120 * p, 8);
      ctx.font = '22px sans-serif'; ctx.fillText('🐧', SX + 30, SY + 8);
    }
    if (phase === 'slide') {
      ctx.fillStyle = '#2a4b66'; ctx.fillRect(20, H - 18, 120, 8);
      ctx.fillStyle = '#6ad0ff'; ctx.fillRect(20, H - 18, 120 * sweep, 8);
      if (sweep > 0.1 && cur) { ctx.font = '20px sans-serif'; ctx.fillText('🧹', cur.x - 10, cur.y - 20); }
    }
  }
  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016); last = t;
    for (let i = 0; i < 2; i++) step(dt / 2);
    draw(); raf = requestAnimationFrame(loop);
  }
  function begin() {
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    newGame(); running = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function pos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'aim' || !running) return;
    const p = pos(e);
    if (Math.hypot(p.x - SX, p.y - SY) < 70) { drag = p; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => { if (drag) drag = pos(e); });
  const release = () => {
    if (!drag) return;
    const ax = SX - drag.x, ay = SY - drag.y, d = Math.hypot(ax, ay);
    if (d < 15 || ay >= 0) { drag = null; return; }
    const p = Math.min(1, d / 140);
    launch(ax / d * MAXV * p, ay / d * MAXV * p);
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', () => { drag = null; });
  const sw = $('sweep');
  sw.addEventListener('pointerdown', e => { e.preventDefault(); doSweep(); });
  sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });

  window.addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'ArrowLeft') aimAngle = Math.max(-0.5, aimAngle - 0.04);
    else if (e.key === 'ArrowRight') aimAngle = Math.min(0.5, aimAngle + 0.04);
    else if (e.key === 'b' || e.key === 'B') doSweep();
    else if (e.key === ' ' && phase === 'aim' && !charging && !e.repeat) { charging = true; power = 0.05; powDir = 1; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === ' ' && charging && phase === 'aim') {
      const v = MAXV * power; launch(Math.sin(aimAngle) * v, -Math.cos(aimAngle) * v);
    }
  });
  $('startBtn').addEventListener('click', begin);
  $('againBtn').addEventListener('click', begin);
})();
