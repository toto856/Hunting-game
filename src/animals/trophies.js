// Trophées : génération des paramètres (bois, cornes, défenses) selon l'âge et la génétique,
// calcul d'une cotation de type CIC, et géométrie 3D correspondante.
import * as THREE from 'three';
import { rng, clamp, lerp } from '../core/math.js';
import { makeNoise } from '../core/noise.js';
import { MEDALS, medalFor } from './species.js';

// ------------------------------------------------------------------ paramètres
// q : qualité génétique 0..1 ; age : classe d'âge 0..1 (jeune -> vieux)
export function makeTrophy(species, seed, q, age, legendary = false) {
  const r = rng(seed);
  const k = clamp(q * 0.65 + age * 0.45 + (legendary ? 0.35 : 0), 0, 1.25);
  const asym = () => 1 + (r() - 0.5) * 0.08;
  if (species === 'cerf') {
    const beam = lerp(72, 112, k) * r.range(0.95, 1.05);
    const perSide = clamp(Math.round(lerp(3, 7.4, k) + r.range(-0.6, 0.6)), 3, 10);
    const crown = clamp(perSide - 3 - (r() < 0.3 ? 1 : 0), 0, 7);
    const t = {
      kind: 'cerf', seed, legendary,
      beamL: beam * asym(), beamR: beam * asym(),
      pointsL: perSide, pointsR: clamp(perSide + (r() < 0.35 ? (r() < 0.5 ? -1 : 1) : 0), 3, 10),
      crownL: crown, crownR: crown,
      brow: lerp(24, 40, k) * r.range(0.9, 1.1),
      trez: lerp(18, 34, k) * r.range(0.9, 1.1),
      bez: r() < 0.25 + k * 0.5,
      coronet: lerp(19, 27, k) * r.range(0.96, 1.04),
      thick: lerp(11.5, 17.5, k) * r.range(0.95, 1.05),
      spread: lerp(60, 98, k) * r.range(0.9, 1.08),
      weight: lerp(3.0, 9.8, Math.pow(k, 1.2)) * r.range(0.92, 1.08),
    };
    return scoreCerf(t);
  }
  if (species === 'chevreuil') {
    const t = {
      kind: 'chevreuil', seed, legendary,
      len: lerp(16, 28, k) * r.range(0.93, 1.07),
      points: k < 0.25 ? (r() < 0.6 ? 2 : 3) : k > 1.0 && r() < 0.25 ? 4 : 3,
      pearl: lerp(0.3, 1, k) * r.range(0.85, 1.1),
      spread: lerp(7, 15, r()),
      weight: lerp(180, 560, Math.pow(k, 1.3)) * r.range(0.9, 1.1),
      coronet: lerp(10, 16, k),
    };
    return scoreChevreuil(t);
  }
  if (species === 'sanglier') {
    const t = {
      kind: 'sanglier', seed, legendary,
      lowerL: lerp(13, 24, k) * r.range(0.95, 1.05),
      lowerW: lerp(1.9, 2.9, k) * r.range(0.95, 1.05),
      upperW: lerp(2.2, 3.4, k) * r.range(0.95, 1.05),
    };
    return scoreSanglier(t);
  }
  if (species === 'chamois') {
    const t = {
      kind: 'chamois', seed, legendary,
      len: lerp(19, 28.5, k) * r.range(0.96, 1.04),
      base: lerp(7.6, 10.4, k) * r.range(0.96, 1.04),
      height: lerp(15, 21, k),
      hook: lerp(0.8, 1.15, r()),
      spread: lerp(10, 18, r()),
    };
    return scoreChamois(t);
  }
  if (species === 'daim') {
    const t = {
      kind: 'daim', seed, legendary,
      beam: lerp(48, 72, k) * r.range(0.95, 1.05),
      palmL: lerp(20, 38, k) * r.range(0.94, 1.06),
      palmW: lerp(7, 17, k) * r.range(0.92, 1.08),
      spellers: clamp(Math.round(lerp(3, 9, k) + r.range(-1, 1)), 2, 11),
      brow: lerp(12, 22, k),
      trez: lerp(10, 20, k),
      weight: lerp(1.6, 4.4, Math.pow(k, 1.2)) * r.range(0.92, 1.08),
      spread: lerp(42, 70, r()),
    };
    return scoreDaim(t);
  }
  return null;
}

