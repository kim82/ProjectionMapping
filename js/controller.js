import { connect } from './net.js?v=20261005';
import { DEFAULT, clone } from './mapping.js?v=20261005';
import { Calibration } from './controls.js?v=20261005';
import * as store from './storage.js?v=20261005';

const getElement = id => document.getElementById(id);
const formatTime = seconds => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  : '0:00';
const setToggle = (id, isOn) => getElement(id).classList.toggle('on', !!isOn);
const normalizeRotation = degrees => Number.isFinite(degrees)
  ? ((Math.round(degrees / 90) % 4 + 4) % 4) * 90
  : 0;

const savedState = store.getState();
const savedHASettings = store.getHASettings();
const loopVideoSensorConfigured = !!savedHASettings.loopVideoEntity;
let mapping = savedState.mapping ? clone(savedState.mapping) : clone(DEFAULT);
let outputStatus = {};
let mediaNames = {};
let isSeeking = false;
let outputScreenSize = { w: 16, h: 9 };
let mappingUpdatePending = false;

const controllerState = {
  loop: !!savedState.loop && !loopVideoSensorConfigured,
  loopVideoAutoplay: !loopVideoSensorConfigured,
  volume: savedState.volume ?? 1,
  loopMuted: !!savedState.loopMuted,
  triggerMuted: !!savedState.triggerMuted,
  triggerTransparency: savedState.triggerTransparency !== false,
  fadeTime: 0.6,
  triggerDelay: savedState.triggerDelay ?? 0,
  loopVideoTriggerDelay: savedState.loopVideoTriggerDelay ?? 0,
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
  loopMute: ['loopMuted', 'on'],
  triggerMute: ['triggerMuted', 'on'],
  triggerTransparency: ['triggerTransparency', 'on'],
  fade: ['fadeTime', 's'],
  triggerDelay: ['triggerDelay', 's'],
  loopVideoTriggerDelay: ['loopVideoTriggerDelay', 's'],
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
  
  if (mediaNames['trigger'] != undefined) {
    getElement('loadtrig').textContent = "Trigger: " + mediaNames['trigger'].name;
    getElement('loadtrig').classList.add('connected');
  }
}

