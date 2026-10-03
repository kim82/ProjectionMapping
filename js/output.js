import {Renderer} from './webgl.js';
import {VideoSource} from './video.js';
import {DEFAULT} from './mapping.js';
import {connect} from './net.js';
const $=id=>document.getElementById(id);
let renderer;
try{renderer=new Renderer($('gl'));}catch(e){$('start').textContent=e.message;throw e;}
let map=DEFAULT,showTest=false,testReady=false,started=false,userMuted=false,vol=1;
let state='idle',mix=0,fadeTime=.6,last=performance.now(); // idle | fadein | playing | fadeout
const video=new VideoSource(),trig=new VideoSource();trig.el.loop=false;
function buildTest(){ // test pattern is drawn once to a 2D canvas, then mapped through WebGL
  const c=document.createElement('canvas');c.width=1280;c.height=720;const g=c.getContext('2d');
  g.fillStyle='#111';g.fillRect(0,0,1280,720);g.strokeStyle='#888';g.lineWidth=2;
  for(let x=0;x<=1280;x+=80){g.beginPath();g.moveTo(x,0);g.lineTo(x,720);g.stroke();}
  for(let y=0;y<=720;y+=80){g.beginPath();g.moveTo(0,y);g.lineTo(1280,y);g.stroke();}
  g.strokeStyle='#ff9f1c';g.lineWidth=4;g.beginPath();g.moveTo(0,0);g.lineTo(1280,720);g.moveTo(1280,0);g.lineTo(0,720);
  g.moveTo(640,0);g.lineTo(640,720);g.moveTo(0,360);g.lineTo(1280,360);g.stroke();
  g.beginPath();g.arc(640,360,200,0,7);g.stroke();g.strokeStyle='#fff';g.lineWidth=8;g.strokeRect(4,4,1272,712);
  g.fillStyle='#fff';g.font='bold 48px sans-serif';g.textBaseline='top';
  g.textAlign='left';g.fillText('TL',20,20);g.textBaseline='bottom';g.fillText('BL',20,700);
  g.textAlign='right';g.textBaseline='top';g.fillText('TR',1260,20);g.textBaseline='bottom';g.fillText('BR',1260,700);
  renderer.upload('test',c);testReady=true;
}
buildTest();
renderer.onLost=()=>{testReady=false;buildTest();video.dirty=true;};
const applyMute=()=>{video.el.muted=trig.el.muted=userMuted;};

function trigger(){
  if(!trig.loaded)return;
  showTest=false;trig.el.currentTime=0;trig.start();   // always restarts the trigger video
  if(state==='idle'||state==='fadeout')state='fadein';
}
function fadeOut(){if(state==='fadeout'||state==='idle')return;state='fadeout';video.start();}
function skip(){if(state==='fadein'||state==='playing'){trig.el.pause();fadeOut();}}
const toggleTrigger=()=>(state==='fadein'||state==='playing')?skip():trigger();
trig.el.addEventListener('ended',()=>{if(state==='fadein'||state==='playing')fadeOut();});
function tick(){
  const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;const F=Math.max(.01,fadeTime);
  if(state==='fadein'){mix=Math.min(1,mix+dt/F);if(mix>=1){state='playing';video.el.pause();}}
  else if(state==='fadeout'){mix=Math.max(0,mix-dt/F);if(mix<=0){state='idle';trig.el.pause();}}
  const idle=state==='idle';video.el.volume=idle?vol:vol*(1-mix);trig.el.volume=idle?0:vol*mix;
}
function loadMedia(slot,file){
  if(!(file instanceof Blob))return;
  (slot==='loop'?video:trig).load(file);if(slot==='loop'&&started)video.start();
}
const CMDS={mapping:m=>map=m.mapping,test:m=>showTest=m.on,loop:m=>video.el.loop=m.on,volume:m=>vol=m.v,mute:m=>{userMuted=m.on;applyMute();},
  fade:m=>fadeTime=m.s,play:()=>video.start(),pause:()=>video.el.pause(),restart:()=>video.restart(),
  seek:m=>{if(video.el.duration)video.el.currentTime=m.p*video.el.duration;},trigger,toggle:toggleTrigger,skip};
const net=connect(m=>{
  if(m.t==='hello'){const s=m.state;if(s.mapping)map=s.mapping;showTest=!!s.test;video.el.loop=!!s.loop;vol=s.volume;userMuted=!!s.muted;fadeTime=s.fadeTime;applyMute();
    for(const [k,f] of Object.entries(m.media||{}))loadMedia(k,f);}
  else if(m.t==='media')loadMedia(m.slot,m.file);
  else if(m.t==='cmd'&&CMDS[m.c])CMDS[m.c](m);
});
net.send({t:'need-state'});
setInterval(()=>net.send({t:'status',time:video.el.currentTime||0,duration:video.el.duration||0,paused:video.el.paused,state,test:showTest,muted:userMuted,started,
  screen:{w:innerWidth,h:innerHeight}}),250);

$('start').onclick=()=>{started=true;$('start').hidden=true;document.body.classList.add('run');
  document.documentElement.requestFullscreen?.().catch(()=>{});video.start();};
window.addEventListener('keydown',e=>{
  if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>{});}
  if((e.key==='t'||e.key==='T')&&!e.repeat)toggleTrigger();
});
function frame(){
  tick();
  if(!showTest){if(video.needsUpload())renderer.upload('video',video.el);if(state!=='idle'&&trig.needsUpload())renderer.upload('trigger',trig.el);}
  const layers=[];
  if(showTest&&testReady)layers.push({tex:'test',a:1});
  else{if(video.ready)layers.push({tex:'video',a:1});if(state!=='idle')layers.push({tex:'trigger',a:mix});}
  renderer.draw(map,layers);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
