// Arbres procéduraux : squelette de branches, tubes d'écorce, cartes de feuillage,
// deux niveaux de détail géométriques + imposteurs multi-vues éclairés.
import * as THREE from 'three';
import { rng, lerp, clamp } from '../core/math.js';
import { injectGlobals, FOG_FUNC } from './globals.js';
import { BARK, LEAVES, NEEDLES } from './vegTextures.js';

export const SPECIES = {
  oak: { kind: 'broad', height: [12, 18], trunkR: [0.3, 0.48], crown: 0.3, mains: [6, 8], el: [0.9, 1.3], gravity: 0.04, leaf: [0.9, 1.3], dens: 1.7, spread: 1.15, bark: 'oak', foliage: 'oak' },
  beech: { kind: 'broad', height: [16, 23], trunkR: [0.24, 0.38], crown: 0.36, mains: [7, 10], el: [0.55, 0.95], gravity: -0.06, leaf: [0.9, 1.25], dens: 1.8, spread: 0.85, bark: 'beech', foliage: 'beech' },
  birch: { kind: 'broad', height: [11, 16], trunkR: [0.12, 0.2], crown: 0.34, mains: [9, 13], el: [0.45, 0.8], gravity: 0.22, leaf: [0.7, 0.95], dens: 1.5, spread: 0.6, bark: 'birch', foliage: 'birch' },
  spruce: { kind: 'conifer', height: [17, 27], trunkR: [0.24, 0.36], gap: 0.55, blen: [3.0, 4.0], droop: 0.42, bark: 'spruce', foliage: 'spruce', dead: 0.22 },
  larch: { kind: 'conifer', height: [16, 23], trunkR: [0.2, 0.3], gap: 0.75, blen: [2.4, 3.2], droop: 0.08, bark: 'spruce', foliage: 'larch', dead: 0.3, sparse: true },
  pine: { kind: 'pine', height: [16, 23], trunkR: [0.22, 0.32], crown: 0.62, mains: [5, 7], bark: 'pine', foliage: 'pine' },
};

class GeoBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.flex = []; this.idx = [];
  }
  get n() { return this.pos.length / 3; }
  v(p, n, u, v, c, f, ph) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c, c, c);
    this.flex.push(f, ph);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Tube le long d'une polyligne (repère à transport parallèle)
function tube(gb, pts, radii, segs, flex0, flex1, phase, uRep, aoBase, flare = 0) {
  const n = pts.length;
  const tangents = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    return new THREE.Vector3().subVectors(b, a).normalize();
  });
  const N = new THREE.Vector3();
  const t0 = tangents[0];
  N.set(0, 1, 0);
  if (Math.abs(t0.y) > 0.9) N.set(1, 0, 0);
  N.sub(_d.copy(t0).multiplyScalar(N.dot(t0))).normalize();
  let len = 0;
  const circ = Math.PI * 2 * radii[0];
  const vScale = uRep / Math.max(circ, 0.05);
  const start = gb.n;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      _q.setFromUnitVectors(tangents[i - 1], tangents[i]);
      N.applyQuaternion(_q).normalize();
      len += pts[i].distanceTo(pts[i - 1]);
    }
    const T = tangents[i];
    _b.crossVectors(T, N).normalize();
    const t = i / (n - 1);
    const fl = lerp(flex0, flex1, t);
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      _d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a));
      let r = radii[i];
      if (flare > 0 && i < 3) r *= 1 + flare * (1 - i / 3) * (0.55 + 0.45 * Math.cos(a * 5 + 1.3));
      const p = new THREE.Vector3().copy(pts[i]).addScaledVector(_d, r);
      const ao = clamp(aoBase + 0.25 * t, 0.35, 1);
      gb.v(p, _d, (s / segs) * uRep, len * vScale, ao, fl, phase);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let s = 0; s < segs; s++) {
      const a = start + i * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
      gb.idx.push(a, c, b, b, c, d);
    }
}

