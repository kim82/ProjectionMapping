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
let mapping = savedState.mapping ? clone(savedState.mapping) : clone(DEFAULT);
let outputStatus = {};
let mediaNames = {};
let isSeeking = false;
let outputScreenSize = { w: 16, h: 9 };
let mappingUpdatePending = false;

const controllerState = {
  loop: !!savedState.loop,
  volume: savedState.volume ?? 1,
  muted: false,
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
  volume: ['volume', 'v'],
  mute: ['muted', 'on'],
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

function setOutputConnectionStatus(isConnected, message) {
  const statusElement = getElement('out-status');
  statusElement.textContent = message;
  statusElement.classList.toggle('connected', isConnected);
}

function showMediaNames() {
  getElement('status').textContent = ['loop', 'trigger']
    .filter(slot => mediaNames[slot])
    .map(slot => `${slot}: ${mediaNames[slot].name}`)
    .join('   |   ');
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
  getElement('play').textContent = outputStatus.paused === false ? 'Pause' : 'Play';
  setToggle('test', outputStatus.test);
  setToggle('mute', outputStatus.muted);
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

function fillHomeAssistantForm() {
  const settings = store.getHASettings();
  getElement('ha-url').value = settings.url;
  getElement('ha-token').value = settings.token;
  getElement('ha-motion-entity').value = settings.motionEntity;
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
    motionEntity: getElement('ha-motion-entity').value.trim()
  };

  console.log(settings.motionEntity);
  if (!settings.url || !settings.token || !settings.motionEntity) {
    alert('Please enter the Home Assistant WebSocket URL, access token, and motion entity.');
    return;
  }

  store.saveHASettings(settings);
  closeHomeAssistantSettings();
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
getElement('grid').onclick = () => {
  calibration.showGrid = !calibration.showGrid;
  setToggle('grid', calibration.showGrid);
  calibration.draw();
};
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
getElement('mute').onclick = () => sendCommand('mute', { on: !outputStatus.muted });
getElement('vol').oninput = event => {
  const volume = +event.target.value;
  store.setState({ volume });
  sendCommand('volume', { v: volume });
};

getElement('triggerDelay').value = controllerState.triggerDelay;
getElement('triggerDelay').oninput = event => {
  const delaySec = Number(event.target.value) || 0;
  store.setState({ triggerDelay: delaySec });
  sendCommand('triggerDelay', { s: delaySec });
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
  window.open('/output.html', 'pm-output', 'popup,width=960,height=540');
};

function refreshSavedMappings() {
  const select = getElement('maps');
  select.innerHTML = '';

  for (const name of store.listNamed()) {
    const option = document.createElement('option');
    option.textContent = name;
    select.append(option);
  }

  const currentName = store.getState().name;
  if (currentName) select.value = currentName;
}

getElement('save').onclick = () => {
  const name = prompt('Mapping name:', getElement('maps').value || 'Mapping 1');
  if (!name) return;

  store.saveNamed(name, clone(mapping));
  refreshSavedMappings();
  getElement('maps').value = name;
};

getElement('loadmap').onclick = () => {
  const selectedName = getElement('maps').value;
  const savedMapping = store.getNamed(selectedName);
  if (!savedMapping) return;

  mapping = clone(savedMapping);
  store.setState({ mapping, name: selectedName });
  calibration.draw();
  sendCommand('mapping', { mapping });
};

refreshSavedMappings();

window.addEventListener('projectionmapper:trigger', () => sendCommand('trigger'));
window.addEventListener('projectionmapper:toggle', () => sendCommand('toggle'));
window.projectionMapper = {
  trigger: () => sendCommand('trigger'),
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
  }

  if (event.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) {
    event.preventDefault();
    sendCommand(outputStatus.paused === false ? 'pause' : 'play');
  }
});

window.addEventListener('resize', fitCalibrationOverlay);
setToggle('loop', controllerState.loop);
setToggle('grid', calibration.showGrid);
setToggle('mirror', controllerState.mirrorHorizontal);
getElement('mirror').setAttribute('aria-pressed', String(controllerState.mirrorHorizontal));
getElement('rotate').setAttribute(
  'aria-label',
  `Rotate video 90 degrees; current rotation ${controllerState.videoRotationDegrees} degrees`
);
getElement('vol').value = controllerState.volume;
sendInitialState();
setOutputConnectionStatus(false, 'Output screen not connected');
setHomeAssistantStatus(false, 'Home Assistant Disconnected');
connectToHomeAssistant();
fitCalibrationOverlay();