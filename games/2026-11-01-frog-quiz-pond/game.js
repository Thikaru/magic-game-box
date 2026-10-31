(function(){
'use strict';
var GOAL=15;
var $=function(id){return document.getElementById(id);};
var ANTONYMS=[['おおきい','ちいさい'],['あつい','さむい'],['たかい','ひくい'],['はやい','おそい'],['ながい','みじかい'],['あかるい','くらい'],['おもい','かるい'],['ふとい','ほそい'],['ひろい','せまい'],['つよい','よわい'],['あさい','ふかい'],['うれしい','かなしい']];
var CRIES=[['いぬ','わん'],['ねこ','にゃー'],['うし','もー'],['ぶた','ぶひぶひ'],['ひつじ','めぇ'],['かえる','けろけろ'],['からす','かー'],['にわとり','こけこっこー']];
var CATS=[
 ['くだもの',['りんご','みかん','ぶどう','もも','いちご','すいか']],
 ['のりもの',['でんしゃ','バス','ひこうき','ふね','じてんしゃ','タクシー']],
 ['どうぶつ',['ライオン','ぞう','うさぎ','きりん','さる','パンダ']],
 ['やさい',['にんじん','だいこん','ほうれんそう','トマト','なす','きゅうり']],
 ['いろ',['あか','あお','みどり','きいろ','むらさき','ももいろ']]
];
var st={}, timer=null, last=0, best=null;
function ri(n){return Math.floor(Math.random()*n);}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=ri(i+1),t=a[i];a[i]=a[j];a[j]=t;}return a;}
function pick(a,n){return shuffle(a.slice()).slice(0,n);}

function mk(tag,text,right,wrongs){
  var opts=[right].concat(wrongs);
  var idx=shuffle([0,1,2]);
  return {tag:tag,text:text,opts:idx.map(function(i){return opts[i];}),ans:idx.indexOf(0)};
}
function calcWrongs(v){
  var s={};s[v]=1;var w=[];
  while(w.length<2){var d=(ri(2)?1:-1)*(1+ri(4));var x=v+d;if(x>=0&&!s[x]){s[x]=1;w.push(x);}}
  return w;
}
function qCalc(n){
  var a=2+ri(8+n),b=2+ri(8+n),sub=ri(3)===0,v,txt;
  if(sub){if(a<b){var t=a;a=b;b=t;}v=a-b;txt=a+' − '+b+' = ?';}
  else if(n>6&&ri(2)){a=2+ri(8);b=2+ri(8);v=a*b;txt=a+' × '+b+' = ?';}
  else{v=a+b;txt=a+' + '+b+' = ?';}
  return mk('けいさん',txt,v,calcWrongs(v));
}
function qWrongEq(n){
  var eqs=[],i;
  for(i=0;i<3;i++){var a=2+ri(8+n),b=2+ri(8+n);eqs.push({s:a+' + '+b+' = ',v:a+b});}
  var k=ri(3),r=[];
  for(i=0;i<3;i++){var v=eqs[i].v;if(i===k)v+=(ri(2)?1:-1)*(1+ri(3));r.push(eqs[i].s+v);}
  return {tag:'ひっかけ!',text:'まちがっている式は?',opts:r,ans:k};
}
function qAnto(){
  var p=ANTONYMS[ri(ANTONYMS.length)];
  var w=pick(ANTONYMS.filter(function(x){return x!==p;}),2).map(function(x){return x[1];});
  return mk('はんたいことば','「'+p[0]+'」のはんたいは?',p[1],w);
}
function qCry(){
  var p=CRIES[ri(CRIES.length)];
  var w=pick(CRIES.filter(function(x){return x!==p;}),2).map(function(x){return x[1];});
  return mk('なきごえ','「'+p[0]+'」のなきごえは?',p[1],w);
}
function qOdd(){
  var c=pick(CATS,2),same=pick(c[0][1],2),odd=pick(c[1][1],1)[0];
  var o=mk('ひっかけ!','なかまはずれは?',odd,same);
  return o;
}
function qBig(n){
  var v=pick([3,5,8,12,15,20,27,34,46,58,71,90],3);
  var big=ri(2);
  var m=Math.max.apply(null,v),mn=Math.min.apply(null,v);
  var r=v.slice();
  return {tag:'ひっかけ!',text:big?'いちばん大きい数は?':'いちばん小さい数は?',opts:r,ans:r.indexOf(big?m:mn)};
}
function genQuestion(n){
  var q;
  do{
    var t=ri(7);
    q= t<2?qCalc(n): t===2?qWrongEq(n): t===3?qAnto(): t===4?qCry(): t===5?qOdd(): qBig(n);
  }while(st.lastText===q.text);
  st.lastText=q.text;
  return q;
}

