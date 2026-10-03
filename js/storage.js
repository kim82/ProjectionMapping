const K='projmap.v1';
const DEFAULT_HA={
  url:'ws://homeassistant.local:8123/api/websocket',
  token:'',
  motionEntity:'binary_sensor.motion_sensor_occupancy'
};
const read=()=>{try{return JSON.parse(localStorage.getItem(K))||{};}catch{return{};}};
const write=o=>{try{localStorage.setItem(K,JSON.stringify(o));}catch{}};
export const getState=()=>read();
export const setState=p=>write({...read(),...p});
export function saveNamed(name,m){const s=read();s.maps={...(s.maps||{}),[name]:m};s.name=name;write(s);}
export const listNamed=()=>Object.keys(read().maps||{});
export const getNamed=n=>(read().maps||{})[n];
export function getHASettings(){const s=read();return{...DEFAULT_HA,...(s.ha||{})};}
export function saveHASettings(cfg){const s=read();s.ha={...getHASettings(),...(cfg||{})};write(s);return s.ha;}
