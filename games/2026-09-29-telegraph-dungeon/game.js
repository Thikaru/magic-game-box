(() => {
  const N = 7, CELL = 50, MAXHP = 5;
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);
  const intro = $('intro'), result = $('result');
  let floor, hp, score, kills, player, stairs, rocks, enemies, hearts, running, flash, msg, msgT;

  const key = (x, y) => x + ',' + y;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const rnd = n => Math.floor(Math.random() * n);
  const isRock = (x, y) => rocks.has(key(x, y));
  const enemyAt = (x, y) => enemies.find(e => e.x === x && e.y === y);

  function reachable() {
    const seen = new Set([key(player.x, player.y)]), q = [[player.x, player.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === stairs.x && y === stairs.y) return true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (inb(nx, ny) && !rocks.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    return false;
  }

  function buildFloor() {
    for (;;) {
      player = { x: rnd(N), y: N - 1 };
      stairs = { x: rnd(N), y: rnd(2) };
      rocks = new Set();
      const nr = 5 + Math.min(floor, 7);
      while (rocks.size < nr) {
        const x = rnd(N), y = rnd(N);
        if ((x === player.x && y === player.y) || (x === stairs.x && y === stairs.y)) continue;
        rocks.add(key(x, y));
      }
      if (reachable()) break;
    }
    enemies = []; hearts = new Set();
    const ne = Math.min(1 + Math.floor(floor / 2), 5);
    let guard = 0;
    while (enemies.length < ne && guard++ < 300) {
      const x = rnd(N), y = rnd(N - 2);
      if (isRock(x, y) || enemyAt(x, y) || (x === stairs.x && y === stairs.y)) continue;
      if (Math.abs(x - player.x) + Math.abs(y - player.y) < 4) continue;
      enemies.push({ x, y, bat: floor >= 2 && Math.random() < 0.4, plan: [] });
    }
    if (hp < MAXHP && Math.random() < 0.4) {
      for (let i = 0; i < 50; i++) {
        const x = rnd(N), y = rnd(N);
        if (!isRock(x, y) && !enemyAt(x, y) && !(x === player.x && y === player.y) && !(x === stairs.x && y === stairs.y)) { hearts.add(key(x, y)); break; }
      }
    }
    enemies.forEach(replan);
  }

  function replan(e) {
    const plan = [];
    let x = e.x, y = e.y;
    for (let s = 0; s < (e.bat ? 2 : 1); s++) {
      const dx = player.x - x, dy = player.y - y;
      if (!dx && !dy) break;
      const opts = Math.abs(dx) >= Math.abs(dy)
        ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
      let moved = false;
      for (const [ox, oy] of opts) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (inb(nx, ny) && !isRock(nx, ny)) { x = nx; y = ny; plan.push([x, y]); moved = true; break; }
      }
      if (!moved) break;
    }
    e.plan = plan;
  }

  function say(t) { msg = t; clearTimeout(msgT); msgT = setTimeout(() => { msg = ''; draw(); }, 900); }

  function turn(dx, dy) {
    if (!running) return;
    if (dx || dy) {
      const nx = player.x + dx, ny = player.y + dy;
      if (!inb(nx, ny) || isRock(nx, ny)) return;
      const foe = enemyAt(nx, ny);
      if (foe) {
        enemies.splice(enemies.indexOf(foe), 1);
        kills++; score += 50; say('やっつけた! +50');
      } else {
        player.x = nx; player.y = ny;
        if (nx === stairs.x && ny === stairs.y) { nextFloor(); return; }
        if (hearts.delete(key(nx, ny))) { hp = Math.min(MAXHP, hp + 1); say('❤️ 回復!'); }
      }
    }
    let hit = false;
    for (const e of enemies) {
      for (const [tx, ty] of e.plan) {
        if (tx === player.x && ty === player.y) { hit = true; break; }
        if (enemies.some(o => o !== e && o.x === tx && o.y === ty)) break;
        e.x = tx; e.y = ty;
      }
    }
    if (hit) { hp--; flash = true; say('💥 くらった!'); setTimeout(() => { flash = false; draw(); }, 200); }
    enemies.forEach(replan);
    hud();
    if (hp <= 0) { end(); return; }
    draw();
  }

  function nextFloor() {
    score += 100; floor++;
    buildFloor(); say('B' + (floor + 1) + 'F へ!');
    hud(); draw();
  }

  function hud() {
    $('floorLabel').textContent = 'B' + (floor + 1) + 'F';
    $('scoreLabel').textContent = 'SCORE ' + score;
    $('hpLabel').textContent = '♥'.repeat(Math.max(hp, 0)) + '♡'.repeat(Math.max(3 - hp, 0));
  }

  function end() {
    running = false; draw();
    $('resultTitle').textContent = 'ゲームオーバー';
    $('resultText').innerHTML = 'B' + (floor + 1) + 'F まで到達!<br>たおした敵: ' + kills + '体<br>SCORE ' + score;
    result.classList.remove('hidden');
  }

  function start() {
    floor = 0; hp = 3; score = 0; kills = 0; msg = ''; flash = false;
    buildFloor(); running = true;
    intro.classList.add('hidden'); result.classList.add('hidden');
    hud(); draw();
  }

  function draw() {
    if (!player) return;
    ctx.clearRect(0, 0, 350, 350);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#2b1f3d' : '#33264a';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const em = (c, x, y, s) => { ctx.font = (s || 30) + 'px serif'; ctx.fillText(c, x * CELL + CELL / 2, y * CELL + CELL / 2 + 2); };
    // telegraph
    for (const e of enemies) {
      e.plan.forEach(([x, y], i) => {
        ctx.fillStyle = 'rgba(255,60,80,' + (i ? 0.3 : 0.45) + ')';
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      });
      if (e.plan.length) {
        const [lx, ly] = e.plan[e.plan.length - 1];
        ctx.strokeStyle = '#ff5d6c'; ctx.lineWidth = 3; ctx.strokeRect(lx * CELL + 3, ly * CELL + 3, CELL - 6, CELL - 6);
      }
    }
    em('🪜', stairs.x, stairs.y);
    rocks.forEach(k => { const [x, y] = k.split(',').map(Number); em('🪨', x, y); });
    hearts.forEach(k => { const [x, y] = k.split(',').map(Number); em('❤️', x, y, 26); });
    enemies.forEach(e => em(e.bat ? '🦇' : '👹', e.x, e.y));
    em(hp > 0 ? '🧙' : '💀', player.x, player.y);
    if (flash) { ctx.fillStyle = 'rgba(255,0,0,.3)'; ctx.fillRect(0, 0, 350, 350); }
    if (msg) {
      ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1a1226'; ctx.lineWidth = 4;
      ctx.strokeText(msg, 175, 22); ctx.fillText(msg, 175, 22);
    }
  }

  cv.addEventListener('pointerdown', ev => {
    if (!running) return;
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const tx = (ev.clientX - r.left) / r.width * N - (player.x + 0.5);
    const ty = (ev.clientY - r.top) / r.height * N - (player.y + 0.5);
    if (Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5) { turn(0, 0); return; }
    if (Math.abs(tx) > Math.abs(ty)) turn(Math.sign(tx), 0); else turn(0, Math.sign(ty));
  });
  document.addEventListener('keydown', ev => {
    const m = { ArrowLeft:[-1,0], a:[-1,0], ArrowRight:[1,0], d:[1,0], ArrowUp:[0,-1], w:[0,-1], ArrowDown:[0,1], s:[0,1], ' ':[0,0] }[ev.key];
    if (!m) return;
    ev.preventDefault();
    turn(m[0], m[1]);
  });
  $('waitBtn').addEventListener('click', () => turn(0, 0));
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
})();
