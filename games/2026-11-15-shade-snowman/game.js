// とけるな!かげふみゆきだるま — 太陽の動きで変わる影の中を渡り歩くアクション
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const GROUND = 380;          // 地面の上端(建物の足元)
  const FOOT = 414;            // ゆきだるまの足元
  const DAY_LEN = 40;          // 1日の長さ(秒)
  const SPEED = 150;           // ゆきだるまの移動速度(px/s)
  const DEG = Math.PI / 180;

  const $ = (id) => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  const dayLabel = $('dayLabel'), quotaLabel = $('quotaLabel'), scoreLabel = $('scoreLabel');

  // ---- ステージ定義 ----
  // type: bld=ビル, tree=木, pole=かんばん
  const DAYS = [
    { quota: 5, heat: 1.0, objs: [
        { type: 'bld', x: 30, w: 58, h: 170 },
        { type: 'tree', x: 165, w: 46, h: 105 },
        { type: 'bld', x: 272, w: 50, h: 200 } ],
      truck: null, clouds: 0 },
    { quota: 6, heat: 1.25, objs: [
        { type: 'tree', x: 55, w: 46, h: 115 },
        { type: 'bld', x: 220, w: 44, h: 150 } ],
      truck: { w: 70, h: 62, v: 45 }, clouds: 1 },
    { quota: 7, heat: 1.45, objs: [
        { type: 'pole', x: 95, w: 22, h: 165 },
        { type: 'tree', x: 255, w: 42, h: 95 } ],
      truck: { w: 70, h: 62, v: 70 }, clouds: 2 },
  ];

  let S = null;
  let running = false;
  let last = 0;
  const keys = { left: false, right: false };
  let vdir = 0;           // 仮想ボタン方向
  let pointerX = null;    // タッチ/ドラッグの目標x

  // ---- サウンド(効果音のみ・Web Audio で生成) ----
  let actx = null;
  function initAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function beep(freq, dur, type = 'sine', vol = 0.12) {
    if (!actx) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  }

  function newGame() {
    S = { day: 0, score: 0, total: 0 };
    startDay(0);
  }

  function startDay(d) {
    const def = DAYS[d];
    S.day = d;
    S.t = 0;
    S.hp = 100;
    S.got = 0;
    S.x = W / 2;
    S.flakes = [];
    S.spawnT = 1.2;
    S.objs = def.objs.map(o => ({ ...o }));
    S.truck = def.truck ? { x: -80, w: def.truck.w, h: def.truck.h, v: def.truck.v } : null;
    S.clouds = [];
    for (let i = 0; i < def.clouds; i++) {
      S.clouds.push({ x: -140 - i * 260, w: 110, v: 14 + i * 6 });
    }
    S.banner = { text: `${d + 1}日目  ノルマ ❄️×${def.quota}`, t: 2.2 };
    S.drip = 0;
    S.inShade = true;
    S.particles = [];
    updateHud();
  }

  // ---- 太陽と影 ----
  function sunAngle() { return (12 + 156 * (S.t / DAY_LEN)) * DEG; } // 0..π 左→右
  function elevation(a) { return a < Math.PI / 2 ? a : Math.PI - a; }
  function sunPos(a) { return { x: W / 2 - 165 * Math.cos(a), y: GROUND - 300 * Math.sin(a) }; }

  // 高さ h, 足元 [x, x+w] の物体の地面上の影
  function shadowOf(x, w, h, a) {
    const e = Math.max(elevation(a), 6 * DEG);
    const d = Math.min(h / Math.tan(e), 700);
    return a < Math.PI / 2 ? [x, x + w + d] : [x - d, x + w];
  }
  // 雲は高い所にあるので、影は離れた場所に落ちる
  function cloudShadow(c, a) {
    const e = Math.max(elevation(a), 6 * DEG);
    const off = Math.min(250 / Math.tan(e), 900) * (a < Math.PI / 2 ? 1 : -1);
    return [c.x + off, c.x + c.w + off];
  }
  function allShadows(a) {
    const list = S.objs.map(o => shadowOf(o.x, o.w, o.h, a));
    if (S.truck) list.push(shadowOf(S.truck.x, S.truck.w, S.truck.h, a));
    for (const c of S.clouds) list.push(cloudShadow(c, a));
    return list;
  }
  function shadeAt(x, shadows) {
    return shadows.some(([l, r]) => x >= l && x <= r);
  }

  // ---- 更新 ----
  function update(dt) {
    const def = DAYS[S.day];
    S.t += dt;
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }

    // 移動
    let dir = 0;
    if (keys.left) dir -= 1;
    if (keys.right) dir += 1;
    dir += vdir;
    if (dir === 0 && pointerX !== null) {
      const diff = pointerX - S.x;
      if (Math.abs(diff) > 4) dir = Math.sign(diff);
      S.x += Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
    } else {
      S.x += Math.max(-1, Math.min(1, dir)) * SPEED * dt;
    }
    S.x = Math.max(16, Math.min(W - 16, S.x));
    S.moving = dir !== 0;

    // トラック・雲
    if (S.truck) {
      S.truck.x += S.truck.v * dt;
      if (S.truck.x > W + 40) S.truck.x = -S.truck.w - 120 - Math.random() * 160;
    }
    for (const c of S.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 700) c.x = -700 - Math.random() * 200;
    }

    // とける/ちょっと固まる
    const a = sunAngle();
    const shadows = allShadows(a);
    S.inShade = shadeAt(S.x, shadows);
    if (S.inShade) {
      S.hp = Math.min(100, S.hp + 1.5 * dt);
    } else {
      const melt = 8.5 * def.heat * (0.45 + 0.85 * Math.sin(elevation(a)));
      S.hp -= melt * dt;
      S.drip -= dt;
      if (S.drip <= 0) {
        S.drip = 0.18;
        S.particles.push({ x: S.x + (Math.random() - 0.5) * 20, y: FOOT - 20, vy: 40, life: 0.6, kind: 'drop' });
      }
    }

    // ❄️ の出現
    S.spawnT -= dt;
    if (S.spawnT <= 0 && S.t < DAY_LEN - 1.5) {
      S.spawnT = 1.6 + Math.random() * 1.2;
      if (S.flakes.length < 3) {
        let fx, tries = 0;
        do { fx = 20 + Math.random() * (W - 40); tries++; }
        while (tries < 8 && (Math.abs(fx - S.x) < 50 || S.flakes.some(f => Math.abs(f.x - fx) < 40)));
        const big = Math.random() < 0.12;
        S.flakes.push({ x: fx, life: big ? 4 : 5.5, max: big ? 4 : 5.5, big, fall: 0 });
      }
    }
    for (const f of S.flakes) { f.life -= dt; f.fall = Math.min(1, f.fall + dt * 2.5); }
    for (let i = S.flakes.length - 1; i >= 0; i--) {
      const f = S.flakes[i];
      if (f.fall >= 1 && Math.abs(f.x - S.x) < 20) {
        S.flakes.splice(i, 1);
        if (f.big) { S.hp = Math.min(100, S.hp + 25); S.score += 30; beep(660, 0.15, 'triangle'); setTimeout(() => beep(990, 0.2, 'triangle'), 90); }
        else { S.hp = Math.min(100, S.hp + 8); S.score += 10; beep(1180, 0.12, 'sine'); }
        S.got += 1; S.total += 1;
        for (let k = 0; k < 6; k++) S.particles.push({ x: f.x, y: FOOT - 30, vx: (Math.random() - .5) * 120, vy: -60 - Math.random() * 60, life: 0.5, kind: 'spark' });
        continue;
      }
      if (f.life <= 0) S.flakes.splice(i, 1);
    }

    for (const p of S.particles) {
      p.life -= dt; p.y += p.vy * dt; if (p.vx) p.x += p.vx * dt;
      if (p.kind === 'spark') p.vy += 200 * dt;
    }
    S.particles = S.particles.filter(p => p.life > 0);

    updateHud();

    if (S.hp <= 0) {
      S.hp = 0;
      beep(200, 0.5, 'sawtooth', 0.08);
      return finish(false, 'melt');
    }
    if (S.t >= DAY_LEN) {
      if (S.got < def.quota) { beep(220, 0.5, 'square', 0.06); return finish(false, 'quota'); }
      S.score += Math.floor(S.hp);
      beep(784, 0.15); setTimeout(() => beep(1046, 0.25), 140);
      if (S.day + 1 >= DAYS.length) return finish(true);
      startDay(S.day + 1);
    }
  }

  function updateHud() {
    dayLabel.textContent = `${S.day + 1}日目 / 3`;
    quotaLabel.textContent = `❄️ ${S.got}/${DAYS[S.day].quota}`;
    scoreLabel.textContent = `SCORE ${S.score}`;
  }

  // ---- 描画 ----
  function lerpColor(c1, c2, k) {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const A = p(c1), B = p(c2);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
  }

  function draw() {
    const a = sunAngle();
    const e = elevation(a);
    const noon = Math.sin(e); // 0(朝夕)〜1(正午)
    // 空
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, lerpColor('#3d5a9e', '#3f9cf0', noon));
    g.addColorStop(1, lerpColor('#ffb37a', '#bfe6ff', noon));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);

    // 太陽
    const sp = sunPos(a);
    ctx.fillStyle = 'rgba(255,230,120,.35)';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lerpColor('#ff8a3d', '#ffe14d', noon);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 20, 0, Math.PI * 2); ctx.fill();

    // 雲
    for (const c of S.clouds) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      const cy = 70;
      ctx.beginPath();
      ctx.ellipse(c.x + c.w * 0.5, cy, c.w * 0.5, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.35, cy - 12, 26, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.65, cy - 10, 22, 17, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 地面
    ctx.fillStyle = '#e9eef2'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#c9d3db'; ctx.fillRect(0, GROUND, W, 6);
    // 歩道のライン
    ctx.fillStyle = '#d7dfe6';
    for (let x = 0; x < W; x += 40) ctx.fillRect(x, 440, 20, 3);

    // 影(地面の帯)
    const shadows = allShadows(a);
    ctx.fillStyle = 'rgba(40,60,110,.38)';
    for (const [l, r] of shadows) {
      const L = Math.max(0, l), R = Math.min(W, r);
      if (R > L) ctx.fillRect(L, GROUND + 6, R - L, 48);
    }

    // トラック(奥の道路)
    if (S.truck) drawTruck(S.truck);
    // 物体
    for (const o of S.objs) drawObj(o);

    // ❄️
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of S.flakes) {
      const y = 30 + (FOOT - 22 - 30) * easeOut(f.fall);
      const blink = f.life < 1.5 && Math.floor(f.life * 8) % 2 === 0;
      if (blink) continue;
      ctx.font = f.big ? '28px sans-serif' : '22px sans-serif';
      ctx.fillText(f.big ? '🧊' : '❄️', f.x, y);
      if (f.fall >= 1) {
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.fillRect(f.x - 14, FOOT - 3, 28 * (f.life / f.max), 3);
      }
    }

    drawSnowman();

    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.kind === 'drop' ? '#5ab8ff' : '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'drop' ? 2.5 : 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HUD(キャンバス内): ゆきだるまゲージ と 時計
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(10, 452, W - 20, 18);
    const hpc = S.hp > 50 ? '#8fe3ff' : S.hp > 25 ? '#ffd23f' : '#ff6b6b';
    ctx.fillStyle = hpc; ctx.fillRect(12, 454, (W - 24) * (S.hp / 100), 14);
    ctx.fillStyle = '#1c1c28'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`⛄ ${Math.ceil(S.hp)}%`, 16, 461);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(S.inShade ? '🌳 かげ' : '☀️ ひなた!とけてる', W - 16, 461);

    // 時刻バー
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(10, 10, W - 20, 8);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(10, 10, (W - 20) * Math.min(1, S.t / DAY_LEN), 8);
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText('🌅', 8, 30); ctx.textAlign = 'right'; ctx.fillText('🌇', W - 8, 30);

    if (S.banner) {
      ctx.globalAlpha = Math.min(1, S.banner.t * 2);
      ctx.fillStyle = 'rgba(16,30,58,.8)'; ctx.fillRect(0, 160, W, 56);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(S.banner.text, W / 2, 188);
      ctx.globalAlpha = 1;
    }
  }

  function easeOut(k) { return 1 - (1 - k) * (1 - k); }

  function drawObj(o) {
    const top = GROUND - o.h;
    if (o.type === 'bld') {
      ctx.fillStyle = '#7d8aa3'; ctx.fillRect(o.x, top, o.w, o.h);
      ctx.fillStyle = '#5f6b82'; ctx.fillRect(o.x, top, o.w, 6);
      ctx.fillStyle = '#ffe9a8';
      for (let y = top + 14; y < GROUND - 16; y += 22)
        for (let x = o.x + 7; x < o.x + o.w - 10; x += 16) ctx.fillRect(x, y, 9, 11);
    } else if (o.type === 'tree') {
      ctx.fillStyle = '#7a4e2d'; ctx.fillRect(o.x + o.w / 2 - 5, GROUND - o.h * 0.45, 10, o.h * 0.45);
      ctx.fillStyle = '#3e9c4f';
      ctx.beginPath(); ctx.arc(o.x + o.w / 2, top + o.w / 2, o.w / 2 + 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(o.x + o.w / 2, top + o.h * 0.45, o.w / 2 + 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#888'; ctx.fillRect(o.x + o.w / 2 - 3, top + 40, 6, o.h - 40);
      ctx.fillStyle = '#ff7a59'; ctx.fillRect(o.x - 14, top, o.w + 28, 44);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('アイス', o.x + o.w / 2, top + 22);
    }
  }

  function drawTruck(t) {
    const top = GROUND - t.h;
    ctx.fillStyle = '#4d7fd1'; ctx.fillRect(t.x, top, t.w * 0.7, t.h - 10);
    ctx.fillStyle = '#e8a43a'; ctx.fillRect(t.x + t.w * 0.7, top + 18, t.w * 0.3, t.h - 28);
    ctx.fillStyle = '#bfe6ff'; ctx.fillRect(t.x + t.w * 0.78, top + 22, t.w * 0.16, 12);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(t.x + 14, GROUND - 6, 7, 0, Math.PI * 2); ctx.arc(t.x + t.w - 14, GROUND - 6, 7, 0, Math.PI * 2); ctx.fill();
  }

  function drawSnowman() {
    const s = 0.45 + 0.55 * (S.hp / 100);
    const x = S.x;
    const bob = S.moving ? Math.sin(performance.now() / 90) * 1.5 : 0;
    const r1 = 17 * s, r2 = 12 * s;
    const by = FOOT - r1 + bob * 0.3;
    const hy = by - r1 - r2 + 4 * s + bob;
    // 足元の水たまり
    ctx.fillStyle = 'rgba(90,184,255,.35)';
    ctx.beginPath(); ctx.ellipse(x, FOOT, 22 * (1.4 - s * 0.6), 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.inShade ? '#f4fbff' : '#ffffff';
    ctx.strokeStyle = '#9bb4c9'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, by, r1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, hy, r2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 顔
    ctx.fillStyle = '#1c1c28';
    ctx.beginPath(); ctx.arc(x - 4 * s, hy - 2 * s, 1.8, 0, Math.PI * 2); ctx.arc(x + 4 * s, hy - 2 * s, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(x, hy + 1); ctx.lineTo(x + 8 * s, hy + 3); ctx.lineTo(x, hy + 4); ctx.fill();
    // バケツ
    ctx.fillStyle = '#d64545';
    ctx.fillRect(x - 8 * s, hy - r2 - 8 * s, 16 * s, 9 * s);
    // あせ
    if (!S.inShade) {
      ctx.fillStyle = '#5ab8ff';
      ctx.beginPath(); ctx.arc(x + r2 + 3, hy - 4, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- ループ ----
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (running) draw();
    requestAnimationFrame(loop);
  }

  function start() {
    initAudio();
    intro.classList.add('hidden');
    result.classList.add('hidden');
    keys.left = keys.right = false; vdir = 0; pointerX = null;
    newGame();
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function finish(clear, why) {
    running = false;
    draw();
    let best = 0;
    try { best = Number(localStorage.getItem('shadeSnowmanBest') || 0); } catch (e) { /* noop */ }
    const isBest = S.score > best;
    if (isBest) { try { localStorage.setItem('shadeSnowmanBest', String(S.score)); } catch (e) { /* noop */ } }
    $('resultTitle').textContent = clear ? '3日間のりきった!' : (why === 'melt' ? 'とけちゃった…' : 'ノルマ未達成…');
    $('resultIcon').textContent = clear ? '⛄✨' : (why === 'melt' ? '💧' : '🌇');
    const reason = clear ? 'ゆきだるまは晴れの3日間をぶじに生きのびた!'
      : why === 'melt' ? `${S.day + 1}日目、ひなたで力つきた。影の向きを先読みしよう。`
      : `${S.day + 1}日目の❄️が ${S.got}/${DAYS[S.day].quota}。もっと思い切って影から出よう!`;
    $('resultText').innerHTML = `${reason}<br>あつめた❄️: ${S.total}こ<br>SCORE <b>${S.score}</b>${isBest ? ' 🏆ベスト更新!' : `(ベスト ${Math.max(best, S.score)})`}`;
    result.classList.remove('hidden');
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  // ---- 入力: キーボード ----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = false; vdir = 0; pointerX = null; });

  // ---- 入力: タッチ/ドラッグ ----
  function toCanvasX(ev) {
    const r = cv.getBoundingClientRect();
    return (ev.clientX - r.left) * (W / r.width);
  }
  let activePointer = null;
  cv.addEventListener('pointerdown', (ev) => {
    activePointer = ev.pointerId;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    pointerX = toCanvasX(ev);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', (ev) => {
    if (ev.pointerId === activePointer) pointerX = toCanvasX(ev);
  });
  const endPointer = (ev) => { if (ev.pointerId === activePointer) { activePointer = null; pointerX = null; } };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  // ---- 仮想コントローラ ----
  const panel = $('vpadPanel');
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) panel.classList.remove('hidden');
  $('vpadToggle').addEventListener('click', () => panel.classList.toggle('hidden'));
  panel.querySelectorAll('.vbtn').forEach((b) => {
    const d = Number(b.dataset.dir);
    const on = (ev) => { ev.preventDefault(); vdir = d; b.classList.add('on'); };
    const off = () => { if (vdir === d) vdir = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
  });

  // 初期画面の背景描画
  S = { day: 0, score: 0, total: 0 };
  startDay(0);
  S.banner = null;
  draw();
})();
