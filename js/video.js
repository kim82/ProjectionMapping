export class VideoSource {
  constructor(){
    const v=this.el=document.createElement('video');
    v.playsInline=true;v.muted=false;v.preload='auto';
    this.loaded=false;this.dirty=false;
    ['seeked','canplay','playing','loadedmetadata'].forEach(ev=>v.addEventListener(ev,()=>this.dirty=true));
    v.addEventListener('loadeddata',()=>{this.loaded=true;this.dirty=true;});
  }
  load(file){
    if(this.url) URL.revokeObjectURL(this.url);
    this.url=URL.createObjectURL(file);this.el.src=this.url;this.el.load();
  }
  get ready(){return this.loaded&&this.el.readyState>=2;}
  // true when a new frame should be uploaded
  needsUpload(){this.dirty=false;return this.ready;}
  async start(){ // Firefox may refuse audible autoplay: fall back to muted playback
    try{await this.el.play();return true;}catch{
      this.el.muted=true;try{await this.el.play();return 'muted';}catch{return false;}}}
  toggle(){this.el.paused?this.start():this.el.pause();}
  restart(){this.el.currentTime=0;this.start();}
}