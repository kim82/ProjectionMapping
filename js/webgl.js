import {quadQ, toArray} from './mapping.js';
const VS=`attribute vec2 aPos;attribute vec3 aUV;varying vec3 vUV;
void main(){vUV=aUV;gl_Position=vec4(aPos,0.,1.);}`;
const FS=`precision highp float;varying vec3 vUV;uniform sampler2D uTex;uniform float uAlpha;
void main(){gl_FragColor=vec4(texture2D(uTex,vUV.xy/vUV.z).rgb,uAlpha);}`;

export class Renderer {
  constructor(canvas, onLost){
    this.c=canvas; this.onLost=onLost;
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{this.init();this.lost=false;onLost&&onLost();});
    if(!this.init()) throw new Error('WebGL is not available in this browser.');
  }
  init(){
    const gl=this.gl=this.c.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
    if(!gl) return false;
    const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);
      if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));return o;};
    const pr=this.prog=gl.createProgram();
    gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));
    gl.linkProgram(pr);gl.useProgram(pr);
    this.buf=gl.createBuffer();this.uAlpha=gl.getUniformLocation(pr,'uAlpha');
    this.aPos=gl.getAttribLocation(pr,'aPos');this.aUV=gl.getAttribLocation(pr,'aUV');
    this.tex={video:this.makeTex(),trigger:this.makeTex(),test:this.makeTex()};
    return true;
  }
  makeTex(){
    const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    // NPOT-safe: clamp + linear, no mipmaps (works for any video size in WebGL1)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    return t;
  }
  upload(name, source){ // direct GPU upload, no JS pixel copies
    const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.tex[name]);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  }
  resize(){ // backing store follows CSS size * DPR
    const d=window.devicePixelRatio||1,w=Math.max(1,Math.round(this.c.clientWidth*d)),h=Math.max(1,Math.round(this.c.clientHeight*d));
    if(this.c.width!==w||this.c.height!==h){this.c.width=w;this.c.height=h;}
  }
  draw(mapping, layers){ // layers: [{tex, a}] drawn in order with alpha blending
    if(this.lost) return;
    const gl=this.gl;this.resize();
    gl.viewport(0,0,this.c.width,this.c.height);
    gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    if(!layers.length) return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const p=toArray(mapping),q=quadQ(p),uv=[[0,0],[1,0],[1,1],[0,1]];
    const v=i=>[p[i][0]*2-1,1-p[i][1]*2,uv[i][0]*q[i],(1-uv[i][1])*q[i],q[i]];
    // texture row 0 = top of video (UNPACK_FLIP_Y false), so v = uv.y*q
    const V=i=>{const a=v(i);a[3]=uv[i][1]*q[i];return a;};
    const data=new Float32Array([0,1,2,0,2,3].flatMap(V));
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);gl.vertexAttribPointer(this.aPos,2,gl.FLOAT,false,20,0);
    gl.enableVertexAttribArray(this.aUV);gl.vertexAttribPointer(this.aUV,3,gl.FLOAT,false,20,8);
    for(const L of layers){gl.bindTexture(gl.TEXTURE_2D,this.tex[L.tex]);gl.uniform1f(this.uAlpha,L.a);gl.drawArrays(gl.TRIANGLES,0,6);}
  }
}