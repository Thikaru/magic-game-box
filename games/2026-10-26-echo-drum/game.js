(() => {
  const $ = id => document.getElementById(id);
  const drum = $('drum'), stepsEl = $('steps'), msg = $('msg'), replayBtn = $('replayBtn');
  const ROUNDS = [
    { hits: 3, bpm: 90,  show: true },
    { hits: 4, bpm: 100, show: true },
    { hits: 5, bpm: 105, show: false },
    { hits: 6, bpm: 115, show: false },
    { hits: 7, bpm: 125, show: false },
  ];
  const STEPS = 8, GOOD = 140, PERFECT = 65;

  let ctx = null, round, lives, score, combo, phase, pattern, T, stepDots;
  let timers = [], tapT0, taps, bad, replayLeft, endTimer;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; clearTimeout(endTimer); }

  function sound(freq, when, vol) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    g.gain.setValueAtTime(vol || 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.3);
  }
  function buzz() {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 110;
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.32);
  }
  function chime() {
    sound(660, 0, 0.3); sound(880, 0.1, 0.3); sound(1320, 0.2, 0.3);
  }

  function buildSteps() {
    stepsEl.innerHTML = '';
    stepDots = [];
    for (let i = 0; i < STEPS; i++) {
      const d = document.createElement('div');
      d.className = 'st'; d.textContent = i + 1;
      stepsEl.appendChild(d); stepDots.push(d);
    }
  }
  function paintPattern() {
    const cfg = ROUNDS[round];
    stepDots.forEach((d, i) => {
      d.classList.remove('lit');
      d.classList.toggle('hit', pattern.includes(i));
      d.classList.toggle('hidden-pat', pattern.includes(i) && !cfg.show);
    });
  }
  function makePattern(n) {
    const idx = [...Array(STEPS).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let p;
    do { p = idx.slice(0, n).sort((a, b) => a - b); } while (n < 6 && p.every((v, i) => i === 0 || v - p[i - 1] === 1));
    return p;
  }
  function hud() {
    $('roundLabel').textContent = 'ラウンド ' + (round + 1) + '/' + ROUNDS.length;
    $('lifeLabel').textContent = '❤️'.repeat(lives) + '🖤'.repeat(3 - lives);
    $('scoreLabel').textContent = score + '点';
  }
  function pulse() {
    drum.classList.add('hitfx');
    setTimeout(() => drum.classList.remove('hitfx'), 90);
  }

  function startRound(newPattern) {
    clearTimers();
    const cfg = ROUNDS[round];
    if (newPattern) { pattern = makePattern(cfg.hits); replayLeft = 1; }
    T = 60000 / cfg.bpm / 2;
    hud(); paintPattern();
    replayBtn.textContent = '👂 もういちどきく(' + replayLeft + '回)';
    play();
  }
  function play() {
    phase = 'listen';
    clearTimers();
    drum.disabled = true; drum.classList.add('listen');
    replayBtn.disabled = true;
    msg.textContent = '👂 よーく聞いてね…';
    later(() => {
      pattern.forEach(s => {
        later(() => {
          sound(220, 0, 0.7); pulse();
          stepDots[s].classList.add('lit');
          later(() => stepDots[s].classList.remove('lit'), 120);
        }, (s - pattern[0]) * T);
      });
      later(beginInput, (pattern[pattern.length - 1] - pattern[0]) * T + 500);
    }, 700);
  }
  function beginInput() {
    phase = 'input'; taps = 0; bad = 0; tapT0 = 0;
    drum.disabled = false; drum.classList.remove('listen');
    replayBtn.disabled = replayLeft <= 0;
    msg.textContent = '🥁 あなたの番!' + pattern.length + '回 叩いてね';
  }

  function tap() {
    if (phase !== 'input') return;
    const now = performance.now();
    pulse();
    let grade;
    if (taps === 0) {
      tapT0 = now; grade = 'PERFECT';
      endTimer = setTimeout(finishInput, (pattern[pattern.length - 1] - pattern[0]) * T + GOOD + 350);
      replayBtn.disabled = true;
    } else {
      const err = Math.abs(now - (tapT0 + (pattern[taps] - pattern[0]) * T));
      grade = err <= PERFECT ? 'PERFECT' : err <= GOOD ? 'GOOD' : 'BAD';
    }
    if (grade === 'BAD') { bad++; combo = 0; sound(130, 0, 0.5); msg.textContent = '😵 ずれた!'; }
    else {
      combo++; sound(220, 0, 0.7);
      score += (grade === 'PERFECT' ? 100 : 50) + Math.min(combo, 10) * 5;
      msg.textContent = grade === 'PERFECT' ? '✨ PERFECT!' : '👍 GOOD';
    }
    taps++; hud();
    if (taps >= pattern.length) { clearTimeout(endTimer); finishInput(); }
  }

  function finishInput() {
    if (phase !== 'input') return;
    phase = 'judge';
    drum.disabled = true;
    bad += Math.max(0, pattern.length - taps);
    const ok = bad <= 1;
    if (ok) {
      chime(); score += 200; msg.textContent = '🎉 せいこう!';
      round++; hud();
      if (round >= ROUNDS.length) return later(() => finish(true), 1100);
      later(() => startRound(true), 1400);
    } else {
      buzz(); lives--; combo = 0; hud();
      msg.textContent = '💥 ざんねん…(ずれ ' + bad + ' 回)';
      if (lives <= 0) return later(() => finish(false), 1200);
      later(() => { replayLeft = 1; startRound(false); }, 1500);
    }
  }

  function finish(clear) {
    clearTimers(); phase = 'over';
    drum.disabled = true;
    $('resultTitle').textContent = clear ? '🎊 リズムマスター!' : '😢 おしまい…';
    const rank = score >= 3200 ? 'S' : score >= 2400 ? 'A' : score >= 1500 ? 'B' : 'C';
    $('resultText').innerHTML = (clear ? '5ラウンドぜんぶクリア!' : 'ラウンド ' + (round + 1) + ' で❤️がなくなったよ。') +
      '<br>スコア <b>' + score + '点</b>(ランク ' + rank + ')';
    $('result').classList.remove('hidden');
  }

  function reset() {
    round = 0; lives = 3; score = 0; combo = 0; replayLeft = 1;
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    buildSteps();
    startRound(true);
  }
  function begin() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    reset();
  }

  $('startBtn').addEventListener('click', begin);
  $('retryBtn').addEventListener('click', begin);
  drum.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  replayBtn.addEventListener('click', () => {
    if (phase !== 'input' || replayLeft <= 0 || taps > 0) return;
    replayLeft--;
    replayBtn.textContent = '👂 もういちどきく(' + replayLeft + '回)';
    play();
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement !== drum) return;
      e.preventDefault(); tap();
    }
  });
  buildSteps();
})();
