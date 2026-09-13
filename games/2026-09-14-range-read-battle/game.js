(function () {
  'use strict';

  var LIVES_START = 3;
  var TIME_START = 2200;       // ms decision window at successCount=0
  var TIME_STEP = 45;          // ms faster per success
  var TIME_MIN = 900;
  var BONUS_EVERY = 5;
  var BONUS_TIME_MULT = 1.6;
  var BONUS_SCORE_MULT = 2;
  var GOLDEN_CHANCE = 0.16;
  var DOUBLE_DANGER_START = 6;     // successCount from which double-danger can appear
  var DOUBLE_DANGER_MAX_CHANCE = 0.55;
  var DOUBLE_DANGER_RAMP = 16;     // successCount range over which chance ramps to max

  var ZONE_INFO = [
    { icon: '👊', label: '近距離', foe: '近づいて<b>パンチ</b>を放つ構え!' },
    { icon: '🦵', label: '中距離', foe: 'ふみこんで<b>ける技</b>を狙う構え!' },
    { icon: '💥', label: '遠距離', foe: '<b>飛び道具</b>をためる構え!' }
  ];

  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var livesLabel = document.getElementById('livesLabel');
  var foeLabel = document.getElementById('foeLabel');
  var foeEmoji = document.getElementById('foeEmoji');
  var timerBar = document.getElementById('timerBar');
  var boardEl = document.querySelector('.board');
  var zoneEls = [document.getElementById('zone0'), document.getElementById('zone1'), document.getElementById('zone2')];
  var fighterEl = document.getElementById('fighter');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var state = null;
  var timerHandle = null;
  var dangerFlashHandle = null;
  var roundEndHandle = null;
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, dur, type, gainPeak, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.16, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxMove() { beep(520, 0.06, 'square', 0.1); }
  function sfxDodge() { beep(680, 0.08, 'triangle', 0.15); beep(980, 0.1, 'triangle', 0.14, 0.06); }
  function sfxHold() { beep(440, 0.1, 'sine', 0.12); beep(560, 0.12, 'sine', 0.1, 0.05); }
  function sfxGolden() { beep(980, 0.1, 'square', 0.15); beep(1320, 0.1, 'square', 0.14, 0.06); beep(1660, 0.16, 'square', 0.13, 0.12); }
  function sfxHit() { beep(180, 0.22, 'sawtooth', 0.18); beep(120, 0.28, 'sawtooth', 0.16, 0.08); }
  function sfxOver() { beep(200, 0.35, 'sawtooth', 0.16); beep(130, 0.45, 'sawtooth', 0.14, 0.14); }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1100);
  }

  function computeTimer(successCount) {
    return Math.max(TIME_MIN, TIME_START - successCount * TIME_STEP);
  }

  function doubleDangerChance(successCount) {
    if (successCount < DOUBLE_DANGER_START) return 0;
    var t = Math.min(1, (successCount - DOUBLE_DANGER_START) / DOUBLE_DANGER_RAMP);
    return t * DOUBLE_DANGER_MAX_CHANCE;
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    comboLabel.textContent = 'COMBO ' + state.comboStreak;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
  }

  function updateFighterMark() {
    var target = zoneEls[state.position];
    var left = target.offsetLeft + target.offsetWidth / 2;
    fighterEl.style.left = left + 'px';
  }

  function renderZones() {
    for (var i = 0; i < 3; i++) {
      var el = zoneEls[i];
      var danger = state.dangerSet.indexOf(i) !== -1;
      el.classList.toggle('danger', danger);
      el.classList.toggle('golden', state.goldenZone === i);
      el.querySelector('.star').classList.toggle('hidden', state.goldenZone !== i);
    }
    updateFighterMark();
  }

  function armTimer() {
    clearTimeout(timerHandle);
    clearTimeout(dangerFlashHandle);
    var dur = computeTimer(state.successCount) * (state.bonus ? BONUS_TIME_MULT : 1);
    state.roundDur = dur;
    state.roundStart = performance.now();
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    timerBar.classList.remove('danger');
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + dur + 'ms linear';
    timerBar.style.width = '0%';
    dangerFlashHandle = setTimeout(function () { timerBar.classList.add('danger'); }, dur * 0.6);
    timerHandle = setTimeout(onTimeout, dur);
  }

  function stopTimer() {
    clearTimeout(timerHandle);
    clearTimeout(dangerFlashHandle);
  }

  function pickDangerSet(successCount) {
    var size = (Math.random() < doubleDangerChance(successCount)) ? 2 : 1;
    var idx = [0, 1, 2];
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx.slice(0, size);
  }

  function newRound() {
    if (!state || !state.playing) return;
    state.resolved = false;
    state.bonus = state.bonusRoundsLeft > 0;
    if (state.bonusRoundsLeft > 0) state.bonusRoundsLeft--;
    state.dangerSet = pickDangerSet(state.successCount);
    var safeZones = [0, 1, 2].filter(function (z) { return state.dangerSet.indexOf(z) === -1; });
    state.goldenZone = (Math.random() < GOLDEN_CHANCE) ? safeZones[Math.floor(Math.random() * safeZones.length)] : -1;

    var atkNames = state.dangerSet.map(function (z) { return ZONE_INFO[z].label; });
    foeLabel.innerHTML = (state.bonus ? '🌟ボーナス!' : '') +
      (state.dangerSet.length > 1 ? '<b>' + atkNames.join('・') + '</b>の二段構え!' : ZONE_INFO[state.dangerSet[0]].foe);
    foeEmoji.textContent = state.dangerSet.length > 1 ? '👹' : '🥷';

    renderZones();
    updateHud();
    armTimer();
  }

  function finishRound(success, opts) {
    if (state.resolved) return;
    state.resolved = true;
    stopTimer();
    opts = opts || {};
    if (success) {
      resolveSuccess(opts.moved, opts.remainingFrac);
    } else {
      resolveFail();
    }
  }

  function resolveSuccess(moved, remainingFrac) {
    state.successCount++;
    state.comboStreak++;
    state.maxCombo = Math.max(state.maxCombo, state.comboStreak);

    var base = moved ? (70 + Math.round((remainingFrac || 0) * 40)) : 55;
    var gained = Math.round((base + state.comboStreak * 6) * (state.bonus ? BONUS_SCORE_MULT : 1));
    var golden = state.goldenZone === state.position;
    if (golden) {
      gained += 45;
      if (state.lives < LIVES_START) state.lives++;
    }
    state.score += gained;

    if (golden) { sfxGolden(); showToast('⭐会心の見切り! +' + gained); }
    else if (moved) { sfxDodge(); showToast((state.bonus ? '🌟ボーナス回避! +' : 'かわした! +') + gained); }
    else { sfxHold(); showToast((state.bonus ? '🌟ボーナス静観! +' : '読みきり!静観成功 +') + gained); }

    if (state.successCount % BONUS_EVERY === 0) {
      state.bonusRoundsLeft = 1;
      showToast('🌟次はボーナスラウンド!');
    }
    updateHud();
    roundEndHandle = setTimeout(newRound, 750);
  }

  function resolveFail() {
    state.lives--;
    state.comboStreak = 0;
    sfxHit();
    boardEl.classList.add('hitFlash');
    setTimeout(function () { boardEl.classList.remove('hitFlash'); }, 180);
    showToast('被弾!ライフ-1');
    updateHud();
    if (state.lives <= 0) {
      roundEndHandle = setTimeout(gameOver, 500);
      return;
    }
    roundEndHandle = setTimeout(newRound, 850);
  }

  function onZoneTap(zone) {
    if (!state || !state.playing || state.resolved) return;
    var elapsed = performance.now() - state.roundStart;
    var remainingFrac = Math.max(0, 1 - elapsed / state.roundDur);
    if (state.dangerSet.indexOf(zone) !== -1) {
      finishRound(false);
      return;
    }
    var moved = zone !== state.position;
    state.position = zone;
    updateFighterMark();
    if (moved) sfxMove();
    finishRound(true, { moved: moved, remainingFrac: remainingFrac });
  }

  function onTimeout() {
    if (!state || !state.playing || state.resolved) return;
    var stillDanger = state.dangerSet.indexOf(state.position) !== -1;
    finishRound(!stillDanger, { moved: false });
  }

  function gameOver() {
    state.playing = false;
    stopTimer();
    sfxOver();
    resultTitle.textContent = 'やられた…';
    resultText.textContent =
      '通算成功回数: ' + state.successCount + '\n最大コンボ: ' + state.maxCombo + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    stopTimer();
    clearTimeout(roundEndHandle);
    state = {
      playing: true, score: 0, lives: LIVES_START, comboStreak: 0, maxCombo: 0,
      successCount: 0, bonusRoundsLeft: 0, bonus: false,
      position: 1, dangerSet: [], goldenZone: -1, resolved: true
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    updateHud();
    updateFighterMark();
    newRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  zoneEls.forEach(function (el, i) {
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); onZoneTap(i); });
  });

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === '1' || k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); onZoneTap(0); }
    else if (k === '2' || k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); onZoneTap(1); }
    else if (k === '3' || k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); onZoneTap(2); }
  });

  window.addEventListener('resize', function () { if (state && state.playing) updateFighterMark(); });
})();
