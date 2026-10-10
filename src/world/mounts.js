// Naturalisation : la pose d'un animal est « cuite » dans une géométrie statique
// (plus de squelette à animer), puis montée en cape (tête et cou sortant du mur, sur
// écusson de chêne) ou en entier sur un socle. Oiseaux en vol sur plaquette.
import * as THREE from 'three';
import { SPECIES } from '../animals/species.js';
import { birdMountGeometry, BIRDS } from '../animals/birds.js';
import { sampleBody, bodyPoint } from '../animals/rig.js';
import { buildTrophyGeometry } from '../animals/trophies.js';
import { makeNoise } from '../core/noise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  if (geo.attributes.aRegion) body.setAttribute('aRegion', new THREE.BufferAttribute(geo.attributes.aRegion.array.slice(), 1));
  body.setAttribute('aCut', new THREE.BufferAttribute(new Float32Array(P.length / 3), 1));
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
  const vis = factory.create(ind, { detail: true });
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
  // Pas de poils au ras de la coupe (ils déborderaient sur l'écusson)
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.min(1, Math.max(0, p[i * 3 + 2] / 0.07)); cut[i] = 1 - k * k * (3 - 2 * k); }
  body.setAttribute('aCut', new THREE.BufferAttribute(cut, 1));
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

// ------------------------------------------------------------------ massacres (trophées à l'européenne)
const linC = (c) => c.map((x) => Math.pow(x, 2.2));
const BONE = linC([0.88, 0.85, 0.76]), BONE_D = linC([0.62, 0.56, 0.46]), SOCKET = linC([0.28, 0.23, 0.18]);

