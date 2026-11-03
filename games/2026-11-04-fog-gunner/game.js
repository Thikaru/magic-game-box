(() => {
  'use strict';
  const N = 5, MAX_WAVE = 8;
  const DIRS = [[0, -1, '⬆'], [1, 0, '➡'], [0, 1, '⬇'], [-1, 0, '⬅']];
  const $ = id => document.getElementById(id);
  const el = { wave: $('wave'), lives: $('lives'), ammo: $('ammo'), score: $('score'), info: $('info'), bar: $('bar'),
    grid: $('grid'), intro: $('intro'), result: $('result'), rTitle: $('rTitle'), rText: $('rText') };
  let wave, lives, score, ammo, enemies, phase, timer, token;
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.className = 'cell'; b.type = 'button';
    b.addEventListener('click', () => shoot(i));
    el.grid.appendChild(b); cells.push(b);
  }

  function hud() {
    el.wave.textContent = 'WAVE ' + wave;
    el.lives.textContent = '❤'.repeat(lives) + '🖤'.repeat(3 - lives);
    el.ammo.textContent = 'たま ' + ammo;
    el.score.textContent = score + '点';
  }
  function clearCells() { cells.forEach(c => { c.textContent = ''; c.className = 'cell'; }); }

  function genEnemies(n) {
    for (let t = 0; t < 200; t++) {
      const list = [], from = new Set(), to = new Set();
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        let placed = false;
        for (let u = 0; u < 60 && !placed; u++) {
          const x = Math.floor(Math.random() * N), y = Math.floor(Math.random() * N);
          const d = DIRS[Math.floor(Math.random() * 4)];
          const tx = x + d[0], ty = y + d[1];
          if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
          const a = y * N + x, b = ty * N + tx;
          if (from.has(a) || from.has(b) || to.has(a) || to.has(b)) continue;
          from.add(a); to.add(b);
          list.push({ from: a, to: b, arrow: d[2], alive: true });
          placed = true;
        }
        if (!placed) ok = false;
      }
      if (ok) return list;
    }
    return [];
  }

  function startWave() {
    const n = Math.min(2 + wave, 9);
    enemies = genEnemies(n);
    ammo = enemies.length + 1;
    phase = 'show';
    const my = ++token;
    clearCells();
    enemies.forEach(e => { cells[e.from].textContent = '👾'; const s = document.createElement('small'); s.textContent = e.arrow; cells[e.from].appendChild(s); });
    el.grid.classList.remove('fog');
    el.info.textContent = '👀 おばけとやじるしをおぼえて!';
    hud();
    const dur = 1500 + 450 * enemies.length;
    const t0 = performance.now();
    (function tick() {
      if (my !== token) return;
      const p = Math.min(1, (performance.now() - t0) / dur);
      el.bar.style.width = (100 - p * 100) + '%';
      if (p < 1) timer = requestAnimationFrame(tick); else fog();
    })();
  }

  function fog() {
    phase = 'aim';
    clearCells();
    el.grid.classList.add('fog');
    el.bar.style.width = '0';
    el.info.textContent = '🌫 きり! すすんだ先をタップして砲撃!(' + enemies.length + '体)';
  }

  function shoot(i) {
    if (phase !== 'aim' || cells[i].classList.contains('done')) return;
    const e = enemies.find(x => x.alive && x.to === i);
    cells[i].classList.add('done');
    if (e) {
      e.alive = false; score += 100 + 20 * wave;
      cells[i].textContent = '💥';
    } else {
      ammo--; cells[i].textContent = '💨';
    }
    hud();
    if (!enemies.some(x => x.alive)) return endWave(true);
    if (ammo <= 0) return endWave(false);
    const left = enemies.filter(x => x.alive).length;
    el.info.textContent = '🎯 のこり ' + left + '体';
  }

  function endWave(win) {
    phase = 'wait';
    const my = token;
    if (win) {
      score += ammo * 50;
      el.info.textContent = '✨ ぜんめつ! のこりたまボーナス +' + ammo * 50;
    } else {
      lives--;
      enemies.filter(x => x.alive).forEach(e => { cells[e.to].textContent = '👾'; cells[e.to].classList.add('ghost'); });
      el.info.textContent = '💦 たま切れ…おばけはここにいた!ライフ-1';
    }
    hud();
    setTimeout(() => {
      if (my !== token) return;
      if (lives <= 0) return finish(false);
      if (win && wave >= MAX_WAVE) return finish(true);
      if (win) wave++;
      startWave();
    }, 1800);
  }

  function finish(clear) {
    phase = 'over'; token++;
    el.rTitle.textContent = clear ? '🎉 きりをはらした!' : 'ゲームオーバー';
    el.rText.textContent = (clear ? 'WAVE 8 までぜんめつ! ' : 'WAVE ' + wave + ' まで到達。 ') + 'スコア: ' + score + '点';
    el.result.classList.remove('hidden');
  }

  function begin() {
    wave = 1; lives = 3; score = 0; token++;
    el.intro.classList.add('hidden'); el.result.classList.add('hidden');
    startWave();
  }
  $('startBtn').addEventListener('click', begin);
  $('againBtn').addEventListener('click', begin);
  hud();
})();
