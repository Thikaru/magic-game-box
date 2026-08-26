(function () {
  "use strict";

  var PADS = [
    null,
    { freq: 110, type: "sine", dur: 0.16 },
    { freq: 440, type: "square", dur: 0.09 },
    { freq: 880, type: "triangle", dur: 0.09 }
  ];

  var START_LEN = 3;
  var MAX_LEN = 10;
  var START_TEMPO = 650;
  var MIN_TEMPO = 300;
  var TEMPO_DECAY = 14;
  var START_REST = 0.15;
  var MAX_REST = 0.35;
  var REST_INC = 0.015;
  var GOLDEN_BONUS = 30;
  var GOLDEN_CHANCE = 0.14;

  var el = {
    lives: document.getElementById("lives"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    phaseMsg: document.getElementById("phaseMsg"),
    dots: document.getElementById("dots"),
    bonusBanner: document.getElementById("bonusBanner"),
    pads: [null, document.getElementById("pad1"), document.getElementById("pad2"), document.getElementById("pad3")],
    startOverlay: document.getElementById("startOverlay"),
    overOverlay: document.getElementById("overOverlay"),
    startBtn: document.getElementById("startBtn"),
    retryBtn: document.getElementById("retryBtn"),
    finalScore: document.getElementById("finalScore"),
    overStats: document.getElementById("overStats")
  };

  var G = null;
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function tone(freq, type, dur, gain, delay) {
    if (!audioCtx) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playPadSound(padIndex, golden) {
    var p = PADS[padIndex];
    tone(p.freq, p.type, p.dur, golden ? 0.35 : 0.28);
    if (golden) {
      tone(p.freq * 2, "sine", 0.12, 0.15, 0.03);
    }
  }

  function playTick() {
    tone(1600, "square", 0.03, 0.06);
  }

  function playFail() {
    tone(160, "sawtooth", 0.28, 0.22);
    tone(110, "sawtooth", 0.32, 0.18, 0.05);
  }

  function playRoundClear() {
    tone(660, "sine", 0.1, 0.2);
    tone(880, "sine", 0.12, 0.2, 0.09);
  }

  function playGameOver() {
    tone(300, "sawtooth", 0.4, 0.2);
    tone(200, "sawtooth", 0.5, 0.2, 0.18);
    tone(120, "sawtooth", 0.6, 0.2, 0.36);
  }

  function playGoldenBonus() {
    tone(1046, "sine", 0.14, 0.2);
    tone(1318, "sine", 0.16, 0.18, 0.06);
  }

  function newGameState() {
    return {
      score: 0,
      lives: 3,
      combo: 0,
      maxCombo: 0,
      multiplier: 1,
      round: 0,
      pendingBonus: false,
      phase: "idle",
      pattern: [],
      currentIdx: 0,
      failedThisRound: false,
      stepTimer: null,
      advanceTimer: null,
      isBonusRound: false
    };
  }

  function updateHud() {
    el.lives.textContent = "♥".repeat(Math.max(0, G.lives)) + "♡".repeat(3 - Math.max(0, G.lives));
    el.score.textContent = "スコア: " + G.score;
    el.combo.textContent = "コンボ: " + G.combo;
  }

  function clearDots() {
    el.dots.innerHTML = "";
  }

  function renderDots(pattern) {
    clearDots();
    for (var i = 0; i < pattern.length; i++) {
      var d = document.createElement("div");
      d.className = "dot" + (pattern[i].pad === 0 ? " rest" : "");
      d.id = "dot" + i;
      el.dots.appendChild(d);
    }
  }

  function markDot(i, cls) {
    var d = document.getElementById("dot" + i);
    if (!d) return;
    d.classList.remove("active", "done", "failed");
    if (cls) d.classList.add(cls);
  }

  function genPattern(length, restProb, allowGolden) {
    var pat = [];
    var goldenPicked = false;
    for (var i = 0; i < length; i++) {
      var isRest = Math.random() < restProb;
      if (isRest) {
        pat.push({ pad: 0, golden: false });
      } else {
        var pad = 1 + Math.floor(Math.random() * 3);
        var golden = false;
        if (allowGolden && !goldenPicked && Math.random() < GOLDEN_CHANCE) {
          golden = true;
          goldenPicked = true;
        }
        pat.push({ pad: pad, golden: golden });
      }
    }
    return pat;
  }

  function clearTimers() {
    if (G.stepTimer) { clearTimeout(G.stepTimer); G.stepTimer = null; }
    if (G.advanceTimer) { clearTimeout(G.advanceTimer); G.advanceTimer = null; }
  }

  function flashPad(padIndex, cls, ms) {
    var el2 = el.pads[padIndex];
    var classes = cls.split(" ");
    classes.forEach(function (c) { el2.classList.add(c); });
    setTimeout(function () {
      classes.forEach(function (c) { el2.classList.remove(c); });
    }, ms || 160);
  }

  function startGame() {
    ensureAudio();
    G = newGameState();
    updateHud();
    el.bonusBanner.style.display = "none";
    el.startOverlay.classList.add("hidden");
    el.overOverlay.classList.add("hidden");
    nextRound();
  }

  function currentTempo() {
    return Math.max(MIN_TEMPO, START_TEMPO - (G.round - 1) * TEMPO_DECAY);
  }

  function currentRestProb() {
    return Math.min(MAX_REST, START_REST + (G.round - 1) * REST_INC);
  }

  function currentLength() {
    return Math.min(MAX_LEN, START_LEN + Math.floor((G.round - 1) / 2));
  }

  function nextRound() {
    G.round++;
    G.failedThisRound = false;
    var tempo = currentTempo();
    var restProb = currentRestProb();
    var length = currentLength();

    G.isBonusRound = G.pendingBonus;
    G.pendingBonus = false;
    if (G.isBonusRound) {
      length = START_LEN;
      tempo = tempo + 120;
    }
    G.tempo = tempo;

    G.pattern = genPattern(length, restProb, G.round >= 3);
    renderDots(G.pattern);
    el.bonusBanner.style.display = G.isBonusRound ? "block" : "none";

    G.phase = "playback";
    el.phaseMsg.textContent = "きいて!";
    el.phaseMsg.className = "phase-msg listen";
    playbackStep(0);
  }

  function playbackStep(i) {
    if (G.phase !== "playback") return;
    if (i >= G.pattern.length) {
      G.advanceTimer = setTimeout(function () { startInputPhase(); }, 350);
      return;
    }
    var step = G.pattern[i];
    markDot(i, "active");
    if (step.pad === 0) {
      // rest: silent beat, faint tick only
      playTick();
    } else {
      flashPad(step.pad, step.golden ? "lit golden" : "lit", Math.min(G.tempo * 0.7, 400));
      playPadSound(step.pad, step.golden);
    }
    G.advanceTimer = setTimeout(function () {
      markDot(i, null);
      playbackStep(i + 1);
    }, G.tempo);
  }

  function startInputPhase() {
    if (G.phase === "gameover") return;
    G.phase = "input";
    G.currentIdx = 0;
    el.phaseMsg.textContent = "まねして!";
    el.phaseMsg.className = "phase-msg play";
    openStepWindow(0);
  }

  function openStepWindow(idx) {
    if (G.failedThisRound) return;
    G.currentIdx = idx;
    G.windowTapped = false;
    markDot(idx, "active");
    playTick();
    G.stepTimer = setTimeout(function () {
      closeStepWindow(idx);
    }, G.tempo * 0.95);
  }

  function closeStepWindow(idx) {
    if (G.failedThisRound) return;
    var step = G.pattern[idx];
    if (step.pad !== 0 && !G.windowTapped) {
      markDot(idx, "failed");
      handleFail();
      return;
    }
    markDot(idx, "done");
    var next = idx + 1;
    if (next >= G.pattern.length) {
      handleRoundSuccess();
    } else {
      openStepWindow(next);
    }
  }

  function onPadTap(padIndex) {
    if (!G || G.phase !== "input" || G.failedThisRound) return;
    var idx = G.currentIdx;
    var step = G.pattern[idx];
    if (step.pad === 0) {
      flashPad(padIndex, "wrong");
      markDot(idx, "failed");
      handleFail();
      return;
    }
    if (padIndex !== step.pad) {
      flashPad(padIndex, "wrong");
      markDot(idx, "failed");
      handleFail();
      return;
    }
    // correct
    G.windowTapped = true;
    flashPad(padIndex, "correct");
    playPadSound(padIndex, false);
    if (step.golden) {
      G.score += GOLDEN_BONUS;
      playGoldenBonus();
      updateHud();
    }
    if (G.stepTimer) { clearTimeout(G.stepTimer); G.stepTimer = null; }
    markDot(idx, "done");
    var next = idx + 1;
    if (next >= G.pattern.length) {
      handleRoundSuccess();
    } else {
      openStepWindow(next);
    }
  }

  function handleFail() {
    G.failedThisRound = true;
    clearTimers();
    G.phase = "roundend";
    G.lives--;
    G.combo = 0;
    G.multiplier = 1;
    playFail();
    updateHud();
    el.phaseMsg.textContent = "ミス!";
    el.phaseMsg.className = "phase-msg";
    if (G.lives <= 0) {
      G.advanceTimer = setTimeout(gameOver, 700);
    } else {
      G.advanceTimer = setTimeout(nextRound, 1000);
    }
  }

  function handleRoundSuccess() {
    clearTimers();
    G.phase = "roundend";
    var base = G.pattern.length * 10;
    var gain = Math.round(base * G.multiplier * (G.isBonusRound ? 2 : 1));
    G.score += gain;
    G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    G.multiplier = 1 + Math.floor(G.combo / 3) * 0.5;
    if (G.combo > 0 && G.combo % 5 === 0) {
      G.pendingBonus = true;
    }
    playRoundClear();
    updateHud();
    el.phaseMsg.textContent = "せいこう!+" + gain;
    el.phaseMsg.className = "phase-msg listen";
    G.advanceTimer = setTimeout(nextRound, 700);
  }

  function gameOver() {
    G.phase = "gameover";
    clearTimers();
    playGameOver();
    el.finalScore.textContent = G.score;
    el.overStats.textContent = "到達ラウンド: " + G.round + " / 最大コンボ: " + G.maxCombo;
    el.overOverlay.classList.remove("hidden");
  }

  // input bindings
  for (var i = 1; i <= 3; i++) {
    (function (idx) {
      el.pads[idx].addEventListener("click", function () {
        onPadTap(idx);
      });
    })(i);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "1") onPadTap(1);
    else if (e.key === "2") onPadTap(2);
    else if (e.key === "3") onPadTap(3);
  });

  el.startBtn.addEventListener("click", startGame);
  el.retryBtn.addEventListener("click", startGame);
})();
