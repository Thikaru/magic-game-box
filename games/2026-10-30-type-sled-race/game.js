(function () {
  'use strict';
  var WORDS = [
    ['🐱','ねこ','neko'],['🐶','いぬ','inu'],['🐵','さる','saru'],['🐴','うま','uma'],
    ['🐢','かめ','kame'],['🐙','たこ','tako'],['🦑','いか','ika'],['🐦','とり','tori'],
    ['🐻','くま','kuma'],['🐥','ひよこ','hiyoko'],['🍉','すいか','suika'],['🍌','ばなな','banana'],
    ['🍎','りんご','ringo'],['🐸','かえる','kaeru'],['🐼','ぱんだ','panda'],['🍊','みかん','mikan'],
    ['🍙','おにぎり','onigiri'],['🌸','さくら','sakura'],['🚗','くるま','kuruma'],['🌙','おつきさま','otsukisama'],
    ['🎂','けーき','ke-ki'],['⛄','ゆきだるま','yukidaruma'],['🍇','ぶどう','budou'],['🦊','きつね','kitsune'],
    ['🚀','ろけっと','roketto']
  ];
  var RIVALS = [
    { emoji: '🐧', name: 'ぺん', speed: 4.0 },
    { emoji: '🐻‍❄️', name: 'しろくま', speed: 4.5 },
    { emoji: '🦊', name: 'きつね', speed: 5.0 }
  ];
  var GOAL = 100, STEP = 2.2, MISS = 2.0, PERFECT = 3, SLIP = 5, SLIP_RANGE = 12;

  var $ = function (id) { return document.getElementById(id); };
  var track = $('track'), pad = $('pad'), card = $('card');
  var state = 'intro', racers = [], lanes = [], raf = 0, last = 0, elapsed = 0;
  var order = [], word = null, idx = 0, missed = false, combo = 0, msgTimer = 0;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildTrack() {
    track.innerHTML = '';
    lanes = [];
    racers.forEach(function (r) {
      var lane = document.createElement('div');
      lane.className = 'lane' + (r.me ? ' me' : '');
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.me ? 'あなた' : r.name;
      var goal = document.createElement('div'); goal.className = 'goal';
      var rider = document.createElement('div'); rider.className = 'rider'; rider.textContent = r.emoji;
      lane.appendChild(nm); lane.appendChild(goal); lane.appendChild(rider);
      track.appendChild(lane);
      lanes.push(rider);
    });
  }

  function render() {
    racers.forEach(function (r, i) {
      var w = track.clientWidth - 12 - 36;
      lanes[i].style.left = (Math.min(r.pos, GOAL) / GOAL * w) + 'px';
    });
    $('timeLabel').textContent = '⏱ ' + elapsed.toFixed(1) + '秒';
    $('comboLabel').textContent = '🔥 コンボ ' + combo;
  }

  function say(t) {
    $('msg').textContent = t;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { $('msg').innerHTML = '&nbsp;'; }, 900);
  }

  function nextWord() {
    if (order.length === 0) order = shuffle(WORDS.slice());
    word = order.pop(); idx = 0; missed = false;
    $('emo').textContent = word[0];
    $('kana').textContent = word[1];
    drawRom();
    var letters = [];
    word[2].split('').forEach(function (c) { if (letters.indexOf(c) < 0) letters.push(c); });
    var pool = 'abcdefghijklmnoprstuwyz-'.split('').filter(function (c) { return letters.indexOf(c) < 0; });
    shuffle(pool);
    while (letters.length < 8) letters.push(pool.pop());
    shuffle(letters);
    pad.innerHTML = '';
    letters.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'key'; b.textContent = c;
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(c); });
      pad.appendChild(b);
    });
  }

  function drawRom() {
    var s = '';
    word[2].split('').forEach(function (c, i) {
      s += '<span class="' + (i < idx ? 'done' : i === idx ? 'next' : 'todo') + '">' + c + '</span>';
    });
    $('rom').innerHTML = s;
  }

  function press(c) {
    if (state !== 'run') return;
    var me = racers[0];
    if (c === word[2][idx]) {
      me.pos += STEP; idx++;
      if (idx >= word[2].length) {
        if (!missed) {
          combo++;
          var bonus = PERFECT + Math.min(combo, 5) * 0.5, txt = '✨ ノーミス! +' + bonus.toFixed(1);
          var slip = racers.slice(1).some(function (r) { var d = r.pos - me.pos; return d > 0 && d < SLIP_RANGE; });
          if (slip) { bonus += SLIP; txt = '💨 スリップストリーム!!'; }
          me.pos += bonus; say(txt);
        } else { say('ゴクロウ!'); }
        $('turbo').textContent = combo >= 3 ? '🔥 ' + combo + 'れんぞく ノーミス!' : ' ';
        nextWord();
      } else drawRom();
    } else {
      missed = true; combo = 0; me.pos = Math.max(0, me.pos - MISS);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      say('💦 ミス!'); $('turbo').innerHTML = '&nbsp;';
    }
    render();
    if (me.pos >= GOAL) finish();
  }

  function frame(t) {
    if (state !== 'run') return;
    var dt = Math.min((t - last) / 1000, 0.1); last = t;
    elapsed += dt;
    racers.forEach(function (r, i) {
      if (i === 0) return;
      r.pos += r.speed * (0.85 + 0.3 * Math.sin(elapsed * r.wob + r.ph)) * dt;
    });
    render();
    if (racers.some(function (r) { return r.pos >= GOAL; })) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (state !== 'run') return;
    state = 'done';
    cancelAnimationFrame(raf);
    // 同時到達はプレイヤー不利にならないよう、到達度の高い順で順位づけ
    var rank = 1;
    for (var i = 1; i < racers.length; i++) if (racers[i].pos > racers[0].pos) rank++;
    var titles = ['', '🥇 1い!ゆうしょう!', '🥈 2い!おしい!', '🥉 3い…あとすこし', '4い…もういちど!'];
    $('resultTitle').textContent = titles[rank];
    $('resultText').innerHTML = 'ゴールまで ' + elapsed.toFixed(1) + '秒<br>ライバルをぶっちぎった!もっとタイムをのばせるかな?';
    if (rank !== 1) {
      var best = racers.slice(1).sort(function (a, b) { return b.pos - a.pos; })[0];
      $('resultText').innerHTML = 'ゴールまで ' + elapsed.toFixed(1) + '秒<br>' + best.emoji + ' ' + best.name + 'が先にゴール!ノーミスのコンボとスリップストリームで差をつけよう。';
    }
    $('result').classList.remove('hidden');
  }

  function startRace() {
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    racers = [{ me: true, emoji: '🛷', pos: 0 }].concat(RIVALS.map(function (r) {
      return { emoji: r.emoji, name: r.name, speed: r.speed, pos: 0, wob: 0.8 + Math.random() * 0.8, ph: Math.random() * 6 };
    }));
    elapsed = 0; combo = 0; order = [];
    buildTrack(); nextWord(); render();
    $('turbo').innerHTML = '&nbsp;'; $('msg').innerHTML = '&nbsp;';
    state = 'count';
    var n = 3;
    $('countNum').textContent = n; $('count').classList.remove('hidden');
    var iv = setInterval(function () {
      n--;
      if (n > 0) { $('countNum').textContent = n; return; }
      clearInterval(iv);
      if (n === 0) { $('countNum').textContent = 'GO!'; setTimeout(go, 400); }
    }, 700);
  }

  function go() {
    $('count').classList.add('hidden');
    state = 'run'; last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) press(e.key.toLowerCase());
  });
  $('startBtn').addEventListener('click', startRace);
  $('retryBtn').addEventListener('click', startRace);
  racers = [{ me: true, emoji: '🛷', pos: 0 }].concat(RIVALS.map(function (r) { return { emoji: r.emoji, name: r.name, speed: r.speed, pos: 0 }; }));
  buildTrack(); nextWord(); render();
  window.addEventListener('resize', render);
})();
