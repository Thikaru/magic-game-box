(() => {
  const $ = id => document.getElementById(id);
  const ITEMS = [
    { e: '🕰️', n: '時計' }, { e: '📚', n: '本' }, { e: '🪴', n: '植木鉢' },
    { e: '🖼️', n: '絵画' }, { e: '🧸', n: 'ぬいぐるみ' }, { e: '🔔', n: 'ベル' }
  ];
  const LOOP_T = 9, MAX_LOOP = 5, STEPS = 5, PENALTY = 2, PAUSE = 0.9;
  let st, raf, last, msgTimer;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function reset() {
    st = {
      chain: shuffle([0, 1, 2, 3, 4, 5]).slice(0, STEPS),
      known: 0, p: 0, loop: 1, t: LOOP_T, pause: 0, wrong: new Set(),
      layout: shuffle([0, 1, 2, 3, 4, 5]), over: false
    };
    build();
    hud();
    say('');
  }

  function build() {
    const room = $('room');
    room.innerHTML = '';
    st.layout.forEach((id, pos) => {
      const b = document.createElement('button');
      b.className = 'obj';
      b.dataset.id = id;
      b.innerHTML = ITEMS[id].e + '<small>' + (pos + 1) + '</small>';
      b.setAttribute('aria-label', ITEMS[id].n);
      b.addEventListener('click', () => tap(id));
      room.appendChild(b);
    });
    const slots = $('slots');
    slots.innerHTML = '';
    for (let i = 0; i < STEPS; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.textContent = (i + 1);
      slots.appendChild(s);
    }
    paint();
  }

  function paint() {
    document.querySelectorAll('.obj').forEach(b => {
      b.classList.toggle('bad', st.wrong.has(+b.dataset.id));
    });
    document.querySelectorAll('.slot').forEach((s, i) => {
      s.className = 'slot' + (i < st.known ? ' known' : '') + (i < st.p ? ' done' : '');
      s.textContent = i < st.known ? ITEMS[st.chain[i]].e : (i + 1);
    });
  }

  function hud() {
    $('loop').textContent = 'ループ ' + st.loop + '/' + MAX_LOOP;
    $('time').textContent = Math.max(0, st.t).toFixed(1) + 's';
    const r = Math.max(0, st.t) / LOOP_T;
    const f = $('fill');
    f.style.width = (r * 100) + '%';
    f.style.background = r < 0.3 ? '#ff6b4a' : '#7dffb0';
  }

  function say(m) {
    $('msg').textContent = m;
    clearTimeout(msgTimer);
    if (m) msgTimer = setTimeout(() => { if (!st.over) $('msg').textContent = ''; }, 1200);
  }

  function tap(id) {
    if (!st || st.over || st.pause > 0 || st.wrong.has(id)) return;
    if (id === st.chain[st.p]) {
      st.p++;
      st.wrong.clear();
      if (st.p > st.known) { st.known = st.p; say('💡 ひらめき!ノートに記録'); }
      else say('✔ OK');
      paint();
      if (st.p >= STEPS) finish(true);
    } else {
      st.wrong.add(id);
      st.t -= PENALTY;
      say('✖ ここじゃない… -' + PENALTY + '秒');
      paint();
      hud();
      if (st.t <= 0) endLoop();
    }
  }

  function endLoop() {
    if (st.loop >= MAX_LOOP) { finish(false); return; }
    st.loop++;
    st.t = LOOP_T;
    st.p = 0;
    st.wrong.clear();
    st.layout = shuffle(st.layout.slice());
    st.pause = PAUSE;
    build();
    say('⏪ ループ!道具の位置がかわった');
    hud();
  }

  function finish(win) {
    st.over = true;
    cancelAnimationFrame(raf);
    const loops = st.loop;
    let text;
    if (win) {
      const stars = loops <= 3 ? '⭐⭐⭐' : loops === 4 ? '⭐⭐' : '⭐';
      text = loops + 'ループ目、残り ' + Math.max(0, st.t).toFixed(1) + '秒で脱出!<br>' + stars +
        '<br>正解の順番:' + st.chain.map(i => ITEMS[i].e).join(' → ');
    } else {
      const k = st.known;
      text = 'ループから抜け出せなかった…<br>わかった手順:' + k + '/' + STEPS +
        '<br>正解の順番:' + st.chain.map(i => ITEMS[i].e).join(' → ');
    }
    $('otitle').textContent = win ? '🎉 脱出せいこう!' : '⏳ ループ地獄…';
    $('result').innerHTML = text;
    setTimeout(() => $('over').classList.remove('hidden'), win ? 350 : 0);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!st.over) {
      if (st.pause > 0) st.pause -= dt;
      else {
        st.t -= dt;
        if (st.t <= 0) { st.t = 0; hud(); endLoop(); }
      }
      if (!st.over) hud();
      raf = requestAnimationFrame(frame);
    }
  }

  function begin() {
    $('intro').classList.add('hidden');
    $('over').classList.add('hidden');
    reset();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  $('start').addEventListener('click', begin);
  $('retry').addEventListener('click', begin);
  document.addEventListener('keydown', e => {
    if (!st || st.over) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) tap(st.layout[n - 1]);
  });
})();
