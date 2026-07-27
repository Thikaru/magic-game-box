(() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RED_SUITS = new Set(['♥', '♦']);
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  const livesEl = document.getElementById('lives');
  const comboEl = document.getElementById('comboLabel');
  const scoreEl = document.getElementById('scoreLabel');
  const goldenBanner = document.getElementById('goldenBanner');
  const cardBox = document.getElementById('cardBox');
  const cardRankEl = document.getElementById('cardRank');
  const cardSuitEl = document.getElementById('cardSuit');
  const segHigh = document.getElementById('segHigh');
  const segSame = document.getElementById('segSame');
  const segLow = document.getElementById('segLow');
  const highCountEl = document.getElementById('highCount');
  const sameCountEl = document.getElementById('sameCount');
  const lowCountEl = document.getElementById('lowCount');
  const flashMsg = document.getElementById('flashMsg');
  const oddsRow = document.querySelector('.oddsRow');
  const HIDE_ODDS_COMBO = 6;
  const lowBtn = document.getElementById('lowBtn');
  const sameBtn = document.getElementById('sameBtn');
  const highBtn = document.getElementById('highBtn');
  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  let deck = [];
  let current = null;
  let lives = 3;
  let score = 0;
  let combo = 0;
  let comboMax = 0;
  let goldenActive = false;
  let locked = false;
  let started = false;
  let paused = false;
  let flashTimer = null;

  function newDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) {
      for (let r = 1; r <= 13; r++) d.push({ r, s });
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function drawCard() {
    if (deck.length === 0) deck = newDeck();
    return deck.pop();
  }

  function renderCard(card) {
    const label = RANK_LABEL[card.r] || String(card.r);
    const suit = SUITS[card.s];
    const isRed = RED_SUITS.has(suit);
    cardRankEl.textContent = label;
    cardSuitEl.textContent = suit;
    cardRankEl.className = 'rank ' + (isRed ? 'red' : 'black');
    cardSuitEl.className = 'suit ' + (isRed ? 'red' : 'black');
  }

  function updateHUD() {
    livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    comboEl.textContent = 'コンボ ' + combo;
    scoreEl.textContent = 'SCORE ' + score;
  }

  function updateOdds() {
    const highC = deck.filter(c => c.r > current.r).length;
    const sameC = deck.filter(c => c.r === current.r).length;
    const lowC = deck.filter(c => c.r < current.r).length;
    const total = highC + sameC + lowC;
    segHigh.style.flex = total ? highC : 1;
    segSame.style.flex = total ? sameC : 1;
    segLow.style.flex = total ? lowC : 1;
    highCountEl.textContent = highC;
    sameCountEl.textContent = sameC;
    lowCountEl.textContent = lowC;
    // コンボが伸びるほど残り枚数の目安を隠して難しくする
    oddsRow.style.visibility = combo >= HIDE_ODDS_COMBO ? 'hidden' : 'visible';
  }

  function updateGoldenUI() {
    goldenBanner.classList.toggle('hidden', !goldenActive);
    cardBox.classList.toggle('golden', goldenActive);
  }

  function flash(text, cls) {
    clearTimeout(flashTimer);
    flashMsg.textContent = text;
    flashMsg.className = 'flashMsg ' + cls;
    flashTimer = setTimeout(() => { flashMsg.textContent = ''; flashMsg.className = 'flashMsg'; }, 900);
  }

  function setButtonsEnabled(enabled) {
    lowBtn.disabled = !enabled;
    sameBtn.disabled = !enabled;
    highBtn.disabled = !enabled;
  }

  function handleGuess(type) {
    if (!started || locked || paused) return;
    locked = true;
    setButtonsEnabled(false);

    const isGolden = goldenActive;
    const nextCard = drawCard();

    let correct;
    if (nextCard.r === current.r) correct = (type === 'same');
    else if (nextCard.r > current.r) correct = (type === 'high');
    else correct = (type === 'low');

    if (correct) {
      combo++;
      comboMax = Math.max(comboMax, combo);
      const base = type === 'same' ? 50 : 10;
      let mult = 1 + Math.floor(combo / 3) * 0.5;
      if (isGolden) mult *= 3;
      const pts = Math.round(base * mult);
      score += pts;
      flash('せいかい! +' + pts, 'ok');
    } else {
      combo = 0;
      const lifeLoss = isGolden ? 2 : 1;
      lives = Math.max(0, lives - lifeLoss);
      flash(isGolden ? 'はずれ… ライフ-2' : 'はずれ…', 'bad');
    }

    goldenActive = combo > 0 && combo % 4 === 0;
    updateGoldenUI();
    updateHUD();

    current = nextCard;
    renderCard(current);
    updateOdds();

    setTimeout(() => {
      if (lives <= 0) {
        endGame();
      } else {
        locked = false;
        setButtonsEnabled(true);
      }
    }, 700);
  }

  function endGame() {
    started = false;
    resultTitle.textContent = 'ゲームオーバー';
    resultText.innerHTML = 'スコア: <b>' + score + '</b><br>最大コンボ: <b>' + comboMax + '</b>';
    result.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }

  function init() {
    deck = newDeck();
    current = drawCard();
    lives = 3;
    score = 0;
    combo = 0;
    comboMax = 0;
    goldenActive = false;
    locked = false;
    started = true;
    paused = false;

    renderCard(current);
    updateHUD();
    updateOdds();
    updateGoldenUI();
    flashMsg.textContent = '';
    flashMsg.className = 'flashMsg';
    setButtonsEnabled(true);
    result.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  }

  const pauseBtn = document.getElementById('pauseBtn');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');

  pauseBtn.addEventListener('click', () => {
    if (!started || paused) return;
    paused = true;
    setButtonsEnabled(false);
    pauseOverlay.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  });
  resumeBtn.addEventListener('click', () => {
    if (!paused) return;
    paused = false;
    if (!locked) setButtonsEnabled(true);
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  });
  restartBtn.addEventListener('click', () => {
    pauseOverlay.classList.add('hidden');
    init();
  });

  startBtn.addEventListener('click', () => {
    intro.classList.add('hidden');
    init();
  });

  retryBtn.addEventListener('click', () => {
    result.classList.add('hidden');
    init();
  });

  lowBtn.addEventListener('click', () => handleGuess('low'));
  sameBtn.addEventListener('click', () => handleGuess('same'));
  highBtn.addEventListener('click', () => handleGuess('high'));

  document.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.key === 'ArrowUp') { handleGuess('high'); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { handleGuess('low'); e.preventDefault(); }
    else if (e.code === 'Space') { handleGuess('same'); e.preventDefault(); }
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
