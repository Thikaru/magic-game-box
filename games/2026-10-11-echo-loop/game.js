'use strict';
// ざんぞうループ — ロジック(Engine は DOM 非依存でテスト可能)
const LIMIT = 16;
const STAGES = [
  { budget: 3, hint: 'スイッチに乗って「ざんぞうにする」→ 次のループでざんぞうがとびらを開けてくれる!',
    rows: ['#######', '#S...a#', '#.#####', '#.....#', '#####A#', '#####G#'] },
  { budget: 4, hint: 'とびらが2つ。ざんぞうを2体つくろう。',
    rows: ['#######', '#S.a.b#', '#.#####', '#.#####', '#.#####', '#.A.B.G', '#######'] },
  { budget: 4, hint: 'ざんぞうが開けたとびらの先に、次のスイッチがある…',
    rows: ['#######', '#S.a..#', '#.#####', '#.A.bBG', '#######'] },
  { budget: 5, hint: '同じ色のスイッチが3つ。全部おさえないと開かない!',
    rows: ['#######', '#Saaa.#', '#.#####', '#.#####', '#.AG###'] },
];

function parse(rows) {
  const h = rows.length, w = 7, cells = [], plates = {}, doors = {};
  let start = null, goal = null;
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] || '#';
      if (ch === 'S') start = [x, y];
      if (ch === 'G') goal = [x, y];
      if (ch >= 'a' && ch <= 'z') (plates[ch] = plates[ch] || []).push([x, y]);
      if (ch >= 'A' && ch <= 'Z' && ch !== 'S' && ch !== 'G') (doors[ch] = doors[ch] || []).push([x, y]);
      row.push(ch);
    }
    cells.push(row);
  }
  return { w, h, cells, plates, doors, start, goal };
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const ghostAt = (rec, t) => rec[Math.min(t, rec.length - 1)];

function doorOpen(map, ghosts, letter, t, player) {
  const ps = map.plates[letter.toLowerCase()] || [];
  return ps.every(p => same(p, player) || ghosts.some(g => same(ghostAt(g, t), p)));
}

// st: {map, ghosts, pos, rec, t}
function step(st, dx, dy) {
  const nx = st.pos[0] + dx, ny = st.pos[1] + dy, np = [nx, ny], t1 = st.t + 1;
  if (dx || dy) {
    if (nx < 0 || ny < 0 || nx >= st.map.w || ny >= st.map.h) return 'blocked';
    const ch = st.map.cells[ny][nx];
    if (ch === '#') return 'blocked';
    if (st.map.doors[ch] && !doorOpen(st.map, st.ghosts, ch, t1, np)) return 'blocked';
  }
  st.pos = np; st.t = t1; st.rec.push(np);
  const ch = st.map.cells[ny][nx];
  if (st.map.doors[ch] && !doorOpen(st.map, st.ghosts, ch, t1, np)) return 'crushed';
  if (ch === 'G') return 'goal';
  if (st.t >= LIMIT) return 'timeup';
  return 'moved';
}
function newLoop(st) { st.pos = st.map.start.slice(); st.rec = [st.pos.slice()]; st.t = 0; }
function newStage(i) {
  const st = { map: parse(STAGES[i].rows), ghosts: [], loop: 1 };
  newLoop(st); return st;
}
const Engine = { STAGES, LIMIT, parse, step, newStage, newLoop, doorOpen, ghostAt, same };
if (typeof module !== 'undefined') module.exports = Engine;

