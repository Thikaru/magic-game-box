(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var CW = canvas.width;   // 320
  var CH = canvas.height;  // 360
  var GROUND_Y = 300;

  var PLAYER_X = 46;
  var PLAYER_W = 26;
  var PLAYER_H = 30;

  var GRAVITY = 1500;       // px/s^2
  var JUMP_MIN = 300;       // px/s (tap)
  var JUMP_MAX = 620;       // px/s (full charge)
  var CHARGE_MAX_TIME = 0.9; // seconds to reach full charge

  var SPEED_BASE = 190;
  var SPEED_MAX = 330;
  var SPAWN_BASE = 1.75;
  var SPAWN_MIN = 1.05;

  var LIVES_START = 3;
  var HIT_INVULN = 0.5;

  var livesLabel = document.getElementById('livesLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var distLabel = document.getElementById('distLabel');
  var chargeBar = document.getElementById('chargeBar');
  var jumpBtn = document.getElementById('jumpBtn');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type, peak, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak || 0.2, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sndJump(power) {
    var ratio = (power - JUMP_MIN) / (JUMP_MAX - JUMP_MIN);
    beep(320 + ratio * 260, 0.14, 'square', 0.14);
  }
  function sndClear() { beep(680, 0.1, 'sine', 0.12); beep(880, 0.12, 'sine', 0.1, 0.06); }
  function sndCoin() { beep(1040, 0.08, 'triangle', 0.14); beep(1320, 0.1, 'triangle', 0.12, 0.05); }
  function sndHit() { beep(180, 0.22, 'sawtooth', 0.18); }
  function sndGameOver() {
    beep(300, 0.18, 'sawtooth', 0.16);
    beep(230, 0.18, 'sawtooth', 0.16, 0.14);
    beep(160, 0.3, 'sawtooth', 0.16, 0.28);
  }

  var state = null;

  function freshState() {
    return {
      running: false,
      over: false,
      distance: 0,
      score: 0,
      combo: 0,
      lives: LIVES_START,
      speed: SPEED_BASE,
      spawnTimer: 1.1,
      spawnInterval: SPAWN_BASE,
      coinTimer: 3.5,
      obstacles: [],
      coins: [],
      playerH: 0,      // height above ground
      playerVy: 0,
      charging: false,
      chargeT: 0,
      invuln: 0,
      shake: 0
    };
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnObstacle() {
    var s = state;
    var difficulty = Math.min(1, s.distance / 6000);
    var w = 30;
    var type = Math.random() < 0.5 ? 'hurdle' : 'gate';
    var ob = { type: type, x: CW + 10, w: w, hit: false, passed: false };
    if (type === 'hurdle') {
      ob.h = 14 + difficulty * 10 + Math.random() * 4; // 14~28
    } else {
      var half = Math.max(20, 40 - difficulty * 20);
      var center = rand(half + 40, 128 - half - 8);
      ob.ymin = center - half;
      ob.ymax = center + half;
    }
    s.obstacles.push(ob);
  }

  function spawnCoin() {
    var s = state;
    var y = rand(50, 110);
    s.coins.push({ x: CW + 10, y: y, r: 10, got: false });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 700);
  }

  function startCharge() {
    if (!state || state.over || !state.running) return;
    if (state.playerH > 0.5) return; // airborne, ignore
    if (state.charging) return;
    ensureAudio();
    state.charging = true;
    state.chargeT = 0;
    jumpBtn.classList.add('pressed');
  }

  function releaseCharge() {
    if (!state || state.over || !state.running) return;
    if (!state.charging) return;
    state.charging = false;
    jumpBtn.classList.remove('pressed');
    if (state.playerH > 0.5) { state.chargeT = 0; return; }
    var ratio = Math.min(1, state.chargeT / CHARGE_MAX_TIME);
    var power = JUMP_MIN + ratio * (JUMP_MAX - JUMP_MIN);
    state.playerVy = power;
    state.playerH = 0.01;
    sndJump(power);
    state.chargeT = 0;
  }

  function aabbOverlap(l1, r1, t1, b1, l2, r2, t2, b2) {
    return l1 < r2 && r1 > l2 && t1 < b2 && b1 > t2;
  }

  function update(dt) {
    var s = state;
    if (!s.running || s.over) return;

    s.distance += s.speed * dt;
    s.speed = Math.min(SPEED_MAX, SPEED_BASE + s.distance * 0.018);
    s.spawnInterval = Math.max(SPAWN_MIN, SPAWN_BASE - s.distance * 0.00055);
    s.score += dt * s.speed * 0.04;

    if (s.invuln > 0) s.invuln -= dt;
    if (s.shake > 0) s.shake -= dt;

    // charging
    if (s.charging) {
      s.chargeT += dt;
      if (s.chargeT > CHARGE_MAX_TIME + 0.5) s.chargeT = CHARGE_MAX_TIME + 0.5;
    }

    // physics
    if (s.playerH > 0 || s.playerVy > 0) {
      s.playerVy -= GRAVITY * dt;
      s.playerH += s.playerVy * dt;
      if (s.playerH <= 0) {
        s.playerH = 0;
        s.playerVy = 0;
      }
    }

    // spawn obstacles
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      spawnObstacle();
      s.spawnTimer = s.spawnInterval;
    }
    s.coinTimer -= dt;
    if (s.coinTimer <= 0) {
      spawnCoin();
      s.coinTimer = rand(3.2, 5.5);
    }

    // player box
    var pBottom = GROUND_Y - s.playerH;
    var pTop = pBottom - PLAYER_H;
    var pLeft = PLAYER_X;
    var pRight = PLAYER_X + PLAYER_W;

    // obstacles
    for (var i = s.obstacles.length - 1; i >= 0; i--) {
      var ob = s.obstacles[i];
      ob.x -= s.speed * dt;

      if (!ob.hit && s.invuln <= 0) {
        var hitNow = false;
        if (ob.type === 'hurdle') {
          var oTop = GROUND_Y - ob.h;
          if (aabbOverlap(pLeft, pRight, pTop, pBottom, ob.x, ob.x + ob.w, oTop, GROUND_Y)) hitNow = true;
        } else {
          var wallTop = GROUND_Y - ob.ymin;
          var ceilBottom = GROUND_Y - ob.ymax;
          if (aabbOverlap(pLeft, pRight, pTop, pBottom, ob.x, ob.x + ob.w, wallTop, GROUND_Y)) hitNow = true;
          if (aabbOverlap(pLeft, pRight, pTop, pBottom, ob.x, ob.x + ob.w, 0, ceilBottom)) hitNow = true;
        }
        if (hitNow) {
          ob.hit = true;
          onHit();
        }
      }

      if (!ob.passed && !ob.hit && ob.x + ob.w < pLeft) {
        ob.passed = true;
        onClear();
      }

      if (ob.x + ob.w < -20) s.obstacles.splice(i, 1);
    }

    // coins
    for (var j = s.coins.length - 1; j >= 0; j--) {
      var c = s.coins[j];
      c.x -= s.speed * dt;
      if (!c.got) {
        var cLeft = c.x - c.r, cRight = c.x + c.r, cTop = GROUND_Y - c.y - c.r, cBottom = GROUND_Y - c.y + c.r;
        if (aabbOverlap(pLeft, pRight, pTop, pBottom, cLeft, cRight, cTop, cBottom)) {
          c.got = true;
          s.score += 15;
          sndCoin();
          showToast('🪙 +15');
        }
      }
      if (c.x < -20) s.coins.splice(j, 1);
    }

    if (s.lives <= 0 && !s.over) {
      endGame();
    }
  }

  function onHit() {
    var s = state;
    s.lives -= 1;
    s.combo = 0;
    s.invuln = HIT_INVULN;
    s.shake = 0.25;
    sndHit();
    showToast('ダメージ!');
    if (s.lives <= 0) {
      endGame();
    }
  }

  function onClear() {
    var s = state;
    s.combo += 1;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;
    var mult = 1 + Math.min(s.combo - 1, 9) * 0.15;
    s.score += Math.round(10 * mult);
  }

  function endGame() {
    var s = state;
    s.over = true;
    s.running = false;
    sndGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '距離 ' + Math.floor(s.distance / 10) + 'm 走破 / スコア ' + Math.floor(s.score) +
      ' / 最大コンボ ' + s.maxCombo + '連';
    resultEl.classList.remove('hidden');
  }

  function render() {
    var s = state;
    ctx.save();
    ctx.clearRect(0, 0, CW, CH);

    var shakeX = s.shake > 0 ? (Math.random() - 0.5) * 8 * (s.shake / 0.25) : 0;
    ctx.translate(shakeX, 0);

    // sky decorations
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (var k = 0; k < 4; k++) {
      var sx = ((k * 97 + (s.distance * 0.15)) % (CW + 40)) - 20;
      ctx.beginPath();
      ctx.arc(CW - sx, 40 + k * 22, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ground
    ctx.fillStyle = '#3a2e1e';
    ctx.fillRect(0, GROUND_Y, CW, CH - GROUND_Y);
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    var groundOffset = (s.distance * 1) % 24;
    for (var gx = -groundOffset; gx < CW; gx += 24) {
      ctx.fillRect(gx, GROUND_Y, 12, 4);
    }

    // obstacles
    for (var i = 0; i < s.obstacles.length; i++) {
      var ob = s.obstacles[i];
      if (ob.type === 'hurdle') {
        var oTop = GROUND_Y - ob.h;
        ctx.fillStyle = ob.hit ? '#7a5030' : '#c9784a';
        ctx.fillRect(ob.x, oTop, ob.w, GROUND_Y - oTop);
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        ctx.strokeRect(ob.x, oTop, ob.w, GROUND_Y - oTop);
      } else {
        var wallTop = GROUND_Y - ob.ymin;
        var ceilBottom = GROUND_Y - ob.ymax;
        ctx.fillStyle = ob.hit ? '#6b3550' : '#8a4a9c';
        ctx.fillRect(ob.x, wallTop, ob.w, GROUND_Y - wallTop);
        ctx.fillStyle = ob.hit ? '#7a2c2c' : '#ff6b4a';
        ctx.fillRect(ob.x, 0, ob.w, ceilBottom);
        // spike teeth on ceiling edge
        ctx.beginPath();
        for (var tx = ob.x; tx < ob.x + ob.w; tx += 8) {
          ctx.moveTo(tx, ceilBottom);
          ctx.lineTo(tx + 4, ceilBottom + 8);
          ctx.lineTo(tx + 8, ceilBottom);
        }
        ctx.fill();
      }
    }

    // coins
    for (var j = 0; j < s.coins.length; j++) {
      var c = s.coins[j];
      if (c.got) continue;
      var cy = GROUND_Y - c.y;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪙', c.x, cy);
    }

    // player
    var pBottom = GROUND_Y - s.playerH;
    var flashOn = s.invuln > 0 && Math.floor(s.invuln * 20) % 2 === 0;
    ctx.globalAlpha = flashOn ? 0.4 : 1;
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🏃', PLAYER_X + PLAYER_W / 2, pBottom + 2);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function loop(ts) {
    if (!state) return;
    if (!loop.last) loop.last = ts;
    var dt = Math.min(0.05, (ts - loop.last) / 1000);
    loop.last = ts;

    update(dt);
    render();

    // HUD
    scoreLabel.textContent = 'SCORE ' + Math.floor(state.score);
    distLabel.textContent = '距離 ' + Math.floor(state.distance / 10) + 'm';
    livesLabel.textContent = '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(LIVES_START - Math.max(0, state.lives));
    var chargeRatio = state.charging ? Math.min(1, state.chargeT / CHARGE_MAX_TIME) : 0;
    chargeBar.style.width = (chargeRatio * 100) + '%';

    if (state.running) requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = freshState();
    state.maxCombo = 0;
    state.running = true;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    loop.last = null;
    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  jumpBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); startCharge(); });
  jumpBtn.addEventListener('pointerup', function (e) { e.preventDefault(); releaseCharge(); });
  jumpBtn.addEventListener('pointerleave', function (e) { if (state && state.charging) releaseCharge(); });
  jumpBtn.addEventListener('pointercancel', function (e) { if (state && state.charging) releaseCharge(); });
  jumpBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!introEl.classList.contains('hidden')) { startGame(); return; }
      if (!resultEl.classList.contains('hidden')) { startGame(); return; }
      startCharge();
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      releaseCharge();
    }
  });
})();
