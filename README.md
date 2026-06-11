# Clay Sculpt 🏺

Hand-tracking 3D clay sculpting in your browser.

**▶ [Try it live](https://YOUR-USERNAME.github.io/clay-sculpt/)**

## How to use

| Input | Action |
|-------|--------|
| Left drag (mouse) | Sculpt |
| Right drag (mouse) | Rotate camera |
| Scroll | Zoom |
| Touch surface (hand) | Push |
| Move while touching (hand) | Sculpt |
| Pinch thumb+index (hand) | Grab & pull |

## Material presets

- **CLAY** — stays deformed, low elasticity
- **SLIME** — wiggles, medium elasticity
- **RUBBER** — springs back completely

## Hand tracking setup

1. Allow camera access when prompted
2. Press **CALIBRATE** while holding your hand at your preferred sculpting distance
3. Start sculpting!

## Deploy to GitHub Pages

1. Create a new repository
2. Upload all files
3. Go to Settings → Pages → Source: main branch
4. Your app is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`

## Tech stack

- [Three.js r128](https://threejs.org/) — 3D rendering (MIT)
- [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands) — hand tracking (Apache-2.0)
- Icosphere mesh with viscoelastic physics simulation

No build step — Three.js and MediaPipe load from CDN as globals, and the app code
is plain ES modules served as static files.

## Project structure

```
index.html        markup only
css/styles.css    all styling
js/
  main.js         entry point + render loop
  scene.js        renderer, camera, lights, raycaster
  geometry.js     icosphere generator
  clay.js         clay model (mesh + physics buffers)
  sculpt.js       brush state + force injection
  physics.js      viscoelastic step + presets
  pointer.js      mouse / touch / orbit + brush cursor
  hands.js        MediaPipe hand tracking + 3D depth + gestures
  ui.js           DOM wiring (buttons, sliders, presets, modal)
docs/
  specs/clay-sculpt.md   behavior spec (source of truth)
  architecture.md        module map + data flow
```

## Develop locally

ES modules require HTTP (not `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## License

MIT
