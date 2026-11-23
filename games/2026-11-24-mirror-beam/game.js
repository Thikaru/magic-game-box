// てらせ!かがみ光線パズル
// パズル: 光はつけっぱなし。かがみを回すと即座に光の道がかわり、💣を照らすとドカン。
(() => {
  'use strict';
  const W = 360, H = 360;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const introEl = $('intro'), resultEl = $('result'), msgEl = $('msg');
  const hudStage = $('hudStage'), hudTime = $('hudTime'), hudLife = $('hudLife'), hudScore = $('hudScore');

  const START_TIME = 120, CLEAR_TIME = 10, MAX_LIFE = 3;
  const OX = 36, OY = 22, GS = 316;   // 盤面の位置とサイズ
  // N:盤面 M:光の道のかがみ D:ダミーかがみ B:💣 G:💎 F:🔒 Wl:🧱
  const STAGES = [
    { N: 5, M: 2, D: 0, B: 1, G: 2, F: 0, Wl: 0 },
    { N: 5, M: 3, D: 1, B: 2, G: 2, F: 0, Wl: 0 },
    { N: 6, M: 3, D: 2, B: 3, G: 3, F: 0, Wl: 0 },
    { N: 6, M: 4, D: 2, B: 3, G: 3, F: 1, Wl: 0 },
    { N: 6, M: 4, D: 3, B: 4, G: 3, F: 1, Wl: 1 },
    { N: 7, M: 5, D: 3, B: 5, G: 4, F: 1, Wl: 1 },
    { N: 7, M: 5, D: 4, B: 5, G: 4, F: 2, Wl: 2 },
    { N: 7, M: 6, D: 4, B: 6, G: 4, F: 2, Wl: 2 },
    { N: 7, M: 6, D: 5, B: 7, G: 5, F: 2, Wl: 2 },
    { N: 7, M: 7, D: 5, B: 7, G: 5, F: 2, Wl: 2 },
  ];

  let phase = 'intro';
  let stageIdx, N, grid, srcRow, par, taps, time, life, score, perfects, clearTimer, overTimer;
  let cursor = { x: 0, y: 0 }, showCursor = false, effects = [], shake = 0, lastT, beam;
  let audioCtx = null;

  // ---------- サウンド(自前生成) ----------
  function initAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.25) {
    if (!audioCtx) return;
    const len = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = audioCtx.createBufferSource(), g = audioCtx.createGain();
    g.gain.value = vol; s.buffer = buf; s.connect(g).connect(audioCtx.destination); s.start();
  }
  const sfx = {
    flip: () => beep(880, 0.06, 'triangle', 0.08, 300),
    lock: () => beep(150, 0.1, 'square', 0.05),
    gem: () => beep(1320, 0.12, 'sine', 0.06),
    boom: () => { noise(0.5, 0.3); beep(120, 0.4, 'sawtooth', 0.08, -80); },
    clear: () => { [660, 830, 990, 1320].forEach((f, i) => beep(f, 0.16, 'triangle', 0.1, 0, i * 0.08)); },
    over: () => { [440, 349, 262].forEach((f, i) => beep(f, 0.25, 'sine', 0.1, 0, i * 0.18)); },
  };

  // ---------- 盤面ロジック ----------
  const ri = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  // '/' : (dx,dy)->(-dy,-dx)   '\' : (dx,dy)->(dy,dx)
  const turn = (m, dx, dy) => (m === '/' ? [-dy, -dx] : [dy, dx]);
  const other = (m) => (m === '/' ? '\\' : '/');

  function trace(g, row) {
    let x = -1, y = row, dx = 1, dy = 0;
    const pts = [[-0.1, row + 0.5]];
    const lit = new Set(), mirrors = [], seen = new Set();
    let bomb = null;
    for (let step = 0; step < 400; step++) {
      x += dx; y += dy;
      if (!inB(x, y)) { pts.push([x + 0.5 - dx * 0.5, y + 0.5 - dy * 0.5]); break; }
      const sk = x + ',' + y + ',' + dx + ',' + dy;
      if (seen.has(sk)) break;
      seen.add(sk);
      const c = g[y][x];
      if (c.k === 'W') { pts.push([x + 0.5 - dx * 0.5, y + 0.5 - dy * 0.5]); break; }
      if (c.k === 'B') { pts.push([x + 0.5, y + 0.5]); bomb = { x, y }; break; }
      if (c.k === 'G') lit.add(x + ',' + y);
      if (c.k === 'M') { pts.push([x + 0.5, y + 0.5]); mirrors.push({ x, y }); [dx, dy] = turn(c.m, dx, dy); }
    }
    return { pts, lit, mirrors, bomb };
  }
  function gemCount(g) { let n = 0; g.forEach((r) => r.forEach((c) => { if (c.k === 'G') n++; })); return n; }
  function isSolved(g, t) { return !t.bomb && t.lit.size === gemCount(g); }

  function genPath(cfg) {
    for (let a = 0; a < 3000; a++) {
      const r = ri(N);
      let x = 0, y = r, dx = 1, dy = 0, mirrors = 0, segLen = 0, ok = true;
      const cells = [], vis = new Set();
      while (inB(x, y)) {
        const key = x + ',' + y;
        if (vis.has(key)) { ok = false; break; }
        vis.add(key);
        let mir = null;
        const nx = x + dx, ny = y + dy;
        const straightBad = !inB(nx, ny) || vis.has(nx + ',' + ny);
        if (mirrors < cfg.M && segLen >= 1 && (Math.random() < 0.38 || straightBad)) {
          const opts = shuffle(['/', '\\']).filter((m) => {
            const [tx, ty] = turn(m, dx, dy);
            return inB(x + tx, y + ty) && !vis.has((x + tx) + ',' + (y + ty));
          });
          if (opts.length) { mir = opts[0]; [dx, dy] = turn(mir, dx, dy); mirrors++; segLen = 0; }
          else segLen++;
        } else segLen++;
        cells.push({ x, y, mir, seg: mirrors });
        x += dx; y += dy;
      }
      if (!ok || mirrors !== cfg.M) continue;
      const plain = cells.filter((c) => !c.mir);
      const last = plain.filter((c) => c.seg === cfg.M);
      if (!last.length || plain.length < cfg.G) continue;
      return { r, cells, plain, last };
    }
    return null;
  }

  function simulate(g, row) {
    for (let i = 0; i < 60; i++) {
      const t = trace(g, row);
      if (t.bomb) return false;
      if (isSolved(g, t)) return true;
      const wrong = t.mirrors.map((p) => g[p.y][p.x]).find((c) => c.sol && c.m !== c.sol);
      if (!wrong) return false;
      wrong.m = wrong.sol;
    }
    return false;
  }

  function buildStage(cfg) {
    N = cfg.N;
    for (let attempt = 0; attempt < 400; attempt++) {
      const p = genPath(cfg);
      if (!p) continue;
      const g = [];
      for (let y = 0; y < N; y++) { g.push([]); for (let x = 0; x < N; x++) g[y].push({ k: '.' }); }
      const onPath = new Set(p.cells.map((c) => c.x + ',' + c.y));
      const pathMirrors = [];
      p.cells.forEach((c) => {
        if (c.mir) { g[c.y][c.x] = { k: 'M', m: c.mir, sol: c.mir, fixed: false }; pathMirrors.push(g[c.y][c.x]); }
      });
      // 💎: 最後の区間に1つ、残りはほかの道に
      const lastGem = p.last[ri(p.last.length)];
      g[lastGem.y][lastGem.x] = { k: 'G' };
      shuffle(p.plain.filter((c) => c !== lastGem)).slice(0, cfg.G - 1).forEach((c) => { g[c.y][c.x] = { k: 'G' }; });
      // まちがった向きの先を💣の候補にする
      const cand = [];
      p.cells.forEach((c) => {
        if (!c.mir) return;
        const prev = p.cells[p.cells.indexOf(c) - 1];
        const idx = p.cells.indexOf(c);
        let idx0 = prev ? [c.x - prev.x, c.y - prev.y] : [1, 0];
        if (idx === 0) idx0 = [1, 0];
        let [dx, dy] = turn(other(c.mir), idx0[0], idx0[1]);
        let x = c.x + dx, y = c.y + dy;
        while (inB(x, y)) { if (!onPath.has(x + ',' + y)) cand.push(x + ',' + y); x += dx; y += dy; }
      });
      const empties = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!onPath.has(x + ',' + y)) empties.push(x + ',' + y);
      const used = new Set();
      const take = (pref) => {
        const pool = shuffle((pref || empties).filter((k) => !used.has(k)));
        if (!pool.length) return pref ? take(null) : null;
        used.add(pool[0]); return pool[0].split(',').map(Number);
      };
      let fail = false;
      for (let i = 0; i < cfg.B; i++) {
        const c = take(Math.random() < 0.75 ? cand : null); if (!c) { fail = true; break; }
        g[c[1]][c[0]] = { k: 'B' };
      }
      for (let i = 0; i < cfg.D && !fail; i++) {
        const c = take(null); if (!c) { fail = true; break; }
        g[c[1]][c[0]] = { k: 'M', m: Math.random() < 0.5 ? '/' : '\\', sol: null, fixed: false };
      }
      for (let i = 0; i < cfg.Wl && !fail; i++) {
        const c = take(null); if (!c) { fail = true; break; }
        g[c[1]][c[0]] = { k: 'W' };
      }
      if (fail) continue;
      shuffle(pathMirrors.slice()).slice(0, cfg.F).forEach((m) => { m.fixed = true; });
      const free = pathMirrors.filter((m) => !m.fixed);
      // かきまぜ
      for (let s = 0; s < 60; s++) {
        free.forEach((m) => { m.m = m.sol; });
        const need = Math.max(1, Math.ceil(free.length * 0.5));
        let flips = 0;
        shuffle(free.slice()).forEach((m) => { if (flips < need || Math.random() < 0.4) { m.m = other(m.sol); flips++; } });
        const t0 = trace(g, p.r);
        if (t0.bomb || isSolved(g, t0)) continue;
        const copy = g.map((r) => r.map((c) => Object.assign({}, c)));
        if (!simulate(copy, p.r)) continue;
        grid = g; srcRow = p.r; par = flips;
        return;
      }
    }
    // 万一の保険: 最小構成
    N = 5; grid = []; for (let y = 0; y < N; y++) { grid.push([]); for (let x = 0; x < N; x++) grid[y].push({ k: '.' }); }
    srcRow = 2; grid[2][2] = { k: 'M', m: '/', sol: '\\', fixed: false }; grid[4][2] = { k: 'G' }; par = 1;
  }

  // ---------- 進行 ----------
  function startGame() {
    initAudio();
    stageIdx = 0; time = START_TIME; life = MAX_LIFE; score = 0; perfects = 0;
    effects = []; shake = 0;
    introEl.classList.add('hidden'); resultEl.classList.add('hidden');
    loadStage();
    phase = 'play';
    lastT = performance.now();
    updateHud();
  }
  function loadStage() {
    buildStage(STAGES[stageIdx]);
    taps = 0;
    cursor = { x: 0, y: srcRow };
    beam = trace(grid, srcRow);
    setMsg(`ステージ${stageIdx + 1}:さいしょう ${par} 手でクリアできるよ`);
  }
  function setMsg(t) { msgEl.textContent = t; }

  function toggleAt(x, y) {
    if (phase !== 'play' || !inB(x, y)) return;
    const c = grid[y][x];
    if (c.k !== 'M') return;
    if (c.fixed) { sfx.lock(); setMsg('🔒 このかがみは回せない!'); addFx('text', x, y, '🔒'); return; }
    const before = beam.lit.size;
    c.m = other(c.m); taps++;
    const t = trace(grid, srcRow);
    if (t.bomb) {
      beam = t;  // 一瞬だけ💣に届いた光を見せる
      addFx('boom', t.bomb.x, t.bomb.y);
      shake = 0.35; life--; sfx.boom();
      c.m = other(c.m);
      setTimeout(() => { if (phase === 'play' || phase === 'over') beam = trace(grid, srcRow); }, 180);
      updateHud();
      if (life <= 0) { phase = 'over'; overTimer = 0.9; setMsg('💥 ドカン!ハートがなくなった…'); }
      else setMsg('💥 ドカン!かがみは元にもどったよ');
      return;
    }
    beam = t;
    sfx.flip();
    if (t.lit.size > before) sfx.gem();
    if (isSolved(grid, t)) stageClear();
    updateHud();
  }

  function stageClear() {
    phase = 'clear'; clearTimer = 1.5;
    let gain = 100 + stageIdx * 20, text = `クリア! +${gain}`;
    if (taps <= par) { gain += 50; perfects++; text = `ぴったり!${taps}手 +${gain}`; }
    score += gain; time += CLEAR_TIME;
    setMsg(`✨ ${text}  ⏱+${CLEAR_TIME}`);
    sfx.clear();
    for (let i = 0; i < 18; i++) effects.push({ type: 'spark', x: Math.random() * W, y: Math.random() * H, vy: -40 - Math.random() * 60, life: 1.2 });
  }

  function endGame(win) {
    phase = 'result';
    const cleared = win ? STAGES.length : stageIdx;
    if (win) score += Math.floor(time) * 5;
    let rank = '🥉';
    if (win && perfects >= 7) rank = '👑'; else if (win) rank = '🥇'; else if (cleared >= 6) rank = '🥈';
    $('resultTitle').textContent = win ? '🎉 ぜんステージクリア!' : (life <= 0 ? '💥 ドカン…ゲームオーバー' : '⏱ タイムアップ!');
    $('resultRank').textContent = rank;
    $('resultText').innerHTML = `クリアしたステージ:<b>${cleared}</b> / ${STAGES.length}<br>` +
      `ぴったりクリア:<b>${perfects}</b> 回<br>スコア:<b>${score}</b>` +
      (win ? `<br>(のこり時間ボーナス こみ)` : `<br>光が当たっていないかがみから回すのがコツ!`);
    resultEl.classList.remove('hidden');
    if (win) sfx.clear(); else sfx.over();
    setMsg('');
  }

  function updateHud() {
    hudStage.textContent = `ステージ ${Math.min(stageIdx + 1, STAGES.length)}/${STAGES.length}`;
    hudTime.textContent = `⏱ ${Math.max(0, Math.ceil(time))}`;
    hudLife.textContent = '❤️'.repeat(Math.max(0, life)) + '🖤'.repeat(MAX_LIFE - Math.max(0, life));
    hudScore.textContent = `⭐ ${score}`;
  }

  function addFx(type, x, y, text) {
    const cs = GS / N;
    effects.push({ type, x: OX + (x + 0.5) * cs, y: OY + (y + 0.5) * cs, text, life: type === 'boom' ? 0.7 : 0.8, vy: -30 });
  }

  // ---------- ループ ----------
  function update(dt) {
    if (phase === 'play') {
      time -= dt;
      if (time <= 0) { time = 0; updateHud(); endGame(false); return; }
    } else if (phase === 'clear') {
      clearTimer -= dt;
      if (clearTimer <= 0) {
        stageIdx++;
        if (stageIdx >= STAGES.length) { updateHud(); endGame(true); return; }
        loadStage(); phase = 'play';
      }
    } else if (phase === 'over') {
      overTimer -= dt;
      if (overTimer <= 0) endGame(false);
    }
    effects.forEach((e) => { e.life -= dt; if (e.vy) e.y += e.vy * dt; });
    effects = effects.filter((e) => e.life > 0);
    if (shake > 0) shake -= dt;
    if (phase === 'play' || phase === 'clear') updateHud();
  }

  function emoji(ch, x, y, size) {
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
  }

  function draw(now) {
    ctx.save();
    ctx.fillStyle = '#14122a'; ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    if (!grid) { ctx.restore(); return; }
    const cs = GS / N;
    const onBeam = new Set(beam.mirrors.map((p) => p.x + ',' + p.y));
    // マス
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = OX + x * cs, py = OY + y * cs;
      ctx.fillStyle = (x + y) % 2 ? '#1f1c3d' : '#24204a';
      ctx.fillRect(px, py, cs, cs);
      const c = grid[y][x];
      if (c.k === 'G' && beam.lit.has(x + ',' + y)) {
        ctx.fillStyle = 'rgba(110,231,255,.28)'; ctx.fillRect(px, py, cs, cs);
      }
    }
    ctx.strokeStyle = 'rgba(185,156,255,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(OX, OY, GS, GS);
    // ライト
    const sy = OY + (srcRow + 0.5) * cs;
    ctx.save(); ctx.translate(OX - 16, sy); emoji('🔦', 0, 0, 24); ctx.restore();
    // 光線
    const pulse = 0.75 + 0.25 * Math.sin(now / 120);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    beam.pts.forEach((p, i) => {
      const px = OX + p[0] * cs, py = OY + p[1] * cs;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = beam.bomb ? 'rgba(255,90,90,.45)' : `rgba(255,228,92,${0.3 * pulse})`; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = beam.bomb ? '#ff8080' : '#fff6b0'; ctx.lineWidth = 3.5; ctx.stroke();
    // 物体
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = grid[y][x];
      const cx = OX + (x + 0.5) * cs, cy = OY + (y + 0.5) * cs, h = cs * 0.36;
      if (c.k === 'M') {
        if (onBeam.has(x + ',' + y)) {
          ctx.strokeStyle = 'rgba(255,228,92,.9)'; ctx.lineWidth = 2.5;
          ctx.strokeRect(cx - cs / 2 + 3, cy - cs / 2 + 3, cs - 6, cs - 6);
        }
        ctx.strokeStyle = c.fixed ? '#8a8aa0' : '#d9f2ff'; ctx.lineWidth = 6;
        ctx.beginPath();
        if (c.m === '/') { ctx.moveTo(cx - h, cy + h); ctx.lineTo(cx + h, cy - h); }
        else { ctx.moveTo(cx - h, cy - h); ctx.lineTo(cx + h, cy + h); }
        ctx.stroke();
        ctx.strokeStyle = c.fixed ? '#55556a' : '#7fc8ff'; ctx.lineWidth = 2; ctx.stroke();
        if (c.fixed) emoji('🔒', cx + cs * 0.3, cy + cs * 0.3, cs * 0.26);
      } else if (c.k === 'G') {
        const lit = beam.lit.has(x + ',' + y);
        ctx.globalAlpha = lit ? 1 : 0.55;
        emoji('💎', cx, cy + (lit ? Math.sin(now / 150 + x) * 2 : 0), cs * 0.5);
        ctx.globalAlpha = 1;
      } else if (c.k === 'B') {
        emoji('💣', cx, cy, cs * 0.5);
      } else if (c.k === 'W') {
        emoji('🧱', cx, cy, cs * 0.62);
      }
    }
    // カーソル
    if (showCursor && phase === 'play') {
      ctx.strokeStyle = '#ff9cf0'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.strokeRect(OX + cursor.x * cs + 2, OY + cursor.y * cs + 2, cs - 4, cs - 4);
      ctx.setLineDash([]);
    }
    // エフェクト
    effects.forEach((e) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, e.life * 1.5));
      if (e.type === 'boom') emoji('💥', e.x, e.y, cs * (0.6 + (0.7 - e.life) * 1.4));
      else if (e.type === 'text') emoji(e.text, e.x, e.y, 22);
      else if (e.type === 'spark') emoji('✨', e.x, e.y, 18);
      ctx.globalAlpha = 1;
    });
    if (phase === 'clear') {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H / 2 - 34, W, 68);
      ctx.fillStyle = '#ffe45c'; ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(taps <= par ? 'ぴったり クリア!' : 'クリア!', W / 2, H / 2);
    }
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    update(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  // ---------- 入力 ----------
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (phase !== 'play') return;
    const r = canvas.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width), py = (ev.clientY - r.top) * (H / r.height);
    const cs = GS / N;
    const x = Math.floor((px - OX) / cs), y = Math.floor((py - OY) / cs);
    showCursor = false;
    if (inB(x, y)) { cursor = { x, y }; toggleAt(x, y); }
  });
  window.addEventListener('keydown', (ev) => {
    if (phase !== 'play') return;
    const k = ev.key;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (mv) {
      ev.preventDefault(); showCursor = true;
      cursor.x = Math.max(0, Math.min(N - 1, cursor.x + mv[0]));
      cursor.y = Math.max(0, Math.min(N - 1, cursor.y + mv[1]));
    } else if (k === ' ' || k === 'Enter') {
      ev.preventDefault(); showCursor = true;
      toggleAt(cursor.x, cursor.y);
    }
  });
  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);

  lastT = performance.now();
  requestAnimationFrame(frame);
})();
