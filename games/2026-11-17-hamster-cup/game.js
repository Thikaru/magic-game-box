(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const W = 360, H = 250;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const RACES = [
    { name: 'よせん', L: 1200, rivals: [46, 50, 54], need: 2 },
    { name: 'じゅんけっしょう', L: 1400, rivals: [52, 58, 63], need: 2 },
    { name: 'けっしょう', L: 1600, rivals: [62, 67, 73], need: 1 },
  ];
  const PICKS = 3;
  const RIVAL_EMO = ['🐭', '🐿️', '🐰'];
  const RIVAL_NAME = ['チュータ', 'リスオ', 'ピョン'];
  const STAT_LABEL = { spd: '🏃はやさ', sta: '🫁スタミナ', rec: '💤かいふく' };
  const CARDS = [
    { e: '🥕', n: 'にんじんダッシュ', d: { spd: 2 } },
    { e: '🏊', n: 'プールでおよぐ', d: { sta: 2 } },
    { e: '😴', n: 'ぐっすりひるね', d: { rec: 2 } },
    { e: '🏋️', n: 'もうとっくん', d: { spd: 3, rec: -1 } },
    { e: '🍰', n: 'ごちそうケーキ', d: { sta: 3, spd: -1 } },
    { e: '🛁', n: 'おふろでリラックス', d: { rec: 3, sta: -1 } },
    { e: '🧘', n: 'めいそう', d: { rec: 1, sta: 1 } },
    { e: '⛰️', n: 'さかみちトレーニング', d: { spd: 1, sta: 1 } },
    { e: '🎡', n: 'まわしぐるま', d: { spd: 1, rec: 1 } },
    { e: '🎲', n: 'きまぐれとっくん', d: 'rand' },
  ];

  const el = {
    raceName: $('raceName'), pos: $('pos'), dist: $('dist'), hint: $('hint'),
    stBar: $('stBar'), stNum: $('stNum'), sSpd: $('sSpd'), sSta: $('sSta'), sRec: $('sRec'), dash: $('dash'),
    intro: $('intro'), train: $('train'), tTitle: $('tTitle'), tText: $('tText'), cards: $('cards'),
    after: $('after'), aTitle: $('aTitle'), aRank: $('aRank'), aText: $('aText'),
    result: $('result'), rTitle: $('rTitle'), rRank: $('rRank'), rText: $('rText'),
  };

  let stats, raceIdx, picksLeft, phase, holding = false;
  let segs, player, rivals, raceT, countT, endT, finishOrder, offer, flashMsg, flashT;
  let lastTs = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const show = (o, on) => o.classList.toggle('hidden', !on);
  const stMax = () => 40 + stats.sta * 10;
  const sprintV = () => 60 + stats.spd * 6;
  const recRate = () => 6 + stats.rec * 2.5;

  function showStats() {
    el.sSpd.textContent = stats.spd; el.sSta.textContent = stats.sta; el.sRec.textContent = stats.rec;
  }

  // ---------- training ----------
  function cardText(c) {
    if (c.d === 'rand') return '<span>どれか1つが <span class="up">+1〜+4</span>(運しだい)</span>';
    return '<span>' + Object.keys(c.d).map(k => {
      const v = c.d[k];
      return STAT_LABEL[k] + ' <span class="' + (v > 0 ? 'up' : 'down') + '">' + (v > 0 ? '+' : '') + v + '</span>';
    }).join(' ') + '</span>';
  }
  function startTraining() {
    phase = 'train';
    picksLeft = PICKS;
    show(el.after, false); show(el.result, false); show(el.intro, false);
    nextOffer();
    show(el.train, true);
  }
  function nextOffer() {
    const r = RACES[raceIdx];
    el.tTitle.textContent = '🏋️ とっくん(のこり' + picksLeft + '回)';
    el.tText.innerHTML = 'つぎは <b>' + r.name + '</b>(' + r.L + 'm・' + r.need + 'い以内で通過)<br>いま: 🏃' + stats.spd + ' 🫁' + stats.sta + ' 💤' + stats.rec;
    const pool = CARDS.slice();
    offer = [];
    for (let i = 0; i < 3; i++) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    el.cards.innerHTML = '';
    offer.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tcard';
      b.innerHTML = '<span class="em">' + c.e + '</span><div><b>' + (i + 1) + '. ' + c.n + '</b>' + cardText(c) + '</div>';
      b.addEventListener('click', () => pick(i));
      el.cards.appendChild(b);
    });
  }
  function pick(i) {
    if (phase !== 'train' || !offer[i]) return;
    const c = offer[i];
    let d = c.d;
    if (d === 'rand') {
      const k = ['spd', 'sta', 'rec'][Math.floor(Math.random() * 3)];
      d = {}; d[k] = Math.random() < 0.5 ? 4 : 1;
    }
    for (const k in d) stats[k] = Math.max(0, stats[k] + d[k]);
    showStats();
    picksLeft--;
    if (picksLeft > 0) nextOffer();
    else { show(el.train, false); startRace(); }
  }

  // ---------- race ----------
  function genSegs(L) {
    const out = [];
    let x = 120, prev = 'flat';
    while (x < L - 60) {
      const opts = ['flat', 'up', 'down'].filter(t => t !== prev);
      const t = opts[Math.floor(Math.random() * opts.length)];
      const len = Math.round(rnd(110, 240));
      const b = Math.min(L, x + len);
      out.push({ a: x, b, t });
      x = b; prev = t;
    }
    return out;
  }
  function terrainAt(x) {
    for (const s of segs) if (x >= s.a && x < s.b) return s.t;
    return 'flat';
  }
  function nextTerrain(x) {
    for (const s of segs) if (s.a > x && s.t !== 'flat') return s;
    return null;
  }
  function startRace() {
    const r = RACES[raceIdx];
    segs = genSegs(r.L);
    player = { x: 0, v: 0, st: stMax(), tired: 0, done: false, ft: 0 };
    rivals = r.rivals.map((b, i) => ({ x: 0, base: b * rnd(0.97, 1.03), ph: rnd(0, 6.28), w: rnd(0.6, 1.1), done: false, ft: 0, i }));
    finishOrder = [];
    raceT = 0; countT = 3; endT = 0; flashMsg = ''; flashT = 0;
    el.raceName.textContent = '🏁 ' + r.name;
    phase = 'count';
  }
  function flash(m) { flashMsg = m; flashT = 1.2; }

  function update(dt) {
    if (phase === 'count') {
      countT -= dt;
      if (countT <= 0) { phase = 'race'; flash('よーい、ドン!'); }
      return;
    }
    if (phase !== 'race' && phase !== 'ending') return;
    const r = RACES[raceIdx];
    raceT += dt;
    if (flashT > 0) flashT -= dt;

    // player
    const p = player;
    if (!p.done) {
      const t = terrainAt(p.x);
      const sp = holding && p.tired <= 0 && p.st > 0;
      const mult = t === 'up' ? (sp ? 0.62 : 0.75) : t === 'down' ? (sp ? 1.4 : 1.12) : 1;
      let target;
      if (p.tired > 0) {
        p.tired -= dt; target = 18;
      } else if (sp) {
        target = sprintV();
        const drain = t === 'up' ? 42 : t === 'down' ? 5 : 24;
        p.st -= drain * dt;
        if (p.st <= 0) { p.st = 0; p.tired = 2.0; flash('へとへと…💦'); }
      } else {
        target = 40;
        p.st = Math.min(stMax(), p.st + recRate() * (t === 'down' ? 1.5 : 1) * dt);
      }
      p.v += (target - p.v) * Math.min(1, dt * 6);
      p.x += p.v * mult * dt;
      if (p.x >= r.L) { p.x = r.L; p.done = true; p.ft = raceT; finishOrder.push('p'); }
    }
    // rivals
    rivals.forEach(rv => {
      if (rv.done) return;
      const t = terrainAt(rv.x);
      const mult = t === 'up' ? 0.8 : t === 'down' ? 1.15 : 1;
      const spurt = rv.x > r.L * 0.85 ? 1.06 : 1;
      const v = rv.base * (1 + 0.13 * Math.sin(raceT * rv.w + rv.ph)) * mult * spurt;
      rv.x += v * dt;
      if (rv.x >= r.L) { rv.x = r.L; rv.done = true; rv.ft = raceT; finishOrder.push(rv.i); }
    });

    if (phase === 'race') {
      const rivalsAhead = finishOrder.filter(f => f !== 'p').length;
      if (player.done || (finishOrder.indexOf('p') < 0 && rivalsAhead >= r.need)) {
        phase = 'ending'; endT = player.done ? 1.0 : 1.6;
        if (!player.done) flash('ああっ…');
        else flash('ゴール!');
      }
    } else {
      endT -= dt;
      if (endT <= 0) finishRace();
    }
  }

  function currentRank() {
    const pi = finishOrder.indexOf('p');
    if (pi >= 0) return pi + 1;
    return 1 + rivals.filter(rv => rv.done || rv.x > player.x).length;
  }

  function rankTable() {
    const list = [{ n: '🐹 キミ', x: player.x, done: player.done, ft: player.ft, me: true }]
      .concat(rivals.map(rv => ({ n: RIVAL_EMO[rv.i] + ' ' + RIVAL_NAME[rv.i], x: rv.x, done: rv.done, ft: rv.ft })));
    list.sort((a, b) => (a.done && b.done) ? a.ft - b.ft : a.done ? -1 : b.done ? 1 : b.x - a.x);
    const medal = ['🥇', '🥈', '🥉', '4️⃣'];
    return list.map((e, i) => {
      const line = medal[i] + ' ' + e.n + ' ' + (e.done ? e.ft.toFixed(1) + 'びょう' : 'のこり' + Math.ceil(RACES[raceIdx].L - e.x) + 'm');
      return e.me ? '<b>' + line + '</b>' : line;
    }).join('<br>');
  }

  function finishRace() {
    const r = RACES[raceIdx];
    const rank = currentRank();
    holding = false; el.dash.classList.remove('on');
    const passed = player.done && rank <= r.need;
    if (passed && raceIdx === RACES.length - 1) {
      phase = 'over';
      el.rTitle.textContent = '🏆 ゆうしょう!おめでとう!';
      el.rRank.innerHTML = rankTable();
      el.rText.innerHTML = 'さいしゅうのうりょく: 🏃' + stats.spd + ' 🫁' + stats.sta + ' 💤' + stats.rec + '<br>けっしょうタイム ' + player.ft.toFixed(1) + 'びょう。もっと速いタイムをめざそう!';
      show(el.result, true);
    } else if (passed) {
      phase = 'after';
      el.aTitle.textContent = '🎉 ' + r.name + ' ' + rank + 'いで通過!';
      el.aRank.innerHTML = rankTable();
      el.aText.textContent = 'つぎは ' + RACES[raceIdx + 1].name + '。ライバルはもっと速いぞ!とっくんしよう。';
      show(el.after, true);
    } else {
      phase = 'over';
      el.rTitle.textContent = '😢 ' + r.name + 'で敗退…';
      el.rRank.innerHTML = rankTable();
      el.rText.innerHTML = r.need + 'い以内に入れなかった。<br>💡くだり坂でダッシュ、のぼり坂でひと休みがコツ!<br>とっくんのバランスも考えてみよう。';
      show(el.result, true);
    }
  }

  // ---------- drawing ----------
  const TCOL = { flat: '#9fd98a', up: '#d4a46a', down: '#8fd0ee' };
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!segs) { ctx.fillStyle = TCOL.flat; ctx.fillRect(0, 0, W, H); return; }
    const r = RACES[raceIdx];
    const cx = player.x - 90;
    const top = 30, laneH = 52;
    // ground bands
    ctx.fillStyle = TCOL.flat; ctx.fillRect(0, top, W, H - top);
    segs.forEach(s => {
      const a = s.a - cx, b = s.b - cx;
      if (b < 0 || a > W || s.t === 'flat') return;
      ctx.fillStyle = TCOL[s.t];
      ctx.fillRect(a, top, b - a, H - top);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
      const lx = Math.max(a + 4, Math.min(4, b - 80));
      ctx.fillText(s.t === 'up' ? '⛰ のぼり' : '🛝 くだり', lx, top + 14);
      // slope stripes
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      for (let x = Math.ceil((s.a) / 30) * 30; x < s.b; x += 30) {
        const sx = x - cx; if (sx < -20 || sx > W + 20) continue;
        ctx.beginPath();
        if (s.t === 'up') { ctx.moveTo(sx, H - 4); ctx.lineTo(sx + 10, H - 14); ctx.lineTo(sx + 20, H - 4); }
        else { ctx.moveTo(sx, H - 14); ctx.lineTo(sx + 10, H - 4); ctx.lineTo(sx + 20, H - 14); }
        ctx.stroke();
      }
    });
    // lane lines
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    for (let i = 1; i < 4; i++) {
      const y = top + 6 + i * laneH;
      ctx.beginPath(); ctx.lineDashOffset = cx % 18; ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // distance markers
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    for (let m = 100; m < r.L; m += 100) { const sx = m - cx; if (sx > -10 && sx < W + 10) ctx.fillText(m + 'm', sx, H - 18); }
    // start & finish
    const fx = r.L - cx;
    if (fx > -20 && fx < W + 20) {
      for (let y = top; y < H; y += 10) for (let k = 0; k < 2; k++) {
        ctx.fillStyle = ((y / 10 + k) % 2) ? '#222' : '#fff'; ctx.fillRect(fx + k * 8, y, 8, 10);
      }
    }
    const sx0 = 0 - cx;
    if (sx0 > -10 && sx0 < W) { ctx.fillStyle = '#fff'; ctx.fillRect(sx0, top, 4, H - top); }
    // runners
    ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rivals.forEach((rv, i) => {
      const y = top + 6 + laneH * i + laneH / 2;
      const x = rv.x - cx;
      if (x > -30 && x < W + 30) ctx.fillText(RIVAL_EMO[rv.i], x, y + bob(rv.x));
      else if (x >= W + 30) { ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#c0392b'; ctx.fillText(RIVAL_EMO[rv.i] + '▶' + Math.round(rv.x - player.x) + 'm', W - 36, y); ctx.font = '30px sans-serif'; }
    });
    const py = top + 6 + laneH * 3 + laneH / 2;
    const sprinting = holding && player.tired <= 0 && player.st > 0 && phase === 'race';
    if (sprinting) { ctx.font = '18px sans-serif'; ctx.fillText('💨', 90 - 26, py + 6); }
    if (player.tired > 0) { ctx.font = '16px sans-serif'; ctx.fillText('💦', 90 + 14, py - 18); }
    ctx.font = '32px sans-serif'; ctx.fillText('🐹', 90, py + bob(player.x));
    ctx.textBaseline = 'alphabetic';
    // minimap
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(0, 0, W, top);
    ctx.fillStyle = '#e2c48a'; ctx.fillRect(14, 13, W - 28, 4);
    segs.forEach(s => { if (s.t === 'flat') return; ctx.fillStyle = s.t === 'up' ? '#b07a3a' : '#3a9ad0'; ctx.fillRect(14 + (W - 28) * s.a / r.L, 12, (W - 28) * (s.b - s.a) / r.L, 6); });
    ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rivals.forEach(rv => ctx.fillText(RIVAL_EMO[rv.i], 14 + (W - 28) * rv.x / r.L, 12));
    ctx.fillText('🐹', 14 + (W - 28) * player.x / r.L, 22);
    ctx.fillText('🏁', W - 10, 15);
    ctx.textBaseline = 'alphabetic';
    // countdown / flash
    if (phase === 'count') bigText(String(Math.ceil(countT)));
    else if (flashT > 0) bigText(flashMsg, 26);
  }
  function bob(x) { return Math.sin(x / 6) * 2; }
  function bigText(t, size) {
    ctx.font = 'bold ' + (size || 56) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.strokeText(t, W / 2, H / 2 + 10);
    ctx.fillStyle = '#ff6a10'; ctx.fillText(t, W / 2, H / 2 + 10);
    ctx.textBaseline = 'alphabetic';
  }

  function hud() {
    if (!player) return;
    const r = RACES[raceIdx];
    el.pos.textContent = (phase === 'count' ? '-' : currentRank()) + 'い / ' + r.need + 'い以内';
    el.dist.textContent = 'のこり ' + Math.max(0, Math.ceil(r.L - player.x)) + 'm';
    const ratio = player.st / stMax();
    el.stBar.style.width = (ratio * 100) + '%';
    el.stBar.style.background = player.tired > 0 ? '#999' : ratio < 0.25 ? '#e74c3c' : ratio < 0.5 ? '#f1c40f' : '#4cc46a';
    el.stNum.textContent = Math.ceil(player.st) + '/' + stMax();
    let h = '';
    if (phase === 'race') {
      const t = terrainAt(player.x);
      if (player.tired > 0) h = '💦 へとへと!すこし待とう';
      else if (t === 'up') h = '⛰ のぼり坂:ダッシュはスタミナを大きく使う';
      else if (t === 'down') h = '🛝 くだり坂:いまがダッシュのチャンス!';
      else {
        const n = nextTerrain(player.x);
        if (n && n.a - player.x < 200) h = 'この先 ' + Math.ceil(n.a - player.x) + 'm で ' + (n.t === 'up' ? '⛰ のぼり坂' : '🛝 くだり坂');
        else h = 'たいらな道';
      }
    }
    el.hint.textContent = h;
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    update(dt);
    draw();
    hud();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  function setHold(on) {
    if (on && phase !== 'race') on = false;
    holding = on;
    el.dash.classList.toggle('on', on);
  }
  [el.dash, cv].forEach(t => {
    t.addEventListener('pointerdown', e => { e.preventDefault(); setHold(true); });
    t.addEventListener('contextmenu', e => e.preventDefault());
  });
  window.addEventListener('pointerup', () => setHold(false));
  window.addEventListener('pointercancel', () => setHold(false));
  window.addEventListener('blur', () => setHold(false));
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (phase === 'race') setHold(true);
      return;
    }
    if (phase === 'train' && !e.repeat && ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(e.code)) {
      pick(Number(e.code.slice(-1)) - 1);
    }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowRight') setHold(false); });

  function newGame() {
    stats = { spd: 1, sta: 1, rec: 1 };
    raceIdx = 0;
    segs = null; player = null;
    showStats();
    startTraining();
  }
  $('startBtn').addEventListener('click', newGame);
  $('againBtn').addEventListener('click', newGame);
  $('nextBtn').addEventListener('click', () => {
    if (phase !== 'after') return;
    raceIdx++;
    startTraining();
  });

  stats = { spd: 1, sta: 1, rec: 1 };
  raceIdx = 0; phase = 'intro';
  showStats();
  el.stBar.style.width = '100%';
  el.stNum.textContent = stMax() + '/' + stMax();
  requestAnimationFrame(loop);
})();
