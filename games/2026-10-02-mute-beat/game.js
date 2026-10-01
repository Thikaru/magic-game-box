(function () {
  'use strict';
  var BPM0 = 84, BPM_STEP = 6, AUD = 4, SIL = [4, 4, 4, 6, 6, 6, 8, 8];
  var PERFECT = 0.06, GOOD = 0.14, LIVES = 3;

  var $ = function (id) { return document.getElementById(id); };
  var intro = $('intro'), result = $('result'), msgEl = $('msg'), dotsEl = $('dots'),
      orb = $('orb'), phaseEl = $('phase'), pad = $('pad');
  var ctx = null, state = 'idle', token = 0, raf = 0;
  var round, lives, score, combo, nPerfect, nGood, nMiss, R;

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function tone(when, freq, dur, type, vol) {
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }
  function now() { return ctx ? ctx.currentTime : 0; }
  function say(t) { msgEl.textContent = t; }
  function hud() {
    $('hRound').textContent = 'ラウンド ' + (round + 1) + '/' + SIL.length;
    $('hBpm').textContent = '♩=' + (BPM0 + BPM_STEP * round);
    var h = ''; for (var i = 0; i < LIVES; i++) h += i < lives ? '❤️' : '🖤';
    $('hLife').textContent = h;
    $('hScore').textContent = score + '点';
  }

  function startRound() {
    var myToken = token;
    var bpm = BPM0 + BPM_STEP * round, spb = 60 / bpm, nSil = SIL[round];
    R = { spb: spb, nSil: nSil, win: Math.min(0.25, spb * 0.45), t0: now() + 0.9,
      taps: [], used: [], res: [], dots: [], audOn: 0, done: 0 };
    dotsEl.innerHTML = '';
    for (var i = 0; i < AUD + nSil; i++) {
      var d = document.createElement('span');
      d.className = 'dot ' + (i < AUD ? 'aud' : 'sil');
      dotsEl.appendChild(d); R.dots.push(d);
    }
    for (var k = 0; k < AUD; k++) tone(R.t0 + k * spb, k === 0 ? 880 : 660, 0.07, 'square', 0.12);
    for (k = 0; k < nSil; k++) R.res.push(null);
    phaseEl.className = 'phase'; phaseEl.textContent = '🔊 テンポをおぼえて!';
    orb.className = 'orb silent';
    say(''); hud();
    state = 'round';
    cancelAnimationFrame(raf);
    (function loop() {
      if (myToken !== token || state !== 'round') return;
      step(myToken);
      raf = requestAnimationFrame(loop);
    })();
  }

  function pulse() {
    orb.classList.add('beat');
    setTimeout(function () { orb.classList.remove('beat'); }, 90);
  }

  function step(myToken) {
    var t = now(), i, k;
    while (R.audOn < AUD && t >= R.t0 + R.audOn * R.spb) {
      R.dots[R.audOn].classList.add('on'); orb.classList.remove('silent'); pulse(); R.audOn++;
    }
    if (R.audOn >= AUD && t >= R.t0 + (AUD - 1) * R.spb + R.spb * 0.5 && phaseEl.className.indexOf('mute') < 0) {
      phaseEl.className = 'phase mute'; phaseEl.textContent = '🔇 消えた!テンポをキープしてタップ';
      orb.className = 'orb silent';
    }
    for (k = 0; k < R.nSil; k++) {
      if (R.res[k] !== null) continue;
      var tb = R.t0 + (AUD + k) * R.spb;
      if (t <= tb + R.win) break;
      judge(k, tb);
    }
    if (R.done === R.nSil && state === 'round') finishRound(myToken);
  }

  function judge(k, tb) {
    var best = -1, bd = 99, i;
    for (i = 0; i < R.taps.length; i++) {
      if (R.used[i]) continue;
      var d = Math.abs(R.taps[i] - tb);
      if (d <= R.win && d < bd) { bd = d; best = i; }
    }
    var dot = R.dots[AUD + k], diff = 0;
    if (best >= 0 && bd <= GOOD) {
      R.used[best] = true; diff = R.taps[best] - tb;
      var perfect = bd <= PERFECT;
      combo++;
      var pts = (perfect ? 100 : 50) + Math.min(combo, 10) * 5;
      score += pts;
      if (perfect) nPerfect++; else nGood++;
      R.res[k] = perfect ? 'perfect' : 'good';
      dot.className = 'dot ' + R.res[k];
      say(perfect ? '✨ ぴったり!' : (diff < 0 ? '👍 ちょっと早い' : '👍 ちょっと遅い'));
    } else {
      if (best >= 0) { R.used[best] = true; diff = R.taps[best] - tb; }
      combo = 0; lives--; nMiss++;
      R.res[k] = 'miss'; dot.className = 'dot miss';
      say(best < 0 ? '💥 押せなかった…' : (diff < 0 ? '💥 早すぎ!' : '💥 遅すぎ!'));
    }
    R.done++;
    hud();
  }

  function finishRound(myToken) {
    state = 'between';
    if (lives <= 0) { setTimeout(function () { if (myToken === token) end(false); }, 700); return; }
    if (round >= SIL.length - 1) { setTimeout(function () { if (myToken === token) end(true); }, 700); return; }
    phaseEl.className = 'phase'; phaseEl.textContent = 'ラウンド ' + (round + 1) + ' クリア! 次はもっと速いよ';
    setTimeout(function () { if (myToken !== token) return; round++; startRound(); }, 1300);
  }

  function end(clear) {
    state = 'over';
    $('rTitle').textContent = clear ? '🎉 全ラウンドクリア!' : '💥 ゲームオーバー';
    $('rText').innerHTML = 'スコア <b>' + score + '点</b><br>到達: ラウンド ' + (round + 1) + '/' + SIL.length +
      '<br>✨ぴったり ' + nPerfect + ' / 👍ほぼ ' + nGood + ' / 💥ミス ' + nMiss +
      '<br>' + (clear ? 'テンポ感はバッチリ!' : 'あと少し!もういちど挑戦しよう。');
    result.classList.remove('hidden');
  }

  function tap() {
    if (state !== 'round') return;
    var t = now();
    if (t < R.t0 + AUD * R.spb - R.win) return;
    R.taps.push(t);
    tone(t, 1300, 0.04, 'triangle', 0.06);
  }

  function begin() {
    ensureAudio();
    token++;
    round = 0; lives = LIVES; score = 0; combo = 0; nPerfect = nGood = nMiss = 0;
    intro.classList.add('hidden'); result.classList.add('hidden');
    startRound();
  }

  $('startBtn').addEventListener('click', begin);
  $('retryBtn').addEventListener('click', begin);
  pad.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); pad.classList.add('down'); tap();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) {
    pad.addEventListener(n, function () { pad.classList.remove('down'); });
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) tap(); }
  });
  round = 0; lives = LIVES; score = 0; hud();
})();
