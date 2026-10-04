(() => {
  const N = 5;
  const PEST = 'P', STONE = 'S';
  const EMO = { 1:'🌱', 2:'🌿', 3:'🌷', 4:'🌳', 5:'🍎', P:'🐛', S:'🪨' };
  const PTS = { 1:10, 2:30, 3:80, 4:200, 5:600 };
  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const cells = [];
  let grid, next, score, turn, playing, busy;

  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.className = 'cell';
    b.setAttribute('aria-label', 'マス' + (i + 1));
    b.addEventListener('click', () => place(i));
    b.addEventListener('keydown', e => {
      const d = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-N, ArrowDown:N }[e.key];
      if (!d) return;
      e.preventDefault();
      const nx = i + d;
      if (nx >= 0 && nx < N * N && !(Math.abs(d) === 1 && Math.floor(nx / N) !== Math.floor(i / N))) cells[nx].focus();
    });
    boardEl.appendChild(b);
    cells.push(b);
  }

  const neighbors = i => {
    const r = Math.floor(i / N), c = i % N, o = [];
    if (r > 0) o.push(i - N);
    if (r < N - 1) o.push(i + N);
    if (c > 0) o.push(i - 1);
    if (c < N - 1) o.push(i + 1);
    return o;
  };
  const rollNext = () => {
    const r = Math.random();
    return r < 0.68 ? 1 : r < 0.94 ? 2 : 3;
  };
  const emptyCells = () => grid.reduce((a, v, i) => (v === 0 ? a.concat(i) : a), []);

  function render(popIdx) {
    cells.forEach((el, i) => {
      const v = grid[i];
      el.textContent = v ? EMO[v] : '';
      el.className = 'cell' + (v ? ' full' : '') + (v === PEST ? ' pest' : '') + (v === STONE ? ' stone' : '');
      if (popIdx && popIdx.includes(i)) { void el.offsetWidth; el.classList.add('pop'); }
    });
    $('next').textContent = EMO[next];
    $('hScore').textContent = score + '点';
    $('hTurn').textContent = turn + '手';
  }

  function group(start) {
    const t = grid[start], seen = new Set([start]), q = [start];
    while (q.length) {
      const x = q.pop();
      for (const n of neighbors(x)) if (!seen.has(n) && grid[n] === t) { seen.add(n); q.push(n); }
    }
    return [...seen];
  }

  // 起点マスで合体判定。連鎖込みで獲得点・連鎖数を返す
  function mergeAt(idx, popped) {
    let chain = 0, gained = 0;
    for (;;) {
      const t = grid[idx];
      if (t === PEST || !t) break;
      const g = group(idx);
      if (g.length < 3) break;
      chain++;
      g.forEach(i => { grid[i] = 0; });
      popped.push(...g);
      if (t === 5) {
        gained += PTS[5] * g.length;
        $('msg').textContent = '🍎 大収穫!';
        break;
      }
      const up = t === STONE ? 3 : t + 1;
      grid[idx] = up;
      gained += PTS[up] * chain;
    }
    return { chain, gained };
  }

  function place(i) {
    if (!playing || busy || grid[i] !== 0) return;
    $('msg').textContent = '';
    const popped = [];
    grid[i] = next;
    turn++;
    let { chain, gained } = mergeAt(i, popped);
    score += gained;
    if (chain >= 2) $('msg').textContent = chain + '連鎖! ✨';
    else if (chain === 1) $('msg').textContent = '育った!';

    movePests(popped);
    if (turn >= 5 && turn % 4 === 0) spawnPest();
    next = rollNext();
    render(popped);
    if (emptyCells().length === 0) finish();
  }

  function spawnPest() {
    const e = emptyCells();
    if (e.length > 2) {
      grid[e[Math.floor(Math.random() * e.length)]] = PEST;
      $('msg').textContent = '🐛 害虫があらわれた!';
    }
  }

  function movePests(popped) {
    const pests = grid.reduce((a, v, i) => (v === PEST ? a.concat(i) : a), []);
    pests.sort(() => Math.random() - 0.5);
    for (const p of pests) {
      const free = neighbors(p).filter(n => grid[n] === 0);
      if (free.length) {
        const to = free[Math.floor(Math.random() * free.length)];
        grid[p] = 0;
        grid[to] = PEST;
      } else {
        grid[p] = STONE;
        score += 20;
        $('msg').textContent = '🪨 害虫をとじこめた!';
        const r = mergeAt(p, popped);
        score += r.gained;
        if (r.chain) $('msg').textContent = '🪨 → 🌷 へんしん!';
      }
    }
  }

  function finish() {
    playing = false;
    let best = 0;
    try { best = +localStorage.getItem('garden-merge-best') || 0; } catch (e) {}
    const isBest = score > best;
    if (isBest) { try { localStorage.setItem('garden-merge-best', score); } catch (e) {} }
    const hi = grid.reduce((m, v) => (typeof v === 'number' && v > m ? v : m), 0);
    $('rTitle').textContent = '畑がいっぱい!';
    $('rText').innerHTML = '得点: <b>' + score + '点</b>(' + turn + '手)<br>いちばん育った植物: ' + (EMO[hi] || '-') +
      '<br>' + (isBest ? '🎉 ハイスコア更新!' : 'ベスト: ' + best + '点');
    setTimeout(() => $('result').classList.remove('hidden'), 500);
  }

  function start() {
    grid = new Array(N * N).fill(0);
    score = 0; turn = 0; busy = false; playing = true;
    // 初期配置: 少しだけ植物を置いておく
    for (let k = 0; k < 4; k++) {
      const e = emptyCells();
      grid[e[Math.floor(Math.random() * e.length)]] = 1;
    }
    next = 1;
    $('msg').textContent = '';
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    render();
  }

  grid = new Array(N * N).fill(0); next = 1; score = 0; turn = 0; render();
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
})();
