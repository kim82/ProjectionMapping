export class VideoSource {
  constructor() {
    const element = this.el = document.createElement('video');
    element.playsInline = true;
    element.muted = false;
    element.preload = 'auto';

    this.loaded = false;
    this.dirty = false;

    ['seeked', 'canplay', 'playing', 'loadedmetadata'].forEach(eventName => {
      element.addEventListener(eventName, () => {
        this.dirty = true;
      });
    });

    element.addEventListener('loadeddata', () => {
      this.loaded = true;
      this.dirty = true;
    });
  }

  load(file) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.el.src = this.url;
    this.el.load();
  }

  get ready() {
    return this.loaded && this.el.readyState >= 2;
  }

  needsUpload() {
    this.dirty = false;
    return this.ready;
  }

  async start() {
    try {
      await this.el.play();
      return true;
    } catch {
      this.el.muted = true;
      try {
        await this.el.play();
        return 'muted';
      } catch {
        return false;
      }
    }
  }

  toggle() {
    if (this.el.paused) {
      this.start();
    } else {
      this.el.pause();
    }
  }

  restart() {
    this.el.currentTime = 0;
    this.start();
  }
}
