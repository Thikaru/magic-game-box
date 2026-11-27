// おもさにちゅうい!どうぶつエレベーター
(() => {
  'use strict';
  const W = 360, H = 560;
  const DAY_TIME = 60;
  const MAX_LIFE = 3;
  const QUEUE_MAX = 5;
  const FLOOR_SEC = 0.42;   // 1階ぶん移動する時間
  const DOOR_SEC = 0.75;    // とびらが開いている時間
  const SHAFT_X = 8, SHAFT_W = 92;
  const QUEUE_X = SHAFT_X + SHAFT_W + 10, SLOT_W = 42;
  const BTN_X = 322;

  const ANIMALS = {
    mouse:    { e: '🐭', w: 1 },
    rabbit:   { e: '🐰', w: 2 },
    cat:      { e: '🐱', w: 2 },
    dog:      { e: '🐶', w: 3 },
    pig:      { e: '🐷', w: 4 },
    elephant: { e: '🐘', w: 6 },
  };
  // 1日ごとの設定
  const DAYS = [
    { floors: 5, cap: 8,  patience: 21, interval: 2.6, pool: { mouse: 3, rabbit: 3, cat: 2, dog: 2 } },
    { floors: 6, cap: 8,  patience: 19, interval: 2.2, pool: { mouse: 3, rabbit: 2, cat: 2, dog: 2, pig: 2 } },
    { floors: 7, cap: 10, patience: 18, interval: 1.9, pool: { mouse: 3, rabbit: 2, cat: 2, dog: 2, pig: 2, elephant: 1.4 } },
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  const startBtn = $('startBtn'), retryBtn = $('retryBtn'), nextBtn = $('nextBtn');
  const hudDay = $('hudDay'), hudTime = $('hudTime'), hudLife = $('hudLife'), hudCoin = $('hudCoin');
  const msgEl = $('msg');

  let state = 'intro'; // intro | play | result
  let dayIdx = 0, cfg = DAYS[0];
  let timeLeft = DAY_TIME, elapsed = 0;
  let life = MAX_LIFE, coins = 0, dayCoins = 0, delivered = 0, dayDelivered = 0, angryCount = 0;
  let spawnTimer = 0;
  let queues = [];  // floor -> [animal]
  let riders = [];
  let elev = { pos: 0, target: null, door: 0 };
  let popups = [];
  let banner = { text: '', t: 0 };
  let buzzT = 0;
  let lastT = 0;
  let msgTimer = 0;
  let nextId = 1;

  // ---------- サウンド ----------
  let actx = null;
  function initAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function beep(freq, dur, type = 'sine', vol = 0.08, delay = 0, slide = 0) {
    if (!actx) return;
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sDing = () => { beep(1046, 0.25, 'sine', 0.08); beep(784, 0.35, 'sine', 0.07, 0.12); };
  const sCoin = (n) => { for (let i = 0; i < Math.min(n, 5); i++) beep(1320 + i * 160, 0.09, 'square', 0.04, i * 0.06); };
  const sBuzz = () => beep(150, 0.35, 'sawtooth', 0.07);
  const sAngry = () => beep(400, 0.4, 'triangle', 0.08, 0, -250);
  const sTap = () => beep(660, 0.05, 'square', 0.03);

  // ---------- ユーティリティ ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const rowH = () => H / cfg.floors;
  const floorTop = (f) => H - (f + 1) * rowH();
  function pickType() {
    const pool = cfg.pool;
    let sum = 0;
    for (const k in pool) sum += pool[k];
    let r = Math.random() * sum;
    for (const k in pool) { r -= pool[k]; if (r <= 0) return k; }
    return 'mouse';
  }
  function riderWeight() { return riders.reduce((s, a) => s + a.w, 0); }
  function showMsg(t, sec = 1.6) { msgEl.textContent = t; msgTimer = sec; }
  function addPopup(x, y, text, color = '#b25a00', size = 16) { popups.push({ x, y, text, color, size, t: 1.1 }); }

  // ---------- 進行 ----------
  function startGame() {
    initAudio();
    dayIdx = 0; coins = 0; delivered = 0; angryCount = 0;
    startDay();
  }
  function startDay() {
    cfg = DAYS[dayIdx];
    timeLeft = DAY_TIME; elapsed = 0;
    life = MAX_LIFE; dayCoins = 0; dayDelivered = 0;
    queues = []; for (let i = 0; i < cfg.floors; i++) queues.push([]);
    riders = []; popups = [];
    elev = { pos: 0, target: null, door: 0 };
    spawnTimer = 0.6;
    banner = { text: `${dayIdx + 1}にちめ スタート!`, t: 1.6 };
    intro.classList.add('hidden'); result.classList.add('hidden');
    state = 'play';
    // 最初のお客さん
    spawn(true); spawn(false);
    updateHud();
  }
  function phaseOf() {
    const p = elapsed / DAY_TIME;
    if (p < 0.33) return 'morning';
    if (p < 0.66) return 'noon';
    return 'evening';
  }
  function spawn(forceLobby) {
    const n = cfg.floors;
    const ph = phaseOf();
    let from, to;
    if (forceLobby || (ph === 'morning' && Math.random() < 0.65)) {
      from = 0; to = randInt(1, n - 1);
    } else if (ph === 'evening' && Math.random() < 0.65) {
      from = randInt(1, n - 1); to = 0;
    } else {
      from = randInt(0, n - 1);
      do { to = randInt(0, n - 1); } while (to === from);
    }
    if (queues[from].length >= QUEUE_MAX) {
      // こんでいる階はさけて、空いている階に
      const opts = [];
      for (let i = 0; i < n; i++) if (queues[i].length < QUEUE_MAX) opts.push(i);
      if (!opts.length) return;
      from = opts[randInt(0, opts.length - 1)];
      if (to === from) to = from === 0 ? randInt(1, n - 1) : 0;
    }
    const type = pickType();
    const a = ANIMALS[type];
    const pat = cfg.patience * rand(0.85, 1.15) + a.w * 0.6;
    queues[from].push({
      id: nextId++, type, e: a.e, w: a.w, from, to,
      vip: Math.random() < 0.12,
      pat, patMax: pat, born: elapsed,
      dx: BTN_X, // 表示用のx(入場アニメ)
    });
  }

  function setTarget(f) {
    if (state !== 'play') return;
    if (f < 0 || f >= cfg.floors) return;
    initAudio();
    sTap();
    if (elev.target === null && Math.abs(elev.pos - f) < 0.001) {
      // いまの階:とびらを開けなおす
      if (elev.door <= 0) arrive(f);
      return;
    }
    elev.target = f;
  }

  function arrive(f) {
    elev.pos = f; elev.target = null; elev.door = DOOR_SEC;
    sDing();
    const carX = SHAFT_X + SHAFT_W / 2, y = floorTop(f) + rowH() / 2;
    // 1) おりる
    const out = riders.filter(r => r.to === f);
    if (out.length) {
      riders = riders.filter(r => r.to !== f);
      let gain = 0;
      out.forEach((r, i) => {
        const ride = elapsed - r.born;
        let c = 6 + r.w * 4;
        if (ride < 9) c = Math.round(c * 1.5); else if (ride > 20) c = Math.round(c * 0.7);
        c += (out.length - 1) * 5; // まとめておろすボーナス
        if (r.vip) c *= 2;
        gain += c;
        addPopup(carX + (i % 3 - 1) * 22, y - 10 - Math.floor(i / 3) * 16, `${r.e}+${c}`, r.vip ? '#d4a000' : '#2d8a3e', 14);
      });
      coins += gain; dayCoins += gain;
      delivered += out.length; dayDelivered += out.length;
      if (out.length >= 2) {
        addPopup(carX + 40, y - 30, `まとめて×${out.length}!`, '#e0457b', 16);
        showMsg(`🎉 まとめて ${out.length}にん おろした! +${gain}🪙`);
      }
      sCoin(out.length);
    }
    // 2) のる(ならび順。先頭がのれなければそこで止まる)
    const q = queues[f];
    let boarded = 0;
    while (q.length) {
      const a = q[0];
      if (riderWeight() + a.w > cfg.cap) {
        buzzT = 0.6;
        sBuzz();
        addPopup(QUEUE_X + 20, y - 26, '⚖️ おもすぎ!', '#d63030', 16);
        if (!boarded) showMsg(`🚨 ${a.e}(おもさ${a.w})がのれない!のこり ${cfg.cap - riderWeight()}`);
        break;
      }
      q.shift();
      riders.push(a);
      boarded++;
    }
    updateHud();
  }

  function update(dt) {
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.textContent = ''; }
    popups.forEach(p => { p.t -= dt; p.y -= 22 * dt; });
    popups = popups.filter(p => p.t > 0);
    if (banner.t > 0) banner.t -= dt;
    if (buzzT > 0) buzzT -= dt;
    if (state !== 'play') return;

    const prevPhase = phaseOf();
    elapsed += dt; timeLeft -= dt;
    const ph = phaseOf();
    if (ph !== prevPhase) {
      banner = { text: ph === 'noon' ? '☀️ おひる' : '🌇 ゆうがたラッシュ!', t: 1.6 };
      if (ph === 'evening') showMsg('🌇 みんな1階へかえりたい!');
    }

    // エレベーター
    if (elev.door > 0) {
      elev.door -= dt;
    } else if (elev.target !== null) {
      const d = elev.target - elev.pos;
      const step = dt / FLOOR_SEC;
      if (Math.abs(d) <= step) arrive(elev.target);
      else elev.pos += Math.sign(d) * step;
    }

    // 出現
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawn(false);
      spawnTimer = cfg.interval * rand(0.7, 1.3) * (ph === 'noon' ? 1.1 : 0.9);
    }

    // まちくたびれ
    for (let f = 0; f < queues.length; f++) {
      const q = queues[f];
      q.forEach((a, i) => {
        a.pat -= dt;
        const tx = QUEUE_X + i * SLOT_W;
        a.dx += (tx - a.dx) * Math.min(1, dt * 8);
      });
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i].pat <= 0) {
          const a = q[i];
          q.splice(i, 1);
          life--; angryCount++;
          sAngry();
          addPopup(a.dx + 18, floorTop(f) + rowH() / 2 - 10, '😡 もういい!', '#d63030', 15);
          showMsg(`😡 ${f + 1}かいの${a.e}が帰っちゃった…`);
        }
      }
    }
    updateHud();

    if (life <= 0) { endDay(false); return; }
    if (timeLeft <= 0) { timeLeft = 0; endDay(true); }
  }

  function rankOf(c) {
    if (c >= 1700) return 'S 🏆 でんせつのエレベーター係';
    if (c >= 1250) return 'A 🥇 ベテランエレベーター係';
    if (c >= 800) return 'B 🥈 いちにんまえ';
    return 'C 🥉 みならい';
  }

  function endDay(survived) {
    state = 'result';
    updateHud();
    const last = dayIdx === DAYS.length - 1;
    const rank = $('resultRank');
    rank.innerHTML = `🚶 とどけた: ${dayDelivered}ひき<br>🪙 この日のコイン: ${dayCoins}<br>🪙 ごうけい: ${coins}`;
    if (!survived) {
      $('resultTitle').textContent = 'ゲームオーバー';
      $('resultBig').textContent = '😡😡😡';
      $('resultText').innerHTML = `${dayIdx + 1}にちめで、お客さんがおこって帰っちゃった…<br>ランク: <b>${rankOf(coins)}</b><br>ヒント: おもいどうぶつが先頭の階は、からっぽにしてからむかえに行こう。`;
      nextBtn.classList.add('hidden'); retryBtn.classList.remove('hidden');
    } else if (!last) {
      $('resultTitle').textContent = `${dayIdx + 1}にちめ おしまい!`;
      $('resultBig').textContent = '🛗✨';
      const nd = DAYS[dayIdx + 1];
      const nw = dayIdx === 0 ? '🐷ブタ(おもさ4)' : '🐘ゾウ(おもさ6)';
      $('resultText').innerHTML = `つぎは <b>${nd.floors}かいだて</b>(のれるおもさ ${nd.cap})。<br>${nw}がやってくるよ!`;
      nextBtn.classList.remove('hidden'); retryBtn.classList.add('hidden');
    } else {
      $('resultTitle').textContent = '3日間 おつかれさま!';
      $('resultBig').textContent = '🏢🎉';
      $('resultText').innerHTML = `ぜんぶで ${delivered}ひき とどけたよ!<br>ランク: <b>${rankOf(coins)}</b>`;
      nextBtn.classList.add('hidden'); retryBtn.classList.remove('hidden');
    }
    result.classList.remove('hidden');
  }

  function updateHud() {
    hudDay.textContent = `${dayIdx + 1}にちめ/3`;
    hudTime.textContent = `⏱ ${Math.ceil(Math.max(0, timeLeft))}`;
    hudLife.textContent = '❤️'.repeat(Math.max(0, life)) + '🤍'.repeat(MAX_LIFE - Math.max(0, life));
    hudCoin.textContent = `🪙 ${coins}`;
  }

  // ---------- 描画 ----------
  function emoji(e, x, y, size) {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const n = cfg.floors, rh = rowH();
    const ph = state === 'play' ? phaseOf() : 'noon';
    // 空の色
    ctx.fillStyle = ph === 'morning' ? '#fff1d6' : ph === 'evening' ? '#ffe0cc' : '#fdf6e8';
    ctx.fillRect(0, 0, W, H);

    const want = new Set(riders.map(r => r.to));
    for (let f = 0; f < n; f++) {
      const y = floorTop(f);
      // 床の帯
      ctx.fillStyle = f % 2 ? 'rgba(240,200,140,.18)' : 'rgba(255,255,255,.35)';
      ctx.fillRect(0, y, W, rh);
      ctx.fillStyle = '#c9a77a';
      ctx.fillRect(SHAFT_X + SHAFT_W, y + rh - 4, W, 4);
      // 階ボタン
      const bx = BTN_X + 17, by = y + rh / 2;
      const isTarget = elev.target === f;
      ctx.beginPath(); ctx.arc(bx, by, 17, 0, Math.PI * 2);
      ctx.fillStyle = isTarget ? '#ffb347' : want.has(f) ? '#fff4c2' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = isTarget ? '#e07000' : want.has(f) ? '#f0b400' : '#cbb79a'; ctx.stroke();
      ctx.fillStyle = '#4a3a2a'; ctx.font = 'bold 15px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${f + 1}F`, bx, by + 1);
      if (want.has(f)) emoji('🔔', bx - 16, by - 14, 12);

      // まっている列
      const q = queues[f];
      q.forEach((a, i) => {
        const ax = a.dx + SLOT_W / 2 - 2;
        const ay = y + rh / 2 + 2;
        const sz = Math.min(30, rh * 0.36);
        const ratio = Math.max(0, a.pat / a.patMax);
        const shake = ratio < 0.25 ? Math.sin(elapsed * 30 + a.id) * 1.5 : 0;
        emoji(a.e, ax + shake, ay, sz);
        if (a.vip) emoji('⭐', ax + 13, ay - sz / 2 + 2, 11);
        // 行き先ふきだし
        const tag = `→${a.to + 1}F`;
        ctx.font = 'bold 11px system-ui,sans-serif';
        rr(ax - 17, ay - sz / 2 - 17, 34, 15, 6);
        ctx.fillStyle = a.to === 0 ? '#dff0ff' : '#ffffff'; ctx.fill();
        ctx.strokeStyle = '#b9a385'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#3a2f22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tag, ax, ay - sz / 2 - 9);
        // おもさ
        ctx.fillStyle = '#7a5a30'; ctx.font = 'bold 10px system-ui,sans-serif';
        ctx.fillText(`⚖${a.w}`, ax - 12, ay + sz / 2 + 1);
        // がまんゲージ
        ctx.fillStyle = '#e6dccd'; ctx.fillRect(ax - 4, ay + sz / 2 - 3, 22, 5);
        ctx.fillStyle = ratio > 0.5 ? '#4cbf5c' : ratio > 0.25 ? '#f2b630' : '#e5484d';
        ctx.fillRect(ax - 4, ay + sz / 2 - 3, 22 * ratio, 5);
      });
      if (q.length) {
        // おもさオーバーの先頭に注意マーク
        const front = q[0];
        if (riderWeight() + front.w > cfg.cap && Math.abs(elev.pos - f) > 0.01) {
          ctx.globalAlpha = 0.85; emoji('⚠️', front.dx + 4, y + 12, 12); ctx.globalAlpha = 1;
        }
      }
    }

    // シャフト
    ctx.fillStyle = '#5b5470';
    ctx.fillRect(SHAFT_X, 0, SHAFT_W, H);
    ctx.fillStyle = '#6c6584';
    for (let f = 0; f < n; f++) ctx.fillRect(SHAFT_X, floorTop(f) + rh - 3, SHAFT_W, 3);
    // ケーブル
    const carY = H - (elev.pos + 1) * rh;
    ctx.strokeStyle = '#2d2838'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(SHAFT_X + SHAFT_W / 2, 0); ctx.lineTo(SHAFT_X + SHAFT_W / 2, carY + 2); ctx.stroke();
    // かご
    const cx = SHAFT_X + 4, cw = SHAFT_W - 8, ch = rh - 6, cy = carY + 2;
    rr(cx, cy, cw, ch, 6);
    ctx.fillStyle = buzzT > 0 && Math.floor(buzzT * 12) % 2 ? '#ffb3b3' : '#fff8ec'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d99a3e'; ctx.stroke();
    // のっている子
    const rsz = Math.min(23, (ch - 30) / 2.9);
    const perRow = 4;
    riders.forEach((r, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      const rx = cx + 11 + col * ((cw - 22) / (perRow - 1));
      const ry = cy + ch - rsz * 0.75 - row * rsz * 0.95;
      emoji(r.e, rx, ry, rsz);
    });
    // おもさメーター
    const wsum = riderWeight();
    const mx = cx + 4, my = cy + 4, mw = cw - 8;
    ctx.fillStyle = '#e8ddcc'; ctx.fillRect(mx, my, mw, 8);
    ctx.fillStyle = wsum >= cfg.cap ? '#e5484d' : wsum >= cfg.cap * 0.7 ? '#f2b630' : '#4cbf5c';
    ctx.fillRect(mx, my, mw * Math.min(1, wsum / cfg.cap), 8);
    ctx.fillStyle = '#4a3a2a'; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`⚖ ${wsum}/${cfg.cap}`, cx + cw / 2, my + 10);
    // とびら
    const open = elev.door > 0 ? Math.min(1, (DOOR_SEC - elev.door) / 0.15, elev.door / 0.15) : 0;
    const dw = (cw / 2) * (1 - open) * 0.92;
    if (dw > 1) {
      ctx.fillStyle = 'rgba(150,160,180,.55)';
      ctx.fillRect(cx + cw - 2 - dw, cy + 24, dw, ch - 26);
    }
    // 行き先表示(かごの上)
    if (elev.target !== null) {
      ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${elev.target > elev.pos ? '▲' : '▼'}${elev.target + 1}F`, cx + cw / 2, cy - 1);
    }

    // ポップアップ
    popups.forEach(p => {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      ctx.font = `bold ${p.size}px system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });

    // バナー
    if (banner.t > 0 && state === 'play') {
      ctx.globalAlpha = Math.min(1, banner.t * 2);
      rr(60, H / 2 - 26, 240, 52, 14);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.strokeStyle = '#f08a24'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#b25a00'; ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.text, W / 2, H / 2 + 1);
      ctx.globalAlpha = 1;
    }
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 入力 ----------
  function floorFromEvent(ev) {
    const r = canvas.getBoundingClientRect();
    const y = (ev.clientY - r.top) * (H / r.height);
    const f = Math.floor((H - y) / rowH());
    return Math.max(0, Math.min(cfg.floors - 1, f));
  }
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (state !== 'play') return;
    setTarget(floorFromEvent(ev));
  });
  window.addEventListener('keydown', (ev) => {
    if (state === 'intro' || state === 'result') {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (state === 'intro') startGame();
        else if (!nextBtn.classList.contains('hidden')) { dayIdx++; startDay(); }
        else startGame();
      }
      return;
    }
    if (/^[1-9]$/.test(ev.key)) { setTarget(Number(ev.key) - 1); ev.preventDefault(); return; }
    const base = elev.target !== null ? elev.target : Math.round(elev.pos);
    if (ev.key === 'ArrowUp' || ev.key === 'w') { setTarget(Math.min(cfg.floors - 1, base + 1)); ev.preventDefault(); }
    else if (ev.key === 'ArrowDown' || ev.key === 's') { setTarget(Math.max(0, base - 1)); ev.preventDefault(); }
  });
  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  nextBtn.addEventListener('click', () => { initAudio(); dayIdx++; startDay(); });

  // 初期表示
  queues = []; for (let i = 0; i < cfg.floors; i++) queues.push([]);
  updateHud();
  requestAnimationFrame(loop);
})();
