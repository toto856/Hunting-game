// Construction procédurale d'un quadrupède : maillage lissé (corps, pattes, queue, oreilles),
// squelette, poids de peau et coordonnées de texture (atlas du pelage).
import * as THREE from 'three';

// Atlas : corps 0..0.72 (x) ; pattes 0.72..1 sur y 0..0.84 ; queue/oreilles au-dessus
export const ATLAS = {
  body: [0, 0, 0.72, 1],
  leg: (i) => [0.72 + i * 0.07, 0, 0.07, 0.84],
  tail: [0.72, 0.84, 0.14, 0.16],
  ear: [0.86, 0.84, 0.14, 0.16],
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Interpolation des stations du profil
export function sampleBody(spec, n, sex = 'm') {
  const B = spec.body;
  const out = [];
  const m = B.length;
  const maneK = sex === 'm' ? spec.mane : spec.mane * 0.25;
  for (let k = 0; k < n; k++) {
    const f = (k / (n - 1)) * (m - 1);
    const i = Math.min(m - 2, Math.floor(f));
    const t = f - i;
    const get = (j, c) => B[Math.max(0, Math.min(m - 1, j))][c];
    const v = [0, 1, 2, 3, 4].map((c) => catmull(get(i - 1, c), get(i, c), get(i + 1, c), get(i + 2, c), t));
    // Femelles : cou plus fin, tête plus fine
    let [z, y, dT, dB, w] = v;
    if (sex === 'f' && f >= spec.neckStart - 0.5) {
      const nk = Math.min(1, (f - spec.neckStart + 0.5) / 2);
      dT *= 1 - 0.22 * nk; dB *= 1 - 0.25 * nk; w *= 1 - 0.18 * nk;
    }
    // Crinière (cerf en rut, sanglier) : cou plus épais dessous / crête dorsale
    if (maneK > 0 && f >= spec.neckStart - 1 && f < spec.headStart) {
      const mk = Math.sin(Math.PI * Math.min(1, (f - spec.neckStart + 1) / (spec.headStart - spec.neckStart + 1)));
      dB *= 1 + maneK * 0.35 * mk;
      dT *= 1 + maneK * 0.12 * mk;
      w *= 1 + maneK * 0.12 * mk;
    }
    out.push({ z, y, dT, dB, w, f });
  }
  // Tangentes dans le plan sagittal
  for (let k = 0; k < n; k++) {
    const a = out[Math.max(0, k - 1)], b = out[Math.min(n - 1, k + 1)];
    const tz = b.z - a.z, ty = b.y - a.y;
    const l = Math.hypot(tz, ty) || 1;
    out[k].tz = tz / l;
    out[k].ty = ty / l;
  }
  return out;
}

// Point de surface du corps pour (station, angle a) ; a = 0 sous le ventre, π au-dessus
export function bodyPoint(spec, st, a, out = new THREE.Vector3(), nrmOut = null) {
  // Transitions douces corps -> cou -> tête (évite une marche au garrot)
  const wNeck = smooth01((st.f - (spec.neckStart - 1.2)) / 2.4);
  const wHead = smooth01((st.f - (spec.headStart - 0.7)) / 1.4);
  const n = lerp3(2.1, 2.05, 2.0, wNeck, wHead);
  const s = Math.sin(a), c = -Math.cos(a);
  const ex = 2 / n;
  const x0 = st.w * Math.sign(s) * Math.pow(Math.abs(s), ex);
  let y = (c > 0 ? st.dT : st.dB) * Math.sign(c) * Math.pow(Math.abs(c), ex);
  const top = Math.max(0, c), bot = Math.max(0, -c);
  // Corps : dos étroit, flancs pleins, cuisses, épaules, bréchet étroit
  let xb = x0;
  {
    const fi = st.f;
    const rearK = smooth01((spec.body.length * 0.3 - fi) / (spec.body.length * 0.18));
    const chestK = smooth01((fi - spec.neckStart * 0.55) / (spec.neckStart * 0.35));
    xb *= 1 - 0.2 * Math.pow(top, 2.2) + 0.05 * (1 - c * c);
    xb *= 1 + 0.2 * rearK * Math.exp(-Math.pow((c + 0.3) / 0.38, 2));
    xb *= 1 + 0.07 * chestK * Math.exp(-Math.pow((c - 0.25) / 0.3, 2));
    xb *= 1 - 0.32 * chestK * Math.pow(bot, 2.2);
  }
  // Cou : comprimé latéralement, gorge arrondie
  const xn = x0 * (1 - 0.1 * Math.pow(top, 2));
  // Tête : chanfrein étroit, joues/mâchoire plus larges à l'arrière
  const hk = Math.max(0, (st.f - spec.headStart) / Math.max(1, spec.body.length - 1 - spec.headStart));
  let xh = x0 * (1 - 0.32 * Math.pow(top, 2) * (0.35 + hk));
  xh *= 1 + 0.16 * Math.pow(bot, 1.3) * (1 - hk) * (1 - hk);
  const x = lerp3(xb, xn, xh, wNeck, wHead);
  if (c < 0) y *= 1 - 0.12 * hk * wHead;
  // Repère : tangente T (dans yz), U perpendiculaire "dessus", L latéral (x)
  const Uy = st.tz, Uz = -st.ty;
  out.set(x, st.y + Uy * y, st.z + Uz * y);
  if (nrmOut) {
    const nx = Math.sign(s) * Math.pow(Math.abs(s), 2 - ex) / Math.max(st.w, 1e-3);
    const ny = Math.sign(c) * Math.pow(Math.abs(c), 2 - ex) / Math.max(c > 0 ? st.dT : st.dB, 1e-3);
    nrmOut.set(nx, Uy * ny, Uz * ny).normalize();
  }
  return out;
}

function lerp3(a, b, c, w1, w2) {
  const ab = a + (b - a) * w1;
  return ab + (c - ab) * w2;
}

// Demi-largeur de la surface du corps à (z, y) — sert à poser les yeux à fleur de peau
export function surfaceX(spec, z, y) {
  const st = sampleBody(spec, 160);
  let k = 0;
  for (let i = 0; i < st.length; i++) if (Math.abs(st[i].z - z) < Math.abs(st[k].z - z)) k = i;
  const s = st[k];
  let best = 0, bd = 9;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI;
    bodyPoint(spec, s, a, p);
    const d = Math.abs(p.y - y) + Math.abs(p.z - z) * 0.5;
    if (d < bd) { bd = d; best = p.x; }
  }
  return best;
}

