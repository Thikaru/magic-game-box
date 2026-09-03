(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var CW = canvas.width;   // 320
  var CH = canvas.height;  // 360
  var CY = CH / 2;

  var PLAYER_X = 58;
  var PLAYER_SIZE = 15;

  var GATE_W = 26;
  var HOLE_H = 104;
  var DOUBLE_GAP = 92;

  var SPEED_BASE = 145;
  var SPEED_MAX = 320;
  var SPAWN_BASE = 1.65;
  var SPAWN_MIN = 0.85;

  var DOUBLE_MIN_CORRECT = 8;
  var DOUBLE_PROB = 0.28;
  var GOLD_PROB = 0.1;

  var LIVES_START = 3;
  var SHAPES = ['circle', 'square', 'triangle'];
  var COLORS = { circle: '#5fd2ff', square: '#ffd23f', triangle: '#ff7ad9' };

  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var btnCircle = document.getElementById('btnCircle');
  var btnSquare = document.getElementById('btnSquare');
  var btnTriangle = document.getElementById('btnTriangle');

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
  function sndSelect(shape) {
    var f = shape === 'circle' ? 440 : (shape === 'square' ? 550 : 660);
    beep(f, 0.06, 'triangle', 0.1);
  }
  function sndPass() { beep(700, 0.09, 'sine', 0.14); beep(900, 0.1, 'sine', 0.12, 0.05); }
  function sndGold() { beep(1046, 0.1, 'square', 0.14); beep(1318, 0.14, 'square', 0.12, 0.07); }
  function sndHit() { beep(170, 0.22, 'sawtooth', 0.18); }
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
      maxCombo: 0,
      correctCount: 0,
      lives: LIVES_START,
      speed: SPEED_BASE,
      spawnTimer: 1.0,
      spawnInterval: SPAWN_BASE,
      gates: [],
      shape: 'circle',
      lastShape: 'circle',
      shake: 0
    };
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function pickShape(excludeBias) {
    if (Math.random() < 0.25) return excludeBias;
    var pool = SHAPES.filter(function (s) { return s !== excludeBias; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function spawnWave() {
    var s = state;
    var gold = Math.random() < GOLD_PROB;
    var shape1 = pickShape(s.lastShape);
    s.lastShape = shape1;
    s.gates.push({ x: CW + 10, w: GATE_W, shape: shape1, gold: gold, resolved: false });

    if (!gold && s.correctCount >= DOUBLE_MIN_CORRECT && Math.random() < DOUBLE_PROB) {
      var shape2 = pickShape(shape1);
      s.lastShape = shape2;
      s.gates.push({ x: CW + 10 + DOUBLE_GAP, w: GATE_W, shape: shape2, gold: false, resolved: false });
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 700);
  }

  function setShape(shape) {
    if (!state || !state.running || state.over) return;
    if (state.shape === shape) return;
    state.shape = shape;
    sndSelect(shape);
    [btnCircle, btnSquare, btnTriangle].forEach(function (b) {
      b.classList.toggle('active', b.dataset.shape === shape);
    });
  }

  function resolveGate(gate) {
    var s = state;
    if (gate.gold) {
      s.combo++;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      var multG = 1 + Math.min(Math.floor(s.combo / 5) * 0.5, 2);
      s.score += Math.round(60 * multG);
      s.lives = Math.min(LIVES_START, s.lives + 1);
      sndGold();
      showToast('★ ボーナス!ライフ回復');
      return;
    }
    if (gate.shape === s.shape) {
      s.combo++;
      s.correctCount++;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      var mult = 1 + Math.min(Math.floor(s.combo / 5) * 0.5, 2);
      s.score += Math.round(20 * mult);
      sndPass();
    } else {
      onHit();
    }
  }

  function onHit() {
    var s = state;
    s.lives -= 1;
    s.combo = 0;
    s.shake = 0.25;
    sndHit();
    showToast('ミス!');
    if (s.lives <= 0) endGame();
  }

  function update(dt) {
    var s = state;
    if (!s.running || s.over) return;

    s.distance += s.speed * dt;
    s.speed = Math.min(SPEED_MAX, SPEED_BASE + s.distance * 0.022);
    s.spawnInterval = Math.max(SPAWN_MIN, SPAWN_BASE - s.distance * 0.00045);
    s.score += dt * s.speed * 0.02;

    if (s.shake > 0) s.shake -= dt;

    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      spawnWave();
      s.spawnTimer = s.spawnInterval;
    }

    for (var i = s.gates.length - 1; i >= 0; i--) {
      var g = s.gates[i];
      g.x -= s.speed * dt;

      if (!g.resolved && g.x <= PLAYER_X) {
        g.resolved = true;
        resolveGate(g);
      }
      if (g.x + g.w < -20) s.gates.splice(i, 1);
    }

    if (s.lives <= 0 && !s.over) endGame();
  }

  function drawShapePath(type, cx, cy, size) {
    ctx.beginPath();
    if (type === 'circle') {
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
    } else if (type === 'square') {
      ctx.rect(cx - size, cy - size, size * 2, size * 2);
    } else {
      ctx.moveTo(cx, cy - size * 1.1);
      ctx.lineTo(cx + size * 1.05, cy + size * 0.85);
      ctx.lineTo(cx - size * 1.05, cy + size * 0.85);
      ctx.closePath();
    }
  }

  function render() {
    var s = state;
    ctx.save();
    ctx.clearRect(0, 0, CW, CH);

    var shakeX = s.shake > 0 ? (Math.random() - 0.5) * 8 * (s.shake / 0.25) : 0;
    ctx.translate(shakeX, 0);

    // lane guide line
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, CY);
    ctx.lineTo(CW, CY);
    ctx.stroke();

    // gates
    for (var i = 0; i < s.gates.length; i++) {
      var g = s.gates[i];
      var holeTop = CY - HOLE_H / 2;
      var holeBottom = CY + HOLE_H / 2;

      if (g.gold) {
        ctx.fillStyle = 'rgba(255,210,63,.55)';
      } else {
        ctx.fillStyle = '#274a63';
      }
      ctx.fillRect(g.x, 0, g.w, holeTop);
      ctx.fillRect(g.x, holeBottom, g.w, CH - holeBottom);
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.strokeRect(g.x, 0, g.w, holeTop);
      ctx.strokeRect(g.x, holeBottom, g.w, CH - holeBottom);

      // guide icon inside the hole
      var iconColor = g.gold ? '#ffd23f' : COLORS[g.shape];
      ctx.fillStyle = iconColor;
      ctx.globalAlpha = 0.85;
      if (g.gold) {
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', g.x + g.w / 2, CY);
      } else {
        drawShapePath(g.shape, g.x + g.w / 2, CY, 15);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // player
    ctx.fillStyle = COLORS[s.shape];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    drawShapePath(s.shape, PLAYER_X, CY, PLAYER_SIZE);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function endGame() {
    var s = state;
    s.over = true;
    s.running = false;
    sndGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      'スコア ' + Math.floor(s.score) + ' てん / 通過 ' + s.correctCount +
      ' ゲート / 最大コンボ ' + s.maxCombo + '連';
    resultEl.classList.remove('hidden');
  }

  function loop(ts) {
    if (!state) return;
    if (!loop.last) loop.last = ts;
    var dt = Math.min(0.05, (ts - loop.last) / 1000);
    loop.last = ts;

    update(dt);
    render();

    scoreLabel.textContent = 'SCORE ' + Math.floor(state.score);
    comboLabel.textContent = 'COMBO ' + state.combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(LIVES_START - Math.max(0, state.lives));

    if (state.running) requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    state = freshState();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    [btnCircle, btnSquare, btnTriangle].forEach(function (b) {
      b.classList.toggle('active', b.dataset.shape === 'circle');
    });
    state.running = true;
    loop.last = null;
    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  btnCircle.addEventListener('click', function () { setShape('circle'); });
  btnSquare.addEventListener('click', function () { setShape('square'); });
  btnTriangle.addEventListener('click', function () { setShape('triangle'); });

  window.addEventListener('keydown', function (e) {
    if (e.key === '1') { e.preventDefault(); setShape('circle'); }
    else if (e.key === '2') { e.preventDefault(); setShape('square'); }
    else if (e.key === '3') { e.preventDefault(); setShape('triangle'); }
  });
})();