class GB {
  constructor() { this.pos = []; this.col = []; this.pearl = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  v(p, c, k = 0.12) { this.pos.push(p.x, p.y, p.z); this.col.push(c[0], c[1], c[2]); this.pearl.push(k); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPearl', new THREE.Float32BufferAttribute(this.pearl, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// Crâne blanchi (sans la mâchoire inférieure) dans le repère du modèle de l'animal.
// short : coupe courte (calotte seule, comme pour le brocard)
function skullGeometry(spec, short, scale) {
  const N = makeNoise(17);
  const st = sampleBody(spec, 140, 'm');
  const E = spec.eye.pos;
  const A = spec.antlerBase;
  // Trait de scie juste derrière les pivots ; coupe courte : jusqu'aux orbites
  const hl = spec.body[spec.body.length - 1][0] - spec.body[spec.headStart][0];
  const zMin = A[2] - 0.09 * hl;
  const zMax = short ? E[2] + 0.06 * hl : 1e9;
  const list = st.filter((x) => x.z >= zMin && x.z <= zMax);
  const gb = new GB();
  const rings = 28;
  const P = new THREE.Vector3();
  const eyes = [new THREE.Vector3(E[0], E[1], E[2]), new THREE.Vector3(-E[0], E[1], E[2])];
  const orbR = spec.eye.r * 2.3;
  list.forEach((sta, k) => {
    const t = k / (list.length - 1);
    const shrink = 0.86 - 0.06 * t;
    for (let j = 0; j <= rings; j++) {
      const a = Math.PI * (0.4 + 1.2 * (j / rings));
      bodyPoint(spec, sta, a, P);
      const c = new THREE.Vector3(0, sta.y, sta.z);
      P.sub(c).multiplyScalar(shrink).add(c);
      let col = BONE;
      // Orbites : creux sombres bordés d'un bourrelet
      for (const e of eyes) {
        const d = P.distanceTo(e);
        if (d < orbR * 1.5) {
          const inK = Math.max(0, 1 - d / orbR);
          const rim = Math.exp(-Math.pow((d - orbR * 1.08) / (orbR * 0.22), 2));
          const dir = new THREE.Vector3(Math.sign(P.x), 0, 0);
          P.addScaledVector(dir, -inK * orbR * 0.75 + rim * orbR * 0.12);
          col = col.map((x, i) => x + (SOCKET[i] - x) * Math.min(1, inK * 1.6));
        }
      }
      // Sutures et patine
      const nz = N.n3(P.x * 30, P.y * 30, P.z * 30);
      const sut = Math.exp(-Math.pow(nz / 0.05, 2)) * 0.35;
      const tone = 0.93 + 0.1 * N.n3(P.x * 9, P.y * 9, P.z * 9) - sut;
      col = col.map((x, i) => lerp1(x, BONE_D[i], 0.25 * t + sut) * tone);
      // Ouvertures nasales à l'extrémité
      if (!short && t > 0.93) col = col.map((x, i) => lerp1(x, SOCKET[i], (t - 0.93) / 0.07));
      gb.v(P, col);
    }
  });
  const n = list.length;
  for (let k = 0; k < n - 1; k++)
    for (let j = 0; j < rings; j++) {
      const a = k * (rings + 1) + j, b = a + 1, c = a + rings + 1, d = c + 1;
      gb.idx.push(a, b, c, b, d, c);
    }
  // Fermetures avant/arrière
  for (const k of [0, n - 1]) {
    const sta = list[k];
    const ci = gb.n;
    gb.v(new THREE.Vector3(0, sta.y, sta.z), k === 0 ? BONE_D : SOCKET);
    for (let j = 0; j < rings; j++) {
      const a = k * (rings + 1) + j;
      if (k === 0) gb.idx.push(ci, a, a + 1);
      else gb.idx.push(ci, a + 1, a);
    }
  }
  return gb.build();
}

// Pivots osseux (pédicules) sous les meules
function pedicles(spec, rad) {
  const b = spec.antlerBase;
  const gs = [];
  for (const side of [1, -1]) {
    const g = new THREE.CylinderGeometry(rad * 0.95, rad * 1.15, rad * 2.4, 14, 1);
    g.translate(0, -rad * 1.1, 0);
    g.rotateZ(-side * 0.35);
    g.translate(b[0] * side, b[1], b[2]);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = BONE[0] * 0.92; c[i + 1] = BONE[1] * 0.92; c[i + 2] = BONE[2] * 0.9; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aPearl', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.25), 1));
    g.deleteAttribute('uv');
    gs.push(g.toNonIndexed());
  }
  return gs;
}

const lerp1 = (a, b, t) => a + (b - a) * t;

function nonIndexed(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color', 'aPearl'].includes(k)) out.deleteAttribute(k);
  return out;
}

// Massacre : crâne + bois/cornes, présenté nez en bas, face vers la salle (+z), dos du crâne au mur (z = 0)
export function skullMount(ind) {
  const spec = SPECIES[ind.species];
  const t = ind.trophy;
  const short = ind.species === 'chevreuil';
  const skull = skullGeometry(spec, short, 1);
  const parts = [nonIndexed(skull)];
  const ant = buildTrophyGeometry(t, spec, 1, { detail: true });
  if (ant) parts.push(nonIndexed(ant));
  if (ind.species !== 'chamois') {
    const rad = t.kind === 'cerf' ? (t.thick / (2 * Math.PI)) * 0.01 : t.kind === 'chevreuil' ? 0.012 : 0.015;
    parts.push(...pedicles(spec, rad));
  }
  for (const g of parts) if (!g.attributes.normal) g.computeVertexNormals();
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  // Chanfrein orienté vers le bas (légèrement vers la salle) : les bois montent le long du mur.
  // Brocard (coupe courte) : calotte inclinée, front vers la salle, merrains presque verticaux.
  const b = spec.antlerBase;
  geo.translate(0, -b[1], -b[2]);
  const h0 = spec.body[spec.headStart], h1 = spec.body[spec.body.length - 1];
  const phi0 = Math.atan2(h1[0] - h0[0], h1[1] - h0[1]);
  const target = { chevreuil: 2.5, chamois: 2.55, daim: 2.76 }[ind.species] || 2.75;
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(target - phi0));
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  // Le dos du crâne contre l'écusson
  const skullBB = new THREE.Box3();
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const nSkull = skull.index ? skull.index.count : skull.attributes.position.count;
  for (let i = 0; i < nSkull; i++) { v.fromBufferAttribute(p, i); skullBB.expandByPoint(v); }
  geo.translate(0, 0, -skullBB.min.z + 0.004);
  skullBB.translate(new THREE.Vector3(0, 0, -skullBB.min.z + 0.004));
  geo.computeBoundingBox();
  skull.dispose();
  return { geo, skull: { w: skullBB.max.x - skullBB.min.x, h: skullBB.max.y - skullBB.min.y, cy: (skullBB.max.y + skullBB.min.y) / 2, top: skullBB.max.y }, top: geo.boundingBox.max.y, depth: geo.boundingBox.max.z, spec, span: bb.max.x - bb.min.x };
}

// Armes du sanglier montées sur écusson : les deux défenses (canines inférieures) en fer à cheval,
// racines creuses jaunies en bas, pointes d'émail blanc tournées vers l'intérieur ; les grès
// (canines supérieures) au centre, recourbés vers l'extérieur. Chaque défense porte son biseau d'usure poli.
export function tuskPlaque(ind) {
  const t = ind.trophy;
  const N = makeNoise((t.seed || 3) % 1000);
  const gb = new GB();
  const ivory = linC([0.93, 0.9, 0.81]), enamel = linC([0.97, 0.96, 0.93]), root = linC([0.79, 0.66, 0.43]);
  const stain = linC([0.52, 0.4, 0.25]), pulp = linC([0.26, 0.19, 0.12]);
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const tusk = (curve, r0, r1, segs, rings, enamelFrom, wear) => {
    const fr = curve.computeFrenetFrames(segs, false);
    const start = gb.n;
    const P = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      curve.getPointAt(u, P);
      const r = lerp1(r0, r1, Math.pow(u, 1.1)) * (1 - 0.9 * sm(0.86, 1, u));
      const facet = sm(0.6, 0.82, u);
      const enK = sm(enamelFrom - 0.05, enamelFrom + 0.05, u);
      for (let j = 0; j <= rings; j++) {
        const a = (j / rings) * Math.PI * 2;
        n.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
        q.copy(n).multiplyScalar(r * (1 + 0.17 * Math.cos(3 * a)));
        // Biseau d'usure : plan qui tranche la face interne de la courbure
        const d = q.dot(fr.normals[i]), lim = r * lerp1(1.3, wear, facet);
        const cut = d > lim;
        if (cut) q.addScaledVector(fr.normals[i], lim - d);
        q.add(P);
        const nz = N.n3(q.x * 70, q.y * 70, q.z * 70);
        let c = root.map((x, m) => lerp1(lerp1(x, stain[m], 0.35 * Math.max(0, nz) + 0.25 * (1 - u)), ivory[m], enK));
        if (cut) c = enamel;
        gb.v(q, c, cut ? 0 : lerp1(0.16, 0.02, enK));
      }
    }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < rings; j++) {
        const a = start + i * (rings + 1) + j, b = a + 1, c = a + rings + 1, d = c + 1;
        gb.idx.push(a, c, b, b, c, d);
      }
    // Racine creuse : cavité pulpaire sombre
    const tan = curve.getTangentAt(0);
    curve.getPointAt(0, P);
    const ci = gb.n;
    gb.v(P.clone().addScaledVector(tan, r0 * 0.6), pulp, 0.3);
    for (let j = 0; j < rings; j++) gb.idx.push(ci, start + j, start + j + 1);
  };
  const L = t.lowerL * 0.01, W = t.lowerW * 0.01, U = t.upperW * 0.01;
  const R = L * 0.37; // rayon de courbure (arc d'environ 160°)
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const a = (-100 + 158 * u) * (Math.PI / 180);
      pts.push(new THREE.Vector3(side * (R * 0.2 + Math.cos(a) * R), R * 0.1 + Math.sin(a) * R, 0.018 + R * 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.012 * u));
    }
    tusk(new THREE.CatmullRomCurve3(pts), W * 0.44, W * 0.2, 40, 12, 0.55, 0.35);
    // Grès : plus courts et plus épais, dressés en V au centre, légèrement arqués vers l'extérieur
    const g = [[0.0, -0.62, 0.0], [0.07, -0.36, 0.25], [0.18, -0.08, 0.5], [0.27, 0.18, 0.7], [0.32, 0.4, 0.8]]
      .map(([x, y, k]) => new THREE.Vector3(side * (0.022 + x * R), y * R, 0.026 + 0.022 * k + 0.012 * Math.sin(Math.PI * k)));
    tusk(new THREE.CatmullRomCurve3(g), U * 0.46, U * 0.24, 22, 10, 0.4, 0.55);
  }
  const geo = gb.build();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  return { geo, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, cy: (bb.max.y + bb.min.y) / 2 };
}
