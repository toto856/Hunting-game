// Trophées : génération des paramètres (bois, cornes, défenses) selon l'âge et la génétique,
// calcul d'une cotation de type CIC, et géométrie 3D correspondante.
import * as THREE from 'three';
import { rng, clamp, lerp, smoothstep, fmt } from '../core/math.js';
import { makeNoise } from '../core/noise.js';
import { MEDALS, medalFor } from './species.js';
import { injectGlobals } from '../gfx/globals.js';

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

// Appellation française du trophée (comme sur une plaque de salle de chasse)
export function trophyTitle(species, sex, t) {
  if (species === 'cerf') {
    if (!t || sex === 'f') return sex === 'f' ? 'Biche' : 'Cerf';
    const big = Math.max(t.pointsL, t.pointsR);
    return t.pointsL === t.pointsR ? `Cerf ${t.pointsL + t.pointsR} cors` : `Cerf ${big * 2} cors irrégulier`;
  }
  if (species === 'chevreuil') {
    if (!t || sex === 'f') return sex === 'f' ? 'Chevrette' : 'Brocard';
    return t.points <= 1 ? 'Brocard daguet' : `Brocard ${t.points * 2} cors`;
  }
  if (species === 'daim') {
    if (!t || sex === 'f') return sex === 'f' ? 'Daine' : 'Daim';
    return t.palmW < 9 ? 'Daim sous-palmé' : t.palmL >= 33 ? 'Grand daim palmé' : 'Daim palmé';
  }
  if (species === 'sanglier') {
    if (!t || sex === 'f') return sex === 'f' ? 'Laie' : 'Sanglier';
    return t.lowerL >= 21 ? 'Solitaire' : t.lowerL >= 18 ? 'Sanglier quartanier' : t.lowerL >= 15.5 ? 'Sanglier tiers-an' : 'Ragot';
  }
  if (species === 'chamois') return sex === 'f' ? 'Chamois chèvre' : 'Chamois bouc';
  return '';
}

export function trophySummary(t) {
  if (!t) return '';
  const d = (x) => fmt.dec(x, 1);
  if (t.kind === 'cerf') return `${t.pointsL} + ${t.pointsR} andouillers · merrains ${Math.round((t.beamL + t.beamR) / 2)} cm · ${d(t.weight)} kg`;
  if (t.kind === 'chevreuil') return `${t.pointsTotal} cors · ${Math.round(t.len)} cm · ${Math.round(t.weight)} g`;
  if (t.kind === 'sanglier') return `Défenses ${d(t.lowerL)} cm · grès ${d(t.upperW)} cm`;
  if (t.kind === 'chamois') return `Cornes ${d(t.len)} cm · base ${d(t.base)} cm`;
  if (t.kind === 'daim') return `Empaumures ${Math.round(t.palmL)} × ${Math.round(t.palmW)} cm · ${t.points} pointes`;
  return '';
}

// ------------------------------------------------------------------ géométrie
// Bois de cervidés, cornes et défenses : tubes effilés le long de courbes, meules perlées,
// gouttières et perlures (grossières dans la géométrie, fines dans le matériau), pointes
// polies couleur ivoire. Les couleurs sont données en sRGB puis linéarisées.
const lin = (c) => c.map((x) => Math.pow(x, 2.2));
const COL = {
  cerf: lin([0.2, 0.135, 0.08]), cerfRidge: lin([0.36, 0.27, 0.17]),
  chevreuil: lin([0.17, 0.11, 0.065]), chevRidge: lin([0.33, 0.24, 0.15]),
  daim: lin([0.4, 0.31, 0.2]), daimRidge: lin([0.56, 0.46, 0.33]),
  ivory: lin([0.93, 0.89, 0.79]), horn: lin([0.07, 0.06, 0.055]), hornTip: lin([0.12, 0.11, 0.1]),
  tusk: lin([0.92, 0.88, 0.76]), tuskRoot: lin([0.78, 0.7, 0.52]), bone: lin([0.86, 0.82, 0.72]),
};