// Cotations (formules simplifiées inspirées des barèmes CIC), recalées sur les barèmes
// pour que la plupart des animaux adultes donnent bronze/argent, l'or reste rare et le diamant exceptionnel.
const RAW = { cerf: [116.7, 202.9], chevreuil: [65.3, 147.6], sanglier: [94.5, 104.9], chamois: [96.5, 126.8], daim: [149.6, 214.0] };
function calib(species, raw) {
  const m = MEDALS[species];
  const [r0, r1] = RAW[species];
  const lo = m.bronze - 2.2 * (m.argent - m.bronze);
  const hi = m.diamant + 0.25 * (m.max - m.diamant);
  return Math.min(m.max, lo + ((raw - r0) / (r1 - r0)) * (hi - lo));
}
function finish(t, score, species) {
  t.raw = score;
  score = calib(species, score);
  t.score = Math.round(score * 100) / 100;
  t.medal = medalFor(species, t.score, t.legendary);
  return t;
}

function scoreCerf(t) {
  const avgBeam = (t.beamL + t.beamR) / 2;
  const pts = t.pointsL + t.pointsR;
  const crown = Math.min(10, (t.crownL + t.crownR) * 1.1);
  const spread = clamp((t.spread / avgBeam - 0.6) * 10, 0, 3);
  const s = avgBeam * 0.5 + t.brow * 0.25 + t.trez * 0.25 + t.coronet + t.thick * 2 + t.weight * 2 + pts * 1 + spread + crown + 12;
  t.points = pts;
  return finish(t, s, 'cerf');
}
function scoreChevreuil(t) {
  const s = t.weight * 0.1 + t.len * 1.4 + t.pearl * 6 + t.coronet * 0.9 + clamp(t.spread - 6, 0, 4) + (t.points * 2 - 4) * 1.5 + 8;
  t.pointsTotal = t.points * 2;
  return finish(t, s, 'chevreuil');
}
function scoreSanglier(t) {
  const s = t.lowerL * 1 + t.lowerW * 3 * 1.5 + t.upperW * 3 + 81;
  return finish(t, s * 0.5 + 40, 'sanglier');
}
function scoreChamois(t) {
  const s = t.len * 2 + t.base * 2 + t.height * 0.5 + clamp(t.spread - 8, 0, 6) * 0.5 + 33;
  return finish(t, s, 'chamois');
}
function scoreDaim(t) {
  const s = t.beam * 0.5 + t.palmL + t.palmW * 1.5 + t.weight * 2 + t.spellers * 1 + t.brow * 0.25 + t.trez * 0.25 + clamp(t.spread / t.beam * 10 - 6, 0, 4) + 79;
  t.points = t.spellers + 4;
  return finish(t, s, 'daim');
}

export function trophySummary(t) {
  if (!t) return '';
  if (t.kind === 'cerf') return `${t.points} cors · merrains ${Math.round((t.beamL + t.beamR) / 2)} cm · ${t.weight.toFixed(1)} kg`;
  if (t.kind === 'chevreuil') return `${t.pointsTotal} cors · ${Math.round(t.len)} cm · ${Math.round(t.weight)} g`;
  if (t.kind === 'sanglier') return `Défenses ${t.lowerL.toFixed(1)} cm · grès ${t.upperW.toFixed(1)} cm`;
  if (t.kind === 'chamois') return `Cornes ${t.len.toFixed(1)} cm · base ${t.base.toFixed(1)} cm`;
  if (t.kind === 'daim') return `Empaumures ${Math.round(t.palmL)} × ${Math.round(t.palmW)} cm · ${t.points} pointes`;
  return '';
}

// ------------------------------------------------------------------ géométrie
const _q = new THREE.Quaternion();

class AB {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Tube effilé le long d'une courbe, avec perlure (bruit) et teinte (base sombre, pointes ivoire)
function antlerTube(ab, curve, r0, r1, segs, rings, N, tipColor, baseColor, pearl = 0.15, tipLight = 0.35) {
  const frames = curve.computeFrenetFrames(segs, false);
  const start = ab.n;
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = lerp(r0, r1, Math.pow(t, 0.85)) * (t > 0.97 ? 0.5 : 1);
    const tipK = clamp((t - (1 - tipLight)) / tipLight, 0, 1);
    const c = [lerp(baseColor[0], tipColor[0], tipK), lerp(baseColor[1], tipColor[1], tipK), lerp(baseColor[2], tipColor[2], tipK)];
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      nn.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      const bump = 1 + pearl * (1 - t) * N.n3(p.x * 60 + j, p.y * 60, p.z * 60);
      ab.pos.push(p.x + nn.x * r * bump, p.y + nn.y * r * bump, p.z + nn.z * r * bump);
      ab.nrm.push(nn.x, nn.y, nn.z);
      ab.col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rings; j++) {
      const a = start + i * (rings + 1) + j, b = a + 1, c = a + rings + 1, d = c + 1;
      ab.idx.push(a, c, b, b, c, d);
    }
}

