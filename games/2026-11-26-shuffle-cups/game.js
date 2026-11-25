// どれだっけ?フルーツシャッフルカップ
(() => {
  'use strict';
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const hudRound = $('hudRound'), hudLife = $('hudLife'), hudCombo = $('hudCombo'), hudScore = $('hudScore');
  const msgEl = $('msg'), intro = $('intro'), result = $('result');

  const FRUITS = ['🍓', '🍋', '🍇', '🍑'];
  const FRUIT_NAME = { '🍓': 'いちご', '🍋': 'レモン', '🍇': 'ぶどう', '🍑': 'もも' };
  // cups, items, swaps, move duration(ms), fake prob, double prob
  const ROUNDS = [
    { cups: 3, items: 1, swaps: 4, dur: 620, fake: 0, dbl: 0 },
    { cups: 3, items: 1, swaps: 6, dur: 520, fake: 0, dbl: 0 },
    { cups: 3, items: 2, swaps: 5, dur: 520, fake: 0, dbl: 0 },
    { cups: 4, items: 2, swaps: 6, dur: 480, fake: 0.25, dbl: 0 },
    { cups: 4, items: 2, swaps: 7, dur: 440, fake: 0.25, dbl: 0 },
    { cups: 4, items: 3, swaps: 7, dur: 440, fake: 0.2, dbl: 0.3 },
    { cups: 5, items: 2, swaps: 8, dur: 420, fake: 0.25, dbl: 0.3 },
    { cups: 5, items: 3, swaps: 8, dur: 390, fake: 0.25, dbl: 0.35 },
    { cups: 5, items: 3, swaps: 9, dur: 360, fake: 0.3, dbl: 0.35 },
    { cups: 5, items: 4, swaps: 10, dur: 340, fake: 0.3, dbl: 0.4 },
  ];
  const ASK_TIME = 6;
  const BASE_Y = 345, CUP_W = 74, CUP_H = 96, LIFT = 100;

  let state = 'title'; // title, show, drop, shuffle, ask, reveal, over
  let round = 0, lives = 3, score = 0, combo = 0, maxCombo = 0, correctCount = 0;
  let cups = [];       // {slot, item, lift, x, y, depth}
  let slotsX = [];
  let moves = [], moveIdx = 0, moveT = 0;
  let timer = 0, askLeft = 0, target = null, picked = null, wasRight = false;
  let banner = '', subBanner = '';
  let audio = null;
  let lastTs = 0;

  // ---------- audio ----------
  function initAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    if (!audio) return;
    const t0 = audio.currentTime + delay;
    const o = audio.createOscillator(), v = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    v.gain.setValueAtTime(vol, t0);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(v); v.connect(audio.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    swish: () => beep(320 + Math.random() * 80, 0.08, 'triangle', 0.07),
    ask: () => { beep(660, 0.1, 'square', 0.06); beep(880, 0.12, 'square', 0.06, 0.1); },
    good: () => { beep(784, 0.12, 'sine', 0.14); beep(1047, 0.12, 'sine', 0.14, 0.1); beep(1319, 0.2, 'sine', 0.12, 0.2); },
    bad: () => { beep(200, 0.25, 'sawtooth', 0.1); beep(150, 0.3, 'sawtooth', 0.1, 0.15); },
    lift: () => beep(520, 0.06, 'triangle', 0.08),
  };

  // ---------- helpers ----------
  const rnd = n => Math.floor(Math.random() * n);
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function layoutSlots(n) {
    const sp = Math.min(98, (W - 40) / n);
    const start = W / 2 - sp * (n - 1) / 2;
    slotsX = [];
    for (let i = 0; i < n; i++) slotsX.push(start + sp * i);
  }

  function randPair(n) {
    let a = rnd(n), b;
    if (Math.random() < 0.7) { b = a + (Math.random() < 0.5 ? -1 : 1); if (b < 0) b = 1; if (b >= n) b = n - 2; }
    else { do { b = rnd(n); } while (b === a); }
    return [a, b];
  }

  function genMoves(cfg) {
    const list = [];
    let prevKey = '';
    for (let i = 0; i < cfg.swaps; i++) {
      const r = Math.random();
      let mv;
      if (i > 0 && r < cfg.fake) {
        mv = { pairs: [randPair(cfg.cups)], fake: true };
      } else if (cfg.cups >= 4 && r < cfg.fake + cfg.dbl) {
        const p1 = randPair(cfg.cups);
        const rest = [];
        for (let s = 0; s < cfg.cups; s++) if (s !== p1[0] && s !== p1[1]) rest.push(s);
        shuffleArr(rest);
        mv = { pairs: [p1, [rest[0], rest[1]]], fake: false };
      } else {
        mv = { pairs: [randPair(cfg.cups)], fake: false };
      }
      const key = mv.pairs.map(p => p.slice().sort().join('-')).sort().join('|') + mv.fake;
      if (key === prevKey && !mv.fake) { i--; continue; } // 同じ入れかえ2連続(=元通り)はさける
      prevKey = key;
      list.push(mv);
    }
    return list;
  }

  // ---------- flow ----------
  function startGame() {
    initAudio();
    round = 0; lives = 3; score = 0; combo = 0; maxCombo = 0; correctCount = 0;
    intro.classList.add('hidden'); result.classList.add('hidden');
    startRound();
  }

  function startRound() {
    const cfg = ROUNDS[round];
    layoutSlots(cfg.cups);
    const items = shuffleArr(FRUITS.slice()).slice(0, cfg.items);
    const slotItems = new Array(cfg.cups).fill(null);
    const slotIdx = shuffleArr([...Array(cfg.cups).keys()]);
    items.forEach((it, i) => { slotItems[slotIdx[i]] = it; });
    cups = slotItems.map((it, s) => ({ slot: s, item: it, lift: 1, x: slotsX[s], y: BASE_Y, depth: 0 }));
    moves = genMoves(cfg); moveIdx = 0; moveT = 0;
    target = null; picked = null;
    state = 'show';
    timer = 1.4 + 0.5 * cfg.items;
    banner = 'おぼえて!';
    subBanner = `ラウンド ${round + 1} — フルーツ ${cfg.items}こ・カップ ${cfg.cups}こ`;
    let note = '';
    if (round === 2) note = '🍋 フルーツが2こに!どっちを聞かれるかわからないよ';
    else if (round === 3) note = '🌀 フェイント登場!近づいてもどるだけのうごきに注意';
    else if (round === 5) note = '⚡ 2組どうじのいれかえ登場!';
    else if (round === 9) note = '👑 さいごのラウンド!フルーツ4こ';
    msgEl.textContent = note;
    updateHud();
  }

  function beginAsk() {
    const present = cups.filter(c => c.item).map(c => c.item);
    target = present[rnd(present.length)];
    state = 'ask';
    askLeft = ASK_TIME;
    banner = `${target} ${FRUIT_NAME[target]}はどこ?`;
    subBanner = 'カップをタップ!';
    sfx.ask();
  }

  function pick(slot) {
    if (state !== 'ask') return;
    const cup = cups.find(c => c.slot === slot);
    if (!cup) return;
    picked = cup;
    wasRight = cup.item === target;
    if (wasRight) {
      combo++; maxCombo = Math.max(maxCombo, combo); correctCount++;
      const speed = Math.round(60 * askLeft / ASK_TIME);
      const gain = 100 + speed + (combo - 1) * 20;
      score += gain;
      banner = `せいかい! +${gain}`;
      subBanner = combo >= 2 ? `🔥 ${combo}れんぞく!` : 'よく見てたね!';
      sfx.good();
    } else {
      combo = 0; lives--;
      banner = picked ? (cup.item ? `ざんねん…それは${cup.item}` : 'ざんねん…からっぽ') : 'じかんぎれ!';
      subBanner = `${target}はこっちだったよ`;
      sfx.bad();
    }
    state = 'reveal'; timer = 2.0;
    sfx.lift();
    updateHud();
  }

  function timeUp() {
    picked = null; wasRight = false;
    combo = 0; lives--;
    banner = 'じかんぎれ!';
    subBanner = `${target}はこっちだったよ`;
    sfx.bad();
    state = 'reveal'; timer = 2.0;
    updateHud();
  }

  function afterReveal() {
    if (lives <= 0) return endGame(false);
    round++;
    if (round >= ROUNDS.length) return endGame(true);
    startRound();
  }

  function endGame(clear) {
    state = 'over';
    msgEl.textContent = '';
    let rank;
    if (clear && lives === 3) rank = '🏆 S';
    else if (score >= 1500) rank = '🥇 A';
    else if (score >= 900) rank = '🥈 B';
    else rank = '🥉 C';
    $('resultTitle').textContent = clear ? '🎉 ぜんラウンドクリア!' : '💔 ゲームオーバー';
    $('resultRank').textContent = rank;
    $('resultText').innerHTML =
      `とどいたラウンド: <b>${Math.min(round + 1, ROUNDS.length)}/${ROUNDS.length}</b><br>` +
      `せいかい: <b>${correctCount}</b>かい / さいだいれんぞく: <b>${maxCombo}</b><br>` +
      `スコア: <b>${score}</b>` +
      (clear ? '' : '<br><span style="font-size:.8rem">ヒント:聞かれるのはどのフルーツかわからない。ぜんぶ目でおいかけよう!</span>');
    result.classList.remove('hidden');
    updateHud();
  }

  function updateHud() {
    hudRound.textContent = `ラウンド ${Math.min(round + 1, ROUNDS.length)}/${ROUNDS.length}`;
    hudLife.textContent = '❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(3 - Math.max(0, lives));
    hudCombo.textContent = `🔥 ${combo}`;
    hudScore.textContent = `⭐ ${score}`;
  }

  // ---------- update ----------
  function update(dt) {
    const cfg = ROUNDS[round];
    if (state === 'show') {
      timer -= dt;
      if (timer <= 0) { state = 'drop'; timer = 0.45; banner = 'いくよ…'; subBanner = ''; }
    } else if (state === 'drop') {
      timer -= dt;
      const t = Math.max(0, timer / 0.45);
      cups.forEach(c => { c.lift = t; });
      if (timer <= 0) {
        cups.forEach(c => { c.lift = 0; });
        state = 'shuffle'; moveIdx = 0; moveT = 0;
        banner = 'シャッフル!'; subBanner = '';
        sfx.swish();
      }
    } else if (state === 'shuffle') {
      const mv = moves[moveIdx];
      moveT += dt * 1000 / cfg.dur;
      subBanner = `${Math.min(moveIdx + 1, moves.length)} / ${moves.length}`;
      if (moveT >= 1) {
        if (!mv.fake) {
          // slots を入れかえる
          const map = {};
          mv.pairs.forEach(([a, b]) => { map[a] = b; map[b] = a; });
          cups.forEach(c => { if (map[c.slot] !== undefined) c.slot = map[c.slot]; });
        }
        moveIdx++; moveT = 0;
        if (moveIdx >= moves.length) { layoutRest(); setTimeout(() => { if (state === 'pause') beginAsk(); }, 350); state = 'pause'; banner = 'さて…'; subBanner = ''; }
        else sfx.swish();
      }
    } else if (state === 'ask') {
      askLeft -= dt;
      if (askLeft <= 0) { askLeft = 0; timeUp(); }
    } else if (state === 'reveal') {
      const elapsed = 2.0 - timer;
      cups.forEach(c => {
        const goal = (c === picked) ? 1 : (elapsed > 0.45 ? 1 : 0);
        c.lift += (goal - c.lift) * Math.min(1, dt * 10);
      });
      timer -= dt;
      if (timer <= 0) afterReveal();
    }
    positionCups();
  }

  function layoutRest() { cups.forEach(c => { c.x = slotsX[c.slot]; c.y = BASE_Y; c.depth = 0; }); }

  function positionCups() {
    if (state === 'shuffle' && moves[moveIdx]) {
      const mv = moves[moveIdx];
      const p = mv.fake ? Math.sin(Math.PI * Math.min(1, moveT)) * 0.42 : ease(Math.min(1, moveT));
      const arc = Math.sin(Math.PI * Math.min(1, moveT));
      cups.forEach(c => { c.x = slotsX[c.slot]; c.y = BASE_Y; c.depth = 0; });
      mv.pairs.forEach(([a, b], pi) => {
        const ca = cups.find(c => c.slot === a), cb = cups.find(c => c.slot === b);
        const dist = Math.abs(slotsX[b] - slotsX[a]);
        const lift = 26 + dist * 0.14;
        if (ca) { ca.x = slotsX[a] + (slotsX[b] - slotsX[a]) * p; ca.y = BASE_Y - arc * lift * (pi ? 0.8 : 1); ca.depth = -1; }
        if (cb) { cb.x = slotsX[b] + (slotsX[a] - slotsX[b]) * p; cb.y = BASE_Y + arc * lift * 0.35; cb.depth = 1; }
      });
    } else {
      cups.forEach(c => { c.x = slotsX[c.slot]; c.y = BASE_Y; c.depth = 0; });
    }
  }

  // ---------- draw ----------
  function drawTable() {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#3b2a5a'); grd.addColorStop(0.55, '#5a3b6e'); grd.addColorStop(0.56, '#a0612f'); grd.addColorStop(1, '#6e3d1c');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // テーブルクロス
    g.fillStyle = '#2f7a4a';
    g.beginPath(); g.ellipse(W / 2, BASE_Y + 8, W * 0.48, 40, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f5d76e'; g.lineWidth = 3; g.stroke();
    // ステージのライト
    g.fillStyle = 'rgba(255,240,180,0.08)';
    g.beginPath(); g.moveTo(W / 2 - 40, 0); g.lineTo(W / 2 + 40, 0); g.lineTo(W - 10, BASE_Y + 40); g.lineTo(10, BASE_Y + 40); g.closePath(); g.fill();
  }

  function drawCup(x, y, scale, highlight) {
    const w = CUP_W * scale, h = CUP_H * scale;
    // かげ
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x, BASE_Y + 6, w * 0.55, 9, 0, 0, Math.PI * 2); g.fill();
    const top = y - h, bw = w / 2, tw = w * 0.32;
    g.save();
    g.beginPath();
    g.moveTo(x - bw, y); g.lineTo(x - tw, top); g.lineTo(x + tw, top); g.lineTo(x + bw, y); g.closePath();
    const cg = g.createLinearGradient(x - bw, 0, x + bw, 0);
    cg.addColorStop(0, '#9b1d1d'); cg.addColorStop(0.35, '#e74c3c'); cg.addColorStop(0.6, '#ff7b6b'); cg.addColorStop(1, '#8e1717');
    g.fillStyle = cg; g.fill();
    g.clip();
    // しましま
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 2; k++) { const yy = top + h * (0.3 + k * 0.32); g.fillRect(x - bw, yy, w, h * 0.09); }
    g.restore();
    // ふち
    g.fillStyle = '#7a1010';
    g.beginPath(); g.ellipse(x, y, bw, 7 * scale, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c0392b';
    g.beginPath(); g.ellipse(x, top, tw, 5 * scale, 0, 0, Math.PI * 2); g.fill();
    if (highlight) {
      g.strokeStyle = highlight; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x - bw - 4, y + 4); g.lineTo(x - tw - 3, top - 4); g.lineTo(x + tw + 3, top - 4); g.lineTo(x + bw + 4, y + 4); g.closePath(); g.stroke();
    }
  }

  function drawItem(it, x) {
    if (!it) return;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(x, BASE_Y - 4, 30, 9, 0, 0, Math.PI * 2); g.fill();
    g.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(it, x, BASE_Y - 26);
  }

  function draw() {
    drawTable();
    if (state === 'title') {
      layoutSlotsIfEmpty();
      const t = performance.now() / 600;
      slotsX.forEach((x, i) => drawCup(x, BASE_Y - Math.max(0, Math.sin(t + i)) * 14, 1, null));
      drawBanner('🥤 シャッフルカップ', 'スタートをおしてね');
      return;
    }
    // フルーツ(カップの下)
    cups.forEach(c => { if (c.lift > 0.05) drawItem(c.item, c.x); });
    // カップ:奥から順に
    const order = cups.slice().sort((a, b) => a.depth - b.depth);
    order.forEach(c => {
      let hl = null;
      if (state === 'reveal') {
        if (c.item === target) hl = '#4ade80';
        else if (c === picked) hl = '#ef4444';
      }
      const scale = 1 + c.depth * 0.06;
      drawCup(c.x, c.y - c.lift * LIFT, scale, hl);
    });
    // 番号ラベル(キーボード用)
    if (state === 'ask') {
      g.font = 'bold 16px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      slotsX.forEach((x, i) => {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath(); g.arc(x, BASE_Y + 34, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a2212'; g.fillText(String(i + 1), x, BASE_Y + 35);
      });
    }
    drawBanner(banner, subBanner);
    // タイマーバー
    if (state === 'ask') {
      const r = askLeft / ASK_TIME;
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(40, 118, W - 80, 12);
      g.fillStyle = r > 0.5 ? '#4ade80' : r > 0.25 ? '#facc15' : '#ef4444';
      g.fillRect(40, 118, (W - 80) * r, 12);
    } else if (state === 'show') {
      const total = 1.4 + 0.5 * ROUNDS[round].items;
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(40, 118, W - 80, 8);
      g.fillStyle = '#93c5fd'; g.fillRect(40, 118, (W - 80) * Math.max(0, timer / total), 8);
    }
  }

  function layoutSlotsIfEmpty() { if (!slotsX.length) layoutSlots(3); }

  function drawBanner(main, sub) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(30, 20, W - 60, 86, 14); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.fillText(main, W / 2, 52);
    if (sub) {
      g.fillStyle = '#fde68a';
      g.font = 'bold 17px system-ui, sans-serif';
      g.fillText(sub, W / 2, 88);
    }
  }
  function roundRect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---------- loop ----------
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (state !== 'title' && state !== 'over') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  function slotFromPoint(px, py) {
    if (py < BASE_Y - CUP_H - 40 || py > BASE_Y + 50) return -1;
    let best = -1, bd = Infinity;
    slotsX.forEach((x, i) => { const d = Math.abs(px - x); if (d < bd) { bd = d; best = i; } });
    const sp = slotsX.length > 1 ? slotsX[1] - slotsX[0] : 100;
    return bd <= Math.max(CUP_W / 2 + 6, sp / 2) ? best : -1;
  }
  cv.addEventListener('pointerdown', e => {
    if (state !== 'ask') return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    const s = slotFromPoint(px, py);
    if (s >= 0) pick(s);
  });
  window.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && (state === 'title' || state === 'over')) {
      e.preventDefault(); startGame(); return;
    }
    if (state === 'ask' && /^[1-5]$/.test(e.key)) {
      const s = Number(e.key) - 1;
      if (s < slotsX.length) pick(s);
    }
  });
  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);

  updateHud();
  requestAnimationFrame(loop);
})();
