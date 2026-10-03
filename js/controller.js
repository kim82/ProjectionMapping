import {connect} from './net.js';
import {DEFAULT, clone} from './mapping.js';
import {Calibration} from './controls.js';
import * as store from './storage.js';
const $=id=>document.getElementById(id);
const fmt=t=>isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'0:00';
const toggle=(id,on)=>$(id).classList.toggle('on',!!on);
const saved=store.getState();
let map=saved.mapping?clone(saved.mapping):clone(DEFAULT);
let status={},names={},seeking=false,screen={w:16,h:9},pend=false;
const S={loop:!!saved.loop,volume:saved.volume??1,muted:false,fadeTime:.6,test:false},media={};
const KEYS={mapping:['mapping','mapping'],loop:['loop','on'],volume:['volume','v'],mute:['muted','on'],fade:['fadeTime','s']};
const cmd=(c,a={})=>{const k=KEYS[c];if(k)S[k[0]]=a[k[1]];net.send({t:'cmd',c,...a});};
const sendMap=()=>{if(pend)return;pend=true;setTimeout(()=>{pend=false;cmd('mapping',{mapping:map});},33);};
const cal=new Calibration($('overlay'),()=>map,()=>{store.setState({mapping:map});cal.draw();sendMap();});
const net=connect(onMsg);

function setOut(on,text){const e=$('out-status');e.textContent=text;e.classList.toggle('connected',on);}
function showNames(){$('status').textContent=['loop','trigger'].filter(k=>names[k]).map(k=>k+': '+names[k].name).join('   |   ');}
function fit(){const st=$('stage'),W=st.clientWidth,H=st.clientHeight,ar=screen.w/screen.h;let w=W,h=W/ar;if(h>H){h=H;w=H*ar;}
  const o=$('overlay');o.style.width=w+'px';o.style.height=h+'px';cal.draw();}
function render(){
  $('play').textContent=status.paused===false?'Pause':'Play';
  toggle('test',status.test);toggle('mute',status.muted);toggle('trigger',status.state&&status.state!=='idle');
  if(status.duration){$('time').textContent=`${fmt(status.time)} / ${fmt(status.duration)}`;if(!seeking)$('seek').value=status.time/status.duration*1000;}
  if(status.screen&&(status.screen.w!==screen.w||status.screen.h!==screen.h)){screen=status.screen;fit();}
}
let lastSeen=0;
const hello=()=>net.send({t:'hello',state:{...S,mapping:map},media});   // full state + video files for the output page
function onMsg(m){
  if(m.t==='need-state')hello();
  else if(m.t==='status'){status=m;lastSeen=performance.now();render();}
}
setInterval(()=>{const on=performance.now()-lastSeen<1500;setOut(on,on?'Screen 1 connected':'Screen 1 not connected');},500);
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

function upload(slot,f){media[slot]=f;names[slot]={name:f.name};showNames();net.send({t:'media',slot,file:f});}
$('load').onclick=()=>$('file').click();$('loadtrig').onclick=()=>$('file2').click();
$('file').onchange=e=>{if(e.target.files[0])upload('loop',e.target.files[0]);};
$('file2').onchange=e=>{if(e.target.files[0])upload('trigger',e.target.files[0]);};
$('trigger').onclick=()=>cmd('toggle');
$('test').onclick=()=>cmd('test',{on:!status.test});
$('grid').onclick=()=>{cal.showGrid=!cal.showGrid;toggle('grid',cal.showGrid);cal.draw();};
$('reset').onclick=()=>{map=clone(DEFAULT);store.setState({mapping:map});cal.draw();cmd('mapping',{mapping:map});};
$('play').onclick=()=>cmd(status.paused===false?'pause':'play');
$('restart').onclick=()=>cmd('restart');
$('loop').onclick=()=>{const on=!$('loop').classList.contains('on');toggle('loop',on);store.setState({loop:on});cmd('loop',{on});};
$('mute').onclick=()=>cmd('mute',{on:!status.muted});
$('vol').oninput=e=>{store.setState({volume:+e.target.value});cmd('volume',{v:+e.target.value});};
$('seek').addEventListener('pointerdown',()=>seeking=true);
window.addEventListener('pointerup',()=>seeking=false);window.addEventListener('pointercancel',()=>seeking=false);
$('seek').oninput=e=>cmd('seek',{p:e.target.value/1000});
$('openout').onclick=()=>window.open('/output.html','pm-output','popup,width=960,height=540');
function refreshMaps(){const s=$('maps');s.innerHTML='';
  for(const n of store.listNamed()){const o=document.createElement('option');o.textContent=n;s.append(o);}
  const cur=store.getState().name;if(cur)s.value=cur;}
$('save').onclick=()=>{const n=prompt('Mapping name:',$('maps').value||'Mapping 1');if(!n)return;
  store.saveNamed(n,clone(map));refreshMaps();$('maps').value=n;};
$('loadmap').onclick=()=>{const m=store.getNamed($('maps').value);if(!m)return;
  map=clone(m);store.setState({mapping:map,name:$('maps').value});cal.draw();cmd('mapping',{mapping:map});};
refreshMaps();

// Hooks for your own code (run on this controller page):
// projectionMapper.trigger() restarts the trigger video; toggleTrigger() = T key; skip() fades back to the loop.
window.addEventListener('projectionmapper:trigger',()=>cmd('trigger'));
window.addEventListener('projectionmapper:toggle',()=>cmd('toggle'));
window.projectionMapper={trigger:()=>cmd('trigger'),toggleTrigger:()=>cmd('toggle'),skip:()=>cmd('skip'),stopTrigger:()=>cmd('skip'),
  set fadeTime(s){cmd('fade',{s:+s});},isTriggering:()=>!!status.state&&status.state!=='idle'};
window.addEventListener('keydown',e=>{
  if((e.key==='t'||e.key==='T')&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))cmd('toggle');
  if(e.key===' '&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();cmd(status.paused===false?'pause':'play');}
});
window.addEventListener('resize',fit);
toggle('loop',S.loop);$('vol').value=S.volume;hello();setOut(false,'Screen 1 not connected');applyHAStatus(false,'Disconnected');connectToHomeAssistant();fit();
