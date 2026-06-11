// Three.js scene graph, camera, renderer, lights and the shared raycaster.
// THREE is a global loaded from the CDN <script> before this module runs.

export const canvas3d = document.getElementById('three-canvas');
export const container = document.getElementById('canvas-container');

export const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1410);
scene.fog = new THREE.Fog(0x1a1410, 10, 30);

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 7);

// Clay-like lighting: warm ambient + key (shadow) + cool fill + warm rim.
const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.2);
keyLight.position.set(3, 5, 4);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.3);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffe8c0, 0.5);
rimLight.position.set(0, -3, -4);
scene.add(rimLight);

// Shared between pointer picking and hand-tracking surface intersection.
export const raycaster = new THREE.Raycaster();

export function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
