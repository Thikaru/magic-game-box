(function () {
  'use strict';

  var OBJ_DEFS = [
    { emoji: '📚', label: '本棚' },
    { emoji: '🪴', label: '観葉植物' },
    { emoji: '🖥️', label: 'PC' },
    { emoji: '🗑️', label: 'ゴミ箱' },
    { emoji: '☕', label: 'コーヒー' },
    { emoji: '🖼️', label: '額縁' }
  ];

  var GAME_TIME = 60;
  var WARN_DUR = 1.3;
  var DANGER_DUR = 2.0;
  var IDLE_MIN = 6, IDLE_MAX = 10;
  var CATCH_PENALTY = 8;
  var MISS_PENALTY = 3;
  var WRONG_SAFE_PENALTY = 2;

  var elStatus = document.getElementById('status');
  var elTimerBar = document.getElementById('timerbar');
  var elObjects = document.getElementById('objects');
  var elClueList = document.getElementById('clueList');
  var elSafe = document.getElementById('safe');
  var elSafeDigits = document.getElementById('safeDigits');
  var elMsg = document.getElementById('msg');
  var elTimeLabel = document.getElementById('timeLabel');
  var elFoundLabel = document.getElementById('foundLabel');
  var elIntro = document.getElementById('intro');
  var elResult = document.getElementById('result');
  var elResultTitle = document.getElementById('resultTitle');
  var elResultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var timeLeft, phase, phaseTimer, objects, clueOrder, running, intervalId, safeCorrectOrder, safeProgress;

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function randDigits3() {
    var pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    shuffle(pool);
    return pool.slice(0, 3);
  }

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function setup() {
    timeLeft = GAME_TIME;
    phase = 'idle';
    phaseTimer = randRange(IDLE_MIN, IDLE_MAX);
    clueOrder = [];
    running = true;
    safeProgress = 0;

    var digits = randDigits3();
    var order = shuffle(OBJ_DEFS.slice());
    objects = order.map(function (def, i) {
      var isClue = i < 3;
      return {
        emoji: def.emoji,
        label: def.label,
        isClue: isClue,
        digit: isClue ? digits[i] : null,
        state: 'unknown'
      };
    });
    shuffle(objects);

    renderObjects();
    elClueList.textContent = '';
    elSafe.classList.remove('show');
    elSafeDigits.innerHTML = '';
    elMsg.textContent = '';
    elStatus.className = 'status';
    elStatus.textContent = '🕵️ 捜査中…';
    updateTimerUI();
    updateFoundLabel();
  }

  function renderObjects() {
    elObjects.innerHTML = '';
    objects.forEach(function (obj, i) {
      var btn = document.createElement('button');
      btn.className = 'obj';
      btn.innerHTML = '<span>' + obj.emoji + '</span><span class="lbl">' + obj.label + '</span><span class="digit"></span>';
      btn.addEventListener('click', function () { onObjectTap(i, btn); });
      elObjects.appendChild(btn);
    });
  }

  function onObjectTap(i, btn) {
    if (!running) return;
    var obj = objects[i];
    if (obj.state === 'resolved') return;

    if (phase === 'danger') {
      timeLeft = Math.max(0, timeLeft - CATCH_PENALTY);
      showMsg('😱 上司に見つかった!-' + CATCH_PENALTY + '秒');
      updateTimerUI();
      checkLose();
      return;
    }

    obj.state = 'resolved';
    btn.classList.add('resolved');

    if (obj.isClue) {
      btn.classList.add('found');
      btn.querySelector('.digit').textContent = obj.digit;
      clueOrder.push(obj.digit);
      showMsg('🔎 手がかり発見:' + obj.digit);
      updateClueList();
      updateFoundLabel();
      if (clueOrder.length === 3) openSafe();
    } else {
      btn.querySelector('.digit').textContent = 'ハズレ';
      timeLeft = Math.max(0, timeLeft - MISS_PENALTY);
      showMsg('😅 何もなかった…-' + MISS_PENALTY + '秒');
      updateTimerUI();
      checkLose();
    }
  }

  function updateClueList() {
    elClueList.textContent = '見つけた数字: ' + clueOrder.join(' → ');
  }

  function updateFoundLabel() {
    elFoundLabel.textContent = '手がかり ' + clueOrder.length + '/3';
  }

  function openSafe() {
    safeCorrectOrder = clueOrder.slice().sort(function (a, b) { return a - b; });
    safeProgress = 0;
    var shuffled = clueOrder.slice();
    shuffle(shuffled);
    elSafeDigits.innerHTML = '';
    shuffled.forEach(function (d) {
      var btn = document.createElement('button');
      btn.textContent = d;
      btn.addEventListener('click', function () { onSafeTap(d, btn); });
      elSafeDigits.appendChild(btn);
    });
    elSafe.classList.add('show');
    showMsg('🔓 金庫が見つかった!小さい順にタップ');
  }

  function onSafeTap(d, btn) {
    if (!running || btn.classList.contains('used')) return;
    if (d === safeCorrectOrder[safeProgress]) {
      btn.classList.add('used');
      safeProgress++;
      if (safeProgress === safeCorrectOrder.length) {
        win();
      } else {
        showMsg('✅ 正解!次の数字は?');
      }
    } else {
      timeLeft = Math.max(0, timeLeft - WRONG_SAFE_PENALTY);
      showMsg('❌ 違う数字…-' + WRONG_SAFE_PENALTY + '秒');
      updateTimerUI();
      checkLose();
    }
  }

  function showMsg(text) {
    elMsg.textContent = text;
  }

  function updateTimerUI() {
    var pct = Math.max(0, Math.min(100, (timeLeft / GAME_TIME) * 100));
    elTimerBar.style.width = pct + '%';
    elTimerBar.style.background = timeLeft <= 15
      ? 'linear-gradient(90deg,#ff5d5d,#ff9d5d)'
      : 'linear-gradient(90deg,#5be07a,#f4b93f)';
    elTimeLabel.textContent = '残り ' + Math.ceil(timeLeft) + '秒';
  }

  function checkLose() {
    if (timeLeft <= 0) lose();
  }

  function advancePhase() {
    if (phase === 'idle') {
      phase = 'warn';
      phaseTimer = WARN_DUR;
      elStatus.className = 'status warn';
      elStatus.textContent = '⚠️ まもなく上司が来ます!';
    } else if (phase === 'warn') {
      phase = 'danger';
      phaseTimer = DANGER_DUR;
      elStatus.className = 'status danger';
      elStatus.textContent = '🧑‍💼 上司が巡回中!さわるな!';
    } else {
      phase = 'idle';
      phaseTimer = randRange(IDLE_MIN, IDLE_MAX);
      elStatus.className = 'status';
      elStatus.textContent = '🕵️ 捜査中…';
    }
  }

  function tick() {
    if (!running) return;
    var dt = 0.1;
    timeLeft = Math.max(0, timeLeft - dt);
    updateTimerUI();
    if (timeLeft <= 0) { lose(); return; }

    phaseTimer -= dt;
    if (phaseTimer <= 0) advancePhase();
  }

  function stopLoop() {
    running = false;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function win() {
    stopLoop();
    elResultTitle.textContent = '🎉 脱出成功!';
    elResultText.textContent = '残り ' + Math.ceil(timeLeft) + '秒で金庫を解錠!今日は定時で帰れる。';
    showResult();
  }

  function lose() {
    stopLoop();
    elResultTitle.textContent = '⏰ タイムアップ…';
    elResultText.textContent = '金庫は開かなかった。今日も残業確定…もう一度チャレンジしよう。';
    showResult();
  }

  function showResult() {
    elResult.classList.remove('hidden');
  }

  function startGame() {
    elIntro.classList.add('hidden');
    elResult.classList.add('hidden');
    setup();
    intervalId = setInterval(tick, 100);
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
})();
