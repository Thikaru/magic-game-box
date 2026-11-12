(() => {
  'use strict';
  const N = 6, SPIN_EVERY = 4, WIN_ROUNDS = 2;
  const $ = id => document.getElementById(id);
  const el = { score: $('score'), round: $('round'), spin: $('spin'), info: $('info'), cols: $('cols'), board: $('board'),
    intro: $('intro'), result: $('result'), rTitle: $('rTitle'), rText: $('rText') };

  // ---- 盤面ロジック(純粋関数) ----
  const empty = () => Array.from({ length: N }, () => Array(N).fill(0));
  const clone = b => b.map(r => r.slice());
  function dropRow(b, c) { for (let r = N - 1; r >= 0; r--) if (!b[r][c]) return r; return -1; }
  function settle(b) { // 各列のこまを下へつめる
    for (let c = 0; c < N; c++) {
      const st = [];
      for (let r = N - 1; r >= 0; r--) if (b[r][c]) st.push(b[r][c]);
      for (let r = N - 1, i = 0; r >= 0; r--, i++) b[r][c] = st[i] || 0;
    }
    return b;
  }
  function rotate(b) { // 右へ90°回転してから落下
    const n = empty();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) n[r][c] = b[N - 1 - c][r];
    return settle(n);
  }
  const LINES = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + dr * 3, ec = c + dc * 3;
      if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
      LINES.push([0, 1, 2, 3].map(k => [r + dr * k, c + dc * k]));
    }
  function winCells(b, who) {
    const out = [];
    for (const L of LINES) if (L.every(([r, c]) => b[r][c] === who)) out.push(...L);
    return out;
  }
  function judge(b) { // 0:なし 1:プレイヤー 2:ロボ 3:同時
    return (winCells(b, 1).length ? 1 : 0) + (winCells(b, 2).length ? 2 : 0);
  }
  const isFull = b => b[0].every(v => v);
  function simulate(b, c, who, placedBefore) {
    const r = dropRow(b, c);
    if (r < 0) return null;
    let n = clone(b); n[r][c] = who;
    let res = judge(n);
    if (!res && (placedBefore + 1) % SPIN_EVERY === 0) { n = rotate(n); res = judge(n); }
    return { b: n, res };
  }
  function evalFor(b, who) {
    let s = 0;
    for (const L of LINES) {
      let mine = 0, other = 0;
      for (const [r, c] of L) { if (b[r][c] === who) mine++; else if (b[r][c]) other++; }
      if (!other) s += mine * mine;
    }
    return s;
  }
  function aiPick(b, placedNow, careless) {
    let best = -1e9, pick = -1;
    for (let c = 0; c < N; c++) {
      const s = simulate(b, c, 2, placedNow);
      if (!s) continue;
      let v = evalFor(s.b, 2) - evalFor(s.b, 1) * 1.1 - Math.abs(c - 2.5) * 0.5 + Math.random() * 3;
      if (s.res === 2) v += 10000;
      else if (s.res === 1) v -= 9000;
      else if (s.res === 3) v -= 300;
      else if (!careless) {
        for (let d = 0; d < N; d++) {
          const t = simulate(s.b, d, 1, placedNow + 1);
          if (t && t.res === 1) { v -= 5000; break; }
        }
      }
      if (v > best) { best = v; pick = c; }
    }
    return pick;
  }

  // ---- 音(ユーザー操作内で生成) ----
  let ac = null;
  function initAudio() {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; }
  }
  function beep(f, d, type, when) {
    if (!ac) return;
    try {
      const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
    } catch (e) { /* 音なしで続行 */ }
  }

  // ---- 画面 ----
  const cells = [], colBtns = [];
  for (let c = 0; c < N; c++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'colbtn'; b.textContent = '▼';
    b.setAttribute('aria-label', (c + 1) + 'れつめに落とす');
    b.addEventListener('click', () => { sel = c; playerDrop(c); });
    el.cols.appendChild(b); colBtns.push(b);
  }
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.addEventListener('click', () => { sel = i % N; playerDrop(i % N); });
    el.board.appendChild(d); cells.push(d);
  }

  let board, placed, round, wins, phase = 'idle', sel = 2, token = 0, firstPlayer, lastNew = -1;
  const timers = [];
  function later(fn, ms) {
    const tk = token;
    timers.push(setTimeout(() => { if (tk === token) fn(); }, ms));
  }

  function render(winList) {
    const ws = new Set((winList || []).map(([r, c]) => r * N + c));
    const ghostRow = phase === 'player' ? dropRow(board, sel) : -1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c, v = board[r][c];
      let cls = 'cell' + (v ? ' p' + v : '');
      if (i === lastNew) cls += ' new';
      if (ws.has(i)) cls += ' win';
      if (!v && c === sel && r === ghostRow) cls += ' ghost';
      cells[i].className = cls;
    }
    lastNew = -1;
    colBtns.forEach((b, c) => {
      b.disabled = phase !== 'player' || board[0][c] !== 0;
      b.classList.toggle('sel', phase === 'player' && c === sel);
    });
    el.score.textContent = '🔴' + wins[0] + ' − ' + wins[1] + '🟡';
    el.round.textContent = 'ラウンド' + round;
    const left = SPIN_EVERY - (placed % SPIN_EVERY);
    el.spin.textContent = '🔄 あと' + left + '手';
    el.spin.classList.toggle('soon', left === 1);
  }

  function startMatch() {
    token++; timers.splice(0).forEach(clearTimeout);
    initAudio();
    wins = [0, 0]; round = 0; firstPlayer = 2;
    el.intro.classList.add('hidden'); el.result.classList.add('hidden');
    el.board.classList.remove('spin');
    nextRound();
  }
  function nextRound() {
    round++; board = empty(); placed = 0; sel = 2;
    firstPlayer = firstPlayer === 1 ? 2 : 1; // ラウンドごとに先手交代(最初はあなた)
    turn(firstPlayer);
  }
  function turn(who) {
    if (isFull(board)) return endRound(0, []);
    if (who === 1) {
      phase = 'player';
      if (board[0][sel]) sel = board[0].findIndex(v => !v);
      const left = SPIN_EVERY - (placed % SPIN_EVERY);
      el.info.textContent = left === 1 ? '🔴 あなたの番!この1手のあと🔄回転するよ' : '🔴 あなたの番!列をえらんでね';
      render();
    } else {
      phase = 'busy';
      el.info.textContent = '🟡 ロボが かんがえ中…';
      render();
      later(() => {
        const careless = Math.random() < (round === 1 ? 0.35 : 0.18);
        place(aiPick(board, placed, careless), 2);
      }, 650);
    }
  }
  function playerDrop(c) {
    if (phase !== 'player' || dropRow(board, c) < 0) { if (phase === 'player') render(); return; }
    place(c, 1);
  }
  function place(c, who) {
    phase = 'busy';
    const r = dropRow(board, c);
    if (r < 0) return turn(who);
    board[r][c] = who; placed++; lastNew = r * N + c;
    beep(who === 1 ? 520 : 390, 0.12, 'triangle');
    const res = judge(board);
    if (res) { render(winCells(board, res)); return endRound(res, winCells(board, res)); }
    if (placed % SPIN_EVERY === 0) {
      // 表示だけ「あと0手」にならないよう回転演出へ
      render();
      el.spin.textContent = '🔄 かいてん!'; el.spin.classList.add('soon');
      el.info.textContent = '🔄 ぐるっと かいてん!';
      later(() => { el.board.classList.add('spin'); beep(300, 0.5, 'sawtooth'); beep(450, 0.3, 'sawtooth', 0.3); }, 350);
      later(() => {
        el.board.classList.remove('spin');
        board = rotate(board);
        const rr = judge(board);
        if (rr) {
          const wl = rr === 3 ? winCells(board, 1).concat(winCells(board, 2)) : winCells(board, rr);
          render(wl); endRound(rr, wl);
        } else { render(); later(() => turn(3 - who), 350); }
      }, 1000);
    } else {
      render();
      later(() => turn(3 - who), 250);
    }
  }
  function endRound(res, winList) {
    phase = 'over';
    render(winList);
    if (res === 1) { wins[0]++; el.info.textContent = '🎉 4つそろった!このラウンドは あなたの勝ち'; beep(660, 0.15, 'square'); beep(880, 0.3, 'square', 0.15); }
    else if (res === 2) { wins[1]++; el.info.textContent = '😵 ロボに そろえられた…'; beep(220, 0.4, 'sawtooth'); }
    else if (res === 3) el.info.textContent = '😲 どうじに そろった!ひきわけ(やりなおし)';
    else el.info.textContent = '🤝 ばんめんが いっぱい!ひきわけ(やりなおし)';
    render(winList);
    if (wins[0] >= WIN_ROUNDS || wins[1] >= WIN_ROUNDS) later(showResult, 1800);
    else later(nextRound, 2200);
  }
  function showResult() {
    const won = wins[0] >= WIN_ROUNDS;
    el.rTitle.textContent = won ? '🏆 ゆうしょう!' : '🤖 ロボの勝ち…';
    el.rText.textContent = (won
      ? (wins[1] === 0 ? 'ストレート勝ち!回転の先読みは かんぺきだね。' : 'せり勝った!回転をうまく使えたね。')
      : '回転のあとに そろう形を先に作ると勝ちやすいよ。もう1回!')
      + '(' + wins[0] + '勝 ' + wins[1] + '敗 / ' + round + 'ラウンド)';
    el.result.classList.remove('hidden');
  }

  document.addEventListener('keydown', e => {
    if (phase !== 'player') return;
    const free = c => board[0][c] === 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      for (let k = 1; k <= N; k++) { const c = (sel + d * k + N * N) % N; if (free(c)) { sel = c; break; } }
      e.preventDefault(); render();
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      if (e.target && e.target.tagName === 'BUTTON' && e.key !== 'ArrowDown') return; // ボタンのclickにまかせる
      e.preventDefault(); playerDrop(sel);
    } else if (/^[1-6]$/.test(e.key)) {
      sel = +e.key - 1; playerDrop(sel);
    }
  });
  $('startBtn').addEventListener('click', startMatch);
  $('againBtn').addEventListener('click', startMatch);

  // 初期表示(説明画面のうしろの盤面)
  board = empty(); placed = 0; round = 1; wins = [0, 0];
  render();
})();
