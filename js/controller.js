import { connect } from './net.js?v=20261005';
import { DEFAULT, clone } from './mapping.js?v=20261005';
import { Calibration } from './controls.js?v=20261016';
import * as store from './storage.js?v=20261104';
import { initializeHomeAssistant, loopVideoSensorConfigured } from './homeassistant.js?v=20261104';

const getElement = id => document.getElementById(id);
const formatTime = seconds => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  : '0:00';
const setToggle = (id, isOn) => getElement(id).classList.toggle('on', !!isOn);
const normalizeRotation = degrees => Number.isFinite(degrees)
  ? ((Math.round(degrees / 90) % 4 + 4) % 4) * 90
  : 0;

const savedState = store.getState();
let mapping = savedState.mapping ? clone(savedState.mapping) : clone(DEFAULT);
let outputStatus = {};
let mediaNames = {};
let isSeeking = false;
let outputScreenSize = { w: 16, h: 9 };
let mappingUpdatePending = false;
let mappingRotationDegrees = normalizeRotation(savedState.mappingRotationDegrees);

const controllerState = {
  loop: !!savedState.loop && !loopVideoSensorConfigured,
  loopVideoAutoplay: !loopVideoSensorConfigured,
  volume: savedState.volume ?? 1,
  triggerVolume: savedState.triggerVolume ?? 1,
  loopMuted: !!savedState.loopMuted,
  triggerMuted: !!savedState.triggerMuted,
  triggerTransparency: savedState.triggerTransparency !== false,
  fadeTime: 0.6,
  triggerDelay: savedState.triggerDelay ?? 0,
  mirrorHorizontal: !!savedState.mirrorHorizontal,
  videoRotationDegrees: normalizeRotation(savedState.videoRotationDegrees),
  test: false
};
const mediaFiles = {};
const commandStateFields = {
  mapping: ['mapping', 'mapping'],
  loop: ['loop', 'on'],
  loopAutoplay: ['loopVideoAutoplay', 'on'],
  volume: ['volume', 'v'],
  triggerVolume: ['triggerVolume', 'v'],
  loopMute: ['loopMuted', 'on'],
  triggerMute: ['triggerMuted', 'on'],
  triggerTransparency: ['triggerTransparency', 'on'],
  fade: ['fadeTime', 's'],
  triggerDelay: ['triggerDelay', 's'],
  mirror: ['mirrorHorizontal', 'on'],
  rotate: ['videoRotationDegrees', 'degrees']
};

const channel = connect(handleMessage);

function sendCommand(commandName, arguments_ = {}) {
  const stateField = commandStateFields[commandName];
  if (stateField) controllerState[stateField[0]] = arguments_[stateField[1]];
  channel.send({ t: 'cmd', c: commandName, ...arguments_ });
}

function sendMapping() {
  if (mappingUpdatePending) return;

  mappingUpdatePending = true;
  setTimeout(() => {
    mappingUpdatePending = false;
    sendCommand('mapping', { mapping });
  }, 33);
}

const calibration = new Calibration(
  getElement('overlay'),
  () => mapping,
  () => {
    store.setState({ mapping });
    calibration.draw();
    sendMapping();
  }
);
calibration.rotationDegrees = mappingRotationDegrees;

function setOutputConnectionStatus(isConnected, message) {
  const statusElement = getElement('out-status');
  statusElement.textContent = message;
  statusElement.classList.toggle('connected', isConnected);
}

function showMediaNames() {
  if (mediaNames['loop'] != undefined) {
    getElement('load').textContent = "Loop: " + mediaNames['loop'].name;
    getElement('load').classList.add('connected');
  }
  
  if (mediaNames['trigger1'] != undefined) {
    getElement('loadtrig').textContent = "Trigger 1: " + mediaNames['trigger1'].name;
    getElement('loadtrig').classList.add('connected');
  }
  if (mediaNames['trigger2'] != undefined) {
    getElement('loadtrig2').textContent = "Trigger 2: " + mediaNames['trigger2'].name;
    getElement('loadtrig2').classList.add('connected');
  }
}

