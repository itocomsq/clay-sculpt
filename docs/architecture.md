# Architecture — Clay Sculpt

> *What* and *how*. For *why the app exists* and product behavior, see
> [`specs/clay-sculpt.md`](specs/clay-sculpt.md).

## Overview

A zero-build static site. `index.html` carries **markup only**; styling lives in
`css/styles.css`; all logic is split into focused ES modules under `js/`, loaded
through a single module entry point.

```
clay-sculpt/
├ index.html          # markup only — no inline <style>, no inline on* handlers
├ manifest.json       # PWA manifest
├ css/
│  └ styles.css        # all styling (incl. modal + panel)
└ js/
   ├ main.js          # entry point: wires everything, runs the render loop
   ├ scene.js         # renderer, scene, camera, lights, shared raycaster, resize
   ├ geometry.js      # buildIcosphere() — pure mesh+adjacency generator
   ├ clay.js          # the clay model: geometry + physics buffers, create/reset
   ├ sculpt.js        # brush state + force injection (push/pull/smooth)
   ├ physics.js       # viscoelastic step + material presets
   ├ pointer.js       # mouse / touch / orbit + brush cursor
   ├ hands.js         # MediaPipe hand tracking + 3D depth + gestures
   └ ui.js            # DOM wiring: buttons, sliders, presets, modal, calibrate
```

The CDN scripts (Three.js, MediaPipe) are classic `<script>` tags that run before
the module entry, so the `THREE` / `Hands` / `Camera` globals are defined by the
time any module executes.

## Module responsibilities

| Module | Owns | Exports (key) |
|--------|------|---------------|
| `scene.js` | renderer, scene, camera, lights, `raycaster`, canvas refs | `scene`, `camera`, `renderer`, `raycaster`, `canvas3d`, `container`, `resize()` |
| `geometry.js` | icosphere generation + adjacency table | `buildIcosphere(radius, subdivisions)` |
| `clay.js` | `clay` state object (`geometry`, `mesh`, `vel`, `rest`) | `clay`, `createMesh()`, `resetMesh()` |
| `sculpt.js` | `brush` state, falloff curve, force injection | `brush`, `setTool()`, `falloff()`, `sculptAt()` |
| `physics.js` | `PHYS`, `PRESETS`, the per-frame sim | `PHYS`, `PRESETS`, `applyPreset()`, `physicsStep()`, `smoothPass()` |
| `pointer.js` | orbit state, brush cursor, pointer events | `cursorMesh`, `initPointer()` |
| `hands.js` | MediaPipe pipeline, depth model, calibration, gestures | `DEPTH_CFG`, `startCamera()`, `startCalibration()` |
| `ui.js` | all DOM event wiring | `initUI()` |
| `main.js` | composition root + render loop | — |

## State ownership (no globals leak across modules)

ES module bindings are read-only for importers, so shared **mutable** state is held
in exported **objects** whose fields are mutated in place:

- `clay` (in `clay.js`) — `createMesh()` reassigns its fields; every other module
  reads `clay.geometry` / `clay.mesh` / `clay.vel` / `clay.rest` live, so a RESET
  is picked up everywhere with no re-wiring.
- `brush` (in `sculpt.js`) — sliders write `brush.radius` etc.; `hands.js`
  temporarily overrides `brush.radius` per joint and restores it.
- `PHYS` (in `physics.js`) and `DEPTH_CFG` (in `hands.js`) — mutated by sliders and
  presets.

This replaces the original ~30 top-level globals while keeping the same single
shared-instance semantics.

## Data flow (per frame)

```
pointer / hands ──inject force──▶ sculptAt() ──writes──▶ clay.vel / clay.rest
                                                              │
main.animate() ─▶ physicsStep() ─reads vel,rest, writes──▶ clay.geometry.position
                                                              │
                ─▶ renderer.render(scene, camera) ◀───────────┘
```

- **Input → force**: `pointer.js` (mouse ray) and `hands.js` (joint penetration /
  pinch) both call `sculptAt()`, which adds to the velocity buffer (push/pull) or
  the rest buffer (smooth/grab) rather than moving vertices directly.
- **Force → motion**: `physicsStep()` integrates velocity, applies neighbor springs
  + rest restoration + damping + plasticity, and writes the position buffer.
- **Motion → pixels**: the render loop draws the updated mesh.

## Dependency graph (acyclic)

```
main → scene, clay, physics, pointer, hands, ui
clay → scene, geometry
sculpt → clay
physics → clay
pointer → scene, clay, sculpt
hands → scene, clay, sculpt, pointer (cursorMesh)
ui → sculpt, clay, physics, hands
```

`hands.js` depends on `pointer.js` only to hide the brush cursor while a hand is
tracked; the reverse dependency does not exist, so there are no cycles.

## Conventions

- All DOM event wiring lives in `ui.js` and `*.initX()` functions — **no inline
  `on*` attributes** in `index.html`.
- Buttons declare intent via `data-*` attributes (`data-tool`, `data-preset`,
  `data-action`); `ui.js` binds them.
- Sliders are bound from a single declarative table in `ui.js`.
