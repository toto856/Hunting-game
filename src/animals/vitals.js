// Anatomie interne : volumes touchables (corps, cou, tête, pattes) et organes vitaux,
// rattachés aux os. Positions en espace du modèle (échelle 1), dérivées de l'espèce.
import * as THREE from 'three';

export const ORGANS = {
  coeur: { name: 'Cœur', color: 0xb3122a, lethal: 'rapide' },
  poumonG: { name: 'Poumon gauche', color: 0xf08a9a, lethal: 'poumon' },
  poumonD: { name: 'Poumon droit', color: 0xf08a9a, lethal: 'poumon' },
  foie: { name: 'Foie', color: 0x6b1a12, lethal: 'lent' },
  panse: { name: 'Panse (estomac)', color: 0x9a8a55, lethal: 'tres_lent' },
  intestins: { name: 'Intestins', color: 0xc9a27a, lethal: 'tres_lent' },
  colonne: { name: 'Colonne vertébrale', color: 0xe8e2d0, lethal: 'immediat' },
  cervicales: { name: 'Vertèbres cervicales', color: 0xe8e2d0, lethal: 'immediat' },
  cerveau: { name: 'Cerveau', color: 0xd9a0a8, lethal: 'immediat' },
  epauleG: { name: 'Épaule gauche', color: 0xe0d8c4, lethal: 'os' },
  epauleD: { name: 'Épaule droite', color: 0xe0d8c4, lethal: 'os' },
  trachee: { name: 'Trachée', color: 0xd88a8a, lethal: 'lent' },
};

// Repères anatomiques tirés du profil de l'espèce
function landmarks(spec) {
  const B = spec.body;
  const chest = B.slice(Math.floor(spec.neckStart * 0.6), spec.neckStart);
  let brisket = 9, withers = 0, chestZ0 = 9, chestZ1 = -9, wMax = 0;
  for (const s of chest) {
    brisket = Math.min(brisket, s[1] - s[3]);
    withers = Math.max(withers, s[1] + s[2]);
    wMax = Math.max(wMax, s[4]);
  }
  for (const s of B.slice(0, spec.neckStart)) {
    chestZ0 = Math.min(chestZ0, s[0]);
    chestZ1 = Math.max(chestZ1, s[0]);
  }
  const elbowZ = spec.front.pts[1][2];
  const hipZ = spec.rear.pts[0][2];
  return { brisket, withers, depth: withers - brisket, elbowZ, hipZ, wMax, z0: chestZ0, z1: chestZ1 };
}

// Organes : [clé, os, centre, rayons]
export function buildVitals(spec) {
  const L = landmarks(spec);
  const D = L.depth;
  const boar = spec.id === 'sanglier';
  // Le sanglier a les organes plus bas et plus en avant
  const fwd = boar ? 0.04 * D : -0.06 * D;
  const low = boar ? -0.04 * D : 0;
  const hz = L.elbowZ + fwd;
  const out = [];
  const push = (key, bone, c, r) => out.push({ key, bone, c: new THREE.Vector3(...c), r: new THREE.Vector3(...r) });
  push('coeur', 'spine3', [0.0, L.brisket + 0.3 * D + low, hz], [0.1 * D, 0.13 * D, 0.11 * D]);
  push('poumonG', 'spine2', [L.wMax * 0.42, L.brisket + 0.55 * D + low, hz - 0.22 * D], [0.17 * D, 0.28 * D, 0.32 * D]);
  push('poumonD', 'spine2', [-L.wMax * 0.42, L.brisket + 0.55 * D + low, hz - 0.22 * D], [0.17 * D, 0.28 * D, 0.32 * D]);
  push('foie', 'spine2', [-L.wMax * 0.18, L.brisket + 0.32 * D, hz - 0.68 * D], [0.2 * D, 0.17 * D, 0.15 * D]);
  push('panse', 'spine1', [L.wMax * 0.22, L.brisket + 0.28 * D, hz - 1.08 * D], [0.28 * D, 0.28 * D, 0.32 * D]);
  push('intestins', 'pelvis', [0, L.brisket + 0.3 * D, L.hipZ + 0.18 * D], [0.26 * D, 0.24 * D, 0.26 * D]);
  push('epauleG', 'fUpperL', [L.wMax * 0.85, L.brisket + 0.62 * D, L.elbowZ + 0.18 * D], [0.05 * D, 0.3 * D, 0.14 * D]);
  push('epauleD', 'fUpperR', [-L.wMax * 0.85, L.brisket + 0.62 * D, L.elbowZ + 0.18 * D], [0.05 * D, 0.3 * D, 0.14 * D]);
  // Colonne : chapelet d'ellipsoïdes le long du dos
  const B = spec.body;
  for (let i = 2; i < spec.neckStart; i += 1) {
    const s = B[i];
    const bone = s[0] < L.hipZ + 0.1 ? 'pelvis' : s[0] < 0 ? 'spine1' : s[0] < L.elbowZ - 0.1 ? 'spine2' : 'spine3';
    push('colonne', bone, [0, s[1] + s[2] * 0.72, s[0]], [0.045 * D / 0.62, 0.05 * D / 0.62, 0.11 * D / 0.62]);
  }
  for (let i = spec.neckStart; i < spec.headStart; i++) {
    const s = B[i];
    const bone = i < (spec.neckStart + spec.headStart) / 2 ? 'neck1' : 'neck2';
    push('cervicales', bone, [0, s[1] + s[2] * 0.15, s[0]], [s[4] * 0.32, s[2] * 0.32, 0.07]);
    push('trachee', bone, [0, s[1] - s[3] * 0.55, s[0]], [s[4] * 0.22, s[3] * 0.18, 0.07]);
  }
  const hs = B[spec.headStart + 1];
  push('cerveau', 'head', [0, hs[1] + hs[2] * 0.15, hs[0] - 0.01], [hs[4] * 0.5, hs[2] * 0.48, hs[4] * 0.62]);
  return out;
}

