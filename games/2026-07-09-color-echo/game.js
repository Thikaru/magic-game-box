// カラーエコー — 光る順番を記憶して再現するメモリーゲーム
// 3ラウンドごとに「さかさまラウンド」が挟まり、覚えた順を逆から入力する必要がある。
(() => {
  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const BEST_KEY = 'dailygames-2026-07-09-color-echo-best';

  const board = document.getElementById('board');
  const pads = Array.from(document.querySelectorAll('.pad'));
  const intro = document.getElementById('intro');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const roundLabel = document.getElementById('roundLabel');
  const bestLabel = document.getElementById('bestLabel');
  const statusLabel = document.getElementById('statusLabel');

  let sequence = [];
  let round = 0;
  let expected = [];
  let inputIndex = 0;
  let accepting = false;
  let reverseRound = false;
  let paused = false;
  let timers = [];
  let best = Number(localStorage.getItem(BEST_KEY)) || 0;

  bestLabel.textContent = 'ベスト ' + best;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function lightPad(idx, duration) {
    pads[idx].classList.add('lit');
    const t = setTimeout(() => pads[idx].classList.remove('lit'), duration);
    timers.push(t);
  }

  function stepInterval() {
    return Math.max(250, 700 - (round - 1) * 30);
  }

  function newRound() {
    round++;
    reverseRound = round % 3 === 0;
    sequence.push(Math.floor(Math.random() * COLORS.length));
    roundLabel.textContent = 'ラウンド ' + round;
    board.classList.toggle('reverse', reverseRound);
    statusLabel.textContent = reverseRound ? '順番を覚えて…さかさまに入力！' : '順番を覚えよう…';
    statusLabel.classList.toggle('reverse-note', reverseRound);
    playSequence();
  }

  function playSequence() {
    accepting = false;
    const interval = stepInterval();
    sequence.forEach((idx, i) => {
      const t = setTimeout(() => lightPad(idx, interval * 0.65), i * interval + 300);
      timers.push(t);
    });
    const readyAt = sequence.length * interval + 400;
    const t = setTimeout(() => {
      expected = reverseRound ? sequence.slice().reverse() : sequence;
      inputIndex = 0;
      accepting = true;
      statusLabel.textContent = reverseRound ? 'さかさまにタップ！' : 'この順にタップ！';
    }, readyAt);
    timers.push(t);
  }

  function handlePad(idx) {
    if (!accepting || paused) return;
    lightPad(idx, 180);
    if (idx === expected[inputIndex]) {
      inputIndex++;
      if (inputIndex === expected.length) {
        accepting = false;
        statusLabel.textContent = '正解！';
        const t = setTimeout(newRound, 700);
        timers.push(t);
      }
    } else {
      endGame();
    }
  }

  function endGame() {
    accepting = false;
    clearTimers();
    const score = round - 1;
    const isBest = score > best;
    if (isBest) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    bestLabel.textContent = 'ベスト ' + best;
    board.classList.remove('reverse');
    statusLabel.textContent = '';
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = score + 'ラウンドまで到達！' + (isBest ? '(自己ベスト更新！)' : '');
    result.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }

  function startGame() {
    clearTimers();
    sequence = [];
    round = 0;
    inputIndex = 0;
    accepting = false;
    paused = false;
    board.classList.remove('reverse');
    intro.classList.add('hidden');
    result.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    pads.forEach(p => p.classList.remove('lit'));
    newRound();
  }

  const pauseBtn = document.getElementById('pauseBtn');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');

  pauseBtn.addEventListener('click', () => {
    if (paused || !result.classList.contains('hidden')) return;
    paused = true;
    accepting = false;
    clearTimers();
    pads.forEach(p => p.classList.remove('lit'));
    pauseOverlay.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  });
  resumeBtn.addEventListener('click', () => {
    if (!paused) return;
    paused = false;
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    playSequence();
  });
  restartBtn.addEventListener('click', () => {
    paused = false;
    pauseOverlay.classList.add('hidden');
    startGame();
  });

  pads.forEach(pad => {
    pad.addEventListener('click', () => handlePad(Number(pad.dataset.idx)));
  });

  addEventListener('keydown', e => {
    const map = { '1': 0, '2': 1, '3': 2, '4': 3 };
    if (e.key in map) handlePad(map[e.key]);
  });

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('retryBtn').addEventListener('click', startGame);
})();

(() => {
  const MUSIC_TRACKS = ['pop', 'speed', 'dark', 'limit'];
  const musicSelect = document.getElementById('musicSelect');
  const musicToggle = document.getElementById('musicToggle');
  const bgm = new Audio();
  bgm.loop = true;
  bgm.volume = 0.5;
  let bgmStarted = false;
  let musicOn = true;

  function playTrack(key) {
    bgm.src = `../../assets/music/${key}.mp3`;
    bgm.currentTime = 0;
    bgm.play().catch(() => {});
  }

  musicSelect.addEventListener('change', () => playTrack(musicSelect.value));

  musicToggle.addEventListener('click', () => {
    musicOn = !musicOn;
    bgm.muted = !musicOn;
    musicToggle.textContent = musicOn ? '🔊 BGM ON' : '🔇 BGM OFF';
    if (musicOn && bgmStarted && bgm.paused) bgm.play().catch(() => {});
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    if (bgmStarted) return;
    bgmStarted = true;
    const randomKey = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
    musicSelect.value = randomKey;
    playTrack(randomKey);
  }, { once: true });
})();

document.addEventListener('DOMContentLoaded', () => {
  const vpadWrap = document.getElementById('vpadWrap');
  const vpadToggle = document.getElementById('vpadToggle');
  const vpadR = document.getElementById('vpadR');

  function setVpadVisible(v) {
    vpadWrap.classList.toggle('hidden', !v);
  }
  let vpadVisible = false;
  setVpadVisible(vpadVisible);
  vpadToggle.addEventListener('click', () => {
    vpadVisible = !vpadVisible;
    setVpadVisible(vpadVisible);
  });

  function dispatchKey(type, key) {
    const target = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement : window;
    target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  }

  document.querySelectorAll('.vpadBtn').forEach((btn) => {
    const key = btn.dataset.key;
    const press = (e) => { e.preventDefault(); dispatchKey('keydown', key); };
    const release = (e) => { e.preventDefault(); dispatchKey('keyup', key); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  vpadR.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dispatchKey('keydown', 'Enter');
    dispatchKey('keyup', 'Enter');
  });
});
