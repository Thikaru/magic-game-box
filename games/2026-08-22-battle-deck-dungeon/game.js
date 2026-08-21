(() => {
  'use strict';

  const foeIcons = ['👹','👺','🐺','🦂','🐍','🦇','🐉','👻','🕷️','🦴'];

  const $ = (id) => document.getElementById(id);
  const els = {
    intro: $('intro'), result: $('result'), resultTitle: $('resultTitle'), resultText: $('resultText'),
    startBtn: $('startBtn'), retryBtn: $('retryBtn'),
    waveLabel: $('waveLabel'), foeIcon: $('foeIcon'),
    foeHpBar: $('foeHpBar'), foeHpText: $('foeHpText'),
    hpBar: $('hpBar'), hpText: $('hpText'),
    atkTelegraph: $('atkTelegraph'), timerBar: $('timerBar'),
    feedback: $('feedback'), scoreLabel: $('scoreLabel'), comboLabel: $('comboLabel'),
    cardRow: $('cardRow'),
  };

  const PLAYER_MAX_HP = 100;

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }
  function beep(freq, duration, type, gainPeak) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak || 0.18, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
  const sfx = {
    atk: () => beep(220, 0.14, 'sawtooth', 0.16),
    hit: () => beep(140, 0.18, 'square', 0.2),
    shield: () => beep(520, 0.12, 'triangle', 0.14),
    heal: () => beep(660, 0.2, 'sine', 0.14),
    gold: () => { beep(880, 0.1, 'square', 0.2); setTimeout(() => beep(1180, 0.16, 'square', 0.2), 70); },
    defeat: () => { beep(660, 0.1, 'square', 0.18); setTimeout(() => beep(990, 0.18, 'square', 0.18), 90); },
    over: () => { beep(300, 0.16, 'sawtooth', 0.2); setTimeout(() => beep(180, 0.3, 'sawtooth', 0.2), 130); },
  };

  let state = null;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  function newState() {
    return {
      hp: PLAYER_MAX_HP,
      wave: 1,
      foeHp: 0, foeMaxHp: 0, foeAtk: 0,
      combo: 0, score: 0,
      turnsCount: 0,
      cards: [],
      running: false,
      resolved: false,
      timerId: null,
      timerStart: 0, timerDuration: 0,
    };
  }

  function turnDuration(s) { return Math.max(2.0, 5.0 - s.turnsCount * 0.07); }

  function spawnFoe(s) {
    s.foeMaxHp = 24 + (s.wave - 1) * 6;
    s.foeHp = s.foeMaxHp;
  }

  function rollFoeAtk(s) {
    s.foeAtk = randInt(5, 10) + Math.floor(s.wave * 0.8);
  }

  function makeCard(s) {
    const roll = Math.random();
    if (roll < 0.06) {
      return { type: 'gold', value: 18 + Math.round(s.wave * 1.5) };
    }
    const r2 = Math.random();
    if (r2 < 0.42) {
      return { type: 'atk', value: randInt(4, 9) + Math.floor(s.wave * 0.5) };
    } else if (r2 < 0.75) {
      return { type: 'shield', value: randInt(4, 10) + Math.floor(s.wave * 0.4) };
    } else {
      return { type: 'heal', value: randInt(8, 14) };
    }
  }

  function dealCards(s) {
    s.cards = [makeCard(s), makeCard(s), makeCard(s)];
  }

  const CARD_META = {
    atk: { icon: '⚔️', cls: 'atk', label: '攻撃' },
    shield: { icon: '🛡️', cls: 'shield', label: '防御' },
    heal: { icon: '❤️', cls: 'heal', label: '回復' },
    gold: { icon: '⭐', cls: 'gold', label: '必殺' },
  };

  function renderCards(s) {
    els.cardRow.innerHTML = '';
    s.cards.forEach((card, i) => {
      const meta = CARD_META[card.type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cardBtn ' + meta.cls;
      btn.dataset.idx = i;
      btn.innerHTML = `<span class="icon">${meta.icon}</span><span>${meta.label} ${card.value}</span>`;
      btn.addEventListener('click', () => pickCard(i));
      els.cardRow.appendChild(btn);
    });
  }

  function setCardsDisabled(disabled) {
    els.cardRow.querySelectorAll('.cardBtn').forEach((b) => { b.disabled = disabled; });
  }

  function render(s) {
    els.waveLabel.textContent = `WAVE ${s.wave}`;
    els.foeIcon.textContent = foeIcons[(s.wave - 1) % foeIcons.length];
    els.foeHpBar.style.width = Math.max(0, (s.foeHp / s.foeMaxHp) * 100) + '%';
    els.foeHpText.textContent = `${Math.max(0, Math.ceil(s.foeHp))}/${s.foeMaxHp}`;
    els.hpBar.style.width = Math.max(0, (s.hp / PLAYER_MAX_HP) * 100) + '%';
    els.hpText.textContent = `${Math.max(0, Math.ceil(s.hp))}/${PLAYER_MAX_HP}`;
    els.atkTelegraph.textContent = `つぎの攻撃: ${s.foeAtk}`;
    els.scoreLabel.textContent = `SCORE ${Math.floor(s.score)}`;
    els.comboLabel.textContent = `COMBO ${s.combo}`;
  }

  function showFeedback(text, ok) {
    els.feedback.textContent = text;
    els.feedback.className = 'feedback ' + (ok ? 'ok' : 'ng');
  }

  function shakeFoe() {
    els.foeIcon.classList.remove('shake');
    void els.foeIcon.offsetWidth;
    els.foeIcon.classList.add('shake');
  }

  function comboMult(s) { return 1 + Math.min(s.combo, 20) * 0.1; }

  function startTimer(s) {
    s.timerDuration = turnDuration(s);
    s.timerStart = performance.now();
    s.resolved = false;
    const tick = () => {
      if (!s.running || s.resolved) return;
      const elapsed = (performance.now() - s.timerStart) / 1000;
      const remain = Math.max(0, s.timerDuration - elapsed);
      const pct = (remain / s.timerDuration) * 100;
      els.timerBar.style.width = pct + '%';
      els.timerBar.classList.toggle('low', pct < 30);
      if (remain <= 0) {
        resolveTurn(s, null, 0);
        return;
      }
      s.timerId = requestAnimationFrame(tick);
    };
    s.timerId = requestAnimationFrame(tick);
  }

  function stopTimer(s) {
    if (s.timerId) cancelAnimationFrame(s.timerId);
    s.timerId = null;
  }

  function nextTurn(s) {
    if (!s.running) return;
    rollFoeAtk(s);
    dealCards(s);
    renderCards(s);
    setCardsDisabled(false);
    els.feedback.textContent = '';
    els.feedback.className = 'feedback';
    render(s);
    startTimer(s);
  }

  function pickCard(idx) {
    const s = state;
    if (!s || !s.running || s.resolved) return;
    const card = s.cards[idx];
    if (!card) return;
    const elapsed = (performance.now() - s.timerStart) / 1000;
    const remainFrac = Math.max(0, 1 - elapsed / s.timerDuration);
    resolveTurn(s, card, remainFrac);
  }

  function resolveTurn(s, card, remainFrac) {
    if (s.resolved) return;
    s.resolved = true;
    stopTimer(s);
    setCardsDisabled(true);
    s.turnsCount++;

    let damageDealtToFoe = 0;
    let playerTakesDamage = s.foeAtk;
    let blockedFully = false;
    let lethalNoRetaliate = false;
    let feedbackText = '';
    let ok = true;

    if (!card) {
      feedbackText = 'まにあわなかった…';
      ok = false;
      sfx.hit();
    } else if (card.type === 'atk') {
      damageDealtToFoe = card.value;
      sfx.atk();
      if (s.foeHp - damageDealtToFoe <= 0) {
        lethalNoRetaliate = true;
        playerTakesDamage = 0;
        feedbackText = 'とどめの一撃!';
      } else {
        feedbackText = `${damageDealtToFoe}ダメージ!`;
        ok = false;
      }
    } else if (card.type === 'shield') {
      damageDealtToFoe = 0;
      if (card.value >= s.foeAtk) {
        blockedFully = true;
        playerTakesDamage = 0;
        feedbackText = '完全ブロック!';
        sfx.shield();
      } else {
        playerTakesDamage = s.foeAtk - card.value;
        feedbackText = `一部ブロック(被弾${playerTakesDamage})`;
        ok = false;
        sfx.hit();
      }
    } else if (card.type === 'heal') {
      s.hp = Math.min(PLAYER_MAX_HP, s.hp + card.value);
      feedbackText = `${card.value}回復(反撃を被弾)`;
      ok = false;
      sfx.heal();
    } else if (card.type === 'gold') {
      damageDealtToFoe = card.value;
      sfx.gold();
      if (s.foeHp - damageDealtToFoe <= 0) {
        lethalNoRetaliate = true;
        playerTakesDamage = 0;
        feedbackText = '必殺のとどめ!';
      } else {
        blockedFully = true;
        playerTakesDamage = 0;
        feedbackText = '必殺!大ダメージ+完全ブロック!';
      }
    }

    if (damageDealtToFoe > 0) {
      s.foeHp -= damageDealtToFoe;
      shakeFoe();
    }

    if (playerTakesDamage > 0) {
      s.hp -= playerTakesDamage;
      s.combo = 0;
    } else if (blockedFully || lethalNoRetaliate) {
      s.combo++;
    }

    const mult = comboMult(s);
    let gained = 0;
    if (damageDealtToFoe > 0) gained += damageDealtToFoe * 8;
    if (blockedFully) gained += s.foeAtk * 6;
    if (card && card.type === 'heal') gained += card.value * 3;
    if (card) gained += Math.round(remainFrac * 15);
    s.score += gained * mult;

    showFeedback(feedbackText, ok);
    render(s);

    if (s.hp <= 0) {
      s.hp = 0;
      render(s);
      setTimeout(() => gameOver(s), 500);
      return;
    }

    if (s.foeHp <= 0) {
      sfx.defeat();
      s.score += 80 + s.wave * 8;
      s.wave++;
      setTimeout(() => {
        if (!s.running) return;
        spawnFoe(s);
        render(s);
        nextTurn(s);
      }, 550);
      return;
    }

    setTimeout(() => {
      if (!s.running) return;
      nextTurn(s);
    }, 450);
  }

  function gameOver(s) {
    s.running = false;
    stopTimer(s);
    sfx.over();
    els.resultTitle.textContent = 'ゲームオーバー';
    els.resultText.innerHTML = `倒した敵: ${s.wave - 1}体<br>スコア: ${Math.floor(s.score)}`;
    els.result.classList.remove('hidden');
  }

  function startGame() {
    ensureAudio();
    state = newState();
    const s = state;
    s.running = true;
    spawnFoe(s);
    els.intro.classList.add('hidden');
    els.result.classList.add('hidden');
    render(s);
    nextTurn(s);
  }

  els.startBtn.addEventListener('click', startGame);
  els.retryBtn.addEventListener('click', startGame);

  window.addEventListener('keydown', (e) => {
    if (!state || !state.running || state.resolved) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const idx = Number(e.key) - 1;
      pickCard(idx);
    }
  });
})();
