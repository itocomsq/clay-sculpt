// Composition root: build the clay, wire input/UI, start the camera, run the
// render loop.

import { scene, camera, renderer, resize } from './scene.js';
import { createMesh } from './clay.js';
import { physicsStep } from './physics.js';
import { initPointer } from './pointer.js';
import { startCamera } from './hands.js';
import { initUI } from './ui.js';

createMesh();
initPointer();
initUI();
startCamera();
resize();
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  physicsStep();
  renderer.render(scene, camera);
}
animate();