function show(){
  var q=st.q;
  $('qtag').textContent=q.tag;
  $('qtext').textContent=q.text;
  var ps=document.querySelectorAll('.pad');
  for(var i=0;i<3;i++){ps[i].textContent='🪷 '+q.opts[i];ps[i].className='pad';}
  $('prog').textContent=st.done+'/'+GOAL;
  $('combo').textContent=st.combo>=2?'🔥 '+st.combo+'れんぞく':'';
}
function next(){st.q=genQuestion(st.done);st.locked=false;show();}
function setWater(){
  $('water').style.height=Math.min(100,st.water)+'%';
}
function tick(now){
  if(!st.running)return;
  var dt=Math.min(0.1,(now-last)/1000);last=now;
  var speed=2.4+st.done*0.45; // %/sec
  st.water+=speed*dt;
  st.time+=dt;
  setWater();
  if(st.water>=88){end(false);return;}
  timer=requestAnimationFrame(tick);
}
function answer(i){
  if(!st.running||st.locked)return;
  st.locked=true;
  var ps=document.querySelectorAll('.pad');
  var fr=$('frog');
  fr.style.left=(16.6+i*33.3)+'%';
  if(i===st.q.ans){
    ps[i].classList.add('ok');
    st.done++;st.combo++;
    st.water=Math.max(0,st.water-(14+Math.min(st.combo,5)*2));
    fr.classList.remove('ng');
    setWater();
    if(st.done>=GOAL){setTimeout(function(){end(true);},250);return;}
  }else{
    ps[i].classList.add('ng');ps[st.q.ans].classList.add('ok');
    st.combo=0;st.water+=16;fr.classList.add('ng');
    setWater();
    if(st.water>=88){setTimeout(function(){end(false);},350);return;}
  }
  setTimeout(function(){if(st.running)next();},i===st.q.ans?220:600);
}
function start(){
  st={running:true,locked:false,done:0,combo:0,water:8,time:0,lastText:''};
  $('intro').classList.add('hidden');$('result').classList.add('hidden');
  $('frog').style.left='50%';$('frog').classList.remove('ng');
  setWater();next();
  last=performance.now();
  cancelAnimationFrame(timer);timer=requestAnimationFrame(tick);
}
function end(clear){
  st.running=false;cancelAnimationFrame(timer);
  var t=st.time.toFixed(1);
  if(clear&&(best===null||st.time<best)){best=st.time;try{localStorage.setItem('frogQuizBest',String(best));}catch(e){}}
  $('best').textContent='BEST '+(best===null?'-':best.toFixed(1)+'秒');
  $('rTitle').textContent=clear?'🎉 池をわたりきった!':'🌊 のみこまれた…';
  $('rText').innerHTML=clear?('15もん正解!タイム <b>'+t+'秒</b><br>もっと早くわたれるかな?'):('正解 <b>'+st.done+'</b> / '+GOAL+' もん<br>あと '+(GOAL-st.done)+'もんだった!');
  $('result').classList.remove('hidden');
}
try{var b=parseFloat(localStorage.getItem('frogQuizBest'));if(b>0){best=b;$('best').textContent='BEST '+b.toFixed(1)+'秒';}}catch(e){}
document.querySelectorAll('.pad').forEach(function(p){
  p.addEventListener('pointerdown',function(e){e.preventDefault();answer(+p.getAttribute('data-i'));});
});
document.addEventListener('keydown',function(e){
  var m={ArrowLeft:0,ArrowDown:1,ArrowRight:2,'1':0,'2':1,'3':2,a:0,s:1,d:2};
  if(e.key in m){e.preventDefault();answer(m[e.key]);}
});
$('startBtn').addEventListener('click',start);
$('retryBtn').addEventListener('click',start);
})();
