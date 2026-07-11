'use strict';
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  var LANES = 3;
  var LANE_W = W / LANES;
  var LANE_X = [LANE_W * 0.5, LANE_W * 1.5, LANE_W * 2.5];
  var HIT_Y = 500;
  var PERFECT_WINDOW = 18;
  var GOOD_WINDOW = 42;
  var MISS_WINDOW = 60;
  var MAX_LIVES = 4;
  var DURATION = 75;
  var BASE_SPEED = 210;

  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitleEl = document.getElementById('resultTitle');
  var resultTextEl = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');
  var timeLabel = document.getElementById('timeLabel');
  var pads = [document.getElementById('pad0'), document.getElementById('pad1'), document.getElementById('pad2')];
  var muteBtn = document.getElementById('muteBtn');

  // --- サウンド: Web Audio API での自前生成音(外部ファイル不使用、著作権フリー) ---
  var audioCtx = null;
  var muted = false;
  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function playTone(freq, duration, type, vol) {
    if (muted || !audioCtx) return;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.2 : vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
  function playNoiseBurst(duration, vol) {
    if (muted || !audioCtx) return;
    var t0 = audioCtx.currentTime;
    var bufferSize = Math.floor(audioCtx.sampleRate * duration);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    var noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol == null ? 0.2 : vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    noise.connect(gain).connect(audioCtx.destination);
    noise.start(t0);
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      muted = !muted;
      muteBtn.textContent = muted ? '🔇' : '🔊';
    });
  }

  var state = 'intro';
  var notes, floats, score, combo, maxCombo, lives, elapsed, spawnTimer;

  function reset() {
    notes = [];
    floats = [];
    score = 0;
    combo = 0;
    maxCombo = 0;
    lives = MAX_LIVES;
    elapsed = 0;
    spawnTimer = 0.6;
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = Math.floor(score);
    comboLabel.textContent = combo;
    livesLabel.textContent = '❤️'.repeat(Math.max(lives, 0)) + '🤍'.repeat(Math.max(MAX_LIVES - lives, 0));
    timeLabel.textContent = Math.max(0, Math.ceil(DURATION - elapsed));
  }

  function addFloat(text, lane, color) {
    floats.push({ text: text, x: LANE_X[lane], y: HIT_Y - 40, alpha: 1, color: color });
  }

  function flashPad(lane) {
    var pad = pads[lane];
    pad.classList.add('pressed');
    setTimeout(function () { pad.classList.remove('pressed'); }, 100);
  }

  function handleLaneHit(lane) {
    if (state !== 'playing') return;
    flashPad(lane);

    var best = null, bestDist = Infinity;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.judged || n.lane !== lane) continue;
      var dist = Math.abs(n.y - HIT_Y);
      if (dist <= MISS_WINDOW && dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }

    if (!best) {
      combo = 0;
      addFloat('MISS', lane, '#ff8a8a');
      playTone(150, 0.12, 'sawtooth', 0.1);
      updateHud();
      return;
    }

    best.judged = true;
    if (best.type === 'good') {
      var mult = 1 + combo * 0.05;
      if (bestDist <= PERFECT_WINDOW) {
        score += 100 * mult;
        addFloat('PERFECT', lane, '#ffd76a');
        playTone(720, 0.09, 'triangle', 0.22);
      } else {
        score += 50 * mult;
        addFloat('GOOD', lane, '#7fe0a0');
        playTone(520, 0.09, 'triangle', 0.18);
      }
      combo++;
      maxCombo = Math.max(maxCombo, combo);
    } else {
      lives--;
      combo = 0;
      addFloat('ダメ!', lane, '#ff6b6b');
      playNoiseBurst(0.15, 0.2);
      playTone(110, 0.15, 'sawtooth', 0.12);
      if (lives <= 0) {
        updateHud();
        triggerGameOver();
        return;
      }
    }
    updateHud();
  }

  function spawnNote() {
    var lane = Math.floor(Math.random() * LANES);
    var type = Math.random() < 0.24 ? 'bad' : 'good';
    notes.push({ lane: lane, y: -30, type: type, judged: false });
  }

  function triggerGameOver() {
    state = 'gameover';
    resultTitleEl.textContent = 'しゅぎょう失敗…';
    resultTextEl.innerHTML = 'ハートが尽きた。<br>スコア ' + Math.floor(score) + ' / 最大コンボ ' + maxCombo + '<br>もう一度心を落ち着けて挑もう。';
    resultEl.classList.remove('hidden');
  }

  function triggerClear() {
    state = 'clear';
    var rank = score >= 6000 ? 'S' : score >= 3500 ? 'A' : score >= 1500 ? 'B' : 'C';
    resultTitleEl.textContent = 'しゅぎょう達成! ランク ' + rank;
    resultTextEl.innerHTML = 'スコア ' + Math.floor(score) + '<br>最大コンボ ' + maxCombo + '<br>のこりハート ' + lives;
    resultEl.classList.remove('hidden');
  }

  var lastTs = null;
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (state === 'playing') {
      update(dt);
      draw();
      requestAnimationFrame(loop);
    } else {
      draw();
    }
  }

  function update(dt) {
    elapsed += dt;
    if (elapsed >= DURATION) {
      elapsed = DURATION;
      updateHud();
      triggerClear();
      return;
    }

    var speed = BASE_SPEED + Math.floor(elapsed / 15) * 35;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnNote();
      var interval = 0.85 - Math.min(0.4, elapsed / 200) - Math.random() * 0.15;
      spawnTimer = Math.max(0.38, interval);
    }

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      n.y += speed * dt;
      if (!n.judged && n.y - HIT_Y > MISS_WINDOW) {
        n.judged = true;
        if (n.type === 'good') {
          lives--;
          combo = 0;
          addFloat('MISS', n.lane, '#ff8a8a');
          playTone(150, 0.12, 'sawtooth', 0.1);
          if (lives <= 0) {
            updateHud();
            triggerGameOver();
            return;
          }
        } else {
          combo++;
          maxCombo = Math.max(maxCombo, combo);
          score += 30 * (1 + combo * 0.03);
          addFloat('OK', n.lane, '#9fd8ff');
          playTone(950, 0.06, 'sine', 0.1);
        }
      }
    }
    notes = notes.filter(function (n) { return n.y < H + 40; });

    for (var j = 0; j < floats.length; j++) {
      floats[j].alpha -= dt * 1.3;
      floats[j].y -= dt * 30;
    }
    floats = floats.filter(function (f) { return f.alpha > 0; });

    updateHud();
  }

  function draw() {
    ctx.fillStyle = '#1b120a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(232,184,75,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    for (var l = 1; l < LANES; l++) {
      ctx.beginPath();
      ctx.moveTo(LANE_W * l, 0);
      ctx.lineTo(LANE_W * l, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = '#e8b84b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(4, HIT_Y);
    ctx.lineTo(W - 4, HIT_Y);
    ctx.stroke();

    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var k = 0; k < notes.length; k++) {
      var n = notes[k];
      ctx.fillText(n.type === 'good' ? '🥁' : '😴', LANE_X[n.lane], n.y);
    }

    ctx.font = 'bold 22px sans-serif';
    for (var m = 0; m < floats.length; m++) {
      var f = floats[m];
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function start() {
    ensureAudio();
    reset();
    state = 'playing';
    lastTs = null;
    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', function () {
    introEl.classList.add('hidden');
    start();
  });
  retryBtn.addEventListener('click', function () {
    resultEl.classList.add('hidden');
    start();
  });

  pads.forEach(function (pad, idx) {
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      handleLaneHit(idx);
    });
  });

  var KEY_LANE = {
    'a': 0, 'ArrowLeft': 0,
    's': 1, 'ArrowDown': 1,
    'd': 2, 'ArrowRight': 2
  };
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var lane = KEY_LANE[e.key];
    if (lane === undefined) return;
    e.preventDefault();
    handleLaneHit(lane);
  });

  reset();
  draw();
})();
