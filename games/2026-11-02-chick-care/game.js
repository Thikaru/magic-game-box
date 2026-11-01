(function(){
'use strict';
var $=function(i){return document.getElementById(i);};
var field=$('field'),chick=$('chick'),msg=$('msg');
var ICON=['🍙','🎾','💤','💩'];
var NAME=['ごはん','あそび','ねんね'];
var DUR=60, NEED_GROW=48;
var best=0;try{best=+localStorage.getItem('chickBest')||0;}catch(e){}
if(best)$('best').textContent='BEST '+best+'%';
var st=null,raf=0;

function stageOf(g){return g>=100?'🐔':g>=66?'🐥':g>=30?'🐣':'🥚';}
function say(t){msg.textContent=t;}

function start(){
  [].slice.call(field.querySelectorAll('.bub')).forEach(function(b){b.remove();});
  st={g:[80,80,80],bubs:[],t:0,last:performance.now(),spawn:0.6,grow:0,over:false,care:0,miss:0,combo:0};
  chick.textContent='🥚';chick.style.fontSize='5rem';
  say('');
  $('intro').classList.add('hidden');$('result').classList.add('hidden');
  cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
}

function spawn(){
  if(st.bubs.length>=5)return;
  var type,full=false,r=Math.random();
  if(r<0.18)type=3;
  else{
    var low=0;for(var i=1;i<3;i++)if(st.g[i]<st.g[low])low=i;
    type=r<0.6?low:Math.floor(Math.random()*3);
    if(st.g[type]>=80)full=true;
  }
  var el=document.createElement('button');
  el.type='button';el.className='bub'+(full?' full':'');
  el.innerHTML=ICON[type]+'<span class="t"><i></i></span>';
  var fw=field.clientWidth-8,fh=field.clientHeight-8;
  var x=0,y=0,ok=false;
  for(var k=0;k<12&&!ok;k++){
    x=Math.random()*(fw-60);y=Math.random()*(fh-60);
    ok=!(x>fw/2-70&&x<fw/2+30&&y>fh/2-90&&y<fh/2+50)&&st.bubs.every(function(b){return Math.abs(b.x-x)>60||Math.abs(b.y-y)>60;});
  }
  el.style.left=x+'px';el.style.top=y+'px';
  var b={type:type,full:full,x:x,y:y,age:0,life:type===3?3.2:2.4,el:el};
  el.addEventListener('pointerdown',function(e){e.preventDefault();hit(b);});
  field.appendChild(el);st.bubs.push(b);
}

function remove(b,pop){
  var i=st.bubs.indexOf(b);if(i>=0)st.bubs.splice(i,1);
  if(pop){b.el.classList.add('pop');setTimeout(function(){b.el.remove();},300);}else b.el.remove();
}

function hit(b){
  if(!st||st.over||st.bubs.indexOf(b)<0)return;
  remove(b,true);
  if(b.type===3){st.combo++;say('💩 ピカピカ!');return;}
  if(b.full){
    st.g[b.type]=Math.max(0,st.g[b.type]-18);st.combo=0;say('やりすぎ!'+NAME[b.type]+'がへった…');
  }else{
    st.g[b.type]=Math.min(100,st.g[b.type]+26);st.care++;st.combo++;say(st.combo>=5?st.combo+'れんぞくお世話!':'ぴよっ♪');
  }
  chick.classList.remove('bounce');void chick.offsetWidth;chick.classList.add('bounce');
}

function press(type){
  if(!st||st.over)return;
  var c=null;
  st.bubs.forEach(function(b){if(b.type===type&&(!c||b.age>c.age))c=b;});
  if(c)hit(c);
}

function loop(now){
  if(!st||st.over)return;
  var dt=Math.min(0.1,(now-st.last)/1000);st.last=now;
  st.t+=dt;
  var f=1+st.t/60*0.6;
  st.g[0]-=dt*5.5*f;st.g[1]-=dt*4.5*f;st.g[2]-=dt*3.5*f;
  st.spawn-=dt;
  if(st.spawn<=0){spawn();st.spawn=Math.max(0.55,1.15-st.t/60*0.55)*(0.8+Math.random()*0.5);}
  st.bubs.slice().forEach(function(b){
    b.age+=dt;
    b.el.querySelector('.t i').style.width=Math.max(0,100-b.age/b.life*100)+'%';
    if(b.age>=b.life){
      remove(b,false);
      if(b.type===3){for(var i=0;i<3;i++)st.g[i]=Math.max(0,st.g[i]-10);st.combo=0;say('💩 うんちでみんなげんなり…');}
    }
  });
  var ok=true;
  for(var i=0;i<3;i++){
    if(st.g[i]<=0){st.g[i]=0;end(false,i);return;}
    if(st.g[i]<35)ok=false;
    var bar=$('b'+i);bar.style.width=st.g[i]+'%';bar.className=st.g[i]<30?'low':'';
  }
  if(ok)st.grow+=dt*(1+Math.min(st.combo,10)*0.03);
  var pct=Math.min(100,Math.round(st.grow/NEED_GROW*100));
  chick.textContent=stageOf(pct);
  chick.style.fontSize=(4.2+pct/100*2)+'rem';
  $('grow').textContent='せいちょう '+pct+'%';
  $('time').textContent='のこり '+Math.max(0,Math.ceil(DUR-st.t));
  if(st.t>=DUR){end(true);return;}
  raf=requestAnimationFrame(loop);
}

function end(timeup,idx){
  st.over=true;cancelAnimationFrame(raf);
  var pct=Math.min(100,Math.round(st.grow/NEED_GROW*100));
  var isBest=pct>best;
  if(isBest){best=pct;try{localStorage.setItem('chickBest',best);}catch(e){}}
  $('best').textContent='BEST '+best+'%';
  var f=stageOf(pct),title,text;
  if(!timeup){title='ぐったり…😢';text=NAME[idx]+'のゲージが0に!<br>'+f+' せいちょう '+pct+'%';}
  else if(pct>=100){title='🐔 りっぱなニワトリに!';text='パーフェクトなお世話!<br>せいちょう 100%';}
  else{title=f+' ここまで育ったよ';text='せいちょう '+pct+'%<br>100%でニワトリに進化!';}
  text+='<br>お世話した回数: '+st.care+'回'+(isBest?'<br>🎉 ベスト更新!':'');
  $('rTitle').textContent=title;$('rText').innerHTML=text;
  $('result').classList.remove('hidden');
}

$('startBtn').addEventListener('click',start);
$('retryBtn').addEventListener('click',start);
document.addEventListener('keydown',function(e){
  var m={'1':0,'2':1,'3':2,'4':3,' ':3};
  if(e.key in m){e.preventDefault();press(m[e.key]);}
});
})();
