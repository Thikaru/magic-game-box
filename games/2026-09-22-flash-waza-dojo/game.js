(function(){
  var WORDS = [
    { kana:'きあい', romaji:'kiai' },
    { kana:'れんだ', romaji:'renda' },
    { kana:'あてみ', romaji:'atemi' },
    { kana:'てっけん', romaji:'tekken' },
    { kana:'はっけい', romaji:'hakkei' },
    { kana:'うらわざ', romaji:'urawaza' },
    { kana:'とっしん', romaji:'tosshin' },
    { kana:'けりわざ', romaji:'keriwaza' },
    { kana:'すりあし', romaji:'suriashi' },
    { kana:'とびげり', romaji:'tobigeri' },
    { kana:'はやわざ', romaji:'hayawaza' },
    { kana:'えんかいてん', romaji:'enkaiten' },
    { kana:'つきげり', romaji:'tsukigeri' },
    { kana:'こうそくだ', romaji:'kousokuda' },
    { kana:'みねうち', romaji:'mineuchi' },
    { kana:'しんくうは', romaji:'shinkuuha' },
    { kana:'らいめいだん', romaji:'raimeidan' },
    { kana:'かいてんげり', romaji:'kaitengeri' },
    { kana:'まわしげり', romaji:'mawashigeri' },
    { kana:'うちおろし', romaji:'uchioroshi' },
    { kana:'きょうれつだ', romaji:'kyouretsuda' },
    { kana:'れんぞくわざ', romaji:'renzokuwaza' },
    { kana:'こんてつけん', romaji:'kontetsuken' },
    { kana:'しっぷうげり', romaji:'shippuugeri' },
    { kana:'せんぷうきゃく', romaji:'senpuukyaku' },
    { kana:'ばくれつけん', romaji:'bakuretsuken' },
    { kana:'ひっさつわざ', romaji:'hissatsuwaza' },
    { kana:'いかづちうち', romaji:'ikazuchiuchi' },
    { kana:'じゃくてんつき', romaji:'jakutentsuki' },
    { kana:'がんせきおとし', romaji:'gansekiotoshi' }
  ];
  var OPPONENTS = [
    { face:'🥋', label:'見習い道場破り' },
    { face:'🐯', label:'とらの型づかい' },
    { face:'🐉', label:'りゅうの型づかい' },
    { face:'🦁', label:'ししおう' },
    { face:'👹', label:'おにの師範代' },
    { face:'🦅', label:'はやぶさの拳士' },
    { face:'🐺', label:'おおかみの影' },
    { face:'🦂', label:'さそりの毒手' }
  ];
  var OPPONENT_HP = 3;

  var START_LIVES = 3;
  var MISS_PENALTY = 400;
  var MIN_INPUT_TIME = 500;

  var livesEl = document.getElementById('lives');
  var scoreLabel = document.getElementById('scoreLabel');
  var comboLabel = document.getElementById('comboLabel');
  var stageEl = document.getElementById('stage');
  var timerBarEl = document.getElementById('timerBar');
  var phaseTagEl = document.getElementById('phaseTag');
  var wordBoxEl = document.getElementById('wordBox');
  var kanaDisplayEl = document.getElementById('kanaDisplay');
  var typedHintEl = document.getElementById('typedHint');
  var toastEl = document.getElementById('toast');
  var opponentFaceEl = document.getElementById('opponentFace');
  var opponentLabelEl = document.getElementById('opponentLabel');
  var opponentHPEl = document.getElementById('opponentHP');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var finalClearedEl = document.getElementById('finalCleared');
  var finalComboEl = document.getElementById('finalCombo');
  var finalDefeatedEl = document.getElementById('finalDefeated');
  var finalScoreEl = document.getElementById('finalScore');
  var vkb = document.getElementById('vkb');
  var vkbToggle = document.getElementById('vkbToggle');

  function buildKeyboard(){
    vkb.querySelectorAll('.vkb-row').forEach(function(row){
      row.getAttribute('data-row').split('').forEach(function(ch){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = ch;
        btn.addEventListener('click', function(){ handleChar(ch); });
        row.appendChild(btn);
      });
    });
  }
  buildKeyboard();
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    vkb.classList.remove('hidden');
  }
  vkbToggle.addEventListener('click', function(){ vkb.classList.toggle('hidden'); });

  var phase = 'idle'; // idle | flash | input | transition | gameover
  var lives = START_LIVES, score = 0, combo = 0, maxCombo = 0, cleared = 0, defeated = 0;
  var opponentHp = OPPONENT_HP, opponentIndex = 0;
  var currentWord, typed, isGolden, isBonus;
  var flashDuration, flashRemaining, inputDuration, inputRemaining;
  var transitionTimer;
  var rafId, lastTime;
  var audioCtx = null;

  function ensureAudio(){
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }
  function beep(freq, dur, type, gainVal){
    var ctx = ensureAudio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = gainVal || 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur + 0.02);
  }
  function sfxType(){ beep(560, 0.05, 'square', 0.04); }
  function sfxCounter(golden){ beep(golden ? 920 : 720, 0.16, 'square', 0.06); if (golden) beep(1240, 0.22, 'sine', 0.05); }
  function sfxMiss(){ beep(170, 0.12, 'sawtooth', 0.05); }
  function sfxHit(){ beep(100, 0.3, 'sawtooth', 0.06); }
  function sfxDefeat(){ beep(660, 0.12, 'square', 0.05); beep(880, 0.16, 'square', 0.05); }
  function sfxGameOver(){ beep(90, 0.5, 'sawtooth', 0.06); }

  function randomPick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  function lenRangeFor(n){
    var minLen = Math.min(4 + Math.floor(n / 4), 9);
    var maxLen = Math.min(7 + Math.floor(n / 3), 13);
    if (maxLen < minLen) maxLen = minLen;
    return [minLen, maxLen];
  }
  function pickWord(n, exclude){
    var range = lenRangeFor(n);
    var pool = WORDS.filter(function(w){
      return w.romaji.length >= range[0] && w.romaji.length <= range[1] && (!exclude || w.kana !== exclude.kana);
    });
    if (!pool.length) pool = WORDS.filter(function(w){ return !exclude || w.kana !== exclude.kana; });
    return randomPick(pool);
  }
  function flashTimeFor(n, bonus){
    var t = Math.max(550, 1550 - n * 35);
    return bonus ? t + 450 : t;
  }
  function inputTimeFor(n, romajiLen, bonus){
    var base = Math.max(1700, 5200 - n * 130) + romajiLen * 90;
    return bonus ? base + 1500 : base;
  }
  function goldenChanceFor(n){ return n < 3 ? 0 : Math.min(0.22, 0.08 + n * 0.008); }

  function updateHud(){
    var hearts = '';
    for (var i = 0; i < START_LIVES; i++) hearts += i < lives ? '❤️' : '🖤';
    livesEl.textContent = hearts;
    scoreLabel.textContent = score;
    comboLabel.textContent = combo;
  }
  function updateOpponent(){
    var o = OPPONENTS[opponentIndex % OPPONENTS.length];
    opponentFaceEl.textContent = o.face;
    opponentLabelEl.textContent = o.label;
    var html = '';
    for (var i = 0; i < OPPONENT_HP; i++) html += '<span class="' + (i < opponentHp ? 'on' : '') + '"></span>';
    opponentHPEl.innerHTML = html;
  }
  function updateTimerBar(){
    var pct, cls;
    if (phase === 'flash') {
      pct = Math.max(0, flashRemaining / flashDuration) * 100;
      cls = '';
    } else {
      pct = Math.max(0, inputRemaining / inputDuration) * 100;
      cls = 'input';
    }
    timerBarEl.style.width = pct + '%';
    timerBarEl.className = 'timerBar' + (cls ? ' ' + cls : '') + (pct < 30 ? ' low' : '');
  }
  function showToast(text, ms){
    toastEl.textContent = text;
    toastEl.classList.add('show');
    setTimeout(function(){ toastEl.classList.remove('show'); }, ms || 700);
  }
  function flashShake(){
    stageEl.classList.remove('shake');
    void stageEl.offsetWidth;
    stageEl.classList.add('shake');
  }
  function renderBlanks(){
    var out = '';
    for (var i = 0; i < currentWord.romaji.length; i++) {
      out += i < typed ? currentWord.romaji[i] : '_';
      out += ' ';
    }
    wordBoxEl.innerHTML = '<div class="blanks">' + out.trim() + '</div>';
    typedHintEl.textContent = '> ' + currentWord.romaji.slice(0, typed);
  }

  function startFlash(){
    wordBoxEl.innerHTML = '<div class="kana">' + currentWord.kana + '</div>';
    typedHintEl.innerHTML = '&nbsp;';
    flashRemaining = flashDuration;
    phaseTagEl.textContent = isBonus ? '🌟 会心ラウンド: わざをよくみて!' : (isGolden ? '⭐ 会心のわざ! よくみて!' : 'わざの名前をよくみて!');
    phaseTagEl.className = 'phaseTag' + (isBonus ? ' bonus' : (isGolden ? ' golden' : ''));
    updateTimerBar();
    phase = 'flash';
  }
  function startInput(){
    typed = 0;
    inputRemaining = inputDuration;
    renderBlanks();
    phaseTagEl.textContent = '記憶をたよりに打ち返せ!';
    updateTimerBar();
    phase = 'input';
  }

  function loadRound(){
    isBonus = cleared > 0 && cleared % 5 === 0;
    isGolden = !isBonus && Math.random() < goldenChanceFor(cleared);
    currentWord = pickWord(cleared, currentWord);
    flashDuration = flashTimeFor(cleared, isBonus);
    inputDuration = inputTimeFor(cleared, currentWord.romaji.length, isBonus);
    startFlash();
  }

  function counterSuccess(){
    phase = 'transition';
    sfxCounter(isGolden);
    var base = currentWord.romaji.length * (isBonus ? 16 : 8);
    var timeBonus = Math.round(inputRemaining / 40);
    var comboBonus = combo * 5;
    score += base + timeBonus + comboBonus;
    combo++;
    cleared++;
    if (combo > maxCombo) maxCombo = combo;
    if (isGolden && lives < START_LIVES) lives++;
    opponentHp--;
    var msg = isGolden ? '会心のカウンター! +' + (base + timeBonus + comboBonus) : 'カウンター成功! +' + (base + timeBonus + comboBonus);
    if (opponentHp <= 0) {
      defeated++;
      opponentIndex++;
      opponentHp = OPPONENT_HP;
      sfxDefeat();
      msg = OPPONENTS[(opponentIndex - 1) % OPPONENTS.length].label + 'をやぶった!';
    }
    updateHud();
    updateOpponent();
    showToast(msg, 750);
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(loadRound, 750);
  }

  function timeoutFail(){
    phase = 'transition';
    sfxHit();
    wordBoxEl.innerHTML = '<div class="kana">' + currentWord.kana + '</div>';
    typedHintEl.textContent = '正解は「' + currentWord.romaji + '」だった';
    lives = Math.max(0, lives - 1);
    combo = 0;
    updateHud();
    flashShake();
    showToast('わざを食らった…', 1100);
    clearTimeout(transitionTimer);
    if (lives <= 0) {
      transitionTimer = setTimeout(endGame, 1200);
    } else {
      transitionTimer = setTimeout(loadRound, 1300);
    }
  }

  function onMiss(){
    combo = 0;
    inputRemaining = Math.max(MIN_INPUT_TIME, inputRemaining - MISS_PENALTY);
    sfxMiss();
    updateHud();
    updateTimerBar();
    flashShake();
  }

  function handleChar(ch){
    if (phase !== 'input') return;
    ch = ch.toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
    if (ch === currentWord.romaji[typed]) {
      typed++;
      sfxType();
      renderBlanks();
      if (typed >= currentWord.romaji.length) counterSuccess();
    } else {
      onMiss();
    }
  }

  window.addEventListener('keydown', function(e){
    if (phase !== 'input') return;
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) handleChar(e.key);
  });

  function frame(now){
    if (phase === 'idle' || phase === 'gameover') return;
    if (lastTime == null) lastTime = now;
    var dt = now - lastTime;
    lastTime = now;

    if (phase === 'flash') {
      flashRemaining -= dt;
      updateTimerBar();
      if (flashRemaining <= 0) {
        flashRemaining = 0;
        startInput();
      }
    } else if (phase === 'input') {
      inputRemaining -= dt;
      updateTimerBar();
      if (inputRemaining <= 0) {
        inputRemaining = 0;
        updateTimerBar();
        timeoutFail();
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  function startGame(){
    ensureAudio();
    lives = START_LIVES;
    score = 0;
    combo = 0;
    maxCombo = 0;
    cleared = 0;
    defeated = 0;
    opponentIndex = 0;
    opponentHp = OPPONENT_HP;
    currentWord = null;
    updateHud();
    updateOpponent();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    clearTimeout(transitionTimer);
    stageEl.classList.remove('shake');
    lastTime = null;
    if (rafId) cancelAnimationFrame(rafId);
    loadRound();
    rafId = requestAnimationFrame(frame);
  }

  function endGame(){
    phase = 'gameover';
    if (rafId) cancelAnimationFrame(rafId);
    clearTimeout(transitionTimer);
    sfxGameOver();
    finalClearedEl.textContent = cleared;
    finalComboEl.textContent = maxCombo;
    finalDefeatedEl.textContent = defeated;
    finalScoreEl.textContent = score + ' 点';
    resultEl.classList.remove('hidden');
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);

  updateHud();
  updateOpponent();
})();
