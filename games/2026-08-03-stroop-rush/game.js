(function () {
  'use strict';

  var COLORS = ['red', 'blue', 'green', 'yellow'];
  var LABEL = { red: 'あか', blue: 'あお', green: 'みどり', yellow: 'きいろ' };
  var HEX = { red: '#e6533f', blue: '#4a90e2', green: '#43a047', yellow: '#f4c430' };
  var MEANING_ROUND_EVERY = 5; // 正解5回ごとに「ことばラウンド」

  var heartsEl = document.getElementById('hearts');
  var scoreEl = document.getElementById('scoreLabel');
  var timerFill = document.getElementById('timerFill');
  var modeBanner = document.getElementById('modeBanner');
  var wordText = document.getElementById('wordText');
  var comboLabel = document.getElementById('comboLabel');
  var answerBtns = Array.prototype.slice.call(document.querySelectorAll('.ansBtn'));
  var toast = document.getElementById('toast');
  var flash = document.getElementById('flash');
  var introOverlay = document.getElementById('introOverlay');
  var resultOverlay = document.getElementById('resultOverlay');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  var rafId = null;

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function freshState() {
    return {
      running: false,
      lives: 3,
      score: 0,
      correctStreak: 0,
      totalCorrect: 0,
      correctSinceMeaning: 0,
      pendingMeaningRound: false,
      bestStreak: 0,
      isMeaningRound: false,
      wordKey: null,
      colorKey: null,
      roundStart: 0,
      timeLimit: 2000,
      answered: false
    };
  }

  var state = freshState();

  function timeLimitFor(totalCorrect) {
    var level = Math.floor(totalCorrect / 3);
    return Math.max(2000 - level * 110, 850);
  }

  function updateHud() {
    heartsEl.textContent = '♥'.repeat(state.lives) + '♡'.repeat(3 - state.lives);
    scoreEl.textContent = 'SCORE ' + state.score;
    if (state.correctStreak > 0) {
      comboLabel.textContent = state.correctStreak + 'れんぞく正解中!';
    } else {
      comboLabel.textContent = '';
    }
  }

  function scoreMultiplier() {
    return 1 + Math.min(Math.floor(state.correctStreak / 5), 4) * 0.25;
  }

  function nextRound() {
    state.answered = false;
    state.wordKey = rand(COLORS);
    state.colorKey = rand(COLORS);
    state.isMeaningRound = state.pendingMeaningRound;
    state.pendingMeaningRound = false;

    wordText.textContent = LABEL[state.wordKey];
    wordText.style.color = HEX[state.colorKey];
    modeBanner.classList.toggle('show', state.isMeaningRound);

    state.timeLimit = timeLimitFor(state.totalCorrect);
    state.roundStart = performance.now();
    updateHud();
  }

  function correctKeyForRound() {
    return state.isMeaningRound ? state.wordKey : state.colorKey;
  }

  function showToast(text, cls) {
    toast.textContent = text;
    toast.className = 'toast show ' + cls;
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 650);
  }

  function showFlash(cls) {
    flash.className = 'flash show ' + cls;
    void flash.offsetWidth;
    flash.classList.add('show');
    setTimeout(function () { flash.classList.remove('show'); }, 350);
  }

  function handleAnswer(pickedKey) {
    if (!state.running || state.answered) return;
    state.answered = true;
    var correctKey = correctKeyForRound();

    if (pickedKey === correctKey) {
      var gained = Math.round(10 * scoreMultiplier());
      state.score += gained;
      state.correctStreak++;
      state.totalCorrect++;
      state.correctSinceMeaning++;
      state.bestStreak = Math.max(state.bestStreak, state.correctStreak);
      if (state.correctSinceMeaning >= MEANING_ROUND_EVERY) {
        state.pendingMeaningRound = true;
        state.correctSinceMeaning = 0;
      }
      showToast('+' + gained, 'good');
      showFlash('good');
    } else {
      state.lives--;
      state.correctStreak = 0;
      showToast('ミス!', 'bad');
      showFlash('bad');
      updateHud();
      if (state.lives <= 0) {
        endGame();
        return;
      }
    }
    updateHud();
    setTimeout(function () {
      if (state.running) nextRound();
    }, 260);
  }

  function timeout() {
    if (!state.running || state.answered) return;
    state.answered = true;
    state.lives--;
    state.correctStreak = 0;
    showToast('タイムアップ!', 'bad');
    showFlash('bad');
    updateHud();
    if (state.lives <= 0) {
      endGame();
      return;
    }
    setTimeout(function () {
      if (state.running) nextRound();
    }, 260);
  }

  function loop(now) {
    if (!state.running) return;
    if (!state.answered) {
      var elapsed = now - state.roundStart;
      var remain = Math.max(0, 1 - elapsed / state.timeLimit);
      timerFill.style.width = (remain * 100) + '%';
      if (elapsed >= state.timeLimit) {
        timeout();
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    state = freshState();
    state.running = true;
    introOverlay.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    modeBanner.classList.remove('show');
    toast.className = 'toast';
    flash.className = 'flash';
    updateHud();
    nextRound();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    if (rafId) cancelAnimationFrame(rafId);
    modeBanner.classList.remove('show');
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = 'スコア ' + state.score + ' ・ 最高れんぞく ' + state.bestStreak + '連続';
    resultOverlay.classList.remove('hidden');
  }

  answerBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      handleAnswer(btn.getAttribute('data-color'));
    });
  });

  var KEY_MAP = { '1': 'red', '2': 'blue', '3': 'green', '4': 'yellow' };
  document.addEventListener('keydown', function (e) {
    if (KEY_MAP[e.key]) {
      handleAnswer(KEY_MAP[e.key]);
    }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
})();
