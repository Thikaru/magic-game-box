(() => {
  'use strict';

  const introEl = document.getElementById('intro');
  const resultEl = document.getElementById('result');
  const resultTitleEl = document.getElementById('resultTitle');
  const resultTextEl = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const hpLabelEl = document.getElementById('hpLabel');
  const stageLabelEl = document.getElementById('stageLabel');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const phaseLabelEl = document.getElementById('phaseLabel');
  const memoBarEl = document.getElementById('memoBar');
  const memoBarFillEl = document.getElementById('memoBarFill');
  const tilesEl = document.getElementById('tiles');
  const runnerEl = document.getElementById('runner');
  const flashMsgEl = document.getElementById('flashMsg');
  const btnLeft = document.getElementById('btnLeft');
  const btnStraight = document.getElementById('btnStraight');
  const btnRight = document.getElementById('btnRight');

  const ICON = { L: '⬅️', S: '⬆️', R: '➡️' };

  function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- audio (created only after a user gesture) ----
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
  }
  function beep(freq, dur, type, vol) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.08;
    osc.connect(gain).connect(actx.destination);
    const now = actx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }
  const sfxCorrect = () => beep(660, 0.09, 'triangle', 0.08);
  const sfxWrong = () => beep(140, 0.22, 'sawtooth', 0.09);
  const sfxStageClear = () => { beep(520, 0.09, 'square', 0.07); setTimeout(() => beep(700, 0.1, 'square', 0.07), 90); setTimeout(() => beep(880, 0.14, 'square', 0.07), 180); };
  const sfxLifeUp = () => { beep(500, 0.08, 'triangle', 0.07); setTimeout(() => beep(760, 0.12, 'triangle', 0.07), 80); };
  const sfxOver = () => { beep(260, 0.2, 'sawtooth', 0.09); setTimeout(() => beep(140, 0.4, 'sawtooth', 0.09), 150); };
  const sfxGo = () => beep(440, 0.1, 'square', 0.07);

  // ---- state ----
  let state = 'idle'; // idle | memorize | run | reveal | clear | over
  let stage = 1;
  let lives = 3;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let sequence = [];
  let answered = [];
  let currentIndex = 0;
  let timer = 0;     // seconds remaining in current sub-phase
  let phaseDur = 0;  // total duration of current sub-phase (for bar scaling)
  let tileTimeLimit = 1.6;
  let flashTimer = 0;
  let lastTs = null;

  function seqLenForStage(n) { return clamp(3 + Math.floor((n - 1) / 2), 3, 8); }
  function memoTimeForStage(n, len) { return clamp(1.8 + len * 0.5 - n * 0.05, 1.8, 6); }
  function tileTimeForStage(n) { return clamp(2.2 - n * 0.11, 0.9, 2.2); }

  function genSequence(len) {
    const dirs = ['L', 'S', 'R'];
    const seq = [];
    for (let i = 0; i < len; i++) {
      let d;
      let guard = 0;
      do {
        d = dirs[randomInt(0, 2)];
        guard++;
      } while (i >= 2 && seq[i - 1] === d && seq[i - 2] === d && guard < 20);
      seq.push(d);
    }
    return seq;
  }

  function updateHud() {
    hpLabelEl.textContent = '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(3 - lives, 0));
    stageLabelEl.textContent = 'STAGE ' + stage;
    scoreLabelEl.textContent = 'SCORE ' + score;
  }

  function showFlash(text, cls) {
    flashMsgEl.textContent = text;
    flashMsgEl.className = 'flashMsg ' + (cls || '');
    flashTimer = 1.5;
  }

  function setRunnerProgress(frac) {
    runnerEl.style.left = (clamp(frac, 0, 1) * 100) + '%';
  }

  function renderTiles(mode) {
    // mode: 'preview' (memorize phase, all icons visible) | 'play' (run/reveal phase)
    tilesEl.innerHTML = '';
    sequence.forEach((dir, i) => {
      const box = document.createElement('div');
      box.className = 'tile';
      if (mode === 'preview') {
        box.textContent = ICON[dir];
      } else {
        if (answered[i] === 'correct') { box.textContent = ICON[dir]; box.classList.add('correct'); }
        else if (answered[i] === 'wrong') { box.textContent = ICON[dir]; box.classList.add('wrong'); }
        else { box.textContent = '❓'; }
        if (i === currentIndex && (state === 'run')) {
          box.classList.add('active');
          const ring = document.createElement('div');
          ring.className = 'ring';
          ring.id = 'activeRing';
          box.appendChild(ring);
        }
      }
      tilesEl.appendChild(box);
    });
  }

  function updateActiveRing() {
    const ring = document.getElementById('activeRing');
    if (!ring) return;
    const frac = tileTimeLimit > 0 ? clamp(timer / tileTimeLimit, 0, 1) : 0;
    ring.style.transform = 'scaleX(' + frac + ')';
    ring.style.background = frac < 0.3 ? 'var(--danger)' : (frac < 0.6 ? 'var(--sun)' : 'var(--safe)');
  }

  function startStage(n) {
    stage = n;
    const len = seqLenForStage(n);
    sequence = genSequence(len);
    answered = new Array(len).fill(null);
    currentIndex = 0;
    tileTimeLimit = tileTimeForStage(n);
    updateHud();
    beginMemorize(memoTimeForStage(n, len));
  }

  function beginMemorize(dur) {
    state = 'memorize';
    timer = dur;
    phaseDur = dur;
    phaseLabelEl.textContent = 'おぼえて!ルート ' + sequence.length + '手';
    memoBarEl.classList.remove('hidden');
    memoBarFillEl.style.transform = 'scaleX(1)';
    setRunnerProgress(0);
    renderTiles('preview');
  }

  function beginRun() {
    state = 'run';
    memoBarEl.classList.add('hidden');
    phaseLabelEl.textContent = '走れ!覚えた順に入力';
    sfxGo();
    beginTile();
  }

  function beginTile() {
    timer = tileTimeLimit;
    phaseDur = tileTimeLimit;
    renderTiles('play');
    updateActiveRing();
  }

  function grantScore(correct) {
    if (!correct) return;
    let mult = 1;
    if (combo >= 15) mult = 2.5;
    else if (combo >= 10) mult = 2;
    else if (combo >= 5) mult = 1.5;
    const gain = Math.round((10 + stage * 2) * mult);
    score += gain;
  }

  function handleComboMilestone() {
    if (combo > 0 && combo % 8 === 0) {
      if (lives < 3) {
        lives++;
        sfxLifeUp();
        showFlash('8コンボ達成!♥回復!', 'ok');
      } else {
        score += 30;
        sfxLifeUp();
        showFlash('8コンボ達成!ボーナス+30!', 'bonus');
      }
      updateHud();
    }
  }

  function submitAnswer(dir) {
    if (state !== 'run') return;
    const correct = dir !== null && dir === sequence[currentIndex];
    answered[currentIndex] = correct ? 'correct' : 'wrong';
    if (correct) {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      grantScore(true);
      sfxCorrect();
      handleComboMilestone();
      setRunnerProgress((currentIndex + 1) / sequence.length);
    } else {
      combo = 0;
      lives--;
      sfxWrong();
      showFlash(dir === null ? 'タイムアウト!正解は ' + ICON[sequence[currentIndex]] : 'ミス!正解は ' + ICON[sequence[currentIndex]], 'bad');
    }
    updateHud();
    state = (lives <= 0) ? 'over-pending' : 'reveal';
    timer = 0.5;
    phaseDur = 0.5;
    renderTiles('play');
  }

  function afterReveal() {
    if (state === 'over-pending') { endGame(); return; }
    currentIndex++;
    if (currentIndex >= sequence.length) {
      state = 'clear';
      timer = 1.1;
      phaseDur = 1.1;
      const bonus = 20 + stage * 5;
      score += bonus;
      updateHud();
      sfxStageClear();
      phaseLabelEl.textContent = 'ステージ ' + stage + ' クリア!';
      showFlash('ステージクリアボーナス +' + bonus, 'ok');
    } else {
      beginTile();
    }
  }

  function endGame() {
    state = 'over';
    sfxOver();
    resultTitleEl.textContent = '力尽きた…';
    resultTextEl.innerHTML =
      '到達 <b>STAGE ' + stage + '</b><br>' +
      '最大コンボ <b>' + maxCombo + '</b><br>' +
      'スコア <b>' + score + '</b>';
    resultEl.classList.remove('hidden');
  }

  function tick(dt) {
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) { flashMsgEl.textContent = ''; flashMsgEl.className = 'flashMsg'; }
    }

    if (state === 'memorize') {
      timer -= dt;
      const frac = clamp(timer / phaseDur, 0, 1);
      memoBarFillEl.style.transform = 'scaleX(' + frac + ')';
      if (timer <= 0) beginRun();
    } else if (state === 'run') {
      timer -= dt;
      updateActiveRing();
      if (timer <= 0) submitAnswer(null);
    } else if (state === 'reveal' || state === 'over-pending') {
      timer -= dt;
      if (timer <= 0) afterReveal();
    } else if (state === 'clear') {
      timer -= dt;
      if (timer <= 0) startStage(stage + 1);
    }
  }

  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    tick(dt);
    requestAnimationFrame(loop);
  }

  function startGame() {
    ensureAudio();
    lives = 3;
    score = 0;
    combo = 0;
    maxCombo = 0;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    flashMsgEl.textContent = '';
    flashMsgEl.className = 'flashMsg';
    flashTimer = 0;
    updateHud();
    startStage(1);
  }

  // ---- input ----
  function press(dir) {
    if (state !== 'run') return;
    submitAnswer(dir);
  }

  [btnLeft, btnStraight, btnRight].forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(btn.dataset.dir);
    });
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); press('L'); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { e.preventDefault(); press('S'); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); press('R'); }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  // initial idle render
  updateHud();
  requestAnimationFrame(loop);
})();