// Carte de feuillage : quad orienté, normale "sphérique" pour un volume doux
function card(gb, center, up, right, size, cell, crownC, crownR, flex, phase, aoBias = 0) {
  const hw = size * 0.5;
  const corners = [[-1, -0.15], [1, -0.15], [1, 1.85], [-1, 1.85]];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const start = gb.n;
  const cardN = new THREE.Vector3().crossVectors(right, up).normalize();
  for (let k = 0; k < 4; k++) {
    const p = new THREE.Vector3().copy(center)
      .addScaledVector(right, corners[k][0] * hw)
      .addScaledVector(up, corners[k][1] * hw);
    const out = new THREE.Vector3().subVectors(p, crownC);
    const dist = out.length();
    out.normalize();
    const nn = new THREE.Vector3().copy(cardN).multiplyScalar(0.3).addScaledVector(out, 0.85).normalize();
    const ao = clamp(0.42 + 0.68 * (dist / crownR) + aoBias, 0.3, 1.05);
    gb.v(p, nn, (uvs[k][0] + (cell % 2)) * 0.5, (uvs[k][1] + Math.floor(cell / 2)) * 0.5, ao, flex * (k > 1 ? 1 : 0.7), phase);
  }
  gb.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function randomPerp(r, dir) {
  const a = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  return a.sub(new THREE.Vector3().copy(dir).multiplyScalar(a.dot(dir))).normalize();
}

// ------------------------------------------------------------------ squelettes
function broadleaf(sp, seed, lod) {
  const r = rng(seed);
  const bark = new GeoBuilder(), leaves = new GeoBuilder();
  const H = r.range(...sp.height);
  const R0 = r.range(...sp.trunkR);
  const lean = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.06 * H);
  const trunkTop = H * 0.82;
  const trunkPts = [], trunkR = [];
  const NT = lod === 0 ? 9 : 5;
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    trunkPts.push(new THREE.Vector3(lean.x * t * t + (r() - 0.5) * 0.15 * t, t * trunkTop, lean.z * t * t + (r() - 0.5) * 0.15 * t));
    trunkR.push(R0 * lerp(1, 0.28, Math.pow(t, 0.8)));
  }
  const trunkAt = (h) => {
    const t = clamp(h / trunkTop, 0, 1) * (NT - 1);
    const i = Math.min(NT - 2, Math.floor(t));
    return { p: trunkPts[i].clone().lerp(trunkPts[i + 1], t - i), r: lerp(trunkR[i], trunkR[i + 1], t - i) };
  };
  tube(bark, trunkPts, trunkR, lod === 0 ? 12 : 6, 0, 0.25, 0, Math.max(1, Math.round(R0 * 6)), 0.75, lod === 0 ? 0.55 : 0.3);

  const leafPts = [];
  const crownW = H * 0.32 * sp.spread;
  const mains = r.int(...sp.mains);
  for (let m = 0; m < mains; m++) {
    const tAttach = lerp(sp.crown, 0.93, (m + r() * 0.6) / mains);
    const hA = tAttach * trunkTop;
    const base = trunkAt(hA);
    const az = m * 2.39996 + r() * 0.6;
    const el = lerp(sp.el[1], sp.el[0], tAttach) + (r() - 0.5) * 0.2;
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el)).normalize();
    const L = (crownW * lerp(1.15, 0.55, tAttach) + (H - hA) * 0.35) * r.range(0.8, 1.15);
    const pts = [base.p.clone()];
    const NB = lod === 0 ? 6 : 3;
    const p = base.p.clone();
    const d = dir.clone();
    for (let k = 1; k <= NB; k++) {
      d.y += sp.gravity * -1 + 0.08;
      d.y -= sp.gravity * (k / NB) * 0.9;
      d.x += (r() - 0.5) * 0.25;
      d.z += (r() - 0.5) * 0.25;
      d.normalize();
      p.addScaledVector(d, L / NB);
      pts.push(p.clone());
    }
    const rr = pts.map((_, i) => Math.max(0.015, base.r * 0.62 * (1 - i / (NB + 0.6))));
    tube(bark, pts, rr, lod === 0 ? 7 : 4, 0.2, 0.75, r(), 1, 0.6);
    // Branches secondaires
    const subs = lod === 0 ? r.int(3, 5) : 2;
    for (let s = 0; s < subs; s++) {
      const ts = lerp(0.35, 0.9, (s + r() * 0.5) / subs);
      const idx = Math.min(pts.length - 2, Math.floor(ts * (pts.length - 1)));
      const sp0 = pts[idx].clone().lerp(pts[idx + 1], ts * (pts.length - 1) - idx);
      const pd = new THREE.Vector3().subVectors(pts[idx + 1], pts[idx]).normalize();
      const sd = pd.clone().add(randomPerp(r, pd).multiplyScalar(r.range(0.7, 1.3))).normalize();
      sd.y += 0.15 - sp.gravity;
      sd.normalize();
      const SL = L * r.range(0.35, 0.55) * (1 - ts * 0.3);
      const spts = [sp0.clone()];
      const q = sp0.clone();
      const NS = lod === 0 ? 3 : 2;
      for (let k = 1; k <= NS; k++) {
        sd.y -= sp.gravity * 0.6;
        sd.normalize();
        q.addScaledVector(sd, SL / NS);
        spts.push(q.clone());
      }
      if (lod === 0) tube(bark, spts, spts.map((_, i) => Math.max(0.01, rr[idx] * 0.5 * (1 - i / (NS + 0.5)))), 4, 0.6, 1, r(), 1, 0.65);
      for (let k = 1; k <= NS; k++) leafPts.push({ p: spts[k], d: sd.clone(), w: 1 });
      leafPts.push({ p: spts[0].clone().lerp(spts[NS], 0.5), d: sd.clone(), w: 0.8 });
    }
    for (let k = 2; k < pts.length; k++) leafPts.push({ p: pts[k], d: dir.clone(), w: 1 });
  }
  // Pousse terminale
  const top = trunkPts[NT - 1];
  leafPts.push({ p: top.clone().add(new THREE.Vector3(0, H * 0.1, 0)), d: new THREE.Vector3(0, 1, 0), w: 1.2 });

  // Feuillage
  const crownC = new THREE.Vector3();
  leafPts.forEach((l) => crownC.add(l.p));
  crownC.multiplyScalar(1 / leafPts.length);
  let crownR = 0;
  leafPts.forEach((l) => (crownR = Math.max(crownR, l.p.distanceTo(crownC))));
  const per = lod === 0 ? Math.round(5 * sp.dens) : 2;
  for (const l of leafPts) {
    const cnt = Math.max(1, Math.round(per * l.w));
    for (let c = 0; c < cnt; c++) {
      const center = l.p.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(lod === 0 ? 1.6 : 2.0));
      const out = center.clone().sub(crownC).normalize();
      const up = l.d.clone().lerp(out, 0.4).add(new THREE.Vector3(0, 0.5, 0)).normalize();
      const right = new THREE.Vector3().crossVectors(up, out).normalize();
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      right.applyAxisAngle(up, (r() - 0.5) * 1.2);
      const size = r.range(...sp.leaf) * (lod === 0 ? 1 : 1.9);
      card(leaves, center, up, right, size, r.int(0, 3), crownC, crownR, 1, r());
    }
  }
  return { bark: bark.build(), leaves: leaves.build(), height: H + H * 0.12, radius: crownR + 1.5 };
}

