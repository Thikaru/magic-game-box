(() => {
  'use strict';

  const CATS = [
    { name: 'どうぶつ', items: [['🐶','いぬ'],['🐱','ねこ'],['🐭','ねずみ'],['🐹','はむすたー'],['🐰','うさぎ'],['🐻','くま'],['🐼','ぱんだ'],['🦁','らいおん'],['🐯','とら'],['🐨','こあら']] },
    { name: 'くだもの', items: [['🍎','りんご'],['🍌','ばなな'],['🍇','ぶどう'],['🍉','すいか'],['🍓','いちご'],['🍑','もも'],['🍍','ぱいなっぷる'],['🥝','きうい'],['🍒','さくらんぼ'],['🍋','れもん']] },
    { name: 'のりもの', items: [['🚗','くるま'],['🚌','ばす'],['🚲','じてんしゃ'],['🚂','きしゃ'],['🚁','へりこぷたー'],['✈️','ひこうき'],['🚢','ふね'],['🚑','きゅうきゅうしゃ'],['🚒','しょうぼうしゃ'],['🚀','ろけっと']] },
    { name: 'てんき', items: [['☀️','はれ'],['🌧️','あめ'],['⛄','ゆきだるま'],['❄️','ゆき'],['🌈','にじ'],['⚡','かみなり'],['🌪️','たつまき'],['☁️','くもり'],['🌫️','きり'],['🌊','なみ']] },
    { name: 'がっき', items: [['🎸','ぎたー'],['🎹','ぴあの'],['🥁','たいこ'],['🎻','ばいおりん'],['🎺','とらんぺっと'],['🎷','さっくす'],['🪕','ばんじょー'],['🪗','あこーでぃおん']] },
    { name: 'スポーツ', items: [['⚽','さっかー'],['🏀','ばすけ'],['🎾','てにす'],['⚾','やきゅう'],['🏈','あめふと'],['🏐','ばれー'],['🏓','たっきゅう'],['🥊','ぼくしんぐ']] },
    { name: 'ぶんぼうぐ', items: [['✏️','えんぴつ'],['📏','じょうぎ'],['✂️','はさみ'],['📎','くりっぷ'],['🖊️','ぺん'],['📐','さんかくじょうぎ'],['📌','がびょう']] },
    { name: 'むし', items: [['🐛','いもむし'],['🐝','はち'],['🐞','てんとうむし'],['🦋','ちょう'],['🐜','あり'],['🕷️','くも'],['🦗','こおろぎ']] },
    { name: 'うみのいきもの', items: [['🐟','さかな'],['🐠','ねったいぎょ'],['🐬','いるか'],['🐳','くじら'],['🦈','さめ'],['🐙','たこ'],['🦑','いか'],['🦀','かに']] },
    { name: 'かぐ', items: [['🛏️','べっど'],['🪑','いす'],['🚪','どあ'],['🛋️','そふぁ'],['🪞','かがみ'],['🗄️','たんす']] },
  ];

  const STAGES = [
    { min: 0, emoji: '🥚', label: 'たまご' },
    { min: 20, emoji: '🐣', label: 'ひよこ' },
    { min: 40, emoji: '🐤', label: 'こどり' },
    { min: 60, emoji: '🐥', label: 'わかどり' },
    { min: 80, emoji: '🐔', label: 'にわとり' },
    { min: 100, emoji: '🦚', label: 'くじゃく' },
  ];

  const LIFE_MAX = 3;
  const TIME_START = 6.0;
  const TIME_FLOOR = 2.2;
  const TIME_STEP = 0.12;
  const BONUS_EVERY = 5;

  const $ = (id) => document.getElementById(id);
  const toastEl = $('toast');
  const scoreLabel = $('scoreLabel');
  const comboLabel = $('comboLabel');
  const livesLabel = $('livesLabel');
  const timebar = $('timebar');
  const petEmoji = $('petEmoji');
  const petLabel = $('petLabel');
  const growthBar = $('growthBar');
  const bonusBanner = $('bonusBanner');
  const catLabel = $('catLabel');
  const choicesEl = $('choices');
  const introEl = $('intro');
  const resultEl = $('result');
  const resultTitle = $('resultTitle');
  const resultText = $('resultText');
  const startBtn = $('startBtn');
  const retryBtn = $('retryBtn');

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
  }
  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  const sndCorrect = () => { beep(660, 0.09, 'square', 0.18); beep(880, 0.12, 'square', 0.15); };
  const sndWrong = () => { beep(180, 0.22, 'sawtooth', 0.2); };
  const sndBonus = () => { beep(523, 0.08, 'triangle', 0.18); beep(659, 0.08, 'triangle', 0.18); beep(784, 0.14, 'triangle', 0.18); };
  const sndOver = () => { beep(320, 0.15, 'sawtooth', 0.2); beep(220, 0.3, 'sawtooth', 0.2); };

  let score = 0;
  let combo = 0;
  let totalCorrect = 0;
  let lives = LIFE_MAX;
  let growth = 0;
  let lastMainIdx = -1;
  let timeLimit = TIME_START;
  let timeLeft = TIME_START;
  let rafId = null;
  let lastTs = 0;
  let running = false;
  let locked = false;

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 700);
  }

  function stageFor(g) {
    let s = STAGES[0];
    for (const st of STAGES) if (g >= st.min) s = st;
    return s;
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(lives) + '♡'.repeat(LIFE_MAX - lives);
    const st = stageFor(growth);
    petEmoji.textContent = st.emoji;
    petLabel.textContent = st.label;
    growthBar.style.width = growth + '%';
  }

  let currentOptions = [];

  function nextRound() {
    locked = false;
    const isBonus = totalCorrect > 0 && totalCorrect % BONUS_EVERY === 0 && totalCorrect !== lastBonusAt;
    bonusBanner.classList.toggle('show', isBonus);

    let mainIdx, otherIdx;
    do { mainIdx = rnd(CATS.length); } while (mainIdx === lastMainIdx && CATS.length > 1);
    lastMainIdx = mainIdx;
    do { otherIdx = rnd(CATS.length); } while (otherIdx === mainIdx);

    const mainItems = shuffle(CATS[mainIdx].items).slice(0, 3);
    const otherItem = CATS[otherIdx].items[rnd(CATS[otherIdx].items.length)];

    currentOptions = shuffle([
      ...mainItems.map((it) => ({ emoji: it[0], label: it[1], correct: false })),
      { emoji: otherItem[0], label: otherItem[1], correct: true },
    ]);

    catLabel.innerHTML = '「<b>' + CATS[mainIdx].name + '</b>」の中から仲間はずれをタップ!';

    choicesEl.innerHTML = '';
    currentOptions.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'choice';
      div.dataset.idx = i;
      div.innerHTML = '<span class="em">' + opt.emoji + '</span><span class="lbl">' + opt.label + '</span>';
      div.addEventListener('click', () => handlePick(i));
      choicesEl.appendChild(div);
    });

    timeLimit = Math.max(TIME_FLOOR, TIME_START - totalCorrect * TIME_STEP);
    timeLeft = timeLimit;
    timebar.style.width = '100%';
    timebar.classList.remove('low');
  }

  let lastBonusAt = 0;

  function handlePick(i) {
    if (locked || !running) return;
    locked = true;
    const opt = currentOptions[i];
    const nodes = choicesEl.children;
    if (opt.correct) {
      nodes[i].classList.add('correct');
      onCorrect();
    } else {
      nodes[i].classList.add('wrong');
      for (let k = 0; k < currentOptions.length; k++) {
        if (currentOptions[k].correct) nodes[k].classList.add('correct');
      }
      onWrong();
    }
    for (const n of nodes) n.classList.add('disabled');
    setTimeout(() => { if (running) nextRound(); }, opt.correct ? 420 : 750);
  }

  function onCorrect() {
    const isBonus = bonusBanner.classList.contains('show');
    if (isBonus) lastBonusAt = totalCorrect;
    combo++;
    totalCorrect++;
    const base = 10 + Math.min(combo, 10) * 2;
    const gained = isBonus ? base * 2 : base;
    score += gained;
    growth = Math.min(100, growth + 12);
    sndCorrect();
    if (isBonus) sndBonus();
    toast(isBonus ? '✨+' + gained : '+' + gained);
    updateHud();
  }

  function onWrong() {
    combo = 0;
    lives--;
    growth = Math.max(0, growth - 10);
    sndWrong();
    toast('ミス!');
    updateHud();
    if (lives <= 0) {
      setTimeout(gameOver, 700);
    }
  }

  function onTimeout() {
    if (locked || !running) return;
    locked = true;
    const nodes = choicesEl.children;
    for (let k = 0; k < currentOptions.length; k++) {
      if (currentOptions[k].correct) nodes[k].classList.add('correct');
    }
    for (const n of nodes) n.classList.add('disabled');
    combo = 0;
    lives--;
    growth = Math.max(0, growth - 10);
    sndWrong();
    toast('タイムアップ!');
    updateHud();
    if (lives <= 0) {
      setTimeout(gameOver, 700);
    } else {
      setTimeout(() => { if (running) nextRound(); }, 750);
    }
  }

  function tick(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (!locked) {
      timeLeft -= dt;
      const pct = Math.max(0, (timeLeft / timeLimit) * 100);
      timebar.style.width = pct + '%';
      timebar.classList.toggle('low', pct < 30);
      if (timeLeft <= 0) {
        onTimeout();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function gameOver() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    sndOver();
    const st = stageFor(growth);
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = 'スコア ' + score + ' / せいちょう段階「' + st.label + st.emoji +
      '」/ 正解数 ' + totalCorrect + '問';
    resultEl.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    score = 0; combo = 0; totalCorrect = 0; lives = LIFE_MAX; growth = 0;
    lastMainIdx = -1; lastBonusAt = 0; locked = false; lastTs = 0;
    updateHud();
    resultEl.classList.add('hidden');
    introEl.classList.add('hidden');
    bonusBanner.classList.remove('show');
    running = true;
    nextRound();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  document.addEventListener('keydown', (e) => {
    if (!running || locked) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      const idx = n - 1;
      if (idx < currentOptions.length) handlePick(idx);
    }
  });

  updateHud();
})();
