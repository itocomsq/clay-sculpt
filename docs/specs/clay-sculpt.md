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
- Warm clay material: `MeshStandardMaterial`, color `#e09060` (vivid
  terracotta), roughness `0.8`.
- Lighting: ambient + key (shadow-casting) + fill + rim, tuned for a clay look.
- Background and fog color `#241733` (deep plum — playful contrast against the
  warm clay).
- Camera: perspective, FOV `45`, orbits the origin at radius `[3, 15]`.
- **UI language is Japanese** (tools, status, hints, help). Tool/preset buttons
  carry per-item accent colors (push=coral, pull=teal, smooth=lavender).

---

## 3. Controls

### 3.1 Mouse / touch (always available)

| Input | Action |
|-------|--------|
| Left drag | Sculpt with the active tool at the ray hit point |
| Right drag | Orbit the camera (azimuth + polar, polar clamped to `[0.1, π−0.1]`) |
| Scroll wheel | Zoom (orbit radius clamped to `[3, 15]`) |
| 1-finger drag | Sculpt with the active tool |
| 2-finger drag | Orbit the camera |
| 2-finger pinch | Zoom |

Once a two-finger gesture starts, sculpting is suppressed until all fingers lift
(so releasing one finger leaves no accidental dent).

On load and on viewport resize, the camera auto-fits so the whole clay body stays
on screen (the limiting dimension on portrait phones is width). Auto-fit stops
once the user zooms manually (wheel or pinch), to respect their chosen framing.

A translucent wireframe **brush cursor** follows the pointer over the clay surface
and is scaled to the current brush radius. It is hidden when the pointer leaves the
surface and while hand mode is active.

### 3.2 Tools

| Tool (label) | Effect |
|------|--------|
| `push`（押す） | Inject velocity along the camera→hit ray direction (dent inward) |
| `pull`（引く） | Inject velocity along the surface normal (pull outward) |
| `smooth`（ならす） | Bake the current deformed position into the rest position (freezes the shape locally) |
| リセット | Rebuild a fresh sphere (discards all deformation) |

Exactly one of 押す/引く/ならす is active at a time; the active button is
highlighted in its own accent color. Selecting a tool does not clear the
camera-toggle button's active state.

### 3.3 Brush parameters (sliders)

| Param (label) | Range | Default | Meaning |
|-------|-------|---------|---------|
| 半径 | 0.1–1.5 | 0.6 | Influence radius of the brush |
| 強さ | 0.01–0.15 | 0.04 | Force magnitude injected per step |
| ぼかし | 1–5 | 2.5 | Exponent of the distance falloff curve |

### 3.4 Panel & camera preview

- The settings panel (⚙ 設定) is **collapsed by default** to a conspicuous pill
  (accent border + glow) so the canvas stays clear; tapping it expands the
  sliders (ブラシ / 素材 / 手の奥行き).
- The webcam **preview is hidden by default** (privacy). A **カメラ** button in
  the header slides the preview in/out. Hiding the preview does **not** affect
  hand tracking — the `<video>` element stays in the DOM and keeps feeding
  MediaPipe.
- When shown, the preview displays **only the tracked hand skeleton**
  (「ハンドキャプチャ」) on a dark background, never the raw camera image. The
  `<video>` is kept playing (opacity 0) because MediaPipe still needs its
  frames.

### 3.5 Calibration button

Calibration is the single most important hand-mode action, so it is **not**
buried in the settings panel: a large gradient button（✋ 手の位置あわせ）sits
bottom-center of the canvas. It is hidden until the camera becomes active,
**pulses** until the first successful calibration, and shows guidance/status
text beneath it (idle hint → sampling countdown → success/failure).

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
overlay on the mini camera preview (hidden by default — see §3.4) and as a **3D
skeleton** (21 joint spheres + 23
bones) inside the scene. Hand 0 is warm-toned, hand 1 is cool-toned.

### 5.1 Depth model

MediaPipe gives 2D-normalized landmarks plus a relative `z`. World depth for each
joint is reconstructed from:

1. A dynamic base distance = camera→sphere near-surface, so the calibrated hand
   position always lands "just inside" the surface regardless of zoom.
2. `baseOffset` — fixed offset from that surface (positive = deeper). The default
   is **negative**: the calibrated neutral hand hovers *in front of* the surface,
   so touching the clay requires reaching forward — the clay is "over there",
   not already enveloping the hand.
3. Apparent hand size mapped through the **reciprocal law**
   `gain × (1 − 1/handScale)`. Apparent size is inversely proportional to
   physical distance, so this gives equal world motion for equal physical motion
   near and far (a linear map is over-sensitive near, under-sensitive far).
