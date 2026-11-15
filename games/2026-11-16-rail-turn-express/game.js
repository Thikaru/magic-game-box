// まわして!レールきゅうこう — Vanilla JS + Canvas
(() => {
  'use strict';
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const COLS = 7, ROWS = 9, T = 60;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const COLORS = ['#ff5a5a', '#4da3ff', '#ffd23f'];
  const CNAMES = ['あか', 'あお', 'きいろ'];
  const GAME_TIME = 90, MAX_SEATS = 3;
  const START = { x: 1, y: 4 };

  const $ = id => document.getElementById(id);
  const ui = {
    score: $('score'), time: $('time'), lives: $('lives'), seats: $('seats'),
    intro: $('intro'), result: $('result'), resTitle: $('resTitle'), resMsg: $('resMsg'),
    resScore: $('resScore'), resDetail: $('resDetail'), resBest: $('resBest'),
  };

  let grid, train, trail, state = 'intro', score, timeLeft, lives, seats, speed;
  let stateTimer = 0, floats = [], delivered = 0, bestCombo = 0, cursor = null, shake = 0;

  // ---------- サウンド(Web Audio で自前生成) ----------
  let ac = null;
  function initAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function beep(freq, dur, type = 'square', vol = 0.08, delay = 0) {
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    rotate: () => beep(660, 0.05, 'square', 0.05),
    deny: () => beep(140, 0.12, 'sawtooth', 0.06),
    pick: () => { beep(880, 0.08, 'triangle', 0.1); beep(1175, 0.1, 'triangle', 0.1, 0.07); },
    deliver: n => { for (let i = 0; i < n + 2; i++) beep(523 * Math.pow(1.26, i), 0.12, 'triangle', 0.1, i * 0.08); },
    crash: () => { beep(180, 0.3, 'sawtooth', 0.12); beep(90, 0.4, 'square', 0.1, 0.1); },
    whistle: () => { beep(740, 0.25, 'sine', 0.08); beep(988, 0.35, 'sine', 0.08, 0.05); },
  };

  // ---------- レール ----------
  const bit = d => 1 << d;
  const rot = m => ((m << 1) | (m >> 3)) & 15;
  const inB = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const STRAIGHTS = [5, 10], CURVES = [3, 6, 12, 9];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function newTile() {
    const r = Math.random();
    if (r < 0.07) return { kind: 'rock', m: 0, st: -1, pax: -1, anim: 0 };
    if (r < 0.17) return { kind: 'cross', m: 15, st: -1, pax: -1, anim: 0 };
    return { kind: 'track', m: r < 0.55 ? pick(STRAIGHTS) : pick(CURVES), st: -1, pax: -1, anim: 0 };
  }

  function buildGrid() {
    grid = [];
    for (let y = 0; y < ROWS; y++) {
      grid.push([]);
      for (let x = 0; x < COLS; x++) grid[y].push(newTile());
    }
    // スタート付近は安全に
    for (let x = 0; x <= 3; x++) grid[START.y][x] = { kind: 'track', m: 10, st: -1, pax: -1, anim: 0 };
    // 駅を3つ(色ごとに1つ)、スタート列や互いに近すぎない場所へ
    const placed = [];
    for (let c = 0; c < 3; c++) {
      for (let tries = 0; tries < 500; tries++) {
        const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
        if (y === START.y || Math.abs(y - START.y) < 1) continue;
        if (placed.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
        const t = grid[y][x];
        if (t.kind === 'rock') grid[y][x] = { kind: 'track', m: pick(CURVES), st: -1, pax: -1, anim: 0 };
        grid[y][x].st = c;
        placed.push({ x, y });
        break;
      }
    }
    // 駅のまわりの岩をどけて行き止まりを減らす
    for (const p of placed) {
      for (let d = 0; d < 4; d++) {
        const nx = p.x + DX[d], ny = p.y + DY[d];
        if (inB(nx, ny) && grid[ny][nx].kind === 'rock') grid[ny][nx] = { kind: 'track', m: pick(STRAIGHTS), st: -1, pax: -1, anim: 0 };
      }
    }
  }

  function paxCount() {
    let n = 0;
    for (const row of grid) for (const t of row) if (t.pax >= 0) n++;
    return n;
  }
  function spawnPax() {
    const ahead = aheadCell();
    for (let tries = 0; tries < 300; tries++) {
      const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
      const t = grid[y][x];
      if (t.kind === 'rock' || t.st >= 0 || t.pax >= 0) continue;
      if (train && x === train.x && y === train.y) continue;
      if (ahead && ahead.x === x && ahead.y === y) continue;
      // 色はなるべくバラけさせる
      const onBoard = [0, 0, 0];
      for (const row of grid) for (const q of row) if (q.pax >= 0) onBoard[q.pax]++;
      const min = Math.min(...onBoard);
      const cands = [0, 1, 2].filter(c => onBoard[c] === min);
      t.pax = pick(cands);
      return;
    }
  }
  function fillPax() { while (paxCount() < 3) spawnPax(); }

  // ---------- 汽車 ----------
  function placeTrain() {
    train = { x: START.x, y: START.y, inS: 3, outS: 1, t: 0 };
    trail = [];
    const p = trainPos();
    trail.push({ x: p.x, y: p.y });
  }
  function center(x, y) { return { x: x * T + T / 2, y: y * T + T / 2 }; }
  function edge(x, y, s) { const c = center(x, y); return { x: c.x + DX[s] * T / 2, y: c.y + DY[s] * T / 2 }; }
  function trainPos() {
    const A = edge(train.x, train.y, train.inS), C = center(train.x, train.y), B = edge(train.x, train.y, train.outS);
    const t = train.t, u = 1 - t;
    return {
      x: u * u * A.x + 2 * u * t * C.x + t * t * B.x,
      y: u * u * A.y + 2 * u * t * C.y + t * t * B.y,
      a: Math.atan2(2 * u * (C.y - A.y) + 2 * t * (B.y - C.y), 2 * u * (C.x - A.x) + 2 * t * (B.x - C.x)),
    };
  }
  function aheadCell() {
    if (!train) return null;
    const x = train.x + DX[train.outS], y = train.y + DY[train.outS], side = (train.outS + 2) % 4;
    const ok = inB(x, y) && grid[y][x].kind !== 'rock' && (grid[y][x].m & bit(side)) !== 0;
    return { x, y, side, ok, inside: inB(x, y) };
  }

  function enterCell(x, y, side) {
    if (!inB(x, y)) return crash();
    const tile = grid[y][x];
    if (tile.kind === 'rock' || !(tile.m & bit(side))) return crash();
    let out;
    if (tile.kind === 'cross') out = (side + 2) % 4;
    else { const rest = tile.m & ~bit(side); out = [0, 1, 2, 3].find(d => rest & bit(d)); }
    train.x = x; train.y = y; train.inS = side; train.outS = out;
    const c = center(x, y);
    // 駅でおろす
    if (tile.st >= 0) {
      const n = seats.filter(s => s === tile.st).length;
      if (n > 0) {
        seats = seats.filter(s => s !== tile.st);
        const pts = 100 * n * n;
        score += pts; delivered += n; bestCombo = Math.max(bestCombo, n);
        speed = Math.min(2.2, speed + 0.06 * n);
        floats.push({ x: c.x, y: c.y, text: '+' + pts + (n > 1 ? ' ×' + n + '人!' : ''), life: 1.2, color: COLORS[tile.st] });
        sfx.deliver(n);
      }
    }
    // お客さんを乗せる
    if (tile.pax >= 0) {
      if (seats.length < MAX_SEATS) {
        seats.push(tile.pax);
        floats.push({ x: c.x, y: c.y, text: CNAMES[tile.pax] + 'のお客さん', life: 0.9, color: COLORS[tile.pax] });
        tile.pax = -1;
        sfx.pick();
        fillPax();
      } else {
        floats.push({ x: c.x, y: c.y, text: 'まんいん!', life: 0.8, color: '#fff' });
      }
    }
  }

  function crash() {
    state = 'crash'; stateTimer = 1.3; lives--; shake = 0.5;
    sfx.crash();
    const p = trainPos();
    floats.push({ x: p.x, y: p.y, text: '💥 だっせん!', life: 1.3, color: '#fff' });
  }

  function respawn() {
    seats = [];
    for (let x = START.x; x <= START.x + 2; x++) {
      const t = grid[START.y][x];
      grid[START.y][x] = { kind: 'track', m: 10, st: -1, pax: t.pax, anim: 0 };
    }
    placeTrain();
    speed = Math.max(0.6, speed * 0.9);
    state = 'ready'; stateTimer = 1.2;
  }

  // ---------- 操作 ----------
  function rotateAt(x, y) {
    if (state !== 'run' && state !== 'ready') return;
    if (!inB(x, y)) return;
    const t = grid[y][x];
    if (t.kind !== 'track') { sfx.deny(); return; }
    if (train.x === x && train.y === y) { sfx.deny(); t.deny = 0.3; return; }
    t.m = rot(t.m); t.anim = 1;
    sfx.rotate();
  }

  function canvasCell(ev) {
    const r = cv.getBoundingClientRect();
    const px = (ev.clientX - r.left) * cv.width / r.width;
    const py = (ev.clientY - r.top) * cv.height / r.height;
    return { x: Math.floor(px / T), y: Math.floor(py / T) };
  }
  cv.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const c = canvasCell(ev);
    cursor = null;
    rotateAt(c.x, c.y);
  });
  window.addEventListener('keydown', ev => {
    if (state !== 'run' && state !== 'ready') return;
    const k = ev.key;
    if (k === ' ' || k === 'Spacebar') {
      ev.preventDefault();
      const a = aheadCell();
      if (a && a.inside) rotateAt(a.x, a.y);
      return;
    }
    const dirs = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    if (k in dirs) {
      ev.preventDefault();
      if (!cursor) { cursor = { x: train.x, y: train.y }; }
      const d = dirs[k];
      cursor.x = Math.max(0, Math.min(COLS - 1, cursor.x + DX[d]));
      cursor.y = Math.max(0, Math.min(ROWS - 1, cursor.y + DY[d]));
      return;
    }
    if ((k === 'Enter' || k === 'z' || k === 'Z') && cursor) {
      ev.preventDefault();
      rotateAt(cursor.x, cursor.y);
    }
  });

  // ---------- 進行 ----------
  function start() {
    initAudio();
    score = 0; timeLeft = GAME_TIME; lives = 3; seats = []; speed = 0.6;
    floats = []; delivered = 0; bestCombo = 0; cursor = null; shake = 0;
    buildGrid();
    placeTrain();
    fillPax();
    state = 'ready'; stateTimer = 2;
    ui.intro.classList.add('hidden');
    ui.result.classList.add('hidden');
    sfx.whistle();
    updateHud();
  }

  function finish(timeUp) {
    state = 'over';
    let best = 0;
    try { best = +localStorage.getItem('railTurnExpressBest') || 0; } catch (e) {}
    const newBest = score > best;
    if (newBest) { best = score; try { localStorage.setItem('railTurnExpressBest', String(score)); } catch (e) {} }
    const rank = score >= 3000 ? 'でんせつの機関士 🏆' : score >= 1500 ? 'ベテラン運転士 🎖️' : score >= 500 ? 'いちにんまえ運転士 🚂' : 'みならい運転士 🔰';
    ui.resTitle.textContent = timeUp ? '🏁 しゅうりょう!' : '💥 ぜんぶだっせん…';
    ui.resMsg.textContent = rank;
    ui.resScore.textContent = score + ' てん';
    ui.resDetail.textContent = '届けたお客さん ' + delivered + '人 / いちどに最大 ' + bestCombo + '人';
    ui.resBest.textContent = newBest ? '✨ ベスト更新!' : 'ベスト: ' + best + ' てん';
    ui.result.classList.remove('hidden');
    if (timeUp) sfx.whistle();
  }

  function update(dt) {
    for (const row of grid || []) for (const t of row) {
      if (t.anim > 0) t.anim = Math.max(0, t.anim - dt * 8);
      if (t.deny > 0) t.deny = Math.max(0, t.deny - dt);
    }
    floats.forEach(f => { f.life -= dt; f.y -= dt * 30; });
    floats = floats.filter(f => f.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt);

    if (state === 'ready') {
      stateTimer -= dt;
      if (stateTimer <= 0) state = 'run';
    } else if (state === 'crash') {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        if (lives <= 0) finish(false); else respawn();
      }
    } else if (state === 'run') {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; updateHud(); finish(true); return; }
      train.t += speed * dt;
      while (train.t >= 1 && state === 'run') {
        train.t -= 1;
        const nx = train.x + DX[train.outS], ny = train.y + DY[train.outS];
        enterCell(nx, ny, (train.outS + 2) % 4);
      }
      if (state === 'crash') train.t = 1;
      const p = trainPos();
      trail.unshift({ x: p.x, y: p.y });
      if (trail.length > 400) trail.length = 400;
    }
    updateHud();
  }

  function updateHud() {
    ui.score.textContent = score;
    ui.time.textContent = Math.ceil(timeLeft);
    ui.lives.textContent = Math.max(0, lives);
    let s = '';
    for (let i = 0; i < MAX_SEATS; i++) s += i < seats.length ? ['🔴', '🔵', '🟡'][seats[i]] : '⚪';
    ui.seats.textContent = s;
  }

  // ---------- 描画 ----------
  function drawRailPath(x, y, a, b) {
    const A = edge(x, y, a), C = center(x, y), B = edge(x, y, b);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(C.x, C.y, B.x, B.y);
  }
  function drawTrack(x, y, t) {
    const pairs = [];
    if (t.kind === 'cross') pairs.push([0, 2], [1, 3]);
    else { const ds = [0, 1, 2, 3].filter(d => t.m & bit(d)); if (ds.length === 2) pairs.push(ds); }
    const layers = [[20, '#6b4423'], [12, '#b8bec8'], [6, '#6b4423']];
    for (const [w, col] of layers) {
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'butt';
      for (const [a, b] of pairs) { drawRailPath(x, y, a, b); ctx.stroke(); }
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
    ctx.fillStyle = '#2a5a3c'; ctx.fillRect(-10, -10, cv.width + 20, cv.height + 20);
    if (!grid) { ctx.restore(); return; }
    const now = performance.now() / 1000;

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = grid[y][x];
      ctx.fillStyle = (x + y) % 2 ? '#2f6343' : '#2a5a3c';
      ctx.fillRect(x * T, y * T, T, T);
      if (t.st >= 0) {
        ctx.fillStyle = COLORS[t.st] + '66';
        ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
        ctx.strokeStyle = COLORS[t.st]; ctx.lineWidth = 3;
        ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
      }
      if (t.kind === 'rock') {
        ctx.font = '36px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🪨', x * T + T / 2, y * T + T / 2 + 2);
        continue;
      }
      const c = center(x, y);
      ctx.save();
      if (t.anim > 0 || t.deny > 0) {
        ctx.translate(c.x, c.y);
        ctx.rotate(-t.anim * Math.PI / 2 + (t.deny > 0 ? Math.sin(t.deny * 60) * 0.1 : 0));
        ctx.translate(-c.x, -c.y);
      }
      drawTrack(x, y, t);
      ctx.restore();
      if (t.st >= 0) {
        ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏠', x * T + 13, y * T + 14);
      }
      if (t.pax >= 0) {
        const bob = Math.sin(now * 4 + x + y) * 2;
        ctx.fillStyle = COLORS[t.pax];
        ctx.beginPath(); ctx.arc(x * T + T - 16, y * T + 16 + bob, 13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🙋', x * T + T - 16, y * T + 17 + bob);
      }
    }

    // 次に入るマス
    if (state === 'run' || state === 'ready') {
      const a = aheadCell();
      ctx.setLineDash([6, 5]); ctx.lineWidth = 3;
      if (a.inside) {
        ctx.strokeStyle = a.ok ? '#7fe0b0' : (Math.floor(now * 6) % 2 ? '#ff3b3b' : '#ffffff');
        ctx.strokeRect(a.x * T + 4, a.y * T + 4, T - 8, T - 8);
      } else {
        // 画面のはしへ向かっている
        const e = edge(train.x, train.y, train.outS);
        ctx.strokeStyle = Math.floor(now * 6) % 2 ? '#ff3b3b' : '#fff';
        ctx.beginPath(); ctx.arc(e.x, e.y, 12, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (cursor) {
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
      ctx.strokeRect(cursor.x * T + 2, cursor.y * T + 2, T - 4, T - 4);
    }

    // 客車(うしろから)
    if (train) {
      const spacing = 30;
      let acc = 0, idx = 0;
      const cars = [];
      for (let i = 1; i < trail.length && cars.length < MAX_SEATS; i++) {
        acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
        if (acc >= spacing * (cars.length + 1)) {
          const j = Math.max(0, i - 3);
          cars.push({ x: trail[i].x, y: trail[i].y, a: Math.atan2(trail[j].y - trail[i].y, trail[j].x - trail[i].x) });
        }
        idx = i;
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.a);
        ctx.fillStyle = '#3b3b55'; roundRect(-12, -10, 24, 20, 5); ctx.fill();
        ctx.fillStyle = i < seats.length ? COLORS[seats[i]] : '#888';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const p = trainPos();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = '#d62f2f'; roundRect(-15, -11, 30, 22, 6); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(6, -5, 8, 10);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-12, -7, 10, 14);
      ctx.restore();
      if (state === 'run' && Math.random() < 0.15) floats.push({ x: p.x, y: p.y - 8, text: '💨', life: 0.5, color: '#fff', small: true });
    }

    // うかぶ文字
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = f.small ? '14px serif' : 'bold 18px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!f.small) { ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x, f.y); }
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, cv.height / 2 - 30, cv.width, 60);
      ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('しゅっぱつ しんこう!', cv.width / 2, cv.height / 2);
    }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state !== 'intro' && state !== 'over') update(dt);
    else if (grid) { for (const row of grid) for (const t of row) t.anim = 0; }
    draw();
    requestAnimationFrame(loop);
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  score = 0; timeLeft = GAME_TIME; lives = 3; seats = [];
  updateHud();
  requestAnimationFrame(loop);
})();
