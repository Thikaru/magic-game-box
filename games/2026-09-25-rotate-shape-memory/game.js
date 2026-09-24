(() => {
  'use strict';

  const PALETTE = ['#ff5d6c', '#5be3c9', '#ffb15a', '#8f7bff'];
  const GOLD_PROB = 0.12;

  const board = document.getElementById('board');
  const bonusBanner = document.getElementById('bonusBanner');
  const goldBanner = document.getElementById('goldBanner');
  const phaseLabel = document.getElementById('phaseLabel');
  const timerBar = document.getElementById('timerBar');
  const memoZone = document.getElementById('memoZone');
  const choices = document.getElementById('choices');
  const cards = [0, 1, 2, 3].map((i) => document.querySelector('.choiceCard[data-idx="' + i + '"]'));
  const cGrids = [0, 1, 2, 3].map((i) => document.getElementById('cGrid' + i));
  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const livesLabel = document.getElementById('livesLabel');

  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type, gain, delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const playCorrect = () => { beep(660, 0.12, 'triangle', 0.15); beep(880, 0.14, 'triangle', 0.13, 0.06); };
  const playWrong = () => { beep(180, 0.25, 'sawtooth', 0.14); };
  const playGold = () => { beep(1046, 0.1, 'square', 0.12); beep(1318, 0.16, 'square', 0.12, 0.08); };
  const playBonus = () => { beep(523, 0.1, 'triangle', 0.13); beep(659, 0.1, 'triangle', 0.13, 0.08); beep(784, 0.18, 'triangle', 0.13, 0.16); };
  const playGameOver = () => { beep(392, 0.16, 'sawtooth', 0.15); beep(261, 0.35, 'sawtooth', 0.15, 0.15); };
  const playReveal = () => { beep(440, 0.1, 'sine', 0.12); };

  function rotateCW(arr, n) {
    const out = new Array(n * n).fill(0);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        out[c * n + (n - 1 - r)] = arr[r * n + c];
      }
    }
    return out;
  }
  function key(arr) { return arr.join(','); }

  function generatePattern(n, colorCount, filledCount) {
    const total = n * n;
    const idxs = [];
    for (let i = 0; i < total; i++) idxs.push(i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    const arr = new Array(total).fill(0);
    for (let i = 0; i < filledCount; i++) {
      arr[idxs[i]] = 1 + Math.floor(Math.random() * colorCount);
    }
    return arr;
  }

  function mutate(base, n, colorCount) {
    const out = base.slice();
    const filledIdx = [];
    const emptyIdx = [];
    out.forEach((v, i) => { if (v) filledIdx.push(i); else emptyIdx.push(i); });
    const roll = Math.random();
    if (roll < 0.34 && filledIdx.length > 0) {
      const idx = filledIdx[Math.floor(Math.random() * filledIdx.length)];
      let newColor = out[idx];
      if (colorCount > 1) {
        do { newColor = 1 + Math.floor(Math.random() * colorCount); } while (newColor === out[idx]);
      }
      out[idx] = newColor;
    } else if (roll < 0.68 && filledIdx.length > 0 && emptyIdx.length > 0) {
      const idx = filledIdx[Math.floor(Math.random() * filledIdx.length)];
      const color = out[idx];
      const r = Math.floor(idx / n), c = idx % n;
      const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => rr >= 0 && rr < n && cc >= 0 && cc < n)
        .map(([rr, cc]) => rr * n + cc)
        .filter((i2) => !out[i2]);
      const target = neighbors.length ? neighbors[Math.floor(Math.random() * neighbors.length)]
        : emptyIdx[Math.floor(Math.random() * emptyIdx.length)];
      out[idx] = 0; out[target] = color;
    } else if (emptyIdx.length > 0 && Math.random() < 0.5 && filledIdx.length < n * n - 1) {
      const idx = emptyIdx[Math.floor(Math.random() * emptyIdx.length)];
      out[idx] = 1 + Math.floor(Math.random() * colorCount);
    } else if (filledIdx.length > 1) {
      const idx = filledIdx[Math.floor(Math.random() * filledIdx.length)];
      out[idx] = 0;
    } else if (filledIdx.length > 0) {
      const idx = filledIdx[0];
      out[idx] = (out[idx] % colorCount) + 1;
    }
    return out;
  }

  function makeDecoy(rotations, n, colorCount, validKeys, usedKeys) {
    let candidate;
    let tries = 0;
    do {
      const base = rotations[Math.floor(Math.random() * rotations.length)];
      candidate = mutate(base, n, colorCount);
      tries++;
    } while ((validKeys.has(key(candidate)) || usedKeys.has(key(candidate))) && tries < 25);
    if (validKeys.has(key(candidate)) || usedKeys.has(key(candidate))) {
      candidate = mutate(mutate(rotations[0], n, colorCount), n, colorCount);
    }
    usedKeys.add(key(candidate));
    return candidate;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderGridInto(container, arr, n) {
    container.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
    container.style.gridTemplateRows = 'repeat(' + n + ',1fr)';
    container.innerHTML = '';
    arr.forEach((v) => {
      const d = document.createElement('div');
      d.className = 'cell' + (v ? ' filled' : '');
      if (v) d.style.background = PALETTE[v - 1];
      container.appendChild(d);
    });
  }

  // Static example for the intro overlay
  (function renderExample() {
    const exOrig = document.getElementById('exOrig');
    const exRot = document.getElementById('exRot');
    const ex = [0, 1, 0, 0, 0, 2, 1, 0, 0];
    renderGridInto(exOrig, ex, 3);
    renderGridInto(exRot, rotateCW(ex, 3), 3);
  })();

  let score, combo, lives, correctCount, running, awaitingInput;
  let n, colorCount, filledCount, memorizeMs, answerMs;
  let bonusActive, bonusPending, goldRound;
  let choiceSet, correctChoiceIndex;
  let phaseTimeoutId, nextTimeoutId, barTransitionEndHandler;

  function computeDifficulty() {
    n = correctCount >= 10 ? 4 : 3;
    colorCount = Math.min(2 + Math.floor(correctCount / 6), PALETTE.length);
    filledCount = Math.min(3 + Math.floor(correctCount / 5), n * n - 2);
    memorizeMs = Math.max(3000 - correctCount * 60, 1200);
    answerMs = Math.max(6500 - correctCount * 90, 2500);
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + score;
    comboLabel.textContent = 'COMBO ' + combo;
    livesLabel.textContent = '♥'.repeat(Math.max(lives, 0)) + '🖤'.repeat(3 - Math.max(lives, 0));
  }

  function resetState() {
    score = 0; combo = 0; lives = 3; correctCount = 0;
    running = true; awaitingInput = false;
    bonusActive = false; bonusPending = false;
    clearTimeout(phaseTimeoutId); clearTimeout(nextTimeoutId);
    updateHud();
  }

  function runTimerBar(ms) {
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    timerBar.className = 'timerBar';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width ' + ms + 'ms linear';
    timerBar.style.width = '0%';
    if (ms < 1400) timerBar.classList.add('warn');
    if (ms < 900) timerBar.classList.add('danger2');
  }

  function startRound() {
    if (!running) return;
    computeDifficulty();
    clearTimeout(phaseTimeoutId); clearTimeout(nextTimeoutId);

    goldRound = Math.random() < GOLD_PROB;
    goldBanner.classList.toggle('show', goldRound);

    if (bonusPending) {
      bonusPending = false;
      bonusActive = true;
      bonusBanner.classList.add('show');
      playBonus();
    } else {
      bonusActive = false;
      bonusBanner.classList.remove('show');
    }

    const pattern = generatePattern(n, colorCount, filledCount);
    const rotations = [pattern];
    for (let i = 1; i < 4; i++) rotations.push(rotateCW(rotations[i - 1], n));
    const validKeys = new Set(rotations.map(key));
    const correctGrid = rotations[Math.floor(Math.random() * 4)];
    const usedKeys = new Set([key(correctGrid)]);
    const decoys = [
      makeDecoy(rotations, n, colorCount, validKeys, usedKeys),
      makeDecoy(rotations, n, colorCount, validKeys, usedKeys),
      makeDecoy(rotations, n, colorCount, validKeys, usedKeys),
    ];
    const entries = shuffle([
      { grid: correctGrid, correct: true },
      { grid: decoys[0], correct: false },
      { grid: decoys[1], correct: false },
      { grid: decoys[2], correct: false },
    ]);
    choiceSet = entries;
    correctChoiceIndex = entries.findIndex((e) => e.correct);

    memoZone.classList.add('show');
    choices.classList.remove('show');
    cards.forEach((c) => c.classList.remove('correctFlash', 'wrongFlash', 'pickedFlash', 'disabledCard'));

    phaseLabel.innerHTML = 'この形を <b>おぼえて!</b>';
    renderGridInto(memoZone, pattern, n);
    const memMs = Math.round(memorizeMs * (bonusActive ? 1.3 : 1));
    runTimerBar(memMs);
    awaitingInput = false;
    phaseTimeoutId = setTimeout(showChoices, memMs);
  }

  function showChoices() {
    if (!running) return;
    memoZone.classList.remove('show');
    choices.classList.add('show');
    phaseLabel.innerHTML = '回転させただけの図形は <b>どれ?</b>';

    choiceSet.forEach((entry, i) => {
      renderGridInto(cGrids[i], entry.grid, n);
    });

    const ansMs = Math.round(answerMs * (bonusActive ? 1.3 : 1));
    runTimerBar(ansMs);
    awaitingInput = true;
    phaseTimeoutId = setTimeout(() => handleAnswer(null), ansMs);
  }

  function handleAnswer(idx) {
    if (!awaitingInput || !running) return;
    awaitingInput = false;
    clearTimeout(phaseTimeoutId);
    cards.forEach((c) => c.classList.add('disabledCard'));

    const correct = idx === correctChoiceIndex;

    if (correct) {
      correctCount++;
      combo++;
      const mult = 1 + Math.min(Math.floor(combo / 5) * 0.5, 2);
      let gained = Math.round(100 * mult) * (bonusActive ? 2 : 1);
      cards[idx].classList.add('correctFlash');
      if (goldRound) {
        gained += 150;
        lives = Math.min(3, lives + 1);
        playGold();
      } else {
        playCorrect();
      }
      score += gained;
      if (combo > 0 && combo % 5 === 0) bonusPending = true;
    } else {
      lives--;
      combo = 0;
      cards[correctChoiceIndex].classList.add('correctFlash');
      if (idx !== null) {
        cards[idx].classList.add('wrongFlash');
        playWrong();
      } else {
        playReveal();
      }
    }
    bonusActive = false;
    bonusBanner.classList.remove('show');
    goldBanner.classList.remove('show');
    updateHud();

    if (lives <= 0) {
      nextTimeoutId = setTimeout(gameOver, 700);
      return;
    }
    nextTimeoutId = setTimeout(startRound, 700);
  }

  function gameOver() {
    running = false;
    awaitingInput = false;
    clearTimeout(phaseTimeoutId); clearTimeout(nextTimeoutId);
    playGameOver();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent =
      'スコア ' + score + ' てん・通算正解 ' + correctCount + '問(最大 ' + n + '×' + n + ' マスまで到達)';
    result.classList.remove('hidden');
  }

  function startGame() {
    result.classList.add('hidden');
    resetState();
    startRound();
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    intro.classList.add('hidden');
    startGame();
  });
  retryBtn.addEventListener('click', () => {
    initAudio();
    startGame();
  });

  cards.forEach((card, i) => {
    card.addEventListener('click', () => handleAnswer(i));
  });

  document.addEventListener('keydown', (e) => {
    if (!awaitingInput) return;
    if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
      e.preventDefault();
      handleAnswer(Number(e.key) - 1);
    }
  });
})();
