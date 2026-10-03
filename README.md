# Projection Mapper

A browser-based, two-screen projection mapping video player. The video is warped in real time with WebGL (a true four-corner homography, not a CSS stretch), so you can project onto any quadrilateral surface.

- **Screen 1 (output):** fullscreen WebGL player, sent to the projector.
- **Screen 2 (controller):** all controls and the corner designer. The output mirrors every change live.
- **100% client side:** plain HTML, CSS and JavaScript. No backend, no build step, no dependencies.

## Features

- Four independently draggable corners with a projective warp done in a fragment shader
- Loop video that plays continuously, plus a **trigger video** that crossfades in on demand
- Trigger fades the loop out and pauses it, plays the trigger from the start, then fades back and resumes the loop
- Press **T** (or the button) to trigger; press it again to skip back to the loop
- Test pattern (grid, crosshair, diagonals, corner labels) rendered through the same warp
- Save and load named mappings (stored in `localStorage`)
- Play, pause, restart, loop, seek bar, volume, mute
- Optional Home Assistant motion sensor trigger
- Hooks for your own code (see [Custom triggers](#custom-triggers))

## How it works

```
 Controller page (screen 2)                      Output page (screen 1)
 ┌────────────────────────────┐  BroadcastChannel ┌───────────────────────────┐
 │ controls + corner designer │ ───────────────▶ │ <video> -> WebGL texture  │
 │ holds the video files      │ ◀─────────────── │ homography shader -> canvas│
 └────────────────────────────┘      status       └───────────────────────────┘
```

The two pages talk through the browser's `BroadcastChannel`. It only connects pages of the same origin in the same browser profile, so no port is opened and nobody else can connect or send commands. Video files are passed directly from the controller to the output page.

## Quick start

ES modules need http, so serve the `public` folder as static files. Bind to localhost so it is only reachable from this machine:

```bash
cd public
python3 -m http.server 8080 --bind 127.0.0.1
```

Then:

1. Open <http://localhost:8080/> on screen 2 (the controller).
2. Click **Open Output Screen**, drag that window to the projector and **click it once**. This enters fullscreen and enables audio. `F` toggles fullscreen.
3. **Load Loop Video** and **Load Trigger Video** on the controller.
4. Drag the four orange corners in the designer until the image fits your surface. Use **Test Pattern** and **Grid** to help.
5. **Save Mapping** to keep it. Pick it from the dropdown and press **Load Mapping** later.

Any static host works too (GitHub Pages, nginx, etc.). Opening `index.html` straight from disk does not work because browsers block ES modules on `file://`.

## Controls

| Control | Action |
| --- | --- |
| Load Loop Video / Load Trigger Video | Pick local video files (MP4, WebM, MOV if your browser decodes it) |
| Trigger / Skip (T) | Start the trigger video; press again to skip back to the loop |
| Test Pattern | Show the alignment pattern on the output |
| Grid | Show guide lines in the designer |
| Reset Mapping | Put the corners back to the default rectangle |
| Play / Restart / Loop / seek bar | Control the loop video |
| Mute / volume | Applies to both videos |
| Save / Load Mapping | Named mappings in `localStorage` |
| Open Output Screen | Opens the output window |
| Space | Play / pause the loop video |

The designer has the same aspect ratio as the output screen. It shows the quad outline and optional grid, not a live video preview.

## Trigger behaviour

1. The loop video fades out and the trigger video fades in (0.6 s by default).
2. When the fade-in finishes, the loop video pauses.
3. The trigger video plays once from the start. Every trigger restarts it.
4. When it ends (or you skip), the loop video resumes and the display fades back to it.

## Custom triggers

On the controller page, `window.projectionMapper` exposes:

```js
projectionMapper.trigger();        // (re)start the trigger video, always from the beginning
projectionMapper.toggleTrigger();  // same as pressing T: skip if showing, otherwise trigger
projectionMapper.skip();           // fade back to the loop video
projectionMapper.fadeTime = 1.5;   // crossfade length in seconds
projectionMapper.isTriggering();   // true while the trigger is fading in, playing or fading out
```

Or by event:

```js
window.dispatchEvent(new Event('projectionmapper:trigger'));
window.dispatchEvent(new Event('projectionmapper:toggle'));
```

## Home Assistant (optional)

Click **Home Assistant** on the controller and enter:

- WebSocket URL, e.g. `ws://homeassistant.local:8123/api/websocket`
- A long-lived access token
- The motion entity, e.g. `binary_sensor.front_motion`

When the entity changes from `off` to `on`, the trigger fires (unless one is already running). The settings, including the token, are stored in this browser's `localStorage`. Use `wss://` if the page is served over https.

## Project structure

```
public/
├── index.html        controller page (screen 2)
├── output.html       output page (screen 1)
├── style.css
├── image/            favicons and manifest
└── js/
    ├── controller.js controls, state, Home Assistant, API hooks
    ├── output.js     rendering loop, fade/trigger state machine
    ├── net.js        BroadcastChannel wrapper
    ├── webgl.js      WebGL renderer (homography shader, layer blending)
    ├── mapping.js    corner data and projective weights
    ├── controls.js   designer overlay and corner dragging
    ├── video.js      video element wrapper
    └── storage.js    localStorage helpers
```

## Notes and limitations

- Both pages must be in the same browser profile (not incognito vs. normal, not two different browsers), so they run on the same computer with a window on each monitor.
- Keep the controller open. It holds the video files and re-sends them if you reload the output page. After reloading the controller, load the videos again. Mapping, loop and volume are remembered.
- Browsers block audible autoplay until you interact with a page, which is why the output asks for one click. If sound is still blocked, the video starts muted.
- Developed and tested for Chromium browsers (Chrome, Edge). Firefox is not a target.
- Videos must be in a format the browser can decode. H.264 MP4 and WebM are safest.

## Security

- No server, no listening port. `BroadcastChannel` is limited to same-origin pages in the same browser profile.
- Serve with `--bind 127.0.0.1` so the static files are only available locally.
- The Home Assistant token lives in `localStorage` on the controller. Treat that browser profile accordingly.