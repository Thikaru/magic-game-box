(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MONS = [
    { n: 'スライム', f: '🟢', hp: 12, a: 4 },
    { n: 'コウモリ', f: '🦇', hp: 16, a: 5 },
    { n: 'ガイコツ', f: '💀', hp: 22, a: 6 },
    { n: 'オーガ', f: '👹', hp: 28, a: 7 },
    { n: 'ゴースト', f: '👻', hp: 34, a: 8 },
    { n: 'ドラゴン', f: '🐉', hp: 46, a: 10 }
  ];
  var ICON = { atk: '⚔️', def: '🛡️', heal: '💚' };
  var PATTERN = [1, 1, 2]; // 攻撃倍率(3ターン周期)
  var S;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function card(t, v) { return { t: t, v: v }; }

  function newGame() {
    S = {
      floor: 0, php: 40, pmax: 40, shield: 0, turn: 0, over: false, busy: false,
      deck: [], discard: [], hand: [], sel: [], mon: null, mhp: 0,
      all: [card('atk', 1), card('atk', 1), card('atk', 2), card('atk', 2), card('atk', 3),
            card('atk', 3), card('atk', 4), card('atk', 5), card('def', 2), card('def', 4)]
    };
    startFloor();
  }
  function startFloor() {
    S.mon = MONS[S.floor];
    S.mhp = S.mon.hp;
    S.turn = 0;
    S.deck = shuffle(S.all.slice());
    S.discard = [];
    S.hand = [];
    S.sel = [];
    S.shield = 0;
    S.busy = false;
    $('log').textContent = '';
    drawHand();
    render();
  }
  function drawHand() {
    S.hand = [];
    while (S.hand.length < 5) {
      if (!S.deck.length) {
        if (!S.discard.length) break;
        S.deck = shuffle(S.discard); S.discard = [];
      }
      S.hand.push(S.deck.pop());
    }
    S.sel = [];
  }
  function lastVal() { return S.sel.length ? S.hand[S.sel[S.sel.length - 1]].v : 0; }

  function calc() {
    var n = S.sel.length, atk = 0, def = 0, heal = 0;
    S.sel.forEach(function (i) {
      var c = S.hand[i];
      if (c.t === 'atk') atk += c.v; else if (c.t === 'def') def += c.v * 2; else heal += c.v * 2;
    });
    return { n: n, dmg: atk * n, def: def, heal: heal };
  }
  function intentMul() { return PATTERN[S.turn % PATTERN.length]; }
  function intentDmg() { return S.mon.a * intentMul(); }

  function render() {
    $('floor').textContent = (S.floor + 1) + 'F / 6F';
    $('turn').textContent = 'ターン ' + (S.turn + 1);
    $('deck').textContent = 'やま ' + S.deck.length;
    $('mface').textContent = S.mon.f;
    $('mname').textContent = S.mon.n;
    $('mhpt').textContent = 'HP ' + Math.max(0, S.mhp) + ' / ' + S.mon.hp;
    $('mhp').style.width = Math.max(0, S.mhp / S.mon.hp * 100) + '%';
    $('intent').textContent = '次のこうげき: ' + intentDmg() + (intentMul() > 1 ? ' 💢つよい!' : '');
    $('phpt').textContent = S.php + ' / ' + S.pmax;
    $('php').style.width = Math.max(0, S.php / S.pmax * 100) + '%';
    $('shield').textContent = S.shield ? '🛡️ ' + S.shield : '';
    var lv = lastVal();
    var h = $('hand');
    h.innerHTML = '';
    S.hand.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var o = S.sel.indexOf(i);
      b.className = 'card ' + c.t + (o >= 0 ? ' sel' : '');
      if (o >= 0) b.setAttribute('data-o', o + 1);
      b.innerHTML = '<span class="ic">' + ICON[c.t] + '</span><span class="n">' + c.v + '</span>';
      b.disabled = S.busy || (o < 0 && c.v <= lv);
      b.onclick = function () { pick(i); };
      h.appendChild(b);
    });
    var r = calc();
    $('preview').textContent = r.n ? ('⚔️ ' + r.dmg + (r.def ? '  🛡️ +' + r.def : '') + (r.heal ? '  💚 +' + r.heal : '') + '  (×' + r.n + '枚)') : 'カードを小さい数字から順にタップ';
    $('goBtn').disabled = S.busy;
    $('clearBtn').disabled = S.busy;
  }
  function pick(i) {
    if (S.busy || S.over) return;
    var o = S.sel.indexOf(i);
    if (o >= 0) { S.sel = S.sel.slice(0, o); } // 途中のカードを外すと以降も外れる
    else if (S.hand[i].v > lastVal()) S.sel.push(i);
    render();
  }
  function endTurn() {
    if (S.busy || S.over) return;
    S.busy = true;
    var r = calc();
    S.shield += r.def;
    S.php = Math.min(S.pmax, S.php + r.heal);
    S.mhp -= r.dmg;
    if (r.dmg) { $('mon').classList.remove('hit'); void $('mon').offsetWidth; $('mon').classList.add('hit'); }
    var msg = r.n ? ('⚔️ ' + r.dmg + ' ダメージ!') : 'なにも出さなかった…';
    S.discard = S.discard.concat(S.hand);
    S.hand = []; S.sel = [];
    if (S.mhp <= 0) { $('log').textContent = msg; render(); setTimeout(win, 700); return; }
    var d = intentDmg(), blocked = Math.min(S.shield, d), real = d - blocked;
    S.shield = 0;
    S.php -= real;
    $('log').textContent = msg + ' → ' + S.mon.n + 'の反撃 ' + d + '(ふせぎ ' + blocked + ')';
    S.turn++;
    render();
    if (S.php <= 0) { setTimeout(lose, 700); return; }
    setTimeout(function () { drawHand(); S.busy = false; render(); }, 600);
  }
  function win() {
    if (S.floor >= MONS.length - 1) {
      S.over = true;
      end('🎉 ぜんクリア!', 'ドラゴンをたおして6階とっぱ!<br>のこりHP ' + S.php + ' / ' + S.pmax);
      return;
    }
    S.php = Math.min(S.pmax, S.php + 8);
    var box = $('rewards');
    box.innerHTML = '';
    var types = ['atk', 'atk', 'atk', 'def', 'heal'];
    for (var k = 0; k < 3; k++) {
      (function () {
        var t = types[Math.floor(Math.random() * types.length)];
        var v = 1 + Math.floor(Math.random() * 6);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'card ' + t;
        b.innerHTML = '<span class="ic">' + ICON[t] + '</span><span class="n">' + v + '</span>';
        b.onclick = function () {
          S.all.push(card(t, v));
          $('rewardOv').classList.add('hidden');
          S.floor++;
          startFloor();
        };
        box.appendChild(b);
      })();
    }
    $('rewardOv').classList.remove('hidden');
  }
  function lose() {
    S.over = true;
    end('💀 ゲームオーバー', S.floor + 1 + '階で力つきた…<br>' + S.mon.n + 'のHPはのこり ' + Math.max(0, S.mhp));
  }
  function end(title, detail) {
    $('endTitle').textContent = title;
    $('endDetail').innerHTML = detail;
    $('endOv').classList.remove('hidden');
  }

  $('startBtn').onclick = function () { $('startOv').classList.add('hidden'); newGame(); };
  $('retryBtn').onclick = function () { $('endOv').classList.add('hidden'); newGame(); };
  $('goBtn').onclick = endTurn;
  $('clearBtn').onclick = function () { if (!S.busy) { S.sel = []; render(); } };
  document.addEventListener('keydown', function (e) {
    if (!S || S.over || S.busy) return;
    if (e.key >= '1' && e.key <= '5') pick(+e.key - 1);
    else if (e.key === 'Enter') endTurn();
  });
  // 初期表示用の仮状態
  S = { floor: 0, php: 40, pmax: 40, shield: 0, turn: 0, over: true, busy: true, deck: [], discard: [], hand: [], sel: [], mon: MONS[0], mhp: MONS[0].hp, all: [] };
  render();
})();
