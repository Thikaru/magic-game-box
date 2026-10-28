(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SLOTS = [
    { cls: 'atk', name: '⚔️ こうげき' },
    { cls: 'grd', name: '🛡️ ぼうぎょ' },
    { cls: 'heal', name: '💖 かいふく' },
  ];
  const ENEMIES = [
    { face: '🐀', name: 'ドブネズミ', hp: 14, pat: [5] },
    { face: '🦇', name: 'コウモリ', hp: 20, pat: [4, 9] },
    { face: '🐗', name: 'イノシシ', hp: 26, pat: [0, 16] },
    { face: '🧌', name: 'トロル', hp: 32, pat: [8, 8, 14] },
    { face: '🐉', name: 'ドラゴン', hp: 40, pat: [7, 12, 7, 17] },
    { face: '👹', name: 'ダンジョンのボス', hp: 50, pat: [9, 0, 24] },
  ];
  const RELICS = [
    { id: 'fang', icon: '🦷', name: 'きばのおまもり', desc: '⚔️こうげき枠 +2' },
    { id: 'shield', icon: '🪵', name: '木のたて', desc: '🛡️ぼうぎょ枠 +2' },
    { id: 'apple', icon: '🍎', name: 'まほうのりんご', desc: '💖かいふくが2倍' },
    { id: 'dice', icon: '🎲', name: 'ラッキーダイス', desc: 'ふりなおし +1回/ターン' },
    { id: 'six', icon: '🔥', name: 'もえる6', desc: '目が6のサイコロは +3' },
    { id: 'pair', icon: '👯', name: 'ぞろ目のしるし', desc: '同じ目が2つ以上で ⚔️+5' },
    { id: 'heart', icon: '💗', name: 'いのちのたま', desc: '最大HP +6、6回復' },
    { id: 'low', icon: '🍀', name: 'ちいさな幸運', desc: '1と2の目は +2' },
  ];
  const MAX_FLOOR = ENEMIES.length;

  let s;

  const has = id => s.relics.includes(id);
  const roll = () => 1 + Math.floor(Math.random() * 6);

  function newGame() {
    s = { floor: 0, hp: 22, maxHp: 22, relics: [], dice: [], place: [], sel: null,
          rerolls: 0, enemy: null, turn: 0, over: false, msg: '' };
    startFloor();
  }

  function startFloor() {
    const e = ENEMIES[s.floor];
    s.enemy = { ...e, cur: e.hp };
    s.turn = 0;
    s.msg = `${e.face} ${e.name}があらわれた!`;
    newTurn();
  }

  function newTurn() {
    s.dice = [roll(), roll(), roll()];
    s.place = [-1, -1, -1]; // die index -> slot index
    s.sel = null;
    s.rerolls = 1 + (has('dice') ? 1 : 0);
    render();
  }

  function dieBonus(v) {
    let b = 0;
    if (has('six') && v === 6) b += 3;
    if (has('low') && v <= 2) b += 2;
    return b;
  }

  function slotDie(slot) { return s.place.indexOf(slot); }

  function slotValue(slot, di) {
    const v = s.dice[di] + dieBonus(s.dice[di]);
    if (slot === 0) {
      let a = v + (has('fang') ? 2 : 0);
      if (has('pair')) {
        const c = s.dice.filter(x => x === s.dice[di]).length;
        if (c >= 2) a += 5;
      }
      return a;
    }
    if (slot === 1) return v + (has('shield') ? 2 : 0);
    return Math.ceil(v / 2) * (has('apple') ? 2 : 1);
  }

  function intentVal() {
    const e = s.enemy;
    return e.pat[s.turn % e.pat.length];
  }

  function render() {
    const e = s.enemy;
    $('floorLabel').textContent = `${s.floor + 1}/${MAX_FLOOR}階`;
    $('hpLabel').textContent = `❤️ ${s.hp}/${s.maxHp}`;
    $('face').textContent = e.face;
    $('ehp').style.width = Math.max(0, e.cur / e.hp * 100) + '%';
    const v = intentVal();
    $('intent').textContent = `${e.name} HP ${e.cur}/${e.hp} ／ ` +
      (v === 0 ? '💤 力をためている…' : `🗡️ ${v}ダメージ予告`);
    $('msg').textContent = s.msg || ' ';

    const tray = $('tray');
    tray.innerHTML = '';
    s.dice.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'die' + (s.place[i] !== -1 ? ' empty' : '') + (s.sel === i ? ' sel' : '');
      b.textContent = d;
      b.onclick = () => { if (s.over) return; s.sel = (s.sel === i ? null : i); render(); };
      tray.appendChild(b);
    });

    const slots = $('slots');
    slots.innerHTML = '';
    SLOTS.forEach((sl, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot ' + sl.cls;
      const di = slotDie(k);
      b.innerHTML = `<b>${sl.name}</b>` +
        (di >= 0 ? `<span class="die">${s.dice[di]}</span><span class="pv">→ ${slotValue(k, di)}</span>`
                 : `<span class="pv" style="opacity:.4">-</span>`);
      b.onclick = () => onSlot(k);
      slots.appendChild(b);
    });

    const unplaced = s.place.filter(p => p === -1).length;
    $('rerollBtn').textContent = `🎲 ふりなおし(${s.rerolls})`;
    $('rerollBtn').disabled = s.over || s.rerolls <= 0 || unplaced === 0;
    $('goBtn').disabled = s.over || unplaced > 0;
    $('relics').textContent = s.relics.length
      ? 'お宝: ' + s.relics.map(id => RELICS.find(r => r.id === id).icon).join(' ')
      : 'お宝: なし';
  }

  function onSlot(k) {
    if (s.over) return;
    const cur = slotDie(k);
    if (s.sel === null) {
      if (cur >= 0) { s.place[cur] = -1; render(); }
      return;
    }
    if (cur >= 0) s.place[cur] = -1;
    s.place[s.sel] = k;
    s.sel = null;
    render();
  }

  $('rerollBtn').onclick = () => {
    if (s.over || s.rerolls <= 0) return;
    let any = false;
    s.dice = s.dice.map((d, i) => { if (s.place[i] === -1) { any = true; return roll(); } return d; });
    if (!any) return;
    s.rerolls--;
    s.sel = null;
    render();
  };

  $('goBtn').onclick = () => {
    if (s.over || s.place.some(p => p === -1)) return;
    const e = s.enemy;
    const atk = slotValue(0, slotDie(0));
    const grd = slotValue(1, slotDie(1));
    const heal = slotValue(2, slotDie(2));
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + heal);
    e.cur -= atk;
    let m = `⚔️${atk}ダメージ!` + (s.hp > before ? ` 💖+${s.hp - before}` : '');
    if (e.cur <= 0) {
      e.cur = 0;
      s.msg = m + ` ${e.face}をたおした!`;
      render();
      return win();
    }
    const v = intentVal();
    if (v === 0) {
      m += ' 敵は力をためている…';
    } else {
      const dmg = Math.max(0, v - grd);
      s.hp -= dmg;
      m += dmg === 0 ? ` 🛡️${grd}で完全ガード!` : ` 🗡️${v}-🛡️${grd}=${dmg}ダメージをうけた`;
    }
    s.msg = m;
    if (s.hp <= 0) { s.hp = 0; render(); return end(false); }
    s.turn++;
    newTurn();
  };

  function win() {
    if (s.floor + 1 >= MAX_FLOOR) return end(true);
    // reward
    const pool = RELICS.filter(r => r.id === 'heart' || !has(r.id));
    const picks = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    const box = $('picks');
    box.innerHTML = '';
    picks.forEach(r => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.innerHTML = `<b>${r.icon} ${r.name}</b><br>${r.desc}`;
      b.onclick = () => {
        if (r.id === 'heart') { s.maxHp += 6; s.hp = Math.min(s.maxHp, s.hp + 6); }
        else s.relics.push(r.id);
        s.hp = Math.min(s.maxHp, s.hp + 4);
        $('reward').classList.add('hidden');
        s.floor++;
        startFloor();
      };
      box.appendChild(b);
    });
    $('reward').classList.remove('hidden');
  }

  function end(clear) {
    s.over = true;
    $('resultTitle').textContent = clear ? '🏆 ダンジョンクリア!' : '💀 ちからつきた…';
    $('resultText').textContent = clear
      ? `ボスをたおした!のこりHP ${s.hp}。お宝 ${s.relics.length}こでクリア!`
      : `${s.floor + 1}階で力つきた… ${s.floor}階をとっぱ。`;
    $('result').classList.remove('hidden');
    render();
  }

  $('startBtn').onclick = () => { $('intro').classList.add('hidden'); newGame(); };
  $('retryBtn').onclick = () => { $('result').classList.add('hidden'); $('reward').classList.add('hidden'); newGame(); };

  // 初期表示(説明画面の裏)
  s = { floor: 0, hp: 22, maxHp: 22, relics: [], dice: [1, 1, 1], place: [-1, -1, -1], sel: null,
        rerolls: 1, enemy: { ...ENEMIES[0], cur: ENEMIES[0].hp }, turn: 0, over: true, msg: '' };
  render();
})();
