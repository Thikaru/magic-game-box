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
    if (!accepting) return;
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
  }

  function startGame() {
    clearTimers();
    sequence = [];
    round = 0;
    inputIndex = 0;
    accepting = false;
    board.classList.remove('reverse');
    intro.classList.add('hidden');
    result.classList.add('hidden');
    pads.forEach(p => p.classList.remove('lit'));
    newRound();
  }

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
