// Viscoelastic simulation: turns injected velocity into motion via neighbor
// springs, rest restoration, damping and plasticity. Runs every frame.

import { clay } from './clay.js';

// Material feel. springK/restK/damping/plasticity are slider-tunable; the rest
// are fixed (see spec §4).
export const PHYS = {
  springK: 8.0,    // neighbor spring: higher = surroundings follow
  restK: 4.0,      // restoring force toward rest: higher = springs back
  damping: 0.82,   // lower = more jiggle
  plasticity: 0.06, // higher = shape sets faster
  plasticThreshold: 0.015,
  maxVel: 0.25,
  dt: 1 / 60,
};

export const PRESETS = {
  clay: { springK: 6, restK: 1.5, damping: 0.78, plasticity: 0.15 }, // holds shape
  slime: { springK: 3, restK: 5, damping: 0.92, plasticity: 0.02 },  // loose, wobbly
  rubber: { springK: 15, restK: 12, damping: 0.85, plasticity: 0.0 }, // snaps back
};

// Overwrites the tunable params. Slider re-sync is the UI layer's job (ui.js).
export function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return null;
  Object.assign(PHYS, p);
  return p;
}

export function physicsStep() {
  const { geometry, vel, rest } = clay;
  if (!vel || !rest) return;

  const pos = geometry.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const adj = geometry.userData.adjacency;
  if (!adj) return;

  const { springK, restK, damping, plasticity, plasticThreshold, maxVel, dt } = PHYS;
  const snap = new Float32Array(arr);
  let anyMotion = false;

  for (let i = 0; i < count; i++) {
    const px = snap[i * 3], py = snap[i * 3 + 1], pz = snap[i * 3 + 2];

    // Neighbor spring: pulled toward the average of adjacent vertices.
    const neighbors = adj[i];
    let ax = 0, ay = 0, az = 0;
    for (const j of neighbors) {
      ax += snap[j * 3]; ay += snap[j * 3 + 1]; az += snap[j * 3 + 2];
    }
    const nlen = neighbors.length;
    ax /= nlen; ay /= nlen; az /= nlen;

    // rest restoration + spring + damping
    let vx = (vel[i * 3] + ((ax - px) * springK + (rest[i * 3] - px) * restK) * dt) * damping;
    let vy = (vel[i * 3 + 1] + ((ay - py) * springK + (rest[i * 3 + 1] - py) * restK) * dt) * damping;
    let vz = (vel[i * 3 + 2] + ((az - pz) * springK + (rest[i * 3 + 2] - pz) * restK) * dt) * damping;

    const vlen = Math.hypot(vx, vy, vz);
    if (vlen > maxVel) { const s = maxVel / vlen; vx *= s; vy *= s; vz *= s; }

    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    arr[i * 3] = px + vx;
    arr[i * 3 + 1] = py + vy;
    arr[i * 3 + 2] = pz + vz;

    if (vlen > 0.0005) anyMotion = true;

    // Plasticity: once displacement exceeds the threshold, rest follows so the
    // new shape persists.
    const dRx = arr[i * 3] - rest[i * 3], dRy = arr[i * 3 + 1] - rest[i * 3 + 1], dRz = arr[i * 3 + 2] - rest[i * 3 + 2];
    const dRlen = Math.hypot(dRx, dRy, dRz);
    if (dRlen > plasticThreshold) {
      rest[i * 3] += dRx * plasticity;
      rest[i * 3 + 1] += dRy * plasticity;
      rest[i * 3 + 2] += dRz * plasticity;
    }
  }

  if (anyMotion) {
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}

// Laplacian smoothing pass (adjacency-based). Currently unused — retained from
// the original; see spec §7.
export function smoothPass(influences, strength) {
  const { geometry } = clay;
  const pos = geometry.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const adj = geometry.userData.adjacency;
  const snapshot = new Float32Array(arr);

  for (let i = 0; i < count; i++) {
    if (influences[i] < 0.001) continue;
    const neighbors = adj ? adj[i] : [];
    if (!neighbors.length) continue;

    let ax = 0, ay = 0, az = 0;
    for (const j of neighbors) {
      ax += snapshot[j * 3]; ay += snapshot[j * 3 + 1]; az += snapshot[j * 3 + 2];
    }
    ax /= neighbors.length; ay /= neighbors.length; az /= neighbors.length;

    const s = influences[i] * strength;
    arr[i * 3] += (ax - arr[i * 3]) * s;
    arr[i * 3 + 1] += (ay - arr[i * 3 + 1]) * s;
    arr[i * 3 + 2] += (az - arr[i * 3 + 2]) * s;
  }
}