// Volumes extérieurs (pour savoir si la balle touche l'animal et où)
export function buildHull(spec) {
  const B = spec.body;
  const out = [];
  const L = landmarks(spec);
  for (let i = 1; i < B.length - 1; i++) {
    const s = B[i], n = B[i + 1];
    const zone = i >= spec.headStart ? 'tete' : i >= spec.neckStart ? 'cou' : s[0] < L.hipZ + 0.05 ? 'arriere' : s[0] < L.elbowZ - 0.25 ? 'abdomen' : 'thorax';
    const bone = i >= spec.headStart ? 'head' : i >= spec.neckStart ? (i < (spec.neckStart + spec.headStart) / 2 ? 'neck1' : 'neck2') : s[0] < L.hipZ + 0.1 ? 'pelvis' : s[0] < 0 ? 'spine1' : s[0] < L.elbowZ - 0.1 ? 'spine2' : 'spine3';
    const cz = (s[0] + n[0]) / 2, cy = (s[1] + n[1]) / 2;
    const len = Math.hypot(n[0] - s[0], n[1] - s[1]);
    out.push({ zone, bone, c: new THREE.Vector3(0, cy, cz), r: new THREE.Vector3(Math.max(s[4], n[4]) * 1.02, Math.max(s[2] + s[3], n[2] + n[3]) * 0.52, len * 0.75 + 0.02) });
  }
  // Pattes : capsules approximées par ellipsoïdes allongés par segment
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const legs = [['f', spec.front, ['fUpper', 'fLower', 'fKnee', 'fFet']], ['r', spec.rear, ['rUpper', 'rStifle', 'rHock', 'rFet']]];
    for (const [, def, names] of legs) {
      for (let k = 1; k < def.pts.length - 1; k++) {
        const a = def.pts[k], b = def.pts[k + 1];
        const c = [((a[0] + b[0]) / 2) * side, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        out.push({ zone: 'patte', bone: names[k] + S, c: new THREE.Vector3(...c), r: new THREE.Vector3(def.r[k] * 1.1, len * 0.55, def.r[k] * 1.25), legAxis: true });
      }
    }
  }
  return out;
}

const _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

// Intersection segment / ellipsoïde dans l'espace d'un os.
// Renvoie [t0, t1] (paramètres le long du segment monde) ou null.
export function segEllipsoid(aW, bW, bone, vol, bindInv, scale) {
  // Matrice monde -> espace "bind" de l'os : bindInv (pose de liaison) * inverse(monde de l'os)
  _inv.copy(bone.matrixWorld).invert();
  _a.copy(aW).applyMatrix4(_inv);
  _b.copy(bW).applyMatrix4(_inv);
  // Espace local de l'os -> coordonnées du modèle en pose de liaison
  _a.add(bindInv);
  _b.add(bindInv);
  _d.subVectors(_b, _a);
  const ox = (_a.x - vol.c.x) / vol.r.x, oy = (_a.y - vol.c.y) / vol.r.y, oz = (_a.z - vol.c.z) / vol.r.z;
  const dx = _d.x / vol.r.x, dy = _d.y / vol.r.y, dz = _d.z / vol.r.z;
  const A = dx * dx + dy * dy + dz * dz;
  const B = 2 * (ox * dx + oy * dy + oz * dz);
  const C = ox * ox + oy * oy + oz * oz - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
  if (t1 < 0 || t0 > 1) return null;
  void scale;
  return [Math.max(0, t0), Math.min(1, t1), _a.clone(), _d.clone()];
}
