(() => {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const PITCHES = [
    { name: 'ストレート', icon: '🔵', T: 1.0, ease: p => p },
    { name: 'チェンジアップ', icon: '🟡', T: 1.6, ease: p => p },
    { name: 'カーブ', icon: '🔴', T: 1.5, ease: p => p * p },
    { name: '魔球', icon: '👻', T: 1.2, ease: p => p, vanish: 0.4 }
  ];
  const Y0 = 90, Y1 = 380, PLATE_X = W / 2;
  let st, raf, last;
  let ac = null;

  function beep(f, d, type) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + d);
    } catch (e) {}
  }

  function reset() {
    st = { score: 0, strikes: 0, outs: 0, combo: 0, n: 0, hr: 0, hits: 0,
      phase: 'ready', t: 0, pitch: null, sway: 0, msg: '', msgT: 0, msgColor: '#fff',
      swingT: 99, cool: 0, ballFly: null, over: false };
    nextPitch();
    hud();
  }

  function nextPitch() {
    const lv = st.n;
    const pool = [0];
    if (lv >= 2) pool.push(1, 2);
    if (lv >= 4) pool.push(2, 3, 3);
    if (lv >= 8) pool.push(3, 3);
    const p = PITCHES[pool[Math.floor(Math.random() * pool.length)]];
    const speed = Math.max(0.62, Math.pow(0.97, lv));
    st.pitch = { ...p, Tr: p.T * speed, sway: (Math.random() < 0.5 ? -1 : 1) * (p.name === 'カーブ' ? 70 : 12) };
    st.phase = 'ready'; st.t = 0; st.swingT = 99; st.ballFly = null;
  }

  function hud() {
    $('score').textContent = st.score + '点';
    $('strikes').textContent = 'ストライク ' + '●'.repeat(st.strikes) + '○'.repeat(2 - st.strikes);
    $('outs').textContent = 'アウト ' + '●'.repeat(st.outs) + '○'.repeat(3 - st.outs);
  }

  function say(m, c) { st.msg = m; st.msgT = 1.0; st.msgColor = c || '#fff'; }

  function strike(label) {
    st.combo = 0;
    st.strikes++;
    if (st.strikes >= 3) {
      st.strikes = 0; st.outs++;
      say(label + ' バッターアウト!', '#ff8a8a');
      beep(120, 0.4, 'sawtooth');
    } else {
      say(label, '#ffb347');
      beep(200, 0.2, 'triangle');
    }
    if (st.outs >= 3) st.over = true;
  }

  function resolve(err) {
    // err: 秒。マイナスは早い、プラスは遅い
    const a = Math.abs(err);
    const dir = err < 0 ? 'はやい' : 'おそい';
    if (a <= 0.06) {
      st.combo++; st.hr++; st.hits++;
      const pts = Math.round(3 * (1 + Math.min(st.combo - 1, 5) * 0.3));
      st.score += pts;
      say('ホームラン! +' + pts, '#ffd23f');
      st.ballFly = { x: PLATE_X, y: Y1, vx: err * 400, vy: -520, t: 0 };
      beep(880, 0.25); beep(1320, 0.3, 'triangle');
    } else if (a <= 0.12) {
      st.combo++; st.hits++;
      const pts = Math.round(1 * (1 + Math.min(st.combo - 1, 5) * 0.3));
      st.score += pts;
      say('ヒット! +' + pts, '#7dffb0');
      st.ballFly = { x: PLATE_X, y: Y1, vx: err * 700, vy: -300, t: 0 };
      beep(660, 0.15);
    } else if (a <= 0.2) {
      st.combo = 0;
      if (st.strikes < 2) { st.strikes++; }
      say('ファウル(' + dir + ')', '#ffb347');
      st.ballFly = { x: PLATE_X, y: Y1, vx: err * 1400, vy: -200, t: 0 };
      beep(300, 0.15, 'triangle');
    } else {
      strike('空ぶり(' + dir + ')');
    }
    st.phase = 'result'; st.t = 0;
    st.n++;
    hud();
  }

  function swing() {
    if (!st || st.over || st.cool > 0) return;
    if (st.phase === 'pitch') {
      st.swingT = 0.25; st.cool = 0.45;
      resolve(st.t - st.pitch.Tr);
    } else if (st.phase === 'ready') {
      st.swingT = 0.25; st.cool = 0.45;
      beep(150, 0.1, 'triangle');
    }
  }

  function ballPos(p) {
    const e = st.pitch.ease(Math.min(p, 1.3));
    const y = Y0 + (Y1 - Y0) * e;
    const x = PLATE_X + st.pitch.sway * Math.sin(Math.min(e, 1) * Math.PI) * (1 - 0) ;
    const r = 5 + 13 * e;
    return { x, y, r, e };
  }

  function update(dt) {
    if (st.cool > 0) st.cool -= dt;
    if (st.swingT < 99) st.swingT -= dt;
    if (st.msgT > 0) st.msgT -= dt;
    st.t += dt;
    if (st.phase === 'ready' && st.t >= 0.9) {
      st.phase = 'pitch'; st.t = 0;
    } else if (st.phase === 'pitch') {
      if (st.t > st.pitch.Tr + 0.2) {
        strike('見のがし');
        st.phase = 'result'; st.t = 0; st.n++;
        hud();
      }
    } else if (st.phase === 'result') {
      if (st.ballFly) {
        const f = st.ballFly;
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 500 * dt;
      }
      if (st.t >= 0.9) {
        if (st.over) { end(); return; }
        nextPitch();
      }
    }
  }

  function draw() {
    // field
    ctx.fillStyle = '#2f7a43'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9a36a';
    ctx.beginPath(); ctx.ellipse(W / 2, Y1 + 10, 120, 46, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W / 2, Y0 + 10, 30, 12, 0, 0, 7); ctx.fill();
    // lane
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 14, Y0); ctx.lineTo(W / 2 - 60, Y1 + 20);
    ctx.moveTo(W / 2 + 14, Y0); ctx.lineTo(W / 2 + 60, Y1 + 20); ctx.stroke();
    // plate
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(W / 2 - 22, Y1 + 28); ctx.lineTo(W / 2 + 22, Y1 + 28);
    ctx.lineTo(W / 2 + 22, Y1 + 38); ctx.lineTo(W / 2, Y1 + 50); ctx.lineTo(W / 2 - 22, Y1 + 38); ctx.fill();
    // hit marker
    ctx.strokeStyle = 'rgba(255,210,63,.7)'; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.ellipse(PLATE_X, Y1, 30, 14, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // pitcher
    ctx.font = '38px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧑‍🦱', W / 2, Y0 - 26);
    // batter
    const swinging = st.swingT > 0 && st.swingT < 99;
    ctx.save(); ctx.translate(PLATE_X - 56, Y1 + 18);
    ctx.font = '40px serif'; ctx.fillText('🧍', 0, 0);
    ctx.rotate(swinging ? 0.9 : -0.6);
    ctx.font = '34px serif'; ctx.fillText('🏏', 22, -18);
    ctx.restore();
    // pitch label
    if (st.phase === 'ready' || (st.phase === 'pitch' && st.t < 0.5)) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(W / 2 - 100, 8, 200, 34);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.fillText(st.pitch.icon + ' ' + st.pitch.name, W / 2, 26);
    }
    // ball
    if (st.phase === 'ready') {
      ball(W / 2, Y0 + 2, 5, 1);
    } else if (st.phase === 'pitch') {
      const p = ballPos(st.t / st.pitch.Tr);
      const vis = !(st.pitch.vanish && p.e > st.pitch.vanish);
      if (vis) ball(p.x, p.y, p.r, 1);
      else if (Math.floor(st.t * 16) % 2 === 0) ball(p.x, p.y, p.r, 0.08);
    } else if (st.ballFly) {
      const f = st.ballFly; ball(f.x, f.y, 10, Math.max(0, 1 - st.t * 0.8));
    }
    // message
    if (st.msgT > 0) {
      ctx.globalAlpha = Math.min(1, st.msgT * 2);
      ctx.fillStyle = st.msgColor; ctx.font = 'bold 26px system-ui,sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
      ctx.strokeText(st.msg, W / 2, 230); ctx.fillText(st.msg, W / 2, 230);
      ctx.globalAlpha = 1;
    }
    if (st.combo >= 2) {
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(st.combo + ' れんぞく!', 10, H - 14); ctx.textAlign = 'center';
    }
  }

  function ball(x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d33'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 0.7, -0.8, 0.8); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    if (st.phase === 'done') return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function end() {
    cancelAnimationFrame(raf); raf = null;
    st.phase = 'done';
    draw();
    $('result').innerHTML = 'スコア: <b>' + st.score + '点</b><br>ホームラン ' + st.hr + '本 / ヒット ' + st.hits + '本';
    $('over').classList.remove('hidden');
  }

  function begin() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    $('intro').classList.add('hidden');
    $('over').classList.add('hidden');
    reset();
    last = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  $('start').addEventListener('click', begin);
  $('retry').addEventListener('click', begin);
  $('swing').addEventListener('pointerdown', e => { e.preventDefault(); swing(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); swing(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if ($('intro').classList.contains('hidden') && $('over').classList.contains('hidden')) {
        e.preventDefault(); swing();
      }
    }
  });
  reset(); draw();
})();
