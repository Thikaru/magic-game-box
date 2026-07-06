'use strict';

/* ===== シナリオ =====
 * scene: { bg, sprite, name, text, next } … 通常シーン
 *         { choices: [{label, next}, …] }  … 選択肢
 *         { end: {type, title, text} }     … エンディング
 */
const SCENES = {
  /* --- 導入: ここで張った伏線がすべての選択の答えになる --- */
  s0:  { bg:'night', text:'夜10時、テスト勉強の帰り道。\nポケットの中で、カチリとおはじきが鳴った。\n——去年死んじゃった、おばあちゃんの形見だ。', next:'s1' },
  s1:  { bg:'night', text:'小さいころ、おばあちゃんはよく駄菓子屋に連れて行ってくれた。\n型抜きのコツも、ラムネのビー玉の落とし方も、ぜんぶあの店で教わった。', next:'s2' },
  s2:  { bg:'night', text:'おばあちゃんの家には、左耳の欠けた黒い猫がいた。\nあの子は去年、おばあちゃんを追いかけるみたいに、ふっといなくなった。', next:'s3' },
  s3:  { bg:'night', text:'いつもの路地の奥に、見たことのない明かりがともっている。\n古びた木の看板には『駄菓子 くろねこ堂』。', next:'s4' },
  s4:  { bg:'night', sprite:'🐈‍⬛', text:'店先で黒猫がこちらを見ていた。\n「いらっしゃい。今夜は特別営業だよ」\n——その左耳は、少しだけ欠けている。', next:'s5' },

  /* --- 店内: 張り紙とクロの警告が、後の選択のヒント --- */
  s5:  { bg:'shop', text:'店の中は駄菓子でいっぱいだった。\nレジ横の柱に、色あせた張り紙が一枚。\n『お代は さわるまえに聞くこと。さわったら 買ったことになります』', next:'s6' },
  s6:  { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「あたしはクロ。この店の主さ。\nうちのお代はお金じゃない。『きもち』か『思い出』で払ってもらうよ」', next:'s7' },
  s7:  { bg:'shop', text:'棚のいちばん奥で、金色の飴がまばゆく光っている。\n見ているだけで、手が勝手に伸びそうになる——。', next:'c1' },
  c1:  { bg:'shop', text:'どうする?', choices:[
          { label:'先にお代を聞く', next:'s8' },
          { label:'手に取ってみる', next:'b1a' },
        ] },

  /* BAD1: 張り紙を読み飛ばした代償 */
  b1a: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'指先が飴に触れた、その瞬間。\n店の空気がひやりと変わった。\n「——はい、お買い上げ」', next:'b1b' },
  b1b: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「その飴のお代は『思い出ぜんぶ』。……だけどね」\nクロは大きなため息をついた。\n「今夜は『今夜の記憶』だけで、まけといてやる。ほら、お帰り」', next:'b1c' },
  b1c: { bg:'night', text:'気がつくと、家の前に立っていた。\n何かを買いそこねたような、誰かにかばわれたような——\n胸の奥が、すこしだけ痛い。', next:'end_b1' },
  end_b1: { end:{ type:'bad', title:'値札のない買いもの', text:'柱の張り紙には、こう書いてあった。『さわったら 買ったことになります』' } },

  /* --- 金色の飴の誘惑 --- */
  s8:  { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「……ほう。張り紙をちゃんと読む子は、ひさしぶりだ」\nクロの金色の目が、うれしそうに細くなった。', next:'s9' },
  s9:  { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「その金色の飴はね、どんな願いも叶う。\n——死んだ人に、もう一度会うことだってできる」', next:'s10' },
  s10: { bg:'shop', text:'心臓が、大きく跳ねた。\nおばあちゃんに——会える?', next:'s11' },
  s11: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「お代は『その人との思い出ぜんぶ』。よくお考え。\n思い出ってのはね、なくしてはじめて値段がわかるもんだよ」', next:'c2' },
  c2:  { bg:'shop', text:'どうする?', choices:[
          { label:'飴を買う。おばあちゃんに会いたい', next:'b2a' },
          { label:'買わない。思い出は渡せない', next:'s12' },
        ] },

  /* BAD2: 会えても、思い出がなければ分からない */
  b2a: { bg:'shop', text:'飴を口に入れた瞬間、店の奥から、なつかしい下駄の音がした。\n「——おや。また来たのかい」', next:'b2b' },
  b2b: { bg:'shop', text:'振り向いた先に、小さなおばあさんが立っていた。\n……誰、だろう。\n会いたかったはずなのに、名前も、思い出も、なにひとつ出てこない。', next:'b2c' },
  b2c: { bg:'shop', text:'知らないおばあさんは、こまったように笑っている。\nどうしてだろう。涙が、止まらない。', next:'end_b2' },
  end_b2: { end:{ type:'bad', title:'はじめましての人', text:'会うことの意味は、思い出があってこそ——クロはそう教えてくれていたのに。' } },

  /* --- 最後の問い: 冒頭の伏線に気づけたか --- */
  s12: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「……いい答えだ」\nふいに、クロの声がやわらかくなった。\n「ばあちゃんも、きっとそう言うよ」', next:'s13' },
  s13: { bg:'shop', text:'——え?　今、なんて言った?\nクロは知らんぷりで、ひげをぴんと立てている。', next:'s14' },
  s14: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「さて、閉店の時間だ。今夜のお代は——いらない。\nそのかわり、ひとつだけ聞かせな」', next:'s15' },
  s15: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「あんたとあたしは、今夜がはじめましてかい?」', next:'c3' },
  c3:  { bg:'shop', text:'この黒猫は、左耳が欠けていて——', choices:[
          { label:'「……クロ? おばあちゃんちの、クロなの?」', next:'s16' },
          { label:'「うん、はじめまして……だと思う」', next:'b3a' },
        ] },

  /* BAD3: 目の前のヒントに気づけなかった */
  b3a: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'クロはゆっくりと、まばたきをひとつした。\n「……そうかい。なら、今夜のことは、ぜんぶ夢にしておこうね」', next:'b3b' },
  b3b: { bg:'night', text:'朝、ふとんの中で目が覚めた。\nなにか、とても大事なことを忘れている気がする。\nポケットのおはじきが、いつもより冷たかった。', next:'end_b3' },
  end_b3: { end:{ type:'bad', title:'わすれもの', text:'左耳の欠けた黒猫。あの子のこと、思い出せたはずだったのに。' } },

  /* HAPPY: すべての伏線が回収される */
  s16: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'欠けた左耳が、ぴくりと動いた。\n「——よく、覚えてたね」', next:'s17' },
  s17: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「あたしはね、ばあさんに拾われた猫だよ。\nあの人はあたしに、雨の日の軒下と、あったかい煮干しと、\n『クロ』って名前をくれた」', next:'s18' },
  s18: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'「これは恩返しさ。ばあさんが最後まで心配してたのは——\n夜道をしょんぼり歩いてる、あんたのことだったからね」', next:'s19' },
  s19: { bg:'shop', sprite:'🐈‍⬛', name:'クロ', text:'クロはラムネを一本、そっと押し出した。\n「持っておいき。お代なら、とっくに済んでる。\n……ばあさんの、ツケでね」', next:'s20' },
  s20: { bg:'morning', text:'翌朝。あの路地は、ただの路地に戻っていた。\nでも、ポケットのおはじきは、ほんのりあたたかい。\n——おばあちゃん。型抜きのコツ、まだちゃんと覚えてるよ。', next:'end_h1' },
  end_h1: { end:{ type:'happy', title:'ないしょの恩返し', text:'つかれた夜にはまた、あの明かりがともる。左耳の欠けた店主が、今夜も待っている。' } },
};
const TOTAL_ENDINGS = 4;

