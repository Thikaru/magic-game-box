(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var FIELD_TOP = 50;
  var COURT_LEFT = 24, COURT_RIGHT = W - 24;
  var PADDLE_Y = H - 64;
  var SPAWN_Y = FIELD_TOP + 26;
  var BALL_R = 9;

  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var scoreLabel = document.getElementById('scoreLabel');
  var rallyLabel = document.getElementById('rallyLabel');
  var livesLabel = document.getElementById('livesLabel');

  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type, vol, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  function sfxServe() { beep(760, 0.05, 'square', 0.1); }
  function sfxHit(rally) {
    var f = 520 + Math.min(rally, 10) * 18;
    beep(f, 0.09, 'square', 0.18);
    beep(f * 1.4, 0.08, 'square', 0.12, 0.05);
  }
  function sfxMiss() { beep(220, 0.28, 'sawtooth', 0.22); }
  function sfxGolden() { beep(1200, 0.08, 'sine', 0.2); beep(1600, 0.08, 'sine', 0.18, 0.08); beep(2000, 0.12, 'sine', 0.16, 0.16); }
  function sfxBonus() { beep(660, 0.1, 'triangle', 0.15); beep(880, 0.12, 'triangle', 0.15, 0.08); }
  function sfxCurve() {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.linearRampToValueAtTime(950, t0 + 0.18);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  }
  function sfxGameOver() { beep(300, 0.2, 'sawtooth', 0.2); beep(220, 0.3, 'sawtooth', 0.2, 0.2); beep(140, 0.4, 'sawtooth', 0.2, 0.4); }

  function randRange(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  var state = 'intro'; // intro | playing | resolve | gameover
  var score = 0, rally = 0, bestRally = 0, lives = 3, successCount = 0;
  var nextIsBonus = false;
  var ball = null;
  var resolveData = null;
  var resolveTimer = null;
  var trail = [];

  var paddleX = W / 2;
  var keysDown = {};
  var lastFrameTime = 0;

  function level() { return Math.min(Math.floor(successCount / 4), 14); }
  function paddleWidth() { return Math.max(46, 84 - level() * 2.6); }

  function pickX(minSepFrom, minSep) {
    var x, tries = 0;
    do {
      x = randRange(COURT_LEFT + 34, COURT_RIGHT - 34);
      tries++;
    } while (minSepFrom !== null && Math.abs(x - minSepFrom) < minSep && tries < 40);
    return x;
  }

  function ballXAt(path, frac) {
    for (var i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      if (frac >= a.t && frac <= b.t) {
        var local = (b.t === a.t) ? 0 : (frac - a.t) / (b.t - a.t);
        return a.x + (b.x - a.x) * local;
      }
    }
    return path[path.length - 1].x;
  }

  function newBall() {
    var lv = level();
    var bonus = nextIsBonus;
    nextIsBonus = false;

    var golden = bonus || Math.random() < (0.05 + Math.min(lv * 0.004, 0.06));
    var finalX = pickX(null, 0);

    var curveChance = golden ? 0 : (lv < 2 ? 0 : Math.min(0.12 + (lv - 2) * 0.055, 0.62));
    var isCurve = Math.random() < curveChance;
    var doubleCurve = isCurve && lv >= 7 && Math.random() < 0.5;

    var path;
    if (!isCurve) {
      path = [{ t: 0, x: finalX }, { t: 1, x: finalX }];
    } else if (!doubleCurve) {
      var decoyX = pickX(finalX, 90);
      var curveT = randRange(0.4, 0.6);
      path = [{ t: 0, x: decoyX }, { t: curveT, x: decoyX }, { t: 1, x: finalX }];
    } else {
      var decoy1X = pickX(finalX, 80);
      var decoy2X = pickX(finalX, 80);
      var t1 = randRange(0.26, 0.4);
      var t2 = randRange(0.62, 0.76);
      path = [{ t: 0, x: decoy1X }, { t: t1, x: decoy1X }, { t: t2, x: decoy2X }, { t: 1, x: finalX }];
    }

    var baseTravel = Math.max(650, 1500 - lv * 65);
    var travelTime = baseTravel;
    if (bonus) travelTime = baseTravel * 1.6;
    else if (golden) travelTime = baseTravel * 1.45;

    var curveTriggers = [];
    for (var i = 1; i < path.length - 1; i++) curveTriggers.push(path[i].t);

    ball = {
      level: lv, bonus: bonus, golden: golden, finalX: finalX,
      path: path, travelTime: travelTime, spawnTime: performance.now(),
      resolved: false, curveTriggers: curveTriggers,
      curveFired: curveTriggers.map(function () { return false; })
    };
    trail = [];
    state = 'playing';
    sfxServe();
    updateHud();
  }

  function resolveBall() {
    if (!ball || ball.resolved) return;
    ball.resolved = true;
    var dist = Math.abs(paddleX - ball.finalX);
    var catchRange = paddleWidth() / 2 + BALL_R + 4;
    var success = dist <= catchRange;

    if (success) {
      successCount++;
      rally++;
      bestRally = Math.max(bestRally, rally);
      var lv = ball.level;
      var base = 12 + lv * 2;
      var mult = 1 + Math.min(Math.floor(rally / 5), 5) * 0.4;
      var gained = Math.round(base * mult);
      if (ball.bonus) gained *= 2;
      if (ball.golden) { gained += 25; lives = Math.min(3, lives + 1); }
      score += gained;
      sfxHit(rally);
      if (ball.golden) sfxGolden();
      if (rally > 0 && rally % 5 === 0) { nextIsBonus = true; sfxBonus(); }
    } else {
      rally = 0;
      lives--;
      sfxMiss();
    }

    resolveData = { success: success, golden: ball.golden };
    state = 'resolve';
    updateHud();

    if (resolveTimer) clearTimeout(resolveTimer);
    if (lives <= 0) {
      resolveTimer = setTimeout(gameOver, 850);
    } else {
      resolveTimer = setTimeout(function () {
        if (state === 'resolve') newBall();
      }, 550);
    }
  }

  function gameOver() {
    state = 'gameover';
    sfxGameOver();
    resultTitleEl.textContent = 'ゲームオーバー';
    resultTextEl.innerHTML = 'スコア: <b>' + score + '</b><br>さいだいラリー: ' + bestRally + '<br>通算返球: ' + successCount;
    resultEl.classList.remove('hidden');
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    rallyLabel.textContent = 'RALLY ' + rally;
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
  }

  function resetGame() {
    score = 0; rally = 0; bestRally = 0; lives = 3; successCount = 0; nextIsBonus = false;
    ball = null; resolveData = null; paddleX = W / 2; trail = [];
    if (resolveTimer) { clearTimeout(resolveTimer); resolveTimer = null; }
    updateHud();
  }

  startBtn.addEventListener('click', function () {
    ensureAudio();
    introEl.classList.add('hidden');
    resetGame();
    newBall();
  });
  retryBtn.addEventListener('click', function () {
    ensureAudio();
    resultEl.classList.add('hidden');
    resetGame();
    newBall();
  });

  function pointerToX(clientX) {
    var rect = canvas.getBoundingClientRect();
    var scale = W / rect.width;
    return (clientX - rect.left) * scale;
  }
  function movePaddleTo(clientX) {
    if (state !== 'playing' && state !== 'resolve') return;
    var x = pointerToX(clientX);
    paddleX = clamp(x, COURT_LEFT + paddleWidth() / 2, COURT_RIGHT - paddleWidth() / 2);
  }
  var dragging = false;
  canvas.addEventListener('pointerdown', function (e) { dragging = true; movePaddleTo(e.clientX); });
  canvas.addEventListener('pointermove', function (e) { if (dragging) movePaddleTo(e.clientX); });
  window.addEventListener('pointerup', function () { dragging = false; });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ||
        e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      keysDown[e.key] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { keysDown[e.key] = false; });

  function updateKeyboardPaddle(dt) {
    if (state !== 'playing' && state !== 'resolve') return;
    var speed = 0.34 * dt; // px per ms
    if (keysDown.ArrowLeft || keysDown.a || keysDown.A) paddleX -= speed;
    if (keysDown.ArrowRight || keysDown.d || keysDown.D) paddleX += speed;
    paddleX = clamp(paddleX, COURT_LEFT + paddleWidth() / 2, COURT_RIGHT - paddleWidth() / 2);
  }

  function drawNet(y) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(COURT_LEFT, y);
    ctx.lineTo(COURT_RIGHT, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, W, FIELD_TOP);
    ctx.fillStyle = '#f2f6ff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LEVEL ' + (level() + 1), 12, 30);
    if (ball && ball.bonus) {
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('🌟ボーナスラリー', W - 12, 30);
    }

    // court
    ctx.fillStyle = '#1c3a5e';
    ctx.fillRect(COURT_LEFT, FIELD_TOP + 6, COURT_RIGHT - COURT_LEFT, PADDLE_Y - FIELD_TOP + 24);
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(COURT_LEFT, FIELD_TOP + 6, COURT_RIGHT - COURT_LEFT, PADDLE_Y - FIELD_TOP + 24);
    drawNet(FIELD_TOP + (PADDLE_Y - FIELD_TOP) * 0.4);

    // opponent
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧑', W / 2, FIELD_TOP + 30);

    if (ball) {
      var elapsed = (state === 'playing') ? (performance.now() - ball.spawnTime) : ball.travelTime;
      var frac = clamp(elapsed / ball.travelTime, 0, 1);

      if (state === 'playing') {
        for (var k = 0; k < ball.curveTriggers.length; k++) {
          if (!ball.curveFired[k] && frac >= ball.curveTriggers[k]) {
            ball.curveFired[k] = true;
            sfxCurve();
          }
        }
      }

      var bx = ballXAt(ball.path, frac);
      var by = SPAWN_Y + (PADDLE_Y - SPAWN_Y) * frac;

      if (state === 'playing') {
        trail.push({ x: bx, y: by });
        if (trail.length > 10) trail.shift();
      }

      for (var i = 0; i < trail.length; i++) {
        var a = (i + 1) / trail.length * 0.35;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, BALL_R * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = ball.golden ? 'rgba(255,210,63,' + a + ')' : 'rgba(255,255,255,' + a + ')';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = ball.golden ? '#ffd23f' : '#f2f6ff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (state === 'resolve' && resolveData) {
        ctx.fillStyle = 'rgba(8,13,22,.55)';
        ctx.fillRect(0, FIELD_TOP, W, PADDLE_Y - FIELD_TOP + 30);
        ctx.textAlign = 'center';
        ctx.fillStyle = resolveData.success ? '#5be3c9' : '#ff5d6c';
        ctx.font = 'bold 22px system-ui, sans-serif';
        var msg = resolveData.success ? '✔ ナイス返球!' : '✘ ミス!';
        ctx.fillText(msg, W / 2, FIELD_TOP + 120);
        if (resolveData.success && resolveData.golden) {
          ctx.fillStyle = '#ffd23f';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillText('⭐ゴールドボーナス!', W / 2, FIELD_TOP + 148);
        }
      }
    }

    // paddle
    var pw = paddleWidth();
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(paddleX - 3, PADDLE_Y + 6, 6, 14);
    ctx.beginPath();
    ctx.moveTo(paddleX - pw / 2 + 6, PADDLE_Y - 7);
    ctx.lineTo(paddleX + pw / 2 - 6, PADDLE_Y - 7);
    ctx.quadraticCurveTo(paddleX + pw / 2, PADDLE_Y - 7, paddleX + pw / 2, PADDLE_Y);
    ctx.quadraticCurveTo(paddleX + pw / 2, PADDLE_Y + 7, paddleX + pw / 2 - 6, PADDLE_Y + 7);
    ctx.lineTo(paddleX - pw / 2 + 6, PADDLE_Y + 7);
    ctx.quadraticCurveTo(paddleX - pw / 2, PADDLE_Y + 7, paddleX - pw / 2, PADDLE_Y);
    ctx.quadraticCurveTo(paddleX - pw / 2, PADDLE_Y - 7, paddleX - pw / 2 + 6, PADDLE_Y - 7);
    ctx.closePath();
    ctx.fillStyle = '#ff5d6c';
    ctx.fill();
    ctx.strokeStyle = '#0d1420';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function loop(now) {
    var dt = lastFrameTime ? Math.min(now - lastFrameTime, 48) : 16;
    lastFrameTime = now;
    updateKeyboardPaddle(dt);

    if (state === 'playing' && ball) {
      var elapsed = now - ball.spawnTime;
      if (elapsed >= ball.travelTime) {
        resolveBall();
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  updateHud();
  requestAnimationFrame(loop);
})();