function smooth01(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

// Os : [nom, parent, position monde (bind)]
export function boneLayout(spec) {
  const B = spec.body;
  const at = (fi) => {
    const i = Math.floor(fi), t = fi - i;
    const a = B[Math.min(B.length - 1, i)], b = B[Math.min(B.length - 1, i + 1)];
    return [0, a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t];
  };
  const fr = spec.front.pts, rr = spec.rear.pts;
  const ns = spec.neckStart, hs = spec.headStart;
  const L = [
    ['root', null, [0, 0, 0]],
    ['pelvis', 'root', at(3.2)],
    ['spine1', 'pelvis', at(5.5)],
    ['spine2', 'spine1', at(ns * 0.68)],
    ['spine3', 'spine2', at(ns - 1.3)],
    ['neck1', 'spine3', at(ns + 0.4)],
    ['neck2', 'neck1', at((ns + hs) / 2 + 0.3)],
    ['head', 'neck2', at(hs + 0.2)],
    ['tail1', 'pelvis', spec.tail.base.slice(0)],
    ['tail2', 'tail1', [0, spec.tail.base[1] - spec.tail.len * 0.55, spec.tail.base[2] - spec.tail.len * 0.25]],
  ];
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const p = (q) => [q[0] * side, q[1], q[2]];
    L.push(['fUpper' + S, 'spine3', p(fr[0])], ['fLower' + S, 'fUpper' + S, p(fr[1])], ['fKnee' + S, 'fLower' + S, p(fr[2])], ['fFet' + S, 'fKnee' + S, p(fr[3])], ['fHoof' + S, 'fFet' + S, p(fr[4])]);
    L.push(['rUpper' + S, 'pelvis', p(rr[0])], ['rStifle' + S, 'rUpper' + S, p(rr[1])], ['rHock' + S, 'rStifle' + S, p(rr[2])], ['rFet' + S, 'rHock' + S, p(rr[3])], ['rHoof' + S, 'rFet' + S, p(rr[4])]);
    const e = spec.ear.base;
    L.push(['ear' + S, 'head', [e[0] * side, e[1], e[2]]]);
  }
  return L;
}

