(function () {
  'use strict';
  var FOODS = ['🍎', '🍌', '🍇', '🍓', '🍙', '🥕', '🍪', '🍩', '🥛', '🧀'];
  var STAGES = ['🥚', '🐣', '🐥', '🐤', '🐔'];
  var GOAL = 10;
  var $ = function (id) { return document.getElementById(id); };
  var slotsEl = $('slots'), shelfEl = $('shelf'), petEl = $('pet'), msgEl = $('msg');
  var bar = $('timerBar'), hintBtn = $('hintBtn');

  var gen = 0, phase = 'idle';
  var lives, served, hints, shelf, seq, pos;

  function later(fn, ms) {
    var g = gen;
    setTimeout(function () { if (g === gen) fn(); }, ms);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function setMsg(t) { msgEl.textContent = t || ' '; }
  function stageOf(n) {
    return STAGES[Math.min(STAGES.length - 1, n >= 9 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0)];
  }
  function updateHud() {
    $('servedLabel').textContent = 'ごはん ' + served + '/' + GOAL;
    var h = '';
    for (var i = 0; i < 3; i++) h += i < lives ? '♥' : '♡';
    $('livesLabel').textContent = h;
    hintBtn.textContent = '💡 もういちど見る(のこり' + hints + ')';
    hintBtn.disabled = hints <= 0 || phase !== 'answer';
  }
  function pop() {
    petEl.classList.add('pop');
    later(function () { petEl.classList.remove('pop'); }, 220);
  }
  function drawSlots(mode, bad) {
    slotsEl.innerHTML = '';
    for (var i = 0; i < seq.length; i++) {
      var d = document.createElement('div');
      d.className = 'slot';
      if (mode === 'show') {
        d.textContent = seq[i];
      } else if (i < pos) {
        d.textContent = seq[i]; d.className += ' ok';
      } else if (mode === 'reveal') {
        d.textContent = seq[i];
        if (i === bad) d.className += ' ng';
      } else {
        d.textContent = '❓';
        if (i === pos) d.className += ' next';
      }
      slotsEl.appendChild(d);
    }
  }
  function drawShelf() {
    shelfEl.innerHTML = '';
    shelf.forEach(function (f, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'food';
      b.innerHTML = f + '<small>' + (i + 1) + '</small>';
      b.addEventListener('click', function () { choose(i); });
      shelfEl.appendChild(b);
    });
  }
  function runTimer(ms) {
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + ms + 'ms linear';
    bar.style.width = '0%';
  }

  function nextOrder() {
    var len = Math.min(2 + Math.floor(served / 2), 6);
    shelf = shuffle(FOODS.slice()).slice(0, 8);
    seq = []; pos = 0;
    for (var i = 0; i < len; i++) {
      var f;
      do { f = shelf[Math.floor(Math.random() * shelf.length)]; } while (i > 0 && f === seq[i - 1]);
      seq.push(f);
    }
    drawShelf();
    drawSlots('show');
    phase = 'show';
    setMsg('よ〜く見て おぼえてね!');
    updateHud();
    var ms = 900 + 550 * len;
    runTimer(ms);
    later(function () {
      phase = 'answer';
      drawSlots('hide');
      setMsg('おなじ じゅんばんで あげてね');
      bar.style.transition = 'none'; bar.style.width = '0%';
      updateHud();
    }, ms);
  }

  function choose(i) {
    if (phase !== 'answer') return;
    var f = shelf[i];
    if (f === seq[pos]) {
      pos++;
      if (pos === seq.length) {
        phase = 'fed';
        served++;
        drawSlots('hide');
        petEl.textContent = stageOf(served);
        pop();
        setMsg('ぱくぱく!おいしい! 😋');
        updateHud();
        later(function () { served >= GOAL ? finish(true) : nextOrder(); }, 1000);
      } else {
        drawSlots('hide');
        setMsg('いいかんじ!');
      }
    } else {
      phase = 'miss';
      lives--;
      drawSlots('reveal', pos);
      setMsg('あれれ… ちがうよ 😢 こたえはこれ!');
      updateHud();
      later(function () { lives <= 0 ? finish(false) : nextOrder(); }, 1900);
    }
  }

  function useHint() {
    if (phase !== 'answer' || hints <= 0) return;
    hints--;
    phase = 'hint';
    drawSlots('show');
    setMsg('ちらっ! 💡');
    updateHud();
    runTimer(1500);
    later(function () {
      phase = 'answer';
      drawSlots('hide');
      setMsg('おなじ じゅんばんで あげてね');
      bar.style.transition = 'none'; bar.style.width = '0%';
      updateHud();
    }, 1500);
  }

  function finish(win) {
    phase = 'over';
    updateHud();
    var best = 0;
    try { best = +localStorage.getItem('memoPetBest') || 0; } catch (e) {}
    if (served > best) { best = served; try { localStorage.setItem('memoPetBest', String(best)); } catch (e) {} }
    $('resultTitle').textContent = win ? '🎉 りっぱな 大人に そだったよ!' : 'おなかが ぺこぺこ…';
    $('resultText').innerHTML = win
      ? petEl.textContent + ' ぜんぶ おぼえてたね!<br>ハートののこり: ' + lives
      : 'ごはんをあげた回数: <b>' + served + '</b> / ' + GOAL + '<br>ベスト: ' + best;
    $('result').classList.remove('hidden');
  }

  function start() {
    gen++;
    lives = 3; served = 0; hints = 2;
    petEl.textContent = stageOf(0);
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    nextOrder();
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  hintBtn.addEventListener('click', useHint);
  document.addEventListener('keydown', function (e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 8) choose(n - 1);
    else if (e.key === 'h' || e.key === 'H') useHint();
  });
  lives = 3; served = 0; hints = 2; shelf = []; seq = []; pos = 0;
  updateHud();
})();