function coronet(ab, center, dir, r, N, color) {
  // Meule : anneau perlé à la base
  const rings = 14;
  const up = dir.clone().normalize();
  const t1 = new THREE.Vector3(1, 0, 0);
  if (Math.abs(up.x) > 0.9) t1.set(0, 0, 1);
  const b1 = new THREE.Vector3().crossVectors(up, t1).normalize();
  const b2 = new THREE.Vector3().crossVectors(up, b1).normalize();
  const start = ab.n;
  for (let i = 0; i <= 3; i++) {
    const y = (i / 3 - 0.5) * r * 0.6;
    const rr = r * (1.25 + 0.25 * Math.sin((i / 3) * Math.PI));
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      const bump = 1 + 0.18 * N.n3(j * 0.9, i, center.x * 50);
      const nn = b1.clone().multiplyScalar(Math.cos(a)).addScaledVector(b2, Math.sin(a));
      const p = center.clone().addScaledVector(up, y).addScaledVector(nn, rr * bump);
      ab.pos.push(p.x, p.y, p.z);
      ab.nrm.push(nn.x, nn.y, nn.z);
      ab.col.push(color[0], color[1], color[2]);
    }
  }
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < rings; j++) {
      const a = start + i * (rings + 1) + j, b = a + 1, c = a + rings + 1, d = c + 1;
      ab.idx.push(a, c, b, b, c, d);
    }
}

const BASE = [0.24, 0.17, 0.11], TIP = [0.86, 0.8, 0.68];

function cerfSide(ab, t, side, base, scale, N, r) {
  const cm = 0.01 * scale;
  const L = (side > 0 ? t.beamL : t.beamR) * cm;
  const pts = side > 0 ? t.pointsL : t.pointsR;
  const crown = side > 0 ? t.crownL : t.crownR;
  const rad = (t.thick / (2 * Math.PI)) * cm;
  const spreadK = t.spread / 85;
  // Merrain : monte vers l'extérieur et l'arrière, puis revient vers l'avant au sommet
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const beam = new THREE.CatmullRomCurve3([
    P(0, 0, 0),
    P(0.13 * L * spreadK, 0.18 * L, -0.12 * L),
    P(0.3 * L * spreadK, 0.42 * L, -0.24 * L),
    P(0.42 * L * spreadK, 0.66 * L, -0.24 * L),
    P(0.46 * L * spreadK, 0.84 * L, -0.12 * L),
    P(0.44 * L * spreadK, 0.97 * L, 0.02 * L),
  ]);
  coronet(ab, base, new THREE.Vector3(0.25 * side, 1, -0.3), rad * 1.15, N, BASE);
  antlerTube(ab, beam, rad, rad * 0.45, 22, 9, N, TIP, BASE, 0.12, 0.12);
  const tine = (t0, len, dir, rr) => {
    const p0 = beam.getPointAt(t0);
    const d = dir.clone().normalize();
    const mid = p0.clone().addScaledVector(d, len * 0.55).add(new THREE.Vector3(0, len * 0.12, 0));
    const end = p0.clone().addScaledVector(d, len).add(new THREE.Vector3(0, len * 0.32, 0));
    antlerTube(ab, new THREE.CatmullRomCurve3([p0, mid, end]), rr, rr * 0.18, 10, 7, N, TIP, BASE, 0.08, 0.45);
  };
  // Andouiller d'œil, surandouiller (bez), chevillure (trez)
  tine(0.06, t.brow * cm, new THREE.Vector3(0.12 * side, 0.15, 1), rad * 0.75);
  if (t.bez && pts >= 4) tine(0.15, t.brow * cm * 0.8, new THREE.Vector3(0.18 * side, 0.25, 1), rad * 0.62);
  if (pts >= 3) tine(0.42, t.trez * cm, new THREE.Vector3(0.1 * side, 0.15, 1), rad * 0.62);
  // Couronne : pointes en coupe au sommet
  const extra = Math.max(0, pts - 3 - (t.bez ? 1 : 0));
  const nCrown = Math.min(crown, extra);
  for (let i = 0; i < nCrown; i++) {
    const a = (i / Math.max(1, nCrown)) * Math.PI * 1.6 - 0.6;
    const t0 = 0.78 + (i % 2) * 0.06 + r() * 0.04;
    const d = new THREE.Vector3(Math.cos(a) * 0.6 * side + 0.15 * side, 1.2, Math.sin(a) * 0.9 + 0.2);
    tine(t0, (0.16 + r() * 0.1) * L * 0.55 + 0.04 * scale, d, rad * 0.5);
  }
  // Pointes supplémentaires hors couronne (andouillers moyens)
  for (let i = nCrown; i < extra; i++) tine(0.55 + 0.06 * (i - nCrown), t.trez * cm * 0.65, new THREE.Vector3(0.2 * side, 0.4, 0.9), rad * 0.5);
}

