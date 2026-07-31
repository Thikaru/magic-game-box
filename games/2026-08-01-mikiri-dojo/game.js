(() => {
  'use strict';

  const JUST_WINDOW_RATIO = 0.20; // last 20% of the windup counts as a JUST guard
  const ENEMIES = [
    { name: '道場破り', emoji: '👹' },
    { name: '影の刺客', emoji: '🥷' },
    { name: '鬼将軍', emoji: '👺' },
    { name: '竜の化身', emoji: '🐉' },
    { name: '幻影の達人', emoji: '👻' },
  ];

  const heartsEl = document.getElementById('hearts');
  const scoreLabel = document.getElementById('scoreLabel');
  const enemyEmojiEl = document.getElementById('enemyEmoji');
  const enemyNameEl = document.getElementById('enemyName');
  const enemyHitsLabel = document.getElementById('enemyHitsLabel');
  const enemyGaugeEl = document.getElementById('enemyGauge');
  const specialLabel = document.getElementById('specialLabel');
  const specialGaugeEl = document.getElementById('specialGauge');
  const comboLabel = document.getElementById('comboLabel');
  const specialBtn = document.getElementById('specialBtn');
  const toastEl = document.getElementById('toast');
  const introOverlay = document.getElementById('introOverlay');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  const laneEls = [0, 1, 2].map(i => document.getElementById('lane' + i));
  const guardBtns = Array.from(document.querySelectorAll('.guardBtn'));

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
  }
  function beep(freq, dur, type, gainPeak) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainPeak || 0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function playSound(kind) {
    if (!audioCtx) return;
    switch (kind) {
      case 'guard': beep(440, 0.09, 'square'); break;
      case 'just': beep(880, 0.07, 'triangle'); setTimeout(() => beep(1180, 0.09, 'triangle'), 60); break;
      case 'damage': beep(140, 0.18, 'sawtooth', 0.22); break;
      case 'evade': beep(660, 0.1, 'sine'); break;
      case 'feintFail': beep(220, 0.14, 'sawtooth', 0.16); break;
      case 'defeat': beep(523, 0.09, 'triangle'); setTimeout(() => beep(659, 0.09, 'triangle'), 90); setTimeout(() => beep(880, 0.14, 'triangle'), 180); break;
      case 'special': beep(300, 0.05, 'sine'); setTimeout(() => beep(700, 0.16, 'sine', 0.22), 40); break;
      case 'gameover': beep(300, 0.14, 'sawtooth'); setTimeout(() => beep(200, 0.14, 'sawtooth'), 130); setTimeout(() => beep(120, 0.22, 'sawtooth'), 260); break;
    }
  }

  let running = false;
  let lives, score, combo, enemyIndex, enemyHits, enemyHitsNeeded, specialGauge, windupBase, feintChance, opponentsDefeated;
  let attack = null; // {lane,type,start,duration,resolved,active}
  let nextAttackTimer = null;
  let rafId = null;

  function resetState() {
    lives = 3;
    score = 0;
    combo = 0;
    enemyIndex = 0;
    enemyHits = 0;
    enemyHitsNeeded = 5;
    specialGauge = 0;
    windupBase = 1300;
    feintChance = 0.15;
    opponentsDefeated = 0;
    attack = null;
    updateAllUI();
    setEnemy(0);
  }

  function setEnemy(idx) {
    const e = ENEMIES[idx % ENEMIES.length];
    enemyEmojiEl.textContent = e.emoji;
    enemyNameEl.textContent = e.name;
  }

  function updateAllUI() {
    heartsEl.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    scoreLabel.textContent = 'SCORE ' + score;
    enemyHitsLabel.textContent = enemyHits + '/' + enemyHitsNeeded;
    enemyGaugeEl.style.width = Math.min(100, (enemyHits / enemyHitsNeeded) * 100) + '%';
    specialLabel.textContent = Math.floor(specialGauge) + '%';
    specialGaugeEl.style.width = specialGauge + '%';
    comboLabel.textContent = combo > 0 ? ('COMBO ' + combo) : '';
    specialBtn.disabled = specialGauge < 100;
    specialBtn.classList.toggle('ready', specialGauge >= 100);
  }

  function addScore(base) {
    const mult = 1 + Math.min(Math.floor(combo / 5), 8) * 0.2;
    score += Math.round(base * mult);
    updateAllUI();
  }

  function showToast(text, cls) {
    toastEl.textContent = text;
    toastEl.className = 'toast show ' + cls;
    // restart animation
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
  }

  function setLaneVisual(laneIdx, active, type) {
    const el = laneEls[laneIdx];
    if (active) {
      el.classList.add('active');
      const ring = el.querySelector('.ring');
      ring.style.setProperty('--ringColor', type === 'feint' ? 'var(--blue)' : 'var(--red)');
      const icon = el.querySelector('.icon');
      icon.textContent = type === 'feint' ? '💫' : '👊';
      if (type === 'feint') icon.style.animation = 'pulse .4s infinite'; else icon.style.animation = '';
    } else {
      el.classList.remove('active');
    }
  }

  function clearAllLaneVisuals() {
    laneEls.forEach((el, i) => setLaneVisual(i, false));
  }

  function scheduleNextAttack() {
    if (!running) return;
    if (nextAttackTimer) { clearTimeout(nextAttackTimer); nextAttackTimer = null; }
    const delay = 350 + Math.random() * 350;
    nextAttackTimer = setTimeout(startAttack, delay);
  }

  function startAttack() {
    if (!running) return;
    hideAttackUI();
    const lane = Math.floor(Math.random() * 3);
    const type = Math.random() < feintChance ? 'feint' : 'normal';
    const variance = 0.85 + Math.random() * 0.3;
    const duration = Math.max(480, windupBase * variance);
    attack = { lane, type, start: performance.now(), duration, resolved: false, active: true };
    setLaneVisual(lane, true, type);
    document.getElementById('lane' + lane).querySelector('.ring').style.setProperty('--pct', 100);
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    rafId = null;
    if (!running) return;
    if (attack && attack.active) {
      const elapsed = now - attack.start;
      const progress = Math.min(1, elapsed / attack.duration);
      const ring = document.getElementById('lane' + attack.lane).querySelector('.ring');
      ring.style.setProperty('--pct', Math.max(0, (1 - progress) * 100));
      if (progress >= 1 && !attack.resolved) {
        onAttackTimeout();
      }
    }
    if (running) rafId = requestAnimationFrame(tick);
  }

  function hideAttackUI() {
    if (attack) clearAllLaneVisuals();
    attack = null;
  }

  function checkEnemyDefeat() {
    if (enemyHits >= enemyHitsNeeded) {
      opponentsDefeated++;
      addScore(100);
      showToast('たおした!', 'good');
      playSound('defeat');
      enemyHits = 0;
      enemyHitsNeeded = Math.min(8, 5 + Math.floor(opponentsDefeated / 2));
      windupBase = Math.max(560, 1300 - opponentsDefeated * 55);
      feintChance = Math.min(0.32, 0.15 + opponentsDefeated * 0.012);
      enemyIndex++;
      setEnemy(enemyIndex);
    }
    updateAllUI();
  }

  function loseLife() {
    lives--;
    combo = 0;
    updateAllUI();
    if (lives <= 0) {
      gameOver();
      return true;
    }
    return false;
  }

  function onAttackTimeout() {
    if (!attack || attack.resolved) return;
    attack.resolved = true;
    if (attack.type === 'feint') {
      combo++;
      addScore(15);
      showToast('見切り!', 'good');
      playSound('evade');
    } else {
      playSound('damage');
      showToast('MISS', 'bad');
      if (loseLife()) { hideAttackUI(); return; }
    }
    hideAttackUI();
    checkEnemyDefeat();
    if (running) scheduleNextAttack();
  }

  function resolveGuard(laneIdx) {
    if (!running) return;
    if (!attack || attack.resolved) return; // no active attack to guard right now
    attack.resolved = true;
    const elapsed = performance.now() - attack.start;
    const ratio = Math.min(1, elapsed / attack.duration);
    if (attack.type === 'feint') {
      combo = 0;
      updateAllUI();
      showToast('フェイントだった!', 'warn');
      playSound('feintFail');
    } else if (laneIdx === attack.lane) {
      const justThreshold = 1 - JUST_WINDOW_RATIO;
      if (ratio >= justThreshold) {
        combo++;
        enemyHits += 2;
        specialGauge = Math.min(100, specialGauge + 20);
        addScore(30);
        showToast('JUST!', 'good');
        playSound('just');
      } else {
        combo++;
        enemyHits += 1;
        specialGauge = Math.min(100, specialGauge + 10);
        addScore(10);
        playSound('guard');
      }
    } else {
      playSound('damage');
      showToast('MISS', 'bad');
      if (loseLife()) { hideAttackUI(); return; }
    }
    hideAttackUI();
    checkEnemyDefeat();
    if (running) scheduleNextAttack();
  }

  function useSpecial() {
    if (!running || specialGauge < 100) return;
    specialGauge = 0;
    if (attack && !attack.resolved) {
      attack.resolved = true;
      hideAttackUI();
    }
    combo++;
    addScore(60);
    enemyHits = enemyHitsNeeded;
    showToast('秘技発動!', 'info');
    playSound('special');
    checkEnemyDefeat();
    updateAllUI();
    if (running) scheduleNextAttack();
  }

  function gameOver() {
    running = false;
    if (nextAttackTimer) clearTimeout(nextAttackTimer);
    hideAttackUI();
    playSound('gameover');
    resultTitle.textContent = '道場破り、ここまで';
    resultText.textContent = 'たおした相手: ' + opponentsDefeated + ' 人 / スコア: ' + score;
    resultOverlay.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    resetState();
    running = true;
    introOverlay.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    scheduleNextAttack();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  guardBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ensureAudio();
      resolveGuard(parseInt(btn.dataset.lane, 10));
    });
  });
  specialBtn.addEventListener('click', () => {
    ensureAudio();
    useSpecial();
  });

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.repeat) return;
    const code = e.code;
    if (code === 'ArrowUp' || code === 'KeyW') { e.preventDefault(); resolveGuard(0); }
    else if (code === 'Space' || code === 'Enter' || code === 'KeyS') { e.preventDefault(); resolveGuard(1); }
    else if (code === 'ArrowDown') { e.preventDefault(); resolveGuard(2); }
    else if (code === 'KeyF' || code === 'KeyJ') { e.preventDefault(); useSpecial(); }
  }, { passive: false });

  resetState();
})();