function conifer(sp, seed, lod) {
  const r = rng(seed);
  const bark = new GeoBuilder(), leaves = new GeoBuilder();
  const H = r.range(...sp.height);
  const R0 = r.range(...sp.trunkR);
  const lean = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.02 * H);
  const NT = lod === 0 ? 8 : 4;
  const tp = [], tr = [];
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    tp.push(new THREE.Vector3(lean.x * t, t * H, lean.z * t));
    tr.push(R0 * lerp(1, 0.04, Math.pow(t, 0.9)));
  }
  tube(bark, tp, tr, lod === 0 ? 10 : 5, 0, 0.3, 0, Math.max(1, Math.round(R0 * 6)), 0.7, lod === 0 ? 0.4 : 0.2);
  const crownC = new THREE.Vector3(0, H * 0.45, 0);
  const crownR = H * 0.55;
  const first = sp.dead * H;
  const gap = sp.gap * (lod === 0 ? 1 : 1.9);
  let h = 1.6;
  let whorl = 0;
  while (h < H - 0.4) {
    const t = h / H;
    const n = sp.sparse ? r.int(3, 5) : r.int(4, 6);
    const L = r.range(...sp.blen) * Math.pow(1 - t, 0.85) + 0.3;
    for (let k = 0; k < n; k++) {
      const az = whorl * 0.7 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const base = new THREE.Vector3(lean.x * t, h, lean.z * t);
      const dead = h < first;
      if (dead) {
        if (lod === 0 && r() < 0.5) {
          const e = base.clone().addScaledVector(dir, L * 0.4).add(new THREE.Vector3(0, -0.15, 0));
          tube(bark, [base, e], [0.025, 0.006], 3, 0.1, 0.3, r(), 1, 0.45);
        }
        continue;
      }
      const droop = sp.droop * (1 - t * 0.5);
      const pts = [base.clone()];
      const NB = lod === 0 ? 4 : 2;
      for (let s = 1; s <= NB; s++) {
        const f = s / NB;
        pts.push(base.clone().addScaledVector(dir, L * f).add(new THREE.Vector3(0, -droop * L * Math.sin(f * 2.4) * 0.45 + f * f * 0.12 * L * (sp.droop > 0.2 ? 1 : 0.4), 0)));
      }
      if (lod === 0) tube(bark, pts, pts.map((_, i) => Math.max(0.006, tr[0] * 0.18 * (1 - i / (NB + 0.3)))), 4, 0.3, 0.95, r(), 1, 0.5);
      // Rameaux d'aiguilles le long de la branche
      const cards = lod === 0 ? (sp.sparse ? 3 : 4) : 2;
      for (let c = 0; c < cards; c++) {
        const f = (c + 0.6) / cards;
        const seg = Math.min(NB - 1, Math.floor(f * NB));
        const p = pts[seg].clone().lerp(pts[seg + 1], f * NB - seg);
        const fwd = new THREE.Vector3().subVectors(pts[seg + 1], pts[seg]).normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const size = L * (lod === 0 ? 0.62 : 1.05) * (1 - f * 0.25) + 0.25;
        const tilt = (r() - 0.5) * 0.6;
        const up2 = fwd.clone().applyAxisAngle(right, -0.2 + tilt * 0.3);
        const r2 = right.clone().applyAxisAngle(fwd, tilt);
        card(leaves, p.clone().addScaledVector(fwd, -size * 0.35), up2, r2, size, r.int(0, 3), crownC, crownR, 0.9, r(), -0.05);
        if (lod === 0 && !sp.sparse) {
          const r3 = right.clone().applyAxisAngle(fwd, 1.1 + tilt);
          card(leaves, p.clone().addScaledVector(fwd, -size * 0.3), up2, r3, size * 0.85, r.int(0, 3), crownC, crownR, 0.9, r(), -0.1);
        }
      }
    }
    h += gap * r.range(0.85, 1.2) * lerp(1, 0.7, t);
    whorl++;
  }
  // Flèche sommitale
  const topP = tp[NT - 1].clone();
  card(leaves, topP.clone().add(new THREE.Vector3(0, -0.9, 0)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 1.6, 0, crownC, crownR, 1, 0.3);
  card(leaves, topP.clone().add(new THREE.Vector3(0, -0.9, 0)), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 1.6, 1, crownC, crownR, 1, 0.6);
  return { bark: bark.build(), leaves: leaves.build(), height: H + 0.8, radius: sp.blen[1] + 1.2 };
}

