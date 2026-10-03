(function () {
  'use strict';
  var WORDS = [
    ['neko','sakana','tamago','sakura','ringo','tomato','pan','kuruma','tsukue','hikari'],
    ['kaminari','tanuki','torakku','udon','sensei','robotto','kudamono','oyatsu','yakisoba','omoshiro'],
    ['ichigo','momiji','takoyaki','kingyo','kakigori','hanabi','tokei','yuugata','rakuda','shinkansen']
  ];
  var BASE = 40, BONUS = 2.5, PENALTY = 1.5;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), modeEl = $('mode'), wordEl = $('word'), slotsEl = $('slots'), msgEl = $('msg');
  var running = false, timeLeft, score, combo, solved, maxCombo, word, rev, typed, last, raf, bagTier;

  var rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  var kb = $('kb');
  rows.forEach(function (r) {
    var d = document.createElement('div'); d.className = 'row';
    r.split('').forEach(function (c) {
      var b = document.createElement('button'); b.className = 'key'; b.textContent = c; b.type = 'button';
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(c); });
      d.appendChild(b);
    });
    kb.appendChild(d);
  });

  function pickWord() {
    var tier = solved < 4 ? 0 : solved < 9 ? 1 : 2;
    var list = WORDS[Math.min(2, tier + (Math.random() < 0.3 ? 1 : 0))];
    var w;
    do { w = list[Math.floor(Math.random() * list.length)]; } while (w === word);
    return w;
  }

  function nextWord() {
    word = pickWord();
    rev = Math.random() < 0.55;
    typed = 0;
    modeEl.className = 'mode ' + (rev ? 'rev' : 'fwd');
    modeEl.textContent = rev ? '⬅️ うしろから打つ' : '➡️ そのまま打つ';
    wordEl.innerHTML = '';
    word.split('').forEach(function (c) { var s = document.createElement('span'); s.textContent = c; wordEl.appendChild(s); });
    renderSlots();
  }

  function target() { return rev ? word[word.length - 1 - typed] : word[typed]; }

  function renderSlots() {
    slotsEl.innerHTML = '';
    for (var i = 0; i < word.length; i++) {
      var s = document.createElement('div');
      s.className = 'slot' + (i === typed ? ' cur' : '');
      if (i < typed) s.textContent = rev ? word[word.length - 1 - i] : word[i];
      slotsEl.appendChild(s);
    }
  }

  function say(t) { msgEl.textContent = t; }

  function hud() {
    $('hTime').textContent = '⏱ ' + Math.max(0, timeLeft).toFixed(1);
    $('hCombo').textContent = 'コンボ ' + combo;
    $('hScore').textContent = score + '点';
    $('bar').style.width = Math.min(100, timeLeft / BASE * 100) + '%';
  }

  function press(c) {
    if (!running) return;
    if (c === target()) {
      typed++;
      score += 10 + Math.min(combo, 20);
      combo++; if (combo > maxCombo) maxCombo = combo;
      if (typed >= word.length) {
        solved++;
        score += word.length * 5;
        timeLeft = Math.min(BASE + 10, timeLeft + BONUS);
        say('✨ クリア! +' + BONUS + '秒');
        nextWord();
      } else renderSlots();
    } else {
      combo = 0;
      timeLeft -= PENALTY;
      say('💥 ちがう! −' + PENALTY + '秒');
      stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
    }
    hud();
  }

  function tick(now) {
    if (!running) return;
    timeLeft -= (now - last) / 1000; last = now;
    if (timeLeft <= 0) { timeLeft = 0; hud(); return end(); }
    hud();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    timeLeft = BASE; score = 0; combo = 0; maxCombo = 0; solved = 0; word = '';
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    say('');
    nextWord(); hud();
    running = true; last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function end() {
    running = false; cancelAnimationFrame(raf);
    var best = 0;
    try { best = +localStorage.getItem('reverse-typing-best') || 0; if (score > best) { best = score; localStorage.setItem('reverse-typing-best', best); } } catch (e) { best = Math.max(best, score); }
    $('rTitle').textContent = solved >= 12 ? '🏆 すごい!' : '⏰ タイムアップ!';
    $('rText').innerHTML = score + '点<br>打ち終えた単語: ' + solved + '語<br>最大コンボ: ' + maxCombo + '<br>ベスト: ' + best + '点';
    $('result').classList.remove('hidden');
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[a-z]$/i.test(e.key)) { press(e.key.toLowerCase()); }
  });
})();
