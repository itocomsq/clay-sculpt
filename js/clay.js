// The clay model: the icosphere mesh plus the viscoelastic physics buffers.
//
// `clay` is a shared mutable singleton. createMesh() reassigns its fields, and
// every other module reads them live, so RESET propagates everywhere with no
// re-wiring.
//   vel:  per-vertex velocity (the source of the "wobble")
//   rest: per-vertex rest position, updated slowly by plasticity so shape stays

import { scene } from './scene.js';
import { buildIcosphere } from './geometry.js';

export const clay = {
  geometry: null,
  mesh: null,
  vel: null,
  rest: null,
};

export function createMesh() {
  if (clay.mesh) {
    scene.remove(clay.mesh);
    clay.geometry.dispose();
  }

  // subdivisions=5 → ~10,242 vertices, evenly distributed over the sphere.
  const geometry = buildIcosphere(2, 5);

  const posArr = geometry.attributes.position.array;
  const vel = new Float32Array(posArr.length); // all zero
  const rest = new Float32Array(posArr);        // initial position = rest

  const material = new THREE.MeshStandardMaterial({
    color: 0xe09060,
    roughness: 0.8,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  clay.geometry = geometry;
  clay.mesh = mesh;
  clay.vel = vel;
  clay.rest = rest;
}

export function resetMesh() {
  createMesh();
}