function fitCalibrationOverlay() {
  const stage = getElement('stage');
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const outputAspectRatio = mappingRotationDegrees % 180 === 90
    ? outputScreenSize.h / outputScreenSize.w
    : outputScreenSize.w / outputScreenSize.h;
  let overlayWidth = stageWidth;
  let overlayHeight = stageWidth / outputAspectRatio;

  if (overlayHeight > stageHeight) {
    overlayHeight = stageHeight;
    overlayWidth = stageHeight * outputAspectRatio;
  }

  const overlay = getElement('overlay');
  overlay.style.width = `${overlayWidth}px`;
  overlay.style.height = `${overlayHeight}px`;
  calibration.draw();
}

function renderOutputStatus() {
  getElement('play').textContent = outputStatus.paused === false ? '⏸' : '▶';
  setToggle('test', outputStatus.test);
  const loopMuted = outputStatus.loopMuted ?? controllerState.loopMuted;
  const triggerMuted = outputStatus.triggerMuted ?? controllerState.triggerMuted;
  getElement('mute').innerText = loopMuted ? '🔇' : '🔈';
  getElement('triggerMute').innerText = triggerMuted ? '🔇' : '🔈';
  const isTriggering = outputStatus.state && outputStatus.state !== 'idle';
  setToggle('trigger1', isTriggering && outputStatus.triggerIndex === 1);
  setToggle('trigger2', isTriggering && outputStatus.triggerIndex === 2);
  getElement('trigger1').setAttribute('aria-pressed', String(isTriggering && outputStatus.triggerIndex === 1));
  getElement('trigger2').setAttribute('aria-pressed', String(isTriggering && outputStatus.triggerIndex === 2));

  if (outputStatus.duration) {
    getElement('time').textContent = `${formatTime(outputStatus.time)} / ${formatTime(outputStatus.duration)}`;
    if (!isSeeking) {
      getElement('seek').value = (outputStatus.time / outputStatus.duration) * 1000;
    }
  }

  if (
    outputStatus.screen
    && (
      outputStatus.screen.w !== outputScreenSize.w
      || outputStatus.screen.h !== outputScreenSize.h
    )
  ) {
    outputScreenSize = outputStatus.screen;
    fitCalibrationOverlay();
  }
}

let lastOutputMessageTime = 0;

function sendInitialState() {
  channel.send({
    t: 'hello',
    state: { ...controllerState, mapping },
    media: mediaFiles
  });
}

function handleMessage(message) {
  if (message.t === 'need-state') {
    sendInitialState();
  } else if (message.t === 'status') {
    outputStatus = message;
    lastOutputMessageTime = performance.now();
    renderOutputStatus();
  }
}

setInterval(() => {
  const isConnected = performance.now() - lastOutputMessageTime < 1500;
  setOutputConnectionStatus(
    isConnected,
    isConnected ? 'Output screen connected' : 'Output screen not connected - click to open'
  );
}, 500);

function uploadMedia(slot, file) {
  if (slot === 'loop') {
    controllerState.loopMuted = false;
    store.setState({ loopMuted: false });
    sendCommand('loopMute', { on: false });
    getElement('mute').innerText = '🔈';
  } else if (slot === 'trigger1' || slot === 'trigger2') {
    controllerState.triggerMuted = false;
    store.setState({ triggerMuted: false });
    sendCommand('triggerMute', { on: false });
    getElement('triggerMute').innerText = '🔈';
  }

  mediaFiles[slot] = file;
  mediaNames[slot] = { name: file.name };
  showMediaNames();
  channel.send({ t: 'media', slot, file });
}

getElement('load').onclick = () => getElement('file').click();
getElement('loadtrig').onclick = () => getElement('file2').click();
getElement('loadtrig2').onclick = () => getElement('file3').click();
getElement('file').onchange = event => {
  const file = event.target.files[0];
  if (file) uploadMedia('loop', file);
};
getElement('file2').onchange = event => {
  const file = event.target.files[0];
  if (file) uploadMedia('trigger1', file);
};
getElement('file3').onchange = event => {
  const file = event.target.files[0];
  if (file) uploadMedia('trigger2', file);
};

