(function () {
  'use strict';

  var LIVES_START = 3;
  var BASE_INTERVAL = 1500;   // ms between auto-flips at hits=0
  var INTERVAL_STEP = 35;     // ms faster per successful hit
  var MIN_INTERVAL = 550;
  var BONUS_EVERY = 5;        // every N successful hits -> bonus window
  var BONUS_FLIPS = 4;        // how many flips the bonus window lasts
  var BONUS_INTERVAL_MULT = 1.6;
  var GOLDEN_CHANCE = 0.12;
  var VISIBLE_SLOTS = 4;
  var SLAP_COOLDOWN_MS = 220;

  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = [
    { symbol: '♠', color: 'black' },
    { symbol: '♥', color: 'red' },
    { symbol: '♦', color: 'red' },
    { symbol: '♣', color: 'black' }
  ];

  var pileEl = document.getElementById('pile');
  var pileLabelEl = document.getElementById('pileLabel');
  var hitsLabel = document.getElementById('hitsLabel');
  var comboLabel = document.getElementById('comboLabel');
  var scoreLabel = document.getElementById('scoreLabel');
  var livesLabel = document.getElementById('livesLabel');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');
  var slapBtn = document.getElementById('slapBtn');

  var state = null;
  var flipTimer = null;
  var audioCtx = null;
  var lastSlap = 0;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function beep(freq, dur, type, gainPeak) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.16, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxFlip() { beep(340, 0.05, 'square', 0.06); }
  function sfxPair() { beep(700, 0.12, 'square', 0.16); setTimeout(function () { beep(1000, 0.12, 'square', 0.14); }, 60); }
  function sfxSandwich() { beep(760, 0.1, 'triangle', 0.16); setTimeout(function () { beep(1140, 0.16, 'triangle', 0.14); }, 70); }
  function sfxGolden() { beep(980, 0.1, 'square', 0.15); setTimeout(function () { beep(1320, 0.1, 'square', 0.14); }, 60); setTimeout(function () { beep(1660, 0.16, 'square', 0.13); }, 120); }
  function sfxFail() { beep(180, 0.24, 'sawtooth', 0.16); }
  function sfxOver() { beep(220, 0.35, 'sawtooth', 0.16); setTimeout(function () { beep(140, 0.45, 'sawtooth', 0.14); }, 140); }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1000);
  }

  function currentInterval() {
    var base = Math.max(MIN_INTERVAL, BASE_INTERVAL - state.hits * INTERVAL_STEP);
    return state.bonusFlipsLeft > 0 ? Math.round(base * BONUS_INTERVAL_MULT) : base;
  }

  function updateHud() {
    hitsLabel.textContent = 'HITS ' + state.hits;
    comboLabel.textContent = 'COMBO ' + state.combo;
    scoreLabel.textContent = 'SCORE ' + state.score;
    var hearts = '';
    for (var i = 0; i < LIVES_START; i++) hearts += (i < state.lives ? '♥' : '♡');
    livesLabel.textContent = hearts;
    pileLabelEl.textContent = state.bonusFlipsLeft > 0 ? '🌟ボーナスタイム!(スコア2倍)' : 'カードがめくられるのを見よう';
  }

  function renderPile(flashClass) {
    var history = state.history;
    var shown = history.slice(Math.max(0, history.length - VISIBLE_SLOTS));
    while (shown.length < VISIBLE_SLOTS) shown.unshift(null);

    pileEl.innerHTML = '';
    pileEl.className = 'pile' + (flashClass ? ' ' + flashClass : '');
    shown.forEach(function (c, idx) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      if (c) {
        slot.classList.add('card', c.color);
        if (idx === shown.length - 1) slot.classList.add('newest');
        if (c.golden) slot.classList.add('golden');
        var inner = document.createElement('div');
        inner.className = 'cardInner';
        var rankEl = document.createElement('div');
        rankEl.className = 'rank';
        rankEl.textContent = c.rank;
        var suitEl = document.createElement('div');
        suitEl.className = 'suit';
        suitEl.textContent = c.suit;
        inner.appendChild(rankEl);
        inner.appendChild(suitEl);
        slot.appendChild(inner);
      }
      pileEl.appendChild(slot);
    });
  }

  function nextCard() {
    var history = state.history;
    var roll = Math.random();
    var rank;
    if (history.length >= 1 && roll < 0.20) {
      rank = history[history.length - 1].rank; // force pair opportunity
    } else if (history.length >= 2 && roll < 0.38) {
      rank = history[history.length - 2].rank; // force sandwich opportunity
    } else {
      rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    }
    var suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    return { rank: rank, suit: suit.symbol, color: suit.color, golden: Math.random() < GOLDEN_CHANCE };
  }

  function detectPattern() {
    var h = state.history;
    var n = h.length;
    if (n >= 2 && h[n - 1].rank === h[n - 2].rank) return 'pair';
    if (n >= 3 && h[n - 1].rank === h[n - 3].rank) return 'sandwich';
    return null;
  }

  function scheduleFlip() {
    clearTimeout(flipTimer);
    flipTimer = setTimeout(doFlip, currentInterval());
  }

  function doFlip() {
    if (!state || !state.playing) return;
    var card = nextCard();
    state.history.push(card);
    if (state.history.length > 20) state.history.shift();
    state.pattern = detectPattern();
    if (state.bonusFlipsLeft > 0) state.bonusFlipsLeft--;
    sfxFlip();
    renderPile();
    updateHud();
    scheduleFlip();
  }

  function goldenInvolved() {
    var h = state.history;
    var n = h.length;
    if (state.pattern === 'pair') return h[n - 1].golden || h[n - 2].golden;
    if (state.pattern === 'sandwich') return h[n - 1].golden || h[n - 3].golden;
    return false;
  }

  function doSlap() {
    if (!state || !state.playing || state.history.length === 0) return;
    var now = performance.now();
    if (now - lastSlap < SLAP_COOLDOWN_MS) return;
    lastSlap = now;

    if (state.pattern) {
      var isBonus = state.bonusFlipsLeft > 0;
      var base = state.pattern === 'sandwich' ? 18 : 12;
      var gained = (base + state.combo * 3) * (isBonus ? 2 : 1);
      var golden = goldenInvolved();
      if (golden) gained += 40;
      state.score += gained;
      state.combo++;
      state.hits++;
      if (golden && state.lives < LIVES_START) state.lives++;

      if (golden) { sfxGolden(); showToast('⭐ゴールド! +' + gained); }
      else if (state.pattern === 'sandwich') { sfxSandwich(); showToast('サンドイッチ成功! +' + gained); }
      else { sfxPair(); showToast('ペア成功! +' + gained); }

      state.pattern = null;
      renderPile('flashOk');

      if (state.hits % BONUS_EVERY === 0) {
        state.bonusFlipsLeft = BONUS_FLIPS;
        showToast('🌟ボーナスタイム突入!');
      }
      updateHud();
    } else {
      state.lives--;
      state.combo = 0;
      sfxFail();
      showToast('フライング!');
      renderPile('flashBad');
      updateHud();
      if (state.lives <= 0) {
        gameOver();
        return;
      }
    }
  }

  function gameOver() {
    state.playing = false;
    clearTimeout(flipTimer);
    sfxOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      '通算スラップ成功: ' + state.hits + '\n最大コンボ: ' + state.maxCombo + '\nスコア: ' + state.score;
    resultText.style.whiteSpace = 'pre-line';
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    state = {
      playing: true, score: 0, lives: LIVES_START, combo: 0, maxCombo: 0,
      hits: 0, history: [], pattern: null, bonusFlipsLeft: 0
    };
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    renderPile();
    updateHud();
    scheduleFlip();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  slapBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    doSlap();
    if (state) state.maxCombo = Math.max(state.maxCombo, state.combo);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      doSlap();
      if (state) state.maxCombo = Math.max(state.maxCombo, state.combo);
    }
  });
})();
