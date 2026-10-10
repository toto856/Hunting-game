// Naturalisation : la pose d'un animal est « cuite » dans une géométrie statique
// (plus de squelette à animer), puis montée en cape (tête et cou sortant du mur, sur
// écusson de chêne) ou en entier sur un socle. Oiseaux en vol sur plaquette.
import * as THREE from 'three';
import { SPECIES } from '../animals/species.js';
import { birdMountGeometry, BIRDS } from '../animals/birds.js';

// Profil du corps à une abscisse z : [y du dessus, y du dessous, demi-largeur]
function profileAt(spec, z) {
  const B = spec.body;
  if (z <= B[0][0]) return [B[0][1] + B[0][2], B[0][1] - B[0][3], B[0][4]];
  for (let i = 0; i < B.length - 1; i++) {
    const a = B[i], b = B[i + 1];
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      const yc = a[1] + (b[1] - a[1]) * t;
      return [yc + a[2] + (b[2] - a[2]) * t, yc - (a[3] + (b[3] - a[3]) * t), a[4] + (b[4] - a[4]) * t];
    }
  }
  const l = B[B.length - 1];
  return [l[1] + l[2], l[1] - l[3], l[4]];
}

// Géométries statiques (repère du « holder », en mètres) de la pose courante
export function bakeVisual(vis) {
  vis.holder.updateMatrixWorld(true);
  const mesh = vis.lods[0];
  const geo = mesh.geometry;
  const skel = vis.skeleton;
  const toHolder = new THREE.Matrix4().copy(vis.holder.matrixWorld).invert();
  const K = skel.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(toHolder, b.matrixWorld).multiply(skel.boneInverses[i]).elements);
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array;
  const si = geo.attributes.skinIndex.array, sw = geo.attributes.skinWeight.array;
  const n = geo.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k];
      if (!w) continue;
      const m = K[si[i * 4 + k]];
      px += w * (m[0] * x + m[4] * y + m[8] * z + m[12]);
      py += w * (m[1] * x + m[5] * y + m[9] * z + m[13]);
      pz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
      qx += w * (m[0] * nx + m[4] * ny + m[8] * nz);
      qy += w * (m[1] * nx + m[5] * ny + m[9] * nz);
      qz += w * (m[2] * nx + m[6] * ny + m[10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    N[i * 3] = qx / l; N[i * 3 + 1] = qy / l; N[i * 3 + 2] = qz / l;
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(P, 3));
  body.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(geo.attributes.uv.array.slice(), 2));
  if (geo.attributes.uv1) body.setAttribute('uv1', new THREE.BufferAttribute(geo.attributes.uv1.array.slice(), 2));
  body.setIndex(new THREE.BufferAttribute(geo.index.array.slice(), 1));
  // Yeux et trophée (enfants de l'os de la tête)
  const parts = [];
  vis.bones.head.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toHolder, o.matrixWorld));
    parts.push({ geo: g, mat: o.material, antler: o === vis.trophyMesh });
  });
  if (vis.trophyMesh) vis.trophyMesh.geometry.dispose();
  return { body, mat: mesh.material, parts };
}

function poseVisual(factory, ind, pose) {
  const vis = factory.create(ind);
  const st = { speed: 0, graze: false, alert: !!pose.alert, bed: false, dead: false, lookYaw: pose.lookYaw || 0, lookPitch: pose.lookPitch || 0 };
  for (let k = 0; k < 150; k++) vis.animator.update(1 / 30, st);
  return vis;
}

