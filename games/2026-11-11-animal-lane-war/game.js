(() => {
  'use strict';
  const W = 360, H = 430, LANES = 3, LW = W / LANES;
  const Y_TOP = 46, Y_BOT = H - 46;
  const MAX_HP = 6, MAX_EN = 10, TIME = 90, RUSH = 20, WARN = 1.1;
  // 0:ねずみ 1:ねこ 2:ぞう   BEATS[a] = a が勝てる相手
  const TYPES = [
    { e: '🐭', cost: 2, speed: 74, dmg: 1, r: 15 },
    { e: '🐱', cost: 3, speed: 52, dmg: 1, r: 17 },
    { e: '🐘', cost: 4, speed: 36, dmg: 2, r: 20 }
  ];
  const BEATS = [2, 0, 1];
  const COUNTER = [1, 2, 0]; // COUNTER[t] = t に勝てるタイプ

  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const el = { ehp: $('ehp'), php: $('php'), time: $('time'), en: $('en'), pips: $('pips'),
    intro: $('intro'), result: $('result'), rTitle: $('rTitle'), rText: $('rText') };
  const unitBtns = Array.from(document.querySelectorAll('.unit'));
  const pipEls = [];
  for (let i = 0; i < MAX_EN; i++) {
    const p = document.createElement('i'), b = document.createElement('b');
    p.appendChild(b); el.pips.appendChild(p); pipEls.push(b);
  }

  // 高解像度対応
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let state = 'intro', units, fx, pHp, eHp, pEn, eEn, timeLeft, sel, aiTimer, last, flashP, flashE, laneFlash, stats, aiQueue;
  let actx = null;

  function beep(freq, dur, type, vol) {
    if (!actx) return;
    try {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.05, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 音が出なくても続行 */ }
  }

  function reset() {
    units = []; fx = [];
    pHp = eHp = MAX_HP; pEn = 5; eEn = 4; aiQueue = null;
    timeLeft = TIME; sel = 0; aiTimer = 1.2;
    flashP = flashE = 0; laneFlash = [0, 0, 0];
    stats = { sent: 0, wins: 0 };
    hud();
  }

  function hearts(n) { return '❤'.repeat(Math.max(0, n)) + '🖤'.repeat(MAX_HP - Math.max(0, n)); }
  function hud() {
    el.ehp.textContent = '🏯' + hearts(eHp);
    el.php.textContent = '🏠' + hearts(pHp);
    el.time.textContent = Math.ceil(timeLeft);
    el.time.style.color = timeLeft <= RUSH ? '#ff8a7a' : '';
    el.en.textContent = Math.floor(pEn);
    for (let i = 0; i < MAX_EN; i++) {
      const f = Math.max(0, Math.min(1, pEn - i));
      pipEls[i].style.width = (f * 100) + '%';
    }
    unitBtns.forEach((b, i) => {
      b.classList.toggle('sel', i === sel);
      b.classList.toggle('poor', pEn < TYPES[i].cost);
    });
  }

  function laneX(l) { return l * LW + LW / 2; }

  function spawn(side, type, lane) {
    units.push({ side, type, lane, y: side === 'p' ? Y_BOT : Y_TOP, warn: side === 'e' ? WARN : 0, alive: true });
  }

  function deploy(lane) {
    if (state !== 'play') return;
    const t = TYPES[sel];
    if (pEn < t.cost) {
      laneFlash[lane] = -0.3; beep(140, 0.12, 'sawtooth', 0.04);
      fx.push({ x: laneX(lane), y: Y_BOT - 30, txt: '⚡たりない', life: 0.7 });
      return;
    }
    pEn -= t.cost; stats.sent++;
    spawn('p', sel, lane);
    laneFlash[lane] = 0.25;
    beep(520 + sel * 90, 0.07, 'triangle', 0.05);
    hud();
  }

  // ===== 相手AI =====
  function aiThink() {
    // 2体コンボの後続を出す
    if (aiQueue) {
      const q = aiQueue; aiQueue = null;
      if (eEn >= TYPES[q.type].cost) { eEn -= TYPES[q.type].cost; spawn('e', q.type, q.lane); return; }
    }
    // 止められていない自軍(プレイヤー)ユニットを探す
    let threat = null;
    for (const p of units) {
      if (!p.alive || p.side !== 'p') continue;
      const guarded = units.some(e => e.alive && e.side === 'e' && e.lane === p.lane && e.y < p.y);
      if (!guarded && (!threat || p.y < threat.y)) threat = p;
    }
    const urgent = threat && threat.y < Y_TOP + 130;
    if (threat && (urgent || Math.random() < 0.65)) {
      // たまにまちがえる(完全な後出しじゃんけんにしない)
      let t = COUNTER[threat.type];
      if (Math.random() < 0.15) t = Math.floor(Math.random() * 3);
      if (eEn >= TYPES[t].cost) { eEn -= TYPES[t].cost; spawn('e', t, threat.lane); return; }
      if (eEn >= 2 && urgent) { eEn -= 2; spawn('e', 0, threat.lane); return; }
      return;
    }
    // 攻め: ためてから出す
    if (eEn >= 4 || (eEn >= 3 && Math.random() < 0.4)) {
      const opts = [0, 1, 2].filter(t => TYPES[t].cost <= eEn);
      const t = opts[Math.floor(Math.random() * opts.length)];
      // プレイヤーのユニットが少ない道をねらう
      const cnt = [0, 0, 0];
      units.forEach(u => { if (u.alive && u.side === 'p') cnt[u.lane]++; });
      const min = Math.min(cnt[0], cnt[1], cnt[2]);
      const lanes = [0, 1, 2].filter(l => cnt[l] === min);
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      eEn -= TYPES[t].cost;
      spawn('e', t, lane);
      // 余裕があれば「先頭のカウンターに勝てる」後続を同じ道に予約
      if (eEn >= 3 && Math.random() < 0.6) aiQueue = { type: BEATS[t], lane };
    }
  }

  function update(dt) {
    timeLeft -= dt;
    const rush = timeLeft <= RUSH;
    const elapsed = TIME - timeLeft;
    pEn = Math.min(MAX_EN, pEn + dt * (rush ? 1.6 : 1.0));
    eEn = Math.min(MAX_EN, eEn + dt * (rush ? 1.6 : 0.92 + Math.min(0.18, elapsed * 0.004)));

    aiTimer -= dt;
    if (aiTimer <= 0) { aiTimer = 0.45 + Math.random() * 0.3; aiThink(); }

    // 移動
    for (const u of units) {
      if (!u.alive) continue;
      if (u.warn > 0) { u.warn -= dt; continue; }
      u.y += (u.side === 'p' ? -1 : 1) * TYPES[u.type].speed * dt;
    }
    // 戦闘
    for (const p of units) {
      if (!p.alive || p.side !== 'p') continue;
      for (const e of units) {
        if (!e.alive || e.side !== 'e' || e.lane !== p.lane || !p.alive) continue;
        if (p.y - e.y > TYPES[p.type].r + TYPES[e.type].r - 4) continue;
        const x = laneX(p.lane), y = (p.y + e.y) / 2;
        if (p.type === e.type) {
          p.alive = e.alive = false;
          fx.push({ x, y, txt: '💥', life: 0.5 }); beep(200, 0.1, 'square', 0.04);
        } else if (BEATS[p.type] === e.type) {
          e.alive = false; stats.wins++;
          fx.push({ x, y, txt: '⭕', life: 0.5 }); beep(700, 0.09, 'triangle', 0.05);
        } else {
          p.alive = false;
          fx.push({ x, y, txt: '❌', life: 0.5 }); beep(160, 0.12, 'sawtooth', 0.04);
        }
      }
    }
    // とりで到達
    for (const u of units) {
      if (!u.alive) continue;
      if (u.side === 'p' && u.y <= Y_TOP - 6) {
        u.alive = false; eHp -= TYPES[u.type].dmg; flashE = 0.35;
        fx.push({ x: laneX(u.lane), y: Y_TOP + 8, txt: '-' + TYPES[u.type].dmg, life: 0.8, col: '#ffe36b' });
        beep(880, 0.15, 'square', 0.06);
      } else if (u.side === 'e' && u.y >= Y_BOT + 6) {
        u.alive = false; pHp -= TYPES[u.type].dmg; flashP = 0.35;
        fx.push({ x: laneX(u.lane), y: Y_BOT - 8, txt: '-' + TYPES[u.type].dmg, life: 0.8, col: '#ff8a7a' });
        beep(110, 0.2, 'sawtooth', 0.06);
      }
    }
    units = units.filter(u => u.alive);
    fx.forEach(f => { f.life -= dt; f.y -= 22 * dt; });
    fx = fx.filter(f => f.life > 0);
    flashP = Math.max(0, flashP - dt); flashE = Math.max(0, flashE - dt);
    for (let i = 0; i < LANES; i++) {
      if (laneFlash[i] > 0) laneFlash[i] = Math.max(0, laneFlash[i] - dt);
      else if (laneFlash[i] < 0) laneFlash[i] = Math.min(0, laneFlash[i] + dt);
    }
    hud();
    if (eHp <= 0 || pHp <= 0 || timeLeft <= 0) finish();
  }

  function finish() {
    state = 'over';
    timeLeft = Math.max(0, timeLeft);
    pHp = Math.max(0, pHp); eHp = Math.max(0, eHp);
    hud(); draw();
    let title, text;
    const info = '<br>じぶん ❤' + pHp + ' / あいて ❤' + eHp + '<br>出撃 ' + stats.sent + '回・三すくみ勝ち ' + stats.wins + '回';
    if (eHp <= 0 && pHp > 0) {
      const sec = Math.ceil(TIME - timeLeft);
      title = pHp === MAX_HP ? '👑 かんぺき勝利!' : '🎉 とりでをくずした!';
      text = sec + '秒で相手のとりでを落とした!' + info;
      beep(660, 0.12, 'square', 0.06); setTimeout(() => beep(880, 0.25, 'square', 0.06), 130);
    } else if (pHp <= 0 && eHp > 0) {
      title = '💦 とりでがおちた…';
      text = '「!」の予告を見て、勝てるどうぶつを同じ道に出そう。' + info;
      beep(150, 0.4, 'sawtooth', 0.06);
    } else if (pHp > eHp) {
      title = '🎉 はんてい勝ち!'; text = '時間切れ。❤の差で勝利!' + info;
      beep(660, 0.12, 'square', 0.06); setTimeout(() => beep(880, 0.25, 'square', 0.06), 130);
    } else if (pHp < eHp) {
      title = '😣 はんてい負け…'; text = '時間切れ。あと少し攻めきれなかった!' + info;
      beep(150, 0.4, 'sawtooth', 0.06);
    } else {
      title = '🤝 ひきわけ'; text = 'まったくの互角!次こそ決着をつけよう。' + info;
    }
    el.rTitle.textContent = title;
    el.rText.innerHTML = text;
    el.result.classList.remove('hidden');
  }

  // ===== 描画 =====
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let l = 0; l < LANES; l++) {
      ctx.fillStyle = l % 2 ? '#356b4c' : '#2f6146';
      ctx.fillRect(l * LW, 0, LW, H);
      // 道
      ctx.fillStyle = '#c9b182';
      ctx.fillRect(laneX(l) - 24, Y_TOP, 48, Y_BOT - Y_TOP);
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      for (let y = Y_TOP + 10; y < Y_BOT; y += 28) ctx.fillRect(laneX(l) - 2, y, 4, 12);
      if (laneFlash[l] > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (laneFlash[l] * 1.2) + ')'; ctx.fillRect(l * LW, 0, LW, H); }
      if (laneFlash[l] < 0) { ctx.fillStyle = 'rgba(255,80,80,' + (-laneFlash[l] * 1.2) + ')'; ctx.fillRect(l * LW, 0, LW, H); }
    }
    // とりで
    ctx.fillStyle = flashE > 0 ? '#fff' : '#b8433a'; ctx.fillRect(0, 0, W, Y_TOP - 14);
    ctx.fillStyle = flashP > 0 ? '#fff' : '#3a6fb8'; ctx.fillRect(0, Y_BOT + 14, W, H - Y_BOT - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '22px system-ui, sans-serif';
    for (let l = 0; l < LANES; l++) {
      ctx.fillText('🏯', laneX(l), (Y_TOP - 14) / 2 + 1);
      ctx.fillText('🏠', laneX(l), Y_BOT + 14 + (H - Y_BOT - 14) / 2 + 1);
    }
    // ユニット(奥から)
    const list = units.slice().sort((a, b) => a.y - b.y);
    for (const u of list) {
      const t = TYPES[u.type], x = laneX(u.lane);
      const warn = u.warn > 0;
      ctx.globalAlpha = warn ? 0.55 + 0.3 * Math.sin(performance.now() / 70) : 1;
      ctx.beginPath(); ctx.arc(x, u.y, t.r + 3, 0, Math.PI * 2);
      ctx.fillStyle = u.side === 'p' ? '#4d8fe8' : '#e8574d'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = (t.r * 1.5) + 'px system-ui, sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText(t.e, x, u.y + 1);
      ctx.globalAlpha = 1;
      if (warn) {
        ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillStyle = '#ffe36b';
        ctx.fillText('!', x + t.r + 12, u.y - 4);
      }
    }
    // エフェクト
    for (const f of fx) {
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = f.col || '#fff';
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    if (state === 'play' && timeLeft <= RUSH && timeLeft > RUSH - 2) {
      ctx.font = 'bold 26px system-ui, sans-serif'; ctx.fillStyle = '#ffe36b';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.strokeText('⚡ラッシュ!エネルギー加速', W / 2, H / 2);
      ctx.fillText('⚡ラッシュ!エネルギー加速', W / 2, H / 2);
    }
  }

  function loop(now) {
    if (state !== 'play') return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (state === 'play') { draw(); requestAnimationFrame(loop); }
  }

  function start() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    reset();
    el.intro.classList.add('hidden');
    el.result.classList.add('hidden');
    state = 'play';
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // ===== 入力 =====
  cv.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const lane = Math.max(0, Math.min(LANES - 1, Math.floor((ev.clientX - r.left) / r.width * LANES)));
    deploy(lane);
  });
  unitBtns.forEach((b, i) => b.addEventListener('click', () => { sel = i; hud(); }));
  document.addEventListener('keydown', ev => {
    if (state !== 'play') return;
    const k = ev.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') { sel = +k - 1; hud(); return; }
    let lane = -1;
    if (k === 'arrowleft' || k === 'a') lane = 0;
    else if (k === 'arrowdown' || k === 'arrowup' || k === 's') lane = 1;
    else if (k === 'arrowright' || k === 'd') lane = 2;
    if (lane >= 0) { ev.preventDefault(); if (!ev.repeat) deploy(lane); }
  });
  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);

  // テスト・デバッグ用の読み取り口
  window.__laneWar = { get state() { return state; }, get units() { return units; }, get hp() { return [pHp, eHp]; }, get en() { return pEn; } };

  reset();
  draw();
})();