if (typeof document !== 'undefined') (function () {
  const $ = id => document.getElementById(id);
  const board = $('board'), msg = $('msg');
  let st = null, stageNo = 0, lives = 3, phase = 'intro';

  function setMsg(s) { msg.textContent = s; }
  function render() {
    const m = st.map, t = st.t;
    const gpos = st.ghosts.map(g => ghostAt(g, t));
    let html = '';
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const ch = m.cells[y][x], here = [x, y];
      let cls = 'c', inner = '';
      if (ch === '#') cls += ' wall';
      else if (m.plates[ch]) {
        const lit = same(st.pos, here) || gpos.some(p => same(p, here));
        cls += ' plate p' + ch + (lit ? ' lit' : ''); inner = ch.toUpperCase();
      } else if (m.doors[ch]) {
        const open = doorOpen(m, st.ghosts, ch, t, st.pos);
        cls += ' door d' + ch.toLowerCase() + (open ? ' open' : ' closed'); inner = ch;
      } else if (ch === 'G') inner = '🏁';
      let ov = '';
      gpos.forEach(p => { if (same(p, here)) ov += '<span class="g ghost">👻</span>'; });
      if (same(st.pos, here)) ov += '<span class="g">🐱</span>';
      html += '<div class="' + cls + '" data-x="' + x + '" data-y="' + y + '">' + inner + ov + '</div>';
    }
    board.style.gridTemplateRows = 'repeat(' + m.h + ',auto)';
    board.innerHTML = html;
    $('hStage').textContent = 'ステージ ' + (stageNo + 1) + '/' + STAGES.length;
    $('hLoop').textContent = 'ループ ' + st.loop + '/' + STAGES[stageNo].budget;
    $('hTurn').textContent = 'ターン ' + st.t + '/' + LIMIT;
    $('hLife').textContent = '❤️'.repeat(lives) || '💔';
  }
  function show(title, text, next, retry) {
    $('resTitle').textContent = title; $('resText').textContent = text;
    $('nextBtn').classList.toggle('hidden', !next);
    if (next) $('nextBtn').textContent = next;
    $('retryBtn').classList.toggle('hidden', !retry);
    $('res').classList.remove('hidden');
  }
  function startStage(i) {
    stageNo = i; st = newStage(i); phase = 'play';
    $('res').classList.add('hidden'); setMsg(STAGES[i].hint); render();
  }
  function stageFail() {
    lives--; phase = 'result'; render();
    if (lives <= 0) { show('ゲームオーバー', 'ループ回数を使い切って❤️がなくなりました…。ステージ ' + (stageNo + 1) + ' まで進みました。', null, true); }
    else { show('ループ切れ…', 'ゴールできないままループ回数を使い切りました。❤️が1つ減ります(のこり ' + lives + ')。', 'このステージをやりなおす', false); }
  }
  function endLoop(auto) {
    if (phase !== 'play') return;
    st.ghosts.push(st.rec);
    if (st.loop >= STAGES[stageNo].budget) { stageFail(); return; }
    st.loop++; newLoop(st);
    setMsg((auto ? 'ターン切れ!' : '') + 'ざんぞうが動き出します。ループ ' + st.loop + ' 開始!'); render();
  }
  function move(dx, dy) {
    if (phase !== 'play') return;
    const r = step(st, dx, dy);
    if (r === 'blocked') { setMsg('そっちには進めません(壁かとびら)。'); return; }
    setMsg('');
    render();
    if (r === 'goal') {
      phase = 'result';
      if (stageNo + 1 >= STAGES.length) show('全ステージクリア! 🎉', 'ざんぞうとの連携で全ステージ突破!のこりライフ: ' + '❤️'.repeat(lives), null, true);
      else show('ステージクリア! ✨', st.loop + 'ループでゴール!', 'つぎのステージへ', false);
    } else if (r === 'crushed') {
      st.pos = null; newLoop(st); setMsg('とびらにはさまれた! このループをやり直します。'); render();
    } else if (r === 'timeup') endLoop(true);
  }
  function resetLoop() { if (phase === 'play') { newLoop(st); setMsg('このループをやり直しました。'); render(); } }
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };

  $('startBtn').addEventListener('click', () => { $('intro').classList.add('hidden'); lives = 3; startStage(0); });
  $('nextBtn').addEventListener('click', () => {
    if (lives > 0 && phase === 'result') {
      const cleared = st.pos && same(st.pos, st.map.goal);
      startStage(cleared ? stageNo + 1 : stageNo);
    }
  });
  $('retryBtn').addEventListener('click', () => { lives = 3; startStage(0); });
  $('endBtn').addEventListener('click', () => endLoop(false));
  $('resetLoopBtn').addEventListener('click', resetLoop);
  document.querySelectorAll('#pad button').forEach(b => b.addEventListener('click', () => { const d = DIRS[b.dataset.d]; move(d[0], d[1]); }));
  board.addEventListener('click', e => {
    const c = e.target.closest('.c'); if (!c || phase !== 'play') return;
    const dx = +c.dataset.x - st.pos[0], dy = +c.dataset.y - st.pos[1];
    if (Math.abs(dx) + Math.abs(dy) <= 1) move(dx, dy);
  });
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), map = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', ' ': 'wait' };
    if (map[k]) { e.preventDefault(); const d = DIRS[map[k]]; move(d[0], d[1]); }
    else if (k === 'enter' && phase === 'play') { e.preventDefault(); endLoop(false); }
    else if (k === 'r') resetLoop();
  });
  const pad = $('pad');
  if (!matchMedia('(pointer: coarse)').matches) pad.classList.add('hidden');
  $('togBtn').addEventListener('click', () => pad.classList.toggle('hidden'));

  st = newStage(0); render();
})();
