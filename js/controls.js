import {KEYS, clone} from './mapping.js';
// Overlay drawing + pointer dragging of corner handles. All math in CSS-pixel space -> normalized.
export class Calibration {
  constructor(canvas, getMap, onChange){
    this.c=canvas;this.getMap=getMap;this.onChange=onChange;
    this.showGrid=false;this.active=null;this.hover=null;this.R=22; // generous hit radius (px)
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    const up=e=>{this.active=null;this.draw();};
    canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  }
  pos(e){const r=this.c.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];}
  pick(e){
    const r=this.c.getBoundingClientRect(),m=this.getMap();let best=null,bd=this.R;
    for(const k of KEYS){const d=Math.hypot(m[k][0]*r.width-(e.clientX-r.left),m[k][1]*r.height-(e.clientY-r.top));
      if(d<bd){bd=d;best=k;}}
    return best;
  }
  down(e){const k=this.pick(e);if(!k)return;this.active=k;this.c.setPointerCapture(e.pointerId);e.preventDefault();this.move(e);}
  move(e){
    if(this.active){const [x,y]=this.pos(e);this.getMap()[this.active]=[Math.min(1,Math.max(0,x)),Math.min(1,Math.max(0,y))];this.onChange();}
    else{const k=this.pick(e);if(k!==this.hover){this.hover=k;this.draw();}}
  }
  draw(){
    const c=this.c,d=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;
    if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d);}
    const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,w,h);
    const m=this.getMap(),P=KEYS.map(k=>[m[k][0]*w,m[k][1]*h]);
    g.strokeStyle='#ff9f1c';g.lineWidth=1.5;g.beginPath();P.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.stroke();
    if(this.showGrid){ // bilinear grid lines (visual aid)
      g.strokeStyle='rgba(255,159,28,.35)';g.lineWidth=1;const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      for(let i=1;i<8;i++){const t=i/8;
        for(const [a,b,c2,d2] of [[P[0],P[1],P[3],P[2]],[P[0],P[3],P[1],P[2]]]){
          g.beginPath();g.moveTo(...lerp(a,b,t));g.lineTo(...lerp(c2,d2,t));g.stroke();}}
    }
    KEYS.forEach((k,i)=>{const [x,y]=P[i],on=this.active===k||this.hover===k;
      g.beginPath();g.arc(x,y,on?13:10,0,7);g.fillStyle=on?'#ff9f1c':'rgba(255,159,28,.35)';g.fill();
      g.strokeStyle='#fff';g.lineWidth=2;g.stroke();});
  }
}
