(() => {
  const COLORS = [
    { key: 'red', name: 'あか', hex: '#ff5d6c' },
    { key: 'blue', name: 'あお', hex: '#4fc3f7' },
    { key: 'yellow', name: 'きいろ', hex: '#ffd23f' },
    { key: 'green', name: 'みどり', hex: '#66d18a' },
    { key: 'purple', name: 'むらさき', hex: '#b388ff' },
    { key: 'orange', name: 'だいだい', hex: '#ff9f45' },
  ];
  const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.key, c]));

  const TIERS = [
    { colors: 3, cols: 3, rows: 3 },
    { colors: 4, cols: 4, rows: 3 },
    { colors: 4, cols: 4, rows: 4 },
    { colors: 5, cols: 5, rows: 4 },
    { colors: 6, cols: 5, rows: 4 },
    { colors: 6, cols: 6, rows: 4 },
  ];

  const SHOW_START = 4000, SHOW_STEP = 120, SHOW_FLOOR = 1200;
  const ASK_START = 6000, ASK_STEP = 80, ASK_FLOOR = 3000;
  const NEXT_ROUND_DELAY = 900;

  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const phaseLabel = document.getElementById('phaseLabel');
  const sceneGrid = document.getElementById('sceneGrid');
  const questionEl = document.getElementById('question');
  const timerBar = document.getElementById('timerBar');
  const feedback = document.getElementById('feedback');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');
  const answerGrid = document.getElementById('answerGrid');

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.18, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sndCorrect() { beep(720, 0.12, 'square', 0.16); beep(1080, 0.1, 'square', 0.1); }
  function sndBonus() { beep(880, 0.1, 'triangle', 0.18); beep(1320, 0.14, 'triangle', 0.16); }
  function sndMiss() { beep(180, 0.22, 'sawtooth', 0.2); }
  function sndGameOver() { beep(300, 0.15, 'sawtooth', 0.2); setTimeout(() => beep(180, 0.3, 'sawtooth', 0.2), 130); }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  let running = false;
  let score = 0, combo = 0, lives = 3, level = 0;
  let phase = 'idle';
  let answered = false;
  let bonusPending = false;
  let isBonus = false;
  let timerHandle = null;
  let sceneColors = [];
  let currentQuestion = null;
  let cellEls = [];

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(0, lives)) + '🖤'.repeat(3 - Math.max(0, lives));
  }

  function tierFor(lv) {
    return TIERS[Math.min(Math.floor(lv / 3), TIERS.length - 1)];
  }

  function buildScene(colorsCount, cells) {
    const palette = COLORS.slice(0, colorsCount).map(c => c.key);
    const arr = palette.slice();
    for (let i = colorsCount; i < cells; i++) {
      arr.push(palette[Math.floor(Math.random() * colorsCount)]);
    }
    return shuffle(arr);
  }

  function tally(arr) {
    const counts = {};
    arr.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    return counts;
  }

  function generateNumberChoices(correct, maxCells) {
    const set = new Set([correct]);
    let attempts = 0;
    while (set.size < 4 && attempts < 60) {
      attempts++;
      const delta = Math.floor(Math.random() * 7) - 3;
      if (delta === 0) continue;
      const val = correct + delta;
      if (val < 0 || val > maxCells) continue;
      set.add(val);
    }
    let val = 0;
    while (set.size < 4 && val <= maxCells) { set.add(val); val++; }
    return shuffle([...set]);
  }

  function pickQuestion(colorsCount, counts, palette, bonus, cells) {
    let maxColors = [];
    if (colorsCount >= 4) {
      const maxVal = Math.max(...palette.map(c => counts[c]));
      maxColors = palette.filter(c => counts[c] === maxVal);
    }
    let type = 'count';
    if (!bonus && colorsCount >= 4 && maxColors.length === 1 && Math.random() < 0.5) {
      type = 'max';
    }
    if (type === 'count') {
      const target = palette[Math.floor(Math.random() * palette.length)];
      const correct = counts[target];
      const choices = generateNumberChoices(correct, cells).map(v => ({ value: v, label: String(v) }));
      return {
        type, target, correct,
        text: `${COLOR_MAP[target].name}の丸は何個あった?`,
        choices,
      };
    }
    const target = maxColors[0];
    const others = shuffle(palette.filter(c => c !== target)).slice(0, 3);
    const choiceKeys = shuffle([target, ...others]);
    return {
      type, target, correct: target,
      text: 'いちばん多かった色は?',
      choices: choiceKeys.map(k => ({ value: k, label: COLOR_MAP[k].name, swatch: COLOR_MAP[k].hex })),
    };
  }

  function renderGrid(tier, colored) {
    sceneGrid.style.gridTemplateColumns = `repeat(${tier.cols}, 1fr)`;
    sceneGrid.innerHTML = '';
    cellEls = sceneColors.map(key => {
      const div = document.createElement('div');
      div.className = 'cell';
      if (colored) {
        div.style.background = COLOR_MAP[key].hex;
        div.textContent = '';
      } else {
        div.style.background = '#22303e';
        div.textContent = '❓';
      }
      sceneGrid.appendChild(div);
      return div;
    });
  }

  function renderAnswers(choices) {
    answerGrid.innerHTML = '';
    choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'answerBtn';
      btn.dataset.index = idx;
      if (choice.swatch) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = choice.swatch;
        btn.appendChild(dot);
      }
      const text = document.createElement('span');
      text.textContent = choice.label;
      btn.appendChild(text);
      answerGrid.appendChild(btn);
    });
  }

  function runTimer(duration, bonus, onDone) {
    timerBar.classList.toggle('bonus', bonus);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + duration + 'ms linear';
    timerBar.style.width = '0%';
    timerHandle = setTimeout(onDone, duration);
  }

  function startRound() {
    answered = false;
    feedback.textContent = '';
    feedback.className = 'feedback';
    questionEl.textContent = '';
    answerGrid.classList.add('hidden');
    answerGrid.innerHTML = '';

    isBonus = bonusPending;
    bonusPending = false;

    const tier = tierFor(level);
    const cells = tier.cols * tier.rows;
    sceneColors = buildScene(tier.colors, cells);
    const counts = tally(sceneColors);
    const palette = COLORS.slice(0, tier.colors).map(c => c.key);
    currentQuestion = pickQuestion(tier.colors, counts, palette, isBonus, cells);

    phase = 'show';
    phaseLabel.textContent = isBonus ? '🌟 ボーナス!覚えて!' : '覚えて!';
    phaseLabel.classList.toggle('bonus', isBonus);
    renderGrid(tier, true);

    let showTime = Math.max(SHOW_FLOOR, SHOW_START - level * SHOW_STEP);
    if (isBonus) showTime = Math.round(showTime * 1.4);
    runTimer(showTime, isBonus, goAsk);
  }

  function goAsk() {
    if (!running) return;
    phase = 'ask';
    phaseLabel.textContent = isBonus ? '🌟 こたえて!' : 'こたえて!';
    renderGrid(tierFor(level), false);
    questionEl.textContent = currentQuestion.text;
    renderAnswers(currentQuestion.choices);
    answerGrid.classList.remove('hidden');

    let askTime = Math.max(ASK_FLOOR, ASK_START - level * ASK_STEP);
    if (isBonus) askTime = Math.round(askTime * 1.3);
    runTimer(askTime, isBonus, () => handleAnswer(null));
  }

  function handleAnswer(chosenValue) {
    if (!running || phase !== 'ask' || answered) return;
    answered = true;
    clearTimeout(timerHandle);

    Array.from(answerGrid.children).forEach(btn => { btn.disabled = true; });

    const success = chosenValue !== null && chosenValue === currentQuestion.correct;

    if (success) {
      combo++;
      level++;
      const mult = Math.min(4, 1 + Math.floor(combo / 5));
      let gained = 10 * mult;
      if (isBonus) gained *= 2;
      score += gained;
      feedback.textContent = (isBonus ? '🌟 大正解! +' : '正解! +') + gained;
      feedback.classList.add('ok');
      if (isBonus) sndBonus(); else sndCorrect();
      if (combo % 5 === 0) bonusPending = true;
    } else {
      combo = 0;
      lives--;
      const correctLabel = currentQuestion.choices.find(c => c.value === currentQuestion.correct);
      const why = chosenValue === null ? '時間切れ…' : 'ちがった…';
      feedback.textContent = `${why} 正解は「${correctLabel ? correctLabel.label : currentQuestion.correct}」`;
      feedback.classList.add('ng');
      sndMiss();
    }
    updateHud();

    if (lives <= 0) {
      setTimeout(gameOver, 600);
      return;
    }
    setTimeout(startRound, NEXT_ROUND_DELAY);
  }

  function gameOver() {
    running = false;
    sndGameOver();
    resultTitle.textContent = 'クイズ終了!';
    resultText.textContent = `スコア ${score} / さいごのレベル ${level}`;
    result.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    score = 0; combo = 0; lives = 3; level = 0; bonusPending = false;
    updateHud();
    result.classList.add('hidden');
    intro.classList.add('hidden');
    running = true;
    startRound();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  answerGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.answerBtn');
    if (!btn || !running || btn.disabled) return;
    const idx = Number(btn.dataset.index);
    handleAnswer(currentQuestion.choices[idx].value);
  });

  window.addEventListener('keydown', (e) => {
    if (!running || phase !== 'ask') return;
    const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (idx === undefined) return;
    if (!currentQuestion.choices[idx]) return;
    handleAnswer(currentQuestion.choices[idx].value);
  });

  updateHud();
})();
