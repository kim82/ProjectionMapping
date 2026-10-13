import { Renderer } from './webgl.js?v=20261005';
import { VideoSource } from './video.js?v=20261005';
import { DEFAULT } from './mapping.js?v=20261005';
import { connect } from './net.js?v=20261005';

const getElement = id => document.getElementById(id);

let renderer;
try {
  renderer = new Renderer(getElement('gl'));
} catch (error) {
  getElement('start').textContent = error.message;
  throw error;
}

let mapping = DEFAULT;
let showTestPattern = false;
let testPatternReady = false;
let hasStarted = false;
let isLoopMutedByUser = false;
let isTriggerMutedByUser = false;
let loopVideoAutoplay = true;
let masterVolume = 1;
let isMirroredHorizontally = false;
let videoRotationDegrees = 0;
let triggerState = 'idle';
let triggerMix = 0;
let fadeDuration = 0.6;
let triggerDelaySec = 0;
let loopVideoTriggerDelaySec = 0;
let pendingTriggerTimeout = null;
let pendingLoopVideoTriggerTimeout = null;
let shouldResumeLoopAfterTrigger = false;
let previousFrameTime = performance.now();

const loopVideo = new VideoSource();
const triggerVideo = new VideoSource();
triggerVideo.el.loop = false;

loopVideo.el.addEventListener('ended', () => {
  loopVideo.el.currentTime = 0;
  shouldResumeLoopAfterTrigger = false;
});

function buildTestPattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');

  context.fillStyle = '#111';
  context.fillRect(0, 0, 1280, 720);
  context.strokeStyle = '#888';
  context.lineWidth = 2;

  for (let x = 0; x <= 1280; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 720);
    context.stroke();
  }

  for (let y = 0; y <= 720; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1280, y);
    context.stroke();
  }

  context.strokeStyle = '#ff9f1c';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(1280, 720);
  context.moveTo(1280, 0);
  context.lineTo(0, 720);
  context.moveTo(640, 0);
  context.lineTo(640, 720);
  context.moveTo(0, 360);
  context.lineTo(1280, 360);
  context.stroke();

  context.beginPath();
  context.arc(640, 360, 200, 0, 7);
  context.stroke();
  context.strokeStyle = '#fff';
  context.lineWidth = 8;
  context.strokeRect(4, 4, 1272, 712);

  context.fillStyle = '#fff';
  context.font = 'bold 48px sans-serif';
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillText('TL', 20, 20);
  context.textBaseline = 'bottom';
  context.fillText('BL', 20, 700);
  context.textAlign = 'right';
  context.textBaseline = 'top';
  context.fillText('TR', 1260, 20);
  context.textBaseline = 'bottom';
  context.fillText('BR', 1260, 700);

  renderer.upload('test', canvas);
  testPatternReady = true;
}

buildTestPattern();
renderer.onLost = () => {
  testPatternReady = false;
  buildTestPattern();
  loopVideo.dirty = true;
};

function applyMute() {
  loopVideo.el.muted = isLoopMutedByUser;
  triggerVideo.el.muted = isTriggerMutedByUser;
}

function cancelPendingTrigger() {
  if (pendingTriggerTimeout === null) return false;

  clearTimeout(pendingTriggerTimeout);
  pendingTriggerTimeout = null;
  return true;
}

function trigger() {
  if (!triggerVideo.loaded) return;

  if (cancelPendingTrigger()) {
    skipTrigger();
    return;
  }

  showTestPattern = false;
  shouldResumeLoopAfterTrigger = loopVideoAutoplay
    || (!loopVideo.el.paused && !loopVideo.el.ended);
  triggerVideo.el.currentTime = 0;
  pendingTriggerTimeout = setTimeout(() => {
    pendingTriggerTimeout = null;
    console.log('Triggering video with delay of', triggerDelaySec, 'seconds');
    triggerVideo.start();
  }, Number(triggerDelaySec * 1000) || 0);

  if (triggerState === 'idle' || triggerState === 'fadeout') {
    triggerState = 'fadein';
  }
}

function loopVideoTrigger() {
  if (!loopVideo.loaded) return;
  if (!loopVideo.el.paused && !loopVideo.el.ended) return;

  if (pendingLoopVideoTriggerTimeout !== null) {
    clearTimeout(pendingLoopVideoTriggerTimeout);
  }
  showTestPattern = false;
  loopVideo.el.loop = false;
  loopVideo.el.pause();
  loopVideo.el.currentTime = 0;
  pendingLoopVideoTriggerTimeout = setTimeout(() => {
    pendingLoopVideoTriggerTimeout = null;
    shouldResumeLoopAfterTrigger = true;
    loopVideo.start();
  }, Number(loopVideoTriggerDelaySec * 1000) || 0);
}

function fadeOut() {
  if (triggerState === 'fadeout' || triggerState === 'idle') return;
  triggerState = 'fadeout';
  if (shouldResumeLoopAfterTrigger) loopVideo.start();
  shouldResumeLoopAfterTrigger = false;
}

function skipTrigger() {
  cancelPendingTrigger();
  if (triggerState !== 'fadein' && triggerState !== 'playing') return;
  triggerVideo.el.pause();
  fadeOut();
}

function toggleTrigger() {
  if (triggerState === 'fadein' || triggerState === 'playing') {
    skipTrigger();
  } else {
    trigger();
  }
}

triggerVideo.el.addEventListener('ended', () => {
  if (triggerState === 'fadein' || triggerState === 'playing') fadeOut();
});