4. Per-joint relative `z` (`lm.z − wrist.z`) times `relZGain`.

Depth config defaults: `baseOffset −0.8`, `gain 4.0`, `relZGain 3.0`, `scaleEMA 0.45`
(EMA smoothing of hand scale — light enough that depth does not visibly lag).
`baseOffset`, `gain`, `relZGain` are slider-tunable.

The skeleton has a **constant world size**: the joint spread is normalized
around the wrist by `refDist / (handScale × wristDist)` (clamped to
`[0.25, 2.0]`), cancelling both the larger apparent size and the deeper
projection of a near hand. Moving the hand toward the camera reaches deeper
into the scene — it does not enlarge the hand. Joint display spheres and push
contact radii are likewise constant.

### 5.2 Calibration

Pressing **✋ 手の位置あわせ** (see §3.5) samples the first hand's
wrist→middle-knuckle size for 2 seconds and takes the **median** as the
reference size (`handScale = 1.0`). Status text below the button reports
sampling progress（はかってます… N秒）, success（OK！この距離が基準になりました）,
or failure（手が見つかりませんでした — fewer than 5 samples）. On the first
success the button stops pulsing and switches to a quiet style.

### 5.3 Interactions

| Gesture | Effect |
|---------|--------|
| Joint touches the clay | **Positional collision**: vertices inside a joint's sphere collider are projected onto the collider surface and their into-collider velocity component is cancelled. The clay conforms to the hand's shape, rests against a stationary hand (it does not keep flowing away), and plasticity makes the imprint persist. |
| Pinch (thumb tip↔index tip) | Grab the nearest surface vertex; while held, pull a lump toward the pinch midpoint in 3D. Release on un-pinch. |

**Pinch detection** is scale-invariant: the thumb↔index distance is divided by
the current hand size (wrist→middle-knuckle), so the same physical finger gap
triggers at any distance from the camera. It has hysteresis — pinch starts when
the ratio drops below `0.38` and releases only above `0.60` — so a held grab
does not flicker off from tracking jitter.

**Grab acquisition** retries every frame while the pinch is held: pinching in
the air and then moving toward the clay still grabs. The pinch midpoint must be
within `1.1` world units of the surface to acquire.

**Grab pull**: the neighborhood radius is `0.85` with a gentle falloff
`(1 − d/r)^1.5` (wider and softer than the brush falloff), pull strength
`0.55 ×` distance, capped at `0.2` per frame — a pinch visibly lifts a lump of
clay, not a single point.

**Feedback**: the thumb/index joint spheres brighten when a pinch is detected
and glow (emissive) while actually grabbing. Losing hand tracking drops any
active pinch/grab immediately.

Contact joints: wrist + 5 fingertips + the 5 joints just below the tips (so a
finger plows through clay along its length, not only at the tip). Collider
radii: tip `0.16`, below-tip `0.13`, wrist `0.30`. The projection is softened by
a per-frame stiffness factor `0.6`, so contact reads as viscous clay rather
than a hard shell. Pinch and contact response are mutually exclusive per hand
(grabbing suppresses contact for that hand).

---

## 6. Camera lifecycle & degradation

`startCamera()` requests `getUserMedia`. Status text reflects state:

| State | Status text |
|-------|-------------|
| Connecting | `カメラ: 接続中...` |
| Active | `カメラ: オン` (green) — also reveals the calibration button (§3.5) |
| API missing | `カメラ: 非対応（マウスモード）` |
| No device | `カメラ: 見つかりません（マウスモード）` |
| Permission denied | `カメラ: 許可されていません（マウスモード）` |
| MediaPipe init throws | `カメラ: 利用不可（マウスモード）` |

The mode badge shows `✋ ハンドモード` or `🖱 マウスモード` accordingly. **No
camera failure may break mouse sculpting.**

---

## 7. Known issues / non-goals

- **`manifest.json` references `icon-192.png` / `icon-512.png`** which are not in
  the repo. PWA install will lack icons until they are added.
- No persistence: refreshing the page resets the clay.

Resolved in the 2026-06 UI overhaul: the inert `Volume` slider was removed
(control and `volumePreserve` field), and the dead code carried over from the
original (`smoothPass()`, `detectHandPose()`, `lmToSurface()`) was deleted.

---

## 8. Tech constraints

- **No build step.** Plain ES modules served as static files.
- Three.js **r128** and MediaPipe Hands are loaded from CDN as **globals**
  (`THREE`, `Hands`, `Camera`, `drawConnectors`, `drawLandmarks`). CDN versions are
  pinned to avoid breaking changes.
- Deploy = push to `main`, serve via GitHub Pages.

> License note: Three.js (MIT) and MediaPipe (Apache-2.0). This project is MIT.
