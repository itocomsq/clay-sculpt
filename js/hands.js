// MediaPipe hand tracking: reconstructs true 3D joint positions from 2D
// landmarks + relative depth, renders a 3D hand skeleton, and drives push/pinch
// sculpting. Hands, Camera, drawConnectors, drawLandmarks, HAND_CONNECTIONS are
// CDN globals.

import { scene, camera, raycaster } from './scene.js';
import { clay } from './clay.js';
import { cursorMesh } from './pointer.js';

const videoEl = document.getElementById('video');
const handCanvas = document.getElementById('hand-canvas');
const handCtx = handCanvas.getContext('2d');
const statusEl = document.getElementById('status');
const modeBadge = document.getElementById('mode-badge');

let handActive = false;

// Landmark roles.
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_MIDS = [3, 7, 11, 15, 19];
const PALM_POINTS = [0, 1, 5, 9, 13, 17];

// Sphere-collider radii for contact (spec §5.3). Kept close to the visible
// skeleton so the clay dents where the hand visually touches it.
const TIP_RADIUS = 0.16;
const MID_RADIUS = 0.13;
const PALM_RADIUS = 0.30;

// Wrist + tips + the joints just below the tips: a finger plows through clay
// along its length, not only at the tip.
const CONTACT_JOINTS = [0, ...FINGER_TIPS, ...FINGER_MIDS];

// Fraction of the penetration corrected per frame. 1.0 would be a hard shell;
// 0.6 converges in ~3 frames and reads as viscous clay.
const CONTACT_STIFFNESS = 0.6;

// 3D hand skeleton bones (one independent group per hand → two hands).
const HAND_CONNECTIONS_3D = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const handGroups = [0, 1].map(hi => {
  const group = new THREE.Group();
  scene.add(group);

  const joints = Array.from({ length: 21 }, (_, i) => {
    const r = FINGER_TIPS.includes(i) ? 0.055
      : PALM_POINTS.includes(i) ? 0.05 : 0.04;
    const geo = new THREE.SphereGeometry(r, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: hi === 0 ? 0xe8c090 : 0x90c8e8,
      roughness: 0.5, metalness: 0.1,
      transparent: true, opacity: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  });

  const boneMat = new THREE.LineBasicMaterial({
    color: hi === 0 ? 0xc8a070 : 0x70a0c8,
    transparent: true, opacity: 0.5,
  });
  const bones = HAND_CONNECTIONS_3D.map(([a, b]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(),
    ]);
    const line = new THREE.Line(geo, boneMat);
    group.add(line);
    return { line, a, b };
  });

  group.visible = false;
  return { group, joints, bones };
});

// ── Pinch / grab state ──
const grabState = [null, null];
const pinchState = [false, false];

// Pinch detection is relative to the current hand size, so it triggers at the
// same physical finger gap at any distance from the camera. Hysteresis
// (on < off) keeps a held pinch from flickering and dropping the grab.
const PINCH_ON = 0.38;
const PINCH_OFF = 0.60;

function isPinching(lm, handIdx) {
  const d = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  const size = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  const ratio = size > 1e-4 ? d / size : Infinity;
  pinchState[handIdx] = pinchState[handIdx] ? ratio < PINCH_OFF : ratio < PINCH_ON;
  return pinchState[handIdx];
}

const GRAB_CAPTURE = 1.1; // max pinch-midpoint → surface distance to acquire
const GRAB_RADIUS = 0.85; // neighborhood pulled along with the grabbed vertex
const GRAB_POWER = 0.55;
const GRAB_MAX_PULL = 0.2;

// Wider and gentler than the brush falloff so a pinch lifts a visible lump of
// clay rather than a single point.
function grabFalloff(d, r) {
  return d >= r ? 0 : Math.pow(1 - d / r, 1.5);
}

// EMA-smoothed depth scale per hand.
const smoothHandScale = [1.0, 1.0];

const SPHERE_R = 2.0;
const DEPTH_CFG = {
  baseOffset: -0.8, // offset from the surface (positive = deeper); negative
                    // default so the calibrated hand hovers in front of the clay
  gain: 4.0,        // world distance per unit of reciprocal hand scale
  relZGain: 3.0,    // amplification of per-joint relative depth (lm.z)
  scaleEMA: 0.45,   // depth smoothing — light, so depth does not visibly lag
};
export { DEPTH_CFG };

// ── Calibration: the hand size held at CALIBRATE becomes handScale = 1.0 ──
let handSizeRef = 0.18;
let calibrating = false;
let calibSamples = [];
let calibEndTime = 0;

