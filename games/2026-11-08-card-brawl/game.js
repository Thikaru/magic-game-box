(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CARDS = {
    punch:   { icon: '👊', name: 'パンチ', cost: 1, desc: 'ダメージ2', w: 4 },
    kick:    { icon: '🦵', name: 'キック', cost: 2, desc: 'ダメージ5', w: 3 },
    guard:   { icon: '🛡️', name: 'ガード', cost: 1, desc: '防御5', w: 3 },
    counter: { icon: '🔄', name: 'カウンター', cost: 1, desc: '攻撃されたら反撃', w: 2 },
    heal:    { icon: '🍙', name: 'おにぎり', cost: 1, desc: 'HP+3', w: 1 }
  };
  var ENEMIES = [
    { face: '🐗', name: 'いのしし', hp: 16, atk: 4, charge: false },
    { face: '🐻', name: 'くま', hp: 22, atk: 5, charge: true },
    { face: '🦍', name: 'ゴリラ', hp: 30, atk: 6, charge: true }
  ];
  var PMAX = 24;
  var S;

  function pick() {
    var keys = Object.keys(CARDS), t = 0, i;
    for (i = 0; i < keys.length; i++) t += CARDS[keys[i]].w;
    var r = Math.random() * t;
    for (i = 0; i < keys.length; i++) { r -= CARDS[keys[i]].w; if (r < 0) return keys[i]; }
    return 'punch';
  }
  function newState() {
    return { php: PMAX, ei: 0, e: null, hand: [], energy: 3, combo: 0, block: 0, counter: false,
             turns: 0, intent: null, busy: false, over: true, score: 0 };
  }
  function spawn() {
    var d = ENEMIES[S.ei];
    S.e = { face: d.face, name: d.name, hp: d.hp, max: d.hp, atk: d.atk, charge: d.charge };
    S.intent = null; nextIntent();
  }
  function nextIntent() {
    var e = S.e;
    if (S.intent && S.intent.type === 'charge') { S.intent = { type: 'big', dmg: e.atk * 2 + 2 }; return; }
    var r = Math.random();
    if (r < 0.5) S.intent = { type: 'atk', dmg: e.atk + Math.floor(Math.random() * 3) };
    else if (r < 0.75 || !e.charge) S.intent = { type: 'guard' };
    else S.intent = { type: 'charge' };
  }
  function deal() {
    S.hand = []; for (var i = 0; i < 5; i++) S.hand.push(pick());
    S.energy = 3; S.combo = 0; S.block = 0; S.counter = false;
  }
  function log(t) { $('log').textContent = t; }
  function render() {
    var e = S.e;
    $('eFace').textContent = e.face;
    $('pHp').textContent = 'あなた HP ' + S.php + '/' + PMAX + (S.block ? ' 🛡' + S.block : '');
    $('eHp').textContent = e.name + ' HP ' + e.hp + '/' + e.max;
    $('pBar').style.width = Math.max(0, S.php / PMAX * 100) + '%';
    $('eBar').style.width = Math.max(0, e.hp / e.max * 100) + '%';
    var it = S.intent, tx;
    if (it.type === 'atk') tx = '⚠️ ' + e.name + 'の こうげき予告!<br>🗡️ ' + it.dmg + 'ダメージ';
    else if (it.type === 'big') tx = '🔥 大技が来る!!<br>💢 ' + it.dmg + 'ダメージ(カウンターでお返し!)';
    else if (it.type === 'guard') tx = '🛡️ ぼうぎょの構え<br>こちらのダメージ半分';
    else tx = '💥 ちからをためている…<br>(次のターン大技!)';
    $('intent').innerHTML = tx;
    $('energy').textContent = '⚡ ' + S.energy + '/3';
    $('combo').textContent = S.combo > 0 ? '🔥 れんけい x' + S.combo : '';
    $('round').textContent = (S.ei + 1) + '/3人め';
    var h = $('hand'); h.innerHTML = '';
    S.hand.forEach(function (k, i) {
      var c = CARDS[k], b = document.createElement('button');
      b.className = 'card'; b.disabled = S.busy || c.cost > S.energy;
      b.innerHTML = '<b>' + c.icon + '</b>' + (i + 1) + '. ' + c.name + '<br>⚡' + c.cost + ' ' + c.desc;
      b.onclick = function () { play(i); };
      h.appendChild(b);
    });
    $('endBtn').disabled = S.busy;
  }
  function shake(id) {
    var f = $(id); f.classList.add('hit');
    setTimeout(function () { f.classList.remove('hit'); }, 200);
  }
  function hurtEnemy(n) {
    S.e.hp = Math.max(0, S.e.hp - n); shake('eFace');
  }
  function play(i) {
    if (S.over || S.busy) return;
    var k = S.hand[i]; if (!k) return;
    var c = CARDS[k]; if (c.cost > S.energy) return;
    S.energy -= c.cost; S.hand.splice(i, 1);
    if (k === 'punch' || k === 'kick') {
      var base = k === 'punch' ? 2 : 5, dmg = base + S.combo;
      if (S.intent.type === 'guard') dmg = Math.floor(dmg / 2);
      hurtEnemy(dmg); S.combo++;
      log(c.icon + ' ' + dmg + 'ダメージ!' + (S.combo > 1 ? ' れんけい!' : ''));
      if (S.e.hp <= 0) { return win(); }
    } else {
      S.combo = 0;
      if (k === 'guard') { S.block += 5; log('🛡️ 防御 +5'); }
      else if (k === 'counter') { S.counter = true; log('🔄 カウンターの構え!'); }
      else { S.php = Math.min(PMAX, S.php + 3); log('🍙 HP+3'); }
    }
    render();
  }
  function endTurn() {
    if (S.over || S.busy) return;
    S.busy = true; var it = S.intent, e = S.e, t;
    if (it.type === 'atk' || it.type === 'big') {
      if (S.counter) {
        var cd = it.type === 'big' ? 14 : 7; hurtEnemy(cd);
        t = '🔄 カウンター成功!! ' + cd + 'ダメージ&ノーダメージ!';
        if (e.hp <= 0) { render(); return win(); }
      } else {
        var d = Math.max(0, it.dmg - S.block); S.php = Math.max(0, S.php - d); shake('pFace');
        t = e.name + 'の こうげき! ' + d + 'ダメージ' + (S.block ? '(ガード' + Math.min(S.block, it.dmg) + '軽減)' : '');
      }
    } else if (it.type === 'charge') {
      t = S.counter ? '🔄 カウンターは空ぶり…' : e.name + 'は ちからをためた…';
    } else t = e.name + 'は ぼうぎょした。';
    log(t); S.turns++;
    if (S.php <= 0) { render(); return lose(); }
    nextIntent(); deal(); S.busy = false; render();
  }
  function score() { return S.php * 10 + S.ei * 200 + Math.max(0, 300 - S.turns * 10); }
  function win() {
    S.ei++;
    if (S.ei >= ENEMIES.length) {
      S.over = true; S.busy = true;
      return finish('🏆 ぜんぶ たおした!', 'のこりHP ' + S.php + ' / ' + S.turns + 'ターン<br>スコア: ' + (S.php * 10 + 600 + Math.max(0, 300 - S.turns * 10)));
    }
    S.php = Math.min(PMAX, S.php + 5);
    log('🎉 ' + S.e.name + 'をたおした! HP+5');
    S.busy = true; render();
    setTimeout(function () { spawn(); deal(); S.busy = false; render(); }, 900);
  }
  function lose() {
    S.over = true;
    finish('💫 まけちゃった…', S.ei + '人めまで たおした<br>スコア: ' + score());
  }
  function finish(title, text) {
    $('endTitle').textContent = title; $('endText').innerHTML = text;
    setTimeout(function () { $('endOv').classList.remove('hidden'); $('retryBtn').focus(); }, 500);
  }
  function start() {
    S = newState(); S.over = false;
    $('startOv').classList.add('hidden'); $('endOv').classList.add('hidden');
    spawn(); deal(); log('はじめ!'); render();
  }
  S = newState(); S.e = { face: '🐗', name: '', hp: 1, max: 1 }; S.intent = { type: 'guard' }; render();
  $('startBtn').onclick = start;
  $('retryBtn').onclick = start;
  $('endBtn').onclick = endTurn;
  document.addEventListener('keydown', function (ev) {
    if (S.over) return;
    if (ev.key >= '1' && ev.key <= '5') play(+ev.key - 1);
    else if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); endTurn(); }
  });
})();