// Montage en cape : renvoie un groupe dont le plan du mur est z = 0 (animal vers +z)
export function shoulderMount(factory, ind, pose = {}) {
  const spec = SPECIES[ind.species];
  const vis = poseVisual(factory, ind, pose);
  const baked = bakeVisual(vis);
  const s = ind.scale || 1;
  const L = spec.body[spec.body.length - 1][0] - spec.body[0][0];
  const fz = spec.front.pts[0][2];
  // Plan de coupe : derrière le garrot en haut, sous le poitrail en bas (pattes coupées au coude)
  const za = fz - 0.1 * L, zb = fz + 0.065 * L;
  const A = new THREE.Vector2(za, profileAt(spec, za)[0] + 0.05).multiplyScalar(s);
  const B = new THREE.Vector2(zb, profileAt(spec, zb)[1] - 0.02).multiplyScalar(s);
  const dz = B.x - A.x, dy = B.y - A.y;
  const nl = Math.hypot(dz, dy);
  const nz = -dy / nl, ny = dz / nl; // normale (vers l'avant et le haut)
  const theta = Math.atan2(ny, nz) - (pose.tilt || 0);
  const R = new THREE.Matrix4().makeRotationX(theta);
  const zc = A.y * Math.sin(theta) + A.x * Math.cos(theta);
  // Rotation puis coupe : on ne garde que ce qui sort du mur
  const body = baked.body;
  body.applyMatrix4(R);
  const p = body.attributes.position.array;
  const idx = body.index.array;
  const keep = [];
  const tol = 0.01;
  let minY = 1e9, maxY = -1e9, maxX = 0, maxZ = 0, topY = -1e9;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (p[a * 3 + 2] < zc - tol || p[b * 3 + 2] < zc - tol || p[c * 3 + 2] < zc - tol) continue;
    keep.push(a, b, c);
  }
  const n = body.attributes.position.count;
  for (let i = 0; i < n; i++) {
    const z = p[i * 3 + 2];
    if (z < zc - tol) continue;
    const y = p[i * 3 + 1];
    if (z < zc + 0.06) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      maxX = Math.max(maxX, Math.abs(p[i * 3]));
    }
    maxZ = Math.max(maxZ, z - zc);
    topY = Math.max(topY, y);
  }
  body.setIndex(keep);
  const cy = (minY + maxY) / 2;
  const T = new THREE.Matrix4().makeTranslation(0, -cy, -zc);
  body.applyMatrix4(T);
  body.computeBoundingSphere();
  const M = new THREE.Matrix4().multiplyMatrices(T, R);
  const parts = baked.parts.map((q) => { q.geo.applyMatrix4(M); return q; });
  for (const q of parts) {
    q.geo.computeBoundingBox();
    topY = Math.max(topY, q.geo.boundingBox.max.y + cy);
  }
  return {
    body, mat: baked.mat, parts,
    cut: { w: maxX * 2, h: maxY - minY }, depth: maxZ, top: topY - cy, spec,
  };
}

// Animal entier, pieds au sol (y = 0), tourné vers +z
export function fullMount(factory, ind, pose = {}) {
  const vis = poseVisual(factory, ind, pose);
  const baked = bakeVisual(vis);
  baked.body.computeBoundingSphere();
  return { body: baked.body, mat: baked.mat, parts: baked.parts, spec: SPECIES[ind.species] };
}

// Écusson de chêne (forme héraldique) : largeur w, hauteur h, face avant en z = 0
export function shieldGeometry(w, h, thick = 0.045) {
  const hw = w / 2, hh = h / 2;
  const right = [
    [0, 1.0], [0.16, 0.97], [0.3, 0.86], [0.46, 0.9], [0.66, 0.9], [0.86, 0.78], [0.98, 0.5], [1.0, 0.18],
    [0.96, -0.18], [0.84, -0.5], [0.62, -0.78], [0.34, -0.94], [0, -1.0],
  ];
  const pts = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0] * hw, pts[0][1] * hh);
  shape.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x * hw, y * hh)).concat([new THREE.Vector2(pts[0][0] * hw, pts[0][1] * hh)]));
  const bev = Math.min(0.016, thick * 0.4);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 40 });
  g.translate(0, 0, -(thick - bev));
  g.computeVertexNormals();
  return g;
}

// Plaquette ovale (oiseaux, petits trophées)
export function ovalGeometry(w, h, thick = 0.03) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
  const bev = 0.01;
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 36 });
  g.translate(0, 0, -(thick - bev));
  return g;
}

// Oiseau en vol pour le mur : repère du mur (+z sortant), montée en diagonale
export function birdMount(species, sex, dir = 1) {
  const sp = BIRDS[species] || BIRDS.colvert;
  const g = birdMountGeometry(species, sex);
  const a = 0.62; // pente de vol
  const Z = new THREE.Vector3(Math.cos(a) * dir, Math.sin(a), 0); // avant de l'oiseau
  const X = new THREE.Vector3(0, 0, -1).multiplyScalar(dir); // envergure : perpendiculaire au mur
  const Y = new THREE.Vector3().crossVectors(Z, X);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  g.applyMatrix4(m);
  g.translate(0, 0, 0.3 * sp.size + 0.04);
  g.computeBoundingBox();
  return { geo: g, size: sp.size };
}

export const MEDAL_COLORS = {
  bronze: 0x9a6a3a, argent: 0xd4d8dc, or: 0xe2b24c, diamant: 0xbfe6ff, legendaire: 0xb07cff,
};

export { profileAt };
