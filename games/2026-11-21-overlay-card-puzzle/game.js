(() => {
  'use strict';
  // ===== 定数 =====
  const TOTAL_STAGES = 12;
  const START_TIME = 100;
  const CLEAR_BONUS_TIME = 12;
  const HINT_COST = 5;
  const COLORS = [
    { c: '#e74c3c', e: '🟥', n: 'あか' },
    { c: '#3b7ddd', e: '🟦', n: 'あお' },
    { c: '#f2c230', e: '🟨', n: 'きいろ' },
    { c: '#3fae5a', e: '🟩', n: 'みどり' },
    { c: '#9b59b6', e: '🟪', n: 'むらさき' }
  ];
  const KEYS_ROT = ['q', 'w', 'e', 'r', 't', 'y'];

  // ステージ設定: N=盤面サイズ, sol=正解に使う枚数, dummy=ニセモノ枚数, rot=回転あり
  function stageConf(s) {
    if (s <= 2) return { N: 3, sol: 2, dummy: 1, rot: false };
    if (s <= 4) return { N: 3, sol: 3, dummy: 1, rot: false };
    if (s <= 6) return { N: 3, sol: 3, dummy: 1, rot: true };
    if (s <= 9) return { N: 4, sol: 3, dummy: 2, rot: true };
    return { N: 4, sol: 4, dummy: 2, rot: true };
  }

  // ===== DOM =====
  const $ = id => document.getElementById(id);
  const targetEl = $('target'), stackEl = $('stack'), handEl = $('hand'), orderEl = $('order');
  const infoEl = $('info'), toastEl = $('toast');

  // ===== ユーティリティ =====
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rot90 = (m, N) => { const o = new Array(N * N); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) o[r * N + c] = m[(N - 1 - c) * N + r]; return o; };
  const rotK = (m, N, k) => { let o = m.slice(); for (let i = 0; i < ((k % 4) + 4) % 4; i++) o = rot90(o, N); return o; };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  function randMask(N) {
    const total = N * N;
    for (;;) {
      const p = 0.35 + Math.random() * 0.2;
      const m = Array.from({ length: total }, () => (Math.random() < p ? 1 : 0));
      const cnt = m.reduce((a, b) => a + b, 0);
      if (cnt >= 2 && cnt <= total - 3) return m;
    }
  }
  function composite(layers, N) {
    const out = new Array(N * N).fill(-1);
    for (const L of layers) for (let i = 0; i < N * N; i++) if (L.mask[i]) out[i] = L.color;
    return out;
  }

  // ===== サウンド(Web Audio 自前生成) =====
  let actx = null;
  function initAudio() {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sPlace = () => tone(520 + placed.length * 80, 0.09, 'triangle');
  const sUndo = () => tone(300, 0.08, 'square', 0.06);
  const sRot = () => tone(700, 0.05, 'sine', 0.08);
  const sClear = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.08)); };
  const sHint = () => tone(880, 0.15, 'sine', 0.1);
  const sEnd = ok => ok ? [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.1))
                        : [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.07, i * 0.15));

  // ===== 状態 =====
  let stage, score, timeLeft, conf, hand, solution, target, placed, usedUndo, mode = 'intro', last = 0, raf = 0, best = 0;
  try { best = +localStorage.getItem('overlayCardPuzzleBest') || 0; } catch (e) { best = 0; }

  // ===== ステージ生成 =====
  function genStage() {
    conf = stageConf(stage);
    const { N } = conf;
    for (let tries = 0; tries < 500; tries++) {
      const colors = shuffle([0, 1, 2, 3, 4]).slice(0, conf.sol);
      const sol = colors.map(color => ({ color, mask: randMask(N) }));
      const tgt = composite(sol, N);
      // 各カードが最終形で1マス以上見えていること
      if (!sol.every(L => tgt.some(v => v === L.color))) continue;
      // かさなり(上書き)がsol-1か所以上あること=じゅんばんが大事
      let over = 0, cur = new Array(N * N).fill(-1);
      for (const L of sol) { for (let i = 0; i < N * N; i++) if (L.mask[i]) { if (cur[i] !== -1) over++; cur[i] = L.color; } }
      if (over < conf.sol - 1) continue;
      // ニセモノ
      const dummies = [];
      let bad = false;
      for (let d = 0; d < conf.dummy; d++) {
        const color = Math.random() < 0.6 ? sol[rnd(sol.length)].color : [0, 1, 2, 3, 4].filter(c => !colors.includes(c))[rnd(5 - colors.length)];
        let mask, ok = false;
        for (let k = 0; k < 50 && !ok; k++) {
          mask = randMask(N);
          ok = !sol.concat(dummies).some(L => L.color === color && [0, 1, 2, 3].some(r => same(rotK(L.mask, N, r), mask)));
        }
        if (!ok) { bad = true; break; }
        dummies.push({ color, mask });
      }
      if (bad) continue;
      // 手札を作る(回転ステージでは表示の向きをずらす)
      const cards = sol.map((L, i) => ({ color: L.color, correct: L.mask, sol: i }))
        .concat(dummies.map(L => ({ color: L.color, correct: L.mask, sol: -1 })));
      cards.forEach(c => {
        c.rot = conf.rot ? 1 + rnd(3) : 0; // 正しい向きにするには ↻ を (4-rot)%4 回
        c.mask = rotK(c.correct, N, c.rot);
        c.used = false;
      });
      hand = shuffle(cards);
      solution = sol.map((_, i) => hand.findIndex(c => c.sol === i));
      target = tgt;
      return;
    }
    // 万一失敗したら(まず起きない)簡単な設定で再生成
    genStage();
  }

  // ===== 描画 =====
  function drawGrid(el, cells, N) {
    el.style.gridTemplateColumns = `repeat(${N},1fr)`;
    el.innerHTML = '';
    for (let i = 0; i < N * N; i++) {
      const d = document.createElement('div');
      d.className = 'cell' + (cells[i] === -1 ? ' e' : '');
      if (cells[i] !== -1) d.style.background = COLORS[cells[i]].c;
      el.appendChild(d);
    }
  }
  const maskCells = (card) => card.mask.map(v => (v ? card.color : -1));

  function render() {
    const { N } = conf;
    $('stageNo').textContent = `ステージ ${stage} / ${TOTAL_STAGES}`;
    $('score').textContent = `${score}点`;
    drawGrid(targetEl, target, N);
    const comp = composite(placed.map(p => p.layer), N);
    drawGrid(stackEl, comp, N);
    orderEl.textContent = placed.length ? '下 ' + placed.map(p => COLORS[p.layer.color].e).join('→') + ' 上' : '(まだ なにも ない)';
    handEl.innerHTML = '';
    hand.forEach((card, i) => {
      const box = document.createElement('div');
      box.className = 'card' + (card.used ? ' used' : '');
      box.dataset.i = i;
      const b = document.createElement('button');
      b.className = 'place';
      b.setAttribute('aria-label', `カード${i + 1}を置く`);
      const g = document.createElement('div');
      g.className = 'grid';
      drawGrid(g, maskCells(card), N);
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = card.used ? `${i + 1}:つかった` : `${i + 1}:${COLORS[card.color].n}`;
      b.appendChild(g); b.appendChild(lbl);
      b.addEventListener('click', () => placeCard(i));
      box.appendChild(b);
      if (conf.rot) {
        const r = document.createElement('button');
        r.className = 'rot';
        r.textContent = '↻ 回転';
        r.addEventListener('click', () => rotateCard(i));
        box.appendChild(r);
      }
      handEl.appendChild(box);
    });
  }
  function setInfo(s) { infoEl.textContent = s; }
  function updateTime() {
    const t = Math.max(0, timeLeft);
    $('time').textContent = `⏱ ${Math.ceil(t)}`;
    $('timefill').style.width = `${Math.min(100, (t / START_TIME) * 100)}%`;
    $('timebar').classList.toggle('low', t < 15);
  }

  // ===== 操作 =====
  function placeCard(i) {
    if (mode !== 'play') return;
    const card = hand[i];
    if (!card || card.used) return;
    card.used = true;
    placed.push({ idx: i, layer: { color: card.color, mask: card.mask.slice() } });
    sPlace();
    checkClear();
  }
  function rotateCard(i) {
    if (mode !== 'play') return;
    const card = hand[i];
    if (!card || card.used) return;
    card.mask = rot90(card.mask, conf.N);
    card.rot = (card.rot + 1) % 4;
    sRot();
    render();
  }
  function undo() {
    if (mode !== 'play' || !placed.length) return;
    const p = placed.pop();
    hand[p.idx].used = false;
    usedUndo = true;
    sUndo();
    setInfo('ひとつもどしたよ。');
    render();
  }
  function resetAll() {
    if (mode !== 'play' || !placed.length) return;
    placed.forEach(p => { hand[p.idx].used = false; });
    placed = [];
    usedUndo = true;
    sUndo();
    setInfo('ぜんぶ手札にもどしたよ。');
    render();
  }
  function hint() {
    if (mode !== 'play') return;
    timeLeft -= HINT_COST;
    updateTime();
    sHint();
    // いまのかさねが正解のじゅんばんの途中までと一致しているか
    const prefixOk = placed.every((p, k) => p.idx === solution[k] && same(p.layer.mask, hand[p.idx].correct));
    if (!prefixOk || placed.length >= solution.length) {
      setInfo('💡 どこかでじゅんばん(か向き)がちがうみたい。もどしてみよう!');
      const u = $('undoBtn'); u.classList.add('flash'); setTimeout(() => u.classList.remove('flash'), 1500);
    } else {
      const ni = solution[placed.length];
      const card = hand[ni];
      const need = (4 - card.rot) % 4;
      const nth = placed.length === 0 ? 'いちばん下' : `${placed.length + 1}まいめ`;
      setInfo(`💡 ${nth}は 光っているカード(${ni + 1}番)` + (need ? `。↻をあと${need}回!` : '!'));
      const box = handEl.querySelector(`.card[data-i="${ni}"]`);
      if (box) { box.classList.remove('hint'); void box.offsetWidth; box.classList.add('hint'); }
    }
    if (timeLeft <= 0) endGame(false);
  }

  function checkClear() {
    const comp = composite(placed.map(p => p.layer), conf.N);
    render();
    if (same(comp, target)) {
      mode = 'clear';
      const gain = 100 + stage * 10 + (usedUndo ? 0 : 50);
      score += gain;
      timeLeft += CLEAR_BONUS_TIME;
      updateTime();
      $('score').textContent = `${score}点`;
      $('stackWrap').classList.add('ok');
      sClear();
      showToast(`ぴったり! +${gain}${usedUndo ? '' : '(ノーミス)'}`);
      setTimeout(() => {
        $('stackWrap').classList.remove('ok');
        hideToast();
        if (mode !== 'clear') return;
        if (stage >= TOTAL_STAGES) { endGame(true); return; }
        stage++;
        startStage();
      }, 1100);
    } else if (hand.every(c => c.used)) {
      setInfo('カードがなくなった!↩でもどしてやりなおそう。');
    } else {
      setInfo(placed.length === 1 ? 'つぎのカードは、この上にかさなるよ。' : `${placed.length}まい かさねた。`);
    }
  }

  function showToast(s) { toastEl.textContent = s; toastEl.classList.remove('hidden'); }
  function hideToast() { toastEl.classList.add('hidden'); }

  function startStage() {
    genStage();
    placed = [];
    usedUndo = false;
    mode = 'play';
    const c = conf;
    let msg = `${c.sol}まいでおてほんをつくろう(ニセモノ${c.dummy}まい)。`;
    if (stage === 5) msg = '🔄 ここから回転あり!↻で向きを合わせよう。';
    else if (stage === 7) msg = '📐 4×4にパワーアップ!ニセモノも2まいに。';
    else if (stage === 10) msg = '🔥 ラスト3ステージ!4まいかさねよう。';
    setInfo(msg);
    render();
  }

  function startGame() {
    initAudio();
    stage = 1; score = 0; timeLeft = START_TIME;
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    hideToast();
    updateTime();
    startStage();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (mode === 'play') {
      timeLeft -= dt;
      updateTime();
      if (timeLeft <= 0) { endGame(false); return; }
    }
    if (mode === 'play' || mode === 'clear') raf = requestAnimationFrame(loop);
  }

  function endGame(allClear) {
    if (mode === 'over') return;
    mode = 'over';
    cancelAnimationFrame(raf);
    timeLeft = Math.max(0, timeLeft);
    updateTime();
    let bonus = 0;
    if (allClear) { bonus = Math.ceil(timeLeft) * 5; score += bonus; }
    const isBest = score > best;
    if (isBest) { best = score; try { localStorage.setItem('overlayCardPuzzleBest', String(best)); } catch (e) { /* 保存できなくても遊べる */ } }
    sEnd(allClear);
    const cleared = allClear ? TOTAL_STAGES : stage - 1;
    $('rTitle').textContent = allClear ? '🎉 ぜんぶクリア!' : '⏰ タイムアップ!';
    $('rText').innerHTML =
      `クリアしたステージ:<b>${cleared} / ${TOTAL_STAGES}</b><br>` +
      (allClear ? `のこり時間ボーナス:+${bonus}点<br>` : '') +
      `スコア:<b>${score}点</b>${isBest ? ' 🏅自己ベスト!' : ''}<br>ベスト:${best}点<br>` +
      (allClear ? 'セロハン名人!ノーミスでもっと高得点をねらおう。' : cleared >= 6 ? 'おしい!💡ヒントは5秒…つかいどころが大事。' : 'まずは「いちばん下」になる色をさがすのがコツ!');
    setTimeout(() => $('result').classList.remove('hidden'), 400);
  }

  // ===== 説明画面のデモ =====
  (function demo() {
    const d = $('demo');
    const mk = (cells) => { const g = document.createElement('div'); g.className = 'grid stackb'; drawGrid(g, cells, 3); return g; };
    const A = [0, 0, 0, 0, -1, -1, 0, -1, -1];          // あかのL
    const B2 = [-1, 1, -1, 1, 1, 1, -1, 1, -1];         // あおの十字
    const R = A.map((v, i) => (B2[i] !== -1 ? B2[i] : v));
    const plus = t => { const s = document.createElement('span'); s.textContent = t; return s; };
    d.appendChild(mk(A)); d.appendChild(plus('の上に')); d.appendChild(mk(B2)); d.appendChild(plus('=')); d.appendChild(mk(R));
  })();

  // ===== 入力 =====
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', resetAll);
  $('hintBtn').addEventListener('click', hint);
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (mode === 'intro' || mode === 'over') {
      if ((k === 'enter' || k === ' ') && !(mode === 'over' && $('result').classList.contains('hidden'))) { e.preventDefault(); startGame(); }
      return;
    }
    if (k >= '1' && k <= '6') { placeCard(+k - 1); return; }
    const ri = KEYS_ROT.indexOf(k);
    if (ri >= 0 && conf.rot) { rotateCard(ri); return; }
    if (k === 'z' || k === 'backspace') { e.preventDefault(); undo(); }
    else if (k === 'x') resetAll();
    else if (k === 'h') hint();
  });
})();
