// かくれてなげろ!ゆきがっせん
(() => {
  'use strict';
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const hudRound = $('hudRound'), hudTime = $('hudTime'), hudLife = $('hudLife'), hudScore = $('hudScore');
  const msgEl = $('msg');

  // ---- レイアウト定数 ----
  const FORT_X = [70, 180, 290];
  const E_UP_Y = 128, E_DOWN_Y = 166;
  const E_WALL_Y = 148, E_WALL_H = 42, E_WALL_W = 80;
  const HIDE_ZONE_Y = 300;
  const PX = 180, P_UP_Y = 380, P_DOWN_Y = 432;
  const P_WALL_Y = 402, P_WALL_H = 44, P_WALL_W = 130;
  const P_HIT = { x: PX, y: 384 };
  const WALL_MAX = 6;
  const STOCK_MAX = 3;
  const CRAFT_T = 0.55;
  const REPAIR_T = 1.2;
  const TIME_LIMIT = 120;

  const KINDS = {
    kid:     { emoji: '🧒', hp: 2, wall: 3, hideMin: 1.3, hideMax: 2.6, wind: 0.75, ballDur: 0.95, fake: 0,    dmg: 1, big: false, name: 'こども' },
    penguin: { emoji: '🐧', hp: 2, wall: 3, hideMin: 0.9, hideMax: 2.0, wind: 0.5, ballDur: 0.8, fake: 0.35, dmg: 1, big: false, name: 'ペンギン' },
    bear:    { emoji: '🐻‍❄️', hp: 4, wall: 4, hideMin: 1.2, hideMax: 2.2, wind: 0.8, ballDur: 0.85, fake: 0.15, dmg: 2, big: true,  name: 'シロクマ' },
  };
  const ROUNDS = [
    { title: 'こどもチーム', kinds: ['kid', 'kid', 'kid'] },
    { title: 'ペンギンチーム', kinds: ['penguin', 'penguin', 'penguin'] },
    { title: 'シロクマ親分', kinds: ['penguin', 'bear', 'kid'] },
  ];

  // ---- サウンド ----
  let ac = null;
  function initAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = 0) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, freq = 1200) {
    if (!ac) return;
    const t = ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  }
  const SFX = {
    throw: () => tone(500, 0.12, 'triangle', 0.1, 900),
    splat: () => noise(0.18, 0.25, 900),
    hit: () => { noise(0.15, 0.3, 1800); tone(880, 0.15, 'square', 0.08, 1320); },
    out: () => { tone(660, 0.12, 'square', 0.1); setTimeout(() => tone(990, 0.25, 'square', 0.1), 110); },
    ouch: () => { noise(0.25, 0.35, 700); tone(300, 0.35, 'sawtooth', 0.12, 120); },
    craft: () => tone(1200, 0.06, 'sine', 0.08),
    repair: () => tone(700, 0.08, 'sine', 0.07, 900),
    intercept: () => { noise(0.1, 0.25, 2500); tone(1500, 0.12, 'triangle', 0.1, 2200); },
    warn: () => tone(1000, 0.05, 'square', 0.04),
    clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.13), i * 120)),
    lose: () => [440, 370, 311, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.09), i * 160)),
    wall: () => { noise(0.3, 0.3, 500); },
  };

  // ---- 状態 ----
  let S = null;
  let running = false;
  const pointers = new Map(); // pointerId -> 'hide'
  let keyHide = false;

  function newEnemy(kindKey, fort) {
    const k = KINDS[kindKey];
    return {
      kind: k, fort, x: FORT_X[fort], hp: k.hp, state: 'hide', t: 1.0 + Math.random() * 1.6 + fort * 0.35,
      thrown: false, fake: false, wall: k.wall, y: E_DOWN_Y, flash: 0,
    };
  }

  function setupRound(r) {
    S.round = r;
    S.enemies = ROUNDS[r].kinds.map((k, i) => newEnemy(k, i));
    S.balls = [];
    S.wall = WALL_MAX;
    S.banner = { text: `ラウンド ${r + 1}`, sub: `VS ${ROUNDS[r].title}`, t: 1.8 };
  }

  function resetGame() {
    S = {
      round: 0, time: TIME_LIMIT, hearts: 3, score: 0, stock: 2, craft: 0, repair: 0,
      wall: WALL_MAX, enemies: [], balls: [], fx: [], texts: [], banner: null,
      py: P_UP_Y, invuln: 0, cooldown: 0, hitFlash: 0, msgT: 0,
      stats: { hits: 0, intercept: 0, walls: 0, thrown: 0 }, over: false, nextRoundT: 0,
    };
    pointers.clear(); keyHide = false;
    setupRound(0);
    updateHud();
    setMsg('下をおしっぱなしでかくれて、雪玉をつくろう!');
  }

  function setMsg(t, dur = 2.2) { msgEl.textContent = t; S.msgT = dur; }
  function isHiding() { return pointers.size > 0 || keyHide; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function updateHud() {
    hudRound.textContent = `ラウンド ${S.round + 1}/3`;
    hudTime.textContent = `⏱ ${Math.ceil(S.time)}`;
    hudLife.textContent = '❤️'.repeat(Math.max(0, S.hearts)) + '🤍'.repeat(Math.max(0, 3 - S.hearts));
    hudScore.textContent = `⭐ ${S.score}`;
  }

  function addText(x, y, text, color = '#1e3a8a') { S.texts.push({ x, y, text, color, t: 1.0 }); }
  function addSplat(x, y, big = false) {
    for (let i = 0; i < (big ? 12 : 7); i++) {
      const a = Math.random() * Math.PI * 2, v = rand(40, big ? 160 : 110);
      S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0.5, r: rand(2, big ? 5 : 3.5) });
    }
  }

  // ---- ボール ----
  function ballPos(b) {
    const p = Math.min(1, b.t / b.dur);
    const x = b.x0 + (b.x1 - b.x0) * p;
    const y = b.y0 + (b.y1 - b.y0) * p - Math.sin(Math.PI * p) * b.arc;
    return { x, y, p };
  }

  function throwAt(tx, ty) {
    if (!running || S.banner || S.over) return;
    if (isHiding()) { setMsg('かくれているときは投げられない!指をはなして顔を出そう'); return; }
    if (S.cooldown > 0) return;
    if (S.stock <= 0) { setMsg('雪玉がない!下をおしっぱなしでつくろう'); tone(200, 0.1, 'square', 0.06); return; }
    S.stock--; S.cooldown = 0.22; S.stats.thrown++;
    S.balls.push({ owner: 'me', x0: PX + 14, y0: P_UP_Y - 10, x1: tx, y1: ty, t: 0, dur: 0.42, arc: 50 });
    SFX.throw();
  }

  function interceptAt(x, y) {
    // タップ地点近くの相手の雪玉をうちおとす
    let best = null, bd = 38;
    for (const b of S.balls) {
      if (b.owner !== 'enemy' || b.targeted) continue;
      const p = ballPos(b);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function launchIntercept(target) {
    if (isHiding()) { setMsg('かくれているときは投げられない!'); return true; }
    if (S.stock <= 0) { setMsg('雪玉がない!うちおとせない…'); return true; }
    if (S.cooldown > 0) return true;
    S.stock--; S.cooldown = 0.18; S.stats.thrown++;
    target.targeted = true;
    S.balls.push({ owner: 'me', homing: target, hx: PX + 14, hy: P_UP_Y - 10, t: 0, dur: 1, arc: 0 });
    SFX.throw();
    return true;
  }

  function nearestEnemyBall() {
    let best = null, bp = -1;
    for (const b of S.balls) {
      if (b.owner !== 'enemy' || b.targeted) continue;
      const p = b.t / b.dur;
      if (p > bp) { bp = p; best = b; }
    }
    return best;
  }

  function enemyHittable(e) {
    if (e.state === 'out' || e.state === 'stun') return false;
    if (e.state === 'up') return true;
    return e.wall <= 0;
  }

  function resolveMyBall(tx, ty) {
    // 1) 相手の頭
    for (const e of S.enemies) {
      if (!enemyHittable(e)) continue;
      if (Math.hypot(tx - e.x, ty - (e.y - 2)) < (e.kind.big ? 34 : 29)) { hitEnemy(e); addSplat(tx, ty); return; }
    }
    // 2) 相手のかべ
    for (const e of S.enemies) {
      if (e.wall <= 0) continue;
      if (Math.abs(tx - e.x) < E_WALL_W / 2 + 4 && ty > E_WALL_Y - 8 && ty < E_WALL_Y + E_WALL_H + 6) {
        e.wall--; S.score += 20; S.stats.walls++;
        addSplat(tx, ty); SFX.splat();
        if (e.wall <= 0) { S.score += 50; addText(e.x, E_WALL_Y, 'かべこわした!+50', '#b45309'); SFX.wall(); }
        else addText(tx, ty, '+20', '#64748b');
        updateHud();
        return;
      }
    }
    addSplat(tx, ty); SFX.splat();
  }

  function hitEnemy(e) {
    e.hp--; e.flash = 0.4; S.stats.hits++;
    SFX.hit();
    const wasThrowing = e.state === 'up' && !e.thrown && !e.fake;
    if (e.hp <= 0) {
      e.state = 'out'; S.score += 300; addText(e.x, e.y - 24, `まいった!+300`, '#dc2626'); SFX.out();
    } else {
      e.state = 'stun'; e.t = 1.1; S.score += 100;
      addText(e.x, e.y - 24, wasThrowing ? 'さきどり!+150' : 'ヒット!+100', '#dc2626');
      if (wasThrowing) S.score += 50;
    }
    updateHud();
  }

  function enemyThrow(e) {
    const k = e.kind;
    S.balls.push({ owner: 'enemy', x0: e.x, y0: E_UP_Y - 6, x1: P_HIT.x + rand(-8, 8), y1: P_HIT.y, t: 0,
      dur: k.ballDur * (S.round === 2 ? 0.92 : 1), arc: 70, dmg: k.dmg, big: k.big });
    tone(380, 0.1, 'triangle', 0.07, 260);
  }

  function playerHit(b) {
    if (S.invuln > 0) { addSplat(P_HIT.x, P_HIT.y); return; }
    S.hearts--; S.invuln = 1.0; S.hitFlash = 0.5;
    addSplat(P_HIT.x, P_HIT.y, true); SFX.ouch();
    addText(PX, P_UP_Y - 40, 'いたっ!', '#dc2626');
    setMsg('当たった!⚠️ が出たらかくれよう');
    updateHud();
    if (S.hearts <= 0) endGame(false, 'やられた…');
  }

  function enemyBallArrive(b) {
    if (isHiding()) {
      if (S.wall > 0) {
        S.wall = Math.max(0, S.wall - b.dmg);
        addSplat(P_HIT.x + rand(-20, 20), P_WALL_Y + 4, b.big); SFX.splat();
        if (S.wall <= 0) { setMsg('かべがこわれた!かくれたままおしっぱなしで、なおそう(雪玉3このとき)', 3); SFX.wall(); }
      } else {
        playerHit(b);
      }
    } else {
      playerHit(b);
    }
  }

  // ---- 更新 ----
  function update(dt) {
    if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) msgEl.textContent = ''; }
    // FX
    for (const f of S.fx) { f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; }
    S.fx = S.fx.filter(f => f.t > 0);
    for (const t of S.texts) { t.t -= dt; t.y -= 28 * dt; }
    S.texts = S.texts.filter(t => t.t > 0);

    const hiding = isHiding();
    const targetY = hiding ? P_DOWN_Y : P_UP_Y;
    S.py += (targetY - S.py) * Math.min(1, dt * 18);

    if (S.banner) {
      S.banner.t -= dt;
      if (S.banner.t <= 0) S.banner = null;
      return;
    }
    if (S.over) return;
    if (S.nextRoundT > 0) {
      S.nextRoundT -= dt;
      if (S.nextRoundT <= 0) { S.nextRoundT = 0; setupRound(S.round + 1); updateHud(); }
      return;
    }

    S.time -= dt;
    if (S.time <= 0) { S.time = 0; updateHud(); endGame(false, 'タイムアップ!'); return; }
    if (S.invuln > 0) S.invuln -= dt;
    if (S.hitFlash > 0) S.hitFlash -= dt;
    if (S.cooldown > 0) S.cooldown -= dt;

    // かくれて雪玉づくり / かべなおし
    if (hiding) {
      if (S.stock < STOCK_MAX) {
        S.craft += dt; S.repair = 0;
        if (S.craft >= CRAFT_T) { S.craft = 0; S.stock++; SFX.craft(); }
      } else if (S.wall < WALL_MAX) {
        S.repair += dt;
        if (S.repair >= REPAIR_T) { S.repair = 0; S.wall++; SFX.repair(); }
      }
    } else {
      S.craft = Math.max(0, S.craft - dt * 0.5);
      S.repair = 0;
    }

    // 相手
    let windups = S.enemies.filter(e => e.state === 'up' && !e.thrown).length;
    for (const e of S.enemies) {
      if (e.flash > 0) e.flash -= dt;
      const k = e.kind;
      const ty = e.state === 'up' ? E_UP_Y : E_DOWN_Y;
      e.y += (ty - e.y) * Math.min(1, dt * 14);
      if (e.state === 'hide') {
        e.t -= dt;
        if (e.t <= 0) {
          if (windups >= S.round + 1) { e.t = 0.3; continue; }
          e.state = 'up'; e.thrown = false; e.fake = Math.random() < k.fake;
          e.t = e.fake ? rand(0.35, 0.55) : k.wind * (S.round === 2 ? 0.9 : 1);
          windups++;
        }
      } else if (e.state === 'up') {
        e.t -= dt;
        if (!e.thrown && !e.fake && e.t > 0 && Math.random() < dt * 6) SFX.warn();
        if (e.t <= 0) {
          if (e.fake) { e.state = 'hide'; e.t = rand(0.5, 1.2); }
          else if (!e.thrown) { enemyThrow(e); e.thrown = true; e.t = 0.45; }
          else { e.state = 'hide'; e.t = rand(k.hideMin, k.hideMax); }
        }
      } else if (e.state === 'stun') {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'hide'; e.t = rand(k.hideMin, k.hideMax) * 0.8; }
      }
    }

    // ボール
    for (const b of S.balls) {
      if (b.dead) continue;
      if (b.homing) {
        const tg = b.homing;
        if (tg.dead) { b.dead = true; continue; }
        const p = ballPos(tg);
        const dx = p.x - b.hx, dy = p.y - b.hy, d = Math.hypot(dx, dy);
        const step = 950 * dt;
        if (d <= step + 10) {
          b.dead = true; tg.dead = true;
          S.score += 80; S.stats.intercept++;
          addSplat(p.x, p.y, true); addText(p.x, p.y - 14, 'うちおとし!+80', '#0ea5e9'); SFX.intercept();
          updateHud();
        } else { b.hx += dx / d * step; b.hy += dy / d * step; }
        continue;
      }
      b.t += dt;
      if (b.t >= b.dur) {
        b.dead = true;
        if (b.owner === 'me') resolveMyBall(b.x1, b.y1);
        else enemyBallArrive(b);
        if (S.over) return;
      }
    }
    S.balls = S.balls.filter(b => !b.dead);

    // ラウンドクリア
    if (S.enemies.every(e => e.state === 'out') && S.nextRoundT <= 0) {
      S.score += 300; SFX.clear();
      S.balls = [];
      if (S.round < ROUNDS.length - 1) { S.time += 20; addText(W / 2, 200, '⏱ +20びょう', '#16a34a'); }
      if (S.round >= ROUNDS.length - 1) { updateHud(); endGame(true, 'ゆうしょう!'); return; }
      S.banner = { text: 'ラウンドクリア!', sub: '+300  ⏱+20びょう', t: 1.4 };
      S.nextRoundT = 0.01;
    }
    updateHud();
  }

  // ---- 描画 ----
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawWall(cx, top, w, h, hp, max) {
    if (hp <= 0) {
      ctx.fillStyle = '#eef4fb';
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx + i * w / 5, top + h, 9, Math.PI, 0); ctx.fill(); }
      return;
    }
    const ratio = hp / max;
    const hh = h * (0.45 + 0.55 * ratio);
    const y = top + h - hh;
    ctx.fillStyle = '#ffffff'; roundRect(cx - w / 2, y, w, hh, 10); ctx.fill();
    ctx.strokeStyle = '#a5c8ec'; ctx.lineWidth = 2; ctx.stroke();
    // ブロック模様
    ctx.strokeStyle = 'rgba(120,160,210,.35)'; ctx.lineWidth = 1;
    for (let yy = y + 12; yy < top + h; yy += 12) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + 4, yy); ctx.lineTo(cx + w / 2 - 4, yy); ctx.stroke(); }
    if (ratio < 0.67) {
      ctx.strokeStyle = 'rgba(80,110,150,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 10, y + 2); ctx.lineTo(cx - 3, y + hh * 0.4); ctx.lineTo(cx - 12, y + hh * 0.7); ctx.stroke();
    }
    if (ratio < 0.4) {
      ctx.beginPath(); ctx.moveTo(cx + 18, y + 2); ctx.lineTo(cx + 12, y + hh * 0.5); ctx.lineTo(cx + 22, y + hh * 0.9); ctx.stroke();
    }
  }

  function draw() {
    // 空と雪原
    const g = ctx.createLinearGradient(0, 0, 0, 100);
    g.addColorStop(0, '#7fb8f0'); g.addColorStop(1, '#cfe8ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 100);
    ctx.fillStyle = '#e3eefa';
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.quadraticCurveTo(90, 60, 180, 92); ctx.quadraticCurveTo(270, 55, 360, 95); ctx.lineTo(360, 110); ctx.lineTo(0, 110); ctx.fill();
    ctx.fillStyle = '#f7fbff'; ctx.fillRect(0, 100, W, H - 100);
    // 雪のつぶ
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    const tt = performance.now() / 1000;
    for (let i = 0; i < 26; i++) {
      const x = (i * 53 + tt * 12 * (1 + i % 3)) % W, y = (i * 97 + tt * 30 * (1 + i % 2)) % 100;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + i % 2, 0, Math.PI * 2); ctx.fill();
    }
    // かくれゾーン
    const hiding = S && isHiding();
    ctx.fillStyle = hiding ? 'rgba(59,130,246,.18)' : 'rgba(59,130,246,.08)';
    ctx.fillRect(0, HIDE_ZONE_Y, W, H - HIDE_ZONE_Y);
    ctx.strokeStyle = 'rgba(59,130,246,.45)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, HIDE_ZONE_Y); ctx.lineTo(W, HIDE_ZONE_Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,58,138,.6)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(hiding ? '🛡 かくれ中…雪玉づくり' : '👇 ここをおしっぱなしで かくれる', W / 2, HIDE_ZONE_Y + 18);
    ctx.fillText('🎯 上をタップで なげる', W / 2, HIDE_ZONE_Y - 8);

    if (!S) return;

    // 相手
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const e of S.enemies) {
      // HP
      if (e.state !== 'out') {
        ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ef4444';
        ctx.fillText('♥'.repeat(e.hp), e.x, 96);
      }
      if (e.state === 'out') {
        ctx.font = '30px serif'; ctx.fillText('🏳️', e.x, E_UP_Y + 6);
      } else {
        ctx.save();
        if (e.flash > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(e.flash * 40);
        ctx.font = (e.kind.big ? 46 : 36) + 'px serif';
        ctx.fillText(e.kind.emoji, e.x, e.y);
        ctx.restore();
        if (e.state === 'stun') { ctx.font = '18px serif'; ctx.fillText('💫', e.x, e.y - 26); }
        if (e.state === 'up' && !e.thrown) {
          const blink = Math.sin(performance.now() / 60) > 0;
          ctx.fillStyle = blink ? '#ef4444' : '#f59e0b';
          ctx.beginPath(); ctx.arc(e.x + 22, e.y - 24, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('!', e.x + 22, e.y - 23);
          ctx.fillStyle = '#1d2a44';
        }
      }
      drawWall(e.x, E_WALL_Y, E_WALL_W, E_WALL_H, e.wall, e.kind.wall);
    }

    // プレイヤー
    ctx.save();
    if (S.invuln > 0 && Math.sin(performance.now() / 50) > 0) ctx.globalAlpha = 0.4;
    ctx.font = '42px serif';
    const face = S.hitFlash > 0 ? '😵' : (hiding ? '😣' : '😆');
    ctx.fillText(face, PX, S.py);
    ctx.font = '22px serif';
    if (!hiding) ctx.fillText('🧤', PX + 26, S.py + 6);
    ctx.restore();
    drawWall(PX, P_WALL_Y, P_WALL_W, P_WALL_H, S.wall, WALL_MAX);
    // かべHP
    ctx.fillStyle = 'rgba(30,58,138,.15)'; roundRect(PX - 60, P_WALL_Y + P_WALL_H + 6, 120, 8, 4); ctx.fill();
    ctx.fillStyle = S.wall > 2 ? '#60a5fa' : '#f87171';
    if (S.wall > 0) { roundRect(PX - 60, P_WALL_Y + P_WALL_H + 6, 120 * S.wall / WALL_MAX, 8, 4); ctx.fill(); }
    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('かべ', PX - 66, P_WALL_Y + P_WALL_H + 10);
    // 雪玉ストック
    ctx.textAlign = 'left';
    ctx.fillText('雪玉', 16, 480);
    for (let i = 0; i < STOCK_MAX; i++) {
      ctx.beginPath(); ctx.arc(56 + i * 22, 480, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < S.stock ? '#ffffff' : 'rgba(30,58,138,.12)'; ctx.fill();
      ctx.strokeStyle = i < S.stock ? '#3b82f6' : '#9bb8d8'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (S.stock < STOCK_MAX && S.craft > 0) {
      const i = S.stock;
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(56 + i * 22, 480, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (S.craft / CRAFT_T)); ctx.stroke();
    }
    if (S.stock >= STOCK_MAX && hiding && S.wall < WALL_MAX) {
      ctx.fillStyle = '#2563eb'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('🔧 かべなおし中', W - 12, 480);
    }

    // ボール
    for (const b of S.balls) {
      let x, y, r, sx, sy;
      if (b.homing) { x = b.hx; y = b.hy; r = 7; sx = x; sy = y + 6; }
      else {
        const p = ballPos(b); x = p.x; y = p.y;
        sx = b.x0 + (b.x1 - b.x0) * p.p; sy = b.y0 + (b.y1 - b.y0) * p.p + 8;
        r = b.owner === 'me' ? 10 - 4 * p.p : (5 + 7 * p.p) * (b.big ? 1.6 : 1);
      }
      ctx.fillStyle = 'rgba(30,58,138,.15)';
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = b.owner === 'me' ? '#60a5fa' : '#f87171'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // FX
    ctx.fillStyle = '#ffffff';
    for (const f of S.fx) {
      ctx.globalAlpha = Math.max(0, f.t * 2);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b7d2ef'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of S.texts) {
      ctx.globalAlpha = Math.min(1, t.t * 2);
      ctx.font = 'bold 14px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
      ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (S.hitFlash > 0) { ctx.fillStyle = `rgba(239,68,68,${S.hitFlash * 0.4})`; ctx.fillRect(0, 0, W, H); }

    if (S.banner) {
      ctx.fillStyle = 'rgba(30,58,138,.8)'; ctx.fillRect(0, 210, W, 80);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(S.banner.text, W / 2, 240);
      ctx.font = 'bold 15px sans-serif'; ctx.fillText(S.banner.sub, W / 2, 272);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ---- ループ ----
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (running) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---- 入力 ----
  function canvasPos(ev) {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  cv.addEventListener('pointerdown', ev => {
    if (!running) return;
    ev.preventDefault();
    const p = canvasPos(ev);
    const tgt = S.balls.length ? interceptAt(p.x, p.y) : null;
    if (tgt && !isHiding()) { launchIntercept(tgt); return; }
    if (p.y >= HIDE_ZONE_Y) {
      pointers.set(ev.pointerId, 'hide');
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    } else {
      throwAt(p.x, p.y);
    }
  });
  const release = ev => { pointers.delete(ev.pointerId); };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('lostpointercapture', release);
  cv.addEventListener('contextmenu', ev => ev.preventDefault());

  function throwAtFort(i) {
    const e = S.enemies[i];
    if (!e) return;
    const visible = e.state === 'up' || (e.wall <= 0 && e.state !== 'out');
    throwAt(e.x, visible ? e.y - 2 : E_WALL_Y + 16);
  }
  window.addEventListener('keydown', ev => {
    if (!running) return;
    const k = ev.key;
    if (k === ' ' || k === 'ArrowDown' || k === 's' || k === 'S') { keyHide = true; ev.preventDefault(); return; }
    if (ev.repeat) return;
    if (k === 'ArrowLeft' || k === '1' || k === 'a' || k === 'A') { throwAtFort(0); ev.preventDefault(); }
    else if (k === 'ArrowUp' || k === '2' || k === 'w' || k === 'W') { throwAtFort(1); ev.preventDefault(); }
    else if (k === 'ArrowRight' || k === '3' || k === 'd' || k === 'D') { throwAtFort(2); ev.preventDefault(); }
    else if (k === 'x' || k === 'X' || k === 'Enter') {
      const b = nearestEnemyBall();
      if (b) launchIntercept(b);
      ev.preventDefault();
    }
  });
  window.addEventListener('keyup', ev => {
    const k = ev.key;
    if (k === ' ' || k === 'ArrowDown' || k === 's' || k === 'S') keyHide = false;
  });
  window.addEventListener('blur', () => { keyHide = false; pointers.clear(); });

  // ---- 開始・終了 ----
  function endGame(win, title) {
    if (S.over) return;
    S.over = true; running = false;
    pointers.clear(); keyHide = false;
    let bonus = 0;
    if (win) { bonus = Math.ceil(S.time) * 10 + S.hearts * 200; S.score += bonus; SFX.clear(); }
    else SFX.lose();
    updateHud();
    const sc = S.score;
    const rank = sc >= 7000 ? 'S 🏆' : sc >= 5200 ? 'A 🥇' : sc >= 3000 ? 'B 🥈' : 'C 🥉';
    $('resultTitle').textContent = win ? '🏆 ゆうしょう!ゆきがっせんチャンピオン' : (title === 'タイムアップ!' ? '⏱ タイムアップ!' : '☃️ やられた…');
    $('resultRank').textContent = `ランク ${rank}`;
    const reached = win ? '3チームぜんぶに勝った!' : `ラウンド${S.round + 1}(${ROUNDS[S.round].title})まで進んだ`;
    $('resultText').innerHTML =
      `${reached}<br>スコア <b>${sc}</b>${win ? `(のこり時間・❤️ボーナス +${bonus})` : ''}<br>` +
      `ヒット ${S.stats.hits} / うちおとし ${S.stats.intercept} / かべ当て ${S.stats.walls} / なげた数 ${S.stats.thrown}<br>` +
      (win ? 'こんどはもっと早く勝ってみよう!' : 'コツ: ⚠️ を見たらすぐかくれて、投げおわった直後に顔を出そう!');
    setTimeout(() => $('result').classList.remove('hidden'), 700);
  }

  function start() {
    initAudio();
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    resetGame();
    running = true;
  }
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  // 説明画面の背景用に初期状態を描画
  resetGame();
  msgEl.textContent = '';
  requestAnimationFrame(loop);
})();
