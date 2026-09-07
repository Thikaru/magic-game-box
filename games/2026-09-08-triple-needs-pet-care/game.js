(() => {
  'use strict';

  const KEYS = ['hunger', 'energy', 'mood'];
  const LABELS = { hunger: 'おなか', energy: 'げんき', mood: 'きげん' };
  const COOLDOWN_MS = 850;
  const HEAL_AMOUNT = 38;
  const BASE_DECAY = 3.6; // per second
  const DECAY_GROWTH = 0.11; // per second of elapsed time
  const RUSH_MIN_ELAPSED = 12;
  const BONUS_COMBO_STEP = 8;
  const BONUS_DURATION = 4000;

  const els = {
    toast: document.getElementById('toast'),
    score: document.getElementById('scoreLabel'),
    time: document.getElementById('timeLabel'),
    lives: document.getElementById('livesLabel'),
    petFace: document.getElementById('petFace'),
    bonusBanner: document.getElementById('bonusBanner'),
    intro: document.getElementById('intro'),
    result: document.getElementById('result'),
    resultTitle: document.getElementById('resultTitle'),
    resultText: document.getElementById('resultText'),
    startBtn: document.getElementById('startBtn'),
    retryBtn: document.getElementById('retryBtn'),
    bars: { hunger: document.getElementById('bar-hunger'), energy: document.getElementById('bar-energy'), mood: document.getElementById('bar-mood') },
    rows: { hunger: document.getElementById('row-hunger'), energy: document.getElementById('row-energy'), mood: document.getElementById('row-mood') },
    btns: { hunger: document.getElementById('btn-hunger'), energy: document.getElementById('btn-energy'), mood: document.getElementById('btn-mood') },
  };

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, dur, type, gain) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.14;
    osc.connect(g).connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }
  const sfx = {
    heal: () => beep(660, 0.12, 'triangle', 0.16),
    bonusHeal: () => { beep(880, 0.1, 'triangle', 0.18); beep(1180, 0.14, 'triangle', 0.14); },
    danger: () => beep(180, 0.28, 'sawtooth', 0.2),
    bonusStart: () => { beep(760, 0.1, 'square', 0.16); beep(1020, 0.16, 'square', 0.16); },
    gameover: () => { beep(300, 0.3, 'sawtooth', 0.2); beep(180, 0.4, 'sawtooth', 0.2); },
  };

  let state = null;
  let toastTimer = null;
  let rafId = null;

  function newState() {
    const stats = {};
    KEYS.forEach(k => { stats[k] = 70; });
    return {
      stats,
      cooldownUntil: { hunger: 0, energy: 0, mood: 0 },
      rushUntil: { hunger: 0, energy: 0, mood: 0 },
      lives: 3,
      score: 0,
      combo: 0,
      bonusCombosUsed: 0,
      elapsed: 0,
      bonusUntil: 0,
      nextRushAt: RUSH_MIN_ELAPSED + Math.random() * 5,
      running: true,
      lastTs: performance.now(),
    };
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 900);
  }

  function faceFor(minVal, bonus) {
    if (bonus) return '🤩';
    if (minVal <= 0) return '😵';
    if (minVal < 18) return '😫';
    if (minVal < 40) return '😟';
    if (minVal < 70) return '😐';
    return '😊';
  }

  function decayRateAt(elapsedSec) {
    return BASE_DECAY + elapsedSec * DECAY_GROWTH;
  }

  function update(ts) {
    if (!state || !state.running) return;
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    state.elapsed += dt;

    const bonusActive = ts < state.bonusUntil;

    if (!bonusActive) {
      const rate = decayRateAt(state.elapsed);
      KEYS.forEach(k => {
        const rushMul = ts < state.rushUntil[k] ? 2.1 : 1;
        state.stats[k] = Math.max(0, state.stats[k] - rate * rushMul * dt);
      });
    }

    // trigger rush events
    if (state.elapsed >= state.nextRushAt) {
      const count = Math.random() < 0.4 ? 2 : 1;
      const pool = KEYS.slice().sort(() => Math.random() - 0.5);
      const dur = 3000 + Math.random() * 2000;
      for (let i = 0; i < count; i++) {
        state.rushUntil[pool[i]] = ts + dur;
      }
      showToast(count === 2 ? '⚠ Wピンチ発生!' : '⚠ ピンチ発生!');
      state.nextRushAt = state.elapsed + 7 + Math.random() * 6;
    }

    // check for zeroed stats -> life loss
    let lost = false;
    KEYS.forEach(k => {
      if (state.stats[k] <= 0) {
        lost = true;
        state.stats[k] = 32;
        state.rushUntil[k] = 0;
      }
    });
    if (lost) {
      state.lives -= 1;
      state.combo = 0;
      els.petFace.classList.add('hurt');
      setTimeout(() => els.petFace.classList.remove('hurt'), 400);
      sfx.danger();
      if (state.lives <= 0) {
        endGame();
        return;
      } else {
        showToast('ライフが減った!');
      }
    }

    render(ts);
    rafId = requestAnimationFrame(update);
  }

  function render(ts) {
    const bonusActive = ts < state.bonusUntil;
    let minVal = 100;
    KEYS.forEach(k => {
      const v = state.stats[k];
      minVal = Math.min(minVal, v);
      els.bars[k].style.width = v + '%';
      els.bars[k].classList.toggle('low', v < 30 && !bonusActive);
      const rushing = ts < state.rushUntil[k];
      els.bars[k].classList.toggle('rush', rushing);
      els.rows[k].classList.toggle('rush', rushing);

      const cooling = ts < state.cooldownUntil[k];
      const btn = els.btns[k];
      btn.classList.toggle('cooling', cooling && !bonusActive);
      btn.classList.toggle('bonusReady', bonusActive);
      if (cooling) {
        const total = COOLDOWN_MS;
        const remain = state.cooldownUntil[k] - ts;
        const pct = Math.max(0, Math.min(100, (1 - remain / total) * 100));
        btn.querySelector('.cool').style.width = pct + '%';
      }
    });

    els.bonusBanner.classList.toggle('hidden', !bonusActive);
    els.petFace.textContent = faceFor(minVal, bonusActive);
    els.score.textContent = 'SCORE ' + state.score;
    els.time.textContent = '⏱ ' + Math.floor(state.elapsed) + 's';
    els.lives.textContent = '♥'.repeat(Math.max(0, state.lives)) + '♡'.repeat(Math.max(0, 3 - state.lives));
  }

  function tryAct(key) {
    if (!state || !state.running) return;
    const ts = performance.now();
    const bonusActive = ts < state.bonusUntil;

    if (!bonusActive && ts < state.cooldownUntil[key]) return;

    if (bonusActive) {
      KEYS.forEach(k => { state.stats[k] = Math.min(100, state.stats[k] + 16); });
      state.score += 24;
      sfx.bonusHeal();
      showToast('⭐ ぜんかいふく!+24');
    } else {
      state.stats[key] = Math.min(100, state.stats[key] + HEAL_AMOUNT);
      state.cooldownUntil[key] = ts + COOLDOWN_MS;
      state.combo += 1;
      const gain = Math.round(10 * (1 + state.combo * 0.05));
      state.score += gain;
      sfx.heal();

      const bonusLevel = Math.floor(state.combo / BONUS_COMBO_STEP);
      if (bonusLevel > state.bonusCombosUsed) {
        state.bonusCombosUsed = bonusLevel;
        state.bonusUntil = ts + BONUS_DURATION;
        sfx.bonusStart();
        showToast('⭐ ごほうびタイム突入!');
      }
    }
    render(ts);
  }

  function endGame() {
    state.running = false;
    cancelAnimationFrame(rafId);
    sfx.gameover();
    els.resultTitle.textContent = 'ゲームオーバー';
    els.resultText.textContent =
      `生存時間 ${Math.floor(state.elapsed)}秒 / スコア ${state.score}\nさいごまでよくおせわしたね!`;
    els.result.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    els.intro.classList.add('hidden');
    els.result.classList.add('hidden');
    state = newState();
    render(performance.now());
    rafId = requestAnimationFrame(update);
  }

  els.startBtn.addEventListener('click', startGame);
  els.retryBtn.addEventListener('click', startGame);

  KEYS.forEach(k => {
    els.btns[k].addEventListener('click', () => { ensureAudio(); tryAct(k); });
  });

  const KEYMAP = { '1': 'hunger', '2': 'energy', '3': 'mood' };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key];
    if (k) { ensureAudio(); tryAct(k); }
  });
})();