function pine(sp, seed, lod) {
  const r = rng(seed);
  const bark = new GeoBuilder(), leaves = new GeoBuilder();
  const H = r.range(...sp.height);
  const R0 = r.range(...sp.trunkR);
  const NT = lod === 0 ? 9 : 5;
  const bend = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(1.4);
  const tp = [], tr = [];
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    tp.push(new THREE.Vector3(bend.x * Math.sin(t * 2.2), t * H * 0.9, bend.z * Math.sin(t * 2.2)));
    tr.push(R0 * lerp(1, 0.2, Math.pow(t, 0.9)));
  }
  tube(bark, tp, tr, lod === 0 ? 10 : 5, 0, 0.3, 0, Math.max(1, Math.round(R0 * 6)), 0.7, lod === 0 ? 0.35 : 0.2);
  const crownC = new THREE.Vector3(tp[NT - 1].x, H * 0.82, tp[NT - 1].z);
  const crownR = H * 0.24;
  const mains = r.int(...sp.mains);
  const clumps = [];
  for (let m = 0; m < mains; m++) {
    const t = lerp(sp.crown, 0.95, (m + r() * 0.5) / mains);
    const ti = Math.min(NT - 2, Math.floor(t * (NT - 1)));
    const base = tp[ti].clone().lerp(tp[ti + 1], t * (NT - 1) - ti);
    const az = m * 2.39996 + r();
    const el = lerp(1.15, 0.6, t);
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el));
    const L = H * lerp(0.22, 0.1, t) * r.range(0.8, 1.2);
    const pts = [base.clone()];
    const p = base.clone();
    for (let k = 1; k <= 3; k++) {
      dir.y += 0.12;
      dir.normalize();
      p.addScaledVector(dir, L / 3);
      pts.push(p.clone());
    }
    tube(bark, pts, pts.map((_, i) => Math.max(0.012, tr[ti] * 0.45 * (1 - i / 3.4))), lod === 0 ? 5 : 3, 0.3, 0.85, r(), 1, 0.55);
    clumps.push(pts[3], pts[2].clone().lerp(pts[3], 0.5));
    for (let s = 0; s < (lod === 0 ? 2 : 1); s++) {
      const sd = dir.clone().add(randomPerp(r, dir)).normalize();
      clumps.push(pts[2].clone().addScaledVector(sd, L * 0.4));
    }
  }
  clumps.push(tp[NT - 1].clone().add(new THREE.Vector3(0, 0.6, 0)));
  for (const c of clumps) {
    const cnt = lod === 0 ? 4 : 2;
    for (let k = 0; k < cnt; k++) {
      const up = new THREE.Vector3(r() - 0.5, 0.8, r() - 0.5).normalize();
      const right = randomPerp(r, up);
      card(leaves, c.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.6, r() - 0.5)), up, right, r.range(1.4, 2.0) * (lod === 0 ? 1 : 1.6), r.int(0, 3), crownC, crownR, 1, r());
    }
  }
  return { bark: bark.build(), leaves: leaves.build(), height: H + 1, radius: crownR + H * 0.12 + 1 };
}