function chevreuilSide(ab, t, side, base, scale, N) {
  const cm = 0.01 * scale;
  const L = t.len * cm;
  const rad = 0.011 * scale * (0.8 + 0.4 * (t.weight / 400));
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const s = t.spread / 12;
  const beam = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.06 * L * s, 0.35 * L, -0.02 * L), P(0.12 * L * s, 0.7 * L, -0.05 * L), P(0.14 * L * s, 1.0 * L, 0.02 * L)]);
  coronet(ab, base, new THREE.Vector3(0.1 * side, 1, -0.1), rad * 1.45, N, BASE);
  antlerTube(ab, beam, rad, rad * 0.5, 14, 8, N, TIP, BASE, 0.35 * t.pearl, 0.15);
  const tine = (t0, len, dir, rr) => {
    const p0 = beam.getPointAt(t0);
    const end = p0.clone().addScaledVector(dir.normalize(), len);
    antlerTube(ab, new THREE.CatmullRomCurve3([p0, p0.clone().lerp(end, 0.5).add(new THREE.Vector3(0, len * 0.15, 0)), end]), rr, rr * 0.25, 8, 6, N, TIP, BASE, 0.2 * t.pearl, 0.4);
  };
  if (t.points >= 2) tine(0.52, L * 0.3, new THREE.Vector3(0.05 * side, 0.5, 1), rad * 0.7);
  if (t.points >= 3) tine(0.78, L * 0.26, new THREE.Vector3(0.05 * side, 0.4, -1), rad * 0.65);
  if (t.points >= 4) tine(0.35, L * 0.18, new THREE.Vector3(0.6 * side, 0.6, 0.2), rad * 0.55);
}

function daimSide(ab, t, side, base, scale, N) {
  const cm = 0.01 * scale;
  const L = t.beam * cm;
  const rad = 0.014 * scale * (0.85 + 0.25 * (t.weight / 3));
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const s = t.spread / 55;
  const stem = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.1 * L * s, 0.2 * L, -0.05 * L), P(0.2 * L * s, 0.38 * L, -0.08 * L)]);
  coronet(ab, base, new THREE.Vector3(0.2 * side, 1, -0.2), rad * 1.2, N, BASE);
  antlerTube(ab, stem, rad, rad * 0.85, 10, 8, N, TIP, BASE, 0.1, 0.0);
  const tine = (curve, t0, len, dir, rr) => {
    const p0 = curve.getPointAt(t0);
    const end = p0.clone().addScaledVector(dir.normalize(), len);
    antlerTube(ab, new THREE.CatmullRomCurve3([p0, p0.clone().lerp(end, 0.5).add(new THREE.Vector3(0, len * 0.18, 0)), end]), rr, rr * 0.2, 8, 6, N, TIP, BASE, 0.05, 0.4);
  };
  tine(stem, 0.1, t.brow * cm, new THREE.Vector3(0.1 * side, 0.25, 1), rad * 0.65);
  tine(stem, 0.75, t.trez * cm, new THREE.Vector3(0.15 * side, 0.25, 1), rad * 0.6);
  // Empaumure : lame plate courbée vers l'arrière, pointes (spellers) sur le bord postérieur
  const top = stem.getPointAt(1);
  const pl = t.palmL * cm, pw = t.palmW * cm;
  const nu = 10, nv = 5;
  const start = ab.n;
  const grid = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const width = pw * Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.15)) * (0.6 + 0.4 * u);
      const p = top.clone().add(new THREE.Vector3((0.1 + 0.25 * u) * pl * side * s, u * pl * 0.95, -0.15 * pl * u + (v - 0.3) * width * -1.0));
      p.x += side * Math.sin(v * Math.PI) * 0.012 * scale;
      const k = clamp(u * 1.2, 0, 1);
      ab.pos.push(p.x, p.y, p.z);
      ab.nrm.push(side, 0, 0);
      ab.col.push(lerp(BASE[0], 0.55, k * 0.6), lerp(BASE[1], 0.47, k * 0.6), lerp(BASE[2], 0.36, k * 0.6));
      grid.push(p);
    }
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = start + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      ab.idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
  // Épaisseur : seconde face décalée
  const start2 = ab.n;
  for (const p of grid) {
    ab.pos.push(p.x - side * 0.012 * scale, p.y, p.z);
    ab.nrm.push(-side, 0, 0);
    ab.col.push(0.42, 0.34, 0.25);
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = start2 + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
      ab.idx.push(a, b, c, b, d, c);
    }
  // Pointes du bord arrière
  for (let k = 0; k < t.spellers; k++) {
    const u = 0.3 + (k / Math.max(1, t.spellers - 1)) * 0.68;
    const i = Math.round(u * nu);
    const p0 = grid[i * (nv + 1) + nv];
    const end = p0.clone().add(new THREE.Vector3(0.01 * side * scale, 0.03 * scale, -0.045 * scale * (0.7 + 0.5 * Math.sin(k))));
    antlerTube(ab, new THREE.LineCurve3(p0, end), 0.006 * scale, 0.0015 * scale, 3, 5, N, TIP, [0.45, 0.37, 0.27], 0, 0.7);
  }
}

