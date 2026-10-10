# Projection Mapper

A browser-based projection-mapping tool for displaying a warped video on a physical surface using a projector. The app keeps a controller page and a fullscreen output page in sync and uses a WebGL homography transform to map the media onto a quadrilateral.

The project is entirely client-side: HTML, CSS, and JavaScript only. There is no backend or build step required for the app itself.

### Disclosure
This project was built using AI (GitHub copilot)

## What it does

- Warps the loop video and trigger video onto a four-corner mapped surface using WebGL
- Lets you drag the four corners in the controller UI to match your projection surface
- Shows a live test pattern for alignment when needed
- Crossfades between a looping background video and a trigger video
- Saves settings in browser localStorage
- Optional integration with Home Assistant motion events

## How the app is split

- Controller page: `index.html` and `js/controller.js`
  - Drag corners and edit mapping
  - Load loop/trigger media
  - Control playback, volume, and trigger state
  - Optional Home Assistant setup
- Output page: `output.html` and `js/output.js`
  - Fullscreen projector display
  - Receives media and commands from the controller
  - Renders the warped video in a fullscreen canvas

## Project structure

```text
.
├── index.html           Controller UI
├── output.html          Fullscreen output window
├── style.css            App styling
├── js/
│   ├── controller.js    Controller logic and UI state
│   ├── output.js        Output page render loop and commands
│   ├── net.js           BroadcastChannel connection layer
│   ├── webgl.js         WebGL renderer and shader-based warp
│   ├── mapping.js       Default calibration data and corner helpers
│   ├── controls.js      Corner designer and drag logic
│   ├── video.js         Video element wrapper around playback state
│   └── storage.js       LocalStorage persistence helpers
├── package.json
├── README.md
└── .git/
```

## Quick start

This app must be served over HTTP because it uses ES modules. The repo is a static site, so any local web server works.

Example using Python:

```bash
cd /path/to/ProjectionMapping
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open:

1. `http://localhost:8080/` on the main controller screen
2. Click `Open Output Screen` in the controller UI
3. Drag that output window to the projector and click it once to enable audio and fullscreen

> Opening the files directly with `file://` is not supported because browser module loading is blocked.

## Controller controls

The controller is the main UI for mapping and playback:

- Load Loop Video
- Load Trigger Video
- Trigger (`T`)
- Test Pattern
- Reset Mapping
- Play / Restart
- Loop toggle
- Seek bar and time display
- Mute and volume slider
- Open Output Screen
- Home Assistant settings

The overlay designer draws the quadrilateral and optional grid in the aspect ratio of the projector output, but it does not show a live media preview.

## Trigger behavior

The trigger flow implemented in the code is:

1. Loop video fades out
2. Trigger video fades in
3. Loop video pauses while trigger plays
4. Trigger restarts from the beginning each time it is triggered
5. Trigger ends or is skipped, then the loop resumes and fades back in

Default fade time is `0` seconds and can be changed from the controller API.

## Custom API hooks

The controller exposes a `window.projectionMapper` object for external control:

```js
window.projectionMapper.trigger();
window.projectionMapper.toggleTrigger();
window.projectionMapper.skip();
window.projectionMapper.fadeTime = 1.5;
window.projectionMapper.isTriggering();
```

There are also custom events:

```js
window.dispatchEvent(new Event('projectionmapper:trigger'));
window.dispatchEvent(new Event('projectionmapper:toggle'));
```

## Home Assistant integration

The app can optionally connect to Home Assistant using a websocket connection, to trigger the trigger video.

Required settings:

- WebSocket URL, for example `ws://homeassistant.local:8123/api/websocket` or `wss://homeassistant.local:8123/api/websocket`
- Long-lived access token
- Motion entity such as `binary_sensor.front_motion`

The app now prefers the secure websocket scheme when the page is running over HTTPS, but the URL can still be set manually to match your Home Assistant deployment. When the configured entity changes from `off` to `on`, the trigger fires unless one is already in progress. The settings are saved in browser localStorage.

## Storage and saved mappings

Mappings are saved in browser localStorage under the app namespace. The code stores:

- current mapping
- selected mapping name
- loop state
- volume
- Home Assistant settings

This means the controller remembers mapping, volume, and loop state between reloads on the same browser profile.

## Communication model

Controller and output communicate using `BroadcastChannel`:

This is same-origin and same-browser-profile only; it does not open a network port and it does not expose the app to other machines. Media files are transferred directly between pages using the browser message channel.

## Notes and limitations

- Both pages must be in the same browser profile and same origin.
- The controller should stay open; it owns the media files and resends them if the output reloads.
- Audio is only enabled after the user interacts with the output page; otherwise the page may start muted.
- Video compatibility depends on the browser codec support. H.264 MP4 and WebM are the safest options.
- The project is designed primarily for Chromium-based browsers such as Chrome and Edge.

## Security

- No server is required for the app itself.
- `BroadcastChannel` stays within the same browser profile and origin.
- If you enable Home Assistant, keep the access token in a trusted browser profile and avoid sharing the session.

## Starting from the repo root

This repo is intentionally a static front-end project. For local use, serve the repo root directly rather than a `public/` folder because the actual files live in the project root.
