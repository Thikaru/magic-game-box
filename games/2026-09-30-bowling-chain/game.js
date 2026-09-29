(() => {
  const W = 360, H = 560, BR = 10, PR = 9, BALL_Y = 525, STRIP_Y = 500, SPEED = 560;
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);

  let stage, score, balls, pins, R, bx, angle, phase, ball, timer, chain, gain, banner, rings, aiming;
  let running = false, last = 0;
  const keys = {};

  function comps(ps, r) {
    const seen = new Set(); let n = 0;
    ps.forEach((_, i) => {
      if (seen.has(i)) return;
      n++; const st = [i]; seen.add(i);
      while (st.length) {
        const a = ps[st.pop()];
        ps.forEach((b, j) => {
          if (!seen.has(j) && Math.hypot(a.x - b.x, a.y - b.y) <= r) { seen.add(j); st.push(j); }
        });
      }
    });
    return n;
  }

  function genStage() {
    R = Math.max(50, 80 - stage * 3);
    const count = Math.min(5 + stage, 14);
    const target = Math.min(1 + Math.floor((stage - 1) / 2), 3);
    let best = null;
    for (let t = 0; t < 400; t++) {
      const ps = [];
      let guard = 0;
      while (ps.length < count && guard++ < 500) {
        const x = 30 + Math.random() * (W - 60), y = 50 + Math.random() * 350;
        if (ps.every(p => Math.hypot(p.x - x, p.y - y) >= 30)) ps.push({ x, y, s: 0, t: 0 });
      }
      if (ps.length < count) continue;
      const c = comps(ps, R);
      if (c === target) { best = ps; break; }
      if (!best && c <= 3) best = ps;
    }
    if (!best) best = [{ x: 180, y: 200, s: 0, t: 0 }];
    pins = best;
    balls = Math.max(3, comps(pins, R));
    rings = [];
  }

  function startStage() {
    genStage();
    phase = 'aim'; ball = null; chain = 0; banner = null;
    updateHud();
  }

  function newGame() {
    stage = 1; score = 0; bx = W / 2; angle = 0; aiming = false;
    startStage();
  }

  function updateHud() {
    $('hStage').textContent = 'STAGE ' + stage;
    $('hBalls').textContent = '🎳 ×' + balls;
    $('hScore').textContent = 'SCORE ' + score;
  }

  function hitPin(p) {
    if (p.s !== 0) return;
    p.s = 1; p.t = 0.13;
    chain++;
    gain += 10 * chain;
    score += 10 * chain;
    rings.push({ x: p.x, y: p.y, t: 0 });
  }

  function fire() {
    if (phase !== 'aim') return;
    const a = angle;
    ball = { x: bx, y: BALL_Y, vx: Math.sin(a) * SPEED, vy: -Math.cos(a) * SPEED };
    balls--; chain = 0; gain = 0; phase = 'roll'; aiming = false;
    updateHud();
  }

  function update(dt) {
    if (phase === 'aim') {
      if (keys.ArrowLeft) angle -= dt * 1.1;
      if (keys.ArrowRight) angle += dt * 1.1;
      angle = Math.max(-1.35, Math.min(1.35, angle));
      if (keys.a || keys.A) bx -= dt * 200;
      if (keys.d || keys.D) bx += dt * 200;
      bx = Math.max(BR + 4, Math.min(W - BR - 4, bx));
    }
    if (phase === 'roll' && ball) {
      const steps = Math.ceil(SPEED * dt / 5);
      for (let i = 0; i < steps; i++) {
        ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
        if (ball.x < BR) { ball.x = 2 * BR - ball.x; ball.vx = -ball.vx; }
        if (ball.x > W - BR) { ball.x = 2 * (W - BR) - ball.x; ball.vx = -ball.vx; }
        pins.forEach(p => { if (p.s === 0 && Math.hypot(p.x - ball.x, p.y - ball.y) < BR + PR) hitPin(p); });
      }
      if (ball.y < -20) { ball = null; phase = 'settle'; }
    }
    pins.forEach(p => {
      if (p.s === 1) {
        p.t -= dt;
        if (p.t <= 0) {
          p.s = 2; p.t = 0;
          pins.forEach(q => { if (q.s === 0 && Math.hypot(p.x - q.x, p.y - q.y) <= R) hitPin(q); });
        }
      } else if (p.s === 2) p.t += dt;
    });
    rings.forEach(r => r.t += dt);
    rings = rings.filter(r => r.t < 0.4);
    if (phase === 'settle' && pins.every(p => p.s !== 1)) {
      updateHud();
      if (pins.every(p => p.s === 2)) {
        const bonus = balls * 50 + stage * 100;
        score += bonus;
        banner = 'STAGE CLEAR! +' + bonus;
        phase = 'clear'; timer = 1.4;
        updateHud();
      } else if (balls <= 0) {
        finish();
      } else phase = 'aim';
    }
    if (phase === 'clear') {
      timer -= dt;
      if (timer <= 0) { stage++; startStage(); }
    }
  }

  function finish() {
    phase = 'over'; running = false;
    const left = pins.filter(p => p.s !== 2).length;
    $('rTitle').textContent = 'ゲームオーバー';
    $('rText').innerHTML = 'STAGE ' + stage + ' で ピンが ' + left + ' 本のこりました<br>SCORE <b>' + score + '</b>';
    $('result').classList.remove('hidden');
  }

  function preview() {
    const pts = [[bx, BALL_Y]];
    let x = bx, y = BALL_Y, vx = Math.sin(angle), vy = -Math.cos(angle);
    for (let i = 0; i < 400; i++) {
      x += vx * 4; y += vy * 4;
      if (x < BR) { x = 2 * BR - x; vx = -vx; pts.push([x, y]); }
      if (x > W - BR) { x = 2 * (W - BR) - x; vx = -vx; pts.push([x, y]); }
      if (y < 0) break;
      if (pins.some(p => p.s === 0 && Math.hypot(p.x - x, p.y - y) < BR + PR)) break;
    }
    pts.push([x, y]);
    return pts;
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#b8842f'); g.addColorStop(1, '#e0ae55');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(90,55,10,.25)'; ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = '#1b1226'; ctx.fillRect(0, 0, 6, H); ctx.fillRect(W - 6, 0, 6, H);
    ctx.fillStyle = 'rgba(255,93,93,.35)'; ctx.fillRect(0, STRIP_Y, W, H - STRIP_Y);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('スタートライン', W / 2, H - 8);

    // link lines between standing pins within chain range
    ctx.strokeStyle = 'rgba(30,20,80,.35)'; ctx.lineWidth = 2; ctx.setLineDash([]);
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i], b = pins[j];
      if (a.s !== 2 && b.s !== 2 && Math.hypot(a.x - b.x, a.y - b.y) <= R) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    rings.forEach(r => {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 - r.t * 2) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, PR + (R - PR) * (r.t / 0.4), 0, 7); ctx.stroke();
    });
    pins.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.s === 2) {
        const k = Math.min(1, p.t / 0.35);
        ctx.globalAlpha = 0.35 * (1 - k) + 0.12;
        ctx.rotate(k * 1.2);
        ctx.scale(1 - 0.3 * k, 1 - 0.3 * k);
      }
      ctx.fillStyle = p.s === 1 ? '#ffe45c' : '#fff';
      ctx.beginPath(); ctx.arc(0, 0, PR, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d33'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, PR - 4, 0, 7); ctx.stroke();
      ctx.restore();
    });
    if (phase === 'aim') {
      const pts = preview();
      ctx.setLineDash([6, 6]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.setLineDash([]);
    }
    const b = ball || (phase === 'aim' ? { x: bx, y: BALL_Y } : null);
    if (b) {
      ctx.fillStyle = '#2b2bd0'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, 7); ctx.fill();
      ctx.fillStyle = '#8fa0ff'; ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3, 3, 0, 7); ctx.fill();
    }
    if (chain > 1 && phase !== 'aim') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.font = 'bold 22px sans-serif';
      ctx.strokeText(chain + ' CHAIN! +' + gain, W / 2, 34); ctx.fillText(chain + ' CHAIN! +' + gain, W / 2, 34);
    }
    if (banner && phase === 'clear') {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 240, W, 70);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(banner, W / 2, 285);
    }
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0); last = t;
    if (running) { update(dt); draw(); }
    requestAnimationFrame(loop);
  }

  function pos(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  }
  function aimTo(x, y) {
    if (y >= STRIP_Y) return;
    angle = Math.max(-1.35, Math.min(1.35, Math.atan2(x - bx, BALL_Y - y)));
  }
  cv.addEventListener('pointerdown', e => {
    if (!running || phase !== 'aim') return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (y >= STRIP_Y) { aiming = 'move'; bx = Math.max(BR + 4, Math.min(W - BR - 4, x)); }
    else { aiming = 'aim'; aimTo(x, y); }
  });
  cv.addEventListener('pointermove', e => {
    if (!aiming || phase !== 'aim') return;
    const [x, y] = pos(e);
    if (aiming === 'move') bx = Math.max(BR + 4, Math.min(W - BR - 4, x));
    else aimTo(x, y);
  });
  cv.addEventListener('pointerup', e => {
    if (aiming === 'aim' && phase === 'aim') {
      const [, y] = pos(e);
      if (y < STRIP_Y) fire();
    }
    aiming = false;
  });
  cv.addEventListener('pointercancel', () => { aiming = false; });
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === ' ' || e.key === 'Enter') && running) { e.preventDefault(); fire(); }
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  function begin() {
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    newGame(); running = true;
  }
  $('startBtn').addEventListener('click', begin);
  $('retryBtn').addEventListener('click', begin);

  newGame(); draw();
  requestAnimationFrame(loop);
})();