class AB {
  constructor() { this.pos = []; this.col = []; this.pearl = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  v(x, y, z, c, k) { this.pos.push(x, y, z); this.col.push(c[0], c[1], c[2]); this.pearl.push(k); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPearl', new THREE.Float32BufferAttribute(this.pearl, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3();

// Tube effilé. o : { r0, r1, segs, rings, pearl, grooves, oval, flare, tipLen, sharp, base, ridge, tip, rings2 }
function antlerTube(ab, curve, N, o) {
  const segs = o.segs || 16, rings = o.rings || 12;
  const frames = curve.computeFrenetFrames(segs, false);
  const start = ab.n;
  const grooves = o.grooves ?? 5;
  const ridge = o.ridge || o.base;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, _p);
    let r = lerp(o.r0, o.r1, Math.pow(t, o.taper ?? 0.85));
    if (o.sharp !== false) r *= 1 - 0.94 * smoothstep(0.78, 1.0, t);
    if (o.flare) r *= 1 + o.flare * Math.pow(1 - t, 5);
    const tipLen = o.tipLen ?? 0.25;
    const tipK = tipLen > 0 ? smoothstep(1 - tipLen, 1, t) : 0;
    const pk = (o.pearl || 0) * Math.pow(1 - t, 0.6) * (1 - tipK);
    // Anneaux de croissance (cornes de chamois)
    const ringK = o.annuli ? 1 + o.annuli * Math.max(0, Math.sin(t * 40)) * smoothstep(0.55, 0.1, t) : 1;
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      _n.copy(frames.normals[i]).multiplyScalar(ca).addScaledVector(frames.binormals[i], sa);
      const oval = 1 + (o.oval || 0) * Math.cos(2 * a + (o.ovalA || 0));
      const tw = N.n3(_p.x * 9 + 3.1, _p.y * 9, _p.z * 9) * 1.8;
      const groove = 0.5 + 0.5 * Math.cos(a * grooves + tw + t * 3);
      const bead = Math.max(0, N.n3(_p.x * 46 + j * 0.37, _p.y * 46, _p.z * 46));
      const bump = 1 + pk * (0.13 * groove + 0.22 * bead);
      const rr = r * oval * bump * ringK;
      const shade = clamp(0.62 + 0.45 * groove * Math.min(1, pk * 1.4) + 0.35 * bead * pk, 0.45, 1.25);
      const c = [0, 1, 2].map((q) => lerp(lerp(o.base[q], ridge[q], clamp(groove * pk * 1.3, 0, 1)) * shade, o.tip[q], tipK));
      ab.v(_p.x + _n.x * rr, _p.y + _n.y * rr, _p.z + _n.z * rr, c, pk);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rings; j++) {
      const a = start + i * (rings + 1) + j, b = a + 1, c = a + rings + 1, d = c + 1;
      ab.idx.push(a, c, b, b, c, d);
    }
  // Bouchon à la base (caché dans la meule ou le crâne)
  const c0 = start;
  curve.getPointAt(0, _p);
  const center = ab.n;
  ab.v(_p.x, _p.y, _p.z, o.base, 0);
  for (let j = 0; j < rings; j++) ab.idx.push(center, c0 + j + 1, c0 + j);
}

// Meule : couronne de perles irrégulières autour de la base du merrain
function burr(ab, center, dir, r, N, col, beads = 16) {
  const up = dir.clone().normalize();
  const t1 = Math.abs(up.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const b1 = new THREE.Vector3().crossVectors(up, t1).normalize();
  const b2 = new THREE.Vector3().crossVectors(up, b1).normalize();
  const ringN = 40, tubeN = 7;
  const start = ab.n;
  for (let i = 0; i <= ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    const pearlA = 0.5 + 0.5 * Math.cos(a * beads + N.n3(center.x * 40, a, 1) * 2);
    const R = r * (1 + 0.08 * N.n3(a * 2, center.y * 30, 3));
    for (let j = 0; j <= tubeN; j++) {
      const b = (j / tubeN) * Math.PI * 2;
      const tr = r * (0.2 + 0.16 * pearlA) * (1 + 0.25 * N.n3(a * 6, b, center.z * 50));
      const rad = R + Math.cos(b) * tr;
      const y = Math.sin(b) * tr * 0.8;
      const px = center.x + (b1.x * Math.cos(a) + b2.x * Math.sin(a)) * rad + up.x * y;
      const py = center.y + (b1.y * Math.cos(a) + b2.y * Math.sin(a)) * rad + up.y * y;
      const pz = center.z + (b1.z * Math.cos(a) + b2.z * Math.sin(a)) * rad + up.z * y;
      const shade = 0.7 + 0.5 * pearlA;
      ab.v(px, py, pz, col.map((x) => x * shade), 1);
    }
  }
  for (let i = 0; i < ringN; i++)
    for (let j = 0; j < tubeN; j++) {
      const a = start + i * (tubeN + 1) + j, b = a + 1, c = a + tubeN + 1, d = c + 1;
      ab.idx.push(a, b, c, b, d, c);
    }
}

// Andouiller : part de l'intérieur du merrain, se courbe vers le haut, pointe polie
function tineOn(ab, beam, N, side, t0, len, dir, rr, o = {}) {
  const p0 = beam.getPointAt(t0);
  const d = new THREE.Vector3(dir.x * side, dir.y, dir.z).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const bend = o.bend ?? 0.35;
  const c = new THREE.CatmullRomCurve3([
    p0.clone().addScaledVector(d, -rr * 0.7),
    p0.clone().addScaledVector(d, rr * 0.6),
    p0.clone().addScaledVector(d, len * 0.45).addScaledVector(up, len * bend * 0.28),
    p0.clone().addScaledVector(d, len * 0.8).addScaledVector(up, len * bend * 0.72),
    p0.clone().addScaledVector(d, len).addScaledVector(up, len * bend * 1.05).addScaledVector(new THREE.Vector3(side, 0, 0), (o.curlOut || 0) * len),
  ]);
  antlerTube(ab, c, N, {
    r0: rr, r1: rr * 0.45, taper: 1.35, segs: o.segs || 16, rings: o.rings || 10, flare: 0.45, pearl: o.pearl ?? 0.5, grooves: 3,
    tipLen: o.tipLen ?? 0.36, base: o.base, ridge: o.ridge, tip: o.tip || COL.ivory, oval: 0.08,
  });
}

function cerfSide(ab, t, side, base, scale, N, r, q) {
  const cm = 0.01 * scale;
  const L = (side > 0 ? t.beamL : t.beamR) * cm;
  const pts = side > 0 ? t.pointsL : t.pointsR;
  const crown = side > 0 ? t.crownL : t.crownR;
  const rad = (t.thick / (2 * Math.PI)) * cm * 1.08;
  const sk = t.spread / 85;
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  // Merrain en lyre : s'écarte et part vers l'arrière au-dessus de la meule, se redresse à la
  // chevillure, puis l'empaumure revient vers l'avant et l'intérieur (profil en « C »)
  const seg = [[0.1, 58, 50], [0.22, 56, 45], [0.24, 45, 35], [0.2, 28, 15], [0.14, 16, -5], [0.1, 6, -25]];
  const ctrl = [P(0, 0, 0)];
  const acc = new THREE.Vector3();
  for (const [len, psi, chi] of seg) {
    const d = new THREE.Vector3(Math.tan((chi * Math.PI) / 180) * sk, 1, -Math.tan((psi * Math.PI) / 180)).normalize();
    acc.addScaledVector(d, len * L * (0.96 + 0.08 * r()));
    ctrl.push(P(acc.x, acc.y, acc.z));
  }
  const beam = new THREE.CatmullRomCurve3(ctrl);
  const look = { base: COL.cerf, ridge: COL.cerfRidge };
  burr(ab, base.clone().add(new THREE.Vector3(0.004 * side * scale, 0.004 * scale, 0)), beam.getTangentAt(0), rad * 1.35, N, COL.cerf, 18);
  antlerTube(ab, beam, N, { r0: rad * 1.06, r1: rad * 0.5, segs: q ? 34 : 18, rings: q ? 14 : 9, pearl: 1.0, grooves: 5, tipLen: 0.06, oval: 0.12, ...look, tip: COL.ivory });
  const T = (t0, len, dir, rr, o) => tineOn(ab, beam, N, side, t0, len, dir, rr, { segs: q ? 16 : 8, rings: q ? 10 : 7, ...look, ...o });
  // Andouiller d'œil (vers l'avant, au-dessus du chanfrein), surandouiller, chevillure
  T(0.035, t.brow * cm, new THREE.Vector3(0.22, 0.08, 1), rad * 0.8, { bend: 0.55, pearl: 0.55 });
  if (t.bez && pts >= 4) T(0.1, t.brow * cm * 0.82, new THREE.Vector3(0.28, 0.2, 1), rad * 0.68, { bend: 0.5 });
  if (pts >= 3) T(0.4, t.trez * cm, new THREE.Vector3(-0.08, 0.3, 1), rad * 0.66, { bend: 0.45 });
  // Couronne en coupe et andouillers moyens
  const extra = Math.max(0, pts - 3 - (t.bez ? 1 : 0));
  const nCrown = Math.min(crown, extra);
  // Empaumure (couronne) : andouillers en coupe autour de la direction terminale du merrain
  const tEnd = beam.getTangentAt(0.9);
  const tLoc = new THREE.Vector3(tEnd.x * side, tEnd.y, tEnd.z);
  for (let i = 0; i < nCrown; i++) {
    const a = (i / Math.max(1, nCrown)) * Math.PI * 1.7 - 0.5;
    const t0 = 0.8 + (i % 2) * 0.05 + r() * 0.04;
    const d = tLoc.clone().multiplyScalar(1.1).add(new THREE.Vector3(0.15 + Math.cos(a) * 0.75, 0, Math.sin(a) * 0.8));
    T(Math.min(0.95, t0), (0.17 + r() * 0.1) * L * 0.62 + 0.03 * scale, d, rad * 0.48, { bend: 0.18, curlOut: 0.04, pearl: 0.3, tipLen: 0.45 });
  }
  for (let i = nCrown; i < extra; i++) T(0.56 + 0.07 * (i - nCrown), t.trez * cm * 0.7, new THREE.Vector3(0.25, 0.35, 0.9), rad * 0.5, { bend: 0.35 });
}

function chevreuilSide(ab, t, side, base, scale, N, q) {
  const cm = 0.01 * scale;
  const L = t.len * cm;
  const rad = 0.0125 * scale * (0.8 + 0.4 * (t.weight / 400));
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const s = t.spread / 12;
  const beam = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.05 * L * s, 0.3 * L, -0.1 * L), P(0.1 * L * s, 0.62 * L, -0.17 * L), P(0.12 * L * s, 0.95 * L, -0.12 * L)]);
  const look = { base: COL.chevreuil, ridge: COL.chevRidge };
  // Rosette : meule large et très perlée
  burr(ab, base, beam.getTangentAt(0), rad * 1.55, N, COL.chevreuil, 14);
  antlerTube(ab, beam, N, { r0: rad * 1.12, r1: rad * 0.55, segs: q ? 22 : 12, rings: q ? 12 : 8, pearl: 1.25 * t.pearl + 0.3, grooves: 4, tipLen: 0.14, ...look, tip: COL.ivory });
  const T = (t0, len, dir, rr, o) => tineOn(ab, beam, N, side, t0, len, dir, rr, { segs: q ? 12 : 7, rings: q ? 9 : 6, ...look, ...o });
  if (t.points >= 2) T(0.52, L * 0.3, new THREE.Vector3(0.05, 0.35, 1), rad * 0.72, { bend: 0.55, pearl: 0.6 });
  if (t.points >= 3) T(0.76, L * 0.25, new THREE.Vector3(0.04, 0.3, -1), rad * 0.62, { bend: 0.55, pearl: 0.4 });
  if (t.points >= 4) T(0.34, L * 0.17, new THREE.Vector3(0.7, 0.5, 0.15), rad * 0.5, { bend: 0.4 });
}

