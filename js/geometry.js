// Icosphere generator. A UV SphereGeometry pinches at the poles; an icosphere
// distributes vertices evenly so sculpting stays stable everywhere.
// Returns a BufferGeometry with a precomputed adjacency table in userData.

export function buildIcosphere(radius, subdivisions) {
  const t = (1 + Math.sqrt(5)) / 2;
  const baseVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });

  const baseFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const verts = baseVerts.map(v => [...v]);
  let faces = baseFaces.map(f => [...f]);
  const midCache = new Map();

  function midpoint(a, b) {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (midCache.has(key)) return midCache.get(key);
    const va = verts[a], vb = verts[b];
    const mx = (va[0] + vb[0]) / 2, my = (va[1] + vb[1]) / 2, mz = (va[2] + vb[2]) / 2;
    const l = Math.hypot(mx, my, mz);
    const idx = verts.length;
    verts.push([mx / l, my / l, mz / l]);
    midCache.set(key, idx);
    return idx;
  }

  for (let s = 0; s < subdivisions; s++) {
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const positions = [];
  const indices = [];
  for (const v of verts) positions.push(v[0] * radius, v[1] * radius, v[2] * radius);
  for (const [a, b, c] of faces) indices.push(a, b, c);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Adjacency table for smoothing/spring passes — accurate because neighbors
  // are evenly distributed.
  const adjSets = Array.from({ length: verts.length }, () => new Set());
  for (const [a, b, c] of faces) {
    adjSets[a].add(b); adjSets[a].add(c);
    adjSets[b].add(a); adjSets[b].add(c);
    adjSets[c].add(a); adjSets[c].add(b);
  }
  geo.userData.adjacency = adjSets.map(s => [...s]);

  return geo;
}
