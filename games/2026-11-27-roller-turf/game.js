// かこんでぬれ!ローラー陣取り
(() => {
  'use strict';
  const COLS = 14, ROWS = 18, CELL = 30;
  const EMPTY = -1, ROCK = -2;
  const STAGE_TIME = 45;
  const MAX_FILL = 40; // 一度にうめられる最大マス数(大きすぎる輪っかは無効)
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 0:上 1:右 2:下 3:左

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  const startBtn = $('startBtn'), retryBtn = $('retryBtn'), nextBtn = $('nextBtn');
  const hudStage = $('hudStage'), hudTime = $('hudTime'), hudMe = $('hudMe'), hudScore = $('hudScore');
  const bar = $('bar'), msgEl = $('msg'), pad = $('pad'), toggleBtn = $('toggleBtn');

  const TEAMS = [
    { name: 'きみ', emoji: '🐰', color: '#ff5d8f', dark: '#c22e62' },
    { name: 'クマ', emoji: '🐻', color: '#4aa3ff', dark: '#1d6cc0' },
    { name: 'カエル', emoji: '🐸', color: '#47c76a', dark: '#23893f' },
    { name: 'ヒヨコ', emoji: '🐥', color: '#ffc23d', dark: '#c98a00' },
  ];
  // ステージ設定: CPU数・CPUの1マス移動時間・輪っか作戦の確率・岩の数
  const STAGES = [
    { cpus: 1, cpuStep: 175, loopRate: 0.04, rocks: 0 },
    { cpus: 2, cpuStep: 168, loopRate: 0.06, rocks: 6 },
    { cpus: 3, cpuStep: 158, loopRate: 0.08, rocks: 10 },
  ];
  const PLAYER_STEP = 140;
  const STARTS = [
    { x: 1, y: ROWS - 2, dir: 0 },
    { x: COLS - 2, y: 1, dir: 2 },
    { x: 1, y: 1, dir: 1 },
    { x: COLS - 2, y: ROWS - 2, dir: 3 },
  ];

  let grid = new Int8Array(COLS * ROWS);
  let flash = new Float32Array(COLS * ROWS);
  let rollers = [];
  let bucket = null; // {x,y}
  let bucketTimer = 0;
  let stageIdx = 0, totalScore = 0;
  let timeLeft = STAGE_TIME;
  let state = 'intro'; // intro | count | play | result
  let countT = 0;
  let lastT = 0;
  let msgTimer = 0;
  let popups = [];

  // ---------- サウンド ----------
  let actx = null;
  function initAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function beep(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    fill(n) { beep(500, 0.08, 'triangle', 0.08); setTimeout(() => beep(750, 0.1, 'triangle', 0.08), 70); if (n > 15) setTimeout(() => beep(1000, 0.15, 'triangle', 0.08), 140); },
    bad() { beep(300, 0.25, 'sawtooth', 0.05, -180); },
    bucket() { beep(300, 0.2, 'sine', 0.1, 500); },
    tick() { beep(880, 0.05, 'square', 0.04); },
    go() { beep(1320, 0.18, 'square', 0.05); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'triangle', 0.08), i * 110)); },
    lose() { [440, 370, 311].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.04), i * 150)); },
  };

  // ---------- 盤面 ----------
  const idx = (x, y) => y * COLS + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

  function setupStage() {
    const st = STAGES[stageIdx];
    grid.fill(EMPTY); flash.fill(0);
    rollers = [];
    const n = 1 + st.cpus;
    for (let i = 0; i < n; i++) {
      const s = STARTS[i];
      const r = {
        id: i, x: s.x, y: s.y, px: s.x, py: s.y, dir: s.dir, queue: [],
        step: i === 0 ? PLAYER_STEP : st.cpuStep, acc: 0, stun: 0, immune: 0,
        ai: { mode: 'roam', legLeft: 0, legLen: 0, turns: 0, turnSign: 1, lenA: 0, lenB: 0 },
      };
      rollers.push(r);
      // スタート地点のまわり2x2
      for (let dy = -1; dy <= 0; dy++) for (let dx = 0; dx <= 1; dx++) {
        const xx = s.x + (s.x < COLS / 2 ? dx : -dx), yy = s.y + (s.y < ROWS / 2 ? -dy : dy);
        if (inside(xx, yy)) grid[idx(xx, yy)] = i;
      }
    }
    // 岩
    let placed = 0, guard = 0;
    while (placed < st.rocks && guard++ < 500) {
      const x = 2 + Math.floor(Math.random() * (COLS - 4));
      const y = 3 + Math.floor(Math.random() * (ROWS - 6));
      if (grid[idx(x, y)] !== EMPTY) continue;
      grid[idx(x, y)] = ROCK; placed++;
    }
    bucket = null; bucketTimer = 4;
    timeLeft = STAGE_TIME;
    popups = [];
    updateHud();
  }

  function occupied(x, y, except) {
    for (const r of rollers) if (r !== except && r.x === x && r.y === y) return true;
    return false;
  }
  function canMove(r, d) {
    const nx = r.x + DX[d], ny = r.y + DY[d];
    if (!inside(nx, ny)) return false;
    if (grid[idx(nx, ny)] === ROCK) return false;
    if (occupied(nx, ny, r)) return false;
    return true;
  }

  // 自分の色で囲んだ領域をうめる(画面のはしは壁にならない)
  const seen = new Uint8Array(COLS * ROWS);
  const stack = new Int16Array(COLS * ROWS);
  function checkEnclose(owner) {
    seen.fill(0);
    let sp = 0;
    for (let x = 0; x < COLS; x++) for (const y of [0, ROWS - 1]) {
      const i = idx(x, y); if (grid[i] !== owner && !seen[i]) { seen[i] = 1; stack[sp++] = i; }
    }
    for (let y = 1; y < ROWS - 1; y++) for (const x of [0, COLS - 1]) {
      const i = idx(x, y); if (grid[i] !== owner && !seen[i]) { seen[i] = 1; stack[sp++] = i; }
    }
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % COLS, y = (i / COLS) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (seen[j] || grid[j] === owner) continue;
        seen[j] = 1; stack[sp++] = j;
      }
    }
    // 囲まれた領域をかたまりごとに調べ、MAX_FILL マス以下のものだけうめる
    let count = 0, stolen = 0, cx = 0, cy = 0;
    const comp = [];
    for (let s0 = 0; s0 < grid.length; s0++) {
      if (seen[s0] || grid[s0] === owner) continue;
      comp.length = 0; seen[s0] = 2; stack[0] = s0; sp = 1;
      let cells = 0;
      while (sp > 0) {
        const i = stack[--sp]; comp.push(i);
        if (grid[i] !== ROCK) cells++;
        const x = i % COLS, y = (i / COLS) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (!inside(nx, ny)) continue;
          const j = idx(nx, ny);
          if (seen[j] || grid[j] === owner) continue;
          seen[j] = 2; stack[sp++] = j;
        }
      }
      if (cells === 0 || cells > MAX_FILL) continue;
      for (const i of comp) {
        if (grid[i] === ROCK) continue;
        if (grid[i] === 0) stolen++;
        grid[i] = owner; flash[i] = 1; count++; seen[i] = 3;
        cx += i % COLS; cy += (i / COLS) | 0;
      }
    }
    if (count === 0) return;
    // 囲まれたローラーは目がまわる
    for (const r of rollers) {
      if (r.id === owner) continue;
      const i = idx(r.x, r.y);
      if (seen[i] === 3 && r.stun <= 0 && r.immune <= 0) {
        r.stun = 1.6;
        if (r.id === 0) { showMsg(`💫 ${TEAMS[owner].name}にかこまれた!`); }
      }
    }
    // 囲んだ中にバケツがあったら消える
    if (bucket && seen[idx(bucket.x, bucket.y)] === 3) bucket = null;
    popups.push({ x: (cx / count + 0.5) * CELL, y: (cy / count + 0.5) * CELL, text: `+${count}`, color: TEAMS[owner].dark, t: 1.2 });
    if (owner === 0) { sfx.fill(count); showMsg(count >= 12 ? `⭕ ${count}マス まるごとゲット!` : `⭕ かこいこみ +${count}`); }
    else if (stolen > 0) { sfx.bad(); if (rollers[0].stun <= 0) showMsg(`😱 ${TEAMS[owner].name}にかこまれて${stolen}マスとられた!`); }
  }

  function useBucket(r) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 3) continue;
      const x = r.x + dx, y = r.y + dy;
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      if (grid[i] === ROCK) continue;
      grid[i] = r.id; flash[i] = 1;
    }
    popups.push({ x: (r.x + 0.5) * CELL, y: (r.y + 0.5) * CELL, text: '🪣ドバッ!', color: TEAMS[r.id].dark, t: 1 });
    if (r.id === 0) { sfx.bucket(); showMsg('🪣 ペンキバケツ!'); }
  }

  function spawnBucket() {
    for (let k = 0; k < 60; k++) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (grid[idx(x, y)] === ROCK || occupied(x, y, null)) continue;
      bucket = { x, y }; return;
    }
  }

  // ---------- CPU ----------
  function cellValue(owner, x, y) {
    if (!inside(x, y)) return -1;
    const v = grid[idx(x, y)];
    if (v === ROCK) return -1;
    let s = v === owner ? 0.2 : v === EMPTY ? 2 : v === 0 ? 2.8 : 2.2;
    if (bucket && bucket.x === x && bucket.y === y) s += 10;
    return s;
  }
  function aiChoose(r) {
    const st = STAGES[stageIdx];
    const ai = r.ai;
    if (ai.mode === 'loop') {
      if (ai.legLeft > 0 && canMove(r, r.dir)) { ai.legLeft--; return r.dir; }
      // 曲がる(いつも同じ向きに曲がると四角い輪っかになる)
      const nd = (r.dir + ai.turnSign + 4) % 4;
      ai.turns++;
      if (ai.turns > 4 || !canMove(r, nd)) { ai.mode = 'roam'; }
      else {
        ai.legLeft = (ai.turns % 2 === 1 ? ai.lenB : ai.lenA) - 1;
        return nd;
      }
    }
    if (Math.random() < st.loopRate) {
      ai.mode = 'loop'; ai.turns = 0; ai.turnSign = Math.random() < 0.5 ? 1 : -1;
      ai.lenA = 3 + Math.floor(Math.random() * 4); ai.lenB = 3 + Math.floor(Math.random() * 4);
      ai.legLeft = ai.lenA - 1;
      if (canMove(r, r.dir)) return r.dir;
      ai.mode = 'roam';
    }
    let best = -1, bestS = -Infinity;
    for (let d = 0; d < 4; d++) {
      if (!canMove(r, d)) continue;
      let s = 0;
      for (let k = 1; k <= 4; k++) {
        const v = cellValue(r.id, r.x + DX[d] * k, r.y + DY[d] * k);
        if (v < 0) break;
        s += v / k;
      }
      if (d === r.dir) s += 0.6;
      if (d === (r.dir + 2) % 4) s -= 1.5;
      s += Math.random() * 1.8;
      if (s > bestS) { bestS = s; best = d; }
    }
    return best;
  }

  // ---------- 移動 ----------
  function stepRoller(r) {
    r.px = r.x; r.py = r.y;
    if (r.stun > 0) return;
    let d;
    if (r.id === 0) {
      while (r.queue.length) {
        const q = r.queue.shift();
        if (canMove(r, q) || !r.queue.length) { r.dir = q; break; }
      }
      d = r.dir;
    } else {
      d = aiChoose(r);
      if (d < 0) return;
      r.dir = d;
    }
    if (!canMove(r, d)) return;
    r.x += DX[d]; r.y += DY[d];
    const i = idx(r.x, r.y);
    grid[i] = r.id;
    if (bucket && bucket.x === r.x && bucket.y === r.y) { bucket = null; bucketTimer = 6 + Math.random() * 3; useBucket(r); }
    checkEnclose(r.id);
  }

  function counts() {
    const c = [0, 0, 0, 0]; let total = 0;
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i];
      if (v === ROCK) continue;
      total++;
      if (v >= 0) c[v]++;
    }
    return { c, total };
  }

  function updateHud() {
    const { c, total } = counts();
    hudStage.textContent = `ステージ ${stageIdx + 1}/3`;
    hudTime.textContent = `⏱ ${Math.ceil(Math.max(0, timeLeft))}`;
    hudMe.textContent = `🐰 ${Math.round(c[0] / total * 100)}%`;
    hudScore.textContent = `⭐ ${totalScore}`;
    let html = '';
    for (let i = 0; i < rollers.length; i++) html += `<div style="width:${c[i] / total * 100}%;background:${TEAMS[i].color}"></div>`;
    bar.innerHTML = html;
  }

  function showMsg(t) { msgEl.textContent = t; msgTimer = 2.2; }

  // ---------- 描画 ----------
  function draw(alphaFrac) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), v = grid[i];
      const px = x * CELL, py = y * CELL;
      if (v === EMPTY || v === ROCK) {
        ctx.fillStyle = (x + y) % 2 ? '#f4efe4' : '#ece5d6';
        ctx.fillRect(px, py, CELL, CELL);
      } else {
        ctx.fillStyle = TEAMS[v].color;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        if ((x + y) % 2) ctx.fillRect(px, py, CELL, CELL);
      }
      if (flash[i] > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash[i] * 0.7})`;
        ctx.fillRect(px, py, CELL, CELL);
      }
      if (v === ROCK) {
        ctx.fillStyle = '#8b8178';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px + 3, py + 4, CELL - 6, CELL - 7, 7) : ctx.rect(px + 3, py + 4, CELL - 6, CELL - 7); ctx.fill();
        ctx.fillStyle = '#a99f95'; ctx.fillRect(px + 7, py + 8, 8, 5);
      }
    }
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bucket) {
      const bob = Math.sin(performance.now() / 180) * 2;
      ctx.fillText('🪣', (bucket.x + 0.5) * CELL, (bucket.y + 0.5) * CELL + bob);
    }
    for (const r of rollers) {
      const f = r.stun > 0 ? 1 : Math.min(1, r.acc / r.step);
      const fx = (r.px + (r.x - r.px) * (alphaFrac ? f : 1) + 0.5) * CELL;
      const fy = (r.py + (r.y - r.py) * (alphaFrac ? f : 1) + 0.5) * CELL;
      const t = TEAMS[r.id];
      ctx.globalAlpha = r.immune > 0 && Math.floor(performance.now() / 120) % 2 ? 0.5 : 1;
      ctx.fillStyle = t.dark;
      ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.56, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.45, 0, Math.PI * 2); ctx.fill();
      // 向き
      ctx.fillStyle = t.dark;
      ctx.beginPath();
      const ax = fx + DX[r.dir] * CELL * 0.62, ay = fy + DY[r.dir] * CELL * 0.62;
      ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = '20px sans-serif';
      ctx.fillText(t.emoji, fx, fy + 1);
      ctx.globalAlpha = 1;
      if (r.stun > 0) { ctx.font = '16px sans-serif'; ctx.fillText('💫', fx + Math.sin(performance.now() / 90) * 6, fy - CELL * 0.7); }
      if (r.id === 0 && state === 'play') {
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.7 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.t);
      ctx.font = 'bold 20px sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
      ctx.strokeText(p.text, p.x, p.y - (1.2 - p.t) * 30);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - (1.2 - p.t) * 30);
      ctx.globalAlpha = 1;
    }
    if (state === 'count') {
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#b8255a'; ctx.font = 'bold 56px sans-serif';
      const n = Math.ceil(countT);
      ctx.fillText(n > 0 ? String(n) : 'GO!', canvas.width / 2, canvas.height / 2);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`ステージ${stageIdx + 1}: あいて ${STAGES[stageIdx].cpus}ひき`, canvas.width / 2, canvas.height / 2 - 60);
    }
    if (state === 'play' && timeLeft <= 5) {
      ctx.fillStyle = 'rgba(184,37,90,.85)'; ctx.font = 'bold 48px sans-serif';
      ctx.globalAlpha = 0.5; ctx.fillText(String(Math.ceil(timeLeft)), canvas.width / 2, canvas.height / 2); ctx.globalAlpha = 1;
    }
  }

  // ---------- ループ ----------
  let lastTick = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    if (state === 'count') {
      const before = Math.ceil(countT);
      countT -= dt;
      const after = Math.ceil(countT);
      if (after !== before) { if (after > 0) sfx.tick(); else sfx.go(); }
      if (countT <= -0.3) { state = 'play'; }
    } else if (state === 'play') {
      timeLeft -= dt;
      for (const r of rollers) {
        if (r.immune > 0) r.immune -= dt;
        if (r.stun > 0) { r.stun -= dt; if (r.stun <= 0) { r.stun = 0; r.acc = 0; r.immune = 2.5; } }
        r.acc += dt * 1000;
        while (r.acc >= r.step) { r.acc -= r.step; stepRoller(r); }
      }
      if (!bucket) { bucketTimer -= dt; if (bucketTimer <= 0) spawnBucket(); }
      const sec = Math.ceil(timeLeft);
      if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; sfx.tick(); }
      updateHud();
      if (timeLeft <= 0) { timeLeft = 0; endStage(); }
    }
    for (let i = 0; i < flash.length; i++) if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 2);
    for (const p of popups) p.t -= dt;
    popups = popups.filter((p) => p.t > 0);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.textContent = ''; }
    draw(state === 'play');
    requestAnimationFrame(frame);
  }

  function endStage() {
    state = 'result';
    updateHud();
    const { c, total } = counts();
    const pct = c.map((v) => Math.round(v / total * 1000) / 10);
    const order = rollers.map((r) => r.id).sort((a, b) => c[b] - c[a]);
    const win = rollers.every((r) => r.id === 0 || c[0] > c[r.id]);
    const gained = Math.round(pct[0] * 10) + (win ? 300 : 0);
    totalScore += gained;
    hudScore.textContent = `⭐ ${totalScore}`;
    const medal = ['🥇', '🥈', '🥉', '4️⃣'];
    $('resultRank').innerHTML = order.map((id, k) =>
      `${medal[k]} ${TEAMS[id].emoji} ${TEAMS[id].name} <b style="color:${TEAMS[id].dark}">${pct[id]}%</b>`).join('<br>');
    if (win && stageIdx < STAGES.length - 1) {
      $('resultTitle').textContent = `ステージ${stageIdx + 1} クリア!`;
      $('resultBig').textContent = '🎉';
      $('resultText').innerHTML = `+${gained}点(いま ⭐${totalScore})<br>つぎは あいてが ${STAGES[stageIdx + 1].cpus}ひき${STAGES[stageIdx + 1].rocks ? '+🪨岩' : ''}!`;
      nextBtn.classList.remove('hidden'); retryBtn.classList.add('hidden');
      sfx.win();
    } else if (win) {
      $('resultTitle').textContent = 'ぜんステージせいは!';
      $('resultBig').textContent = '🏆🐰🖌️';
      $('resultText').innerHTML = `ごうけい <b>⭐${totalScore}</b> 点!<br>${totalScore >= 1800 ? 'ぬりの達人!' : 'もっと大きく囲んで高得点をねらおう!'}`;
      nextBtn.classList.add('hidden'); retryBtn.classList.remove('hidden');
      sfx.win();
    } else {
      $('resultTitle').textContent = `ステージ${stageIdx + 1} ざんねん…`;
      $('resultBig').textContent = '😵';
      $('resultText').innerHTML = `${TEAMS[order[0]].name}に負けちゃった。ごうけい ⭐${totalScore} 点<br>💡 輪っかでまとめて囲むのがコツ!相手の輪っかは切ろう。`;
      nextBtn.classList.add('hidden'); retryBtn.classList.remove('hidden');
      sfx.lose();
    }
    result.classList.remove('hidden');
  }

  function beginStage() {
    setupStage();
    result.classList.add('hidden');
    intro.classList.add('hidden');
    state = 'count'; countT = 3; lastTick = 0;
    msgEl.textContent = '';
  }
  function startGame() {
    initAudio();
    stageIdx = 0; totalScore = 0;
    beginStage();
  }
  function nextStage() {
    initAudio();
    stageIdx++;
    beginStage();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  nextBtn.addEventListener('click', nextStage);

  // ---------- 入力 ----------
  function pushDir(d) {
    if (state !== 'play' && state !== 'count') return;
    const p = rollers[0];
    if (!p) return;
    const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (last === d && p.queue.length) return;
    p.queue.push(d);
    if (p.queue.length > 2) p.queue.shift();
  }

  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  window.addEventListener('keydown', (e) => {
    if (e.code in KEYS) { e.preventDefault(); pushDir(KEYS[e.code]); return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!intro.classList.contains('hidden')) startGame();
      else if (!result.classList.contains('hidden')) {
        if (!nextBtn.classList.contains('hidden')) nextStage(); else startGame();
      }
    }
  });

  // スワイプ・タップ
  let touch = null;
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * canvas.width / rect.width, y: (e.clientY - rect.top) * canvas.height / rect.height, cx: e.clientX, cy: e.clientY };
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = canvasPoint(e);
    touch = { sx: p.cx, sy: p.cy, moved: false, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    pushDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    touch.sx = e.clientX; touch.sy = e.clientY; touch.moved = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.moved && rollers[0]) {
      // タップ:自分から見たタップ位置の方向へ
      const p = canvasPoint(e), me = rollers[0];
      const dx = p.x - (me.x + 0.5) * CELL, dy = p.y - (me.y + 0.5) * CELL;
      if (Math.abs(dx) > CELL / 2 || Math.abs(dy) > CELL / 2) {
        pushDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
      }
    }
    touch = null;
  });
  canvas.addEventListener('pointercancel', () => { touch = null; });

  // 仮想コントローラ
  pad.querySelectorAll('button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); pushDir(Number(b.dataset.dir)); });
  });
  let padOn = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function applyPad() { pad.classList.toggle('hidden', !padOn); toggleBtn.textContent = padOn ? '🎮 コントローラをかくす' : '🎮 コントローラ'; }
  toggleBtn.addEventListener('click', () => { padOn = !padOn; applyPad(); });
  applyPad();

  // 初期表示用の盤面
  setupStage();
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