/* ===== DOM ===== */
const stage    = document.getElementById('stage');
const sceneBg  = document.getElementById('sceneBg');
const stars    = document.getElementById('stars');
const lantern  = document.getElementById('lantern');
const sprite   = document.getElementById('sprite');
const speaker  = document.getElementById('speaker');
const textEl   = document.getElementById('text');
const nextMark = document.getElementById('nextMark');
const choicesEl = document.getElementById('choices');
const intro    = document.getElementById('intro');
const result   = document.getElementById('result');
const endType  = document.getElementById('endType');
const endTitle = document.getElementById('endTitle');
const endText  = document.getElementById('endText');
const endCount = document.getElementById('endCount');

/* ===== 状態 ===== */
let currentId = 's0';
let typing = null;          // タイプ中のinterval(null = 表示完了)
let typingText = '';        // タイプ中の全文
let typingDone = null;      // タイプ完了時のコールバック
let started = false;
const foundEndings = new Set();

/* ===== 表示 ===== */
function setBg(bg) {
  sceneBg.className = 'scene-bg bg-' + bg;
  stars.style.opacity   = bg === 'night' ? '1' : '0';
  lantern.style.opacity = bg === 'night' ? '1' : '0';
}

function typeText(str, done) {
  clearInterval(typing);
  nextMark.classList.add('hidden');
  textEl.textContent = '';
  typingText = str;
  typingDone = done;
  let i = 0;
  typing = setInterval(() => {
    textEl.textContent = str.slice(0, ++i);
    if (i >= str.length) finishTyping();
  }, 34);
}