export function buildTree(name, seed, lod) {
  const sp = SPECIES[name];
  if (sp.kind === 'broad') return broadleaf(sp, seed, lod);
  if (sp.kind === 'conifer') return conifer(sp, seed, lod);
  return pine(sp, seed, lod);
}

// ------------------------------------------------------------------ matériaux (vent + translucidité)
const WIND_VERT = /* glsl */ `
  {
    vec3 ib = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
    float ph = ib.x * 0.11 + ib.z * 0.07 + aFlex.y * 6.0;
    vec2 wd = uWind.xz; float ws = length( wd ) + 0.0001; wd /= ws;
    mat3 im = mat3( instanceMatrix );
    vec3 wo = normalize( transpose( im ) * vec3( wd.x, 0.0, wd.y ) );
    float gust = 0.55 + 0.45 * sin( uTime * 0.31 + ph * 0.2 ) * sin( uTime * 0.17 + ph * 0.1 );
    float bendK = aFlex.x * aFlex.x;
    transformed += wo * bendK * ws * gust * ( 0.18 + 0.06 * sin( uTime * 1.4 + ph ) );
    transformed += normal * sin( uTime * 6.5 + ph * 9.0 + position.y * 2.0 ) * 0.025 * aFlex.x * ( 0.3 + ws );
  }
`;