class MeshData {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.uv1 = []; this.si = []; this.sw = []; this.idx = []; this.reg = [];
  }
  get n() { return this.pos.length / 3; }
  add(p, n, u, v, u1, v1, bones, region = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.uv1.push(u1, v1);
    const b = bones.slice(0, 4).sort((a, c) => c[1] - a[1]);
    let tot = 0;
    for (const x of b) tot += x[1];
    for (let i = 0; i < 4; i++) {
      this.si.push(b[i] ? b[i][0] : 0);
      this.sw.push(b[i] ? b[i][1] / tot : 0);
    }
    this.reg.push(region);
  }
}

// Construit la géométrie skinnée d'un animal
export function buildRig(spec, sex, lod) {
  const nSt = [70, 38, 20][lod];
  const nRing = [30, 18, 10][lod];
  const nLeg = [14, 8, 5][lod];
  const nLegRing = [12, 8, 6][lod];
  const layout = boneLayout(spec);
  const bones = [];
  const byName = {};
  const worldPos = {};
  for (const [name, parent, wp] of layout) {
    const b = new THREE.Bone();
    b.name = name;
    worldPos[name] = new THREE.Vector3(...wp);
    if (parent) {
      b.position.copy(worldPos[name]).sub(worldPos[parent]);
      byName[parent].add(b);
    } else b.position.copy(worldPos[name]);
    byName[name] = b;
    bones.push(b);
  }
  const bi = (name) => bones.indexOf(byName[name]);
  const md = new MeshData();
  const st = sampleBody(spec, nSt, sex);
  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
  // Chaîne vertébrale pour les poids
  const chain = ['pelvis', 'spine1', 'spine2', 'spine3', 'neck1', 'neck2', 'head'].map((n) => ({ n, i: bi(n), p: worldPos[n] }));
  const chainWeights = (p) => {
    // Projection sur la polyligne des vertèbres
    if (p.z <= chain[0].p.z) return [[chain[0].i, 1]];
    let best = null;
    for (let k = 0; k < chain.length - 1; k++) {
      const a = chain[k].p, b = chain[k + 1].p;
      const abz = b.z - a.z, aby = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.z - a.z) * abz + (p.y - a.y) * aby) / (abz * abz + aby * aby)));
      const dz = a.z + abz * t - p.z, dy = a.y + aby * t - p.y;
      const d = dz * dz + dy * dy;
      if (!best || d < best.d) best = { d, k, t };
    }
    if (best.k === chain.length - 2 && best.t >= 0.999) return [[chain[chain.length - 1].i, 1]];
    const t = best.t;
    return [[chain[best.k].i, 1 - t], [chain[best.k + 1].i, t]];
  };
  const fr = spec.front.pts, rr = spec.rear.pts;
  const bodyLen = st[st.length - 1].z - st[0].z;
  let arc = 0;
  const arcs = st.map((s, k) => {
    if (k > 0) arc += Math.hypot(s.z - st[k - 1].z, s.y - st[k - 1].y);
    return arc;
  });
  // ---- Corps
  const [bx, by, bw, bh] = ATLAS.body;
  for (let k = 0; k < nSt; k++) {
    const s = st[k];
    const circ = 2 * Math.PI * Math.sqrt((s.w * s.w + ((s.dT + s.dB) / 2) ** 2) / 2);
    for (let j = 0; j <= nRing; j++) {
      const a = (j / nRing) * Math.PI * 2;
      bodyPoint(spec, s, a, tmp, nrm);
      if (k === 0 || k === nSt - 1) nrm.set(0, 0, k === 0 ? -1 : 1).lerp(nrm, 0.3).normalize();
      let w = chainWeights(tmp);
      // Influence des pattes sur l'épaule et la cuisse
      const side = tmp.x >= 0 ? 'L' : 'R';
      const sx = Math.abs(tmp.x);
      const fdx = sx - fr[0][0], fdy = tmp.y - fr[0][1], fdz = tmp.z - fr[0][2];
      const fd = Math.sqrt(fdx * fdx + fdy * fdy * 0.8 + fdz * fdz);
      const fk = Math.max(0, 1 - fd / 0.34) * (tmp.y < fr[0][1] + 0.1 ? 1 : 0.35);
      const rdx = sx - rr[0][0], rdy = tmp.y - (rr[0][1] + rr[1][1]) / 2, rdz = tmp.z - (rr[0][2] + rr[1][2]) / 2;
      const rd = Math.sqrt(rdx * rdx + rdy * rdy * 0.6 + rdz * rdz);
      const rk = Math.max(0, 1 - rd / 0.42) * (tmp.y < rr[0][1] + 0.08 ? 1 : 0.4);
      const scale = spec.body[4][4] / 0.215; // espèces plus petites : rayons proportionnels
      const fks = Math.max(0, 1 - fd / (0.34 * scale)) * (tmp.y < fr[0][1] + 0.1 * scale ? 1 : 0.35);
      const rks = Math.max(0, 1 - rd / (0.42 * scale)) * (tmp.y < rr[0][1] + 0.08 * scale ? 1 : 0.4);
      void fk; void rk;
      w = w.map(([i, x]) => [i, x * (1 - Math.max(fks * 0.75, rks * 0.85))]);
      if (fks > 0) w.push([bi('fUpper' + side), fks * 0.75]);
      if (rks > 0) w.push([bi('rUpper' + side), rks * 0.85]);
      // Régions continues (corps 0..0.7, cou 1..1.45, tête 2) : longueur de poil fondue d'une zone à l'autre
      const region = s.f >= spec.headStart ? 2
        : s.f >= spec.neckStart ? 1 + 0.45 * smooth01((s.f - (spec.headStart - 1.2)) / 1.2)
          : 0.7 * smooth01((s.f - (spec.neckStart - 1.5)) / 1.5);
      md.add(tmp, nrm, bx + (k / (nSt - 1)) * bw, by + (j / nRing) * bh, arcs[k] / 0.05, (j / nRing) * circ / 0.05, w, region);
    }
  }
  for (let k = 0; k < nSt - 1; k++)
    for (let j = 0; j < nRing; j++) {
      const a = k * (nRing + 1) + j, b = a + 1, c = a + nRing + 1, d = c + 1;
      md.idx.push(a, b, c, b, d, c);
    }

  // ---- Pattes (avant puis arrière, gauche puis droite)
  const legs = [];
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    legs.push({ def: spec.front, names: ['fUpper', 'fLower', 'fKnee', 'fFet', 'fHoof'].map((n) => n + S), side, front: true });
    legs.push({ def: spec.rear, names: ['rUpper', 'rStifle', 'rHock', 'rFet', 'rHoof'].map((n) => n + S), side, front: false });
  }
  legs.forEach((leg, li) => {
    const pts = leg.def.pts.map((q) => new THREE.Vector3(q[0] * leg.side, q[1], q[2]));
    const radii = leg.def.r;
    // On démarre sous la ligne du ventre (à startY), en remontant dans le corps
    const startY = leg.def.startY;
    const seg0 = leg.front ? 0 : 0;
    const top = pts[seg0].clone().lerp(pts[seg0 + 1], Math.max(0, Math.min(1, (pts[seg0].y - startY) / (pts[seg0].y - pts[seg0 + 1].y))));
    const path = [top, ...pts.slice(seg0 + 1)];
    const pr = [radii[0], ...radii.slice(1)];
    const pathNames = leg.names.slice(seg0);
    // Échantillonnage le long du chemin
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
    const total = lens[lens.length - 1];
    const [lx, ly, lw, lh] = ATLAS.leg(li);
    const startIdx = md.n;
    const N = nLeg + 3;
    for (let k = 0; k <= N; k++) {
      const d = (k / N) * total;
      let i = 0;
      while (i < lens.length - 2 && lens[i + 1] < d) i++;
      const t = (d - lens[i]) / Math.max(1e-5, lens[i + 1] - lens[i]);
      const c = path[i].clone().lerp(path[i + 1], t);
      let r = pr[i] + (pr[i + 1] - pr[i]) * t;
      // Renflement musculaire (avant-bras / jarret) et finesse du canon
      if (i === 0) r *= 1 + 0.22 * Math.sin(Math.PI * t);
      if (i === 1 && leg.front) r *= 1 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.12 * t;
      if (i === 1 && !leg.front) r *= 1 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t * 0.5);
      const isHoof = i === path.length - 2 && t > 0.35;
      const dir = new THREE.Vector3().subVectors(path[i + 1], path[i]).normalize();
      const right = new THREE.Vector3(1, 0, 0);
      const fwd = new THREE.Vector3().crossVectors(right, dir).normalize();
      // Poids : os du segment, mélange près des articulations
      const bw2 = [];
      const blend = 0.22;
      if (t < blend && i > 0) {
        const k2 = 0.5 + 0.5 * (t / blend);
        bw2.push([bi(pathNames[i]), k2], [bi(pathNames[i - 1]), 1 - k2]);
      } else if (t > 1 - blend && i < path.length - 2) {
        const k2 = 0.5 + 0.5 * ((1 - t) / blend);
        bw2.push([bi(pathNames[i]), k2], [bi(pathNames[i + 1]), 1 - k2]);
      } else bw2.push([bi(pathNames[i]), 1]);
      if (i === 0 && t < 0.3) {
        // Raccord avec le corps
        const body = chainWeights(c);
        const kk = (0.3 - t) / 0.3 * 0.5;
        for (const b of bw2) b[1] *= 1 - kk;
        for (const b of body) bw2.push([b[0], b[1] * kk]);
      }
      for (let j = 0; j <= nLegRing; j++) {
        const a = (j / nLegRing) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        // Section : canon plus étroit latéralement, sabot en coin
        let rx = r * (i >= 2 ? 0.78 : i === 0 ? 0.8 : 0.9), rz = r * (i >= 2 ? 1.15 : i === 0 ? 1.3 : 1.05);
        if (isHoof) { rx *= 0.95; rz *= 1.25; }
        const p = c.clone().addScaledVector(right, sa * rx).addScaledVector(fwd, ca * rz);
        const nn = new THREE.Vector3().addScaledVector(right, sa / rx).addScaledVector(fwd, ca / rz).normalize();
        md.add(p, nn, lx + (j / nLegRing) * lw, ly + (k / N) * lh, d / 0.05, (j / nLegRing) * (2 * Math.PI * r) / 0.05, bw2, 3);
      }
    }
    for (let k = 0; k < N; k++)
      for (let j = 0; j < nLegRing; j++) {
        const a = startIdx + k * (nLegRing + 1) + j, b = a + 1, c = a + nLegRing + 1, d = c + 1;
        md.idx.push(a, c, b, b, c, d);
      }
    // Semelle du sabot (fermeture)
    const last = startIdx + N * (nLegRing + 1);
    const center = md.n;
    md.add(path[path.length - 1], new THREE.Vector3(0, -1, 0), lx + lw / 2, ly + lh, 0, 0, [[bi(pathNames[pathNames.length - 1]), 1]], 3);
    for (let j = 0; j < nLegRing; j++) md.idx.push(last + j, last + j + 1, center);
  });

  // ---- Queue
  {
    const T = spec.tail;
    const n = Math.max(3, [6, 4, 3][lod]);
    const ring = [8, 6, 5][lod];
    const start = md.n;
    const [tx, ty, tw, th] = ATLAS.tail;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const ang = T.droop * t * 0.9 + 0.5;
      const c = new THREE.Vector3(0, T.base[1] - Math.sin(ang) * T.len * t, T.base[2] - Math.cos(ang) * T.len * t * 0.6);
      const r = T.r * (1 - t * 0.55) * (t > 0.85 ? 0.6 : 1);
      const wts = t < 0.5 ? [[bi('tail1'), 1]] : [[bi('tail2'), 1]];
      for (let j = 0; j <= ring; j++) {
        const a = (j / ring) * Math.PI * 2;
        const p = c.clone().add(new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r * 0.55, Math.cos(a) * r * 0.8));
        md.add(p, new THREE.Vector3(Math.sin(a), Math.cos(a) * 0.6, Math.cos(a) * 0.5).normalize(), tx + (j / ring) * tw, ty + t * th, t * 4, j / ring * 2, wts, 4);
      }
    }
    for (let k = 0; k < n; k++)
      for (let j = 0; j < ring; j++) {
        const a = start + k * (ring + 1) + j, b = a + 1, c = a + ring + 1, d = c + 1;
        md.idx.push(a, c, b, b, c, d);
      }
  }

  // ---- Oreilles : cornet roulé à la base, s'aplatissant vers la pointe, bord épais ;
  // face interne (concave, claire) tournée vers l'avant et l'extérieur
  const quad = (a, b, c, d, want) => {
    // Triangles (a, b, c) et (b, d, c) orientés selon la normale voulue
    const P = (i) => new THREE.Vector3(md.pos[i * 3], md.pos[i * 3 + 1], md.pos[i * 3 + 2]);
    const pa = P(a), nrm = new THREE.Vector3().crossVectors(P(b).sub(pa), P(c).sub(pa));
    if (nrm.dot(want) >= 0) md.idx.push(a, b, c, b, d, c);
    else md.idx.push(a, c, b, b, c, d);
  };
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const E = spec.ear;
    const base = new THREE.Vector3(E.base[0] * side, E.base[1], E.base[2]);
    const nu = [9, 6, 3][lod], nv = [6, 4, 2][lod];
    const [ex, ey, ew, eh] = ATLAS.ear;
    const W8 = [[bi('ear' + S), 1]];
    const up = new THREE.Vector3(side * Math.sin(E.tilt) * E.spread, Math.cos(E.tilt), -0.35).normalize();
    const out = new THREE.Vector3(side * 0.62, 0.12, 0.78);
    out.addScaledVector(up, -out.dot(up)).normalize();
    const across = new THREE.Vector3().crossVectors(up, out).normalize();
    const grid = (face) => {
      const st = md.n;
      for (let i = 0; i <= nu; i++) {
        const t = i / nu;
        const width = E.w * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 1.05))) * (1 - t * t * t) + 0.002;
        const span = 2.5 - 1.5 * t; // angle d'enroulement de la section
        const rho = width / span;
        const th = (0.007 - 0.0045 * t) * (spec.id === 'sanglier' ? 1.4 : 1);
        for (let j = 0; j <= nv; j++) {
          const v = j / nv - 0.5;
          const a = v * span;
          const nIn = across.clone().multiplyScalar(-Math.sin(a)).addScaledVector(out, Math.cos(a));
          const p = base.clone().addScaledVector(up, t * E.len).addScaledVector(across, rho * Math.sin(a)).addScaledVector(out, rho * (1 - Math.cos(a)) - rho * 0.35);
          if (face > 0) p.addScaledVector(nIn, th);
          md.add(p, face > 0 ? nIn : nIn.clone().negate(), ex + (j / nv) * ew * 0.5 + (face > 0 ? ew * 0.5 : 0), ey + t * eh, t, v, W8, 5);
        }
      }
      return st;
    };
    const o0 = grid(-1), i0 = grid(1);
    const at = (st, i, j) => st + i * (nv + 1) + j;
    const tmpN = new THREE.Vector3();
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a2 = ((j + 0.5) / nv - 0.5) * (2.5 - 1.5 * (i + 0.5) / nu);
        tmpN.copy(across).multiplyScalar(-Math.sin(a2)).addScaledVector(out, Math.cos(a2));
        quad(at(i0, i, j), at(i0, i, j + 1), at(i0, i + 1, j), at(i0, i + 1, j + 1), tmpN);
        quad(at(o0, i, j), at(o0, i, j + 1), at(o0, i + 1, j), at(o0, i + 1, j + 1), tmpN.clone().negate());
      }
    // Bord : relie les deux faces le long des deux lisières
    for (const j of [0, nv]) {
      const sgn = j === 0 ? -1 : 1;
      for (let i = 0; i < nu; i++) {
        const a2 = sgn * 0.5 * (2.5 - 1.5 * (i + 0.5) / nu);
        tmpN.copy(across).multiplyScalar(Math.cos(a2) * sgn).addScaledVector(out, Math.sin(a2) * sgn);
        quad(at(o0, i, j), at(i0, i, j), at(o0, i + 1, j), at(i0, i + 1, j), tmpN);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(md.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(md.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(md.uv, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(md.uv1, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(md.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(md.sw, 4));
  g.setAttribute('aRegion', new THREE.Float32BufferAttribute(md.reg, 1));
  // Atténuation des poils (0 : fourrure normale ; 1 : aucune), utilisée au ras des coupes des trophées
  g.setAttribute('aCut', new THREE.Float32BufferAttribute(new Float32Array(md.reg.length), 1));
  g.setIndex(md.idx);
  // Normales lissées (le corps et les pattes se raccordent mieux)
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, bones, byName, worldPos, stations: st, bodyLen };
}
