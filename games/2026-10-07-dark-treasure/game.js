(() => {
  'use strict';
  const MAX_STAGE = 8;
  const $ = id => document.getElementById(id);
  const board = $('board'), msg = $('msg');
  let size, cells, items, pos, hearts, stage, peeks, state, timers = [], found, total;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const idx = (x, y) => y * size + x;

  function buildStage() {
    size = stage <= 2 ? 4 : stage <= 5 ? 5 : 6;
    const nT = Math.min(2 + stage, size * size - 6);
    const nB = Math.min(2 + stage, 9);
    items = new Array(size * size).fill(null);
    pos = { x: Math.floor(size / 2), y: size - 1 };
    const free = [];
    for (let i = 0; i < size * size; i++) if (i !== idx(pos.x, pos.y)) free.push(i);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    for (let i = 0; i < nT; i++) items[free[i]] = 'T';
    for (let i = 0; i < nB; i++) items[free[nT + i]] = 'B';
    total = nT; found = 0;
    board.style.gridTemplateColumns = `repeat(${size},1fr)`;
    board.innerHTML = '';
    cells = [];
    for (let i = 0; i < size * size; i++) { const c = document.createElement('div'); c.className = 'cell'; board.appendChild(c); cells.push(c); }
    updateHud();
  }

  function updateHud() {
    $('lv').textContent = `ステージ ${stage}`;
    $('hearts').textContent = '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts);
    $('left').textContent = `💎 ${found}/${total}`;
    $('peekBtn').textContent = `👀 のぞく (${peeks})`;
  }

  function reveal(on) {
    cells.forEach((c, i) => {
      const it = items[i];
      const done = c.classList.contains('got') || c.classList.contains('boom');
      if (on) { c.classList.add('shown'); c.dataset.t = c.textContent; if (it) c.textContent = it === 'T' ? '💎' : '💣'; }
      else { c.classList.remove('shown'); if (!done) c.textContent = ''; else c.textContent = it === 'T' ? '💎' : '💣'; }
    });
  }

  function render() {
    cells.forEach((c, i) => c.classList.toggle('me', i === idx(pos.x, pos.y)));
  }

  function startStage() {
    buildStage();
    render();
    state = 'memo';
    const ms = Math.max(1600, 3600 - stage * 250);
    msg.textContent = '👀 おぼえて!';
    reveal(true);
    later(() => { reveal(false); state = 'play'; msg.textContent = '🌑 まっくら!お宝をさがせ'; render(); }, ms);
  }

  function move(dx, dy) {
    if (state !== 'play') return;
    const nx = pos.x + dx, ny = pos.y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
    pos = { x: nx, y: ny };
    const i = idx(nx, ny), c = cells[i], it = items[i];
    if (it === 'T') {
      items[i] = null; found++; c.classList.add('got'); c.textContent = '💎'; msg.textContent = '💎 ゲット!';
    } else if (it === 'B') {
      items[i] = null; hearts--; c.classList.add('boom'); c.textContent = '💣'; msg.textContent = '💥 わなだ!';
    }
    render(); updateHud();
    if (hearts <= 0) return end(false);
    if (found >= total) {
      state = 'wait';
      if (stage >= MAX_STAGE) return later(() => end(true), 500);
      msg.textContent = `✨ ステージ${stage} クリア!`;
      later(() => { stage++; startStage(); }, 1000);
    }
  }

  function peek() {
    if (state !== 'play' || peeks <= 0) return;
    peeks--; state = 'peek'; updateHud();
    reveal(true);
    later(() => { reveal(false); state = 'play'; render(); }, 800);
  }

  function end(clear) {
    state = 'over';
    $('resTitle').textContent = clear ? '🏆 ぜんぶクリア!' : '💥 ゲームオーバー';
    $('resText').textContent = clear ? `ステージ${MAX_STAGE}まで制覇!のこりハート ${hearts}、のぞく ${peeks}回のこし。` : `ステージ ${stage} で力つきた…。あとちょっと!`;
    $('result').classList.remove('hidden');
  }

  function newGame() {
    clearTimers();
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    hearts = 3; stage = 1; peeks = 2;
    startStage();
  }

  $('startBtn').addEventListener('click', newGame);
  $('retryBtn').addEventListener('click', newGame);
  $('peekBtn').addEventListener('click', peek);
  const dirs = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  document.querySelectorAll('#pad button').forEach(b => b.addEventListener('click', () => move(...dirs[b.dataset.d])));
  const keys = { ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd', ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r' };
  window.addEventListener('keydown', e => {
    const d = keys[e.key];
    if (d) { e.preventDefault(); move(...dirs[d]); }
    else if (e.key === ' ' || e.key === 'p') { if (state === 'play') { e.preventDefault(); peek(); } }
  });
  // タップ/スワイプ: 盤面タップは自キャラからの方向、スワイプも可
  let sx, sy;
  board.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  board.addEventListener('pointerup', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const r = board.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * size - (pos.x + .5);
      const py = (e.clientY - r.top) / r.height * size - (pos.y + .5);
      if (Math.abs(px) > Math.abs(py)) move(px > 0 ? 1 : -1, 0); else move(0, py > 0 ? 1 : -1);
    } else if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0); else move(0, dy > 0 ? 1 : -1);
  });
  const pad = $('pad');
  if (matchMedia('(pointer: coarse)').matches) pad.classList.remove('hidden');
  $('padToggle').addEventListener('click', () => pad.classList.toggle('hidden'));
})();
