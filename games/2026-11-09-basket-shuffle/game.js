(function () {
  'use strict';
  var COLORS = [
    { id: 'red', name: 'あか', bg: '#d6372b', fruits: ['🍎', '🍓', '🍒'] },
    { id: 'blue', name: 'あお', bg: '#2f6fd6', fruits: ['🫐', '🍇'] },
    { id: 'yellow', name: 'きいろ', bg: '#c9a000', fruits: ['🍌', '🍋'] }
  ];
  var DURATION = 60, ITEM = 56;
  var $ = function (id) { return document.getElementById(id); };
  var lane = $('lane'), baskets = $('baskets'), banner = $('banner');
  var order, items, lives, score, combo, elapsed, spawnT, shuffleAt, warned, running, last, raf, shuffles;

  function render() {
    baskets.innerHTML = '';
    order.forEach(function (ci, pos) {
      var c = COLORS[ci];
      var b = document.createElement('button');
      b.className = 'basket';
      b.style.background = c.bg;
      b.innerHTML = '<b>' + (pos + 1) + '</b>' + c.name;
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(pos); });
      baskets.appendChild(b);
    });
  }
  function hud() {
    $('lives').textContent = '❤❤❤'.slice(0, lives) + '🖤🖤🖤'.slice(0, 3 - lives);
    $('combo').textContent = 'コンボ ' + combo;
    $('score').textContent = score + '点';
    $('bar').style.width = Math.min(100, elapsed / DURATION * 100) + '%';
  }
  function say(t) { banner.textContent = t; }
  function flashBasket(pos) {
    var b = baskets.children[pos];
    if (!b) return;
    b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  }
  function hurt(pos) {
    lives--; combo = 0;
    if (pos != null) flashBasket(pos);
    hud();
    if (lives <= 0) end(false);
  }
  function spawn() {
    var ci = Math.floor(Math.random() * 3);
    var f = COLORS[ci].fruits;
    var el = document.createElement('div');
    el.className = 'item';
    el.textContent = f[Math.floor(Math.random() * f.length)];
    lane.appendChild(el);
    items.push({ el: el, ci: ci, y: -ITEM });
  }
  function choose(pos) {
    if (!running || !items.length) return;
    var it = items[0];
    if (order[pos] === it.ci) {
      combo++;
      score += 10 + Math.min(combo, 10) * 2;
      lane.removeChild(it.el); items.shift();
      hud();
    } else {
      hurt(pos);
      if (running) { lane.removeChild(it.el); items.shift(); }
    }
  }
  function shuffleBaskets() {
    var n = order.slice();
    do { n.sort(function () { return Math.random() - .5; }); }
    while (n.join() === order.join());
    order = n; shuffles++;
    render();
  }
  function tick(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    elapsed += dt;
    if (elapsed >= DURATION) { hud(); end(true); return; }
    var p = elapsed / DURATION;
    var speed = 90 + 90 * p;
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = 1.15 - 0.55 * p + Math.random() * 0.25; }
    if (!warned && elapsed >= shuffleAt - 1.2) { warned = true; say('⚠ かごがいれかわる!'); }
    if (elapsed >= shuffleAt) {
      shuffleBaskets(); warned = false; say('いれかわった!いろをみて!');
      setTimeout(function () { if (running) say(''); }, 1200);
      shuffleAt = elapsed + 7 + Math.random() * 4 - 3 * p;
    }
    var floor = lane.clientHeight;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.y += speed * dt;
      it.el.style.top = it.y + 'px';
      it.el.classList.toggle('next', i === 0);
    }
    if (items.length && items[0].y > floor - ITEM) {
      lane.removeChild(items[0].el); items.shift();
      hurt(null);
      if (!running) return;
    }
    hud();
    raf = requestAnimationFrame(tick);
  }
  function start() {
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    items && items.forEach(function (it) { if (it.el.parentNode) lane.removeChild(it.el); });
    order = [0, 1, 2]; items = []; lives = 3; score = 0; combo = 0; elapsed = 0;
    spawnT = 0.4; shuffleAt = 8; warned = false; shuffles = 0; running = true;
    say(''); render(); hud();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function end(clear) {
    running = false; cancelAnimationFrame(raf);
    if (clear) score += lives * 50;
    hud();
    $('rTitle').textContent = clear ? '🎉 クリア!' : '😵 ゲームオーバー';
    $('rText').innerHTML = (clear ? '60秒しごとをやりきった!(のこりライフ×50点ボーナス)' : 'つぎは ' + Math.floor(elapsed) + '秒より先へ!') +
      '<br>スコア: <b>' + score + '点</b>(かごの入れかわり ' + shuffles + '回)';
    $('result').classList.remove('hidden');
  }
  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  document.addEventListener('keydown', function (e) {
    var m = { '1': 0, '2': 1, '3': 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
    if (m[e.key] != null) { e.preventDefault(); choose(m[e.key]); }
  });
  order = [0, 1, 2]; items = []; lives = 3; score = 0; combo = 0; elapsed = 0; render(); hud();
})();
