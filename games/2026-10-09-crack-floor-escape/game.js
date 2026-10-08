(() => {
  const $ = id => document.getElementById(id);
  const board = $('board'), msg = $('msg');
  const STAGES = [
    { n: 5, len: 10, decoy: 3 },
    { n: 5, len: 13, decoy: 4 },
    { n: 6, len: 17, decoy: 5 },
    { n: 6, len: 21, decoy: 6 },
    { n: 7, len: 27, decoy: 8 }
  ];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let st = null, layout = null, stage = 0, hearts = 3, over = true, busy = false, cells = [];

  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // 自己回避パスをランダムに作る(必ず解がある配置になる)
  function makePath(n, len) {
    for (let t = 0; t < 200; t++) {
      const used = new Set();
      const path = [];
      let budget = 4000;
      const sx = rnd(n), sy = rnd(n);
      const dfs = (x, y) => {
        if (budget-- <= 0) return false;
        path.push([x, y]); used.add(x + ',' + y);
        if (path.length === len) return true;
        for (const [dx, dy] of shuffle(DIRS.slice())) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n || used.has(nx + ',' + ny)) continue;
          if (dfs(nx, ny)) return true;
        }
        path.pop(); used.delete(x + ',' + y);
        return false;
      };
      if (dfs(sx, sy)) return path;
    }
    return null;
  }

  function makeLayout(cfg) {
    const { n, len, decoy } = cfg;
    let path = makePath(n, len);
    while (!path) path = makePath(n, len);
    const floor = new Set(path.map(p => p[0] + ',' + p[1]));
    const free = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!floor.has(x + ',' + y)) free.push([x, y]);
    shuffle(free).slice(0, decoy).forEach(p => floor.add(p[0] + ',' + p[1]));
    const ki = Math.floor(len * (0.4 + Math.random() * 0.3));
    return { n, floor, start: path[0], key: path[ki], door: path[len - 1] };
  }

  function buildBoard() {
    const n = layout.n;
    board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    board.innerHTML = '';
    cells = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = document.createElement('div');
      d.className = 'c';
      d.dataset.x = x; d.dataset.y = y;
      board.appendChild(d);
      cells.push(d);
    }
  }

  function loadStage(fresh) {
    if (fresh) layout = makeLayout(STAGES[stage]);
    st = {
      x: layout.start[0], y: layout.start[1], hasKey: false,
      gone: new Set()
    };
    if (fresh || cells.length !== layout.n * layout.n) buildBoard();
    busy = false;
    render();
    msg.textContent = '';
    hud();
  }

  function hud() {
    $('stg').textContent = `ステージ ${stage + 1}/${STAGES.length}`;
    $('key').textContent = st && st.hasKey ? '🔑 ゲット!' : '🔑 まだ';
    $('hearts').textContent = hearts > 0 ? '❤️'.repeat(hearts) : '💔';
  }

  function canGo(x, y) {
    return x >= 0 && y >= 0 && x < layout.n && y < layout.n &&
      layout.floor.has(x + ',' + y) && !st.gone.has(x + ',' + y);
  }

  function render() {
    const n = layout.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = cells[y * n + x], k = x + ',' + y;
      let cls = 'c', txt = '';
      if (st.gone.has(k)) cls += ' hole';
      else if (layout.floor.has(k)) cls += ' floor';
      else cls += ' water';
      const isCur = x === st.x && y === st.y;
      if (isCur) { cls += ' cur'; txt = '🧑‍🚀'; }
      else if (!st.gone.has(k) && layout.floor.has(k)) {
        if (!st.hasKey && layout.key[0] === x && layout.key[1] === y) txt = '🔑';
        else if (layout.door[0] === x && layout.door[1] === y) txt = '🚪';
      } else if (!layout.floor.has(k)) txt = '';
      if (!isCur && Math.abs(x - st.x) + Math.abs(y - st.y) === 1 && canGo(x, y)) cls += ' hint';
      if (c.className !== cls) c.className = cls;
      if (c.textContent !== txt) c.textContent = txt;
    }
  }

  function hasMove() {
    return DIRS.some(([dx, dy]) => canGo(st.x + dx, st.y + dy));
  }

  function fail(text) {
    busy = true;
    hearts--;
    hud();
    msg.textContent = text;
    if (hearts <= 0) { setTimeout(() => finish(false), 700); return; }
    setTimeout(() => { if (!over) loadStage(false); msg.textContent = 'もういちど!'; }, 900);
  }

  function step(dx, dy) {
    if (over || busy || !st) return;
    const nx = st.x + dx, ny = st.y + dy;
    if (nx < 0 || ny < 0 || nx >= layout.n || ny >= layout.n) return;
    const k = nx + ',' + ny;
    if (!layout.floor.has(k)) {
      st.x = nx; st.y = ny; render();
      cells[ny * layout.n + nx].textContent = '💦';
      fail('みずにおちた!');
      return;
    }
    if (st.gone.has(k)) {
      st.x = nx; st.y = ny; render();
      cells[ny * layout.n + nx].textContent = '💦';
      fail('穴におちた!');
      return;
    }
    st.gone.add(st.x + ',' + st.y);
    st.x = nx; st.y = ny;
    if (!st.hasKey && layout.key[0] === nx && layout.key[1] === ny) {
      st.hasKey = true; msg.textContent = '🔑 カギをゲット!とびらへ!';
    } else if (msg.textContent.indexOf('カギ') < 0) msg.textContent = '';
    hud(); render();
    if (layout.door[0] === nx && layout.door[1] === ny && st.hasKey) {
      busy = true;
      msg.textContent = '🚪 クリア!';
      setTimeout(nextStage, 800);
      return;
    }
    if (!hasMove()) fail('行き止まり…!');
  }

  function nextStage() {
    if (over) return;
    stage++;
    if (stage >= STAGES.length) { finish(true); return; }
    loadStage(true);
  }

  function finish(win) {
    over = true; busy = true;
    $('resTitle').textContent = win ? '🎉 脱出せいこう!' : '💥 ゲームオーバー';
    $('resText').innerHTML = win
      ? `5ステージすべて突破!<br>のこりハート: ${'❤️'.repeat(hearts)}${hearts === 3 ? '<br>ノーミスクリア!すごい!' : ''}`
      : `ステージ ${stage + 1} でハートがなくなった…<br>先を読んで、ルートをえらぼう。`;
    $('result').classList.remove('hidden');
  }

  function start() {
    stage = 0; hearts = 3; over = false;
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    cells = [];
    loadStage(true);
  }

  layout = makeLayout(STAGES[0]); loadStage(false); busy = true;

  // 入力
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  $('resetBtn').addEventListener('click', () => {
    if (over || busy) return;
    fail('やりなおし…');
  });
  window.addEventListener('keydown', e => {
    const m = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
      ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0] }[e.key];
    if (m) { e.preventDefault(); step(m[0], m[1]); }
  });
  let sx = 0, sy = 0, tracking = false;
  board.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; tracking = true; });
  board.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      if (Math.abs(dx) > Math.abs(dy)) step(dx > 0 ? 1 : -1, 0); else step(0, dy > 0 ? 1 : -1);
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.dataset.x === undefined || !st) return;
    const tx = +el.dataset.x - st.x, ty = +el.dataset.y - st.y;
    if (Math.abs(tx) + Math.abs(ty) === 1) step(tx, ty);
  });
  board.addEventListener('pointercancel', () => { tracking = false; });
})();