function chamoisSide(ab, t, side, base, scale, N) {
  const cm = 0.01 * scale;
  const L = t.len * cm * 0.85;
  const rad = (t.base / (2 * Math.PI)) * cm;
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const h = t.hook;
  const curve = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.02 * L, 0.35 * L, 0.03 * L), P(0.04 * L, 0.62 * L, -0.02 * L), P(0.05 * L, 0.72 * L, -0.18 * L * h), P(0.05 * L, 0.6 * L, -0.3 * L * h)]);
  const black = [0.05, 0.045, 0.04];
  antlerTube(ab, curve, rad, rad * 0.25, 18, 9, N, [0.12, 0.11, 0.1], black, 0.06, 0.2);
}

function sanglierSide(ab, t, side, base, scale, N) {
  const cm = 0.01 * scale;
  const ivory = [0.9, 0.86, 0.76], root = [0.75, 0.7, 0.6];
  // Défense inférieure : sort de la mâchoire et remonte en arc
  const L = t.lowerL * cm * 0.5;
  const r0 = (t.lowerW / 2) * cm * 0.6;
  const p0 = base.clone().add(new THREE.Vector3(0.012 * side * scale, -0.01 * scale, 0));
  const low = new THREE.CatmullRomCurve3([p0, p0.clone().add(new THREE.Vector3(0.018 * side * scale, 0.35 * L, -0.15 * L)), p0.clone().add(new THREE.Vector3(0.024 * side * scale, 0.7 * L, -0.55 * L)), p0.clone().add(new THREE.Vector3(0.018 * side * scale, 0.82 * L, -0.95 * L))]);
  antlerTube(ab, low, r0, r0 * 0.2, 12, 6, N, ivory, root, 0, 0.5);
  // Grès (défense supérieure)
  const q0 = base.clone().add(new THREE.Vector3(0.016 * side * scale, 0.012 * scale, -0.02 * scale));
  const up = new THREE.CatmullRomCurve3([q0, q0.clone().add(new THREE.Vector3(0.012 * side * scale, 0.02 * scale, -0.008 * scale)), q0.clone().add(new THREE.Vector3(0.016 * side * scale, 0.032 * scale, -0.03 * scale))]);
  antlerTube(ab, up, (t.upperW / 2) * cm * 0.45, 0.002 * scale, 6, 6, N, ivory, root, 0, 0.5);
}

export function buildTrophyGeometry(t, spec, scale = 1) {
  if (!t) return null;
  const ab = new AB();
  const N = makeNoise((t.seed || 1) % 100000);
  const r = rng(t.seed || 1);
  const b = spec.antlerBase;
  for (const side of [1, -1]) {
    const base = new THREE.Vector3(b[0] * side * scale, b[1] * scale, b[2] * scale);
    if (t.kind === 'cerf') cerfSide(ab, t, side, base, scale, N, r);
    else if (t.kind === 'chevreuil') chevreuilSide(ab, t, side, base, scale, N);
    else if (t.kind === 'daim') daimSide(ab, t, side, base, scale, N);
    else if (t.kind === 'chamois') chamoisSide(ab, t, side, base, scale, N);
    else if (t.kind === 'sanglier') sanglierSide(ab, t, side, base, scale, N);
  }
  return ab.build();
}

export const antlerMaterial = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });

export { MEDALS };
