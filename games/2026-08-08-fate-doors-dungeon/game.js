(function () {
  'use strict';

  var DOOR_TYPES = {
    sword: { emoji: '⚔️', name: '剣の扉', weights: { battle: 65, trap: 20, treasure: 15 } },
    treasure: { emoji: '💰', name: '宝の扉', weights: { treasure: 65, blessing: 15, trap: 20 } },
    mystery: { emoji: '❓', name: '謎の扉', weights: { battle: 25, treasure: 25, trap: 25, blessing: 25 } }
  };
  var DOOR_ORDER = ['sword', 'treasure', 'mystery'];

  var state = null;
  var busy = false;

  var floorLabel = document.getElementById('floorLabel');
  var atkLabel = document.getElementById('atkLabel');
  var goldLabel = document.getElementById('goldLabel');
  var hpText = document.getElementById('hpText');
  var hpFill = document.getElementById('hpFill');
  var logBox = document.getElementById('logBox');
  var doorsArea = document.getElementById('doorsArea');
  var introOverlay = document.getElementById('introOverlay');
  var resultOverlay = document.getElementById('resultOverlay');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');
  var scoreBig = document.getElementById('scoreBig');
  var startBtn = document.getElementById('startBtn');
  var retryBtn = document.getElementById('retryBtn');

  function isBossFloor(floor) { return floor % 5 === 0; }

  function newGame() {
    state = { hp: 100, maxHp: 100, atk: 12, gold: 0, floor: 1 };
    busy = false;
    resultOverlay.classList.add('hidden');
    setLog('扉を選んで進もう。');
    render();
    renderDoors();
  }

  function render() {
    floorLabel.textContent = (isBossFloor(state.floor) ? '地下' + state.floor + '階(ボス)' : '地下' + state.floor + '階');
    atkLabel.textContent = '⚔ATK ' + state.atk;
    goldLabel.textContent = '💰' + state.gold;
    hpText.textContent = Math.max(0, state.hp) + '/' + state.maxHp;
    var pct = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100));
    hpFill.style.width = pct + '%';
  }

  function setLog(html) { logBox.innerHTML = html; }

  function weightedPick(weights) {
    var total = 0;
    var keys = Object.keys(weights);
    for (var i = 0; i < keys.length; i++) total += weights[keys[i]];
    var r = Math.random() * total;
    var acc = 0;
    for (var j = 0; j < keys.length; j++) {
      acc += weights[keys[j]];
      if (r < acc) return keys[j];
    }
    return keys[keys.length - 1];
  }

  function renderDoors() {
    doorsArea.innerHTML = '';
    if (isBossFloor(state.floor)) {
      var bossBtn = document.createElement('button');
      bossBtn.type = 'button';
      bossBtn.className = 'bossBtn';
      bossBtn.innerHTML = '<div class="emoji">👹</div><div class="name">ボスの扉 - たたかう</div><div class="key">キー: 1</div>';
      bossBtn.addEventListener('click', function () { chooseBoss(); });
      doorsArea.appendChild(bossBtn);
    } else {
      var row = document.createElement('div');
      row.className = 'doorsRow';
      DOOR_ORDER.forEach(function (key, idx) {
        var d = DOOR_TYPES[key];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'doorBtn';
        btn.innerHTML = '<div class="emoji">' + d.emoji + '</div><div class="name">' + d.name + '</div><div class="key">キー: ' + (idx + 1) + '</div>';
        btn.addEventListener('click', function () { chooseDoor(key); });
        row.appendChild(btn);
      });
      doorsArea.appendChild(row);
    }
  }

  function showContinue(afterText) {
    doorsArea.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'continueRow';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'continueBtn';
    btn.textContent = '次の階へ ▶';
    btn.addEventListener('click', advanceFloor);
    row.appendChild(btn);
    doorsArea.appendChild(row);
    busy = false;
  }

  function advanceFloor() {
    if (state.hp <= 0) return;
    state.floor += 1;
    render();
    renderDoors();
    setLog(isBossFloor(state.floor) ? 'ボスの気配がする…慎重にいこう。' : '扉を選んで進もう。');
  }

  function chooseDoor(key) {
    if (busy || !state || state.hp <= 0) return;
    busy = true;
    doorsArea.innerHTML = '<div class="resolving">扉を開けている…</div>';
    var outcome = weightedPick(DOOR_TYPES[key].weights);
    setTimeout(function () { resolveOutcome(outcome, false); }, 550);
  }

  function chooseBoss() {
    if (busy || !state || state.hp <= 0) return;
    busy = true;
    doorsArea.innerHTML = '<div class="resolving">ボスが立ちはだかる…⚔️</div>';
    setTimeout(function () { resolveOutcome('battle', true); }, 550);
  }

  function simulateBattle(monsterHp, monsterAtk) {
    var mHp = monsterHp;
    var rounds = 0;
    var win = null;
    while (rounds < 50) {
      rounds++;
      var dmgToMonster = Math.max(1, Math.round(state.atk * (0.85 + Math.random() * 0.3)));
      mHp -= dmgToMonster;
      if (mHp <= 0) { win = true; break; }
      var dmgToPlayer = Math.max(1, Math.round(monsterAtk * (0.85 + Math.random() * 0.3)));
      state.hp -= dmgToPlayer;
      if (state.hp <= 0) { state.hp = 0; win = false; break; }
    }
    if (win === null) win = state.hp > 0;
    return { win: win, rounds: rounds };
  }

  function maybeDropEquipment(chance, isBoss) {
    if (Math.random() * 100 >= chance) return null;
    if (Math.random() < 0.5) {
      var atkUp = isBoss ? (5 + Math.floor(Math.random() * 4)) : (2 + Math.floor(Math.random() * 3));
      state.atk += atkUp;
      return '⚔️ ATKが' + atkUp + '上がった!';
    } else {
      var hpUp = isBoss ? (18 + Math.floor(Math.random() * 10)) : (8 + Math.floor(Math.random() * 8));
      state.maxHp += hpUp;
      state.hp += hpUp;
      return '❤️ さいだいHPが' + hpUp + '上がった!';
    }
  }

  function resolveOutcome(type, isBoss) {
    var floor = state.floor;
    var msg = '';

    if (type === 'battle') {
      var monsterHp = isBoss ? (60 + floor * 12) : (18 + floor * 8);
      var monsterAtk = isBoss ? (8 + floor * 3) : (4 + Math.floor(floor * 1.6));
      var result = simulateBattle(monsterHp, monsterAtk);
      if (result.win) {
        var goldGain = isBoss ? (40 + floor * 6 + Math.floor(Math.random() * 20)) : (8 + floor * 3 + Math.floor(Math.random() * 8));
        state.gold += goldGain;
        var drop = maybeDropEquipment(isBoss ? 100 : 30, isBoss);
        msg = (isBoss ? '👹 ボスをたおした! ' : '⚔️ モンスターをたおした! ') + '<b>+💰' + goldGain + '</b>';
        if (drop) msg += '<br>' + drop;
      } else {
        endGame(isBoss ? 'ボスにやぶれてしまった…' : 'モンスターにやぶれてしまった…');
        return;
      }
    } else if (type === 'treasure') {
      var g = 15 + floor * 5 + Math.floor(Math.random() * 12);
      state.gold += g;
      var drop2 = maybeDropEquipment(25, false);
      msg = '💰 たからばこを見つけた! <b>+💰' + g + '</b>';
      if (drop2) msg += '<br>' + drop2;
    } else if (type === 'trap') {
      var dmg = 8 + floor * 3 + Math.floor(Math.random() * 6);
      state.hp -= dmg;
      msg = '💥 わなにかかった… <b>-❤️' + dmg + '</b>';
      if (state.hp <= 0) {
        state.hp = 0;
        render();
        endGame('わなに命を奪われてしまった…');
        return;
      }
    } else if (type === 'blessing') {
      var healed = state.maxHp - state.hp;
      state.hp = state.maxHp;
      var bonusGold = 5 + Math.floor(Math.random() * 10);
      state.gold += bonusGold;
      msg = '✨ めぐみを受けた! HPぜんかい' + (healed > 0 ? '(+❤️' + healed + ')' : '') + ' <b>+💰' + bonusGold + '</b>';
    }

    render();
    setLog(msg);
    showContinue();
  }

  function endGame(reason) {
    render();
    resultTitle.textContent = 'ゲームオーバー';
    resultText.textContent = reason + ' 到達: 地下' + state.floor + '階';
    var score = state.floor * 10 + state.gold;
    scoreBig.textContent = 'スコア ' + score;
    resultOverlay.classList.remove('hidden');
    busy = false;
  }

  startBtn.addEventListener('click', function () {
    introOverlay.classList.add('hidden');
    newGame();
  });
  retryBtn.addEventListener('click', function () {
    resultOverlay.classList.add('hidden');
    newGame();
  });

  document.addEventListener('keydown', function (e) {
    if (!introOverlay.classList.contains('hidden')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startBtn.click(); }
      return;
    }
    if (!resultOverlay.classList.contains('hidden')) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); retryBtn.click(); }
      return;
    }
    if (!state || busy) return;
    if (e.key === 'Enter' || e.key === ' ') {
      var contBtn = doorsArea.querySelector('.continueBtn');
      if (contBtn) { e.preventDefault(); contBtn.click(); }
      return;
    }
    if (isBossFloor(state.floor)) {
      if (e.key === '1') { var bb = doorsArea.querySelector('.bossBtn'); if (bb) bb.click(); }
    } else {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        var idx = parseInt(e.key, 10) - 1;
        var btns = doorsArea.querySelectorAll('.doorBtn');
        if (btns[idx]) btns[idx].click();
      }
    }
  });
})();
