(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height, HIT_X = 90, GROUND = 190, TOTAL = 40, INTRO = 4, VIS = 3.2;
  const PERFECT = 0.07, GOOD = 0.14, WINDOW = 0.2;
  const ROOT = [65.4, 55, 87.3, 98];
  const CHORD = [[261.6, 329.6, 392], [220, 261.6, 329.6], [349.2, 440, 523.3], [392, 493.9, 587.3]];
  const PENTA = [523.3, 587.3, 659.3, 784, 880, 784, 659.3, 587.3];

  let ac = null, running = false;
  let beats, hurdles, genBeat, audBeat, genCount, lives, combo, score, resolved, hitCount, jumpAt, popups, layers, lastJudge;

  function bpmAt(b) { return 100 + Math.min(40, Math.floor(b / 8) * 5); }
  function beatTime(b) { while (beats.length <= b) { const n = beats.length; beats.push(beats[n - 1] + 60 / bpmAt(n - 1)); } return beats[b]; }

  function tone(f, t, d, type, v) {
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.value = f;
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(t, d, v) {
    const len = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, len, ac.sampleRate), a = buf.getChannelData(0);
    for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), gn = ac.createGain(); s.buffer = buf; gn.gain.value = v;
    s.connect(gn); gn.connect(ac.destination); s.start(t);
  }
  function kick(t) { const o = ac.createOscillator(), gn = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + .12); gn.gain.setValueAtTime(.7, t); gn.gain.exponentialRampToValueAtTime(.001, t + .16); o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + .2); }

  function scheduleAudio(b) {
    const t = beatTime(b), bar = Math.floor(b / 4) % 4, step = b % 4, spb = 60 / bpmAt(b);
    tone(1200, t, .03, 'square', .05); // always-on click
    if (layers >= 1) { kick(t); noise(t + spb / 2, .04, .12); }
    if (layers >= 2) tone(ROOT[bar], t, spb * .9, 'triangle', .3);
    if (layers >= 3 && step === 0) CHORD[bar].forEach(f => tone(f, t, spb * 3.8, 'sine', .07));
  }

  function reset() {
    const t0 = ac.currentTime + 1.2;
    beats = [t0]; hurdles = []; genBeat = 0; audBeat = 0; genCount = 0;
    lives = 3; combo = 0; score = 0; resolved = 0; hitCount = 0; jumpAt = -9; popups = []; layers = 0; lastJudge = '';
    updateHud();
  }

  function generate(now) {
    while (beatTime(genBeat) < now + VIS + 0.5 && genCount < TOTAL) {
      const b = genBeat;
      if (b >= INTRO) {
        const p = Math.min(.8, .5 + b * .006);
        const prevHurdle = hurdles.length && hurdles[hurdles.length - 1].beat === b - 1;
        if (Math.random() < p || (b % 8 === 7 && !prevHurdle)) { hurdles.push({ beat: b, t: beatTime(b), done: false, res: '' }); genCount++; }
      }
      genBeat++;
    }
  }

  function press() {
    if (!running) return;
    const now = ac.currentTime;
    jumpAt = now;
    let best = null;
    for (const h of hurdles) if (!h.done && Math.abs(h.t - now) < WINDOW && (!best || Math.abs(h.t - now) < Math.abs(best.t - now))) best = h;
    if (!best) { tone(180, now, .08, 'square', .08); if (combo > 0) loseLayer(); combo = 0; pop('つまずき', '#8aa'); updateHud(); return; }
    const d = Math.abs(best.t - now);
    best.done = true; resolved++;
    if (d <= PERFECT) { best.res = 'P'; score += Math.round(100 * (1 + layers * .25)); pop('PERFECT!', '#ffd84d'); }
    else if (d <= GOOD) { best.res = 'G'; score += Math.round(50 * (1 + layers * .25)); pop('GOOD', '#4de3ff'); }
    else { best.res = 'B'; combo = 0; loseLayer(); pop('おしい', '#ccc'); tone(220, now, .1, 'square', .1); updateHud(); checkEnd(); return; }
    combo++; hitCount++;
    if (layers < 4 && combo >= layers * 4 + 4) layers++;
    if (layers >= 4 || combo >= 12) tone(PENTA[hitCount % PENTA.length], now, .25, 'square', .12);
    else tone(PENTA[hitCount % PENTA.length], now, .15, 'triangle', .1);
    updateHud(); checkEnd();
  }
  function loseLayer() { if (layers > 0) layers--; }
  function pop(text, color) { popups.push({ text, color, t: ac.currentTime }); }

  function missCheck(now) {
    for (const h of hurdles) if (!h.done && now > h.t + GOOD) {
      h.done = true; h.res = 'M'; resolved++; combo = 0; lives--; loseLayer(); pop('ミス!', '#ff5050');
      noise(now, .25, .25); tone(120, now, .3, 'sawtooth', .15);
    }
    updateHud(); checkEnd();
  }

  function checkEnd() {
    if (!running) return;
    if (lives <= 0) return finish(false);
    if (genCount >= TOTAL && resolved >= TOTAL) finish(true);
  }
  function finish(clear) {
    running = false;
    const now = ac.currentTime;
    if (clear) [523.3, 659.3, 784, 1046].forEach((f, i) => tone(f, now + i * .12, .3, 'square', .12));
    else [330, 262, 196, 131].forEach((f, i) => tone(f, now + i * .15, .3, 'sawtooth', .1));
    $('endTitle').textContent = clear ? '🎉 ステージクリア!' : '💥 ゲームオーバー';
    $('endText').innerHTML = (clear ? 'ぜんぶのハードルをのりこえた!' : `${resolved} / ${TOTAL} こまででストップ…`) + `<br>スコア <b>${score}</b> 点`;
    $('ovEnd').classList.remove('hide');
  }

  function updateHud() {
    $('hLife').textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
    $('hCombo').textContent = 'コンボ ' + combo;
    $('hScore').textContent = score + ' 点';
    $('hLeft').textContent = 'のこり ' + Math.max(0, TOTAL - resolved);
    for (let i = 1; i <= 4; i++) $('l' + i).classList.toggle('on', layers >= i);
  }

  function draw(now) {
    g.clearRect(0, 0, W, H);
    const bi = beats.findIndex(x => x > now) - 1;
    const pulse = bi >= 0 ? Math.max(0, 1 - (now - beats[bi]) * 4) : 0;
    g.fillStyle = `rgba(255,95,162,${.08 + pulse * .12})`; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3b2f6b'; g.fillRect(0, GROUND, W, H - GROUND);
    // hit line
    g.strokeStyle = '#ff5fa2'; g.lineWidth = 3 + pulse * 3; g.beginPath(); g.moveTo(HIT_X, 20); g.lineTo(HIT_X, GROUND + 20); g.stroke();
    // runner
    const jt = now - jumpAt, jumping = jt >= 0 && jt < .35;
    const y = GROUND - (jumping ? Math.sin(jt / .35 * Math.PI) * 70 : 0);
    g.font = '40px serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('🏃', HIT_X, y);
    // hurdles
    const dist = W - HIT_X;
    for (const h of hurdles) {
      const x = HIT_X + (h.t - now) / VIS * dist;
      if (x < -40 || x > W + 40) continue;
      g.globalAlpha = h.done && h.res === 'M' ? .4 : 1;
      let hy = GROUND;
      if (h.done && h.res !== 'M') { hy = GROUND - 10; g.globalAlpha = .5; }
      g.fillText('🚧', x, hy);
      g.globalAlpha = 1;
    }
    // popups
    popups = popups.filter(p => now - p.t < .7);
    g.font = 'bold 20px system-ui,sans-serif';
    for (const p of popups) { g.globalAlpha = 1 - (now - p.t) / .7; g.fillStyle = p.color; g.fillText(p.text, HIT_X + 20, 100 - (now - p.t) * 40); }
    g.globalAlpha = 1;
    if (now < beats[0]) { g.fillStyle = '#fff'; g.font = 'bold 24px system-ui,sans-serif'; g.fillText('じゅんび…', W / 2, 90); }
  }

  function loop() {
    if (!ac) return;
    const now = ac.currentTime;
    if (running) {
      generate(now);
      while (audBeat < genBeat && beatTime(audBeat) < now + .3) { if (beatTime(audBeat) >= now - .05) scheduleAudio(audBeat); audBeat++; }
      missCheck(now);
    }
    draw(now);
    requestAnimationFrame(loop);
  }

  function start() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume();
    $('ovStart').classList.add('hide'); $('ovEnd').classList.add('hide');
    reset(); running = true;
    if (!start.looping) { start.looping = true; requestAnimationFrame(loop); }
  }

  $('btnStart').addEventListener('click', start);
  $('btnRetry').addEventListener('click', start);
  const jb = $('jump');
  jb.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  window.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { if (running) { e.preventDefault(); if (!e.repeat) press(); } } });
})();
