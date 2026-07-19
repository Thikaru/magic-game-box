(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const hpLabelEl = document.getElementById('hpLabel');
  const floorLabelEl = document.getElementById('floorLabel');
  const goldLabelEl = document.getElementById('goldLabel');
  const flashMsgEl = document.getElementById('flashMsg');
  const dpadEl = document.getElementById('dpad');
  const padToggleBtn = document.getElementById('padToggle');

  const GRID = 11;
  const CELL = 32;
  const VISION_R = 2.35;

  function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- audio (created only after a user gesture) ----
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
  }
  function beep(freq, dur, type, vol) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.08;
    osc.connect(gain).connect(actx.destination);
    const now = actx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }
  const sfxHit = () => beep(220, 0.09, 'square', 0.08);
  const sfxKill = () => { beep(520, 0.08, 'triangle', 0.08); setTimeout(() => beep(700, 0.1, 'triangle', 0.07), 70); };
  const sfxHurt = () => beep(140, 0.18, 'sawtooth', 0.09);
  const sfxGood = () => { beep(600, 0.08, 'triangle', 0.07); setTimeout(() => beep(860, 0.12, 'triangle', 0.07), 80); };
  const sfxBad = () => beep(120, 0.25, 'sawtooth', 0.1);
  const sfxStairs = () => { beep(360, 0.1, 'square', 0.07); setTimeout(() => beep(480, 0.12, 'square', 0.07), 90); setTimeout(() => beep(600, 0.14, 'square', 0.07), 180); };
  const sfxOver = () => { beep(260, 0.2, 'sawtooth', 0.09); setTimeout(() => beep(140, 0.4, 'sawtooth', 0.09), 150); };

  const MONSTER_POOL = ['スライム', 'コウモリ', 'ネズミ男', 'ゴブリン', 'スケルトン', 'ゴースト', 'オーガ', 'リッチ'];

  // ---- state ----
  let state = 'intro'; // intro | playing | over
  let map, explored, lit;
  let monsters, chests, stairs;
  let player, floor;
  let flashTimer = 0;
  let animT = 0;

  function generateFloor(floorNum) {
    map = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
    let x = Math.floor(GRID / 2), y = Math.floor(GRID / 2);
    const cx = x, cy = y;
    map[y][x] = 1;
    let carved = 1;
    const target = Math.floor(GRID * GRID * 0.5);
    let guard = 0;
    while (carved < target && guard < 6000) {
      guard++;
      const dir = randomInt(0, 3);
      if (dir === 0 && x < GRID - 1) x++;
      else if (dir === 1 && x > 0) x--;
      else if (dir === 2 && y < GRID - 1) y++;
      else if (dir === 3 && y > 0) y--;
      if (map[y][x] === 0) { map[y][x] = 1; carved++; }
    }

    // BFS distances from start
    const dist = Array.from({ length: GRID }, () => new Array(GRID).fill(-1));
    dist[cy][cx] = 0;
    const queue = [[cx, cy]];
    let qi = 0;
    while (qi < queue.length) {
      const [qx, qy] = queue[qi++];
      const d = dist[qy][qx];
      const neighbors = [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        if (map[ny][nx] !== 1 || dist[ny][nx] !== -1) continue;
        dist[ny][nx] = d + 1;
        queue.push([nx, ny]);
      }
    }

    let stairsPos = { x: cx, y: cy, d: 0 };
    const farPool = [];
    for (let yy = 0; yy < GRID; yy++) {
      for (let xx = 0; xx < GRID; xx++) {
        if (dist[yy][xx] > stairsPos.d) stairsPos = { x: xx, y: yy, d: dist[yy][xx] };
        if (dist[yy][xx] >= 3) farPool.push({ x: xx, y: yy, d: dist[yy][xx] });
      }
    }
    stairs = { x: stairsPos.x, y: stairsPos.y };

    // shuffle candidate pool
    for (let i = farPool.length - 1; i > 0; i--) {
      const j = randomInt(0, i);
      [farPool[i], farPool[j]] = [farPool[j], farPool[i]];
    }
    const used = new Set([`${cx},${cy}`, `${stairs.x},${stairs.y}`]);
    const pickTiles = (n) => {
      const picked = [];
      for (const t of farPool) {
        if (picked.length >= n) break;
        const key = `${t.x},${t.y}`;
        if (used.has(key)) continue;
        used.add(key);
        picked.push(t);
      }
      return picked;
    };

    const monsterCount = Math.min(10, 3 + floorNum);
    const chestCount = Math.min(5, 2 + Math.floor(floorNum / 2));
    const monsterTiles = pickTiles(monsterCount);
    const chestTiles = pickTiles(chestCount);

    const poolMax = Math.min(MONSTER_POOL.length - 1, Math.floor(floorNum / 1.5) + 1);
    monsters = monsterTiles.map((t) => ({
      x: t.x, y: t.y,
      name: MONSTER_POOL[randomInt(0, poolMax)],
      hp: Math.max(3, 5 + Math.floor(floorNum * 1.6) + randomInt(-1, 2)),
      atk: Math.max(1, 2 + Math.floor(floorNum * 0.7) + randomInt(-1, 1)),
    }));
    chests = chestTiles.map((t) => ({ x: t.x, y: t.y }));

    explored = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
    lit = Array.from({ length: GRID }, () => new Array(GRID).fill(false));

    return { cx, cy };
  }

  function updateVision() {
    lit = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (map[y][x] !== 1) continue;
        const d = Math.hypot(x - player.x, y - player.y);
        if (d <= VISION_R) {
          lit[y][x] = true;
          explored[y][x] = true;
          const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            lit[ny][nx] = true;
            explored[ny][nx] = true;
          }
        }
      }
    }
  }

  function updateHud() {
    hpLabelEl.textContent = 'HP ' + Math.max(player.hp, 0) + '/' + player.maxHp;
    floorLabelEl.textContent = 'B' + floor + 'F';
    goldLabelEl.textContent = '💰 ' + player.gold;
  }

  function showFlash(text, cls) {
    flashMsgEl.textContent = text;
    flashMsgEl.className = 'flashMsg ' + cls;
    flashTimer = 1.6;
  }

  function movePlayerTo(nx, ny) {
    player.x = nx; player.y = ny;
    updateVision();
    updateHud();
  }

  function monsterAt(x, y) { return monsters.find((m) => m.x === x && m.y === y); }
  function chestAt(x, y) { return chests.find((c) => c.x === x && c.y === y); }

  function resolveCombat(monster) {
    const dmg = Math.max(1, player.atk + randomInt(-1, 1));
    monster.hp -= dmg;
    sfxHit();
    if (monster.hp <= 0) {
      monsters = monsters.filter((m) => m !== monster);
      const gain = randomInt(3, 7) + floor;
      player.gold += gain;
      sfxKill();
      showFlash(`${monster.name}をたおした!+${gain}G`, 'ok');
      movePlayerTo(monster.x, monster.y);
    } else {
      const dmg2 = Math.max(1, monster.atk + randomInt(-1, 1));
      player.hp -= dmg2;
      sfxHurt();
      showFlash(`${monster.name}の反撃!-${dmg2}(のこりHP${monster.hp})`, 'bad');
      updateHud();
      if (player.hp <= 0) endGame();
    }
  }

  function openChest(x, y) {
    chests = chests.filter((c) => !(c.x === x && c.y === y));
    const r = Math.random();
    if (r < 0.38) {
      const heal = 8;
      player.hp = clamp(player.hp + heal, 0, player.maxHp);
      sfxGood();
      showFlash(`回復ポーション!HP+${heal}`, 'ok');
    } else if (r < 0.62) {
      player.atk += 1;
      sfxGood();
      showFlash('ちからの指輪!ATK+1', 'bonus');
    } else if (r < 0.8) {
      player.maxHp += 5;
      player.hp = clamp(player.hp + 5, 0, player.maxHp);
      sfxGood();
      showFlash('生命の宝珠!最大HP+5', 'bonus');
    } else {
      const dmg = randomInt(4, 7);
      player.hp -= dmg;
      sfxBad();
      showFlash(`呪いの罠だ!-${dmg}HP`, 'bad');
    }
    movePlayerTo(x, y);
    if (player.hp <= 0) endGame();
  }

  function descend() {
    floor += 1;
    const start = generateFloor(floor);
    player.x = start.cx; player.y = start.cy;
    player.hp = clamp(player.hp + 2, 0, player.maxHp);
    sfxStairs();
    showFlash(`B${floor}Fへ潜った…`, 'ok');
    updateVision();
    updateHud();
  }

  function tryMove(dx, dy) {
    if (state !== 'playing') return;
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return;
    if (map[ny][nx] !== 1) return;
    const monster = monsterAt(nx, ny);
    if (monster) { resolveCombat(monster); return; }
    if (nx === stairs.x && ny === stairs.y) { descend(); return; }
    const chest = chestAt(nx, ny);
    if (chest) { openChest(nx, ny); return; }
    movePlayerTo(nx, ny);
  }

  function endGame() {
    state = 'over';
    sfxOver();
    const score = floor * 100 + player.gold * 2;
    resultTitleEl.textContent = '力尽きた…';
    resultTextEl.innerHTML =
      '到達 <b>B' + floor + 'F</b><br>' +
      '集めた金貨 <b>' + player.gold + '</b><br>' +
      'スコア <b>' + score + '</b>';
    resultEl.classList.remove('hidden');
  }

  // ---- input: keyboard ----
  window.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); tryMove(0, -1); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); tryMove(0, 1); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); tryMove(-1, 0); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); tryMove(1, 0); }
  });

  // ---- input: dpad ----
  dpadEl.querySelectorAll('button[data-dir]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const dir = btn.getAttribute('data-dir');
      if (dir === 'up') tryMove(0, -1);
      else if (dir === 'down') tryMove(0, 1);
      else if (dir === 'left') tryMove(-1, 0);
      else if (dir === 'right') tryMove(1, 0);
    });
  });

  function coarsePointer() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }
  let padVisible = coarsePointer();
  function applyPadVisibility() {
    dpadEl.classList.toggle('hidden', !padVisible);
  }
  applyPadVisibility();
  padToggleBtn.addEventListener('click', () => {
    padVisible = !padVisible;
    applyPadVisibility();
  });

  // ---- input: tap / swipe on canvas ----
  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (!touchStart || state !== 'playing') { touchStart = null; return; }
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) {
      // treat as tap on a cell: move only if adjacent to player
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const gx = Math.floor(px / CELL);
      const gy = Math.floor(py / CELL);
      const mdx = gx - player.x, mdy = gy - player.y;
      if (Math.abs(mdx) + Math.abs(mdy) === 1) tryMove(mdx, mdy);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      tryMove(dx > 0 ? 1 : -1, 0);
    } else {
      tryMove(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  });

  // ---- render ----
  function cellColor(isWall, isLit) {
    if (isWall) return isLit ? '#3a2c66' : '#241c40';
    return isLit ? '#2c2350' : '#191430';
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d0920';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!explored[y][x]) continue;
        const isWall = map[y][x] === 0;
        const isLit = !!lit[y][x];
        ctx.globalAlpha = isLit ? 1 : 0.45;
        ctx.fillStyle = cellColor(isWall, isLit);
        ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      }
    }
    ctx.globalAlpha = 1;

    // stairs (landmark memory once discovered)
    if (explored[stairs.y] && explored[stairs.y][stairs.x]) {
      ctx.globalAlpha = lit[stairs.y][stairs.x] ? 1 : 0.55;
      ctx.font = (CELL - 8) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔻', stairs.x * CELL + CELL / 2, stairs.y * CELL + CELL / 2);
      ctx.globalAlpha = 1;
    }

    // chests & monsters only visible while lit
    ctx.font = (CELL - 8) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of chests) {
      if (!lit[c.y][c.x]) continue;
      ctx.fillText('🎁', c.x * CELL + CELL / 2, c.y * CELL + CELL / 2);
    }
    for (const m of monsters) {
      if (!lit[m.y][m.x]) continue;
      ctx.fillText('👹', m.x * CELL + CELL / 2, m.y * CELL + CELL / 2);
    }

    // player with a subtle torch flicker glow
    if (player) {
      const glow = 0.75 + Math.sin(animT * 6) * 0.08;
      const px = player.x * CELL + CELL / 2, py = player.y * CELL + CELL / 2;
      const grad = ctx.createRadialGradient(px, py, 2, px, py, CELL * 1.6);
      grad.addColorStop(0, `rgba(255,184,77,${0.35 * glow})`);
      grad.addColorStop(1, 'rgba(255,184,77,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, CELL * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = (CELL - 6) + 'px sans-serif';
      ctx.fillText('🧙', px, py);
    }
  }

  function loop(ts) {
    animT = ts / 1000;
    if (flashTimer > 0) {
      flashTimer -= 1 / 60;
      if (flashTimer <= 0) { flashMsgEl.textContent = ''; flashMsgEl.className = 'flashMsg'; }
    }
    render();
    requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    floor = 1;
    const start = generateFloor(floor);
    player = { x: start.cx, y: start.cy, hp: 20, maxHp: 20, atk: 4, gold: 0 };
    updateVision();
    updateHud();
    state = 'playing';
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    flashMsgEl.textContent = '';
    flashMsgEl.className = 'flashMsg';
    flashTimer = 0;
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  // initial idle render so the board isn't blank behind the intro overlay
  floor = 1;
  const initStart = generateFloor(floor);
  player = { x: initStart.cx, y: initStart.cy, hp: 20, maxHp: 20, atk: 4, gold: 0 };
  updateVision();
  updateHud();
  requestAnimationFrame(loop);
})();