function windPatch(shader, leaves) {
  injectGlobals(shader);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aFlex;\nvarying vec3 vWorldT;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERT)
    .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWorldT = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;');
  if (leaves) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldT;')
      .replace('#include <alphatest_fragment>', `{
          vec2 dUv = fwidth( vMapUv ) * 1024.0;
          float lodA = log2( max( max( dUv.x, dUv.y ), 1.0 ) );
          diffuseColor.a *= 1.0 + min( lodA, 4.0 ) * 0.2;
        }
        #include <alphatest_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Vd = normalize( vWorldT - cameraPosition );
          float back = pow( max( dot( Vd, uSunDir ), 0.0 ), 3.0 );
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * 0.55;
        }`);
  } else {
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldT;');
  }
}

export function makeTreeMaterials(texgen, size, alphaToCoverage) {
  const mats = {};
  const barkTex = {};
  for (const k of Object.keys(BARK)) barkTex[k] = texgen.pair('bark-' + k, BARK[k], Math.min(512, size), { normalStrength: 6 });
  const leafTex = {};
  for (const k of Object.keys(LEAVES)) leafTex[k] = texgen.pair('leaf-' + k, LEAVES[k], Math.min(1024, size), { normalStrength: 2 });
  for (const k of Object.keys(NEEDLES)) leafTex[k] = texgen.pair('needle-' + k, NEEDLES[k], Math.min(1024, size), { normalStrength: 2 });
  for (const k of Object.keys(barkTex)) {
    const m = new THREE.MeshStandardMaterial({ map: barkTex[k].map, normalMap: barkTex[k].normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92, vertexColors: true });
    m.onBeforeCompile = (s) => windPatch(s, false);
    m.customProgramCacheKey = () => 'bark';
    mats['bark-' + k] = m;
  }
  for (const k of Object.keys(leafTex)) {
    const t = leafTex[k].map;
    t.anisotropy = 2;
    const m = new THREE.MeshStandardMaterial({
      map: t, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, vertexColors: true,
      alphaToCoverage: !!alphaToCoverage,
    });
    m.onBeforeCompile = (s) => windPatch(s, true);
    m.customProgramCacheKey = () => 'leaf';
    mats['leaf-' + k] = m;
    // Ombre portée : profondeur avec test alpha et vent
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.42, side: THREE.DoubleSide });
    dm.onBeforeCompile = (s) => {
      injectGlobals(s);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFlex;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERT);
    };
    dm.customProgramCacheKey = () => 'leafdepth';
    mats['leafdepth-' + k] = dm;
  }
  return mats;
}

// ------------------------------------------------------------------ imposteurs
export const IMPOSTOR_VIEWS = 8;

