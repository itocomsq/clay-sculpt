// Mouse / touch input: sculpting, camera orbit, zoom, and the brush cursor.
// cursorMesh is exported so hands.js can hide it while a hand is tracked.

import { scene, camera, canvas3d, raycaster } from './scene.js';
import { clay } from './clay.js';
import { brush, sculptAt } from './sculpt.js';

const mouse = new THREE.Vector2();
let isMouseDown = false;
let isRightDown = false;
let lastMouse = { x: 0, y: 0 };
let orbitTheta = 0, orbitPhi = Math.PI / 2;
let orbitRadius = 7;

// Translucent wireframe brush cursor on the clay surface.
const cursorGeo = new THREE.SphereGeometry(1, 16, 16);
const cursorMat = new THREE.MeshBasicMaterial({
  color: 0xffcc66,
  transparent: true,
  opacity: 0.15,
  wireframe: true,
});
export const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
scene.add(cursorMesh);

function getWorldPos(clientX, clientY) {
  const rect = canvas3d.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(clay.mesh);
  return hits.length > 0 ? hits[0].point : null;
}

function updateCamera() {
  camera.position.x = orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
  camera.position.y = orbitRadius * Math.cos(orbitPhi);
  camera.position.z = orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
  camera.lookAt(0, 0, 0);
}

export function initPointer() {
  canvas3d.addEventListener('mousedown', e => {
    if (e.button === 0) isMouseDown = true;
    if (e.button === 2) isRightDown = true;
    lastMouse = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  });

  canvas3d.addEventListener('mousemove', e => {
    const wp = getWorldPos(e.clientX, e.clientY);
    if (wp) {
      cursorMesh.position.copy(wp);
      cursorMesh.scale.setScalar(brush.radius);
      cursorMesh.visible = true;
    } else {
      cursorMesh.visible = false;
    }

    if (isRightDown) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      orbitTheta -= dx * 0.005;
      orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitPhi + dy * 0.005));
      updateCamera();
    } else if (isMouseDown && wp) {
      // The camera→hit ray direction is the force direction.
      sculptAt(wp, raycaster.ray.direction, brush.strength);
    }

    lastMouse = { x: e.clientX, y: e.clientY };
  });

  canvas3d.addEventListener('mouseup', e => {
    if (e.button === 0) isMouseDown = false;
    if (e.button === 2) isRightDown = false;
  });
  canvas3d.addEventListener('contextmenu', e => e.preventDefault());

  canvas3d.addEventListener('wheel', e => {
    orbitRadius = Math.max(3, Math.min(15, orbitRadius + e.deltaY * 0.01));
    updateCamera();
    e.preventDefault();
  }, { passive: false });

  canvas3d.addEventListener('touchstart', e => {
    isMouseDown = true;
    const t = e.touches[0];
    lastMouse = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  canvas3d.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const wp = getWorldPos(t.clientX, t.clientY);
    if (isMouseDown && wp) sculptAt(wp, raycaster.ray.direction, brush.strength);
    lastMouse = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  canvas3d.addEventListener('touchend', () => { isMouseDown = false; });
}
