# Projection Mapper

A browser-based tool for **projection mapping videos onto physical surfaces** using a projector.

Adjust the projection by dragging four corners, play looping and trigger videos, and optionally connect to Home Assistant for motion-triggered playback.

Built with HTML, CSS, JavaScript, and WebGL. No build step or backend required.

**AI disclosure:** This project was developed with the help of GitHub Copilot.

## Features

- **Projection mapping** — adjust four corners to fit your surface.
- **Video playback** — play a looping video and trigger videos on demand.
- **Video effects** — rotate, mirror, and adjust video delays.
- **Test pattern** — align the projection with your physical surface.
- **Transparent background** — show the main video through black areas of the trigger video.
- **Home Assistant** — optionally trigger videos using motion sensors.
- **Automatic saving** — settings and mapping are saved in your browser.

## Quick Start

The app must run through a local web server. Opening `index.html` directly will not work.

1. Open a terminal in the project folder.
2. Start a local web server:

   ```bash
   python3 -m http.server 8080
   ```

3. Open [http://localhost:8080](http://localhost:8080).
4. Click the output connection indicator in the top-right corner to open the projector output.
5. Move the output window to your projector, click inside it, and enable fullscreen.

**Recommended:** Use Chrome or Edge for the best compatibility.

## How to Use

### Controller

Use the controller window to configure and control your projection.

| Control | Description |
|---|---|
| Load video | Select the main looping video |
| Load trigger video | Select the video played when triggered |
| Trigger (`T`) | Play the trigger video |
| Test Pattern | Display a pattern for alignment |
| Mirror Video | Flip videos horizontally |
| Rotate Video | Rotate videos in 90° steps |
| Rotate Mapping | Rotate the mapping grid to match the projector orientation |
| Play / Restart | Play or restart the main video |
| Loop | Enable or disable looping |
| Transparent Background | Make black areas of the trigger video transparent |
| Video Delay | Set a delay for the main or trigger video |
| Reset All | Restore the default mapping and video orientation |

You can also adjust playback position, volume, and mute settings. Mapping changes are saved automatically.

### Trigger Playback

When a trigger is activated:

1. The main video pauses.
2. The trigger video fades in and plays from the beginning.
3. The trigger video plays over the paused main video.
4. When the trigger ends or is skipped, the main video resumes.

The fade duration can be changed through the JavaScript API.

## Home Assistant (Optional)

Connect Home Assistant to trigger videos automatically using sensors.

**Required settings:**

- WebSocket URL, e.g. `ws://homeassistant.local:8123/api/websocket`
- Long-lived access token
- Motion sensor entity, e.g. `binary_sensor.front_motion`

**Optional:** Configure a second sensor to play the main video once when triggered.

When the motion sensor changes from `off` to `on`, the trigger video plays unless another trigger is already running. The optional main-video sensor plays the main video once after its configured delay.

Settings are saved in your browser.

## External Controls

The controller exposes a JavaScript API for triggering playback from other scripts or browser-based controls.

```javascript
window.projectionMapper.trigger();
window.projectionMapper.toggleTrigger();
window.projectionMapper.skip();
window.projectionMapper.fadeTime = 1.5;
window.projectionMapper.isTriggering();
```

You can also trigger playback using custom events:

```javascript
window.dispatchEvent(new Event('projectionmapper:trigger'));
window.dispatchEvent(new Event('projectionmapper:toggle'));
```

## Project Structure

```text
.
├── index.html          Controller
├── output.html         Fullscreen projector output
├── style.css           Styling
├── js/
│   ├── controller.js   Controller and playback controls
│   ├── output.js       Fullscreen rendering
│   ├── webgl.js        Video warping
│   ├── mapping.js      Mapping and calibration
│   ├── controls.js     Corner adjustment
│   ├── video.js        Video playback
│   ├── net.js          Communication between pages
│   ├── storage.js      Saved settings
│   └── homeassistant.js Home Assistant integration
├── package.json
└── README.md
```

## Notes

- Keep the controller window open while using the projector output.
- Both windows must use the same browser profile and origin.
- Audio may require clicking inside the output window before playback.
- H.264 MP4 and WebM are recommended video formats.
- Settings are stored in browser `localStorage` and are specific to that browser profile.
- Controller and output communicate using `BroadcastChannel`; media is shared between the two pages within the browser.

