const STORAGE_KEY = 'projmap.v1';

function getDefaultHomeAssistantUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'homeassistant.local'
    : window.location.hostname || 'homeassistant.local';

  return `${protocol}//${host}:8123/api/websocket`;
}

const DEFAULT_HOME_ASSISTANT_SETTINGS = {
  url: getDefaultHomeAssistantUrl(),
  token: '',
  motionEntity: 'binary_sensor.motion_sensor_occupancy'
};

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export const getState = () => readStorage();
export const setState = updates => writeStorage({ ...readStorage(), ...updates });

// export function saveNamed(name, mapping) {
//   const state = readStorage();
//   state.maps = { ...(state.maps || {}), [name]: mapping };
//   state.name = name;
//   writeStorage(state);
// }

export const listNamed = () => Object.keys(readStorage().maps || {});
// export const getNamed = name => (readStorage().maps || {})[name];

export function getHASettings() {
  const state = readStorage();
  return { ...DEFAULT_HOME_ASSISTANT_SETTINGS, ...(state.ha || {}) };
}

export function saveHASettings(settings) {
  const state = readStorage();
  state.ha = { ...getHASettings(), ...(settings || {}) };
  writeStorage(state);
  return state.ha;
}