export function startCalibration() {
  calibrating = true;
  calibSamples = [];
  calibEndTime = performance.now() + 2000;
  const el = document.getElementById('calib-status');
  if (el) el.textContent = '手をそのまま動かさないで…';
}

function feedCalibration(lm) {
  if (!calibrating) return;
  const sz = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  calibSamples.push(sz);

  const remaining = calibEndTime - performance.now();
  const el = document.getElementById('calib-status');

  if (remaining <= 0) {
    calibrating = false;
    if (calibSamples.length > 5) {
      calibSamples.sort((a, b) => a - b); // median is outlier-robust
      handSizeRef = calibSamples[Math.floor(calibSamples.length / 2)];
      if (el) el.textContent = 'OK！この距離が基準になりました ✨';
      // Stop the attention-pulse once calibrated.
      document.getElementById('btn-calib')?.classList.add('is-done');
    } else {
      if (el) el.textContent = '手が見つかりませんでした。カメラに手をかざしてもう一度';
    }
  } else {
    if (el) el.textContent = `はかってます… ${(remaining / 1000).toFixed(1)}秒`;
  }
}

function rawHandScale(lm) {
  const sz = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  return Math.max(0.4, Math.min(2.5, sz / handSizeRef));
}

// True 3D world position of a landmark. Moving the hand toward the camera
// (scale up) pushes the joint deeper into the scene (toward the sphere).
function lmToWorld3D(lm, idx, handScale) {
  const nx = 1 - lm[idx].x;
  const ny = lm[idx].y;
  raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);

  // Dynamic base distance: camera → sphere near-surface + offset, so the
  // calibrated position (handScale = 1.0) sits just inside the surface at any zoom.
  const camDist = camera.position.length();
  const surfaceDist = camDist - SPHERE_R;

  // lm.z is wrist-relative and more negative nearer the camera → nearer fingers
  // reach deeper in.
  const relZ = lm[idx].z - lm[0].z;
  // Reciprocal law: apparent size ∝ 1/distance, so (1 − 1/scale) gives equal
  // world motion for equal physical motion near and far (a linear map is
  // over-sensitive near, under-sensitive far).
  const dist = Math.max(0.3, surfaceDist + DEPTH_CFG.baseOffset
    + (1 - 1 / handScale) * DEPTH_CFG.gain
    - relZ * DEPTH_CFG.relZGain);

  return raycaster.ray.origin.clone()
    .addScaledVector(raycaster.ray.direction, dist);
}

// Is a 3D point inside the mesh, and what is the nearest surface? The ray is
// cast from far outside, inward, so it hits the front face (an inside-out ray
// would hit the back face and miss).
const _insideRay = new THREE.Raycaster();
const RAY_START_DIST = 12;
function checkInsideMesh(worldPt) {
  const distFromCenter = worldPt.length(); // mesh is centered on the origin
  if (distFromCenter < 0.001) {
    return {
      inside: true, penetration: 2.0,
      surfacePoint: new THREE.Vector3(0, 2, 0),
      surfaceNormal: new THREE.Vector3(0, 1, 0),
    };
  }
  const dir = worldPt.clone().normalize();

  const farPt = dir.clone().multiplyScalar(RAY_START_DIST);
  _insideRay.set(farPt, dir.clone().negate());
  _insideRay.far = RAY_START_DIST + 1;
  const hits = _insideRay.intersectObject(clay.mesh);
  if (hits.length === 0) return { inside: false, penetration: 0 };

  const surfDist = RAY_START_DIST - hits[0].distance;
  const inside = distFromCenter < surfDist;
  return {
    inside,
    penetration: inside ? (surfDist - distFromCenter) : 0,
    surfacePoint: hits[0].point,
    surfaceNormal: hits[0].face
      ? hits[0].face.normal.clone().transformDirection(clay.mesh.matrixWorld)
      : dir.clone(),
  };
}