function fitCalibrationOverlay() {
  const stage = getElement('stage');
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const outputAspectRatio = outputScreenSize.w / outputScreenSize.h;
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
  setToggle('trigger', outputStatus.state && outputStatus.state !== 'idle');

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

function setHomeAssistantStatus(isConnected, message) {
  const statusElement = getElement('ha-status');
  const ledElement = getElement('ha-led');
  const statusText = getElement('ha-status-text');
  const connected = !!isConnected;
  
  statusElement.classList.toggle('connected', connected);
  ledElement.classList.toggle('connected', connected);
  statusText.textContent = message || (connected ? 'HA Connected' : 'HA Disconnected');
}

function showMotionDetected() {
  const motionLed = getElement('ha-led');
  motionLed.classList.add('motion');
  clearTimeout(window.__haMotionBlink);
  window.__haMotionBlink = setTimeout(() => motionLed.classList.remove('motion'), 5000);
}

function updateLoopVideoSensorMode(isConfigured) {
  controllerState.loopVideoAutoplay = !isConfigured;
  const loopToggle = getElement('loop');
  loopToggle.disabled = isConfigured;
  loopToggle.title = isConfigured
    ? 'Loop video sensor is configured; loop playback is disabled'
    : 'Loop video';

  if (isConfigured) {
    controllerState.loop = false;
    store.setState({ loop: false });
    setToggle('loop', false);
    sendCommand('loop', { on: false });
  }
  sendCommand('loopAutoplay', { on: controllerState.loopVideoAutoplay });
}

function fillHomeAssistantForm() {
  const settings = store.getHASettings();
  getElement('ha-url').value = settings.url;
  getElement('ha-token').value = settings.token;
  getElement('ha-motion-entity').value = settings.motionEntity;
  getElement('ha-loop-video-entity').value = settings.loopVideoEntity || '';
}

function openHomeAssistantSettings() {
  fillHomeAssistantForm();
  const dialog = getElement('ha-dialog');
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function closeHomeAssistantSettings() {
  const dialog = getElement('ha-dialog');
  if (dialog && dialog.open) dialog.close();
}

function saveHomeAssistantSettings(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const settings = {
    url: getElement('ha-url').value.trim(),
    token: getElement('ha-token').value.trim(),
    motionEntity: getElement('ha-motion-entity').value.trim(),
    loopVideoEntity: getElement('ha-loop-video-entity').value.trim()
  };

  if (!settings.url || !settings.token || !settings.motionEntity) {
    alert('Please enter the Home Assistant WebSocket URL, access token, and motion entity.');
    return;
  }

  store.saveHASettings(settings);
  updateLoopVideoSensorMode(!!settings.loopVideoEntity);
  closeHomeAssistantSettings();
  clearTimeout(homeAssistantReconnectTimer);
  if (homeAssistantSocket) {
    homeAssistantSocket.onclose = null;
    homeAssistantSocket.close();
    homeAssistantSocket = null;
  }
  connectToHomeAssistant();
}

let homeAssistantSocket = null;
let homeAssistantMessageId = 1;
let homeAssistantReconnectTimer = null;

function subscribeToMotionEvents() {
  if (!homeAssistantSocket || homeAssistantSocket.readyState !== WebSocket.OPEN) return;

  homeAssistantSocket.send(JSON.stringify({
    id: homeAssistantMessageId++,
    type: 'subscribe_events',
    event_type: 'state_changed'
  }));
}

function handleMotionDetected() {
  const projection = window.projectionMapper;
  if (projection && typeof projection.isTriggering === 'function' && projection.isTriggering()) {
    console.log('Motion detected!');
    showMotionDetected();
    return;
  }

  console.log('Motion detected! Triggering projection.');
  showMotionDetected();
  if (projection && typeof projection.trigger === 'function') projection.trigger();
}

function handleLoopVideoSensorDetected() {
  console.log('Loop video sensor detected. Triggering loop video.');
  showMotionDetected();
  const projection = window.projectionMapper;
  if (projection && typeof projection.loopVideoTrigger === 'function') {
    projection.loopVideoTrigger();
  }
}

function connectToHomeAssistant() {
  const settings = store.getHASettings();
  if (!settings.url || !settings.token || !settings.motionEntity) {
    setHomeAssistantStatus(false, 'Needs config');
    return;
  }

  if (
    homeAssistantSocket
    && (
      homeAssistantSocket.readyState === WebSocket.OPEN
      || homeAssistantSocket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  setHomeAssistantStatus(false, 'Connecting…');
  homeAssistantSocket = new WebSocket(settings.url);

  homeAssistantSocket.onopen = () => {
    homeAssistantSocket.send(JSON.stringify({
      type: 'auth',
      access_token: settings.token
    }));
  };

  homeAssistantSocket.onmessage = event => {
    const message = JSON.parse(event.data);

    if (message.type === 'auth_required') {
      homeAssistantSocket.send(JSON.stringify({
        type: 'auth',
        access_token: settings.token
      }));
      return;
    }
    if (message.type === 'auth_ok') {
      setHomeAssistantStatus(true, 'Home Assistant Connected');
      subscribeToMotionEvents();
      return;
    }
    if (message.type === 'auth_invalid') {
      setHomeAssistantStatus(false, 'Home Assistant Auth failed');
      homeAssistantSocket.close();
      return;
    }

    if (message.type === 'event' && message.event?.event_type === 'state_changed') {
      const eventData = message.event.data;
      const entityId = eventData?.entity_id;
      const newState = eventData?.new_state?.state;
      const oldState = eventData?.old_state?.state;

      if (entityId === settings.motionEntity && newState === 'on' && oldState !== 'on') {
        handleMotionDetected();
      }
      if (
        settings.loopVideoEntity
        && entityId === settings.loopVideoEntity
        && newState === 'on'
        && oldState !== 'on'
      ) {
        handleLoopVideoSensorDetected();
      }
    }
  };

  homeAssistantSocket.onclose = () => {
    setHomeAssistantStatus(false, 'Home Assistant Disconnected');
    clearTimeout(homeAssistantReconnectTimer);
    homeAssistantReconnectTimer = setTimeout(connectToHomeAssistant, 5000);
  };

  homeAssistantSocket.onerror = () => setHomeAssistantStatus(false, 'HA Connection error');
}

getElement('ha-status').addEventListener('click', openHomeAssistantSettings);
getElement('ha-dialog-close').addEventListener('click', closeHomeAssistantSettings);
getElement('ha-dialog-cancel').addEventListener('click', closeHomeAssistantSettings);
getElement('ha-form').addEventListener('submit', saveHomeAssistantSettings);

function uploadMedia(slot, file) {
  if (slot === 'loop') {
    controllerState.loopMuted = false;
    store.setState({ loopMuted: false });
    sendCommand('loopMute', { on: false });
    getElement('mute').innerText = '🔈';
  } else if (slot === 'trigger') {
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
getElement('file').onchange = event => {
  const file = event.target.files[0];
  if (file) uploadMedia('loop', file);
};
getElement('file2').onchange = event => {
  const file = event.target.files[0];
  if (file) uploadMedia('trigger', file);
};

getElement('trigger').onclick = () => sendCommand('toggle');
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
  getElement('rotate').setAttribute(
    'aria-label',
    `Rotate video 90 degrees; current rotation ${controllerState.videoRotationDegrees} degrees`
  );
  sendCommand('rotate', { degrees: controllerState.videoRotationDegrees });
};
// getElement('grid').onclick = () => {
//   calibration.showGrid = !calibration.showGrid;
//   setToggle('grid', calibration.showGrid);
//   calibration.draw();
// };
getElement('reset').onclick = () => {
  mapping = clone(DEFAULT);
  store.setState({ mapping });
  calibration.draw();
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

getElement('triggerDelay').value = controllerState.triggerDelay;
getElement('triggerDelay').oninput = event => {
  const delaySec = Number(event.target.value) || 0;
  store.setState({ triggerDelay: delaySec });
  sendCommand('triggerDelay', { s: delaySec });
  getElement('triggerDelayLabel').innerText = "Video delay (" + delaySec + ")";
};

getElement('loopVideoTriggerDelay').value = controllerState.loopVideoTriggerDelay;
getElement('loopVideoTriggerDelay').oninput = event => {
  const delaySec = Number(event.target.value) || 0;
  store.setState({ loopVideoTriggerDelay: delaySec });
  sendCommand('loopVideoTriggerDelay', { s: delaySec });
  getElement('loopVideoTriggerDelayLabel').innerText = `Video delay (${delaySec})`;
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

window.addEventListener('projectionmapper:trigger', () => sendCommand('trigger'));
window.addEventListener('projectionmapper:toggle', () => sendCommand('toggle'));
window.projectionMapper = {
  trigger: () => sendCommand('trigger'),
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
    (event.key === 't' || event.key === 'T')
    && !event.repeat
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !isFormControl
  ) {
    sendCommand('toggle');
    event.preventDefault();
  }

  if (event.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) {
    event.preventDefault();
    sendCommand(outputStatus.paused === false ? 'pause' : 'play');
  }
});

window.addEventListener('resize', fitCalibrationOverlay);
setToggle('loop', controllerState.loop);
// setToggle('grid', calibration.showGrid);
setToggle('mirror', controllerState.mirrorHorizontal);
getElement('mirror').setAttribute('aria-pressed', String(controllerState.mirrorHorizontal));
getElement('rotate').setAttribute(
  'aria-label',
  `Rotate video 90 degrees; current rotation ${controllerState.videoRotationDegrees} degrees`
);
getElement('vol').value = controllerState.volume;
getElement('vol').title = parseInt(controllerState.volume  * 100);
setToggle('triggerTransparency', controllerState.triggerTransparency);
getElement('triggerTransparency').setAttribute(
  'aria-pressed',
  String(controllerState.triggerTransparency)
);
getElement('triggerDelayLabel').innerText =
  `Video delay (${controllerState.triggerDelay})`;
getElement('loopVideoTriggerDelayLabel').innerText =
  `Video delay (${controllerState.loopVideoTriggerDelay})`;
getElement('loop').disabled = loopVideoSensorConfigured;
getElement('loop').title = loopVideoSensorConfigured
  ? 'Loop video sensor is configured; loop playback is disabled'
  : 'Loop video';
if (loopVideoSensorConfigured && savedState.loop) store.setState({ loop: false });
setToggle('loop', controllerState.loop);
sendInitialState();
setOutputConnectionStatus(false, 'Output screen not connected');
setHomeAssistantStatus(false, 'Home Assistant Disconnected');
connectToHomeAssistant();
fitCalibrationOverlay();