(() => {
  'use strict';
  const FLOORS = 6, ROW = 58, LIMIT = 6, DURATION = 90, SPEED = 2.6, DOOR = 0.7, QMAX = 4;
  const KINDS = [
    { e: '🐭', w: 1, p: 26 }, { e: '🐰', w: 1, p: 22 }, { e: '🐶', w: 2, p: 24 },
    { e: '🐻', w: 3, p: 16 }, { e: '🐘', w: 4, p: 12 }
  ];
  const $ = id => document.getElementById(id);
  const el = { time: $('time'), lives: $('lives'), score: $('score'), tbar: $('tbar'), bld: $('bld'),
    wtext: $('wtext'), wbar: $('wbar'), riders: $('riders'), msg: $('msg'),
    intro: $('intro'), result: $('result'), rTitle: $('rTitle'), rText: $('rText') };

  // ---- build DOM ----
  const rows = [], queues = [];
  for (let f = FLOORS - 1; f >= 0; f--) {
    const row = document.createElement('div');
    row.className = 'floor';
    row.innerHTML = '<div class="fl">' + (f + 1) + 'F</div><div class="shaft"></div><div class="queue"></div>';
    row.addEventListener('pointerdown', e => { e.preventDefault(); call(f); });
    el.bld.appendChild(row);
    rows[f] = row; queues[f] = row.querySelector('.queue');
  }
  const car = document.createElement('div');
  car.className = 'car';
  el.bld.appendChild(car);

  // ---- audio ----
  let ac = null;
  function initAudio() {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; }
  }
  function beep(freq, dur, type, vol) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* ignore */ }
  }
  const ding = () => { beep(880, 0.25); setTimeout(() => beep(660, 0.3), 120); };

  // ---- state ----
  let running, pos, target, pending, door, riders, waits, lives, score, delivered, elapsed, spawnT, last, raf, uid, dirty;

  function reset() {
    pos = 0; target = 0; pending = null; door = 0;
    riders = []; waits = []; for (let f = 0; f < FLOORS; f++) waits[f] = [];
    lives = 3; score = 0; delivered = 0; elapsed = 0; spawnT = 0.5; uid = 0; dirty = true;
    el.msg.textContent = '';
  }

  function weight() { return riders.reduce((s, r) => s + r.w, 0); }

  function call(f) {
    if (!running) return;
    initAudio();
    if (door > 0) { pending = f; } else if (pos === f && target === f) { arrive(f); } else { target = f; }
    beep(520, 0.06, 'square', 0.05);
    dirty = true;
  }

  function pickKind() {
    const t = elapsed / DURATION;
    // heavier animals appear more as time goes on
    const ws = [3, 3, 3, 2 + t * 2, 1 + t * 2.5];
    let sum = ws.reduce((a, b) => a + b, 0), r = Math.random() * sum;
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return KINDS[i]; }
    return KINDS[0];
  }

  function spawn() {
    const open = [];
    for (let f = 0; f < FLOORS; f++) if (waits[f].length < QMAX) open.push(f);
    if (!open.length) return;
    // 1F is a busy lobby
    const f = Math.random() < 0.3 && waits[0].length < QMAX ? 0 : open[Math.floor(Math.random() * open.length)];
    let dest;
    if (f !== 0 && Math.random() < 0.4) dest = 0;
    else { do { dest = Math.floor(Math.random() * FLOORS); } while (dest === f); }
    const k = pickKind();
    const hurry = Math.random() < 0.15;
    const pat = k.p * (hurry ? 0.6 : 1) * (1 - 0.25 * elapsed / DURATION);
    waits[f].push({ id: uid++, e: k.e, w: k.w, dest, hurry, pat, max: pat });
    dirty = true;
  }

  function fx(text, f, color) {
    const d = document.createElement('div');
    d.className = 'fx'; d.textContent = text; d.style.color = color || '#2ea65a';
    d.style.left = (120 + Math.random() * 120) + 'px';
    d.style.top = ((FLOORS - 1 - f) * ROW + 10) + 'px';
    el.bld.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  function arrive(f) {
    door = DOOR; ding();
    // unload
    const stay = [];
    let gained = 0;
    riders.forEach(r => {
      if (r.dest === f) {
        const pts = (r.w * 10 + r.bonus) * (r.hurry ? 2 : 1);
        gained += pts; delivered++;
      } else stay.push(r);
    });
    riders = stay;
    if (gained) { score += gained; fx('+' + gained, f); }
    // board strictly in queue order
    const q = waits[f];
    let blocked = false;
    while (q.length) {
      if (weight() + q[0].w > LIMIT) { blocked = true; break; }
      const p = q.shift();
      p.bonus = Math.round(5 * p.pat / p.max);
      riders.push(p);
    }
    if (blocked) { el.msg.textContent = '⚖️ ' + q[0].e + ' がのれない!うしろの子もまってるよ'; beep(180, 0.2, 'sawtooth', 0.06); }
    else el.msg.textContent = '';
    dirty = true;
  }

  function loseLife(f, p) {
    lives--; fx('💢' + p.e, f, '#e0453a'); beep(140, 0.3, 'sawtooth', 0.08);
    el.msg.textContent = p.e + ' がおこって帰っちゃった…';
    if (lives <= 0) end(false);
  }

  function step(dt) {
    elapsed += dt;
    if (elapsed >= DURATION) { end(true); return; }
    // spawning
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = 2.4 - 1.3 * (elapsed / DURATION) + Math.random() * 0.6; }
    // patience
    for (let f = 0; f < FLOORS; f++) {
      const q = waits[f];
      for (let i = q.length - 1; i >= 0; i--) {
        q[i].pat -= dt;
        if (q[i].pat <= 0) { const p = q.splice(i, 1)[0]; dirty = true; loseLife(f, p); if (!running) return; }
      }
    }
    // elevator
    if (door > 0) {
      door -= dt;
      if (door <= 0) { door = 0; dirty = true; if (pending !== null) { target = pending; pending = null; } }
    } else if (pos !== target) {
      const d = target - pos, mv = SPEED * dt;
      if (Math.abs(d) <= mv) { pos = target; arrive(target); }
      else pos += Math.sign(d) * mv;
    }
  }

  function render() {
    const tl = Math.max(0, DURATION - elapsed);
    el.time.textContent = '⏱ ' + Math.ceil(tl);
    el.tbar.style.width = (tl / DURATION * 100) + '%';
    el.lives.textContent = '❤'.repeat(Math.max(0, lives)) + '🖤'.repeat(3 - Math.max(0, lives));
    el.score.textContent = score + '点';
    car.style.top = ((FLOORS - 1 - pos) * ROW + 2) + 'px';
    car.classList.toggle('open', door > 0);
    if (dirty) {
      dirty = false;
      for (let f = 0; f < FLOORS; f++) {
        rows[f].classList.toggle('target', f === (pending !== null ? pending : target) && (pos !== target || pending !== null));
        queues[f].innerHTML = waits[f].map(p =>
          '<div class="p" data-id="' + p.id + '">' + p.e + (p.hurry ? '⚡' : '') +
          '<s>' + p.w + '</s><b>' + (p.dest + 1) + 'F</b><u><i></i></u></div>').join('');
      }
      const w = weight();
      el.wtext.textContent = 'おもさ ' + w + ' / ' + LIMIT;
      el.wbar.style.width = (w / LIMIT * 100) + '%';
      el.wbar.style.background = w >= LIMIT ? '#e0453a' : '#6b5a8a';
      car.classList.toggle('full', w >= LIMIT);
      el.riders.innerHTML = riders.length
        ? riders.map(r => '<span>' + r.e + (r.hurry ? '⚡' : '') + '<b>' + (r.dest + 1) + 'F</b></span>').join('')
        : '<small>からっぽ</small>';
      car.innerHTML = riders.map(r => r.e).join('');
    }
    // patience bars
    for (let f = 0; f < FLOORS; f++) {
      const nodes = queues[f].children;
      waits[f].forEach((p, i) => {
        const n = nodes[i]; if (!n) return;
        const ratio = p.pat / p.max, bar = n.querySelector('i');
        bar.style.width = (ratio * 100) + '%';
        bar.style.background = ratio < 0.3 ? '#e0453a' : ratio < 0.6 ? '#f0b429' : '#3cc46a';
        n.classList.toggle('angry', ratio < 0.25);
      });
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    if (running) render();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    initAudio();
    reset();
    el.intro.classList.add('hidden'); el.result.classList.add('hidden');
    running = true; render();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function end(clear) {
    running = false;
    cancelAnimationFrame(raf);
    render();
    let best = 0;
    try { best = +localStorage.getItem('zoo-elevator-best') || 0; if (score > best) localStorage.setItem('zoo-elevator-best', score); } catch (e) { /* ignore */ }
    const rank = score >= 1500 ? '🏆 伝説のエレベーター係' : score >= 1000 ? '🥇 ベテラン係' : score >= 600 ? '🥈 いちにんまえ' : '🥉 みならい';
    el.rTitle.textContent = clear ? '🎉 おしごと完了!' : '😵 ❤がなくなった…';
    el.rText.innerHTML = 'はこんだ数: <b>' + delivered + '</b>ひき<br>スコア: <b>' + score + '点</b>' +
      (clear ? '<br>' + rank : '') + '<br>ベスト: ' + Math.max(best, score) + '点' +
      (score > best && best > 0 ? '<br>✨ベスト更新!' : '');
    el.result.classList.remove('hidden');
    beep(clear ? 784 : 220, 0.4, 'triangle', 0.12);
  }

  document.addEventListener('keydown', e => {
    if (!running) return;
    if (e.key >= '1' && e.key <= String(FLOORS)) { call(+e.key - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const base = pending !== null ? pending : target;
      const nf = Math.max(0, Math.min(FLOORS - 1, base + (e.key === 'ArrowUp' ? 1 : -1)));
      call(nf); e.preventDefault();
    }
  });
  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  reset(); render();
})();
