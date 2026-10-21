(() => {
  const W = 360, H = 500, DURATION = 75;
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);
  const intro = $('intro'), end = $('end');

  let state = 'intro';
  let ship, bullets, enemies, ebullets, items, parts, stars;
  let t, lives, score, fireT, spawnT, mirror, mirrorT, warnT, invT, banner, bannerT;
  const keys = { l: false, r: false };
  const padHold = { l: false, r: false };

  stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5 }));

  function nextMirrorGap() { return 5 + Math.random() * 4; }

  function reset() {
    ship = { x: W / 2, y: H - 50 };
    bullets = []; enemies = []; ebullets = []; items = []; parts = [];
    t = 0; lives = 3; score = 0; fireT = 0; spawnT = 1; invT = 0;
    mirror = false; mirrorT = nextMirrorGap(); warnT = 0; banner = ''; bannerT = 0;
  }

  function start() {
    reset();
    state = 'play';
    intro.classList.add('hidden');
    end.classList.add('hidden');
    last = performance.now();
    hud();
  }

  function finish(clear) {
    state = 'over';
    $('endTitle').textContent = clear ? '🎉 クリア!' : 'GAME OVER';
    $('endScore').textContent = score + ' pt';
    let rank;
    if (score >= 900) rank = '🏆 さかさまマスター!';
    else if (score >= 600) rank = '🥇 かなりの腕前';
    else if (score >= 300) rank = '🥈 なかなかやるね';
    else rank = '🥉 つぎはもっと撃てるはず';
    $('endMsg').textContent = (clear ? '75びょう生きのびた! ' : Math.floor(t) + 'びょうまで生きのびた。 ') + rank;
    end.classList.remove('hidden');
  }

  function hud() {
    $('lives').textContent = '❤️'.repeat(Math.max(lives, 0)) || '💔';
    $('time').textContent = 'のこり ' + Math.max(0, Math.ceil(DURATION - t));
    $('score').textContent = score + ' pt';
  }

  function burst(x, y, c) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28, v = 40 + Math.random() * 90;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, c });
    }
  }

  function spawn() {
    const diff = Math.min(1, t / DURATION);
    const big = Math.random() < 0.15 + diff * 0.2;
    enemies.push({
      x: 30 + Math.random() * (W - 60), y: -24, x0: 0, ph: Math.random() * 6,
      hp: big ? 3 : 1, big, vy: (big ? 38 : 55) + diff * 45 + Math.random() * 20,
      sh: big ? 1.4 + Math.random() : 0
    });
    enemies[enemies.length - 1].x0 = enemies[enemies.length - 1].x;
  }

  function update(dt) {
    t += dt;
    if (t >= DURATION) { hud(); finish(true); return; }
    const diff = Math.min(1, t / DURATION);

    // mirror control
    if (warnT > 0) {
      warnT -= dt;
      if (warnT <= 0) { mirror = !mirror; banner = mirror ? '🔄 さかさま中!' : '✅ もとにもどった'; bannerT = 1.2; mirrorT = mirror ? 4 + Math.random() * 2 : nextMirrorGap(); }
    } else {
      mirrorT -= dt;
      if (mirrorT <= 0) { warnT = 1.3; }
    }
    if (bannerT > 0) bannerT -= dt;

    // movement
    const dir = (keys.r || padHold.r ? 1 : 0) - (keys.l || padHold.l ? 1 : 0);
    if (dir) ship.x += dir * (mirror ? -1 : 1) * 260 * dt;
    ship.x = Math.max(16, Math.min(W - 16, ship.x));

    // auto fire
    fireT -= dt;
    if (fireT <= 0) { bullets.push({ x: ship.x, y: ship.y - 16 }); fireT = 0.22; }
    bullets.forEach(b => b.y -= 480 * dt);
    bullets = bullets.filter(b => b.y > -10);

    // spawn
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = Math.max(0.45, 1.1 - diff * 0.6) * (0.8 + Math.random() * 0.4); }

    enemies.forEach(e => {
      e.y += e.vy * dt;
      e.x = e.x0 + Math.sin(e.y / 40 + e.ph) * 30;
      if (e.sh) {
        e.sh -= dt;
        if (e.sh <= 0 && e.y > 0 && e.y < H - 160) {
          const dx = ship.x - e.x, dy = ship.y - e.y, d = Math.hypot(dx, dy) || 1;
          ebullets.push({ x: e.x, y: e.y + 12, vx: dx / d * 120, vy: dy / d * 120 });
          e.sh = 2.2 - diff * 0.7;
        }
      }
    });
    ebullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
    ebullets = ebullets.filter(b => b.y < H + 10 && b.x > -10 && b.x < W + 10);

    // bullet vs enemy
    bullets.forEach(b => {
      for (const e of enemies) {
        if (e.hp > 0 && Math.abs(b.x - e.x) < 18 && Math.abs(b.y - e.y) < 18) {
          e.hp--; b.y = -99;
          if (e.hp <= 0) {
            score += e.big ? 30 : 10;
            burst(e.x, e.y, e.big ? '#ff6fb5' : '#5ce1e6');
            const r = Math.random();
            if (r < 0.12) items.push({ x: e.x, y: e.y, k: '⭐' });
            else if (r < 0.16) items.push({ x: e.x, y: e.y, k: '💖' });
          }
          break;
        }
      }
    });
    enemies = enemies.filter(e => e.hp > 0 && e.y < H + 30);

    items.forEach(i => i.y += 70 * dt);
    items = items.filter(i => {
      if (Math.abs(i.x - ship.x) < 22 && Math.abs(i.y - ship.y) < 22) {
        if (i.k === '⭐') score += 50; else lives = Math.min(3, lives + 1);
        return false;
      }
      return i.y < H + 20;
    });

    // damage
    if (invT > 0) invT -= dt;
    else {
      const hit = enemies.some(e => Math.abs(e.x - ship.x) < 20 && Math.abs(e.y - ship.y) < 20)
        || ebullets.some(b => Math.abs(b.x - ship.x) < 12 && Math.abs(b.y - ship.y) < 12);
      if (hit) {
        lives--; invT = 1.5;
        burst(ship.x, ship.y, '#ffd166');
        enemies = enemies.filter(e => !(Math.abs(e.x - ship.x) < 20 && Math.abs(e.y - ship.y) < 20));
        ebullets = [];
        if (lives <= 0) { hud(); finish(false); return; }
      }
    }

    parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
    parts = parts.filter(p => p.life > 0);
    stars.forEach(s => { s.y += s.s * 40 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } });
    hud();
  }

  function emoji(ch, x, y, size) {
    ctx.font = size + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
  }

  function draw() {
    ctx.fillStyle = '#07101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9fb8d8';
    stars.forEach(s => ctx.fillRect(s.x, s.y, s.s, s.s));
    if (state === 'intro') return;
    ctx.fillStyle = '#5ce1e6';
    bullets.forEach(b => ctx.fillRect(b.x - 2, b.y - 8, 4, 12));
    enemies.forEach(e => emoji(e.big ? '🛸' : '👾', e.x, e.y, e.big ? 34 : 28));
    ctx.fillStyle = '#ff6fb5';
    ebullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 6.28); ctx.fill(); });
    items.forEach(i => emoji(i.k, i.x, i.y, 24));
    parts.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
    ctx.globalAlpha = 1;
    if (invT <= 0 || Math.floor(invT * 12) % 2) emoji('🚀', ship.x, ship.y, 34);
    // mirror indicator under ship
    ctx.fillStyle = mirror ? '#ff6fb5' : '#5ce1e6';
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(mirror ? '▶ ◀' : '◀ ▶', ship.x, ship.y + 28);
    if (mirror) { ctx.strokeStyle = '#ff6fb5'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, W, H); }
    if (warnT > 0) {
      ctx.fillStyle = Math.floor(warnT * 8) % 2 ? 'rgba(255,111,181,.9)' : 'rgba(255,209,102,.9)';
      ctx.fillRect(0, 200, W, 56);
      ctx.fillStyle = '#10151f'; ctx.font = 'bold 26px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ もうすぐ' + (mirror ? 'もどる' : 'さかさま') + '!', W / 2, 228);
    } else if (bannerT > 0) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(banner, W / 2, 228);
    }
  }

  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'play') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // input: drag
  let dragX = null;
  function px(e) { return e.clientX * (W / cv.getBoundingClientRect().width); }
  cv.addEventListener('pointerdown', e => { dragX = px(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (dragX === null || state !== 'play') return;
    const x = px(e);
    ship.x += (x - dragX) * (mirror ? -1 : 1);
    ship.x = Math.max(16, Math.min(W - 16, ship.x));
    dragX = x;
  });
  const up = () => { dragX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  // input: keyboard
  const keyMap = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
  addEventListener('keydown', e => { const k = keyMap[e.key]; if (k) { keys[k] = true; e.preventDefault(); } });
  addEventListener('keyup', e => { const k = keyMap[e.key]; if (k) keys[k] = false; });
  addEventListener('blur', () => { keys.l = keys.r = false; });

  // virtual pad
  const pad = $('pad');
  if (matchMedia('(pointer: coarse)').matches) pad.classList.add('show');
  $('togPad').addEventListener('click', () => pad.classList.toggle('show'));
  [['bl', 'l'], ['br', 'r']].forEach(([id, k]) => {
    const b = $(id);
    const on = e => { e.preventDefault(); padHold[k] = true; b.classList.add('on'); };
    const off = () => { padHold[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, off));
  });

  $('start').addEventListener('click', start);
  $('retry').addEventListener('click', start);
  reset();
  requestAnimationFrame(t0 => { last = t0; loop(t0); });
})();
