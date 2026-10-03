import {Renderer} from './webgl.js?v=8';
import {VideoSource} from './video.js?v=8';
import {DEFAULT, clone} from './mapping.js';
import {Calibration} from './controls.js';
import * as store from './storage.js';

const $=id=>document.getElementById(id);
const fmt=t=>isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'0:00';
let renderer;
try{renderer=new Renderer($('gl'));}
catch(err){const e=$('error');e.hidden=false;e.textContent=err.message+' Try a current Chrome, Edge, Firefox or Safari with hardware acceleration on.';throw err;}

const saved=store.getState();
let map=saved.mapping?clone(saved.mapping):clone(DEFAULT);
const video=new VideoSource();      // loop video (always running)
const trig=new VideoSource();       // trigger video (plays once on demand)
trig.el.loop=false;let userMuted=false,vol=saved.volume??1;
let state='idle',mix=0,fadeTime=0.6,last=performance.now(); // idle | fadein | playing | fadeout
let showTest=false,testReady=false;
video.el.loop=!!saved.loop;video.el.volume=saved.volume??1;trig.el.volume=video.el.volume;
$('vol').value=video.el.volume;
const cal=new Calibration($('overlay'),()=>map,()=>{store.setState({mapping:map});cal.draw();});
const toggle=(id,on)=>$(id).classList.toggle('on',on);
toggle('loop',video.el.loop);

function applyHAStatus(connected,text){
  const status=$('ha-status');
  const led=$('ha-led');
  const statusText=$('ha-status-text');
  const active=!!connected;
  status.classList.toggle('connected',active);
  led.classList.toggle('connected',active);
  if(text)statusText.textContent=text;
  else statusText.textContent=active?'Connected':'Disconnected';
}
function setMotionLED(active){
  const led=$('ha-led');
  led.classList.toggle('motion',!!active);
  if(active){
    clearTimeout(window.__haMotionBlink);
    window.__haMotionBlink=setTimeout(()=>led.classList.remove('motion'),5000);
  }
}
function fillHAForm(){
  const settings=store.getHASettings();
  $('ha-url').value=settings.url;
  $('ha-token').value=settings.token;
  $('ha-motion-entity').value=settings.motionEntity;
}
function openHASettings(){
  fillHAForm();
  const d=$('ha-dialog');
  if(d && typeof d.showModal==='function')d.showModal();
}
function closeHASettings(){const d=$('ha-dialog');if(d && d.open)d.close();}
function saveHASettings(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const settings={
    url:$('ha-url').value.trim(),
    token:$('ha-token').value.trim(),
    motionEntity:$('ha-motion-entity').value.trim()
  };
  console.log(settings.motionEntity);
  if(!settings.url||!settings.token||!settings.motionEntity){
    alert('Please enter the Home Assistant WebSocket URL, access token, and motion entity.');
    return;
  }
  store.saveHASettings(settings);
  closeHASettings();
  connectToHomeAssistant();
}