function daimSide(ab, t, side, base, scale, N, q) {
  const cm = 0.01 * scale;
  const L = t.beam * cm;
  const rad = 0.015 * scale * (0.85 + 0.25 * (t.weight / 3));
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const s = t.spread / 55;
  const stem = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.07 * L * s, 0.17 * L, -0.07 * L), P(0.15 * L * s, 0.34 * L, -0.17 * L)]);
  const look = { base: COL.daim, ridge: COL.daimRidge };
  burr(ab, base, stem.getTangentAt(0), rad * 1.35, N, COL.daim, 14);
  antlerTube(ab, stem, N, { r0: rad * 1.05, r1: rad * 0.9, segs: 12, rings: q ? 12 : 8, pearl: 0.45, grooves: 4, tipLen: 0, sharp: false, ...look, tip: COL.daim });
  const T = (t0, len, dir, rr, o) => tineOn(ab, stem, N, side, t0, len, dir, rr, { segs: q ? 12 : 7, rings: q ? 8 : 6, ...look, ...o });
  T(0.1, t.brow * cm, new THREE.Vector3(0.1, 0.15, 1), rad * 0.62, { bend: 0.45 });
  T(0.72, t.trez * cm, new THREE.Vector3(0.15, 0.15, 1), rad * 0.56, { bend: 0.4 });
  // Empaumure : lame épaisse, légèrement creusée, qui s'élargit vers le haut et l'arrière
  const top = stem.getPointAt(1);
  const pl = t.palmL * cm, pw = t.palmW * cm;
  const nu = q ? 14 : 8, nv = q ? 7 : 4;
  const th = 0.012 * scale;
  const grid = [];
  // Axe de la palme : monte vers l'arrière ; largeur : vers l'arrière et l'extérieur (palmes « en mains ouvertes »)
  const U = new THREE.Vector3(0.22 * side * s, 1, -0.78).normalize();
  const W = new THREE.Vector3(1.05 * side, 0.12, -1).normalize();
  const Nm = new THREE.Vector3().crossVectors(U, W).normalize();
  if (Nm.x * side < 0) Nm.negate();
  const pt = (u, v) => {
    const width = pw * (0.32 + 0.82 * Math.sin(Math.PI * Math.min(1, u * 0.86 + 0.08))) * (1 - 0.55 * smoothstep(0.78, 1, u));
    const cup = (Math.sin(Math.PI * v) * 0.16 + 0.1 * u * u) * width;
    return top.clone().addScaledVector(U, u * pl).addScaledVector(W, (v - 0.25) * width).addScaledVector(Nm, -cup);
  };
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) grid.push(pt(i / nu, j / nv));
  // Normale de la lame (vers l'extérieur)
  const nrm = (i, j) => {
    const a = grid[Math.min(nu, i + 1) * (nv + 1) + j].clone().sub(grid[Math.max(0, i - 1) * (nv + 1) + j]);
    const b = grid[i * (nv + 1) + Math.min(nv, j + 1)].clone().sub(grid[i * (nv + 1) + Math.max(0, j - 1)]);
    const n = new THREE.Vector3().crossVectors(a, b).normalize();
    if (n.x * side < 0) n.negate();
    return n;
  };
  const faces = [];
  for (const f of [1, -1]) {
    const st = ab.n;
    faces.push(st);
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const g = grid[i * (nv + 1) + j];
        const n = nrm(i, j);
        const edge = Math.min(j, nv - j) === 0 ? 0.6 : 1;
        const nz = N.n3(g.x * 40, g.y * 40, g.z * 40);
        const p = g.clone().addScaledVector(n, f * th * 0.5 * edge * (1 + 0.3 * nz));
        const k = clamp(i / nu * 1.2, 0, 1);
        const c = COL.daim.map((x, m) => lerp(x, COL.daimRidge[m], k * 0.6 + 0.2 * nz));
        ab.v(p.x, p.y, p.z, c, 0.25);
      }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = st + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        if (f * side > 0) ab.idx.push(a, c, b, b, c, d);
        else ab.idx.push(a, b, c, b, d, c);
      }
  }
  // Tranche (bords) entre les deux faces
  const [fa, fb] = faces;
  const edgeLoop = [];
  for (let i = 0; i <= nu; i++) edgeLoop.push(i * (nv + 1));
  for (let j = 1; j <= nv; j++) edgeLoop.push(nu * (nv + 1) + j);
  for (let i = nu - 1; i >= 0; i--) edgeLoop.push(i * (nv + 1) + nv);
  for (let k = 0; k < edgeLoop.length - 1; k++) {
    const a = fa + edgeLoop[k], b = fa + edgeLoop[k + 1], c = fb + edgeLoop[k], d = fb + edgeLoop[k + 1];
    ab.idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
  }
  // Pointes (épois) le long du bord postérieur
  for (let k = 0; k < t.spellers; k++) {
    const u = 0.28 + (k / Math.max(1, t.spellers - 1)) * 0.7;
    const i = Math.round(u * nu);
    const p0 = grid[i * (nv + 1) + nv];
    const len = (0.025 + 0.025 * Math.abs(Math.sin(k * 1.7))) * scale * (0.6 + 0.6 * u);
    const sd = U.clone().multiplyScalar(0.55 + 0.4 * u).addScaledVector(W, 0.75);
    const end = p0.clone().addScaledVector(sd.normalize(), len);
    antlerTube(ab, new THREE.CatmullRomCurve3([p0.clone().addScaledVector(W, -0.006 * scale), p0.clone().lerp(end, 0.5), end]), N,
      { r0: 0.0075 * scale, r1: 0.002 * scale, segs: 5, rings: 6, pearl: 0, tipLen: 0.6, base: COL.daim, tip: COL.daimRidge });
  }
}

