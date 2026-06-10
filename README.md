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

- [Three.js r128](https://threejs.org/) — 3D rendering
- [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands) — hand tracking
- Icosphere mesh with viscoelastic physics simulation

## License

MIT
