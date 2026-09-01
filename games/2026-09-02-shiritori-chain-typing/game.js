(function(){
  var CHAIN_WORDS = [
    { kana:'りんご', romaji:'ringo' },
    { kana:'ごりら', romaji:'gorira' },
    { kana:'らくだ', romaji:'rakuda' },
    { kana:'だちょう', romaji:'dachou' },
    { kana:'うさぎ', romaji:'usagi' },
    { kana:'ぎんこう', romaji:'ginkou' },
    { kana:'うま', romaji:'uma' },
    { kana:'まめ', romaji:'mame' },
    { kana:'めだか', romaji:'medaka' },
    { kana:'かめ', romaji:'kame' },
    { kana:'かえる', romaji:'kaeru' },
    { kana:'るり', romaji:'ruri' },
    { kana:'りす', romaji:'risu' },
    { kana:'すいか', romaji:'suika' },
    { kana:'すずめ', romaji:'suzume' },
    { kana:'すもう', romaji:'sumou' },
    { kana:'うちわ', romaji:'uchiwa' },
    { kana:'わかめ', romaji:'wakame' },
    { kana:'わに', romaji:'wani' },
    { kana:'にわとり', romaji:'niwatori' },
    { kana:'にく', romaji:'niku' },
    { kana:'にじ', romaji:'niji' },
    { kana:'じどう', romaji:'jidou' },
    { kana:'くじら', romaji:'kujira' },
    { kana:'くつ', romaji:'kutsu' },
    { kana:'つき', romaji:'tsuki' },
    { kana:'つくえ', romaji:'tsukue' },
    { kana:'えんぴつ', romaji:'enpitsu' },
    { kana:'えび', romaji:'ebi' },
    { kana:'びわ', romaji:'biwa' },
    { kana:'きつね', romaji:'kitsune' },
    { kana:'ねこ', romaji:'neko' },
    { kana:'こま', romaji:'koma' },
    { kana:'こおり', romaji:'koori' },
    { kana:'さかな', romaji:'sakana' },
    { kana:'さる', romaji:'saru' },
    { kana:'なす', romaji:'nasu' },
    { kana:'なみだ', romaji:'namida' },
    { kana:'たいこ', romaji:'taiko' },
    { kana:'たこ', romaji:'tako' },
    { kana:'こおろぎ', romaji:'koorogi' },
    { kana:'ぎんが', romaji:'ginga' },
    { kana:'がか', romaji:'gaka' },
    { kana:'かに', romaji:'kani' },
    { kana:'はと', romaji:'hato' },
    { kana:'とけい', romaji:'tokei' },
    { kana:'いか', romaji:'ika' },
    { kana:'いす', romaji:'isu' },
    { kana:'すな', romaji:'suna' },
    { kana:'なべ', romaji:'nabe' },
    { kana:'べんとう', romaji:'bentou' },
    { kana:'うで', romaji:'ude' },
    { kana:'でんち', romaji:'denchi' },
    { kana:'ちず', romaji:'chizu' },
    { kana:'ずつう', romaji:'zutsuu' },
    { kana:'うんどう', romaji:'undou' },
    { kana:'うら', romaji:'ura' }
  ];
  var TRAP_WORDS = [
    { kana:'みかん', romaji:'mikan' },
    { kana:'めろん', romaji:'meron' },
    { kana:'にほん', romaji:'nihon' },
    { kana:'らいおん', romaji:'raion' },
    { kana:'きりん', romaji:'kirin' },
    { kana:'えほん', romaji:'ehon' },
    { kana:'がまん', romaji:'gaman' },
    { kana:'ふうせん', romaji:'fuusen' },
    { kana:'にんじん', romaji:'ninjin' },
    { kana:'さんかく', romaji:'sankaku' }
  ];
  var START_WORD = { kana:'しりとり', romaji:'shiritori' };

  var START_LIVES = 3;
  var MISS_PENALTY = 450;
  var MIN_TIME = 600;

  var livesEl = document.getElementById('lives');
  var scoreLabel = document.getElementById('scoreLabel');
  var clearedLabel = document.getElementById('clearedLabel');
  var comboLabel = document.getElementById('comboLabel');
  var stageEl = document.getElementById('stage');
  var timerBarEl = document.getElementById('timerBar');
  var roundTagEl = document.getElementById('roundTag');
  var trailEl = document.getElementById('trail');
  var targetKanaEl = document.getElementById('targetKana');
  var candidatesEl = document.getElementById('candidates');
  var typedTrailEl = document.getElementById('typedTrail');
  var toastEl = document.getElementById('toast');
  var introEl = document.getElementById('intro');
  var resultEl = document.getElementById('result');
  var finalClearedEl = document.getElementById('finalCleared');
  var finalComboEl = document.getElementById('finalCombo');
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

  var phase = 'idle'; // idle | playing | transition | gameover
  var lives, score, combo, maxCombo, cleared;
  var currentWord, correctWord, trapCandidate, candidateList, typed, isGolden;
  var roundTimeLimit, roundRemaining;
  var history;
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
  function sfxType(){ beep(520, 0.05, 'square', 0.04); }
  function sfxClear(golden){ beep(golden ? 880 : 700, 0.16, 'square', 0.06); if (golden) beep(1200, 0.22, 'sine', 0.05); }
  function sfxMiss(){ beep(160, 0.12, 'sawtooth', 0.05); }
  function sfxTimeout(){ beep(110, 0.3, 'sawtooth', 0.06); }
  function sfxGameOver(){ beep(90, 0.5, 'sawtooth', 0.06); }

  function randomPick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr){
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function isTrapWord(w){ return w.kana.charAt(w.kana.length - 1) === 'ん'; }

  function timeLimitFor(golden){
    var base = Math.max(4200, 9500 - cleared * 280);
    return golden ? base + 2500 : base;
  }
  function candidateCountFor(){ return cleared >= 10 ? 4 : 3; }
  function trapChanceFor(){ return cleared < 3 ? 0 : (cleared < 8 ? 0.35 : 0.6); }

  function updateHud(){
    var hearts = '';
    for (var i = 0; i < START_LIVES; i++) hearts += i < lives ? '❤️' : '🖤';
    livesEl.textContent = hearts;
    scoreLabel.textContent = score;
    clearedLabel.textContent = cleared;
    comboLabel.textContent = combo;
  }
  function updateTimerBar(){
    var pct = Math.max(0, roundRemaining / roundTimeLimit) * 100;
    timerBarEl.style.width = pct + '%';
    timerBarEl.classList.toggle('low', pct < 30);
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
  function updateTrail(){
    trailEl.textContent = history.slice(-6).join(' → ');
  }
  function renderTypedTrail(){
    var out = '> ';
    for (var i = 0; i < correctWord.romaji.length; i++) {
      out += i < typed ? correctWord.romaji[i] : '_';
    }
    typedTrailEl.textContent = out;
  }
  function renderCandidates(revealFail){
    candidatesEl.innerHTML = '';
    candidateList.forEach(function(w){
      var div = document.createElement('div');
      div.className = 'cand';
      div.textContent = w.kana;
      if (revealFail) {
        if (w.kana === correctWord.kana) div.classList.add('reveal-correct');
        else if (isTrapWord(w) && w.kana.charAt(0) === targetKana()) div.classList.add('reveal-trap');
      }
      candidatesEl.appendChild(div);
    });
  }
  function targetKana(){ return currentWord.kana.charAt(currentWord.kana.length - 1); }

  function buildCandidates(){
    var target = targetKana();
    var pool = CHAIN_WORDS.filter(function(w){ return w.kana.charAt(0) === target && w.kana !== currentWord.kana; });
    correctWord = pool.length ? randomPick(pool) : randomPick(CHAIN_WORDS);

    trapCandidate = null;
    if (Math.random() < trapChanceFor()) {
      var trapOptions = TRAP_WORDS.filter(function(w){ return w.kana.charAt(0) === target; });
      if (trapOptions.length) trapCandidate = randomPick(trapOptions);
    }

    var chosen = [correctWord];
    if (trapCandidate) chosen.push(trapCandidate);

    var decoyPool = shuffle(CHAIN_WORDS.concat(TRAP_WORDS)).filter(function(w){
      if (w.kana === correctWord.kana) return false;
      if (trapCandidate && w.kana === trapCandidate.kana) return false;
      if (w.kana.charAt(0) === target && !isTrapWord(w)) return false;
      return true;
    });
    var need = candidateCountFor() - chosen.length;
    for (var i = 0; i < decoyPool.length && chosen.length < candidateCountFor(); i++) {
      chosen.push(decoyPool[i]);
    }
    candidateList = shuffle(chosen);
  }

  function loadRound(golden){
    isGolden = golden;
    buildCandidates();
    typed = 0;
    roundTimeLimit = timeLimitFor(golden);
    roundRemaining = roundTimeLimit;
    targetKanaEl.textContent = targetKana();
    roundTagEl.textContent = golden ? '🌟 ボーナスラウンド(得点2倍!)' : '正しいことばを見つけてタイプしよう';
    roundTagEl.classList.toggle('golden', golden);
    renderCandidates(false);
    renderTypedTrail();
    updateTimerBar();
    updateTrail();
    phase = 'playing';
  }

  function nextRound(){
    var golden = cleared > 0 && cleared % 5 === 0;
    loadRound(golden);
  }

  function completeRound(){
    phase = 'transition';
    sfxClear(isGolden);
    var base = correctWord.romaji.length * (isGolden ? 18 : 9);
    var timeBonus = Math.round(roundRemaining / 45);
    var comboBonus = combo * 4;
    score += base + timeBonus + comboBonus;
    combo++;
    cleared++;
    if (combo > maxCombo) maxCombo = combo;
    history.push(correctWord.kana);
    currentWord = correctWord;
    updateHud();
    showToast('せいかい! +' + (base + timeBonus + comboBonus), 650);
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(nextRound, 650);
  }

  function timeoutRound(){
    phase = 'transition';
    sfxTimeout();
    renderCandidates(true);
    lives = Math.max(0, lives - 1);
    combo = 0;
    updateHud();
    flashShake();
    showToast('じかんぎれ… こたえは「' + correctWord.kana + '」', 1200);
    history.push(correctWord.kana);
    currentWord = correctWord;
    clearTimeout(transitionTimer);
    if (lives <= 0) {
      transitionTimer = setTimeout(endGame, 1200);
    } else {
      transitionTimer = setTimeout(nextRound, 1400);
    }
  }

  function onMiss(){
    combo = 0;
    roundRemaining = Math.max(MIN_TIME, roundRemaining - MISS_PENALTY);
    sfxMiss();
    updateHud();
    updateTimerBar();
    flashShake();
  }

  function handleChar(ch){
    if (phase !== 'playing') return;
    ch = ch.toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
    if (ch === correctWord.romaji[typed]) {
      typed++;
      sfxType();
      renderTypedTrail();
      if (typed >= correctWord.romaji.length) completeRound();
    } else {
      onMiss();
    }
  }

  window.addEventListener('keydown', function(e){
    if (phase !== 'playing') return;
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) handleChar(e.key);
  });

  function frame(now){
    if (phase === 'idle' || phase === 'gameover') return;
    if (lastTime == null) lastTime = now;
    var dt = now - lastTime;
    lastTime = now;

    if (phase === 'playing') {
      roundRemaining -= dt;
      updateTimerBar();
      if (roundRemaining <= 0) {
        roundRemaining = 0;
        updateTimerBar();
        timeoutRound();
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
    currentWord = START_WORD;
    history = [START_WORD.kana];
    updateHud();
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    clearTimeout(transitionTimer);
    stageEl.classList.remove('shake');
    lastTime = null;
    if (rafId) cancelAnimationFrame(rafId);
    loadRound(false);
    rafId = requestAnimationFrame(frame);
  }

  function endGame(){
    phase = 'gameover';
    if (rafId) cancelAnimationFrame(rafId);
    clearTimeout(transitionTimer);
    sfxGameOver();
    finalClearedEl.textContent = cleared;
    finalComboEl.textContent = maxCombo;
    finalScoreEl.textContent = score + ' 点';
    resultEl.classList.remove('hidden');
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);

  updateHud();
})();
