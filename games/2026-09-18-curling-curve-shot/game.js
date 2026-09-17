(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var heartsEl = document.getElementById('hearts');
  var levelLabel = document.getElementById('levelLabel');
  var comboLabel = document.getElementById('comboLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultDetailEl = document.getElementById('resultDetail');
  var finalScoreEl = document.getElementById('finalScore');
  var flashMsg = document.getElementById('flashMsg');
  var curlBtns = Array.prototype.slice.call(document.querySelectorAll('.curlBtn'));

  var LAUNCH = { x: W / 2, y: H - 40 };
  var WALL_MARGIN = 16;
  var HOG_LINE_Y = 292;
  var BACK_LINE_Y = 20;
  var STONE_R = 10;
  var GUARD_R = 13;
  var MAX_PULL = 130;
  var MAX_SPEED = 260;
  var FRICTION_BASE = 70;
  var CURL_ACCEL_BASE = 35;
  var STOP_EPS = 5;
  var HOUSE_BASE = { outer: 50, mid: 34, inner: 18, button: 8 };

  var running = false;
  var state = 'idle'; // idle | aim | flying | resolved
  var lives = 3, score = 0, combo = 0, successCount = 0, maxCombo = 0;
  var curlDir = 0;
  var isBonusEnd = false, houseGolden = false;
  var house = { x: W / 2, y: 78, scale: 1 };
  var guards = [];
  var stone = { x: LAUNCH.x, y: LAUNCH.y, vx: 0, vy: 0 };
  var trail = [];
  var aim = { dx: 0, dy: 0 };
  var dragging = false;
  var kbAngleDeg = -90; // straight up
  var kbPower = 0.6;
  var lastTs = 0;
  var previewPath = [];

  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }
  function beep(freq, dur, type, gainVal, delay) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = gainVal || 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    gain.gain.setValueAtTime(gainVal || 0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  }
  function sfxThrow() { beep(180, 0.12, 'triangle', 0.05); }
  function sfxRing(tier) {
    var f = tier === 50 ? 1100 : tier === 30 ? 880 : tier === 20 ? 660 : 500;
    beep(f, 0.14, 'square', 0.06);
    beep(f * 1.5, 0.16, 'sine', 0.05, 0.05);
  }
  function sfxGolden() { beep(1200, 0.1, 'square', 0.06); beep(1600, 0.14, 'sine', 0.06, 0.06); beep(2000, 0.18, 'sine', 0.05, 0.12); }
  function sfxMiss() { beep(200, 0.16, 'sawtooth', 0.05); }
  function sfxBonus() { beep(700, 0.08, 'sine', 0.05); beep(900, 0.08, 'sine', 0.05, 0.08); beep(1100, 0.12, 'sine', 0.05, 0.16); }
  function sfxGameOver() { beep(220, 0.12, 'sawtooth', 0.05); beep(140, 0.32, 'sawtooth', 0.05, 0.1); }

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  function level() { return 1 + successCount; }
  function frictionMult() { return Math.min(1.3, 1 + successCount * 0.02); }
  function curlAccel() { return CURL_ACCEL_BASE; }
  function houseScale() { return isBonusEnd ? Math.min(1.15, 1 - successCount * 0.035 + 0.35) : Math.max(0.55, 1 - successCount * 0.035); }
  function guardCount() { return isBonusEnd ? 0 : Math.min(4, 1 + Math.floor(successCount / 2)); }

  function setupEnd() {
    isBonusEnd = successCount > 0 && successCount % 5 === 0 && lastEndWasSuccess;
    houseGolden = !isBonusEnd && level() >= 2 && Math.random() < 0.16;
    var maxOffset = Math.min(46, successCount * 4);
    house.x = W / 2 + rand(-1, 1) * maxOffset;
    house.y = 78;
    house.scale = houseScale();

    guards = [];
    var gCount = guardCount();
    var tries = 0;
    while (guards.length < gCount && tries < 200) {
      tries++;
      var gx = rand(WALL_MARGIN + GUARD_R + 4, W - WALL_MARGIN - GUARD_R - 4);
      var gy = rand(house.y + HOUSE_BASE.outer * house.scale + 26, HOG_LINE_Y - 46);
      var okHouse = dist(gx, gy, house.x, house.y) > HOUSE_BASE.outer * house.scale + GUARD_R + 18;
      var okOthers = true;
      for (var i = 0; i < guards.length; i++) {
        if (dist(gx, gy, guards[i].x, guards[i].y) < GUARD_R * 2 + 20) { okOthers = false; break; }
      }
      if (okHouse && okOthers) guards.push({ x: gx, y: gy });
    }

    stone.x = LAUNCH.x; stone.y = LAUNCH.y; stone.vx = 0; stone.vy = 0;
    trail = [];
    previewPath = [];
    updateKbAim();
    state = 'aim';
  }

  var lastEndWasSuccess = false;

  function clampAngle() {
    if (kbAngleDeg < -175) kbAngleDeg = -175;
    if (kbAngleDeg > -5) kbAngleDeg = -5;
  }
  function setAimFromVector(dx, dy) {
    var mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > MAX_PULL) { dx = dx / mag * MAX_PULL; dy = dy / mag * MAX_PULL; }
    if (dy > -6) dy = -6; // always aim generally upward
    aim.dx = dx; aim.dy = dy;
    updatePreview();
  }
  function updateKbAim() {
    var rad = kbAngleDeg * Math.PI / 180;
    var pullMag = kbPower * MAX_PULL;
    setAimFromVector(Math.cos(rad) * pullMag, Math.sin(rad) * pullMag);
  }

  function simFriction() { return FRICTION_BASE * frictionMult(); }

  function integrate(s, dt, curl) {
    var speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 0.01) {
      s.vx += curl * curlAccel() * dt;
      speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      var decel = simFriction() * dt;
      var newSpeed = Math.max(0, speed - decel);
      var k = newSpeed / speed;
      s.vx *= k; s.vy *= k;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    return Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  }

  function updatePreview() {
    previewPath = [];
    var mag = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy);
    if (mag < 8) return;
    var k = MAX_SPEED / MAX_PULL;
    var s = { x: LAUNCH.x, y: LAUNCH.y, vx: aim.dx * k, vy: aim.dy * k };
    var dt = 1 / 40;
    for (var i = 0; i < 260; i++) {
      var speed = integrate(s, dt, curlDir);
      if (i % 3 === 0) previewPath.push({ x: s.x, y: s.y });
      if (speed <= STOP_EPS) break;
      if (s.x < WALL_MARGIN || s.x > W - WALL_MARGIN || s.y < BACK_LINE_Y) break;
      var hitGuard = false;
      for (var j = 0; j < guards.length; j++) {
        if (dist(s.x, s.y, guards[j].x, guards[j].y) <= GUARD_R + STONE_R) { hitGuard = true; break; }
      }
      if (hitGuard) break;
    }
  }

  function ringScore(x, y) {
    var d = dist(x, y, house.x, house.y);
    var sc = house.scale;
    if (d <= HOUSE_BASE.button * sc) return { pts: 50, name: 'センター!' };
    if (d <= HOUSE_BASE.inner * sc) return { pts: 30, name: 'ナイス!' };
    if (d <= HOUSE_BASE.mid * sc) return { pts: 20, name: 'セーフ' };
    if (d <= HOUSE_BASE.outer * sc) return { pts: 10, name: 'かすった' };
    return { pts: 0, name: 'ハウスをはずれた' };
  }

  function flash(text) {
    flashMsg.textContent = text;
    flashMsg.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { flashMsg.classList.remove('show'); }, 1000);
  }

  function updateHud() {
    var hearts = '';
    for (var i = 0; i < 3; i++) hearts += (i < lives ? '♥' : '♡');
    heartsEl.textContent = hearts;
    levelLabel.textContent = level();
    comboLabel.textContent = combo;
    scoreLabel.textContent = score;
  }

  function launchStone() {
    if (state !== 'aim') return;
    var mag = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy);
    if (mag < 14) return;
    var k = MAX_SPEED / MAX_PULL;
    stone.x = LAUNCH.x; stone.y = LAUNCH.y;
    stone.vx = aim.dx * k; stone.vy = aim.dy * k;
    trail = [];
    state = 'flying';
    sfxThrow();
  }

  function finishEnd(kind, x, y) {
    state = 'resolved';
    var success = false;
    var msg = '';
    if (kind === 'guard') {
      msg = '🪨 ガードストーンに接触!';
    } else if (kind === 'wall') {
      msg = '氷の外へそれた…';
    } else if (kind === 'long') {
      msg = 'ロング!奥まで飛びすぎた';
    } else if (kind === 'short') {
      msg = 'ショート!ホッグラインを越えられなかった';
    } else if (kind === 'stopped') {
      var r = ringScore(x, y);
      if (r.pts > 0) {
        success = true;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        var bonusMult = houseGolden ? 2 : 1;
        var bonusEndMult = isBonusEnd ? 2 : 1;
        var gained = Math.round((r.pts + level() * 2 + combo * 3) * bonusMult * bonusEndMult);
        score += gained;
        successCount++;
        if (houseGolden && lives < 3) lives++;
        msg = (isBonusEnd ? '🌟ボーナスエンド!' : '') + (houseGolden ? '⭐ゴールデン' : '') + r.name + ' +' + gained + '点';
        sfxRing(r.pts);
        if (houseGolden) sfxGolden();
        if (isBonusEnd) sfxBonus();
      } else {
        msg = r.name;
      }
    }
    lastEndWasSuccess = success;
    if (!success) {
      combo = 0;
      lives--;
      flash(msg + ' ライフ-1');
      sfxMiss();
    } else {
      flash(msg);
    }
    updateHud();
    if (lives <= 0) {
      setTimeout(function () { gameOver(); }, 1000);
    } else {
      setTimeout(function () { if (running) setupEnd(); }, 1000);
    }
  }

  function stepPhysics(dt) {
    var speed = integrate(stone, dt, curlDir);
    trail.push({ x: stone.x, y: stone.y });
    if (trail.length > 26) trail.shift();

    if (stone.x < WALL_MARGIN || stone.x > W - WALL_MARGIN) { finishEnd('wall'); return; }
    if (stone.y < BACK_LINE_Y) { finishEnd('long'); return; }
    for (var i = 0; i < guards.length; i++) {
      if (dist(stone.x, stone.y, guards[i].x, guards[i].y) <= GUARD_R + STONE_R) { finishEnd('guard'); return; }
    }
    if (speed <= STOP_EPS) {
      if (stone.y >= HOG_LINE_Y) { finishEnd('short'); return; }
      finishEnd('stopped', stone.x, stone.y);
    }
  }

  function gameOver() {
    running = false;
    resultTitleEl.textContent = 'ゲームオーバー';
    resultDetailEl.textContent = '到達レベル ' + level() + ' / 最大連続成功 ' + maxCombo;
    finalScoreEl.textContent = score + ' 点';
    sfxGameOver();
    resultEl.classList.remove('hidden');
  }

  function drawIce() {
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#123058');
    grad.addColorStop(1, '#0a1a33');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(WALL_MARGIN, 4, W - WALL_MARGIN * 2, H - 8);

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,210,63,.55)';
    ctx.beginPath(); ctx.moveTo(WALL_MARGIN, HOG_LINE_Y); ctx.lineTo(W - WALL_MARGIN, HOG_LINE_Y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,93,108,.5)';
    ctx.beginPath(); ctx.moveTo(WALL_MARGIN, BACK_LINE_Y); ctx.lineTo(W - WALL_MARGIN, BACK_LINE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,210,63,.7)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ホッグライン', WALL_MARGIN + 4, HOG_LINE_Y - 5);
  }

  function drawHouse() {
    var sc = house.scale;
    var rings = [
      { r: HOUSE_BASE.outer * sc, color: houseGolden ? '#ffe27a' : '#2f6fd6' },
      { r: HOUSE_BASE.mid * sc, color: '#eef6ff' },
      { r: HOUSE_BASE.inner * sc, color: houseGolden ? '#ffb020' : '#ff5d6c' },
      { r: HOUSE_BASE.button * sc, color: '#ffd23f' }
    ];
    for (var i = 0; i < rings.length; i++) {
      ctx.beginPath();
      ctx.arc(house.x, house.y, rings[i].r, 0, Math.PI * 2);
      ctx.fillStyle = rings[i].color;
      ctx.fill();
    }
    if (houseGolden) {
      ctx.fillStyle = '#3a2500';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⭐', house.x, house.y - HOUSE_BASE.outer * sc - 8);
    }
  }

  function drawGuards() {
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i];
      var grad = ctx.createRadialGradient(g.x - 4, g.y - 4, 1, g.x, g.y, GUARD_R);
      grad.addColorStop(0, '#c3cad9');
      grad.addColorStop(1, '#6a7690');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GUARD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a5470';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawStone(x, y, color) {
    var grad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, STONE_R);
    grad.addColorStop(0, '#dffcff');
    grad.addColorStop(1, color || '#2fd0e8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, STONE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.arc(x, y, STONE_R * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawTrail() {
    for (var i = 0; i < trail.length; i++) {
      var t = trail[i];
      ctx.globalAlpha = (i / trail.length) * 0.4;
      ctx.fillStyle = '#2fd0e8';
      ctx.beginPath();
      ctx.arc(t.x, t.y, STONE_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPreview() {
    if (previewPath.length < 2) return;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(previewPath[0].x, previewPath[0].y);
    for (var i = 1; i < previewPath.length; i++) ctx.lineTo(previewPath[i].x, previewPath[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawIce();
    drawHouse();
    drawGuards();
    drawTrail();
    if (state === 'aim') drawPreview();
    var sx = (state === 'flying' || state === 'resolved') ? stone.x : LAUNCH.x;
    var sy = (state === 'flying' || state === 'resolved') ? stone.y : LAUNCH.y;
    drawStone(sx, sy);
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 1 / 30);
    lastTs = ts;
    if (running && state === 'flying') stepPhysics(dt);
    render();
    requestAnimationFrame(loop);
  }

  function getCanvasPos(evt) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (evt.touches && evt.touches.length) { clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY; }
    else { clientX = evt.clientX; clientY = evt.clientY; }
    var scaleX = W / rect.width, scaleY = H / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }
  function updateDrag(e) {
    var pos = getCanvasPos(e);
    setAimFromVector(pos.x - LAUNCH.x, pos.y - LAUNCH.y);
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!running || state !== 'aim') return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    updateDrag(e);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    updateDrag(e);
  });
  canvas.addEventListener('pointerup', function () {
    if (!dragging) return;
    dragging = false;
    launchStone();
  });
  canvas.addEventListener('pointercancel', function () { dragging = false; });

  function setCurl(dir) {
    curlDir = dir;
    curlBtns.forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-curl')) === dir);
    });
    if (state === 'aim') updatePreview();
  }
  curlBtns.forEach(function (b) {
    b.addEventListener('click', function () { setCurl(Number(b.getAttribute('data-curl'))); });
  });

  window.addEventListener('keydown', function (e) {
    if (!running) return;
    if (e.key === '1') { setCurl(-1); return; }
    if (e.key === '2') { setCurl(0); return; }
    if (e.key === '3') { setCurl(1); return; }
    if (state !== 'aim') return;
    if (e.key === 'ArrowLeft') { kbAngleDeg -= 3; clampAngle(); updateKbAim(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { kbAngleDeg += 3; clampAngle(); updateKbAim(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { kbPower = Math.min(1, kbPower + 0.04); updateKbAim(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { kbPower = Math.max(0.2, kbPower - 0.04); updateKbAim(); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); launchStone(); }
  });

  function startGame() {
    ensureAudio();
    lives = 3; score = 0; combo = 0; successCount = 0; maxCombo = 0;
    lastEndWasSuccess = false;
    setCurl(0);
    kbAngleDeg = -90; kbPower = 0.6;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    running = true;
    updateHud();
    setupEnd();
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);

  updateHud();
  requestAnimationFrame(loop);
})();