function chamoisSide(ab, t, side, base, scale, N, q) {
  const cm = 0.01 * scale;
  const L = t.len * cm * 0.85;
  const rad = (t.base / (2 * Math.PI)) * cm;
  const P = (u, v, w) => base.clone().add(new THREE.Vector3(u * side, v, w));
  const h = t.hook;
  const curve = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.02 * L, 0.35 * L, 0.03 * L), P(0.04 * L, 0.62 * L, -0.01 * L), P(0.05 * L, 0.75 * L, -0.16 * L * h), P(0.05 * L, 0.66 * L, -0.31 * L * h), P(0.045 * L, 0.52 * L, -0.33 * L * h)]);
  antlerTube(ab, curve, N, { r0: rad, r1: rad * 0.32, segs: q ? 28 : 14, rings: q ? 12 : 8, pearl: 0.15, grooves: 0, tipLen: 0.2, annuli: 0.05, oval: 0.12, base: COL.horn, ridge: COL.horn, tip: COL.hornTip });
}

function tuskCurve(p0, side, L, w, scale) {
  // Arc de défense : sort, se recourbe vers le haut et l'arrière (vue de profil)
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * Math.PI * 0.62;
    pts.push(p0.clone().add(new THREE.Vector3(side * (0.012 * scale + w * Math.sin(a * 0.8)), Math.sin(a) * L * 0.62, -(1 - Math.cos(a)) * L * 0.75)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function sanglierSide(ab, t, side, base, scale, N, q, full) {
  const cm = 0.01 * scale;
  // Défense inférieure (seule la partie hors de la gueule est visible sur l'animal)
  const L = t.lowerL * cm * (full ? 1.0 : 0.5);
  const r0 = (t.lowerW / 2) * cm * 0.62;
  const p0 = base.clone().add(new THREE.Vector3(0.012 * side * scale, full ? -L * 0.25 : -0.01 * scale, full ? L * 0.15 : 0));
  antlerTube(ab, tuskCurve(p0, side, L, 0.01 * scale, scale), N,
    { r0, r1: r0 * 0.32, segs: q ? 18 : 10, rings: q ? 9 : 6, pearl: 0, grooves: 0, tipLen: full ? 0.7 : 0.5, oval: 0.22, base: full ? COL.tuskRoot : COL.tusk, tip: COL.tusk });
  // Grès (défense supérieure), courte et recourbée vers le haut
  const q0 = base.clone().add(new THREE.Vector3(0.016 * side * scale, 0.012 * scale, -0.02 * scale));
  const ul = (full ? 0.07 : 0.035) * scale;
  const up = new THREE.CatmullRomCurve3([q0, q0.clone().add(new THREE.Vector3(0.008 * side * scale, ul * 0.45, -ul * 0.1)), q0.clone().add(new THREE.Vector3(0.014 * side * scale, ul * 0.85, -ul * 0.55))]);
  antlerTube(ab, up, N, { r0: (t.upperW / 2) * cm * 0.45, r1: 0.002 * scale, segs: 8, rings: 7, pearl: 0, grooves: 0, tipLen: 0.5, oval: 0.18, base: COL.tuskRoot, tip: COL.tusk });
}

// q : qualité géométrique (true = détaillée, pour les trophées vus de près)
export function buildTrophyGeometry(t, spec, scale = 1, opts = {}) {
  if (!t) return null;
  const ab = new AB();
  const N = makeNoise((t.seed || 1) % 100000);
  const r = rng(t.seed || 1);
  const q = opts.detail !== false;
  const b = spec.antlerBase;
  for (const side of [1, -1]) {
    const base = new THREE.Vector3(b[0] * side * scale, b[1] * scale, b[2] * scale);
    if (t.kind === 'cerf') cerfSide(ab, t, side, base, scale, N, r, q);
    else if (t.kind === 'chevreuil') chevreuilSide(ab, t, side, base, scale, N, q);
    else if (t.kind === 'daim') daimSide(ab, t, side, base, scale, N, q);
    else if (t.kind === 'chamois') chamoisSide(ab, t, side, base, scale, N, q);
    else if (t.kind === 'sanglier') sanglierSide(ab, t, side, base, scale, N, q, !!opts.full);
  }
  return ab.build();
}

// Matériau : perlures fines (bosselage procédural), pointes polies plus brillantes
const ANTLER_PARS = /* glsl */ `
varying float vPearl;
varying vec3 vObjP;
float aHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float aNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( aHash( i ), aHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( aHash( i + vec3( 0, 1, 0 ) ), aHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( aHash( i + vec3( 0, 0, 1 ) ), aHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( aHash( i + vec3( 0, 1, 1 ) ), aHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float pearlH( vec3 p ) {
  float a = smoothstep( 0.42, 0.95, aNoise( p * 260.0 ) );
  float b = aNoise( p * 640.0 );
  float c = aNoise( p * 90.0 );
  return a * 0.6 + b * 0.25 + c * 0.35;
}
vec3 bumpNormal( vec3 surfPos, vec3 n, float h, float k ) {
  vec3 dpx = dFdx( surfPos ), dpy = dFdy( surfPos );
  float dhx = dFdx( h ) * k, dhy = dFdy( h ) * k;
  vec3 r1 = cross( dpy, n ), r2 = cross( n, dpx );
  float det = dot( dpx, r1 );
  vec3 grad = sign( det ) * ( dhx * r1 + dhy * r2 );
  return normalize( abs( det ) * n - grad );
}
`;

export const antlerMaterial = () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (s) => {
    injectGlobals(s);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPearl;\nvarying float vPearl;\nvarying vec3 vObjP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPearl = aPearl;\nvObjP = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ANTLER_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float antH = pearlH( vObjP ) * vPearl;
        diffuseColor.rgb *= mix( 1.0, 0.84 + 0.3 * pearlH( vObjP * 1.7 + 3.0 ), clamp( vPearl, 0.0, 1.0 ) * 0.8 );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.3, 0.82, clamp( vPearl * 1.4 + 0.12, 0.0, 1.0 ) );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = bumpNormal( -vViewPosition, normal, antH, 0.0022 );`);
  };
  m.customProgramCacheKey = () => 'antler2';
  m.userData.extraAttrs = ['aPearl'];
  return m;
};

export { MEDALS };