let haSocket=null,haMessageId=1,haReconnectTimer=null;
function subscribeToMotion(){
  if(!haSocket||haSocket.readyState!==WebSocket.OPEN)return;
  haSocket.send(JSON.stringify({id:haMessageId++,type:'subscribe_events',event_type:'state_changed'}));
}
function handleMotionDetected(){
  if(window.projectionMapper && typeof window.projectionMapper.isTriggering === 'function' && window.projectionMapper.isTriggering()){
    console.log('Motion detected!');
    setMotionLED(true);
    return;
  }

  console.log('Motion detected! Triggering projection.');
  setMotionLED(true);
  if(window.projectionMapper && typeof window.projectionMapper.trigger === 'function')window.projectionMapper.trigger();
}
function connectToHomeAssistant(){
  const settings=store.getHASettings();
  if(!settings.url||!settings.token||!settings.motionEntity){
    applyHAStatus(false,'Needs config');
    return;
  }
  if(haSocket&&(haSocket.readyState===WebSocket.OPEN||haSocket.readyState===WebSocket.CONNECTING))return;
  applyHAStatus(false,'Connecting…');
  haSocket=new WebSocket(settings.url);
  haSocket.onopen=()=>{haSocket.send(JSON.stringify({type:'auth',access_token:settings.token}));};
  haSocket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.type==='auth_required'){haSocket.send(JSON.stringify({type:'auth',access_token:settings.token}));return;}
    if(message.type==='auth_ok'){applyHAStatus(true,'Connected');subscribeToMotion();return;}
    if(message.type==='auth_invalid'){applyHAStatus(false,'Auth failed');haSocket.close();return;}
    if(message.type==='event'&&message.event&&message.event.event_type==='state_changed'){
      const entity=message.event.data?.entity_id;
      const newState=message.event.data?.new_state?.state;
      const oldState=message.event.data?.old_state?.state;
      if(entity===settings.motionEntity&&newState==='on'&&oldState!=='on')handleMotionDetected();
    }
  };
  haSocket.onclose=()=>{
    applyHAStatus(false,'Disconnected');
    clearTimeout(haReconnectTimer);
    haReconnectTimer=setTimeout(connectToHomeAssistant,5000);
  };
  haSocket.onerror=()=>applyHAStatus(false,'Connection error');
}

$('ha-settings').addEventListener('click', openHASettings);
$('ha-dialog-close').addEventListener('click', closeHASettings);
$('ha-dialog-cancel').addEventListener('click', closeHASettings);
$('ha-form').addEventListener('submit', saveHASettings);

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

video.el.addEventListener('error',()=>{$('status').textContent='This browser cannot decode that video (try H.264 MP4 or WebM).';});
$('load').onclick=()=>$('file').click();
const fileName=f=>f.name;
function applyMute(){video.el.muted=trig.el.muted=userMuted;}
function loadLoop(f){video.load(f);showTest=false;toggle('test',false);$('status').textContent='Loop: '+f.name;
  video.start().then(r=>{if(r==='muted'){userMuted=true;toggle('mute',true);}});}
function loadTrigger(f){trig.load(f);$('status').textContent='Trigger: '+f.name+' (press T)';}
$('file').onchange=e=>{const f=e.target.files[0];if(f)loadLoop(f);};
$('loadtrig').onclick=()=>$('file2').click();
$('file2').onchange=e=>{const f=e.target.files[0];if(f)loadTrigger(f);};

// ---- Trigger API: crossfade loop -> trigger, pause loop, fade back and resume ----
const emit=n=>window.dispatchEvent(new CustomEvent('projectionmapper:'+n));
function trigger(){
  if(!trig.loaded)return false;
  showTest=false;toggle('test',false);
  trig.el.currentTime=0;trig.start();           // always restarts the trigger video
  if(state==='idle'||state==='fadeout')state='fadein';
  emit('triggered');return true;
}
function fadeOut(){ // fade back to loop video and resume it
  if(state==='fadeout'||state==='idle')return;
  state='fadeout';video.start();
}
function skip(){ // stop the trigger video and fade back to the loop video
  if(state==='fadein'||state==='playing'){trig.el.pause();fadeOut();}
}
const stopTrigger=skip;
function toggleTrigger(){ // T key: skip if the trigger is showing, otherwise (re)start it
  if(state==='fadein'||state==='playing')skip();else trigger();
}
function tick(){
  const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;const F=Math.max(.01,fadeTime);
  if(state==='fadein'){mix=Math.min(1,mix+dt/F);if(mix>=1){state='playing';video.el.pause();}}
  else if(state==='fadeout'){mix=Math.max(0,mix-dt/F);if(mix<=0){state='idle';trig.el.pause();emit('triggerend');}}
  const idle=state==='idle';
  video.el.volume=idle?vol:vol*(1-mix);trig.el.volume=idle?0:vol*mix;
}
trig.el.addEventListener('ended',()=>{if(state==='fadein'||state==='playing')fadeOut();});
trig.el.addEventListener('error',()=>{skip();$('status').textContent='Cannot decode trigger video (try H.264 MP4 or WebM).';});
$('trigger').onclick=toggleTrigger;
window.addEventListener('keydown',e=>{
  if((e.key==='t'||e.key==='T')&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))toggleTrigger();
});
// Hook for your own code: window.projectionMapper.trigger(), or
// window.dispatchEvent(new Event('projectionmapper:trigger'))
window.addEventListener('projectionmapper:trigger',trigger);
window.addEventListener('projectionmapper:toggle',toggleTrigger);
window.projectionMapper={toggleTrigger,trigger,stopTrigger,loadLoop,loadTrigger,
  skip,get fadeTime(){return fadeTime;},set fadeTime(s){fadeTime=+s;},
  isTriggering:()=>state!=='idle',get loopVideo(){return video.el;},get triggerVideo(){return trig.el;}};
