(() => {
  const TOTAL_TIME = 75; // seconds
  const STAGES = [
    { min: 0, name: 'タネ', emoji: '🌰' },
    { min: 20, name: '芽', emoji: '🌱' },
    { min: 40, name: '若葉', emoji: '🌿' },
    { min: 60, name: 'つぼみ', emoji: '🌷' },
    { min: 80, name: '満開', emoji: '🌸' },
  ];
  const WEATHER = {
    sun: { icon: '☀️', action: 'sun' },
    rain: { icon: '💧', action: 'rain' },
    storm: { icon: '🌪', action: 'storm' },
    cold: { icon: '❄️', action: 'cold' },
    rainbow: { icon: '🌈', action: null },
  };
  const NORMAL_WEATHER_KEYS = ['sun', 'rain', 'storm', 'cold'];
  const RAINBOW_CHANCE = 0.1;
  const RAINBOW_TAP_CAP = 3;

  const growthFill = document.getElementById('growthFill');
  const stageLabel = document.getElementById('stageLabel');
  const plantArt = document.getElementById('plantArt');
  const weatherIcon = document.getElementById('weatherIcon');
  const roundBarFill = document.getElementById('roundBarFill');
  const rainbowText = document.getElementById('rainbowText');
  const comboLabel = document.getElementById('comboLabel');
  const timerBar = document.getElementById('timerBar');
  const timeLabel = document.getElementById('timeLabel');
  const scoreLabel = document.getElementById('scoreLabel');
  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const actionButtons = Array.from(document.querySelectorAll('.actionBtn'));

  let growth = 15;
  let maxGrowth = 15;
  let combo = 0;
  let guaranteedRainbowNext = false;
  let currentWeatherKey = null;
  let roundActive = false;
  let rainbowTaps = 0;
  let roundTimeoutId = null;
  let roundBarRaf = null;
  let overallIntervalId = null;
  let timeLeft = TOTAL_TIME;
  let gameOver = true;
  let stageIndex = 0;
  let roundStartTime = 0;
  let roundDuration = 2600;

  function stageForGrowth(g) {
    let idx = 0;
    for (let i = 0; i < STAGES.length; i++) {
      if (g >= STAGES[i].min) idx = i;
    }
    return idx;
  }

  function roundDurationForStage(idx) {
    return Math.max(1100, 2600 - idx * 350);
  }

  function updateGrowthUI(animate) {
    growth = Math.max(0, Math.min(100, growth));
    maxGrowth = Math.max(maxGrowth, growth);
    growthFill.style.width = growth + '%';
    const idx = stageForGrowth(growth);
    if (idx !== stageIndex || animate) {
      stageIndex = idx;
      plantArt.textContent = STAGES[idx].emoji;
      if (animate) {
        plantArt.classList.remove('grow', 'shake');
        void plantArt.offsetWidth;
        plantArt.classList.add(animate === 'good' ? 'grow' : 'shake');
      }
    }
    stageLabel.textContent = 'ステージ: ' + STAGES[idx].name;
  }

  function updateComboUI() {
    comboLabel.textContent = 'コンボ ' + combo;
  }

  function currentScore() {
    return Math.round(maxGrowth);
  }

  function updateScoreUI() {
    scoreLabel.textContent = 'SCORE ' + currentScore();
  }

  function pickWeatherKey() {
    if (guaranteedRainbowNext) {
      guaranteedRainbowNext = false;
      return 'rainbow';
    }
    if (currentWeatherKey !== 'rainbow' && Math.random() < RAINBOW_CHANCE) {
      return 'rainbow';
    }
    return NORMAL_WEATHER_KEYS[Math.floor(Math.random() * NORMAL_WEATHER_KEYS.length)];
  }

  function clearRoundTimers() {
    if (roundTimeoutId) { clearTimeout(roundTimeoutId); roundTimeoutId = null; }
    if (roundBarRaf) { cancelAnimationFrame(roundBarRaf); roundBarRaf = null; }
  }

  function startRound() {
    if (gameOver) return;
    clearRoundTimers();
    rainbowTaps = 0;
    currentWeatherKey = pickWeatherKey();
    const weather = WEATHER[currentWeatherKey];
    weatherIcon.textContent = weather.icon;
    rainbowText.classList.toggle('hidden', currentWeatherKey !== 'rainbow');

    const duration = roundDurationForStage(stageIndex);
    const start = performance.now();
    roundActive = true;
    roundBarFill.style.width = '100%';

    function tick(now) {
      if (!roundActive) return;
      const elapsed = now - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      roundBarFill.style.width = pct + '%';
      if (elapsed < duration) {
        roundBarRaf = requestAnimationFrame(tick);
      }
    }
    roundBarRaf = requestAnimationFrame(tick);

    roundTimeoutId = setTimeout(() => {
      handleTimeout();
    }, duration);

    roundStartTime = start;
    roundDuration = duration;
  }

  function endRoundSoonAndAdvance() {
    roundActive = false;
    clearRoundTimers();
    if (checkEndConditions()) return;
    setTimeout(startRound, 350);
  }

  function handleTimeout() {
    if (!roundActive) return;
    roundActive = false;
    clearRoundTimers();
    if (currentWeatherKey === 'rainbow') {
      if (rainbowTaps === 0) {
        growth -= 2;
        updateGrowthUI('bad');
      }
    } else {
      growth -= 5;
      combo = 0;
      updateComboUI();
      updateGrowthUI('bad');
    }
    updateScoreUI();
    if (checkEndConditions()) return;
    setTimeout(startRound, 350);
  }

  function flashButton(btn, good) {
    btn.classList.remove('flashGood', 'flashBad');
    void btn.offsetWidth;
    btn.classList.add(good ? 'flashGood' : 'flashBad');
    setTimeout(() => btn.classList.remove('flashGood', 'flashBad'), 300);
  }

  function handleAction(action) {
    if (gameOver || !roundActive) return;
    const btn = actionButtons.find((b) => b.dataset.action === action);

    if (currentWeatherKey === 'rainbow') {
      rainbowTaps++;
      growth += 5;
      combo++;
      if (combo % 5 === 0) guaranteedRainbowNext = true;
      updateComboUI();
      updateGrowthUI('good');
      updateScoreUI();
      if (btn) flashButton(btn, true);
      if (rainbowTaps >= RAINBOW_TAP_CAP) {
        endRoundSoonAndAdvance();
      }
      return;
    }

    const correctAction = WEATHER[currentWeatherKey].action;
    if (action === correctAction) {
      const elapsed = performance.now() - roundStartTime;
      const speedBonus = elapsed < roundDuration / 2 ? 3 : 0;
      growth += 6 + speedBonus;
      combo++;
      if (combo % 5 === 0) guaranteedRainbowNext = true;
      if (btn) flashButton(btn, true);
    } else {
      growth -= 8;
      combo = 0;
      if (btn) flashButton(btn, false);
    }
    updateComboUI();
    updateGrowthUI(action === correctAction ? 'good' : 'bad');
    updateScoreUI();
    endRoundSoonAndAdvance();
  }

  function checkEndConditions() {
    if (growth <= 0) {
      growth = 0;
      updateGrowthUI(false);
      endGame('wilt');
      return true;
    }
    if (growth >= 100) {
      growth = 100;
      updateGrowthUI(false);
      endGame('bloom');
      return true;
    }
    return false;
  }

  function startOverallTimer() {
    timeLeft = TOTAL_TIME;
    timeLabel.textContent = 'TIME ' + timeLeft;
    timerBar.style.width = '100%';
    overallIntervalId = setInterval(() => {
      timeLeft -= 1;
      timeLabel.textContent = 'TIME ' + Math.max(0, timeLeft);
      timerBar.style.width = Math.max(0, (timeLeft / TOTAL_TIME) * 100) + '%';
      if (timeLeft <= 0) {
        endGame('timeup');
      }
    }, 1000);
  }

  function stopAllTimers() {
    clearRoundTimers();
    if (overallIntervalId) { clearInterval(overallIntervalId); overallIntervalId = null; }
    roundActive = false;
  }

  function endGame(reason) {
    if (gameOver) return;
    gameOver = true;
    stopAllTimers();
    const score = currentScore();
    if (reason === 'bloom') {
      const bonus = Math.max(0, timeLeft) * 2;
      resultTitle.textContent = '🌸 満開になった!';
      resultText.textContent = 'タネを見事に育てあげた!スコア ' + (100 + bonus) + '(残り時間ボーナス込み)';
      scoreLabel.textContent = 'SCORE ' + (100 + bonus);
    } else if (reason === 'wilt') {
      resultTitle.textContent = 'しおれてしまった…';
      resultText.textContent = '育成ステージ「' + STAGES[stageIndex].name + '」まで到達。スコア ' + score;
    } else {
      resultTitle.textContent = '時間切れ!';
      resultText.textContent = '育成ステージ「' + STAGES[stageIndex].name + '」で時間切れ。スコア ' + score;
    }
    resultEl.classList.remove('hidden');
  }

  function newGame() {
    stopAllTimers();
    growth = 15;
    maxGrowth = 15;
    combo = 0;
    guaranteedRainbowNext = false;
    currentWeatherKey = null;
    gameOver = false;
    stageIndex = -1;
    updateGrowthUI(false);
    updateComboUI();
    updateScoreUI();
    startOverallTimer();
    startRound();
  }

  actionButtons.forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });

  const KEY_MAP = { '1': 'sun', '2': 'rain', '3': 'storm', '4': 'cold' };
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const action = KEY_MAP[e.key];
    if (action) handleAction(action);
  });

  startBtn.addEventListener('click', () => {
    introEl.classList.add('hidden');
    newGame();
  });

  retryBtn.addEventListener('click', () => {
    resultEl.classList.add('hidden');
    newGame();
  });
})();

(() => {
  const MUSIC_TRACKS = ['pop', 'speed', 'dark', 'limit'];
  const musicSelect = document.getElementById('musicSelect');
  const musicToggle = document.getElementById('musicToggle');
  const bgm = new Audio();
  bgm.loop = true;
  bgm.volume = 0.5;
  let bgmStarted = false;
  let musicOn = true;

  function playTrack(key) {
    bgm.src = `../../assets/music/${key}.mp3`;
    bgm.currentTime = 0;
    bgm.play().catch(() => {});
  }

  musicSelect.addEventListener('change', () => playTrack(musicSelect.value));

  musicToggle.addEventListener('click', () => {
    musicOn = !musicOn;
    bgm.muted = !musicOn;
    musicToggle.textContent = musicOn ? '🔊 BGM ON' : '🔇 BGM OFF';
    if (musicOn && bgmStarted && bgm.paused) bgm.play().catch(() => {});
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    if (bgmStarted) return;
    bgmStarted = true;
    const randomKey = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    musicSelect.value = randomKey;
    playTrack(randomKey);
  }, { once: true });
})();
