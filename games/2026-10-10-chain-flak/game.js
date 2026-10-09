(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, GROUND = H - 40;
  const $ = id => document.getElementById(id);
  const intro = $('intro'), over = $('over');
  const GOAL_TIME = 90; // 秒生き残ればクリア

  let balloons, shells, blasts, parts, texts, score, best, life, t, spawnT, fireCd, running, aim, maxChain, popped, keys, last;
  best = 0;
  aim = { x: W / 2, y: H / 2 };
  keys = {};

  function reset() {
    balloons = []; shells = []; blasts = []; parts = []; texts = [];
    score = 0; life = 5; t = 0; spawnT = 0.5; fireCd = 0; maxChain = 0; popped = 0;
    updateHud();
  }

  function updateHud() {
    $('hScore').textContent = 'スコア ' + score;
    $('hCombo').textContent = '最大連鎖 ' + maxChain;
    $('hLife').textContent = life > 0 ? '❤️'.repeat(life) : '💔';
  }

  function spawn() {
    const r = Math.random();
    const kind = r < 0.1 ? 'gold' : (r < 0.22 + Math.min(0.1, t / 600) ? 'bomb' : 'normal');
    const size = kind === 'gold' ? 20 : 16;
    balloons.push({
      x: 24 + Math.random() * (W - 48), y: -20,
      vy: (40 + Math.random() * 25) * (1 + t / 120), sway: Math.random() * 6, kind, r: size, dead: false,
      hue: Math.floor(Math.random() * 360)
    });
  }

  function fire(x, y) {
    if (!running || fireCd > 0) return;
    fireCd = 0.3;
    const sx = W / 2, sy = GROUND;
    const d = Math.hypot(x - sx, y - sy) || 1;
    const sp = 520;
    shells.push({ x: sx, y: sy, tx: x, ty: y, vx: (x - sx) / d * sp, vy: (y - sy) / d * sp, left: d });
    beep(300 + Math.random() * 40, 0.08, 'triangle', 0.05);
  }

  function explode(x, y, rad, chain, owner) {
    blasts.push({ x, y, rad, age: 0, life: 0.45, chain, owner });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * rad * 2.2;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, a: 1, c: `hsl(${Math.random() * 360},90%,65%)` });
    }
    beep(160 + chain * 40, 0.12, 'sawtooth', 0.04);
  }

  // 連鎖の数は「同じ最初の花火から何個割れたか」を chain として引き継ぐ
  function popBalloon(b, blast) {
    b.dead = true;
    popped++;
    const chain = blast.chain + 1;
    if (b.kind === 'bomb') {
      life--; texts.push({ x: b.x, y: b.y, s: '💥-1', a: 1, c: '#ff6b6b' });
      explode(b.x, b.y, 38, blast.chain, blast.owner);
      if (life <= 0) finish(false);
    } else {
      const base = b.kind === 'gold' ? 50 : 10;
      const pts = base * chain;
      score += pts;
      texts.push({ x: b.x, y: b.y, s: '+' + pts, a: 1, c: b.kind === 'gold' ? '#ffd23f' : '#fff' });
      explode(b.x, b.y, b.kind === 'gold' ? 80 : 46, chain, blast.owner);
      const o = blast.owner;
      o.count = (o.count || 0) + 1;
      if (o.count > maxChain) maxChain = o.count;
      if (o.count >= 3 && o.count % 3 === 0) texts.push({ x: b.x, y: b.y - 18, s: o.count + '連鎖!', a: 1.4, c: '#4dd8e6' });
    }
    updateHud();
  }

  function update(dt) {
    t += dt;
    if (fireCd > 0) fireCd -= dt;
    // キーボード照準
    const sp = 260 * dt;
    if (keys.ArrowLeft) aim.x = Math.max(0, aim.x - sp);
    if (keys.ArrowRight) aim.x = Math.min(W, aim.x + sp);
    if (keys.ArrowUp) aim.y = Math.max(0, aim.y - sp);
    if (keys.ArrowDown) aim.y = Math.min(GROUND, aim.y + sp);

    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = Math.max(0.35, 1.1 - t / 110) * (0.7 + Math.random() * 0.6); }

    for (const b of balloons) {
      b.y += b.vy * dt;
      b.x += Math.sin(t * 2 + b.sway) * 14 * dt;
      b.x = Math.max(b.r, Math.min(W - b.r, b.x));
      if (!b.dead && b.y >= GROUND - b.r) {
        b.dead = true;
        if (b.kind !== 'bomb') { life--; texts.push({ x: b.x, y: GROUND - 20, s: '💔', a: 1, c: '#ff6b6b' }); beep(90, 0.2, 'square', 0.05); }
        updateHud();
        if (life <= 0) { finish(false); return; }
      }
    }
    for (const s of shells) {
      const step = 520 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.left -= step;
      if (s.left <= 0) { s.done = true; explode(s.tx, s.ty, 50, 0, { count: 0 }); }
    }
    shells = shells.filter(s => !s.done);

    for (const bl of blasts) {
      bl.age += dt;
      const r = bl.rad * Math.min(1, bl.age / 0.12);
      for (const b of balloons) {
        if (!b.dead && Math.hypot(b.x - bl.x, b.y - bl.y) < r + b.r * 0.6) popBalloon(b, bl);
      }
      if (!running) return;
    }
    blasts = blasts.filter(b => b.age < b.life);
    balloons = balloons.filter(b => !b.dead);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.a -= dt * 1.6; }
    parts = parts.filter(p => p.a > 0);
    for (const tx of texts) { tx.y -= 30 * dt; tx.a -= dt * 0.9; }
    texts = texts.filter(x => x.a > 0);

    if (t >= GOAL_TIME) finish(true);
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0f2c'); g.addColorStop(1, '#2a1f5e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % W, (i * 53) % (GROUND - 20), 2, 2);
    ctx.fillStyle = '#243b2a'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🎇', W / 2, GROUND + 4);

    for (const b of balloons) {
      ctx.font = (b.r * 2) + 'px serif';
      ctx.fillText(b.kind === 'gold' ? '⭐' : b.kind === 'bomb' ? '💣' : '🎈', b.x, b.y);
    }
    for (const s of shells) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); }
    for (const bl of blasts) {
      const k = bl.age / bl.life, r = bl.rad * Math.min(1, bl.age / 0.12);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = `hsl(${40 - k * 40},100%,${70 - k * 20}%)`;
      ctx.beginPath(); ctx.arc(bl.x, bl.y, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.a); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 16px sans-serif';
    for (const x of texts) { ctx.globalAlpha = Math.min(1, x.a); ctx.fillStyle = x.c; ctx.fillText(x.s, x.x, x.y); }
    ctx.globalAlpha = 1;
    // 照準
    ctx.strokeStyle = '#4dd8e6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(aim.x, aim.y, 14, 0, 7);
    ctx.moveTo(aim.x - 20, aim.y); ctx.lineTo(aim.x + 20, aim.y);
    ctx.moveTo(aim.x, aim.y - 20); ctx.lineTo(aim.x, aim.y + 20); ctx.stroke();
    // 残り時間バー
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, W * Math.min(1, t / GOAL_TIME), 6);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    if (running) { draw(); requestAnimationFrame(loop); }
  }

  function finish(clear) {
    running = false;
    draw();
    if (score > best) best = score;
    $('overTitle').textContent = clear ? '🎉 クリア!花火大成功' : '💔 ゲームオーバー';
    $('overText').innerHTML = `スコア <b>${score}</b>(ベスト ${best})<br>最大連鎖 ${maxChain} / 割った数 ${popped}<br>生存 ${Math.floor(t)} 秒 / ${GOAL_TIME} 秒`;
    over.classList.remove('hidden');
  }

  function start() {
    ensureAudio();
    reset();
    intro.classList.add('hidden'); over.classList.add('hidden');
    running = true; last = performance.now();
    requestAnimationFrame(loop);
  }

  // --- サウンド(Web Audio、ボタン操作内で生成) ---
  let ac = null;
  function ensureAudio() {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; }
  }
  function beep(f, d, type, vol) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
  }

  // --- 入力 ---
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const p = pos(e); aim.x = p.x; aim.y = Math.min(p.y, GROUND);
    fire(aim.x, aim.y);
  });
  cv.addEventListener('pointermove', e => { const p = pos(e); aim.x = p.x; aim.y = Math.min(p.y, GROUND); });
  window.addEventListener('keydown', e => {
    if (e.key.startsWith('Arrow')) { keys[e.key] = true; if (running) e.preventDefault(); }
    if (e.key === ' ' && running) { e.preventDefault(); fire(aim.x, aim.y); }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  reset(); draw();
})();
