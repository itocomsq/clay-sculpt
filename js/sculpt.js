// Brush state and force injection. Sculpting does not move vertices directly —
// it adds to the velocity buffer (push/pull) or the rest buffer (smooth); the
// physics step turns that into motion. That indirection is what makes the clay
// wobble instead of snapping.

import { clay } from './clay.js';

export const brush = {
  radius: 0.6,
  strength: 0.04,
  falloff: 2.5,
  tool: 'push',
};

export function setTool(t) {
  brush.tool = t;
  // Only tool buttons — the camera toggle keeps its own active state.
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + t)?.classList.add('active');
}

export function falloff(dist, radius) {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return Math.pow(t, brush.falloff);
}

export function sculptAt(worldPos, forceDir, strength) {
  const { geometry, vel, rest } = clay;
  if (!vel) return;
  const pos = geometry.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const fx = forceDir.x, fy = forceDir.y, fz = forceDir.z;

  for (let i = 0; i < count; i++) {
    const dx = arr[i * 3] - worldPos.x, dy = arr[i * 3 + 1] - worldPos.y, dz = arr[i * 3 + 2] - worldPos.z;
    const dist = Math.hypot(dx, dy, dz);
    const inf = falloff(dist, brush.radius);
    if (inf < 0.001) continue;

    if (brush.tool === 'push') {
      const impulse = inf * strength * 2.5;
      vel[i * 3] += fx * impulse;
      vel[i * 3 + 1] += fy * impulse;
      vel[i * 3 + 2] += fz * impulse;
    } else if (brush.tool === 'pull') {
      const narr = geometry.attributes.normal.array;
      const impulse = inf * strength * 2.5;
      vel[i * 3] += narr[i * 3] * impulse;
      vel[i * 3 + 1] += narr[i * 3 + 1] * impulse;
      vel[i * 3 + 2] += narr[i * 3 + 2] * impulse;
    } else if (brush.tool === 'smooth') {
      // Bake current position into rest — freezes the deformation in place.
      rest[i * 3] += (arr[i * 3] - rest[i * 3]) * inf * 0.3;
      rest[i * 3 + 1] += (arr[i * 3 + 1] - rest[i * 3 + 1]) * inf * 0.3;
      rest[i * 3 + 2] += (arr[i * 3 + 2] - rest[i * 3 + 2]) * inf * 0.3;
    }
  }
}
