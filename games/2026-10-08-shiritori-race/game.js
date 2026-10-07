(() => {
  const W = [
    ['🐱','ねこ'],['🐨','こあら'],['🐪','らくだ'],['🍡','だんご'],['🥚','たまご'],['🦍','ごりら'],['🦦','らっこ'],
    ['🦇','こうもり'],['🐿️','りす'],['🍉','すいか'],['🐢','かめ'],['👓','めがね'],['🐟','さかな'],
    ['🍆','なす'],['🍣','すし'],['🦌','しか'],['🦀','かに'],['🐔','にわとり'],['🍎','りんご'],['🦑','いか'],
    ['🦛','かば'],['🍌','ばなな'],['🐻','くま'],['🫘','まめ'],['🐤','ひよこ'],['🐬','いるか']
  ];
  const GOAL = 20, LANES = 3, CW = 360, CH = 480, LW = CW / LANES, CAR_Y = 400;
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);
  const first = w => w[1][0], last = w => w[1][w[1].length - 1];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  let st = 'idle', lane, cur, gate, score, lives, combo, solved, speed, scroll, flash, fx, last_t, used;

  function newGate() {
    const c = last(cur);
    const ok = W.filter(w => first(w) === c && w !== cur && !used.includes(w));
    const right = pick(ok.length ? ok : W.filter(w => first(w) === c && w !== cur));
    const bad = W.filter(w => first(w) !== c && w !== right && w !== cur);
    const opts = [right];
    while (opts.length < LANES) { const b = pick(bad); if (!opts.includes(b)) opts.push(b); }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    gate = { y: -50, opts, right };
  }
  function hud() {
    $('score').textContent = 'スコア ' + score;
    $('goal').textContent = 'ゴールまで ' + (GOAL - solved);
    $('hearts').textContent = '❤️'.repeat(lives) + '🖤'.repeat(3 - lives);
  }
  function start() {
    lane = 1; cur = pick(W.filter(w => W.some(x => first(x) === last(w) && x !== w)));
    used = [cur]; score = 0; lives = 3; combo = 0; solved = 0; speed = 110; scroll = 0; flash = null; fx = [];
    newGate(); hud();
    $('intro').classList.add('hidden'); $('result').classList.add('hidden');
    st = 'play'; last_t = performance.now(); requestAnimationFrame(loop);
  }
  function end(clear) {
    st = 'over';
    $('resTitle').textContent = clear ? '🏁 ゴール!' : '💥 ゲームオーバー';
    $('resText').innerHTML = (clear ? '20こ のしりとりをつなげたよ!<br>' : solved + 'こ つなげたよ。<br>') + 'スコア <b>' + score + '</b>' +
      (clear ? '<br>ノーミスなら もっと高得点!' : '<br>ゴールまであと ' + (GOAL - solved) + 'こ!');
    $('result').classList.remove('hidden');
  }
  function judge() {
    const w = gate.opts[lane];
    if (w === gate.right) {
      combo++; solved++; score += 100 + Math.min(combo, 10) * 20; used.push(w); cur = w;
      speed = Math.min(300, 110 + solved * 8 + combo * 2);
      flash = { c: '#4cd964', t: 0.4 }; fx.push({ x: lane * LW + LW / 2, y: CAR_Y - 30, s: '+' + (100 + Math.min(combo, 10) * 20), t: 0.8 });
      if (solved >= GOAL) { hud(); return end(true); }
    } else {
      lives--; combo = 0; speed = Math.max(110, speed - 40);
      flash = { c: '#ff3b30', t: 0.5 };
      fx.push({ x: lane * LW + LW / 2, y: CAR_Y - 30, s: '「' + gate.right[1] + '」だよ', t: 1.2 });
      if (lives <= 0) { hud(); return end(false); }
    }
    hud(); newGate();
  }
  function move(d) { if (st === 'play') lane = Math.max(0, Math.min(LANES - 1, lane + d)); }

  function loop(t) {
    if (st !== 'play') { draw(); return; }
    const dt = Math.min(0.05, (t - last_t) / 1000); last_t = t;
    scroll = (scroll + speed * dt) % 40;
    gate.y += speed * dt;
    if (gate.y >= CAR_Y) judge();
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
    fx.forEach(f => { f.t -= dt; f.y -= 30 * dt; }); fx = fx.filter(f => f.t > 0);
    draw(); requestAnimationFrame(loop);
  }
  function draw() {
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff';
    for (let i = 1; i < LANES; i++) for (let y = -40 + scroll; y < CH; y += 40) ctx.fillRect(i * LW - 2, y, 4, 22);
    // お題パネル
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, CW, 64);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffcf33';
    ctx.font = '700 15px sans-serif';
    ctx.fillText('いまの言葉:  ' + cur[0] + ' ' + cur[1], CW / 2, 18);
    ctx.fillStyle = '#fff'; ctx.font = '700 20px sans-serif';
    ctx.fillText('「' + last(cur) + '」からはじまる言葉は?', CW / 2, 45);
    if (gate) gate.opts.forEach((w, i) => {
      const x = i * LW, y = gate.y;
      ctx.fillStyle = 'rgba(255,207,51,.9)'; ctx.fillRect(x + 8, y - 44, LW - 16, 88);
      ctx.fillStyle = '#1c1c28'; ctx.font = '36px sans-serif'; ctx.fillText(w[0], x + LW / 2, y - 16);
      ctx.font = '700 18px sans-serif'; ctx.fillText(w[1], x + LW / 2, y + 24);
    });
    ctx.font = '40px sans-serif'; ctx.fillText('🏎️', lane * LW + LW / 2, CAR_Y + 30);
    if (combo >= 3) { ctx.font = '700 14px sans-serif'; ctx.fillStyle = '#ff9f43'; ctx.textAlign = 'left'; ctx.fillText('🔥 ' + combo + ' コンボ', 8, CH - 14); ctx.textAlign = 'center'; }
    fx.forEach(f => { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = '700 20px sans-serif'; ctx.strokeText(f.s, f.x, f.y); ctx.fillText(f.s, f.x, f.y); ctx.globalAlpha = 1; });
    if (flash) { ctx.globalAlpha = flash.t * 0.5; ctx.fillStyle = flash.c; ctx.fillRect(0, 0, CW, CH); ctx.globalAlpha = 1; }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { move(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { move(1); e.preventDefault(); }
  });
  cv.addEventListener('pointerdown', e => {
    if (st !== 'play') return;
    const r = cv.getBoundingClientRect();
    lane = Math.max(0, Math.min(LANES - 1, Math.floor((e.clientX - r.left) / r.width * LANES)));
  });
  $('bl').addEventListener('click', () => move(-1));
  $('br').addEventListener('click', () => move(1));
  $('startBtn').addEventListener('click', start);
  $('retryBtn').addEventListener('click', start);
  const pad = $('pad');
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) pad.classList.remove('hidden');
  $('padToggle').addEventListener('click', () => pad.classList.toggle('hidden'));
  lane = 1; cur = W[0]; gate = null; fx = []; combo = 0; flash = null; draw();
})();
