(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DAYS = [
    { t: 40, target: 1200, spawn: 3.6, pat: 15, vip: 0 },
    { t: 45, target: 2000, spawn: 3.0, pat: 13, vip: 0.15 },
    { t: 50, target: 2800, spawn: 2.5, pat: 12, vip: 0.25 }
  ];
  const COOK = 9;          // heat 1.0 で p=1 になる秒数
  const COST = 50;
  const BASE_PRICE = 200;
  const WANTS = [
    { name: 'やわらか', lo: 0.35, hi: 0.60, col: '#f0c85a' },
    { name: 'ほくほく', lo: 0.60, hi: 0.85, col: '#d68a2a' },
    { name: 'こんがり', lo: 0.85, hi: 1.08, col: '#8e4a1c' }
  ];
  const FACES = ['👦', '👧', '👴', '👵', '👨', '👩', '🧑', '🧒'];
  const KEYS_C = ['a', 's', 'd'];
  const METER_MAX = 1.35;
  const COLOR_STOPS = [[0, [236, 222, 160]], [0.45, [242, 202, 92]], [0.72, [214, 140, 44]], [0.96, [140, 72, 28]], [1.2, [45, 28, 20]]];

  const UPGRADES = [
    { id: 'slot', name: '🪨 4つめの石やき穴', desc: 'ほどよい強火(×1.2)の穴がふえる', ok: (s) => s.heats.length < 4, apply: (s) => s.heats.push(1.2) },
    { id: 'price', name: '💰 ねあげ', desc: 'おいもの値段が1.25倍に', ok: () => true, apply: (s) => { s.priceMul *= 1.25; } },
    { id: 'tea', name: '🍵 おちゃサービス', desc: 'お客さんが1.3倍長く待ってくれる', ok: () => true, apply: (s) => { s.patMul *= 1.3; } },
    { id: 'stone', name: '🛡 こげにくい石', desc: 'こんがりの幅が広がり、こげにくくなる', ok: (s) => s.burn < 1.2, apply: (s) => { s.burn = 1.22; } },
    { id: 'rep', name: '⭐ ひょうばん回復', desc: 'ひょうばん⭐を1つ取りもどす', ok: (s) => s.rep < 3, apply: (s) => { s.rep++; } },
    { id: 'fire', name: '🔥 まきを上等に', desc: 'すべての穴の火力が1.15倍に', ok: () => true, apply: (s) => { s.heats = s.heats.map((h) => h * 1.15); } }
  ];

  let S = null;
  let raf = 0, last = 0;
  let actx = null;

  function beep(freq, dur, type, vol) {
    if (!actx) return;
    try {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* noop */ }
  }

  function newState() {
    return { day: 0, rep: 3, total: 0, heats: [0.7, 1.4, 1.0], priceMul: 1, patMul: 1, burn: 1.08, served: 0, perfect: 0 };
  }

  function bandOf(p) {
    if (p < WANTS[0].lo) return -1;           // なま
    if (p >= S.burn) return 3;                // こげ
    if (p < WANTS[1].lo) return 0;
    if (p < WANTS[2].lo) return 1;
    return 2;
  }
  function wantRange(i) { return i === 2 ? [WANTS[2].lo, S.burn] : [WANTS[i].lo, WANTS[i].hi]; }

  function imoColor(p) {
    for (let i = 1; i < COLOR_STOPS.length; i++) {
      if (p <= COLOR_STOPS[i][0]) {
        const [a, ca] = COLOR_STOPS[i - 1], [b, cb] = COLOR_STOPS[i];
        const t = (p - a) / (b - a);
        const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
    return 'rgb(30,20,15)';
  }

  // ---------- 1日のセットアップ ----------
  function startDay() {
    const d = DAYS[S.day];
    S.time = d.t; S.sales = 0; S.spawnT = 0.8; S.sel = -1; S.running = true;
    S.slots = S.heats.map(() => null);       // {p}
    S.custs = [null, null, null];             // {want, pat, max, face, vip, wait}
    buildRows();
    setMsg(`${S.day + 1}日目 開店!目標 ¥${d.target}`);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function buildRows() {
    const cr = $('custRow'); cr.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button');
      b.className = 'cust empty';
      b.innerHTML = `<span class="key">${KEYS_C[i].toUpperCase()}</span><span class="vip"></span><span class="face">　</span><span class="bub"></span><span class="pat"><i></i></span>`;
      b.addEventListener('click', () => tapCust(i));
      cr.appendChild(b);
    }
    const or = $('ovenRow'); or.innerHTML = '';
    or.style.gridTemplateColumns = `repeat(${S.heats.length},1fr)`;
    S.heats.forEach((h, i) => {
      const b = document.createElement('button');
      b.className = 'slot';
      const fires = h >= 1.35 ? '🔥🔥🔥' : h >= 0.95 ? '🔥🔥' : '🔥';
      const meter = WANTS.map((w, k) => {
        const [lo, hi] = wantRange(k);
        return `<b style="width:${(hi - lo) / METER_MAX * 100}%;background:${w.col}"></b>`;
      }).join('');
      const pre = `<b style="width:${WANTS[0].lo / METER_MAX * 100}%;background:#bbb"></b>`;
      const post = `<b style="flex:1;background:#222"></b>`;
      b.innerHTML = `<span class="key" style="position:absolute;left:4px;top:2px">${i + 1}</span><span class="heat">${fires} ×${h.toFixed(1)}</span><span class="imo none"><span class="steam"></span></span><span class="lbl"></span><span class="meter">${pre}${meter}${post}<span class="mk"></span></span>`;
      b.addEventListener('click', () => tapSlot(i));
      or.appendChild(b);
    });
    $('legend').innerHTML = WANTS.map((w) => `<span><span class="chip" style="background:${w.col}"></span> ${w.name}</span>`).join('') + '<span>⚫ こげ</span>';
  }

  // ---------- 操作 ----------
  function tapSlot(i) {
    if (!S || !S.running) return;
    const sl = S.slots[i];
    if (!sl) {
      S.slots[i] = { p: 0 };
      S.sales -= COST;
      if (S.sel === i) S.sel = -1;
      beep(300, 0.08, 'triangle');
      setMsg(`いもを入れた(−¥${COST})`);
      return;
    }
    const b = bandOf(sl.p);
    if (b === -1) { setMsg('まだなまだよ!'); beep(160, 0.1, 'square', 0.04); return; }
    if (b === 3) {
      S.slots[i] = null; if (S.sel === i) S.sel = -1;
      setMsg('こげたおいもをすてた…'); beep(120, 0.2, 'sawtooth', 0.05);
      return;
    }
    S.sel = (S.sel === i) ? -1 : i;
    if (S.sel >= 0) setMsg('どのお客さんに出す?');
  }

  function tapCust(i) {
    if (!S || !S.running) return;
    const c = S.custs[i];
    if (!c) return;
    if (S.sel < 0 || !S.slots[S.sel]) { setMsg('先に焼けたおいもをえらんでね'); return; }
    const p = S.slots[S.sel].p;
    const b = bandOf(p);
    if (b < 0 || b === 3) { setMsg(b === 3 ? 'こげちゃった!' : 'まだなま!'); S.sel = -1; return; }
    S.slots[S.sel] = null; S.sel = -1;
    S.custs[i] = null;
    if (b === c.want) {
      const [lo, hi] = wantRange(b);
      const mid = (lo + hi) / 2, half = (hi - lo) / 2;
      const acc = Math.max(0, 1 - Math.abs(p - mid) / half);
      let tip = Math.round(acc * 100 / 10) * 10;
      let price = Math.round(BASE_PRICE * S.priceMul / 10) * 10;
      if (c.vip) { price *= 2; tip *= 2; }
      const gain = price + tip;
      S.sales += gain; S.served++;
      if (acc >= 0.7) { S.perfect++; setMsg(`ぴったり!${c.vip ? '👑' : ''} +¥${gain}`); beep(880, 0.12); setTimeout(() => beep(1175, 0.15), 90); }
      else { setMsg(`まいど!+¥${gain}`); beep(660, 0.12); }
    } else {
      const gain = 60;
      S.sales += gain;
      setMsg(`「${WANTS[c.want].name}がよかったな…」+¥${gain}`);
      beep(330, 0.15, 'triangle');
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!S || !S.running) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '4') { const i = +k - 1; if (i < S.slots.length) tapSlot(i); }
    const ci = KEYS_C.indexOf(k); if (ci >= 0) tapCust(ci);
    if (k === 'escape') S.sel = -1;
  });

  // ---------- ループ ----------
  function loop(now) {
    if (!S.running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const d = DAYS[S.day];
    S.time -= dt;
    S.slots.forEach((sl, i) => { if (sl) sl.p = Math.min(METER_MAX, sl.p + dt * S.heats[i] / COOK); });
    // 客
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      const free = S.custs.map((c, i) => c ? -1 : i).filter((i) => i >= 0);
      if (free.length) {
        const i = free[Math.floor(Math.random() * free.length)];
        const vip = Math.random() < d.vip;
        const max = d.pat * S.patMul * (vip ? 0.7 : 1);
        S.custs[i] = { want: Math.floor(Math.random() * 3), pat: max, max, face: vip ? '🤴' : FACES[Math.floor(Math.random() * FACES.length)], vip };
        S.spawnT = d.spawn * (0.75 + Math.random() * 0.5);
      } else S.spawnT = 0.5;
    }
    for (let i = 0; i < 3; i++) {
      const c = S.custs[i];
      if (!c) continue;
      c.pat -= dt;
      if (c.pat <= 0) {
        S.custs[i] = null; S.rep--;
        setMsg('お客さんがおこって帰っちゃった…⭐−1');
        beep(150, 0.3, 'sawtooth', 0.06);
        if (S.rep <= 0) { S.total += S.sales; render(); return endGame(false, 'ひょうばんが0になって閉店…'); }
      }
    }
    if (S.time <= 0) { S.time = 0; render(); return endDay(); }
    render();
    raf = requestAnimationFrame(loop);
  }

  function render() {
    const d = DAYS[S.day];
    $('day').textContent = `${S.day + 1}日目 / 3`;
    $('time').textContent = `⏱ ${Math.ceil(S.time)}`;
    $('rep').textContent = '⭐'.repeat(Math.max(0, S.rep)) + '☆'.repeat(Math.max(0, 3 - S.rep));
    $('sales').textContent = `売上 ¥${S.sales}`;
    $('target').textContent = `目標 ¥${d.target}`;
    $('bar').style.width = `${Math.max(0, Math.min(100, S.sales / d.target * 100))}%`;
    const cs = $('custRow').children;
    for (let i = 0; i < 3; i++) {
      const el = cs[i], c = S.custs[i];
      el.classList.toggle('empty', !c);
      el.classList.toggle('target', !!c && S.sel >= 0);
      const face = el.querySelector('.face'), bub = el.querySelector('.bub'), pat = el.querySelector('.pat i'), vip = el.querySelector('.vip');
      if (!c) { face.textContent = '　'; bub.innerHTML = '…'; pat.style.width = '0'; vip.textContent = ''; continue; }
      const r = c.pat / c.max;
      face.textContent = r < 0.3 ? '😠' : c.face;
      bub.innerHTML = `<span class="chip" style="background:${WANTS[c.want].col}"></span>${WANTS[c.want].name}`;
      pat.style.width = `${r * 100}%`;
      pat.style.background = r < 0.3 ? '#e2553a' : r < 0.6 ? '#e2c23a' : '#7bd36a';
      vip.textContent = c.vip ? '👑×2' : '';
    }
    const ss = $('ovenRow').children;
    for (let i = 0; i < S.slots.length; i++) {
      const el = ss[i], sl = S.slots[i];
      const imo = el.querySelector('.imo'), lbl = el.querySelector('.lbl'), mk = el.querySelector('.mk'), st = el.querySelector('.steam');
      el.classList.toggle('sel', S.sel === i);
      if (!sl) { imo.classList.add('none'); imo.style.background = ''; lbl.textContent = 'タップで入れる'; mk.style.display = 'none'; st.textContent = ''; continue; }
      imo.classList.remove('none');
      imo.style.background = imoColor(sl.p);
      const b = bandOf(sl.p);
      lbl.textContent = b === -1 ? 'なま' : b === 3 ? '⚫こげ(すてる)' : WANTS[b].name;
      st.textContent = b === 3 ? '💨' : b >= 0 ? '♨' : '';
      mk.style.display = 'block';
      mk.style.left = `calc(${sl.p / METER_MAX * 100}% - 1px)`;
    }
  }

  function setMsg(t) { $('msg').textContent = t; }

  // ---------- 日の終わり ----------
  function endDay() {
    S.running = false;
    cancelAnimationFrame(raf);
    const d = DAYS[S.day];
    S.total += S.sales;
    if (S.sales < d.target) return endGame(false, `${S.day + 1}日目の売上 ¥${S.sales}(目標 ¥${d.target})に届かなかった…`);
    if (S.day === DAYS.length - 1) return endGame(true, '3日間の営業、大成功!');
    beep(784, 0.15); setTimeout(() => beep(988, 0.2), 120);
    $('upTitle').textContent = `${S.day + 1}日目 しめ!`;
    $('upText').innerHTML = `売上 ¥${S.sales} / 目標 ¥${d.target} クリア!<br>お店のパワーアップを1つえらぼう。`;
    const pool = UPGRADES.filter((u) => u.ok(S));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const ups = $('ups'); ups.innerHTML = '';
    pool.slice(0, 3).forEach((u) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = `${u.name}<small>${u.desc}</small>`;
      b.addEventListener('click', () => {
        u.apply(S);
        $('upOv').classList.add('hidden');
        S.day++;
        startDay();
      });
      ups.appendChild(b);
    });
    $('upOv').classList.remove('hidden');
  }

  function endGame(win, why) {
    S.running = false;
    cancelAnimationFrame(raf);
    $('rTitle').textContent = win ? '🎉 大はんじょう!' : '🍂 閉店…';
    const rank = !win ? '' : S.total >= 9000 ? '<br>ランク:🏆 伝説のやきいも名人' : S.total >= 7500 ? '<br>ランク:🥇 町の人気店' : '<br>ランク:🥈 かけだし店主';
    $('rText').innerHTML = `${why}<br>売ったおいも ${S.served}本(ぴったり ${S.perfect}本)<br>のこったひょうばん ${'⭐'.repeat(Math.max(0, S.rep)) || 'なし'}<br>売上合計 ¥${S.total}${rank}`;
    $('result').classList.remove('hidden');
    beep(win ? 1046 : 220, 0.3, win ? 'sine' : 'triangle');
  }

  function start() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    S = newState();
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    $('upOv').classList.add('hidden');
    startDay();
  }

  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);

  // 初期表示用(説明画面の裏)
  S = newState();
  S.slots = S.heats.map(() => null); S.custs = [null, null, null]; S.sales = 0; S.time = DAYS[0].t; S.sel = -1; S.running = false;
  buildRows(); render();
  S = null;
})();
