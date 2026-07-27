(() => {
  'use strict';

  const TOTAL_TIME = 90;
  const FLICKER_DURATION = 4;
  const MAX_CHARGES = 5;
  const WRONG_PENALTY = 10;
  const EMOJIS = ['📚', '🖼️', '🪴', '🗄️', '🕰️', '🛋️'];
  const DECOY_LINES = [
    '🔍 特に何もなさそうだ…',
    '🙅 ここに手がかりはなそうだ',
    '🕸️ ほこりが積もっているだけ',
    '👀 見間違いだったようだ',
  ];

  const room = document.getElementById('room');
  const hotspotsEl = document.getElementById('hotspots');
  const notebookSlots = [
    document.getElementById('slot1'),
    document.getElementById('slot2'),
    document.getElementById('slot3'),
  ];
  const switchBtn = document.getElementById('switchBtn');
  const flickerFill = document.getElementById('flickerFill');
  const chargesLabel = document.getElementById('chargesLabel');
  const inputDisplay = document.getElementById('inputDisplay');
  const keypadEl = document.getElementById('keypad');
  const clearBtn = document.getElementById('clearBtn');
  const okBtn = document.getElementById('okBtn');
  const toastEl = document.getElementById('toast');
  const timerBar = document.getElementById('timerBar');
  const timeLabel = document.getElementById('timeLabel');
  const scoreLabel = document.getElementById('scoreLabel');
  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  let hotspots = [];
  let mode = 'light';
  let charges = MAX_CHARGES;
  let flickerRemaining = 0;
  let flickerMax = FLICKER_DURATION;
  let timeLeft = TOTAL_TIME;
  let inputBuffer = [];
  let gameActive = false;
  let ticker = null;
  let toastTimeout = null;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildHotspots() {
    const idxOrder = shuffle([0, 1, 2, 3, 4, 5]);
    const clueIdx = idxOrder.slice(0, 3);
    const orders = shuffle([1, 2, 3]);
    return EMOJIS.map((emoji, i) => {
      const clueSlot = clueIdx.indexOf(i);
      if (clueSlot === -1) {
        return { emoji, isClue: false, revealed: false };
      }
      return {
        emoji,
        isClue: true,
        order: orders[clueSlot],
        requiredMode: Math.random() < 0.5 ? 'light' : 'dark',
        digit: Math.floor(Math.random() * 10),
        revealed: false,
      };
    });
  }

  function codeDigits() {
    const code = [null, null, null];
    hotspots.forEach((h) => {
      if (h.isClue) code[h.order - 1] = h.digit;
    });
    return code;
  }

  function showToast(msg, ms) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), ms || 1600);
  }

  function renderHotspots() {
    hotspotsEl.innerHTML = '';
    hotspots.forEach((h, idx) => {
      const btn = document.createElement('div');
      btn.className = 'hotspot' + (h.revealed ? ' found' : '');
      btn.innerHTML = `<span>${h.emoji}</span>`;
      if (h.revealed) {
        btn.innerHTML += `<span class="badge">${h.order}</span><span class="tag">${h.digit}</span>`;
      }
      btn.addEventListener('click', () => tapHotspot(idx));
      hotspotsEl.appendChild(btn);
    });
  }

  function updateNotebook() {
    hotspots.forEach((h) => {
      if (h.isClue && h.revealed) {
        notebookSlots[h.order - 1].textContent = h.digit;
        notebookSlots[h.order - 1].classList.add('filled');
      }
    });
  }

  function tapHotspot(idx) {
    if (!gameActive) return;
    const h = hotspots[idx];
    const el = hotspotsEl.children[idx];
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 500);

    if (!h.isClue) {
      showToast(DECOY_LINES[Math.floor(Math.random() * DECOY_LINES.length)]);
      return;
    }
    if (h.revealed) {
      showToast(`メモ済み: ${h.order}番目は ${h.digit}`);
      return;
    }
    if (h.requiredMode === mode) {
      h.revealed = true;
      renderHotspots();
      updateNotebook();
      showToast(`✅ ${h.order}番目の数字は「${h.digit}」だ!`);
    } else {
      const needDark = h.requiredMode === 'dark';
      showToast(needDark ? '🌑 くらやみでないと見えなさそう…' : '☀️ あかりがないとよく見えない…');
    }
  }

  function setMode(next) {
    mode = next;
    room.classList.toggle('dark', mode === 'dark');
    switchBtn.disabled = mode === 'dark' || charges <= 0;
  }

  function toggleSwitch() {
    if (!gameActive || mode === 'dark') return;
    if (charges <= 0) {
      showToast('🔋 バッテリー切れ!');
      return;
    }
    charges--;
    chargesLabel.textContent = `残り${charges}`;
    // 残り時間が減るほど、くらやみでいられる時間が短くなる
    const progress = 1 - Math.max(0, timeLeft) / TOTAL_TIME;
    flickerMax = Math.max(2, FLICKER_DURATION - progress * 2);
    flickerRemaining = flickerMax;
    setMode('dark');
  }

  function updateInputDisplay() {
    const cells = [0, 1, 2].map((i) => (inputBuffer[i] !== undefined ? inputBuffer[i] : '＿'));
    inputDisplay.textContent = cells.join(' ');
  }

  function pressDigit(d) {
    if (!gameActive || inputBuffer.length >= 3) return;
    inputBuffer.push(d);
    updateInputDisplay();
  }

  function clearInput() {
    inputBuffer = [];
    updateInputDisplay();
  }

  function confirmInput() {
    if (!gameActive) return;
    if (inputBuffer.length < 3) {
      showToast('3桁そろえてから押してね');
      return;
    }
    const code = codeDigits();
    const match = code.every((d, i) => d === inputBuffer[i]);
    if (match) {
      endGame(true);
    } else {
      timeLeft = Math.max(0, timeLeft - WRONG_PENALTY);
      clearInput();
      showToast(`❌ ちがう暗証番号だ!(-${WRONG_PENALTY}秒)`);
    }
  }

  function renderKeypad() {
    keypadEl.innerHTML = '';
    for (let d = 0; d <= 9; d++) {
      const b = document.createElement('button');
      b.textContent = String(d);
      b.addEventListener('click', () => pressDigit(d));
      keypadEl.appendChild(b);
    }
  }

  function tick() {
    timeLeft -= 0.1;
    if (mode === 'dark') {
      flickerRemaining -= 0.1;
      if (flickerRemaining <= 0) {
        flickerRemaining = 0;
        setMode('light');
      }
    }
    flickerFill.style.width = `${Math.max(0, (flickerRemaining / flickerMax) * 100)}%`;
    timerBar.style.width = `${Math.max(0, (timeLeft / TOTAL_TIME) * 100)}%`;
    timeLabel.textContent = `TIME ${Math.max(0, Math.ceil(timeLeft))}`;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame(false);
    }
  }

  function endGame(won) {
    if (!gameActive) return;
    gameActive = false;
    clearInterval(ticker);
    if (won) {
      const score = Math.round(timeLeft) * 10 + charges * 20;
      scoreLabel.textContent = `SCORE ${score}`;
      resultTitle.textContent = 'だっしゅつせいこう!';
      resultText.textContent = `残り時間 ${Math.ceil(timeLeft)}秒 / バッテリー${charges}個で SCORE ${score}!`;
    } else {
      const code = codeDigits();
      resultTitle.textContent = 'タイムオーバー…';
      resultText.textContent = `正解は ${code.join('-')} だった。次はもっと早く見つけよう!`;
    }
    resultEl.classList.remove('hidden');
  }

  function newGame() {
    hotspots = buildHotspots();
    mode = 'light';
    charges = MAX_CHARGES;
    flickerRemaining = 0;
    flickerMax = FLICKER_DURATION;
    timeLeft = TOTAL_TIME;
    inputBuffer = [];
    gameActive = false;

    room.classList.remove('dark');
    chargesLabel.textContent = `残り${charges}`;
    switchBtn.disabled = false;
    flickerFill.style.width = '0%';
    timerBar.style.width = '100%';
    timeLabel.textContent = `TIME ${TOTAL_TIME}`;
    scoreLabel.textContent = 'SCORE 0';
    notebookSlots.forEach((s) => {
      s.textContent = '_';
      s.classList.remove('filled');
    });
    renderHotspots();
    updateInputDisplay();
    resultEl.classList.add('hidden');
  }

  function startTicker() {
    gameActive = true;
    clearInterval(ticker);
    ticker = setInterval(tick, 100);
  }

  switchBtn.addEventListener('click', toggleSwitch);
  clearBtn.addEventListener('click', clearInput);
  okBtn.addEventListener('click', confirmInput);

  window.addEventListener('keydown', (evt) => {
    if (!gameActive) return;
    if (evt.key >= '0' && evt.key <= '9') {
      pressDigit(Number(evt.key));
      evt.preventDefault();
    } else if (evt.key === 'Backspace') {
      inputBuffer.pop();
      updateInputDisplay();
      evt.preventDefault();
    } else if (evt.key === 'Enter') {
      confirmInput();
      evt.preventDefault();
    } else if (evt.key === 'l' || evt.key === 'L') {
      toggleSwitch();
      evt.preventDefault();
    }
  });

  startBtn.addEventListener('click', () => {
    introEl.classList.add('hidden');
    newGame();
    startTicker();
  });

  retryBtn.addEventListener('click', () => {
    resultEl.classList.add('hidden');
    newGame();
    startTicker();
  });

  renderKeypad();
  newGame();
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

document.addEventListener('DOMContentLoaded', () => {
  const vpadWrap = document.getElementById('vpadWrap');
  const vpadToggle = document.getElementById('vpadToggle');
  const vpadR = document.getElementById('vpadR');

  function setVpadVisible(v) {
    vpadWrap.classList.toggle('hidden', !v);
  }
  let vpadVisible = false;
  setVpadVisible(vpadVisible);
  vpadToggle.addEventListener('click', () => {
    vpadVisible = !vpadVisible;
    setVpadVisible(vpadVisible);
  });

  function dispatchKey(type, key) {
    const target = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement : window;
    target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  }

  document.querySelectorAll('.vpadBtn').forEach((btn) => {
    const key = btn.dataset.key;
    const press = (e) => { e.preventDefault(); dispatchKey('keydown', key); };
    const release = (e) => { e.preventDefault(); dispatchKey('keyup', key); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  vpadR.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dispatchKey('keydown', 'Enter');
    dispatchKey('keyup', 'Enter');
  });
});