$('test').onclick=()=>{showTest=!showTest;toggle('test',showTest);};
$('grid').onclick=()=>{cal.showGrid=!cal.showGrid;toggle('grid',cal.showGrid);cal.draw();};
$('reset').onclick=()=>{map=clone(DEFAULT);store.setState({mapping:map});cal.draw();};
$('play').onclick=()=>video.toggle();
$('restart').onclick=()=>video.restart();
$('loop').onclick=()=>{video.el.loop=!video.el.loop;toggle('loop',video.el.loop);store.setState({loop:video.el.loop});};
$('mute').onclick=()=>{userMuted=!userMuted;applyMute();toggle('mute',userMuted);};
$('vol').oninput=e=>{vol=+e.target.value;store.setState({volume:vol});};
let seeking=false;
$('seek').addEventListener('pointerdown',()=>seeking=true);
window.addEventListener('pointerup',()=>seeking=false);window.addEventListener('pointercancel',()=>seeking=false);
$('seek').oninput=e=>{if(video.el.duration)video.el.currentTime=e.target.value/1000*video.el.duration;};

function refreshMaps(){const s=$('maps');s.innerHTML='';
  for(const n of store.listNamed()){const o=document.createElement('option');o.textContent=n;s.append(o);}
  const cur=store.getState().name;if(cur)s.value=cur;}
$('save').onclick=()=>{const n=prompt('Mapping name:',$('maps').value||'Mapping 1');if(!n)return;
  store.saveNamed(n,clone(map));refreshMaps();$('maps').value=n;};
$('loadmap').onclick=()=>{const m=store.getNamed($('maps').value);if(!m)return;
  map=clone(m);store.setState({mapping:map,name:$('maps').value});cal.draw();};
refreshMaps();

$('proj').onclick=()=>document.documentElement.requestFullscreen?.().catch(()=>{});
document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('projection',!!document.fullscreenElement));
window.addEventListener('keydown',e=>{if(e.key===' '&&!/INPUT|SELECT/.test(e.target.tagName)){e.preventDefault();video.toggle();}});
window.addEventListener('resize',()=>cal.draw());

applyHAStatus(false,'Disconnected');
connectToHomeAssistant();

function frame(){
  const v=video.el;
  tick();
  if(!showTest){if(video.needsUpload())renderer.upload('video',v);if(state!=='idle'&&trig.needsUpload())renderer.upload('trigger',trig.el);}
  const layers=[];
  if(showTest&&testReady)layers.push({tex:'test',a:1});
  else{if(video.ready)layers.push({tex:'video',a:1});if(state!=='idle')layers.push({tex:'trigger',a:mix});}
  renderer.draw(map,layers);
  $('play').textContent=v.paused?'Play':'Pause';
  if(v.duration){$('time').textContent=`${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    if(!seeking)$('seek').value=v.currentTime/v.duration*1000;}
  requestAnimationFrame(frame);
}
cal.draw();requestAnimationFrame(frame);