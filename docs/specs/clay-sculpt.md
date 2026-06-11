# Spec — Clay Sculpt

> Hand-tracking 3D clay sculpting that runs entirely in the browser.
> Zero build step; deployable to GitHub Pages by uploading static files.

This spec documents the **observable behavior** of the application. The
implementation (see [`../architecture.md`](../architecture.md)) must conform to
this spec. When code and spec disagree, the spec wins unless the user says
otherwise.

---

## 1. Goal

Let a user shape a virtual lump of clay in real time using either a **mouse/touch
pointer** or their **bare hands** via webcam hand tracking. The clay behaves as a
**viscoelastic** material: it deforms under force, springs/jiggles, and (depending
on the material preset) either keeps its new shape or returns to a sphere.

The app must remain fully usable with the mouse alone — the camera/hand path is a
progressive enhancement and every camera failure mode degrades gracefully to
"MOUSE MODE".

---

## 2. Scene

- A single clay body: an **icosphere** of radius `2`, subdivision level `5`
  (~10,242 vertices), uniformly distributed so deformation is stable everywhere
  (a UV `SphereGeometry` would pinch at the poles).
- Warm clay material: `MeshStandardMaterial`, color `#c8a070`, roughness `0.85`.
- Lighting: ambient + key (shadow-casting) + fill + rim, tuned for a clay look.
- Background and fog color `#1a1410`.
- Camera: perspective, FOV `45`, orbits the origin at radius `[3, 15]`.

---

## 3. Controls

### 3.1 Mouse / touch (always available)

| Input | Action |
|-------|--------|
| Left drag | Sculpt with the active tool at the ray hit point |
| Right drag | Orbit the camera (azimuth + polar, polar clamped to `[0.1, π−0.1]`) |
| Scroll wheel | Zoom (orbit radius clamped to `[3, 15]`) |
| Touch drag | Sculpt (single touch) |

A translucent wireframe **brush cursor** follows the pointer over the clay surface
and is scaled to the current brush radius. It is hidden when the pointer leaves the
surface and while hand mode is active.

### 3.2 Tools

| Tool | Effect |
|------|--------|
| `PUSH` | Inject velocity along the camera→hit ray direction (dent inward) |
| `PULL` | Inject velocity along the surface normal (pull outward) |
| `SMOOTH` | Bake the current deformed position into the rest position (freezes the shape locally) |
| `RESET` | Rebuild a fresh sphere (discards all deformation) |

Exactly one of PUSH/PULL/SMOOTH is active at a time; the active button is
highlighted.

### 3.3 Brush parameters (sliders)

| Param | Range | Default | Meaning |
|-------|-------|---------|---------|
| Radius | 0.1–1.5 | 0.6 | Influence radius of the brush |
| Strength | 0.01–0.15 | 0.04 | Force magnitude injected per step |
| Falloff | 1–5 | 2.5 | Exponent of the distance falloff curve |
| Volume | 0–0.8 | 0.3 | **Currently inert** — wired to UI but not read by the sim (see §7) |

---

## 4. Material (viscoelastic physics)

Every frame, a physics step turns injected velocity into motion, pulls each vertex
toward its neighbors (surface tension) and toward its rest position (elasticity),
applies damping, and — past a threshold — lets the rest position follow
(plasticity → the shape stays).

### 4.1 Tunable parameters

| Param | Range | Default | Meaning |
|-------|-------|---------|---------|
| Spring (`springK`) | 1–20 | 8 | Neighbor spring; higher = surroundings follow more |
| Elastic (`restK`) | 0–15 | 4 | Restoring force toward rest; higher = springs back |
| Damping | 0.6–0.99 | 0.82 | Lower = more jiggle |
| Plastic (`plasticity`) | 0–0.3 | 0.06 | Higher = shape sets faster |

Fixed (not user-tunable): `plasticThreshold = 0.015`, `maxVel = 0.25`, `dt = 1/60`.

### 4.2 Presets

| Preset | springK | restK | damping | plasticity | Feel |
|--------|---------|-------|---------|------------|------|
| CLAY | 6 | 1.5 | 0.78 | 0.15 | Holds shape, doesn't rebound |
| SLIME | 3 | 5 | 0.92 | 0.02 | Loose, wobbly |
| RUBBER | 15 | 12 | 0.85 | 0.0 | Snaps fully back |

