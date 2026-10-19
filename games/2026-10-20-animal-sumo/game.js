(() => {
  'use strict';
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const intro = $('intro'), result = $('result');

  const RANKS = [
    { name: 'まえがしら', emoji: '🐗', push: 3.0, gap: [4.0, 6.0] },
    { name: 'せきわけ',   emoji: '🐻', push: 4.0, gap: [3.4, 5.0] },
    { name: 'よこづな',   emoji: '🦍', push: 5.0, gap: [2.8, 4.2] },
  ];
  const TAP_COST = 7, TAP_PUSH = 1.5, TIRED_MUL = 2, WARN_T = 0.9, BRACE_T = 0.4, BRACE_CD = 1.0, BOUT_TIME = 40;
  const rnd = (a, b) => a + Math.random() * (b - a);

  let g = null;      // game state
  let raf = 0, last = 0;

  function newGame() {
    g = { bout: 0, lives: 2, score: 0, phase: 'idle', msg: '', msgT: 0, p: 50 };
    startBout();
  }

  function startBout() {
    const r = RANKS[g.bout];
    Object.assign(g, {
      phase: 'ready', readyT: rnd(1.3, 2.8), p: 50, stamina: 100, timeLeft: BOUT_TIME,
      mode: 'push', modeT: rnd(r.gap[0], r.gap[1]), braceT: 0, braceCd: 0, graceT: 0, bonus: false,
      falseStart: false, shake: 0, tapFlash: 0, endT: 0, won: false,
    });
    say(r.name + ' ' + r.emoji + ' みあって…', 99);
  }

  function say(t, sec) { g.msg = t; g.msgT = sec; }

  function push() {
    if (!g || g.phase === 'idle' || g.phase === 'over') return;
    if (g.phase === 'ready') { if (!g.falseStart) { g.falseStart = true; say('フライング!', 1.2); } return; }
    if (g.phase !== 'fight' || g.braceT > 0) return;
    const tired = g.mode === 'tired';
    if (!tired && g.stamina < TAP_COST) { say('へとへと…!', 0.5); return; }
    if (!tired) g.stamina -= TAP_COST;
    let d = TAP_PUSH * (tired ? TIRED_MUL : 1);
    if (g.bonus && g.graceT > 0) { d += 8; g.bonus = false; say('いいたちあい!', 1); }
    g.p += d; g.tapFlash = 0.08;
  }

  function brace() {
    if (!g || g.phase !== 'fight' || g.braceCd > 0 || g.stamina < 12) return;
    g.stamina -= 12; g.braceT = BRACE_T; g.braceCd = BRACE_CD;
  }

  function finishBout(won) {
    g.phase = 'bout-end'; g.endT = 1.8; g.won = won;
    if (won) {
      g.score += 1000 + Math.round(g.timeLeft * 10);
      say('かち!', 99);
    } else {
      g.lives--; say('まけ…', 99);
    }
  }

  function update(dt) {
    if (g.msgT > 0 && (g.msgT -= dt) <= 0) g.msg = '';
    if (g.tapFlash > 0) g.tapFlash -= dt;
    if (g.shake > 0) g.shake -= dt;
    if (g.phase === 'ready') {
      g.readyT -= dt;
      if (g.readyT <= 0) {
        g.phase = 'fight'; g.graceT = 0.45; g.bonus = !g.falseStart;
        if (g.falseStart) g.p = 42;
        say('のこった!', 0.9);
      }
    } else if (g.phase === 'fight') {
      const r = RANKS[g.bout];
      if (g.graceT > 0) g.graceT -= dt;
      g.timeLeft -= dt;
      g.stamina = Math.min(100, g.stamina + 16 * dt);
      if (g.braceT > 0) g.braceT -= dt;
      if (g.braceCd > 0) g.braceCd -= dt;
      g.modeT -= dt;
      if (g.mode === 'push') {
        if (g.braceT <= 0) g.p -= r.push * dt;
        if (g.modeT <= 0) { g.mode = 'warn'; g.modeT = WARN_T; }
      } else if (g.mode === 'warn') {
        if (g.modeT <= 0) {
          if (g.braceT > 0) {
            g.p += 12; g.mode = 'tired'; g.modeT = 2.4; g.score += 200; say('うっちゃり!', 1.2);
          } else {
            g.p -= 20; g.shake = 0.3; g.mode = 'push'; g.modeT = rnd(r.gap[0], r.gap[1]); say('ふっとばされた!', 1);
          }
        }
      } else if (g.mode === 'tired') {
        if (g.modeT <= 0) { g.mode = 'push'; g.modeT = rnd(r.gap[0], r.gap[1]); }
      }
      if (g.p >= 100) { g.p = 100; finishBout(true); }
      else if (g.p <= 0) { g.p = 0; finishBout(false); }
      else if (g.timeLeft <= 0) { g.timeLeft = 0; finishBout(g.p > 50); }
    } else if (g.phase === 'bout-end') {
      g.endT -= dt;
      if (g.endT <= 0) {
        if (g.won) { if (g.bout === RANKS.length - 1) return showResult(true); g.bout++; startBout(); }
        else if (g.lives <= 0) showResult(false);
        else startBout();
      }
    }
  }

  function showResult(clear) {
    g.phase = 'over';
    if (clear) g.score += g.lives * 500;
    $('resultTitle').textContent = clear ? '🏆 ゆうしょう!' : '😵 ざんねん…';
    $('resultText').innerHTML = (clear ? 'よこづなまで三番勝負にかった!' : (RANKS[g.bout].name + 'にまけてしまった。')) +
      '<br>スコア <b>' + g.score + '</b>';
    result.classList.remove('hidden');
  }

  // ---------- drawing ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(0, 0, W, H);
    // dohyo
    ctx.fillStyle = '#e8c98a'; ctx.beginPath(); ctx.ellipse(W / 2, 205, 215, 62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#fff8e7'; ctx.lineWidth = 3;
    for (const x of [150, 330]) { ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x, 218); ctx.stroke(); }

    const r = RANKS[g.bout] || RANKS[0];
    const mx = 40 + g.p * 4;
    const sh = g.shake > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '54px serif';
    const oppJit = g.mode === 'warn' ? (Math.random() - 0.5) * 5 : 0;
    ctx.save(); ctx.translate(mx - 30 + sh + (g.tapFlash > 0 ? 3 : 0), 190); ctx.scale(-1, 1);
    ctx.fillText('🐰', 0, 0); ctx.restore();
    ctx.fillText(g.mode === 'tired' ? '😵' : r.emoji, mx + 30 + oppJit, 190);
    if (g.braceT > 0) { ctx.font = '30px serif'; ctx.fillText('🛡️', mx - 8, 150); }
    ctx.font = '30px serif';
    if (g.mode === 'tired') ctx.fillText('💫', mx + 30, 145);
    if (g.mode === 'warn') {
      ctx.fillText('⚠️', mx + 30, 140);
      const t = g.modeT / WARN_T, ok = g.modeT <= BRACE_T;
      ctx.strokeStyle = ok ? '#3ddc84' : '#ff5d5d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(mx + 30, 190, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.stroke();
    }

    // tug bar
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(20, 14, W - 40, 16);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(20, 14, (W - 40) * g.p / 100, 16);
    ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 1, 10, 2, 24);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#fff8e7'; ctx.textAlign = 'left';
    ctx.fillText('🐰', 22, 44); ctx.textAlign = 'right'; ctx.fillText(r.emoji, W - 22, 44);
    ctx.textAlign = 'center'; ctx.font = '14px sans-serif';
    ctx.fillText(r.name + '  第' + (g.bout + 1) + '番  ⏱ ' + Math.ceil(g.timeLeft) + '  ' + '❤️'.repeat(Math.max(g.lives, 0)) + '  SCORE ' + g.score, W / 2, 46);

    // stamina
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff8e7'; ctx.font = '12px sans-serif'; ctx.fillText('スタミナ', 20, H - 22);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(80, H - 30, 200, 14);
    ctx.fillStyle = g.stamina < TAP_COST ? '#ff5d5d' : '#3ddc84'; ctx.fillRect(80, H - 30, 2 * g.stamina, 14);
    if (g.braceCd > 0) { ctx.fillStyle = '#fff8e7'; ctx.fillText('どっしり…', 300, H - 22); }

    if (g.msg) {
      ctx.textAlign = 'center'; ctx.font = 'bold 34px sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#2b1d14';
      ctx.strokeText(g.msg, W / 2, 96); ctx.fillStyle = '#ffd23f'; ctx.fillText(g.msg, W / 2, 96);
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (g && g.phase !== 'idle' && g.phase !== 'over') update(dt);
    if (g) draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    intro.classList.add('hidden'); result.classList.add('hidden');
    newGame();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  // ---------- input ----------
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  const bind = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  bind($('pushBtn'), push); bind($('braceBtn'), brace); bind(cv, push);
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (['Space', 'ArrowRight', 'KeyZ'].includes(e.code)) { e.preventDefault(); push(); }
    else if (['KeyX', 'ArrowDown', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { e.preventDefault(); brace(); }
  });

  const padArea = $('padArea');
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  padArea.classList.toggle('hidden', !coarse);
  $('padToggle').addEventListener('click', () => padArea.classList.toggle('hidden'));

  // first paint behind the intro overlay
  g = { bout: 0, lives: 2, score: 0, p: 50, stamina: 100, timeLeft: BOUT_TIME, mode: 'push', modeT: 5, braceT: 0, braceCd: 0, shake: 0, tapFlash: 0, msg: '', phase: 'idle' };
  draw();
})();
