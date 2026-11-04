# Projection Mapper

A browser-based tool for **projection mapping videos onto physical surfaces using a projector**.

This project was made for my **Halloween front-door projection**, allowing videos to be mapped onto the door and triggered to create spooky effects for visitors.

Adjust the projection using four draggable corners, play looping and trigger videos, and optionally connect to Home Assistant for motion-triggered playback.

Built with HTML, CSS, JavaScript, and WebGL. No build step or backend required.

**Disclosure:** This project was developed using AI

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
| Load Trigger video 1 / 2 | Select either trigger video |
| Trigger 1 / 2 (`1` / `2`) | Play the corresponding trigger video |
| Test Pattern | Display a pattern for alignment |
| Mirror Video | Flip videos horizontally |
| Rotate Video | Rotate videos in 90° steps |
| Rotate Mapping | Rotate the mapping grid to match the projector orientation |
| Play / Restart | Play or restart the main video |
| Loop | Enable or disable looping |
| Transparent Background | Make black areas of the trigger video transparent |
| Video Delay | Set a delay for the trigger video |
| Reset All | Restore the default mapping and video orientation |

You can also adjust playback position, volume, and mute settings. Mapping changes are saved automatically.

### Trigger Playback

When a trigger is activated:

1. The main video pauses.
2. The trigger video fades in and plays from the beginning.
3. The trigger video plays over the paused main video.
4. When the trigger ends or is skipped, the main video resumes.

## Home Assistant (Optional)

Connect Home Assistant to trigger videos automatically using sensors.

**Required settings:**

- WebSocket URL, e.g. `ws://homeassistant.local:8123/api/websocket`
- Long-lived access token
- Entity for Trigger video 1, e.g. `binary_sensor.front_motion`

**Optional:** Configure a second entity to play Trigger video 2.

**Optional:** Configure a second sensor to play the main video once when triggered.
This will allow you to only play the video when visitors arrive, instead of looping it continuously. This is useful for Halloween projections, so the projection stays idle until someone approaches the door.

When the sensor changes from off to on, the main video plays once after its configured delay and then holds on its first frame until triggered again.

When a motion sensor changes from `off` to `on`, its corresponding trigger video plays unless another trigger is already running. The optional main-video sensor plays the main video once.

Settings are saved in your browser.

## Project Structure

```text
.
├── index.html           Controller
├── output.html          Fullscreen projector output
├── style.css            Styling
├── js/
│   ├── controller.js    Controller and playback controls
│   ├── output.js        Fullscreen rendering
│   ├── webgl.js         Video warping
│   ├── mapping.js       Mapping and calibration
│   ├── controls.js      Corner adjustment
│   ├── video.js         Video playback
│   ├── net.js           Communication between pages
│   ├── storage.js       Saved settings
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
- Controller and output communicate using `BroadcastChannel`, sharing media between pages within the browser.