Applying a preset overwrites the four tunable params **and** re-syncs the four
material sliders to match.

---

## 5. Hand tracking (progressive enhancement)

Uses MediaPipe Hands (2 hands max). Each detected hand is drawn both as a 2D
overlay on the mini camera preview and as a **3D skeleton** (21 joint spheres + 23
bones) inside the scene. Hand 0 is warm-toned, hand 1 is cool-toned.

### 5.1 Depth model

MediaPipe gives 2D-normalized landmarks plus a relative `z`. World depth for each
joint is reconstructed from:

1. A dynamic base distance = camera→sphere near-surface, so the calibrated hand
   position always lands "just inside" the surface regardless of zoom.
2. `baseOffset` — fixed offset from that surface (positive = deeper).
3. Apparent hand size relative to the calibrated reference, times `gain`.
4. Per-joint relative `z` (`lm.z − wrist.z`) times `relZGain`.

Depth config defaults: `baseOffset 0.3`, `gain 3.2`, `relZGain 3.0`, `scaleEMA 0.7`
(EMA smoothing of hand scale). `baseOffset`, `gain`, `relZGain` are slider-tunable.

### 5.2 Calibration

Pressing **CALIBRATE** samples the first hand's wrist→middle-knuckle size for 2
seconds and takes the **median** as the reference size (`handScale = 1.0`). Status
text reports sampling progress, success (`Calibrated (ref=…)`), or
`Failed: hand not detected` (fewer than 5 samples).

### 5.3 Interactions

| Gesture | Effect |
|---------|--------|
| Joint penetrates the clay | Inject force proportional to penetration depth, along the joint's motion direction (fallback: inward surface normal). Fingertips push harder than the palm. |
| Pinch (thumb tip↔index tip distance < 0.055) | Grab the nearest surface vertex; while held, pull a neighborhood toward the pinch midpoint in 3D. Release on un-pinch. |

Sculpt-relevant joints: wrist + 5 fingertips. Pinch and push are mutually exclusive
per hand (grabbing suppresses push for that hand).

---

## 6. Camera lifecycle & degradation

`startCamera()` requests `getUserMedia`. Status text reflects state:

| State | Status text |
|-------|-------------|
| Connecting | `CAMERA: CONNECTING...` |
| Active | `CAMERA: ACTIVE` (green) |
| API missing | `CAMERA: NOT SUPPORTED (MOUSE MODE)` |
| No device | `CAMERA: NOT FOUND (MOUSE MODE)` |
| Permission denied | `CAMERA: DENIED (MOUSE MODE)` |
| MediaPipe init throws | `CAMERA: UNAVAILABLE (MOUSE MODE)` |

The mode badge shows `HAND MODE` or `MOUSE MODE` accordingly. **No camera failure
may break mouse sculpting.**

---

## 7. Known issues / non-goals (carried over from current behavior)

These are documented as-is so the refactor preserves behavior; fixing them is out
of scope for the refactor itself:

- **`Volume` slider is inert** — `volumePreserve` is set from the UI but never read
  by the simulation. Kept for parity; a future spec change should either implement
  volume preservation or remove the control.
- **Dead code** — `smoothPass()` (physics.js), `detectHandPose()` and
  `lmToSurface()` (hands.js) exist but are never called. Preserved during refactor
  (not deleted) and flagged here.
- **`manifest.json` references `icon-192.png` / `icon-512.png`** which are not in
  the repo. PWA install will lack icons until they are added.
- No persistence: refreshing the page resets the clay.

---

## 8. Tech constraints

- **No build step.** Plain ES modules served as static files.
- Three.js **r128** and MediaPipe Hands are loaded from CDN as **globals**
  (`THREE`, `Hands`, `Camera`, `drawConnectors`, `drawLandmarks`). CDN versions are
  pinned to avoid breaking changes.
- Deploy = push to `main`, serve via GitHub Pages.

> License note: Three.js (MIT) and MediaPipe (Apache-2.0). This project is MIT.