getElement('trigger1').onclick = () => sendCommand('toggle', { index: 1 });
getElement('trigger2').onclick = () => sendCommand('toggle', { index: 2 });
getElement('test').onclick = () => sendCommand('test', { on: !outputStatus.test });
getElement('mirror').onclick = () => {
  const isMirrored = !controllerState.mirrorHorizontal;
  store.setState({ mirrorHorizontal: isMirrored });
  setToggle('mirror', isMirrored);
  getElement('mirror').setAttribute('aria-pressed', String(isMirrored));
  sendCommand('mirror', { on: isMirrored });
};
getElement('rotate').onclick = () => {
  controllerState.videoRotationDegrees = (controllerState.videoRotationDegrees + 90) % 360;
  store.setState({ videoRotationDegrees: controllerState.videoRotationDegrees });
  updateVideoRotationButton();
  sendCommand('rotate', { degrees: controllerState.videoRotationDegrees });
};

function updateVideoRotationButton() {
  const button = getElement('rotate');
  button.textContent = `\u2b6f Rotate Video (${controllerState.videoRotationDegrees}\u00b0)`;
  button.setAttribute(
    'aria-label',
    `Rotate video 90 degrees; current rotation ${controllerState.videoRotationDegrees} degrees`
  );
}

function updateMappingRotationButton() {
  const button = getElement('rotate-mapping');
  button.textContent = `⭯ Rotate Mapping (${mappingRotationDegrees}\u00b0)`;
  button.setAttribute(
    'aria-label',
    `Rotate mapping view 90 degrees clockwise; current rotation ${mappingRotationDegrees} degrees`
  );
}

getElement('rotate-mapping').onclick = () => {
  mappingRotationDegrees = (mappingRotationDegrees + 90) % 360;
  store.setState({ mappingRotationDegrees });
  calibration.rotationDegrees = mappingRotationDegrees;
  calibration.hoveredCorner = null;
  updateMappingRotationButton();
  fitCalibrationOverlay();
};
// getElement('grid').onclick = () => {
//   calibration.showGrid = !calibration.showGrid;
//   setToggle('grid', calibration.showGrid);
//   calibration.draw();
// };
getElement('reset').onclick = () => {
  mapping = clone(DEFAULT);
  mappingRotationDegrees = 0;
  controllerState.videoRotationDegrees = 0;
  controllerState.mirrorHorizontal = false;
  store.setState({
    mapping,
    mappingRotationDegrees,
    videoRotationDegrees: 0,
    mirrorHorizontal: false
  });
  calibration.rotationDegrees = 0;
  calibration.activeCorner = null;
  calibration.hoveredCorner = null;
  setToggle('mirror', false);
  getElement('mirror').setAttribute('aria-pressed', 'false');
  updateVideoRotationButton();
  updateMappingRotationButton();
  fitCalibrationOverlay();
  sendCommand('rotate', { degrees: 0 });
  sendCommand('mirror', { on: false });
  sendCommand('mapping', { mapping });
};
getElement('play').onclick = () => {
  sendCommand(outputStatus.paused === false ? 'pause' : 'play');
};
getElement('restart').onclick = () => sendCommand('restart');
getElement('loop').onclick = () => {
  const isLoopEnabled = !getElement('loop').classList.contains('on');
  setToggle('loop', isLoopEnabled);
  store.setState({ loop: isLoopEnabled });
  sendCommand('loop', { on: isLoopEnabled });
};
getElement('mute').onclick = () => {
  const isMuted = outputStatus.loopMuted ?? controllerState.loopMuted;
  const nextMuted = !isMuted;
  store.setState({ loopMuted: nextMuted });
  sendCommand('loopMute', { on: nextMuted });
  getElement('mute').innerText = nextMuted ? '🔇' : '🔈';
};
getElement('triggerMute').onclick = () => {
  const isMuted = outputStatus.triggerMuted ?? controllerState.triggerMuted;
  const nextMuted = !isMuted;
  store.setState({ triggerMuted: nextMuted });
  sendCommand('triggerMute', { on: nextMuted });
  getElement('triggerMute').innerText = nextMuted ? '🔇' : '🔈';
};
getElement('triggerTransparency').onclick = () => {
  const enabled = !controllerState.triggerTransparency;
  controllerState.triggerTransparency = enabled;
  store.setState({ triggerTransparency: enabled });
  setToggle('triggerTransparency', enabled);
  getElement('triggerTransparency').setAttribute('aria-pressed', String(enabled));
  sendCommand('triggerTransparency', { on: enabled });
};
getElement('vol').oninput = event => {
  const volume = +event.target.value;
  store.setState({ volume });
  sendCommand('volume', { v: volume });
  getElement('vol').title = parseInt(volume  * 100); 
};
getElement('triggerVol').oninput = event => {
  const volume = +event.target.value;
  store.setState({ triggerVolume: volume });
  sendCommand('triggerVolume', { v: volume });
  getElement('triggerVol').title = `${parseInt(volume * 100)}%`;
};

