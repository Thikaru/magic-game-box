(() => {
  'use strict';
  const HOLES = [{ D: 12, par: 3 }, { D: 18, par: 3 }, { D: 24, par: 4 }, { D: 30, par: 4 }, { D: 36, par: 5 }];
  const POOL = [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10];
  const MAX_STROKES = 8;
  const $ = id => document.getElementById(id);
  const el = { hole: $('hole'), par: $('par'), strokes: $('strokes'), total: $('total'), course: $('course'),
    ball: $('ball'), ghost: $('ghost'), info: $('info'), hand: $('hand'), shot: $('shotBtn'), swap: $('swapBtn'),
    intro: $('intro'), result: $('result'), rTitle: $('rTitle'), rText: $('rText'), next: $('nextBtn') };
  let hi = 0, d = 0, strokes = 0, diffTotal = 0, hand = [], sel = -1, sandNext = false, busy = true,
    water = new Set(), sand = new Set(), bands = [], gameOver = false;

  const draw = () => POOL[Math.floor(Math.random() * POOL.length)];
  const pct = dist => ((HOLES[hi].D - dist) / HOLES[hi].D) * 100;

  function genHazards() {
    const D = HOLES[hi].D;
    water = new Set(); sand = new Set(); bands = [];
    const used = new Set();
    const nW = hi < 2 ? 1 : 2, nS = 2;
    const place = (type, w) => {
      for (let t = 0; t < 40; t++) {
        const a = 3 + Math.floor(Math.random() * (D - 3 - w - 1));
        let ok = true;
        for (let k = a - 1; k <= a + w; k++) if (used.has(k)) ok = false;
        if (a + w - 1 >= D - 1 || !ok) continue;
        for (let k = a; k < a + w; k++) { used.add(k); (type === 'w' ? water : sand).add(k); }
        bands.push({ type, a, w });
        return;
      }
    };
    for (let i = 0; i < nW; i++) place('w', 2);
    for (let i = 0; i < nS; i++) place('s', 3);
  }

  function buildCourse() {
    el.course.querySelectorAll('.band').forEach(n => n.remove());
    const D = HOLES[hi].D;
    bands.forEach(b => {
      const n = document.createElement('div');
      n.className = 'band ' + b.type;
      n.style.left = pct(b.a + b.w - 1 + 0.5) + '%';
      n.style.width = (b.w / D) * 100 + '%';
      n.textContent = b.type === 'w' ? '🌊' : '🏖';
      el.course.appendChild(n);
    });
  }

  function effective(c) { return sandNext ? Math.max(1, Math.floor(c / 2)) : c; }

  function renderHand() {
    el.hand.innerHTML = '';
    hand.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card' + (i === sel ? ' sel' : '') + (sandNext ? ' half' : '');
      b.innerHTML = effective(c) + '<small>' + (sandNext ? '半分' : 'キー' + (i + 1)) + '</small>';
      b.addEventListener('click', () => pick(i));
      el.hand.appendChild(b);
    });
    el.shot.disabled = busy || sel < 0;
    el.swap.disabled = busy || sel < 0;
  }

  function renderHud() {
    const h = HOLES[hi];
    el.hole.textContent = (hi + 1) + '番ホール';
    el.par.textContent = 'PAR ' + h.par;
    el.strokes.textContent = '打数 ' + strokes;
    el.total.textContent = '計 ' + (diffTotal > 0 ? '+' : '') + diffTotal;
    el.ball.style.left = pct(d) + '%';
  }

  function preview() {
    if (sel < 0) { el.ghost.classList.add('hidden'); return; }
    const nd = Math.abs(d - effective(hand[sel]));
    el.ghost.classList.remove('hidden');
    el.ghost.style.left = pct(nd) + '%';
    let t = 'のこり ' + d + ' → ' + nd;
    if (nd === 0) t += ' カップイン!';
    else if (water.has(nd)) t += ' 🌊みず注意!';
    else if (sand.has(nd)) t += ' 🏖すな';
    if (effective(hand[sel]) > d) t += '(行きすぎ)';
    el.info.textContent = t;
  }

  function pick(i) {
    if (busy) return;
    if (sel === i) { shoot(); return; }
    sel = i; renderHand(); preview();
  }

  function startHole() {
    d = HOLES[hi].D; strokes = 0; sandNext = false; sel = -1;
    hand = [draw(), draw(), draw(), draw()];
    genHazards(); buildCourse();
    el.ball.style.transition = 'none'; renderHud(); void el.ball.offsetWidth; el.ball.style.transition = '';
    el.ghost.classList.add('hidden');
    el.info.textContent = 'カードをえらんでね。のこり ' + d;
    busy = false; renderHand();
  }

  function shoot() {
    if (busy || sel < 0) return;
    busy = true;
    const c = effective(hand[sel]);
    const nd = Math.abs(d - c);
    strokes++;
    let msg = c + ' うった!';
    if (water.has(nd)) { strokes++; msg += ' 🌊みずに落ちた…ペナルティ+1打'; }
    else { d = nd; }
    sandNext = !water.has(nd) && sand.has(nd);
    if (sandNext) msg += ' 🏖すなにはまった!次のカードは半分';
    hand[sel] = draw(); sel = -1;
    el.ghost.classList.add('hidden');
    el.info.textContent = msg;
    renderHud(); renderHand();
    setTimeout(afterShot, 500);
  }

  function afterShot() {
    if (d === 0) return endHole(false);
    if (strokes >= MAX_STROKES) return endHole(true);
    busy = false; renderHand();
    el.info.textContent += ' (のこり ' + d + ')';
  }

  function swap() {
    if (busy || sel < 0) return;
    hand[sel] = draw(); sel = -1; strokes++;
    el.ghost.classList.add('hidden');
    el.info.textContent = 'カードをこうかん(+1打)。のこり ' + d;
    renderHud(); renderHand();
    if (strokes >= MAX_STROKES) { busy = true; renderHand(); setTimeout(() => endHole(true), 400); }
  }

  function label(diff, st) {
    if (st === 1) return 'ホールインワン!!';
    if (diff <= -2) return 'イーグル!';
    return ({ '-1': 'バーディ!', '0': 'パー', '1': 'ボギー', '2': 'ダブルボギー' })[diff] || (diff + 'オーバー');
  }

  function endHole(pickup) {
    busy = true;
    const par = HOLES[hi].par, diff = strokes - par;
    diffTotal += diff; renderHud();
    const last = hi === HOLES.length - 1;
    el.rTitle.textContent = pickup ? 'ピックアップ…' : label(diff, strokes);
    el.rText.textContent = (hi + 1) + '番ホール ' + strokes + '打(PAR ' + par + ')。通算 ' + (diffTotal > 0 ? '+' : '') + diffTotal;
    if (last) finish(); else {
      el.next.textContent = '次のホールへ'; el.next.onclick = () => { hi++; el.result.classList.add('hidden'); startHole(); };
    }
    el.result.classList.remove('hidden');
  }

  function finish() {
    gameOver = true;
    let rank = diffTotal <= -2 ? '👑 プロ級!' : diffTotal <= 1 ? '🥇 シングルプレーヤー' : diffTotal <= 4 ? '🥈 なかなか!' : diffTotal <= 8 ? '🥉 練習あるのみ' : '🌱 ビギナー';
    let best = null;
    try {
      best = parseInt(localStorage.getItem('card-golf-best'), 10);
      if (isNaN(best) || diffTotal < best) { localStorage.setItem('card-golf-best', String(diffTotal)); best = diffTotal; }
    } catch (e) { best = null; }
    el.rTitle.textContent = 'ラウンド終了! ' + rank;
    el.rText.textContent = el.rText.textContent + (best !== null ? ' / ベスト ' + (best > 0 ? '+' : '') + best : '');
    el.next.textContent = 'もういちど';
    el.next.onclick = restart;
  }

  function restart() {
    hi = 0; diffTotal = 0; gameOver = false;
    el.result.classList.add('hidden');
    startHole();
  }

  el.shot.addEventListener('click', shoot);
  el.swap.addEventListener('click', swap);
  $('startBtn').addEventListener('click', () => { el.intro.classList.add('hidden'); restart(); });
  document.addEventListener('keydown', e => {
    if (!el.intro.classList.contains('hidden')) return;
    if (!el.result.classList.contains('hidden')) return;
    if (e.key >= '1' && e.key <= '4') pick(+e.key - 1);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot(); }
    else if (e.key === 's' || e.key === 'S') swap();
  });
  renderHud();
})();
