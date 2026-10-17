import * as store from './storage.js?v=20261005';

const getElement = id => document.getElementById(id);
const savedHASettings = store.getHASettings();

export const loopVideoSensorConfigured = !!savedHASettings.loopVideoEntity;

export function initializeHomeAssistant({ controllerState, sendCommand, setToggle }) {
    let homeAssistantSocket = null;
    let homeAssistantMessageId = 1;
    let homeAssistantReconnectTimer = null;

    function setHomeAssistantStatus(isConnected, message) {
        const settings = store.getHASettings();
        const statusElement = getElement('ha-status');
        const ledElement = getElement('ha-led');
        const ledElement2 = getElement('ha-led2');
        const statusText = getElement('ha-status-text');
        const connected = !!isConnected;

        statusElement.classList.toggle('connected', connected);
        ledElement.classList.toggle('connected', connected);
        ledElement2.classList.toggle('connected', connected);
        ledElement2.style.display = settings.loopVideoEntity == '' ? 'none' : '';
        statusText.textContent = message || (connected ? 'HA Connected' : 'HA Disconnected');
    }

    function showMotionDetected(ledId = 'ha-led') {
        const motionLed = getElement(ledId);

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
        getElement('ha-trigger-entity').value = settings.motionEntity;
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
            motionEntity: getElement('ha-trigger-entity').value.trim(),
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

    function subscribeToMotionEvents() {
        if (!homeAssistantSocket || homeAssistantSocket.readyState !== WebSocket.OPEN) return;

        const settings = store.getHASettings();

        const entities = [];
        if (settings.motionEntity)
            entities.push(settings.motionEntity);
        if (settings.loopVideoEntity)
            entities.push(settings.loopVideoEntity);

        if (entities.length > 0) {
            homeAssistantSocket.send(JSON.stringify({
                id: homeAssistantMessageId++,
                type: 'subscribe_entities',
                entity_ids: ["binary_sensor.motion_sensor_occupancy"]
            }));
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

            if (message.type === 'event' && message.event?.c) {
                var changed = message.event.c;

                if (settings.loopVideoEntity && changed[settings.loopVideoEntity] && changed[settings.loopVideoEntity]['+']) {
                    var loopVideoEntityState = changed[settings.loopVideoEntity]['+']['s'];
                    if (loopVideoEntityState == 'on')
                        handleLoopVideoSensorDetected();
                    return;
                }
                
                if (settings.motionEntity && changed[settings.motionEntity] && changed[settings.motionEntity]['+']) {
                    var motionEntityState = changed[settings.motionEntity]['+']['s'];
                    if (motionEntityState == 'on') 
                        handleMotionDetected();
                    return;
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

    function handleMotionDetected() {
        const projection = window.projectionMapper;
        if (projection && typeof projection.isTriggering === 'function' && projection.isTriggering()) {
            console.log('Motion detected! Video is already playing');
            showMotionDetected();
            return;
        }

        console.log('Motion detected! Triggering projection.');
        showMotionDetected();
        if (projection && typeof projection.trigger === 'function') projection.trigger();
    }

    function handleLoopVideoSensorDetected() {
        console.log('Loop video sensor detected. Triggering loop video.');
        showMotionDetected('ha-led2');
        const projection = window.projectionMapper;
        if (projection && typeof projection.loopVideoTrigger === 'function') {
            projection.loopVideoTrigger();
        }
    }


    getElement('ha-status').addEventListener('click', openHomeAssistantSettings);
    getElement('ha-dialog-close').addEventListener('click', closeHomeAssistantSettings);
    getElement('ha-dialog-cancel').addEventListener('click', closeHomeAssistantSettings);
    getElement('ha-form').addEventListener('submit', saveHomeAssistantSettings);

    setHomeAssistantStatus(false, 'Home Assistant Disconnected');
    connectToHomeAssistant();
}