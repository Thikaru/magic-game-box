(() => {
  'use strict';
  // ===== 定数 =====
  const JUMPS = 4;
  const K_POINT = 120, HS = 140;
  const INRUN = 50;            // 助走路の長さ(m)
  const INRUN_T = 3.85;        // 助走にかかる時間(秒)
  const CL = 0.006, CD = 0.0018, G = 9.8;
  const W = 480, H = 360;

  // ===== 斜面(着地斜面)の形 =====
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const slope = x => x <= 125 ? 0.12 + 0.58 * ss(0, 55, x) : 0.70 - 0.62 * ss(125, 185, x);
  const STEP = 0.25, N = 1400;
  const GY = [], GS = [];
  { let y = 3, s = 0; for (let i = 0; i <= N; i++) { GY.push(y); GS.push(s); const k = slope(i * STEP); y += k * STEP; s += Math.hypot(1, k) * STEP; } }
  const lerpTab = (T, x) => { const i = Math.min(N - 1, Math.max(0, Math.floor(x / STEP))); const f = x / STEP - i; return T[i] + (T[i + 1] - T[i]) * f; };
  const groundY = x => x < 0 ? 3 + inY(x) * 0.9 : lerpTab(GY, x);
  const groundS = x => x <= 0 ? 0 : lerpTab(GS, x);
  // 距離(斜面にそった長さ)→ x
  const xAtS = s => { let lo = 0, hi = N * STEP; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (groundS(m) < s) lo = m; else hi = m; } return lo; };
  // 助走路:x<0 。踏切(x=0,y=0)に向かって下る
  const inSlope = x => 0.18 + 0.47 * ss(-12, -38, x);
  const inY = x => { let y = 0; const n = 60, d = x / n; for (let i = 0; i < n; i++) y += inSlope(x - d * (i + 0.5)) * d; return y; }; // x<0 → 負(上)

  // ===== DOM =====
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pushBtn = $('push'), info = $('info'), nextBtn = $('nextBtn');

  // ===== 状態 =====
  let st, jumpIdx, results, best = 0, holding = false, last = 0, raf = 0;
  try { best = +localStorage.getItem('skiJumpTelemarkBest') || 0; } catch (e) { best = 0; }

  function newJump() {
    const wind = Math.round((Math.random() * 5.5 - 2.5) * 10) / 10;
    st = {
      phase: 'ready', t: 0, wind,
      x: -INRUN, y: inY(-INRUN), vx: 0, vy: 0, p: 0.6,
      q: -1, qLabel: '', inband: 0, flyT: 0,
      gust: 0, gustT: 0, gustNext: 0.8,
      commit: null, telemark: false, crash: false, dist: 0,
      cam: { x: -INRUN + 20, y: inY(-INRUN) + 10 }, endT: 0, popup: [], tumble: 0,
      slowmo: 1, lateT: 0, prevH: 0, hDown: false
    };
    $('jumpNo').textContent = `${jumpIdx + 1} / ${JUMPS} 本目`;
    $('wind').textContent = windText(wind);
    setInfo('ボタンをおしてスタート!');
    nextBtn.classList.add('hidden');
    pushBtn.classList.remove('hidden');
  }
  const windText = w => w > 0.2 ? `🌬 向かい風 ${w.toFixed(1)}m/s` : w < -0.2 ? `🍃 追い風 ${(-w).toFixed(1)}m/s` : '風 ほぼなし';
  const setInfo = s => { info.textContent = s; };
  const pop = (text, color) => st.popup.push({ text, color, t: 0 });

  function startGame() {
    jumpIdx = 0; results = [];
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    $('total').textContent = '合計 0点';
    newJump();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  // ===== 入力 =====
  function press() {
    if (!st || holding) return;
    holding = true; pushBtn.classList.add('on');
    if (st.phase === 'ready') { st.phase = 'inrun'; st.t = 0; setInfo('みどりのゾーンでおして ふみきり!'); return; }
    if (st.phase === 'inrun') {
      if (st.t < 0.4 || st.q >= 0) return;
      const d = -st.x; // 踏切までの距離
      if (d > 22) return;
      if (st.lateT > 0) { st.q = 0.4; st.qLabel = 'LATE'; }
      else if (d <= 2.5) { st.q = 1; st.qLabel = 'PERFECT!'; }
      else if (d <= 7) { st.q = 1 - (d - 2.5) / 4.5 * 0.4; st.qLabel = 'GOOD'; }
      else { st.q = Math.max(0, 0.6 - (d - 7) / 12 * 0.6); st.qLabel = 'はやい…'; }
      return;
    }
    if (st.phase === 'flight' && !st.commit) {
      const h = groundY(st.x) - st.y;
      if (landZone()) {
        if (h < 3) { st.commit = 'tele'; st.telemark = true; pop('テレマーク!', '#1a8f4a'); }
        else { st.commit = 'early'; pop('はやすぎ!', '#e8483b'); }
      }
    }
  }
  // 着地準備ゾーン:飛んで1秒以上たち、地面へ近づいていて高さ7m未満
  function landZone() { return st.phase === 'flight' && st.flyT > 1 && st.hDown && groundY(st.x) - st.y < 7; }
  function release() { holding = false; pushBtn.classList.remove('on'); }

  pushBtn.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') {
      if (!$('intro').classList.contains('hidden') || !$('result').classList.contains('hidden')) return;
      e.preventDefault();
      if (!nextBtn.classList.contains('hidden')) { if (!e.repeat) goNext(); return; }
      if (!e.repeat) press();
    }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') release(); });
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  nextBtn.addEventListener('click', goNext);

  function goNext() {
    nextBtn.classList.add('hidden');
    jumpIdx++;
    if (jumpIdx >= JUMPS) { showResult(); return; }
    newJump();
  }

  // ===== 更新 =====
  function takeoff() {
    if (st.q < 0) { st.q = 0; st.qLabel = 'ふみきれず…'; }
    pop(st.qLabel, st.q >= 1 ? '#1a8f4a' : st.q >= 0.6 ? '#2f6fb0' : '#e8483b');
    st.phase = 'flight'; st.x = 0; st.y = 0;
    st.vx = 26; st.vy = 2.5 - 4 * st.q; st.p = 0.6; st.flyT = 0;
    setInfo('おす=まえかがみ / はなす=体がおきる。メーターをみどりに!');
  }

  function update(dt) {
    st.t += dt;
    st.popup.forEach(p => p.t += dt); st.popup = st.popup.filter(p => p.t < 1.4);
    if (st.phase === 'inrun') {
      const u = Math.min(1, (st.t / INRUN_T) ** 2);
      st.x = -INRUN + INRUN * u; st.y = inY(st.x);
      if (st.x >= 0) {
        if (st.q < 0) {
          // 少しだけ遅れても受けつける(LATE)
          st.lateT += dt;
          if (st.lateT < 0.12) { st.x = 0; st.y = 0; return; }
        }
        takeoff();
      }
      return;
    }
    if (st.phase === 'flight') {
      st.flyT += dt;
      // 突風
      st.gustNext -= dt;
      if (st.gustNext <= 0) { st.gust = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9); st.gustT = 0.45; st.gustNext = 0.7 + Math.random() * 0.9; }
      let gp = 0; if (st.gustT > 0) { st.gustT -= dt; gp = st.gust; }
      if (!st.commit) {
        st.p += ((holding ? -1.3 : 0.9) + gp) * dt;
        st.p = Math.max(-1, Math.min(1, st.p));
      }
      if (Math.abs(st.p) < 0.25) st.inband += dt;
      const v = Math.hypot(st.vx, st.vy), vr = Math.max(0, v + st.wind);
      let f = Math.max(0, 1 - 1.2 * st.p * st.p);
      if (st.commit) f *= 0.6;
      const lift = CL * vr * vr * f, drag = CD * vr * vr * (1 + 1.5 * Math.max(0, st.p));
      st.vy += (G - lift) * dt;
      st.vx -= drag * st.vx / v * dt; st.vy -= drag * st.vy / v * dt;
      st.x += st.vx * dt; st.y += st.vy * dt;
      const gy = groundY(st.x);
      const hNow = gy - st.y;
      st.hDown = hNow < st.prevH; st.prevH = hNow;
      if (st.y >= gy) {
        st.y = gy; st.dist = Math.round(groundS(st.x) * 2) / 2;
        st.crash = Math.abs(st.p) > 0.85;
        if (st.crash) { st.telemark = false; pop('ころんだ!', '#e8483b'); }
        st.phase = 'landed'; st.endT = 0;
        const k = slope(st.x), sp = Math.hypot(st.vx, st.vy);
        st.vx = sp / Math.hypot(1, k) * 0.8; st.vy = st.vx * k;
        finishJump();
      }
      return;
    }
    if (st.phase === 'landed') {
      st.endT += dt;
      st.vx = Math.max(0, st.vx - (st.crash ? 14 : 7) * dt);
      st.x += st.vx * dt; st.y = groundY(st.x);
      if (st.crash) st.tumble += dt * 10 * Math.min(1, st.vx / 6);
      if (st.endT > 1.6 && nextBtn.classList.contains('hidden') && st.phase === 'landed') {
        nextBtn.textContent = jumpIdx + 1 >= JUMPS ? 'けっかを見る' : 'つぎのジャンプへ';
        nextBtn.classList.remove('hidden');
        pushBtn.classList.add('hidden');
      }
    }
  }

  function finishJump() {
    const distPts = Math.max(0, 60 + (st.dist - K_POINT) * 2);
    const stab = st.flyT > 0 ? Math.round(st.inband / st.flyT * 10) : 0;
    const land = st.crash ? 0 : st.telemark ? 10 : st.commit === 'early' ? 3 : 5;
    const style = st.crash ? 0 : stab + land;
    const total = Math.round((distPts + style) * 10) / 10;
    results.push({ dist: st.dist, distPts, style, total, crash: st.crash, telemark: st.telemark, q: st.qLabel });
    const sum = results.reduce((a, r) => a + r.total, 0);
    $('total').textContent = `合計 ${fmt(sum)}点`;
    const landTxt = st.crash ? '転倒…' : st.telemark ? 'テレマーク◎' : st.commit === 'early' ? 'はやすぎ着地' : 'ふつう着地';
    setInfo(`${st.dist.toFixed(1)}m!  飛距離${fmt(distPts)}点+飛型${style}点(${landTxt})`);
  }
  const fmt = n => (Math.round(n * 10) / 10).toString();

  function showResult() {
    const sum = Math.round(results.reduce((a, r) => a + r.total, 0) * 10) / 10;
    const longest = Math.max(...results.map(r => r.dist));
    const medal = sum >= 340 ? '🥇 金メダル!' : sum >= 260 ? '🥈 銀メダル!' : sum >= 180 ? '🥉 銅メダル!' : '🎌 入賞ならず…';
    let isBest = false;
    if (sum > best) { best = sum; isBest = true; try { localStorage.setItem('skiJumpTelemarkBest', String(best)); } catch (e) { /* 保存できなくても続行 */ } }
    $('rTitle').textContent = medal;
    $('rTable').innerHTML = '<table><tr><th>本</th><th>飛距離</th><th>着地</th><th>点</th></tr>' +
      results.map((r, i) => `<tr><td>${i + 1}</td><td>${r.dist.toFixed(1)}m</td><td>${r.crash ? '💥' : r.telemark ? '✨' : '・'}</td><td>${fmt(r.total)}</td></tr>`).join('') + '</table>';
    $('rText').innerHTML = `合計 <b>${fmt(sum)}点</b> / 最長 ${longest.toFixed(1)}m<br>${isBest ? '🎉 自己ベスト更新!' : `自己ベスト ${fmt(best)}点`}<br>🥇340 / 🥈260 / 🥉180 点`;
    $('result').classList.remove('hidden');
    pushBtn.classList.remove('hidden');
    st.phase = 'over';
  }

  // ===== 描画 =====
  const S = 5; // px / m
  const sx = x => (x - st.cam.x) * S + W / 2;
  const sy = y => (y - st.cam.y) * S + H / 2;

  function draw() {
    // カメラ
    const tx = st.x + (st.phase === 'flight' ? 18 : 10), ty = st.y + (st.phase === 'flight' ? 6 : 4);
    st.cam.x += (tx - st.cam.x) * 0.15; st.cam.y += (ty - st.cam.y) * 0.12;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6fb2e8'); sky.addColorStop(1, '#d6ecfb');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // 遠くの山(パララックス)
    ctx.fillStyle = '#b9d6ee';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i <= 12; i++) {
      const px = i * 48 - ((st.cam.x * 1.2) % 48 + 48) % 48;
      const wx = Math.floor((st.cam.x * 1.2 + i * 48) / 48);
      ctx.lineTo(px, 150 - (st.cam.y * 0.6) % 40 + ((wx * 37) % 5) * 12);
    }
    ctx.lineTo(W, H); ctx.fill();

    // 木(斜面の奥)
    for (let x = Math.floor((st.cam.x - 60) / 9) * 9; x < st.cam.x + 60; x += 9) {
      if (x < -INRUN - 10) continue;
      const gx = sx(x + 3), gy = sy(groundY(x) - 1);
      ctx.fillStyle = '#2e6b4a';
      ctx.beginPath(); ctx.moveTo(gx, gy - 26); ctx.lineTo(gx - 8, gy); ctx.lineTo(gx + 8, gy); ctx.fill();
    }

    // 着地斜面
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const x0 = st.cam.x - W / 2 / S - 5, x1 = st.cam.x + W / 2 / S + 5;
    ctx.moveTo(sx(x0), H + 5);
    for (let x = x0; x <= x1; x += 1) ctx.lineTo(sx(x), sy(groundY(x)));
    ctx.lineTo(sx(x1), H + 5); ctx.fill();
    ctx.strokeStyle = '#8fb7d6'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = Math.max(0, x0); x <= x1; x += 1) { const X = sx(x), Y = sy(groundY(x)); x === Math.max(0, x0) ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke();

    // 距離マーカー
    ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    for (let m = 50; m <= 190; m += 10) {
      const x = xAtS(m); if (x < x0 || x > x1) continue;
      const X = sx(x), Y = sy(groundY(x));
      const col = m === K_POINT ? '#e8483b' : m === HS ? '#1a8f4a' : '#5b7f9c';
      ctx.strokeStyle = col; ctx.lineWidth = m === K_POINT || m === HS ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(X - 6, Y - 4); ctx.lineTo(X + 6, Y + 4); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(m === K_POINT ? 'K120' : m === HS ? 'HS140' : m, X, Y + 18);
    }
    // 自己ベスト(このゲームでの最長)ライン
    if (results && results.length) {
      const bestD = Math.max(...results.map(r => r.dist));
      const x = xAtS(bestD);
      if (x > x0 && x < x1) { ctx.fillStyle = '#e0a800'; const X = sx(x), Y = sy(groundY(x)); ctx.fillRect(X - 2, Y - 22, 4, 22); ctx.fillText('★', X, Y - 25); }
    }

    // 助走路(ジャンプ台)
    const ix0 = Math.max(-INRUN - 5, x0);
    if (ix0 < 0) {
      ctx.fillStyle = '#7a8796';
      ctx.beginPath(); ctx.moveTo(sx(ix0), sy(inY(ix0)));
      for (let x = ix0; x <= 0; x += 1) ctx.lineTo(sx(x), sy(inY(x)));
      ctx.lineTo(sx(0), sy(0)); ctx.lineTo(sx(0), sy(2)); ctx.lineTo(sx(ix0), sy(inY(ix0) + 3)); ctx.fill();
      // 踏切ゾーン
      const zone = (a, b, c) => { ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx(a), sy(inY(a)) - 2); ctx.lineTo(sx(b), sy(inY(b)) - 2); ctx.stroke(); };
      zone(-7, -2.5, '#ffd24a'); zone(-2.5, 0, '#21c065');
      ctx.strokeStyle = '#dfe7ef'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let x = ix0; x <= 0; x += 1) { x === ix0 ? ctx.moveTo(sx(x), sy(inY(x))) : ctx.lineTo(sx(x), sy(inY(x))); } ctx.stroke();
    }

    // 着地の目安
    if (st.phase === 'flight' && !st.commit) {
      const h = groundY(st.x) - st.y;
      if (landZone()) {
        ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
        ctx.fillStyle = h < 3 ? '#1a8f4a' : '#e08a00';
        ctx.fillText(h < 3 ? 'いま!' : 'まだ…', sx(st.x), sy(st.y) - 36);
      }
    }

    drawSkier();
    drawMeter();
    drawWind();

    // 飛距離表示
    if (st.phase === 'flight' || st.phase === 'landed') {
      const d = st.phase === 'landed' ? st.dist : groundS(Math.max(0, st.x));
      ctx.fillStyle = 'rgba(22,50,79,.8)'; ctx.fillRect(W / 2 - 52, 8, 104, 30);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`${d.toFixed(1)}m`, W / 2, 30);
    }
    if (st.phase === 'ready') {
      ctx.fillStyle = 'rgba(22,50,79,.75)'; ctx.fillRect(W / 2 - 120, H / 2 - 60, 240, 44);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('おして スタート!', W / 2, H / 2 - 32);
    }
    // ポップアップ
    st.popup.forEach((p, i) => {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.4);
      ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, W / 2, 90 + i * 30 - p.t * 20);
      ctx.fillStyle = p.color; ctx.fillText(p.text, W / 2, 90 + i * 30 - p.t * 20);
      ctx.globalAlpha = 1;
    });
    if (st.slowmo < 1) { ctx.fillStyle = 'rgba(33,192,101,.12)'; ctx.fillRect(0, 0, W, H); }
  }

  function drawSkier() {
    const X = sx(st.x), Y = sy(st.y);
    let base, bodyRel;
    if (st.phase === 'inrun' || st.phase === 'ready') {
      base = Math.atan(st.x < 0 ? inSlope(st.x) : 0.18); bodyRel = -0.25; // しゃがみ
    } else if (st.phase === 'flight') {
      base = Math.atan2(st.vy, st.vx) * 0.6;
      bodyRel = -(0.15 + (st.p + 1) * 0.55); // p=-1 ほぼ水平, p=1 起きすぎ
      if (st.commit) bodyRel = -1.1;
    } else {
      base = Math.atan(slope(st.x)); bodyRel = st.crash ? 0 : -1.2;
    }
    ctx.save(); ctx.translate(X, Y);
    if (st.crash && st.phase === 'landed') ctx.rotate(st.tumble);
    ctx.rotate(base);
    // スキー板(V字)
    ctx.strokeStyle = '#e8483b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const spread = st.phase === 'flight' ? 0.22 : 0;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(18, -18 * Math.sin(spread)); ctx.stroke();
    ctx.strokeStyle = '#c23328';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(18, 18 * Math.sin(spread) * 0.3); ctx.stroke();
    // 体
    ctx.rotate(bodyRel);
    ctx.strokeStyle = '#1f3f8f'; ctx.lineWidth = 6;
    if (st.phase === 'inrun' || st.phase === 'ready') {
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(6, -8); ctx.lineTo(14, -10); ctx.stroke();
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(18, -10, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (st.telemark && st.phase === 'landed') {
      ctx.rotate(-bodyRel - 1.57);
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, 9); ctx.lineTo(6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 22); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(10, 18); ctx.stroke();
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(0, 26, 4.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(22, -1); ctx.stroke();
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(26, -1, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawMeter() {
    if (st.phase !== 'flight') return;
    const x = W - 30, y = 60, h = 200;
    ctx.fillStyle = 'rgba(22,50,79,.6)'; ctx.fillRect(x - 4, y - 4, 26, h + 8);
    ctx.fillStyle = '#e8483b'; ctx.fillRect(x, y, 18, h);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(x, y + h * 0.1, 18, h * 0.8);
    ctx.fillStyle = '#21c065'; ctx.fillRect(x, y + h * (0.5 - 0.125), 18, h * 0.25);
    const py = y + h * (0.5 - st.p / 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, py - 3, 30, 6);
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('おき', x + 9, y - 8); ctx.fillText('まえ', x + 9, y + h + 16);
    if (st.gustT > 0) {
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(st.gust > 0 ? '突風↑' : '突風↓', x - 10, py + 5);
    }
  }

  function drawWind() {
    // 風見(左上)
    const x = 16, y = 16;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(x - 6, y - 6, 112, 34);
    ctx.fillStyle = '#16324f'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left';
    const w = st.wind;
    ctx.fillText(w > 0.2 ? '向かい風' : w < -0.2 ? '追い風' : '無風', x, y + 8);
    ctx.fillText(`${Math.abs(w).toFixed(1)}m/s`, x, y + 22);
    const dir = w > 0 ? -1 : 1, len = 8 + Math.abs(w) * 6;
    ctx.strokeStyle = w > 0.2 ? '#1a8f4a' : w < -0.2 ? '#e8483b' : '#888'; ctx.lineWidth = 3;
    const cx = x + 80, cy = y + 10;
    ctx.beginPath(); ctx.moveTo(cx - dir * len / 2, cy); ctx.lineTo(cx + dir * len / 2, cy);
    ctx.lineTo(cx + dir * len / 2 - dir * 6, cy - 5); ctx.moveTo(cx + dir * len / 2, cy); ctx.lineTo(cx + dir * len / 2 - dir * 6, cy + 5); ctx.stroke();
  }

  // ===== ループ =====
  function loop(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.phase !== 'over') {
      // ふみきり直前はスローモーション
      st.slowmo = (st.phase === 'inrun' && st.x > -12 && st.q < 0) ? 0.45 : 1;
      const sdt = dt * st.slowmo;
      const sub = 4;
      for (let i = 0; i < sub; i++) update(sdt / sub);
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  // 初期描画(説明画面の背景用)
  jumpIdx = 0; results = []; newJump(); draw();
})();