function updatePlayback() {
  const currentTime = performance.now();
  const deltaSeconds = Math.min(0.1, (currentTime - previousFrameTime) / 1000);
  previousFrameTime = currentTime;
  const fadeDurationSeconds = Math.max(0.01, fadeDuration);

  if (triggerState === 'fadein') {
    triggerMix = Math.min(1, triggerMix + deltaSeconds / fadeDurationSeconds);
    if (triggerMix >= 1) {
      triggerState = 'playing';
      loopVideo.el.pause();
    }
  } else if (triggerState === 'fadeout') {
    triggerMix = Math.max(0, triggerMix - deltaSeconds / fadeDurationSeconds);
    if (triggerMix <= 0) {
      triggerState = 'idle';
      triggerVideo.el.pause();
    }
  }

  const isIdle = triggerState === 'idle';
  loopVideo.el.volume = isIdle ? masterVolume : masterVolume * (1 - triggerMix);
  triggerVideo.el.volume = isIdle ? 0 : masterVolume * triggerMix;
}

function loadMedia(mediaSlot, file) {
  if (!(file instanceof Blob)) return;

  const videoSource = mediaSlot === 'loop' ? loopVideo : triggerVideo;
  videoSource.load(file);
  if (mediaSlot === 'loop' && hasStarted && loopVideoAutoplay) loopVideo.start();
}

const commands = {
  mapping: message => mapping = message.mapping,
  test: message => showTestPattern = message.on,
  loop: message => loopVideo.el.loop = loopVideoAutoplay && message.on,
  loopAutoplay: message => {
    loopVideoAutoplay = message.on;
    if (!loopVideoAutoplay) {
      loopVideo.el.loop = false;
      loopVideo.el.pause();
    }
  },
  volume: message => masterVolume = message.v,
  mute: message => {
    isLoopMutedByUser = message.on;
    applyMute();
  },
  loopMute: message => {
    isLoopMutedByUser = message.on;
    applyMute();
  },
  triggerMute: message => {
    isTriggerMutedByUser = message.on;
    applyMute();
  },
  mirror: message => isMirroredHorizontally = message.on,
  rotate: message => videoRotationDegrees = message.degrees,
  fade: message => fadeDuration = message.s,
  triggerDelay: message => triggerDelaySec = message.s,
  loopVideoTriggerDelay: message => loopVideoTriggerDelaySec = message.s,
  loopVideoTrigger,
  play: () => loopVideo.start(),
  pause: () => loopVideo.el.pause(),
  restart: () => loopVideo.restart(),
  seek: message => {
    if (loopVideo.el.duration) {
      loopVideo.el.currentTime = message.p * loopVideo.el.duration;
    }
  },
  trigger,
  toggle: toggleTrigger,
  skip: skipTrigger
};

function handleMessage(message) {
  if (message.t === 'hello') {
    const initialState = message.state;
    if (initialState.mapping) mapping = initialState.mapping;
    showTestPattern = !!initialState.test;
    loopVideoAutoplay = initialState.loopVideoAutoplay !== false;
    loopVideo.el.loop = loopVideoAutoplay && !!initialState.loop;
    masterVolume = initialState.volume;
    isLoopMutedByUser = !!initialState.loopMuted;
    isTriggerMutedByUser = !!initialState.triggerMuted;
    isMirroredHorizontally = !!initialState.mirrorHorizontal;
    videoRotationDegrees = initialState.videoRotationDegrees ?? 0;
    fadeDuration = initialState.fadeTime;
    triggerDelaySec = initialState.triggerDelay ?? 0;
    loopVideoTriggerDelaySec = initialState.loopVideoTriggerDelay ?? 0;
    applyMute();

    for (const [mediaSlot, file] of Object.entries(message.media || {})) {
      loadMedia(mediaSlot, file);
    }
  } else if (message.t === 'media') {
    loadMedia(message.slot, message.file);
  } else if (message.t === 'cmd' && commands[message.c]) {
    commands[message.c](message);
  }
}

const channel = connect(handleMessage);
channel.send({ t: 'need-state' });

setInterval(() => channel.send({
  t: 'status',
  time: loopVideo.el.currentTime || 0,
  duration: loopVideo.el.duration || 0,
  paused: loopVideo.el.paused,
  state: triggerState,
  test: showTestPattern,
  loopMuted: isLoopMutedByUser,
  triggerMuted: isTriggerMutedByUser,
  started: hasStarted,
  screen: { w: innerWidth, h: innerHeight }
}), 250);

getElement('start').onclick = () => {
  hasStarted = true;
  getElement('start').hidden = true;
  document.body.classList.add('run');
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (loopVideoAutoplay) loopVideo.start();
};

window.addEventListener('keydown', event => {
  if (event.key === 'f' || event.key === 'F') {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }
  if ((event.key === 't' || event.key === 'T') && !event.repeat) {
    toggleTrigger();
  }
});

function drawFrame() {
  updatePlayback();

  if (!showTestPattern) {
    if (loopVideo.needsUpload()) renderer.upload('video', loopVideo.el);
    if (triggerState !== 'idle' && triggerVideo.needsUpload()) {
      renderer.upload('trigger', triggerVideo.el);
    }
  }

  const layers = [];
  if (showTestPattern && testPatternReady) {
    layers.push({ tex: 'test', a: 1 });
  } else {
    if (loopVideo.ready) layers.push({ tex: 'video', a: 1 });
    if (triggerState !== 'idle') layers.push({ tex: 'trigger', a: triggerMix });
  }

  renderer.draw(mapping, layers, isMirroredHorizontally, videoRotationDegrees);
  requestAnimationFrame(drawFrame);
}

requestAnimationFrame(drawFrame);