const IMP_VERT = /* glsl */ `
#include <common>
attribute vec4 aInst;   // xyz : base, w : lacet
attribute vec4 aInst2;  // x : échelle, y : rangée, z : teinte, w : -
uniform vec4 uRows[24]; // par rangée : largeur, hauteur, base y, -
uniform float uRowCount;
varying vec2 vUv0; varying vec2 vUv1; varying float vBlend; varying float vYaw0; varying float vYaw1;
varying vec3 vWorldT; varying float vTint;
${'#include <fog_pars_vertex>'}
void main() {
  vec4 row = uRows[ int( aInst2.y ) ];
  float sc = aInst2.x;
  vec3 base = aInst.xyz;
  vec3 toCam = cameraPosition - base;
  vec2 tc = normalize( toCam.xz + 1e-4 );
  vec3 right = vec3( tc.y, 0.0, -tc.x );
  float w = row.x * sc, h = row.y * sc;
  vec3 transformed = base + right * position.x * w * 0.5 + vec3( 0.0, ( position.y * h ) + row.z * sc, 0.0 );
  float ang = atan( toCam.x, toCam.z ) - aInst.w;
  float f = ang / ( 6.2831853 / ${IMPOSTOR_VIEWS}.0 );
  f = mod( f, ${IMPOSTOR_VIEWS}.0 );
  float f0 = floor( f ); float f1 = mod( f0 + 1.0, ${IMPOSTOR_VIEWS}.0 );
  vBlend = f - f0;
  vec2 cuv = vec2( position.x * 0.5 + 0.5, position.y );
  float rowV = ( aInst2.y + cuv.y ) / uRowCount;
  vUv0 = vec2( ( f0 + cuv.x ) / ${IMPOSTOR_VIEWS}.0, rowV );
  vUv1 = vec2( ( f1 + cuv.x ) / ${IMPOSTOR_VIEWS}.0, rowV );
  vYaw0 = f0 * 6.2831853 / ${IMPOSTOR_VIEWS}.0 + aInst.w;
  vYaw1 = f1 * 6.2831853 / ${IMPOSTOR_VIEWS}.0 + aInst.w;
  vTint = aInst2.z;
  vec4 mv = viewMatrix * vec4( transformed, 1.0 );
  gl_Position = projectionMatrix * mv;
  vWorldT = transformed;
  #ifdef USE_FOG
  vFogWorld = transformed;
  #endif
}`;

