(() => {
  'use strict';
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const W = 360, H = 480, HIT_Y = 400, FALL = 1.5; // 秒: 画面上端→ラインまで
  const LANE_X = [70, 180, 290];
  const ROUNDS = [
    { bpm: 90, measures: 6, extra: 0 },
    { bpm: 108, measures: 7, extra: 0.25 },
    { bpm: 126, measures: 8, extra: 0.5 }
  ];
  const $ = id => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  let audio = null;
  let st = null, raf = 0, shake = 0, flashes = [];

  function ensureAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function tone(f, d, type, vol, slideTo) {
    if (!audio) return;
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, vol) {
    if (!audio) return;
    const n = Math.floor(audio.sampleRate * d), b = audio.createBuffer(1, n, audio.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = audio.createBufferSource(), g = audio.createGain();
    g.gain.value = vol; s.buffer = b; s.connect(g); g.connect(audio.destination); s.start();
  }
  const sfx = {
    kick: () => tone(140, 0.15, 'sine', 0.5, 45),
    hat: () => noise(0.04, 0.12),
    guard: () => tone(660, 0.08, 'square', 0.15),
    perfect: () => { tone(880, 0.1, 'triangle', 0.25); tone(1320, 0.14, 'triangle', 0.2); },
    punch: () => { noise(0.18, 0.4); tone(200, 0.2, 'sawtooth', 0.3, 60); },
    hurt: () => tone(160, 0.3, 'sawtooth', 0.3, 70),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.25), i * 120))
  };

  function buildNotes(r) {
    const spb = 60 / r.bpm, notes = [];
    for (let m = 0; m < r.measures; m++) {
      const b0 = m * 4, lanes = [];
      for (let k = 0; k < 3; k++) {
        const lane = Math.random() < 0.5 ? 0 : 2;
        lanes.push(lane);
        notes.push({ beat: b0 + k, lane, kind: 'atk', m, done: false });
        if (k < 2 && Math.random() < r.extra) // 8分の追加玉(同じがわ)
          notes.push({ beat: b0 + k + 0.5, lane, kind: 'atk', m, done: false });
      }
      notes.push({ beat: b0 + 3, lane: 1, kind: 'punch', m, done: false });
    }
    notes.forEach(n => n.t = n.beat * spb);
    return notes;
  }

  function startRound(idx) {
    const r = ROUNDS[idx];
    st.ri = idx; st.spb = 60 / r.bpm;
    st.notes = buildNotes(r);
    st.t0 = performance.now() / 1000 + 2.2; // カウントイン
    st.nextBeat = 0; st.measureMiss = {}; st.banner = 'ROUND ' + (idx + 1);
    st.bannerUntil = performance.now() / 1000 + 1.6;
    st.endAt = st.t0 + (r.measures * 4) * st.spb + 1.2;
    $('round').textContent = 'ROUND ' + (idx + 1);
  }

  function newGame() {
    st = { ri: 0, hp: 5, score: 0, combo: 0, maxCombo: 0, perfect: 0, punches: 0, over: false, enemyHp: 1, enemyShow: 1 };
    st.totalPunch = ROUNDS.reduce((s, r) => s + r.measures, 0);
    flashes = []; shake = 0;
    startRound(0); updateHud();
  }

  function updateHud() {
    $('lives').textContent = '❤'.repeat(Math.max(0, st.hp)) + '♡'.repeat(5 - Math.max(0, st.hp));
    $('combo').textContent = st.combo + ' COMBO';
    $('score').textContent = st.score + '点';
  }
  const now = () => performance.now() / 1000;
  const songT = () => now() - st.t0;
  function fx(text, x, color) { flashes.push({ text, x, y: HIT_Y - 30, until: now() + 0.6, color }); }
  function addScore(p) { st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); st.score += p + Math.min(st.combo, 30) * 2; }

  function press(lane) {
    if (!st || st.over || !raf) return;
    const t = songT();
    let best = null, bd = 1e9;
    for (const n of st.notes) {
      if (n.done || n.lane !== lane) continue;
      const d = Math.abs(n.t - t);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best || bd > 0.2 || (best.kind === 'punch' && best.gray)) { if (lane !== 1 || !best || !best.gray) { st.combo = 0; updateHud(); } return; }
    best.done = true;
    const perfect = bd < 0.09;
    if (best.kind === 'atk') {
      sfx.guard(); if (perfect) { sfx.perfect(); st.perfect++; }
      addScore(perfect ? 100 : 50);
      fx(perfect ? 'PERFECT!' : 'GOOD', LANE_X[lane], perfect ? '#ffd24a' : '#9ef');
    } else {
      sfx.punch(); st.punches++; shake = 0.3;
      addScore(perfect ? 400 : 250);
      fx(perfect ? 'KO PUNCH!!' : 'PUNCH!', LANE_X[1], '#ff8a4a');
      st.enemyShow = Math.max(0, st.enemyShow - 1 / st.totalPunch);
    }
    updateHud();
  }

  function miss(n) {
    n.done = true;
    if (n.kind === 'atk') {
      st.hp--; st.combo = 0; st.measureMiss[n.m] = true; shake = 0.4; sfx.hurt();
      fx('ガードしっぱい', LANE_X[n.lane], '#ff6a6a');
      updateHud();
      if (st.hp <= 0) finish(false);
    } else { st.combo = 0; fx('チャンスのがした', LANE_X[1], '#aaa'); updateHud(); }
  }

  function frame() {
    if (!st) return;
    const t = songT(), spb = st.spb;
    // ビート音
    while (st.nextBeat * spb <= t && st.nextBeat < ROUNDS[st.ri].measures * 4 + 2) {
      if (t - st.nextBeat * spb < 0.15) { if (st.nextBeat % 2 === 0) sfx.kick(); else sfx.hat(); }
      st.nextBeat += 1;
    }
    for (const n of st.notes) {
      if (n.done) continue;
      if (n.kind === 'punch' && n.gray === undefined) n.gray = !!st.measureMiss[n.m];
      if (n.kind === 'punch' && n.t - t < 0.5) n.gray = !!st.measureMiss[n.m];
      if (t > n.t + 0.2) { if (n.kind === 'punch' && n.gray) n.done = true; else miss(n); }
    }
    if (!st.over && now() > st.endAt) {
      if (st.ri + 1 < ROUNDS.length) startRound(st.ri + 1); else finish(true);
    }
    draw(t);
    if (!st.over) raf = requestAnimationFrame(frame);
  }

  function finish(win) {
    st.over = true; cancelAnimationFrame(raf); raf = 0;
    if (win) sfx.fanfare();
    const stars = win ? (st.hp >= 4 ? '⭐⭐⭐' : st.hp >= 2 ? '⭐⭐' : '⭐') : '';
    $('rTitle').textContent = win ? '🏆 かち! ロボをたおした!' : '😵 ダウン… ロボのかち';
    $('rText').innerHTML = (win ? stars + '<br>' : '') + 'スコア <b>' + st.score + '</b>点<br>最大コンボ ' + st.maxCombo +
      '<br>PERFECT ' + st.perfect + '回 / カウンター ' + st.punches + '/' + st.totalPunch + '回' +
      (win ? '' : '<br>ROUND ' + (st.ri + 1) + ' でたおれた');
    draw(songT());
    result.classList.remove('hidden');
  }

  function draw(t) {
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random() - .5) * shake * 20, (Math.random() - .5) * shake * 20); shake = Math.max(0, shake - 0.02); }
    ctx.fillStyle = '#3b1730'; ctx.fillRect(-10, -10, W + 20, H + 20);
    // レーン
    LANE_X.forEach((x, i) => {
      ctx.fillStyle = i === 1 ? 'rgba(224,162,26,.12)' : 'rgba(255,255,255,.06)';
      ctx.fillRect(x - 45, 0, 90, H);
    });
    // 敵
    const stunned = st && st.notes.some(n => n.kind === 'punch' && !n.done && !n.gray && n.t - t < 1 && n.t - t > -0.3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '56px serif';
    const bob = Math.sin(t * Math.PI / st.spb) * 4;
    ctx.fillText(stunned ? '😵' : '🤖', 180 + (stunned ? Math.sin(t * 20) * 5 : 0), 60 + bob);
    ctx.fillStyle = '#522'; ctx.fillRect(100, 100, 160, 8);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(100, 100, 160 * st.enemyShow, 8);
    // ライン
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, HIT_Y); ctx.lineTo(W - 10, HIT_Y); ctx.stroke();
    LANE_X.forEach((x, i) => {
      ctx.beginPath(); ctx.arc(x, HIT_Y, 26, 0, 7); ctx.strokeStyle = i === 1 ? '#e0a21a' : '#fff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '16px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(i === 0 ? '◀' : i === 2 ? '▶' : '👊', x, HIT_Y + 44);
    });
    // ノート
    for (const n of st.notes) {
      if (n.done) continue;
      const y = HIT_Y - (n.t - t) / FALL * (HIT_Y + 20);
      if (y < -30 || y > H + 30) continue;
      const x = LANE_X[n.lane];
      ctx.beginPath(); ctx.arc(x, y, 22, 0, 7);
      if (n.kind === 'atk') { ctx.fillStyle = '#ff4a4a'; ctx.fill(); ctx.font = '22px serif'; ctx.fillStyle = '#fff'; ctx.fillText('🥊', x, y + 1); }
      else if (st.measureMiss[n.m] || n.gray) { ctx.fillStyle = '#777'; ctx.fill(); ctx.font = '16px sans-serif'; ctx.fillStyle = '#ccc'; ctx.fillText('✕', x, y); }
      else { ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0; ctx.font = '22px serif'; ctx.fillText('⭐', x, y + 1); }
    }
    // エフェクト
    flashes = flashes.filter(f => f.until > now());
    ctx.font = 'bold 18px sans-serif';
    for (const f of flashes) { ctx.globalAlpha = Math.min(1, (f.until - now()) / 0.3); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - (0.6 - (f.until - now())) * 40); }
    ctx.globalAlpha = 1;
    // カウントイン/バナー
    if (t < 0 || now() < st.bannerUntil) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 190, W, 70);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif';
      ctx.fillText(t < -0.9 ? st.banner : t < 0 ? 'READY… ' + Math.ceil(-t / st.spb) : 'GO!', W / 2, 225);
    }
    ctx.restore();
  }

  function begin() {
    ensureAudio();
    intro.classList.add('hidden'); result.classList.add('hidden');
    newGame();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  $('startBtn').addEventListener('click', begin);
  $('againBtn').addEventListener('click', begin);

  const bind = (id, lane) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); press(lane); });
  bind('pL', 0); bind('pC', 1); bind('pR', 2);
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    press(x < 0.33 ? 0 : x > 0.67 ? 2 : 1);
  });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key;
    if (k === 'a' || k === 'A' || k === 'ArrowLeft') press(0);
    else if (k === 'd' || k === 'D' || k === 'ArrowRight') press(2);
    else if (k === 's' || k === 'S' || k === 'ArrowDown' || k === ' ') { e.preventDefault(); press(1); }
  });

  // 初期表示(説明画面の背景)
  st = { notes: [], spb: 0.6, t0: now(), measureMiss: {}, bannerUntil: 0, enemyShow: 1 };
  draw(1);
})();