function updateHandMesh(lm, handIdx) {
  if (handIdx >= handGroups.length) return;
  const { group, joints, bones } = handGroups[handIdx];
  group.visible = true;

  // Smoothed depth scale.
  const raw = rawHandScale(lm);
  smoothHandScale[handIdx] = smoothHandScale[handIdx] * DEPTH_CFG.scaleEMA
    + raw * (1 - DEPTH_CFG.scaleEMA);
  const handScale = smoothHandScale[handIdx];

  // Normalize the joint spread around the wrist so the skeleton keeps a
  // constant world size: a hand moving toward the camera should reach deeper,
  // not grow. shrink cancels both the larger apparent size (handScale) and
  // the deeper projection distance (wristDist vs the calibrated refDist).
  const camDist = camera.position.length();
  const refDist = Math.max(0.5, camDist - SPHERE_R + DEPTH_CFG.baseOffset);
  const wristDist = Math.max(0.5, refDist + (1 - 1 / handScale) * DEPTH_CFG.gain);
  const shrink = Math.max(0.25, Math.min(2.0, refDist / (handScale * wristDist)));

  const wristPos = lmToWorld3D(lm, 0, handScale);
  const positions3D = Array.from({ length: 21 }, (_, i) => i === 0
    ? wristPos
    : lmToWorld3D(lm, i, handScale).sub(wristPos).multiplyScalar(shrink).add(wristPos));

  // ── Pinch / grab ──
  const pinching = isPinching(lm, handIdx);
  const pinchMid3D = positions3D[4].clone().add(positions3D[8]).multiplyScalar(0.5);

  // Acquisition retries every frame while the pinch is held, so pinching in
  // the air and then approaching the surface still grabs.
  if (pinching && !grabState[handIdx]) {
    // Grab the surface vertex nearest the pinch midpoint.
    const check = checkInsideMesh(pinchMid3D);
    if (check.surfacePoint && pinchMid3D.distanceTo(check.surfacePoint) < GRAB_CAPTURE) {
      const arr = clay.geometry.attributes.position.array;
      const count = clay.geometry.attributes.position.count;
      let minD = Infinity, minI = 0;
      const sp = check.surfacePoint;
      for (let i = 0; i < count; i++) {
        const dx = arr[i * 3] - sp.x, dy = arr[i * 3 + 1] - sp.y, dz = arr[i * 3 + 2] - sp.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < minD) { minD = d; minI = i; }
      }
      grabState[handIdx] = { vertexIdx: minI };
    }
  } else if (!pinching && grabState[handIdx]) {
    grabState[handIdx] = null;
  }

  if (grabState[handIdx]) {
    // Pull a neighborhood of the grabbed vertex toward the pinch midpoint.
    const { vertexIdx } = grabState[handIdx];
    const arr = clay.geometry.attributes.position.array;
    const gx = arr[vertexIdx * 3], gy = arr[vertexIdx * 3 + 1], gz = arr[vertexIdx * 3 + 2];

    const fx = pinchMid3D.x - gx, fy = pinchMid3D.y - gy, fz = pinchMid3D.z - gz;
    const fLen = Math.hypot(fx, fy, fz);

    if (fLen > 0.01) {
      const dirX = fx / fLen, dirY = fy / fLen, dirZ = fz / fLen;
      const pull = Math.min(fLen * GRAB_POWER, GRAB_MAX_PULL);

      const count = clay.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        const dx = arr[i * 3] - gx, dy = arr[i * 3 + 1] - gy, dz = arr[i * 3 + 2] - gz;
        const inf = grabFalloff(Math.hypot(dx, dy, dz), GRAB_RADIUS);
        if (inf < 0.001) continue;
        clay.vel[i * 3] += dirX * pull * inf;
        clay.vel[i * 3 + 1] += dirY * pull * inf;
        clay.vel[i * 3 + 2] += dirZ * pull * inf;
      }
    }
  }

  // ── Contact: positional collision. Vertices inside a joint's sphere collider
  // are projected onto the collider surface and their into-collider velocity is
  // cancelled, so the clay conforms to the hand's shape and *rests* against a
  // stationary hand. (The previous velocity injection kept flowing forever
  // under a still hand — nothing ever constrained the surface to the hand.)
  const touching = {}; // for display: which joints are in contact

  if (!grabState[handIdx]) {
    const posAttr = clay.geometry.attributes.position;
    const arr = posAttr.array;
    const count = posAttr.count;
    const vel = clay.vel;
    let touchedAny = false;

    for (const j of CONTACT_JOINTS) {
      const c = positions3D[j];
      const r = FINGER_TIPS.includes(j) ? TIP_RADIUS
        : FINGER_MIDS.includes(j) ? MID_RADIUS : PALM_RADIUS;
      const r2 = r * r;

      for (let i = 0; i < count; i++) {
        const dx = arr[i * 3] - c.x, dy = arr[i * 3 + 1] - c.y, dz = arr[i * 3 + 2] - c.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;

        const d = Math.sqrt(d2);
        let nx, ny, nz;
        if (d > 1e-5) {
          nx = dx / d; ny = dy / d; nz = dz / d;
        } else {
          // Vertex at the collider center: push radially out from the mesh
          // origin (any consistent direction works; this one never traps it).
          const cl = Math.hypot(c.x, c.y, c.z) || 1;
          nx = c.x / cl; ny = c.y / cl; nz = c.z / cl;
        }

        const push = (r - d) * CONTACT_STIFFNESS;
        arr[i * 3] += nx * push;
        arr[i * 3 + 1] += ny * push;
        arr[i * 3 + 2] += nz * push;

        // Cancel the velocity component still heading into the collider, so
        // the vertex settles against the hand instead of fighting it.
        const vn = vel[i * 3] * nx + vel[i * 3 + 1] * ny + vel[i * 3 + 2] * nz;
        if (vn < 0) {
          vel[i * 3] -= nx * vn;
          vel[i * 3 + 1] -= ny * vn;
          vel[i * 3 + 2] -= nz * vn;
        }

        touching[j] = true;
        touchedAny = true;
      }
    }

    if (touchedAny) posAttr.needsUpdate = true;
  }

  // ── 3D display ──
  joints.forEach((m, i) => {
    m.position.copy(positions3D[i]);
    const isPinchJoint = i === 4 || i === 8;
    // Pinch feedback: thumb/index brighten when a pinch is detected and glow
    // while actually grabbing, so the user can see what the tracker sees.
    m.material.opacity = touching[i] ? 1.0
      : (grabState[handIdx] && isPinchJoint) ? 1.0
        : (pinchState[handIdx] && isPinchJoint) ? 0.9
          : 0.55;
    m.material.emissive.setHex(
      grabState[handIdx] && isPinchJoint ? 0x886622 : 0x000000);
  });
  bones.forEach(({ line, a, b }) => {
    const pts = line.geometry.attributes.position;
    pts.setXYZ(0, positions3D[a].x, positions3D[a].y, positions3D[a].z);
    pts.setXYZ(1, positions3D[b].x, positions3D[b].y, positions3D[b].z);
    pts.needsUpdate = true;
  });
}

