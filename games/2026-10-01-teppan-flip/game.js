(function () {
  'use strict';
  var FOODS = [
    { e: '🍤', t: 2.6 }, { e: '🍢', t: 3.4 }, { e: '🍗', t: 4.2 },
    { e: '🐟', t: 4.8 }, { e: '🥩', t: 5.8 }, { e: '🌽', t: 3.8 }
  ];
  var FLIP = [0.25, 0.45], DONE = [0.70, 0.92], BURN = 1.0;
  var GAME_SEC = 60, SLOTS = 6;

  var $ = function (id) { return document.getElementById(id); };
  var grill = $('grill'), intro = $('intro'), result = $('result'), msgEl = $('msg');
  var slots = [];
  for (var i = 0; i < SLOTS; i++) {
    var b = document.createElement('button');
    b.className = 'slot';
    b.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="food"></span>' +
      '<span class="bar"><span class="zf"></span><span class="zd"></span><span class="fill"></span></span>' +
      '<span class="hint"></span>';
    grill.appendChild(b);
    slots.push({ el: b, food: b.querySelector('.food'), fill: b.querySelector('.fill'),
      zf: b.querySelector('.zf'), zd: b.querySelector('.zd'), hint: b.querySelector('.hint'), item: null });
    (function (idx) {
      b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); tap(idx); });
      b.addEventListener('keydown', function (ev) { if (ev.key === ' ' || ev.key === 'Enter') ev.preventDefault(); });
    })(i);
  }
  function pct(v) { return (v * 100) + '%'; }

  var running = false, score, life, combo, timeLeft, last, spawnIn, raf, served, msgTimer;

  function say(t) {
    msgEl.textContent = t;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { msgEl.textContent = ''; }, 900);
  }
  function flash(s, cls) {
    s.el.classList.remove('ok', 'bad');
    void s.el.offsetWidth;
    s.el.classList.add(cls);
  }
  function hud() {
    $('hTime').textContent = '⏱ ' + Math.max(0, Math.ceil(timeLeft));
    $('hLife').textContent = new Array(Math.max(0, life) + 1).join('❤️') || '💔';
    $('hScore').textContent = score + '点' + (combo >= 2 ? ' ×' + combo : '');
  }
  function clear(s) {
    s.item = null;
    s.el.className = 'slot';
    s.food.textContent = '';
    s.fill.style.width = '0';
    s.zf.style.width = s.zd.style.width = '0';
    s.hint.textContent = '';
  }
  function spawn() {
    var empty = slots.filter(function (s) { return !s.item; });
    if (!empty.length) return false;
    var s = empty[Math.floor(Math.random() * empty.length)];
    var f = FOODS[Math.floor(Math.random() * FOODS.length)];
    var speed = 1 + (GAME_SEC - timeLeft) / GAME_SEC * 0.5; // だんだん速く
    s.item = { f: f, p: 0, flipped: false, rate: speed / f.t };
    s.el.className = 'slot hot';
    s.food.textContent = f.e;
    s.zf.style.left = pct(FLIP[0]); s.zf.style.width = pct(FLIP[1] - FLIP[0]);
    s.zd.style.left = pct(DONE[0]); s.zd.style.width = pct(DONE[1] - DONE[0]);
    s.hint.textContent = 'ひっくり返せ!';
    return true;
  }
  function loseLife(s, why) {
    life--; combo = 0;
    s.el.className = 'slot burnt';
    s.food.textContent = '💨';
    s.hint.textContent = why;
    s.item = { dead: true };
    say(why);
    setTimeout(function () { if (s.item && s.item.dead) clear(s); }, 500);
    hud();
    if (life <= 0) end(false);
  }
  function tap(i) {
    if (!running) return;
    var s = slots[i], it = s.item;
    if (!it || it.dead) return;
    var p = it.p;
    if (!it.flipped) {
      if (p >= FLIP[0] && p <= FLIP[1]) {
        it.flipped = true;
        s.el.classList.add('flipped');
        s.hint.textContent = 'お皿にのせろ!';
        score += 20;
      } else { miss(s); }
    } else {
      if (p >= DONE[0] && p <= DONE[1]) {
        var mid = (DONE[0] + DONE[1]) / 2, perfect = Math.abs(p - mid) < 0.05;
        combo++; served++;
        var pts = 100 + Math.min(combo, 10) * 10 + (perfect ? 50 : 0);
        score += pts;
        say((perfect ? '✨パーフェクト! ' : 'おいしそう! ') + '+' + pts);
        clear(s); flash(s, 'ok');
      } else { miss(s); }
    }
    hud();
  }
  function miss(s) {
    combo = 0;
    score = Math.max(0, score - 10);
    flash(s, 'bad');
    say('タイミングがちがう!');
  }
  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.1, (t - last) / 1000); last = t;
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; hud(); end(true); return; }
    spawnIn -= dt;
    if (spawnIn <= 0) {
      if (spawn()) spawnIn = Math.max(0.7, 1.7 - (GAME_SEC - timeLeft) / GAME_SEC * 1.0) * (0.8 + Math.random() * 0.5);
      else spawnIn = 0.3;
    }
    for (var i = 0; i < SLOTS && running; i++) {
      var s = slots[i], it = s.item;
      if (!it || it.dead) continue;
      it.p += it.rate * dt;
      s.fill.style.width = pct(Math.min(1, it.p));
      if (!it.flipped && it.p > FLIP[1]) { loseLife(s, 'ひっくり返し忘れ!'); }
      else if (it.p > BURN) { loseLife(s, '焦げちゃった!'); }
    }
    if (running) { hud(); raf = requestAnimationFrame(frame); }
  }
  function start() {
    intro.classList.add('hidden'); result.classList.add('hidden');
    slots.forEach(clear);
    score = 0; life = 3; combo = 0; served = 0; timeLeft = GAME_SEC; spawnIn = 0.4;
    msgEl.textContent = ''; hud();
    running = true; last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function end(clearFlag) {
    running = false; cancelAnimationFrame(raf);
    $('rTitle').textContent = clearFlag ? '🎉 60秒おつかれさま!' : '💔 ライフがなくなった…';
    $('rText').innerHTML = 'スコア <b>' + score + '点</b><br>お皿にのせた数: ' + served + '皿<br>' +
      (score >= 3000 ? '鉄板奉行レベル!' : score >= 1500 ? 'なかなかの腕前!' : 'もう少しでプロ!もういちど?');
    result.classList.remove('hidden');
  }
  document.addEventListener('keydown', function (e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= SLOTS) tap(n - 1);
  });
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  hud();
})();
