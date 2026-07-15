// とび出せ!PKストッパー — 説明→プレイ→リザルト→リトライ
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const scoreLabel = document.getElementById('scoreLabel');
  const livesLabel = document.getElementById('lives');
  const levelLabel = document.getElementById('levelLabel');
  const flashMsg = document.getElementById('flashMsg');

  const ZONE_X = [W / 6, W / 2, W * 5 / 6];
  const GOAL_LINE_Y = 150;
  const GOAL_TOP_Y = 30;
  const KICKER_X = W / 2;
  const KICKER_Y = H - 60;

  const BASE_TELL = 900, MIN_TELL = 320, TELL_STEP = 65;
  const BASE_FLIGHT = 950, MIN_FLIGHT = 380, FLIGHT_STEP = 55;
  const LEVEL_UP_EVERY = 5;
  const RESOLVE_PAUSE = 900;

  let state = null;
  let running = false;
  let rafId = 0;

  function levelFor(saves) {
    return 1 + Math.floor(saves / LEVEL_UP_EVERY);
  }

  function pickTarget(avoid) {
    let t;
    do { t = Math.floor(Math.random() * 3); } while (t === avoid && Math.random() < 0.7);
    return t;
  }

  function newState() {
    return {
      lives: 3, score: 0, combo: 0, bestCombo: 0, saves: 0,
      lastTarget: -1,
      keeperX: ZONE_X[1],
      phase: 'idle', // idle -> tell -> flight -> resolved
      phaseStart: Date.now(),
      target: 1, dive: 1, isSpecial: false,
      tellDuration: BASE_TELL, flightDuration: BASE_FLIGHT,
      lastResult: null,
    };
  }

  function startRound() {
    const s = state;
    const level = levelFor(s.saves);
    let tell = Math.max(MIN_TELL, BASE_TELL - (level - 1) * TELL_STEP);
    let flight = Math.max(MIN_FLIGHT, BASE_FLIGHT - (level - 1) * FLIGHT_STEP);
    const isSpecial = s.saves >= 3 && Math.random() < 0.18;
    if (isSpecial) { tell *= 0.55; flight *= 0.85; }

    s.target = pickTarget(s.lastTarget);
    s.lastTarget = s.target;
    s.dive = 1; // キーパーは何もしなければ中央に構える
    s.keeperX = ZONE_X[1];
    s.isSpecial = isSpecial;
    s.tellDuration = tell;
    s.flightDuration = flight;
    s.phase = 'tell';
    s.phaseStart = Date.now();
    s.lastResult = null;
    flashMsg.textContent = '';
    flashMsg.className = 'flashMsg';
  }

  function handleDive(dir) {
    if (!running || !state) return;
    if (state.phase !== 'tell' && state.phase !== 'flight') return;
    state.dive = dir;
  }

  // ---- 入力 ----
  addEventListener('keydown', e => {
    if (e.key === ' ') e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') handleDive(0);
    else if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 's' || e.key === 'S') handleDive(1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') handleDive(2);
  });
  document.getElementById('leftBtn').addEventListener('click', () => handleDive(0));
  document.getElementById('centerBtn').addEventListener('click', () => handleDive(1));
  document.getElementById('rightBtn').addEventListener('click', () => handleDive(2));

  function resolveRound() {
    const s = state;
    const success = s.dive === s.target;
    if (success) {
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.saves++;
      const gain = (10 + s.combo * 2) * (s.isSpecial ? 2 : 1);
      s.score += gain;
      flashMsg.textContent = s.isSpecial ? `スーパーセーブ!+${gain}` : `セーブ!+${gain}`;
      flashMsg.className = 'flashMsg ok';
    } else {
      s.combo = 0;
      s.lives--;
      flashMsg.textContent = '失点…';
      flashMsg.className = 'flashMsg bad';
    }
    s.lastResult = success;
    s.phase = 'resolved';
    s.phaseStart = Date.now();
    updateHud();
  }

  function updateHud() {
    scoreLabel.textContent = 'SCORE ' + state.score;
    livesLabel.textContent = '♥'.repeat(Math.max(0, state.lives)) || '-';
    levelLabel.textContent = 'Lv.' + levelFor(state.saves);
  }

  // ---- 更新 ----
  function update() {
    const s = state;
    const elapsed = Date.now() - s.phaseStart;

    if (s.phase === 'tell') {
      if (elapsed >= s.tellDuration) {
        s.phase = 'flight';
        s.phaseStart = Date.now();
      }
    } else if (s.phase === 'flight') {
      if (elapsed >= s.flightDuration) {
        resolveRound();
      }
    } else if (s.phase === 'resolved') {
      if (elapsed >= RESOLVE_PAUSE) {
        if (s.lives <= 0) { endGame(); return; }
        startRound();
      }
    }

    // キーパーの構え位置をダイブ選択へゆっくり寄せる
    const targetKeeperX = ZONE_X[s.dive];
    s.keeperX += (targetKeeperX - s.keeperX) * 0.35;
  }

  // ---- 描画 ----
  function drawPitch() {
    ctx.fillStyle = '#0a2f22';
    ctx.fillRect(0, 0, W, H);
    // ゴールネット
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, GOAL_TOP_Y, W - 20, GOAL_LINE_Y - GOAL_TOP_Y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    for (let x = 10; x <= W - 10; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, GOAL_TOP_Y); ctx.lineTo(x, GOAL_LINE_Y); ctx.stroke();
    }
    for (let y = GOAL_TOP_Y; y <= GOAL_LINE_Y; y += 20) {
      ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(W - 10, y); ctx.stroke();
    }
    // ゾーンの区切り線(うっすら)
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(W / 3, GOAL_LINE_Y); ctx.lineTo(W / 3, H - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 2 / 3, GOAL_LINE_Y); ctx.lineTo(W * 2 / 3, H - 20); ctx.stroke();
  }

  function drawKeeper(x, y) {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(x, y - 14, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b6cff';
    ctx.fillRect(x - 14, y - 6, 28, 18);
    ctx.fillRect(x - 22, y - 4, 8, 10);
    ctx.fillRect(x + 14, y - 4, 8, 10);
  }

  function drawKicker(x, y) {
    ctx.fillStyle = '#ffd6c2';
    ctx.beginPath(); ctx.arc(x, y - 16, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6584';
    ctx.fillRect(x - 10, y - 8, 20, 16);
  }

  function drawArrow(x, y, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir === 0 ? Math.PI : dir === 2 ? 0 : -Math.PI / 2);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(6, -12); ctx.lineTo(6, -5);
    ctx.lineTo(16, -5); ctx.lineTo(16, 5); ctx.lineTo(6, 5); ctx.lineTo(6, 12);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    const s = state;
    drawPitch();

    if (s.phase === 'idle') { drawKicker(KICKER_X, KICKER_Y); drawKeeper(s.keeperX, GOAL_LINE_Y - 10); return; }

    if (s.phase === 'tell') {
      drawKicker(KICKER_X, KICKER_Y);
      drawKeeper(s.keeperX, GOAL_LINE_Y - 10);
      ctx.fillStyle = s.isSpecial ? '#ffd166' : '#ffffff';
      ctx.beginPath(); ctx.arc(KICKER_X, KICKER_Y - 30, 7, 0, Math.PI * 2); ctx.fill();
      drawArrow(KICKER_X, KICKER_Y - 55, s.target);
    } else if (s.phase === 'flight') {
      const t = Math.min(1, (Date.now() - s.phaseStart) / s.flightDuration);
      const bx = KICKER_X + (ZONE_X[s.target] - KICKER_X) * t;
      const by = (KICKER_Y - 30) + (GOAL_LINE_Y - (KICKER_Y - 30)) * t - 40 * Math.sin(Math.PI * t);
      drawKicker(KICKER_X, KICKER_Y);
      drawKeeper(s.keeperX, GOAL_LINE_Y - 10);
      ctx.fillStyle = s.isSpecial ? '#ffd166' : '#ffffff';
      ctx.beginPath(); ctx.arc(bx, by, s.isSpecial ? 9 : 7, 0, Math.PI * 2); ctx.fill();
    } else if (s.phase === 'resolved') {
      drawKicker(KICKER_X, KICKER_Y);
      drawKeeper(s.keeperX, GOAL_LINE_Y - 10);
      ctx.fillStyle = s.isSpecial ? '#ffd166' : '#ffffff';
      ctx.beginPath(); ctx.arc(ZONE_X[s.target], GOAL_LINE_Y, s.isSpecial ? 9 : 7, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    if (state.combo > 0) ctx.fillText('COMBO ' + state.combo, W / 2, H - 6);
  }

  function loop() {
    if (!running) return;
    update();
    if (running) { draw(); rafId = requestAnimationFrame(loop); }
  }

  // ---- 画面遷移 ----
  function startGame() {
    state = newState();
    updateHud();
    intro.classList.add('hidden');
    result.classList.add('hidden');
    flashMsg.textContent = '';
    flashMsg.className = 'flashMsg';
    running = true;
    cancelAnimationFrame(rafId);
    startRound();
    rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    draw();
    resultTitle.textContent = 'ゲーム終了';
    resultText.textContent =
      'スコア: ' + state.score + '\n' +
      'セーブ数: ' + state.saves + ' / ベストコンボ: ' + state.bestCombo;
    resultText.style.whiteSpace = 'pre-line';
    result.classList.remove('hidden');
  }

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
})();
