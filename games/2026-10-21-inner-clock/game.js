(function () {
  'use strict';
  // target秒 / 見える秒数 / 表示速度(1ならホンモノ、>1はニセ時計)
  var ROUNDS = [
    { target: 3,   show: 2,   speed: 1 },
    { target: 5,   show: 1.5, speed: 1 },
    { target: 4,   show: 1,   speed: 1.6 },
    { target: 7,   show: 0.8, speed: 1 },
    { target: 10,  show: 0.5, speed: 1 }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var els = { round: $('round'), score: $('score'), target: $('target'), clock: $('clock'), note: $('note'),
    result: $('result'), act: $('act'), intro: $('intro'), end: $('end'), endTitle: $('endTitle'),
    endScore: $('endScore'), endRank: $('endRank'), endDetail: $('endDetail') };
  var state = 'idle'; // idle | running | judged | over
  var idx = 0, total = 0, startT = 0, raf = 0, errs = [];

  function fmt(n) { return n.toFixed(2); }

  function setupRound() {
    var r = ROUNDS[idx];
    state = 'idle';
    els.round.textContent = 'ラウンド ' + (idx + 1) + '/' + ROUNDS.length;
    els.target.textContent = fmt(r.target) + ' 秒';
    els.clock.textContent = '0.00';
    els.clock.className = 'clock';
    els.note.textContent = r.speed !== 1 ? '🌀 ニセ時計!表示が' + r.speed + '倍はやおくり' : '';
    els.result.textContent = '';
    els.act.textContent = 'スタート';
  }

  function tick() {
    if (state !== 'running') return;
    var r = ROUNDS[idx];
    var t = (performance.now() - startT) / 1000;
    if (t <= r.show) {
      els.clock.className = 'clock' + (r.speed !== 1 ? ' fake' : '');
      els.clock.textContent = fmt(t * r.speed);
    } else {
      els.clock.className = 'clock hide';
      els.clock.textContent = '?';
    }
    raf = requestAnimationFrame(tick);
  }

  function judge(err) {
    var e = Math.abs(err);
    if (e <= 0.05) return { pt: 100, label: '🎯 パーフェクト!' };
    if (e <= 0.15) return { pt: 70, label: '✨ すごい!' };
    if (e <= 0.3) return { pt: 45, label: '👍 いいね' };
    if (e <= 0.6) return { pt: 20, label: '😅 おしい' };
    return { pt: 0, label: '💦 ずれた…' };
  }

  function press() {
    if (state === 'idle') {
      state = 'running';
      startT = performance.now();
      els.act.textContent = 'ストップ!';
      els.result.textContent = '';
      raf = requestAnimationFrame(tick);
    } else if (state === 'running') {
      var t = (performance.now() - startT) / 1000;
      cancelAnimationFrame(raf);
      var r = ROUNDS[idx], err = t - r.target, j = judge(err);
      state = 'judged';
      total += j.pt; errs.push(err);
      els.clock.className = 'clock';
      els.clock.textContent = fmt(t);
      els.score.textContent = total + ' pt';
      els.result.innerHTML = j.label + ' +' + j.pt + 'pt<br>' + (err >= 0 ? '+' : '') + fmt(err) + ' 秒' + (err > 0 ? '(おそい)' : err < 0 ? '(はやい)' : '');
      els.act.textContent = idx === ROUNDS.length - 1 ? 'けっかを見る' : 'つぎへ';
    } else if (state === 'judged') {
      if (idx === ROUNDS.length - 1) finish(); else { idx++; setupRound(); }
    }
  }

  function finish() {
    state = 'over';
    els.endScore.textContent = total + ' / 500';
    var rank = total >= 400 ? '🏆 体内時計マスター!' : total >= 280 ? '🌟 なかなかの時計感覚' : total >= 150 ? '🙂 あと少し!' : '😴 時計がねぼけてる…';
    els.endTitle.textContent = total >= 280 ? 'クリア!' : 'ゲームオーバー';
    els.endRank.textContent = rank;
    var avg = errs.reduce(function (a, b) { return a + Math.abs(b); }, 0) / errs.length;
    els.endDetail.textContent = '平均ずれ ' + fmt(avg) + ' 秒';
    els.end.classList.remove('hidden');
  }

  function reset() {
    idx = 0; total = 0; errs = [];
    els.score.textContent = '0 pt';
    els.end.classList.add('hidden');
    setupRound();
  }

  $('startBtn').addEventListener('click', function () { els.intro.classList.add('hidden'); reset(); });
  $('retryBtn').addEventListener('click', reset);
  els.act.addEventListener('click', press);
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (!els.intro.classList.contains('hidden') || state === 'over') return;
      e.preventDefault();
      if (e.repeat) return;
      press();
    }
  });
})();
