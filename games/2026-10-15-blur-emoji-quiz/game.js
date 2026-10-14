(function () {
  'use strict';
  var POOL = [
    ['🐶','いぬ','a'],['🐱','ねこ','a'],['🐭','ねずみ','a'],['🐰','うさぎ','a'],['🦊','きつね','a'],['🐻','くま','a'],
    ['🐼','パンダ','a'],['🐨','コアラ','a'],['🐯','とら','a'],['🦁','ライオン','a'],['🐮','うし','a'],['🐷','ぶた','a'],
    ['🐸','かえる','a'],['🐵','さる','a'],['🐔','にわとり','a'],['🐧','ペンギン','a'],['🐘','ぞう','a'],['🦒','きりん','a'],
    ['🐢','かめ','a'],['🐙','たこ','a'],['🐳','くじら','a'],['🦀','かに','a'],
    ['🍎','りんご','f'],['🍌','バナナ','f'],['🍇','ぶどう','f'],['🍓','いちご','f'],['🍉','すいか','f'],['🍊','みかん','f'],
    ['🍑','もも','f'],['🍍','パイナップル','f'],['🍕','ピザ','f'],['🍔','ハンバーガー','f'],['🍙','おにぎり','f'],['🍜','ラーメン','f'],
    ['🍩','ドーナツ','f'],['🍦','ソフトクリーム','f'],['🍰','ケーキ','f'],['🥕','にんじん','f'],['🌽','とうもろこし','f'],['🍄','きのこ','f'],
    ['🚗','くるま','t'],['🚌','バス','t'],['🚲','じてんしゃ','t'],['✈️','ひこうき','t'],['🚀','ロケット','t'],['⚽','サッカーボール','t'],
    ['🎸','ギター','t'],['⏰','めざまし','t'],['🔑','かぎ','t'],['🎈','ふうせん','t'],['👑','おうかん','t'],['☂️','かさ','t'],
    ['📚','ほん','t'],['🏠','いえ','t'],['🚁','ヘリコプター','t'],['🚢','ふね','t'],
    ['🌻','ひまわり','n'],['🌲','き','n'],['⛄','ゆきだるま','n'],['🌈','にじ','n'],['⭐','ほし','n'],['🌙','つき','n'],
    ['☀️','たいよう','n'],['🔥','ひ','n'],['⚡','かみなり','n'],['🌵','サボテン','n']
  ];
  // 段階: [開始秒, モザイクの解像度, 正解時の得点]
  var STAGES = [[0,3,100],[1.2,4,80],[2.4,6,60],[3.8,8,45],[5.2,12,30],[6.6,24,20],[8,64,10]];
  var LIMIT = 11, TOTAL = 10, WRONG = -15;
  var SIZE = 360;

  var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  var src = document.createElement('canvas'); src.width = src.height = 128;
  var sctx = src.getContext('2d');
  var small = document.createElement('canvas'), smctx = small.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var choicesEl = $('choices'), barFill = $('barFill');

  var state, order, q, cur, t, score, streak, correctN, locked, raf, last, stageIdx, qScore;

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  function drawSource(e) {
    sctx.clearRect(0, 0, 128, 128);
    sctx.fillStyle = '#f4f1e6'; sctx.fillRect(0, 0, 128, 128);
    sctx.font = '104px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText(e, 64, 70);
  }
  function render(res) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, SIZE, SIZE);
    if (res >= 128) { ctx.imageSmoothingEnabled = true; ctx.drawImage(src, 0, 0, SIZE, SIZE); return; }
    small.width = small.height = res;
    smctx.imageSmoothingEnabled = true; smctx.imageSmoothingQuality = 'high';
    smctx.drawImage(src, 0, 0, res, res);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, SIZE, SIZE);
  }

  function updateHud() {
    $('qno').textContent = (q + 1) + ' / ' + TOTAL;
    $('score').textContent = score + 'てん';
    $('nowpts').textContent = locked ? '' : 'いま正解で +' + STAGES[stageIdx][2];
  }

  function nextQuestion() {
    if (q >= TOTAL) return finish();
    cur = order[q];
    var same = shuffle(POOL.filter(function (p) { return p !== cur && p[2] === cur[2]; })).slice(0, 3);
    var opts = shuffle([cur].concat(same));
    drawSource(cur[0]);
    choicesEl.innerHTML = '';
    opts.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = (i + 1) + '. ' + o[1];
      b.addEventListener('click', function () { pick(b, o); });
      choicesEl.appendChild(b);
    });
    t = 0; stageIdx = 0; locked = false; qScore = 0;
    $('msg').textContent = '';
    render(STAGES[0][1]);
    updateHud();
  }

  function pick(btn, o) {
    if (locked || btn.disabled || state !== 'play') return;
    if (o === cur) {
      streak++;
      var base = STAGES[stageIdx][2];
      var bonus = Math.min(50, (streak - 1) * 10);
      score += base + bonus; correctN++;
      btn.classList.add('ok');
      $('msg').textContent = '⭕ せいかい! +' + base + (bonus ? '(れんぞく +' + bonus + ')' : '');
      endQuestion();
    } else {
      streak = 0;
      score = Math.max(0, score + WRONG);
      btn.disabled = true; btn.classList.add('ng');
      $('msg').textContent = '❌ ちがう… ' + WRONG + 'てん';
      updateHud();
    }
  }

  function endQuestion() {
    locked = true;
    render(128);
    Array.prototype.forEach.call(choicesEl.children, function (b) { b.disabled = true; });
    barFill.style.width = '0%';
    updateHud();
    q++;
    setTimeout(function () { if (state === 'play') nextQuestion(); }, 1300);
  }

  function timeout() {
    streak = 0;
    $('msg').textContent = '⌛ じかんぎれ! こたえは「' + cur[1] + '」';
    Array.prototype.forEach.call(choicesEl.children, function (b) {
      if (b.textContent.slice(3) === cur[1]) b.classList.add('ok');
    });
    endQuestion();
  }

  function loop(now) {
    if (state !== 'play') return;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!locked) {
      t += dt;
      var si = 0;
      for (var i = 0; i < STAGES.length; i++) if (t >= STAGES[i][0]) si = i;
      if (si !== stageIdx) { stageIdx = si; render(STAGES[si][1]); updateHud(); }
      barFill.style.width = Math.max(0, 100 - t / LIMIT * 100) + '%';
      if (t >= LIMIT) timeout();
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    $('startOv').classList.add('hidden'); $('endOv').classList.add('hidden');
    order = shuffle(POOL.slice()).slice(0, TOTAL);
    q = 0; score = 0; streak = 0; correctN = 0; state = 'play';
    barFill.style.width = '100%';
    nextQuestion();
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function finish() {
    state = 'end';
    cancelAnimationFrame(raf);
    var rank = score >= 700 ? '🏆 めいたんてい!' : score >= 450 ? '🥈 かんさつ名人' : score >= 250 ? '🥉 まずまず' : '👓 めがねが ひつよう?';
    $('endTitle').textContent = rank;
    $('endScore').textContent = score + 'てん';
    $('endDetail').textContent = '正解 ' + correctN + ' / ' + TOTAL + '問。もっと早く見ぬけるかな?';
    $('endOv').classList.remove('hidden');
  }

  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  document.addEventListener('keydown', function (e) {
    var n = parseInt(e.key, 10);
    if (state === 'play' && n >= 1 && n <= 4 && choicesEl.children[n - 1]) choicesEl.children[n - 1].click();
    else if ((e.key === 'Enter') && state !== 'play') start();
  });

  state = 'idle';
  drawSource('🔍'); render(128);
})();
