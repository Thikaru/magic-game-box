(function () {
  'use strict';
  var FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🍋'];
  var GHOST = '👻';
  var LIE = 0.3;
  var names = ['あなた', 'ミミ', 'ポコ'];
  // 0=あなた, 1=ミミ(左・あなたが引く相手), 2=ポコ。引く相手: 0→1, 1→2, 2→0
  var hands, turn, selected, tells, busy, over, timers = [];
  var $ = function (id) { return document.getElementById(id); };

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function dropPairs(h) {
    var seen = {}, out = [];
    h.forEach(function (c) {
      if (c !== GHOST && seen[c]) { delete seen[c]; } else if (c !== GHOST) { seen[c] = true; }
    });
    // 残るのはペアにならなかった果物とおばけ
    h.forEach(function (c) {
      if (c === GHOST) { out.push(c); } else if (seen[c]) { out.push(c); delete seen[c]; }
    });
    return out;
  }

  function alive(p) { return hands[p].length > 0; }
  function nextTarget(p) {
    var t = (p + 1) % 3;
    if (!alive(t)) t = (t + 1) % 3;
    return t;
  }
  function nextActor(p) {
    var n = (p + 1) % 3;
    for (var i = 0; i < 3; i++) { if (alive(n)) return n; n = (n + 1) % 3; }
    return n;
  }

  function newTells() {
    var h = hands[1];
    tells = h.map(function (c) {
      var g = c === GHOST;
      var scared = Math.random() < LIE ? !g : g;
      return scared ? '😰' : '😎';
    });
  }

  function render() {
    [0, 1, 2].forEach(function (p) {
      var id = ['P', 'A', 'B'][p];
      var box = $('cards' + id);
      box.innerHTML = '';
      hands[p].forEach(function (c, i) {
        var b = document.createElement('button');
        b.type = 'button';
        if (p === 0) {
          b.className = 'card front' + (c === GHOST ? ' ghost' : '');
          b.textContent = c;
          b.disabled = true;
        } else {
          b.className = 'card back' + (p === 1 && selected === i ? ' sel' : '');
          b.setAttribute('aria-label', '伏せ札');
          if (p === 1) b.addEventListener('click', function () { pick(i); });
          else b.disabled = true;
        }
        box.appendChild(b);
      });
      $('cnt' + id).textContent = hands[p].length ? '(' + hands[p].length + '枚)' : '(あがり!)';
      $('seat' + id).classList.toggle('out', !hands[p].length);
    });
    $('seatA').classList.toggle('target', turn === 0 && !busy && !over);
    $('drawBtn').disabled = !(turn === 0 && selected !== null && !busy && !over);
  }

  function say(t) { $('msg').textContent = t; }

  function pick(i) {
    if (turn !== 0 || busy || over) return;
    if (selected === i) { confirmDraw(); return; }
    selected = i;
    $('faceA').textContent = tells[i];
    say(tells[i] === '😰' ? 'ミミ「えっ…!?」(おばけっぽい?)' : 'ミミ「ふふん」(セーフっぽい?)');
    render();
  }

  function confirmDraw() {
    if (turn !== 0 || selected === null || busy || over) return;
    doDraw(0, 1, selected);
  }

  function doDraw(from, to, idx) {
    busy = true;
    var card = hands[to].splice(idx, 1)[0];
    var had = hands[from].length;
    hands[from].push(card);
    var merged = dropPairs(hands[from]);
    var paired = merged.length < hands[from].length;
    hands[from] = shuffle(merged);
    var txt = names[from] + 'が' + names[to] + 'から ' + (from === 0 ? card : '1枚') + ' を引いた';
    if (card === GHOST) txt += (from === 0 ? ' …おばけだ!👻' : '!');
    else if (paired) txt += ' → ペア成立!';
    say(txt);
    selected = null;
    $('faceA').textContent = '🙂';
    $('faceB').textContent = '🙂';
    render();
    later(afterDraw.bind(null, from, to), 1100);
  }

  function afterDraw(from, to) {
    // 手札が空になった人は上がり
    [from, to].forEach(function (p) { if (!alive(p)) say(names[p] + ' があがり!'); });
    var left = [0, 1, 2].filter(alive);
    if (left.length <= 1) { return finish(left[0]); }
    turn = nextActor(from);
    if (!alive(turn)) turn = nextActor(turn);
    nextTurn();
  }

  function nextTurn() {
    var t = nextTarget(turn);
    busy = false;
    if (turn === 0) {
      // あなたの引く相手はミミ固定。ミミがあがっていたらポコから引く(表示は左右入替でなく、対象を切替)
      if (t !== 1) { return playerFromB(); }
      newTells();
      selected = null;
      say('あなたの番!ミミの札をタップして表情をチェック');
      render();
    } else {
      busy = true;
      render();
      later(function () {
        var tgt = nextTarget(turn);
        var idx = Math.floor(Math.random() * hands[tgt].length);
        if (turn === 2 && tgt === 0) {
          // 表情をちらっと見せる
          $('faceB').textContent = '🤔';
        }
        doDraw(turn, tgt, idx);
      }, 900);
    }
  }

  // ミミが先にあがった場合はポコの札から引く(表情はポコが担当)
  function playerFromB() {
    busy = true;
    say('ミミがあがり済み。ポコから自動で引きます');
    render();
    later(function () {
      doDraw(0, 2, Math.floor(Math.random() * hands[2].length));
    }, 900);
  }

  function finish(loser) {
    over = true; busy = true;
    render();
    var lose = loser === 0;
    $('rTitle').textContent = lose ? '👻 おばけをつかまされた…' : '🎉 あなたの勝ち!';
    $('rText').textContent = lose
      ? '最後までおばけを持っていたのはあなたでした。表情のウソを見やぶれたかな?'
      : '最後におばけを持っていたのは ' + names[loser] + ' でした!表情を読み切りました。';
    later(function () { $('result').classList.remove('hidden'); }, 900);
  }

  function start() {
    timers.forEach(clearTimeout); timers = [];
    var deck = [];
    FRUITS.forEach(function (f) { deck.push(f, f); });
    deck.push(GHOST);
    shuffle(deck);
    hands = [[], [], []];
    deck.forEach(function (c, i) { hands[i % 3].push(c); });
    hands = hands.map(function (h) { return shuffle(dropPairs(h)); });
    selected = null; over = false; busy = false; turn = 0;
    $('faceA').textContent = '🙂'; $('faceB').textContent = '🙂';
    $('intro').classList.add('hidden');
    $('result').classList.add('hidden');
    // 開始時にあがっている人がいる場合に備える
    var left = [0, 1, 2].filter(alive);
    if (left.length <= 1) { return start(); }
    if (!alive(0)) { turn = nextActor(0); }
    nextTurn();
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  $('drawBtn').addEventListener('click', confirmDraw);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !$('drawBtn').disabled) confirmDraw();
  });
  hands = [[], [], []]; selected = null; turn = 0; busy = true; over = false;
  render();
})();
