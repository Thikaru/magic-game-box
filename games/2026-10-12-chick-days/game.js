(function () {
  'use strict';
  var STATS = [
    { k: 'food', icon: '🍙', name: 'おなか', color: '#ff9f43', form: ['🐔', 'まるまるニワトリ', 'たくさん食べて大きく育った!'] },
    { k: 'mood', icon: '😊', name: 'きげん', color: '#ff7aa8', form: ['🦚', 'きらきらクジャク', 'いつもごきげんで華やかな姿に!'] },
    { k: 'energy', icon: '💤', name: 'げんき', color: '#5aa9e6', form: ['🦅', 'りりしいワシ', 'たっぷり休んで力強い姿に!'] },
    { k: 'clean', icon: '🛁', name: 'きれい', color: '#5fb878', form: ['🦢', 'まっしろハクチョウ', 'ぴかぴかで気品のある姿に!'] }
  ];
  var ACTIONS = [
    { id: 'feed', label: '🍙 ごはん', hint: 'おなか＋ / きれい−', d: { food: 30, clean: -10 } },
    { id: 'play', label: '🎈 あそぶ', hint: 'きげん＋ / げんき−・おなか−', d: { mood: 30, energy: -18, food: -8 } },
    { id: 'sleep', label: '🛏️ ねる', hint: 'げんき＋ / おなか−・きげん−', d: { energy: 35, food: -10, mood: -6 } },
    { id: 'bath', label: '🛁 おふろ', hint: 'きれい＋ / きげん−', d: { clean: 35, mood: -10 } }
  ];
  var DECAY = { food: 6, mood: 6, energy: 4, clean: 5 };
  var EVENTS = [
    { t: '☔ にわか雨!どろんこになった…', d: { clean: -14 } },
    { t: '🐛 むしを見つけて大よろこび!', d: { mood: 10, food: 8 } },
    { t: '🌙 夜ふかししてしまった…', d: { energy: -12 } },
    { t: '🌞 ぽかぽか日よりで気もちいい', d: { mood: 8, clean: 4 } },
    { t: '🐱 ねこにおどろいた!', d: { mood: -10, energy: -6 } },
    { t: '🍃 そよ風でよくねむれた', d: { energy: 12 } }
  ];
  var DAYS = 5, SLOTS = 5;

  var $ = function (id) { return document.getElementById(id); };
  var st, day, slot, score, wish, over, busy;

  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function buildUi() {
    var bars = $('bars'); bars.innerHTML = '';
    STATS.forEach(function (s) {
      var row = document.createElement('div'); row.className = 'bar';
      row.innerHTML = '<span>' + s.icon + ' ' + s.name + '</span><div class="track"><div class="fill" id="f_' + s.k + '"></div></div><span class="num" id="n_' + s.k + '"></span>';
      bars.appendChild(row);
    });
    var acts = $('acts'); acts.innerHTML = '';
    ACTIONS.forEach(function (a, i) {
      var b = document.createElement('button');
      b.innerHTML = a.label + '<small>' + a.hint + '</small>';
      b.addEventListener('click', function () { act(i); });
      acts.appendChild(b);
    });
  }

  function lowest() {
    var m = STATS[0].k;
    STATS.forEach(function (s) { if (st[s.k] < st[m]) m = s.k; });
    return m;
  }

  function newWish() {
    wish = Math.random() < 0.6 ? pick(ACTIONS).id : null;
    var a = ACTIONS.filter(function (x) { return x.id === wish; })[0];
    $('bubble').textContent = a ? '💭「' + a.label.slice(3) + 'したいなあ」' : '💭「…ぴよ」';
  }

  function render() {
    STATS.forEach(function (s) {
      var v = st[s.k];
      var f = $('f_' + s.k);
      f.style.width = v + '%';
      f.style.background = v <= 25 ? '#e5484d' : s.color;
      $('n_' + s.k).textContent = v;
    });
    $('hDay').textContent = day + '日目';
    $('hSlot').textContent = 'のこり ' + (SLOTS - slot);
    $('hScore').textContent = '⭐ ' + score;
    var low = STATS.some(function (s) { return st[s.k] <= 25; });
    $('chick').textContent = low ? '🥺' : (st.mood >= 60 ? '🐥' : '🐤');
  }

  function start() {
    st = { food: 60, mood: 60, energy: 60, clean: 60 };
    day = 1; slot = 0; score = 0; over = false; busy = false;
    $('msg').textContent = 'ひよこがまっているよ。おせわを選ぼう!';
    $('result').classList.add('hidden');
    $('intro').classList.add('hidden');
    newWish(); render();
  }

  function apply(d) { for (var k in d) st[k] = clamp(st[k] + d[k]); }

  function act(i) {
    if (over || busy || !st) return;
    var a = ACTIONS[i], msgs = [];
    var wasFull = st.food + (a.d.food || 0) > 100;
    apply(a.d);
    if (wasFull) { st.energy = clamp(st.energy - 12); msgs.push('🤢 たべすぎでぐったり…(げんき−12)'); }
    if (wish === a.id) { st.mood = clamp(st.mood + 12); score += 20; msgs.push('💕 ねがいがかなった!(きげん＋12 ⭐＋20)'); }
    else if (wish) { msgs.push('ねがいとはちがったみたい…'); }
    var ch = $('chick'); ch.classList.add('hop'); setTimeout(function () { ch.classList.remove('hop'); }, 180);
    slot++;
    for (var k in DECAY) st[k] = clamp(st[k] - DECAY[k]);
    if (slot >= SLOTS) {
      var ev = pick(EVENTS);
      apply(ev.d); msgs.push('【夜のできごと】' + ev.t);
      day++; slot = 0;
    }
    var dead = STATS.filter(function (s) { return st[s.k] <= 0; })[0];
    var sum = STATS.reduce(function (t, s) { return t + st[s.k]; }, 0);
    score += Math.round(sum / 20);
    $('msg').textContent = msgs.join(' ') || 'おせわしたよ。';
    if (dead) { render(); return finish(dead); }
    if (day > DAYS) { render(); return finish(null); }
    newWish(); render();
  }

  function finish(dead) {
    over = true;
    var title, emoji, text;
    if (dead) {
      title = 'ひよこがたおれた…'; emoji = '😵';
      text = dead.icon + dead.name + 'が0になってしまった。' + (day) + '日目で終了。⭐ ' + score;
    } else {
      var vals = STATS.map(function (s) { return st[s.k]; });
      var min = Math.min.apply(null, vals);
      var best = STATS[0];
      STATS.forEach(function (s) { if (st[s.k] > st[best.k]) best = s; });
      score += 100;
      if (min >= 45) {
        title = '🌈 ごちそうフェニックス!'; emoji = '🦜';
        score += 100;
        text = 'ぜんぶバランスよく育てた大成功!⭐ ' + score;
      } else {
        title = best.form[1]; emoji = best.form[0];
        text = best.form[2] + ' ⭐ ' + score + '\n(全部45以上にそろえると…?)';
      }
    }
    $('rTitle').textContent = title; $('rEmoji').textContent = emoji;
    $('rText').style.whiteSpace = 'pre-line'; $('rText').textContent = text;
    $('result').classList.remove('hidden');
  }

  buildUi();
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  document.addEventListener('keydown', function (e) {
    var i = '1234'.indexOf(e.key);
    if (i >= 0 && i < 4) act(i);
  });
})();
