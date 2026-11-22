// うって育てる!みずでっぽうガーデン
// 育成×シューティング: 虫を撃つ水が、そのまま花の水やりにもなる。
(() => {
  'use strict';
  const W = 360, H = 560;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const introEl = $('intro'), resultEl = $('result');
  const hudTime = $('hudTime'), hudTank = $('hudTank'), hudScore = $('hudScore');

  const GAME_TIME = 90;
  const TANK_MAX = 10;
  const TANK_REFILL = 0.55;     // 1発ぶん回復する秒数
  const SPLASH_R = 40;          // 水しぶきの半径
  const SHOT_TIME = 0.28;       // 水が飛んでいく時間
  const POT_Y = 478;            // 花の根元のy
  const POT_X = [44, 112, 180, 248, 316];
  const WATER_PER_HIT = 30;
  const DRY = 25, WET = 80;     // ちょうどいい = DRY〜WET
  const GROW_TIME = 3.2;        // 1段階育つのにかかる秒数(ちょうどいい時)
  const FAR_Y = 200;            // これより上で倒すと とおあて
  const STAGES = ['🌱', '🌿', '🌷', '🌻'];
  const BUGS = {
    worm:  { emoji: '🐛', speed: 26, hp: 1, pts: 10 },
    hop:   { emoji: '🦗', speed: 48, hp: 1, pts: 15 },
    beetle:{ emoji: '🪲', speed: 20, hp: 2, pts: 25 },
  };

  let state = 'intro';
  let pots, bugs, shots, splashes, floaters;
  let time, tank, tankTimer, score, harvests, kills, farKills, spawnTimer;
  let sunny, sunnyLeft, nextSunny, aim, keys, lastT;
  let audioCtx = null;

  // ---------- サウンド(効果音のみ・自前生成) ----------
  function initAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    shoot: () => beep(700, 0.12, 'triangle', 0.07, -400),
    splat: () => beep(220, 0.15, 'square', 0.06, -120),
    kill: () => beep(880, 0.1, 'triangle', 0.1, 400),
    harvest: () => { beep(660, 0.12, 'sine', 0.12); setTimeout(() => beep(990, 0.18, 'sine', 0.12), 90); },
    wilt: () => beep(300, 0.4, 'sawtooth', 0.06, -200),
    empty: () => beep(120, 0.08, 'square', 0.05),
  };

  // ---------- 初期化 ----------
  function newPot(x) {
    return { x, water: 55, stage: 0, grow: 0, wilted: 0, dryT: 0, flash: 0, harvestT: 0 };
  }
  function reset() {
    pots = POT_X.map(newPot);
    bugs = []; shots = []; splashes = []; floaters = [];
    time = GAME_TIME; tank = TANK_MAX; tankTimer = 0;
    score = 0; harvests = 0; kills = 0; farKills = 0;
    spawnTimer = 1.2;
    sunny = false; sunnyLeft = 0; nextSunny = 26;
    aim = { x: W / 2, y: 260 };
    keys = {};
  }

  // ---------- 入力 ----------
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    e.preventDefault();
    const p = toCanvas(e);
    aim.x = p.x; aim.y = p.y;
    fire(p.x, p.y);
  });
  window.addEventListener('keydown', (e) => {
    if (state !== 'play') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    keys[e.key] = true;
    if (e.key === ' ' && !e.repeat) fire(aim.x, aim.y);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 5 && !e.repeat) { aim.x = POT_X[n - 1]; aim.y = POT_Y - 20; fire(aim.x, aim.y); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  function fire(x, y) {
    x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H - 30, y));
    if (tank < 1) { sfx.empty(); floaters.push({ x, y, text: 'みずぎれ!', t: 0.8, color: '#ff6b6b' }); return; }
    tank -= 1;
    shots.push({ sx: W / 2, sy: H - 18, x, y, t: 0 });
    sfx.shoot();
  }

  // ---------- ゲームロジック ----------
  function spawnBug() {
    const elapsed = GAME_TIME - time;
    const r = Math.random();
    let kind = 'worm';
    if (elapsed > 20 && r < 0.3) kind = 'hop';
    if (elapsed > 40 && r > 0.8) kind = 'beetle';
    const alive = pots.filter((p) => !p.wilted);
    const target = (alive.length ? alive : pots)[Math.floor(Math.random() * (alive.length || pots.length))];
    const def = BUGS[kind];
    bugs.push({ kind, x: 20 + Math.random() * (W - 40), y: -16, target, hp: def.hp,
      speed: def.speed * (1 + elapsed / 160), wob: Math.random() * 6, hit: 0 });
  }

  function splashAt(x, y) {
    splashes.push({ x, y, t: 0 });
    let hitBug = false;
    for (const b of bugs) {
      if (Math.hypot(b.x - x, b.y - y) < SPLASH_R + 8) {
        b.hp -= 1; b.hit = 0.15; hitBug = true;
        if (b.hp <= 0) {
          b.dead = true; kills++;
          const def = BUGS[b.kind];
          let pts = def.pts, label = '+' + pts;
          if (b.y < FAR_Y) { pts += 20; farKills++; label = 'とおあて +' + pts; }
          score += pts;
          floaters.push({ x: b.x, y: b.y, text: label, t: 0.9, color: '#ffd23f' });
          sfx.kill();
        }
      }
    }
    bugs = bugs.filter((b) => !b.dead);
    let hitPot = false;
    if (y > POT_Y - 80) {
      for (const p of pots) {
        if (p.wilted) continue;
        if (Math.abs(p.x - x) < SPLASH_R && y < POT_Y + 40) {
          p.water += WATER_PER_HIT; p.flash = 0.3; hitPot = true;
        }
      }
    }
    if (!hitBug) sfx.splat();
    return hitPot;
  }

  function wilt(p, reason) {
    p.wilted = 5; p.stage = 0; p.grow = 0; p.water = 0; p.dryT = 0;
    floaters.push({ x: p.x, y: POT_Y - 60, text: reason, t: 1.2, color: '#ff6b6b' });
    sfx.wilt();
  }

  function update(dt) {
    time -= dt;
    if (time <= 0) { time = 0; endGame(false); return; }

    // かんかん照り
    if (!sunny && GAME_TIME - time >= nextSunny) {
      sunny = true; sunnyLeft = 8; nextSunny += 30;
      floaters.push({ x: W / 2, y: 120, text: '☀️ かんかん照り!', t: 1.6, color: '#ffd23f' });
    }
    if (sunny) { sunnyLeft -= dt; if (sunnyLeft <= 0) sunny = false; }

    // 水タンク
    if (tank < TANK_MAX) {
      tankTimer += dt;
      while (tankTimer >= TANK_REFILL && tank < TANK_MAX) { tankTimer -= TANK_REFILL; tank++; }
    } else tankTimer = 0;

    // キーボードでねらいを動かす
    const sp = 240 * dt;
    if (keys.ArrowLeft) aim.x -= sp;
    if (keys.ArrowRight) aim.x += sp;
    if (keys.ArrowUp) aim.y -= sp;
    if (keys.ArrowDown) aim.y += sp;
    aim.x = Math.max(0, Math.min(W, aim.x)); aim.y = Math.max(0, Math.min(H - 30, aim.y));

    // 虫の出現
    const elapsed = GAME_TIME - time;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnBug();
      if (elapsed > 55 && Math.random() < 0.3) spawnBug();
      spawnTimer = Math.max(0.65, 1.7 - elapsed * 0.013);
    }

    // 水の弾
    for (const s of shots) {
      s.t += dt;
      if (s.t >= SHOT_TIME && !s.done) { s.done = true; splashAt(s.x, s.y); }
    }
    shots = shots.filter((s) => !s.done);

    // 虫の移動
    for (const b of bugs) {
      if (b.target.wilted) {
        const alive = pots.filter((p) => !p.wilted);
        if (alive.length) b.target = alive[Math.floor(Math.random() * alive.length)];
      }
      const tx = b.target.x, ty = POT_Y - 18;
      const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
      b.wob += dt * 6;
      b.hit = Math.max(0, b.hit - dt);
      if (d < 10) {
        b.dead = true;
        const p = b.target;
        if (!p.wilted) {
          if (p.stage > 0) {
            p.stage--; p.grow = 0;
            floaters.push({ x: p.x, y: POT_Y - 60, text: 'かじられた!', t: 1, color: '#ff6b6b' });
            sfx.splat();
          } else wilt(p, 'たべられた…');
        }
        continue;
      }
      b.x += (dx / d) * b.speed * dt + Math.sin(b.wob) * 12 * dt;
      b.y += (dy / d) * b.speed * dt;
    }
    bugs = bugs.filter((b) => !b.dead);

    // 花
    const decay = sunny ? 11 : 5;
    for (const p of pots) {
      p.flash = Math.max(0, p.flash - dt);
      if (p.wilted) {
        p.wilted -= dt;
        if (p.wilted <= 0) Object.assign(p, newPot(p.x));
        continue;
      }
      if (p.harvestT > 0) {
        p.harvestT -= dt;
        if (p.harvestT <= 0) { p.stage = 0; p.grow = 0; }
        continue;
      }
      if (p.water > 100) { wilt(p, 'みずのやりすぎ!'); continue; }
      p.water = Math.max(0, p.water - decay * dt);
      if (p.water <= 0) {
        p.dryT += dt;
        if (p.dryT > 2.5) { wilt(p, 'からからに…'); continue; }
      } else p.dryT = 0;
      if (p.water >= DRY && p.water <= WET) {
        p.grow += dt;
        if (p.grow >= GROW_TIME) {
          p.grow = 0; p.stage++;
          if (p.stage >= 3) {
            p.stage = 3; harvests++;
            const pts = 100;
            score += pts; p.harvestT = 0.9;
            floaters.push({ x: p.x, y: POT_Y - 70, text: '🌻しゅうかく +' + pts, t: 1.2, color: '#8be07a' });
            sfx.harvest();
          }
        }
      }
    }

    if (pots.every((p) => p.wilted)) { endGame(true); return; }

    for (const s of splashes) s.t += dt;
    splashes = splashes.filter((s) => s.t < 0.4);
    for (const f of floaters) { f.t -= dt; f.y -= 30 * dt; }
    floaters = floaters.filter((f) => f.t > 0);
  }

  // ---------- 描画 ----------
  function draw() {
    // 空と地面
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (sunny) { g.addColorStop(0, '#ffcf6b'); g.addColorStop(0.6, '#9ccf6a'); }
    else { g.addColorStop(0, '#6cc3e8'); g.addColorStop(0.6, '#8fd07a'); }
    g.addColorStop(1, '#4c8a3e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // とおあてライン
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, FAR_Y); ctx.lineTo(W, FAR_Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('↑ とおあてゾーン +20', 6, FAR_Y - 6);
    // 花だん
    ctx.fillStyle = '#7a4e2d'; ctx.fillRect(0, POT_Y + 10, W, 34);
    ctx.fillStyle = '#5e3a20'; ctx.fillRect(0, POT_Y + 40, W, H - POT_Y - 40);
    if (sunny) { ctx.font = '34px serif'; ctx.textAlign = 'center'; ctx.fillText('☀️', W - 30, 40); }

    // 花
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    pots.forEach((p, i) => {
      if (p.flash > 0) {
        ctx.fillStyle = 'rgba(94,200,255,' + (p.flash * 1.6) + ')';
        ctx.beginPath(); ctx.arc(p.x, POT_Y - 18, 30, 0, Math.PI * 2); ctx.fill();
      }
      const size = p.wilted ? 30 : 24 + p.stage * 6 + (p.harvestT > 0 ? 8 : 0);
      ctx.font = size + 'px serif';
      ctx.fillText(p.wilted ? '🥀' : STAGES[p.stage], p.x, POT_Y - 8 - size / 2 + 10);
      // メーター
      const mx = p.x - 26, my = POT_Y + 18, mw = 52, mh = 9;
      ctx.fillStyle = '#e0b070'; ctx.fillRect(mx, my, mw * DRY / 100, mh);
      ctx.fillStyle = '#8be07a'; ctx.fillRect(mx + mw * DRY / 100, my, mw * (WET - DRY) / 100, mh);
      ctx.fillStyle = '#ffb3b3'; ctx.fillRect(mx + mw * WET / 100, my, mw * (100 - WET) / 100, mh);
      if (!p.wilted) {
        const wx = mx + mw * Math.min(100, p.water) / 100;
        ctx.fillStyle = '#1d5fa8'; ctx.fillRect(wx - 2, my - 3, 4, mh + 6);
        // 育ちゲージ
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(mx, my + 13, mw, 4);
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(mx, my + 13, mw * (p.stage + p.grow / GROW_TIME) / 3, 4);
        if (p.water > WET + 8 && Math.floor(performance.now() / 200) % 2) {
          ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#ff6b6b'; ctx.fillText('あふれそう!', p.x, POT_Y - 64);
        } else if (p.water < 12) {
          ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#b5651d'; ctx.fillText('のどがカラカラ', p.x, POT_Y - 64);
        }
      } else {
        ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff';
        ctx.fillText('うえなおし ' + Math.ceil(p.wilted), p.x, POT_Y - 64);
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText(String(i + 1), p.x, my + 30);
    });

    // 虫
    for (const b of bugs) {
      ctx.font = (b.kind === 'beetle' ? 28 : 24) + 'px serif';
      ctx.globalAlpha = b.hit > 0 ? 0.5 : 1;
      ctx.fillText(BUGS[b.kind].emoji, b.x, b.y);
      ctx.globalAlpha = 1;
      if (b.kind === 'beetle' && b.hp > 1) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('×2', b.x + 16, b.y - 12);
      }
    }

    // 水てっぽう(じょうろ)
    ctx.font = '30px serif'; ctx.fillText('🔫', W / 2, H - 16);

    // 弾
    for (const s of shots) {
      const k = s.t / SHOT_TIME;
      const x = s.sx + (s.x - s.sx) * k;
      const y = s.sy + (s.y - s.sy) * k - Math.sin(k * Math.PI) * 40;
      ctx.fillStyle = '#5ec8ff';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(94,200,255,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, SPLASH_R * (1 - k * 0.3), 0, Math.PI * 2); ctx.stroke();
    }
    // しぶき
    for (const s of splashes) {
      const k = s.t / 0.4;
      ctx.strokeStyle = 'rgba(94,200,255,' + (1 - k) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, SPLASH_R * (0.6 + k * 0.5), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(94,200,255,' + (0.3 * (1 - k)) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, SPLASH_R * (0.6 + k * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    // キーボード用ねらい
    if (state === 'play') {
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 10, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 16, aim.y); ctx.lineTo(aim.x + 16, aim.y);
      ctx.moveTo(aim.x, aim.y - 16); ctx.lineTo(aim.x, aim.y + 16); ctx.stroke();
    }
    // 文字
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.font = 'bold 15px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  function updateHud() {
    hudTime.textContent = '⏱ ' + Math.ceil(time);
    hudTank.textContent = '💧 ' + tank + '/' + TANK_MAX;
    hudScore.textContent = '🌻 ' + harvests + '  ★' + score;
  }

  function loop(t) {
    if (state !== 'play') return;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    update(dt);
    if (state === 'play') { draw(); updateHud(); requestAnimationFrame(loop); }
  }

  function start() {
    initAudio();
    reset();
    introEl.classList.add('hidden'); resultEl.classList.add('hidden');
    state = 'play';
    lastT = performance.now();
    updateHud();
    requestAnimationFrame(loop);
  }

  function endGame(allWilted) {
    state = 'over';
    draw(); updateHud();
    let rank, title;
    if (allWilted) { rank = '🥀'; title = 'ぜんぶかれちゃった…'; }
    else if (score >= 2200) { rank = '🏆 S'; title = 'みどりのゆびの名人!'; }
    else if (score >= 1400) { rank = '🥇 A'; title = 'りっぱな花ばたけ!'; }
    else if (score >= 700) { rank = '🥈 B'; title = 'いいかんじ!'; }
    else { rank = '🌱 C'; title = 'まだまだこれから'; }
    $('resultTitle').textContent = allWilted ? title : 'タイムアップ! ' + title;
    $('resultRank').textContent = rank;
    $('resultText').innerHTML = 'スコア <b>' + score + '</b><br>🌻 しゅうかく ' + harvests + ' 本<br>' +
      '🐛 たおした虫 ' + kills + ' ひき(とおあて ' + farKills + ')<br>' +
      '<span style="font-size:.8rem;opacity:.8">S:2200 / A:1400 / B:700</span>';
    resultEl.classList.remove('hidden');
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);

  reset();
  draw();
  updateHud();
})();