getElement('triggerDelay').value = controllerState.triggerDelay;
getElement('triggerDelay').oninput = event => {
  const delaySec = Number(event.target.value) || 0;
  store.setState({ triggerDelay: delaySec });
  sendCommand('triggerDelay', { s: delaySec });
  getElement('triggerDelayLabel').innerText = "Video delay (" + delaySec + ")";
};

getElement('seek').addEventListener('pointerdown', () => {
  isSeeking = true;
});
window.addEventListener('pointerup', () => {
  isSeeking = false;
});
window.addEventListener('pointercancel', () => {
  isSeeking = false;
});
getElement('seek').oninput = event => {
  sendCommand('seek', { p: event.target.value / 1000 });
};
getElement('out-status').onclick = () => {
  window.open('output.html', 'pm-output', 'popup,width=960,height=540');
};

window.addEventListener('projectionmapper:trigger', () => sendCommand('trigger', { index: 1 }));
window.addEventListener('projectionmapper:toggle', () => sendCommand('toggle'));
window.projectionMapper = {
  trigger: (index = 1) => sendCommand('trigger', { index }),
  loopVideoTrigger: () => sendCommand('loopVideoTrigger'),
  toggleTrigger: () => sendCommand('toggle'),
  skip: () => sendCommand('skip'),
  stopTrigger: () => sendCommand('skip'),
  set fadeTime(seconds) {
    sendCommand('fade', { s: +seconds });
  },
  isTriggering: () => !!outputStatus.state && outputStatus.state !== 'idle'
};

window.addEventListener('keydown', event => {
  const isFormControl = /INPUT|SELECT|TEXTAREA/.test(event.target.tagName);
  if (
    (event.key === '1' || event.key === '2')
    && !event.repeat
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !isFormControl
  ) {
    sendCommand('toggle', { index: Number(event.key) });
    event.preventDefault();
  }

  if (event.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) {
    event.preventDefault();
    sendCommand(outputStatus.paused === false ? 'pause' : 'play');
  }
});

window.addEventListener('resize', fitCalibrationOverlay);
updateMappingRotationButton();
setToggle('loop', controllerState.loop);
// setToggle('grid', calibration.showGrid);
setToggle('mirror', controllerState.mirrorHorizontal);
getElement('mirror').setAttribute('aria-pressed', String(controllerState.mirrorHorizontal));
updateVideoRotationButton();
getElement('vol').value = controllerState.volume;
getElement('vol').title = parseInt(controllerState.volume  * 100);
getElement('triggerVol').value = controllerState.triggerVolume;
getElement('triggerVol').title = `${parseInt(controllerState.triggerVolume * 100)}%`;
setToggle('triggerTransparency', controllerState.triggerTransparency);
getElement('triggerTransparency').setAttribute(
  'aria-pressed',
  String(controllerState.triggerTransparency)
);
getElement('triggerDelayLabel').innerText =
  `Video delay (${controllerState.triggerDelay})`;
getElement('loop').disabled = loopVideoSensorConfigured;
getElement('loop').title = loopVideoSensorConfigured
  ? 'Loop video sensor is configured; loop playback is disabled'
  : 'Loop video';
if (loopVideoSensorConfigured && savedState.loop) store.setState({ loop: false });
setToggle('loop', controllerState.loop);
sendInitialState();
setOutputConnectionStatus(false, 'Output screen not connected');
initializeHomeAssistant({
  controllerState,
  sendCommand,
  setToggle
});
fitCalibrationOverlay();