const IMP_FRAG = /* glsl */ `
#include <common>
uniform sampler2D tAlb; uniform sampler2D tNrm;
uniform vec3 uAmbSky; uniform vec3 uAmbGround;
varying vec2 vUv0; varying vec2 vUv1; varying float vBlend; varying float vYaw0; varying float vYaw1;
varying vec3 vWorldT; varying float vTint;
#ifdef USE_FOG
varying vec3 vFogWorld;
${FOG_FUNC}
#endif
vec3 toWorld( vec3 n, float yaw ) {
  float c = cos( yaw ), s = sin( yaw );
  vec3 right = vec3( c, 0.0, -s );
  vec3 back = vec3( s, 0.0, c );
  return normalize( right * n.x + vec3( 0.0, 1.0, 0.0 ) * n.y + back * n.z );
}
void main() {
  vec4 a0 = texture2D( tAlb, vUv0 ), a1 = texture2D( tAlb, vUv1 );
  vec4 a = mix( a0, a1, vBlend );
  if ( a.a < 0.5 ) discard;
  vec3 n0 = toWorld( texture2D( tNrm, vUv0 ).xyz * 2.0 - 1.0, vYaw0 );
  vec3 n1 = toWorld( texture2D( tNrm, vUv1 ).xyz * 2.0 - 1.0, vYaw1 );
  vec3 N = normalize( mix( n0, n1, vBlend ) );
  vec3 alb = a.rgb;
  alb *= mix( vec3( 1.0 ), vec3( 1.08, 0.96, 0.85 ), vTint );
  float ndl = max( dot( N, uSunDir ), 0.0 );
  vec3 amb = mix( uAmbGround, uAmbSky, N.y * 0.5 + 0.5 );
  vec3 Vd = normalize( vWorldT - cameraPosition );
  float back = pow( max( dot( Vd, uSunDir ), 0.0 ), 3.0 ) * 0.4;
  vec3 col = alb * ( amb + uSunColor * ( ndl * 0.85 + back ) * 2.6 );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Rend chaque variante sous 8 angles dans un atlas couleur + normales
export function captureImpostors(renderer, variants, frameW, frameH) {
  const rows = variants.length;
  const W = frameW * IMPOSTOR_VIEWS, H = frameH * rows;
  const mk = () => new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const rtA = mk(), rtN = mk();
  rtA.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const prevRT = renderer.getRenderTarget();
  const prevTM = renderer.toneMapping;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  const info = [];
  const normalMat = (map) => new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, useMap: { value: map ? 1 : 0 } },
    vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalize( normalMatrix * normal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: 'uniform sampler2D map; uniform float useMap; varying vec3 vN; varying vec2 vUv; void main(){ if ( useMap > 0.5 && texture2D( map, vUv ).a < 0.42 ) discard; vec3 n = normalize( vN ); if ( !gl_FrontFacing ) n = -n; gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 ); }',
    side: THREE.DoubleSide,
  });
  variants.forEach((v, row) => {
    const bark = new THREE.Mesh(v.bark, new THREE.MeshBasicMaterial({ map: v.barkMat.map, vertexColors: true }));
    const leaf = new THREE.Mesh(v.leaves, new THREE.MeshBasicMaterial({ map: v.leafMat.map, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }));
    const barkN = new THREE.Mesh(v.bark, normalMat(null));
    const leafN = new THREE.Mesh(v.leaves, normalMat(v.leafMat.map));
    const rad = v.radius, hgt = v.height + 0.5;
    info.push({ w: rad * 2, h: hgt, y: -0.4 });
    for (let k = 0; k < IMPOSTOR_VIEWS; k++) {
      const a = (k / IMPOSTOR_VIEWS) * Math.PI * 2;
      cam.left = -rad; cam.right = rad; cam.bottom = -0.4; cam.top = hgt - 0.4;
      cam.position.set(Math.sin(a) * 80, 0, Math.cos(a) * 80);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      for (const pass of [0, 1]) {
        const rt = pass === 0 ? rtA : rtN;
        scene.clear();
        if (pass === 0) scene.add(bark, leaf);
        else scene.add(barkN, leafN);
        rt.viewport.set(k * frameW, row * frameH, frameW, frameH);
        rt.scissor.set(k * frameW, row * frameH, frameW, frameH);
        rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        if (pass === 0) renderer.setClearColor(0x2a2a20, 0);
        else renderer.setClearColor(0x8080ff, 0);
        renderer.clear();
        renderer.render(scene, cam);
      }
    }
    bark.material.dispose(); leaf.material.dispose(); barkN.material.dispose(); leafN.material.dispose();
  });
  rtA.scissorTest = rtN.scissorTest = false;
  rtA.viewport.set(0, 0, W, H);
  rtN.viewport.set(0, 0, W, H);
  renderer.setRenderTarget(prevRT);
  renderer.toneMapping = prevTM;
  renderer.setClearColor(prevClear, prevAlpha);
  return { tAlb: rtA.texture, tNrm: rtN.texture, info, rows, rts: [rtA, rtN] };
}

export function makeImpostorMesh(atlas, capacity) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const inst2 = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  inst.setUsage(THREE.DynamicDrawUsage);
  inst2.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInst', inst);
  geo.setAttribute('aInst2', inst2);
  geo.instanceCount = 0;
  const rows = atlas.info.map((r) => new THREE.Vector4(r.w, r.h, r.y, 0));
  while (rows.length < 24) rows.push(new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tAlb: { value: atlas.tAlb }, tNrm: { value: atlas.tNrm },
      uRows: { value: rows }, uRowCount: { value: atlas.rows },
      uAmbSky: { value: new THREE.Color(0.3, 0.36, 0.45) }, uAmbGround: { value: new THREE.Color(0.12, 0.11, 0.08) },
    },
    vertexShader: IMP_VERT,
    fragmentShader: IMP_FRAG,
    fog: true,
  });
  mat.uniforms.fogColor = { value: new THREE.Color() };
  mat.uniforms.fogDensity = { value: 0 };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