function finishTyping() {
  clearInterval(typing);
  typing = null;
  if (typingDone) typingDone();
}

function skipTyping() {
  if (!typing) return;
  textEl.textContent = typingText;
  finishTyping();
}

function showScene(id) {
  currentId = id;
  const sc = SCENES[id];
  if (sc.end) { showEnding(sc.end); return; }

  setBg(sc.bg);
  sprite.textContent = sc.sprite || '';
  if (sc.name) {
    speaker.textContent = sc.name;
    speaker.classList.remove('hidden');
  } else {
    speaker.classList.add('hidden');
  }
  choicesEl.classList.add('hidden');

  typeText(sc.text, () => {
    if (sc.choices) showChoices(sc.choices);
    else nextMark.classList.remove('hidden');
  });
}

function showChoices(choices) {
  choicesEl.innerHTML = '';
  choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.textContent = (i + 1) + '. ' + c.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showScene(c.next);
    });
    choicesEl.appendChild(btn);
  });
  choicesEl.classList.remove('hidden');
}

function showEnding(end) {
  foundEndings.add(currentId);
  endType.textContent = end.type === 'happy' ? 'HAPPY END' : 'BAD END';
  endType.className = 'end-type ' + end.type;
  endTitle.textContent = '「' + end.title + '」';
  endText.textContent = end.text;
  endCount.textContent = 'みつけたエンディング ' + foundEndings.size + ' / ' + TOTAL_ENDINGS;
  result.classList.remove('hidden');
}

/* ===== 進行 ===== */
function advance() {
  if (!started || !result.classList.contains('hidden')) return;
  if (typing) { skipTyping(); return; }
  const sc = SCENES[currentId];
  if (sc.choices || sc.end) return; // 選択待ち・終了中は無視
  showScene(sc.next);
}

function startGame() {
  started = true;
  intro.classList.add('hidden');
  result.classList.add('hidden');
  showScene('s0');
}

/* ===== 入力 ===== */
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);

stage.addEventListener('click', advance);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (!started) { startGame(); e.preventDefault(); return; }
    if (!result.classList.contains('hidden')) { startGame(); e.preventDefault(); return; }
    advance();
    e.preventDefault();
  }
  // 数字キーで選択肢を選ぶ
  if (started && !choicesEl.classList.contains('hidden')) {
    const n = parseInt(e.key, 10);
    const btns = choicesEl.querySelectorAll('button');
    if (n >= 1 && n <= btns.length) btns[n - 1].click();
  }
});
