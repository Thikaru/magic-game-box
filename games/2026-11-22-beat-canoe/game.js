(() => {
  'use strict';
  // ===== 定数 =====
  const W = 360, H = 500, BOAT_Y = 330, L = 8000;
  const STRIP_Y = H - 40;           // ビートバーのy
  const DRAG = 0.8;                 // 速度の減衰(1/秒)
  const P_WIN = 0.075, G_WIN = 0.16; // 判定幅(秒)
  const SECTIONS = [
    { from: 0,    name: 'しずかな川',       bpm: 92,  cur: 0,  width: 250, rock: 0.5 },
    { from: 1100, name: '🌊 急流!テンポUP', bpm: 112, cur: 28, width: 212, rock: 0.8 },
    { from: 2700, name: 'ゆったり淵 🚩',    bpm: 84,  cur: 0,  width: 262, rock: 0.3, gates: true },
    { from: 3900, name: '🌊🌊 大急流!',     bpm: 128, cur: 42, width: 205, rock: 1.0 },
    { from: 6300, name: '🏁 ラストスパート', bpm: 120, cur: 18, width: 235, rock: 0.5, gates: true },
  ];

  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const $ = id => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  const hRank = $('hRank'), hCombo = $('hCombo'), hTime = $('hTime');
  const padL = $('padL'), padR = $('padR');

  // ===== 川の形 =====
  function secIndex(d) { let i = 0; for (let k = 0; k < SECTIONS.length; k++) if (d >= SECTIONS[k].from) i = k; return i; }
  function secAt(d) { return SECTIONS[secIndex(d)]; }
  function blend(d, key) {
    const i = secIndex(d), s = SECTIONS[i];
    if (i === 0) return s[key];
    const t = Math.min(1, (d - s.from) / 220);
    return SECTIONS[i - 1][key] * (1 - t) + s[key] * t;
  }
  function center(d) { return W / 2 + 52 * Math.sin(d / 650) + 26 * Math.sin(d / 260 + 1.3); }
  function riverW(d) { return blend(Math.max(0, d), 'width'); }
  function current(d) { return blend(Math.max(0, d), 'cur'); }

  // ===== 乱数 =====
  let seed = 1;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  // ===== 状態 =====
  let state = 'intro';
  let obs = [], trees = [], parts = [], pops = [];
  let pd, px, v, vx, combo, maxCombo, perfects, goods, misses, hits, gatesOk;
  let inv, shake, lastSide, strokeAnim, curSecIdx, banner, bannerT;
  let goTime, raceStart, finishT, rivals, endTimer, beatFlash;
  let lastFrame = 0;

  function genWorld() {
    seed = (Date.now() & 0xffff) + 7;
    obs = []; trees = [];
    let d = 450;
    while (d < L - 260) {
      const s = secAt(d), c = center(d), w = riverW(d);
      const r = rnd();
      if (s.gates && r < 0.45) {
        obs.push({ type: 'gate', d, x: c + (rnd() * 2 - 1) * (w / 2 - 55), gap: 64, done: false });
        d += 210 + rnd() * 60; continue;
      }
      if (r < 0.62 && r >= 0.48) {
        const left = rnd() < 0.5, len = w * 0.46;
        const x1 = left ? c - w / 2 : c + w / 2 - len;
        obs.push({ type: 'log', d, x1, x2: x1 + len, left, hit: false });
        d += 230 + rnd() * 60; continue;
      }
      const x = c + (rnd() * 2 - 1) * (w / 2 - 24);
      obs.push({ type: 'rock', d, x, hit: false, k: rnd() });
      if (rnd() < s.rock * 0.45) {
        let x2 = c + (rnd() * 2 - 1) * (w / 2 - 24);
        if (Math.abs(x2 - x) < 80) x2 = x > c ? x - 95 : x + 95;
        obs.push({ type: 'rock', d: d + (rnd() * 30 - 15), x: x2, hit: false, k: rnd() });
      }
      d += 140 + rnd() * 120 * (1.25 - s.rock * 0.5);
    }
    for (let td = -400; td < L + 600; td += 55) {
      trees.push({ d: td + rnd() * 30, side: -1, off: 14 + rnd() * 30, e: rnd() < 0.8 ? '🌲' : '🌳' });
      trees.push({ d: td + rnd() * 30, side: 1, off: 14 + rnd() * 30, e: rnd() < 0.8 ? '🌲' : '🌳' });
    }
  }

  // ===== オーディオ =====
  let ac = null, master = null, noiseBuf = null;
  let beats = [], nextBeatT = 0, beatNo = 0;
  function clock() { return ac ? ac.currentTime : performance.now() / 1000; }
  function latency() { if (!ac) return 0; return Math.min(0.1, (ac.outputLatency || 0) + (ac.baseLatency || 0) * 0.5); }
  function initAudio() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function env(node, t, a, peak, dec) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function kick(t, accent) {
    if (!ac) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.frequency.setValueAtTime(accent ? 170 : 140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    env(gn, t, 0.004, accent ? 1.0 : 0.75, 0.22);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + 0.3);
  }
  function click(t, hi) {
    if (!ac) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = 'square'; o.frequency.value = hi ? 1320 : 880;
    env(gn, t, 0.003, 0.25, 0.08);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + 0.12);
  }
  function noise(t, dur, freq, type, vol) {
    if (!ac) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const gn = ac.createGain(); env(gn, t, 0.003, vol, dur);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(t, freq, dur, type, vol) {
    if (!ac) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.value = freq;
    env(gn, t, 0.01, vol, dur);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const BASS = [110, 110, 146.8, 130.8, 98, 98, 130.8, 146.8];
  const MEL = [659.3, 587.3, 523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3, 440, 523.3, 587.3, 659.3, 587.3, 523.3, 440];
  function scheduleBeat(t, n, counting) {
    const T = 60 / curBpm();
    if (counting) { click(t, n % 4 === 3); return; }
    kick(t, n % 4 === 0);
    if (combo >= 4) noise(t + T / 2, 0.05, 7000, 'highpass', 0.18);
    if (combo >= 8) tone(t, BASS[n % 8], T * 0.8, 'triangle', 0.32);
    if (combo >= 16) { tone(t, MEL[n % 16], T * 0.45, 'square', 0.06); tone(t + T / 2, MEL[(n + 3) % 16] * 0.75, T * 0.3, 'square', 0.04); }
  }
  function curBpm() { return secAt(Math.max(0, pd)).bpm; }
  function scheduler() {
    const now = clock();
    if (nextBeatT < now - 0.2) nextBeatT = now + 0.05; // タブ復帰時の追いつき防止
    while (nextBeatT < now + 0.12) {
      const counting = nextBeatT < goTime - 0.01;
      scheduleBeat(nextBeatT, beatNo, counting);
      beats.push({ t: nextBeatT, used: counting, n: beatNo });
      beatNo++;
      nextBeatT += 60 / curBpm();
    }
    while (beats.length && beats[0].t < now - 1.5) beats.shift();
  }
  function sfxStroke(q) {
    const t = clock();
    if (q === 'p') { noise(t, 0.12, 1800, 'bandpass', 0.5); tone(t, 1046, 0.08, 'sine', 0.12); }
    else if (q === 'g') noise(t, 0.12, 1200, 'bandpass', 0.4);
    else { noise(t, 0.2, 400, 'lowpass', 0.5); tone(t, 160, 0.15, 'sawtooth', 0.08); }
  }
  function sfxHit() { const t = clock(); noise(t, 0.25, 300, 'lowpass', 0.9); tone(t, 90, 0.25, 'square', 0.15); }
  function sfxGate() { const t = clock(); tone(t, 880, 0.08, 'triangle', 0.2); tone(t + 0.08, 1318, 0.12, 'triangle', 0.2); }
  function sfxFinish(rank) {
    const t = clock() + 0.05;
    const seq = rank === 1 ? [523, 659, 784, 1046] : rank === 2 ? [523, 659, 784] : [392, 349, 330];
    seq.forEach((f, i) => tone(t + i * 0.14, f, 0.25, 'triangle', 0.3));
  }

  // ===== ゲーム開始 =====
  function start() {
    initAudio();
    genWorld();
    pd = 0; px = center(0); v = 0; vx = 0;
    combo = 0; maxCombo = 0; perfects = 0; goods = 0; misses = 0; hits = 0; gatesOk = 0;
    inv = 0; shake = 0; lastSide = 1; strokeAnim = 0; curSecIdx = 0;
    parts = []; pops = []; beats = []; beatNo = 0; beatFlash = 0;
    banner = 'しずかな川'; bannerT = 0;
    const now = clock();
    const T0 = 60 / SECTIONS[0].bpm;
    nextBeatT = now + 0.5;
    goTime = nextBeatT + T0 * 4;    // 4カウント後にスタート
    raceStart = goTime; finishT = null; endTimer = 0;
    rivals = [
      { name: 'カワウソ', e: '🦦', I: 37, d: 0, lane: -0.55, col: '#8a5a2b', ph: 0.3, fin: null },
      { name: 'ビーバー', e: '🦫', I: 43, d: 0, lane: 0.55, col: '#5b6b2b', ph: 2.1, fin: null },
    ];
    state = 'race';
    intro.classList.add('hidden'); result.classList.add('hidden');
    lastFrame = performance.now();
  }

  // ===== こぐ =====
  function stroke(side) {
    if (state !== 'race' || finishT !== null) return;
    const t = clock() - latency();
    if (t < goTime - G_WIN) return; // カウント中は無視
    strokeAnim = 1; lastSide = side;
    let best = null, bd = 1e9;
    for (const b of beats) { const dd = Math.abs(t - b.t); if (dd < bd) { bd = dd; best = b; } }
    let q = 'm';
    if (best && !best.used && best.t >= goTime - 0.01) {
      if (bd <= P_WIN) q = 'p'; else if (bd <= G_WIN) q = 'g';
    }
    const mult = combo >= 16 ? 1.2 : combo >= 8 ? 1.1 : 1;
    if (q !== 'm') {
      best.used = true;
      combo++; maxCombo = Math.max(maxCombo, combo);
      if (q === 'p') { perfects++; v += 55 * mult; vx += side * 64; addPop('PERFECT!', '#ffd000'); }
      else { goods++; v += 38 * mult; vx += side * 50; addPop('GOOD', '#9ff'); }
      if (combo === 8) addPop('🎸 ベースが入った!', '#fff', 1);
      if (combo === 16) addPop('🎺 メロディ!スピードUP', '#fff', 1);
    } else {
      misses++; combo = 0; v *= 0.8; vx += side * 22;
      addPop('ずれた…', '#ff8080');
    }
    vx = Math.max(-140, Math.min(140, vx));
    v = Math.min(240, v);
    sfxStroke(q);
    splash(px + (side > 0 ? -16 : 16), BOAT_Y + 6, q === 'p' ? 10 : 5, q === 'm' ? '#bcd' : '#fff');
  }
  function addPop(text, col, big) { pops.push({ text, col, t: 0, big: !!big }); if (pops.length > 4) pops.shift(); }
  function splash(x, y, n, col) {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() * 2 - 1) * 60, vy: -Math.random() * 80 - 20, life: 0.5, col });
  }

  // ===== 更新 =====
  function update(dt) {
    scheduler();
    const now = clock();
    const racing = now >= goTime;
    const prevD = pd;
    if (racing && finishT === null) {
      v -= v * DRAG * dt;
      vx -= vx * 3 * dt;
      // 急流は流れに押される
      const cur = current(pd);
      pd += (v + cur) * dt;
      px += vx * dt;
      // 岸
      const c = center(pd), w = riverW(pd);
      const lb = c - w / 2 + 11, rb = c + w / 2 - 11;
      if (px < lb) { px = lb; vx = Math.abs(vx) * 0.3 + 10; v -= 90 * dt; scrape(); }
      if (px > rb) { px = rb; vx = -Math.abs(vx) * 0.3 - 10; v -= 90 * dt; scrape(); }
      v = Math.max(0, v);
      // 障害物
      for (const o of obs) {
        const dy = o.d - pd;
        if (dy < -40 || dy > 40) continue;
        if (o.type === 'rock' && !o.hit && inv <= 0) {
          if (Math.abs(px - o.x) < 21 && Math.abs(dy) < 22) { o.hit = true; crash(Math.sign(px - o.x) || 1); }
        } else if (o.type === 'log' && !o.hit && inv <= 0) {
          if (Math.abs(dy) < 16 && px > o.x1 - 8 && px < o.x2 + 8) { o.hit = true; crash(px < (o.x1 + o.x2) / 2 ? -1 : 1); }
        } else if (o.type === 'gate' && !o.done && prevD < o.d && pd >= o.d) {
          o.done = true;
          if (Math.abs(px - o.x) < o.gap / 2) { gatesOk++; v = Math.min(240, v + 50); addPop('🚩 ゲート!ダッシュ', '#ffe066', 1); sfxGate(); }
        }
      }
      if (pd >= L) { finishT = now - raceStart; onFinish(); }
      // セクション切替
      const si = secIndex(pd);
      if (si !== curSecIdx) { curSecIdx = si; banner = SECTIONS[si].name; bannerT = 0; }
    }
    if (racing) {
      for (const r of rivals) {
        if (r.fin !== null) { r.d += 40 * dt; continue; }
        const T = 60 / secAt(r.d).bpm;
        let sp = r.I / (DRAG * T) * (1 + 0.07 * Math.sin(now * 0.6 + r.ph)) + current(r.d);
        const ramp = Math.min(1, (now - goTime) / 3);
        const gap = r.d - pd;
        if (gap > 450) sp *= 0.9; else if (gap < -450) sp *= 1.08;
        r.d += sp * ramp * dt;
        if (r.d >= L) r.fin = now - raceStart;
      }
    }
    if (finishT !== null) { endTimer += dt; v *= 0.97; pd += (v + 20) * dt; if (endTimer > 1.6 && state === 'race') showResult(); }
    inv = Math.max(0, inv - dt);
    shake = Math.max(0, shake - dt * 3);
    strokeAnim = Math.max(0, strokeAnim - dt * 4);
    beatFlash = Math.max(0, beatFlash - dt * 5);
    for (const b of beats) if (!b.flashed && now - latency() >= b.t) { b.flashed = true; beatFlash = 1; }
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const p of pops) p.t += dt;
    pops = pops.filter(p => p.t < 0.9);
    bannerT += dt;
    // HUD
    const rank = 1 + rivals.filter(r => (r.fin !== null && finishT === null) || r.d > pd).length;
    hRank.textContent = '🏁 ' + (finishT !== null ? finalRank : rank) + 'い';
    hCombo.textContent = '🎵 ' + combo + 'コンボ';
    hTime.textContent = '⏱ ' + (racing ? (finishT !== null ? finishT : now - raceStart).toFixed(1) : '0.0');
  }
  let scrapeT = 0;
  function scrape() { if (combo > 0 && performance.now() - scrapeT > 400) { scrapeT = performance.now(); addPop('岸にこすった!', '#ffb080'); } }
  function crash(dir) {
    hits++; combo = 0; v *= 0.3; vx = dir * 120; inv = 1.0; shake = 1;
    addPop('ゴツン!', '#ff5050', 1); sfxHit();
    splash(px, BOAT_Y - 10, 14, '#fff');
  }

  let finalRank = 1;
  function onFinish() {
    finalRank = 1 + rivals.filter(r => r.fin !== null).length;
    sfxFinish(finalRank);
    addPop(finalRank === 1 ? '🥇 ゴール!' : 'ゴール!', '#fff', 1);
  }
  function showResult() {
    state = 'result';
    const medal = ['🥇', '🥈', '🥉'][finalRank - 1];
    const titles = ['ゆうしょう!川の王者', '2い!おしい!', '3い…リベンジしよう'];
    let best = null;
    try { best = parseFloat(localStorage.getItem('beatCanoeBest')); } catch (e) { /* ignore */ }
    let newBest = false;
    if (finalRank === 1 && (!best || finishT < best)) { newBest = true; best = finishT; try { localStorage.setItem('beatCanoeBest', String(finishT)); } catch (e) { /* ignore */ } }
    const total = perfects + goods + misses;
    const acc = total ? Math.round((perfects + goods * 0.5) / total * 100) : 0;
    $('rTitle').textContent = medal + ' ' + titles[finalRank - 1];
    $('rText').innerHTML =
      '<table>' +
      `<tr><td>⏱ タイム</td><td><b>${finishT.toFixed(1)}</b> びょう${newBest ? ' 🎉ベスト!' : ''}</td></tr>` +
      `<tr><td>✨ PERFECT</td><td>${perfects}</td></tr>` +
      `<tr><td>👍 GOOD</td><td>${goods}</td></tr>` +
      `<tr><td>💦 ずれ</td><td>${misses}</td></tr>` +
      `<tr><td>🎵 さいだいコンボ</td><td>${maxCombo}</td></tr>` +
      `<tr><td>🪨 ぶつかった</td><td>${hits} かい</td></tr>` +
      `<tr><td>🚩 ゲート</td><td>${gatesOk}</td></tr>` +
      `<tr><td>🎯 リズム正確さ</td><td>${acc}%</td></tr>` +
      '</table>' +
      (best && finalRank === 1 ? `<p>1いのベスト: ${best.toFixed(1)} びょう</p>` : '') +
      `<p>${finalRank === 1 ? '16コンボ以上をキープするともっと速くなるよ!' : 'ヒント:ずれるとブレーキ。あせらずビートにぴったり!'}</p>`;
    result.classList.remove('hidden');
  }

  // ===== 描画 =====
  function sy(d) { return BOAT_Y - (d - pd); }
  function draw() {
    g.save();
    if (shake > 0) g.translate((Math.random() * 2 - 1) * 6 * shake, (Math.random() * 2 - 1) * 6 * shake);
    // 草地
    g.fillStyle = '#4c9a4f'; g.fillRect(-10, -10, W + 20, H + 20);
    // 川
    const d0 = pd - (H - BOAT_Y) - 20, d1 = pd + BOAT_Y + 20;
    g.beginPath();
    for (let d = d0; d <= d1; d += 10) { const x = center(d) - riverW(d) / 2; d === d0 ? g.moveTo(x, sy(d)) : g.lineTo(x, sy(d)); }
    for (let d = d1; d >= d0; d -= 10) g.lineTo(center(d) + riverW(d) / 2, sy(d));
    g.closePath();
    g.fillStyle = '#c9b27a'; g.lineWidth = 14; g.strokeStyle = '#c9b27a'; g.stroke();
    g.fillStyle = '#2e86c9'; g.fill();
    // 流れの白線
    const tt = clock();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    for (let d = Math.floor(d0 / 40) * 40; d < d1; d += 40) {
      const cur = current(d);
      const n = cur > 30 ? 4 : cur > 10 ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const h = (Math.sin(d * 12.9898 + k * 78.233) * 43758.5453) % 1;
        const fx = center(d) + (Math.abs(h) * 2 - 1) * (riverW(d) / 2 - 16);
        const off = ((tt * (cur + 20)) % 40);
        const y = sy(d) + off;
        const len = cur > 30 ? 16 : 9;
        g.beginPath(); g.moveTo(fx - len / 2, y); g.quadraticCurveTo(fx, y - 4, fx + len / 2, y); g.stroke();
      }
    }
    // 木
    g.font = '22px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of trees) {
      if (t.d < d0 - 20 || t.d > d1 + 20) continue;
      const x = center(t.d) + t.side * (riverW(t.d) / 2 + t.off);
      if (x < -12 || x > W + 12) continue;
      g.fillText(t.e, x, sy(t.d));
    }
    // ゴール
    if (L > d0 && L < d1) {
      const y = sy(L), c = center(L), w = riverW(L) + 20;
      for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#fff' : '#222';
        g.fillRect(c - w / 2 + i * w / 16, y - 8 + j * 8, w / 16 + 0.5, 8);
      }
      g.font = 'bold 18px sans-serif'; g.fillStyle = '#fff'; g.fillText('GOAL', c, y - 22);
    }
    // 障害物
    for (const o of obs) {
      if (o.d < d0 - 30 || o.d > d1 + 30) continue;
      const y = sy(o.d);
      if (o.type === 'rock') {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.ellipse(o.x, y + 8, 20, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = o.hit ? '#6b6b6b' : '#80868c';
        g.beginPath(); g.ellipse(o.x, y, 17, 14, o.k, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a3a9ae'; g.beginPath(); g.ellipse(o.x - 4, y - 4, 7, 5, 0, 0, Math.PI * 2); g.fill();
      } else if (o.type === 'log') {
        g.fillStyle = '#7a4a22'; roundRect(o.x1, y - 8, o.x2 - o.x1, 16, 8); g.fill();
        g.strokeStyle = '#5a3414'; g.lineWidth = 2;
        for (let x = o.x1 + 14; x < o.x2 - 6; x += 22) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y + 6); g.stroke(); }
        g.fillStyle = '#c98f55'; g.beginPath(); g.ellipse(o.left ? o.x2 : o.x1, y, 5, 8, 0, 0, Math.PI * 2); g.fill();
      } else if (o.type === 'gate') {
        const a = o.x - o.gap / 2, b = o.x + o.gap / 2;
        g.strokeStyle = o.done ? 'rgba(255,255,255,0.3)' : 'rgba(255,230,80,0.7)'; g.lineWidth = 3; g.setLineDash([5, 5]);
        g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke(); g.setLineDash([]);
        for (const x of [a, b]) {
          g.fillStyle = '#eee'; g.fillRect(x - 2, y - 22, 4, 26);
          g.fillStyle = '#e53935'; g.beginPath(); g.moveTo(x + 2, y - 22); g.lineTo(x + 16, y - 16); g.lineTo(x + 2, y - 10); g.fill();
        }
      }
    }
    // ライバル
    for (const r of rivals) {
      const y = sy(r.d);
      if (y < -40 || y > H + 40) continue;
      const x = center(r.d) + r.lane * (riverW(r.d) / 2 - 40);
      drawCanoe(x, y, 0, r.col, r.e, Math.sin(clock() * 6 + r.ph) > 0 ? 1 : -1, 0.5);
    }
    // プレイヤー
    const ang = Math.atan2(vx, Math.max(60, v + 40)) * 0.8;
    if (!(inv > 0 && Math.floor(inv * 10) % 2)) drawCanoe(px, BOAT_Y, ang, '#f28c28', '🧒', lastSide, strokeAnim, true);
    // しぶき
    for (const p of parts) { g.globalAlpha = Math.max(0, p.life * 2); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, 2.5, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.restore();

    drawProgress();
    drawStrip();
    // ポップ
    g.textAlign = 'center'; g.textBaseline = 'middle';
    pops.forEach((p, i) => {
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
      g.font = (p.big ? 'bold 20px' : 'bold 18px') + ' sans-serif';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.6)';
      const y = (p.big ? 150 : BOAT_Y - 52) - p.t * 30 - (p.big ? 0 : 0);
      g.strokeText(p.text, W / 2, y); g.fillStyle = p.col; g.fillText(p.text, W / 2, y);
      void i;
    });
    g.globalAlpha = 1;
    // セクションバナー
    if (bannerT < 2.2 && state === 'race') {
      g.globalAlpha = Math.min(1, (2.2 - bannerT) * 2);
      g.fillStyle = 'rgba(10,40,70,0.75)'; roundRect(W / 2 - 120, 52, 240, 36, 10); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 17px sans-serif';
      g.fillText(banner + '  ♩=' + secAt(Math.max(0, pd)).bpm, W / 2, 70);
      g.globalAlpha = 1;
    }
    // カウントダウン
    const now = clock();
    if (state === 'race' && now < goTime + 0.6) {
      const T0 = 60 / SECTIONS[0].bpm;
      const left = (goTime - now) / T0;
      const txt = left > 3 ? '4' : left > 2 ? '3' : left > 1 ? '2' : left > 0 ? '1' : 'GO!';
      g.font = 'bold 64px sans-serif'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.strokeText(txt, W / 2, 200); g.fillStyle = txt === 'GO!' ? '#ffe066' : '#fff'; g.fillText(txt, W / 2, 200);
      if (left > 0) { g.font = 'bold 15px sans-serif'; g.fillStyle = '#fff'; g.fillText('ビートを聞いて…GO!のあとからこごう', W / 2, 250); }
    }
  }
  function drawCanoe(x, y, ang, col, rider, side, anim, me) {
    g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = me ? 1 : 0.85;
    // 航跡
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-8, 22); g.lineTo(-14, 36); g.moveTo(8, 22); g.lineTo(14, 36); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(13, -8, 10, 18); g.quadraticCurveTo(0, 26, -10, 18); g.quadraticCurveTo(-13, -8, 0, -26); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2); g.fill();
    // オール(side>0でみぎへ=左側をこぐ)
    const sx = side > 0 ? -1 : 1;
    const sw = (anim || 0);
    g.strokeStyle = '#6b4320'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-sx * 6, -6); g.lineTo(sx * 24, -6 + 22 * sw - 8); g.stroke();
    g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(sx * 26, -6 + 22 * sw - 8, 4, 8, 0, 0, Math.PI * 2); g.fill();
    g.font = me ? '18px serif' : '16px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(rider, 0, -2);
    g.restore();
  }
  function roundRect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function drawProgress() {
    const x0 = 20, x1 = W - 20, y = 18;
    g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(x0 - 8, y - 12, x1 - x0 + 16, 24, 12); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x0, y - 2, x1 - x0, 4);
    for (const s of SECTIONS) if (s.cur > 20) { g.fillStyle = 'rgba(120,200,255,0.8)'; const nx = SECTIONS[SECTIONS.indexOf(s) + 1]; g.fillRect(x0 + (s.from / L) * (x1 - x0), y - 2, ((nx ? nx.from : L) - s.from) / L * (x1 - x0), 4); }
    g.font = '13px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🏁', x1, y);
    for (const r of rivals) g.fillText(r.e, x0 + Math.min(1, r.d / L) * (x1 - x0), y);
    g.font = '15px serif';
    g.fillText('🛶', x0 + Math.min(1, pd / L) * (x1 - x0), y);
  }
  function drawStrip() {
    const y = STRIP_Y, cx = W / 2;
    g.fillStyle = 'rgba(8,30,50,0.72)'; g.fillRect(0, y - 20, W, 60);
    const now = clock() - latency();
    const PXS = 150;
    // 判定枠
    const r = 14 + beatFlash * 6;
    g.strokeStyle = beatFlash > 0 ? '#ffe066' : '#fff'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, y + 2, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(cx - P_WIN * PXS - 0, y - 2, P_WIN * PXS * 2, 8);
    // ビート点
    const upto = nextBeatT + 2;
    const list = beats.map(b => b.t);
    let t = nextBeatT, n = 0;
    while (t < upto && n < 8) { list.push(t); t += 60 / curBpm(); n++; }
    for (const bt of list) {
      const dt = bt - now;
      if (dt < -0.15 || dt > 1.3) continue;
      const off = dt * PXS;
      const isCount = bt < goTime - 0.01;
      g.fillStyle = isCount ? '#9ab' : (combo >= 16 ? '#ffb3ff' : combo >= 8 ? '#9ff' : '#fff');
      for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * off, y + 2, 7, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#cde'; g.font = 'bold 11px sans-serif'; g.textAlign = 'left';
    g.fillText('◀ こぐ', 8, y + 2); g.textAlign = 'right'; g.fillText('こぐ ▶', W - 8, y + 2);
    g.textAlign = 'center';
    const spd = Math.round((v + (pd > 0 ? current(pd) : 0)) / 10);
    g.fillText('スピード ' + spd, cx, y - 12 + 0);
  }

  // ===== ループ =====
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;
    if (state === 'race') update(dt);
    if (state !== 'intro') draw(); else drawIdle(ts);
    requestAnimationFrame(frame);
  }
  function drawIdle(ts) {
    pd = ts * 0.04; px = center(pd); v = 0; vx = 0;
    g.fillStyle = '#4c9a4f'; g.fillRect(0, 0, W, H);
  }

  // ===== 入力 =====
  function bindPad(el, side) {
    const down = e => { e.preventDefault(); el.classList.add('on'); stroke(side); };
    const up = () => el.classList.remove('on');
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPad(padL, -1); bindPad(padR, 1);
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const rc = cv.getBoundingClientRect();
    const side = (e.clientX - rc.left) < rc.width / 2 ? -1 : 1;
    const el = side < 0 ? padL : padR;
    el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 90);
    stroke(side);
  });
  const LK = ['ArrowLeft', 'a', 'A', 'f', 'F'], RK = ['ArrowRight', 'd', 'D', 'j', 'J'];
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (LK.includes(e.key) || RK.includes(e.key)) e.preventDefault(); return; }
    if (LK.includes(e.key)) { e.preventDefault(); padL.classList.add('on'); stroke(-1); }
    else if (RK.includes(e.key)) { e.preventDefault(); padR.classList.add('on'); stroke(1); }
    else if ((e.key === 'Enter' || e.key === ' ') && state !== 'race') { e.preventDefault(); start(); }
  });
  window.addEventListener('keyup', e => {
    if (LK.includes(e.key)) padL.classList.remove('on');
    if (RK.includes(e.key)) padR.classList.remove('on');
  });
  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);

  requestAnimationFrame(frame);
})();