let mpHands = null;

function initMediaPipe() {
  try {
    mpHands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`,
    });

    mpHands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    mpHands.onResults(results => {
      handCanvas.width = videoEl.videoWidth || 200;
      handCanvas.height = videoEl.videoHeight || 150;
      handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

      const detectedCount = results.multiHandLandmarks
        ? results.multiHandLandmarks.length : 0;

      handGroups.forEach((hg, hi) => {
        if (hi >= detectedCount) {
          hg.group.visible = false;
          // Drop pinch/grab on tracking loss so a stale grab can't linger.
          grabState[hi] = null;
          pinchState[hi] = false;
        }
      });

      if (detectedCount === 0) {
        handActive = false;
        cursorMesh.visible = false;
        return;
      }

      handActive = true;
      cursorMesh.visible = false;

      feedCalibration(results.multiHandLandmarks[0]);

      results.multiHandLandmarks.forEach((lm, hi) => {
        drawConnectors(handCtx, lm, HAND_CONNECTIONS,
          { color: hi === 0 ? '#c8a96e60' : '#6e90c860', lineWidth: 1 });
        drawLandmarks(handCtx, lm,
          { color: hi === 0 ? '#c8a96e' : '#6e90c8', lineWidth: 1, radius: 2 });

        updateHandMesh(lm, hi);
      });
    });

    const cam = new Camera(videoEl, {
      onFrame: async () => { await mpHands.send({ image: videoEl }); },
      width: 320, height: 240,
    });
    cam.start();

    statusEl.textContent = 'カメラ: オン';
    statusEl.className = 'active';
    modeBadge.textContent = '✋ ハンドモード';
    // Hand mode is usable now — surface the calibration button.
    document.getElementById('calibrate-area')?.classList.remove('is-hidden');
  } catch (e) {
    statusEl.textContent = 'カメラ: 利用不可（マウスモード）';
    modeBadge.textContent = '🖱 マウスモード';
    console.warn('MediaPipe init failed:', e);
  }
}

export async function startCamera() {
  // Every feature works with the mouse alone; the camera is an enhancement.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'カメラ: 非対応（マウスモード）';
    modeBadge.textContent = '🖱 マウスモード';
    return;
  }
  try {
    await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
    });
    initMediaPipe();
  } catch (e) {
    const msg = e.name === 'NotFoundError'
      ? 'カメラ: 見つかりません（マウスモード）'
      : 'カメラ: 許可されていません（マウスモード）';
    statusEl.textContent = msg;
    modeBadge.textContent = '🖱 マウスモード';
  }
}
