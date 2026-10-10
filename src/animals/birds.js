// Gibier d'eau : modèles procéduraux (corps, tête, bec, ailes articulées), vols en bande
// ou en V, approche des appelants, posé, nage, envol, tir à la grenaille, chute.
// La plupart des oiseaux volent lentement (faciles), la sarcelle reste rapide.
import * as THREE from 'three';
import { clamp, lerp, damp, R, smoothstep } from '../core/math.js';
import { PLACES } from '../world/reserveMap.js';
import { injectGlobals } from '../gfx/globals.js';
import * as Save from '../core/save.js';

// speed : m/s (vol de croisière, volontairement modéré), flap : Hz, size : échelle
export const BIRDS = {
  colvert: { name: 'Canard colvert', sexed: true, size: 1, speed: 8.2, flap: 5, hp: 22, weight: [0.9, 1.62], pts: 1, erratic: 0.15, w: 30,
    medals: [1.15, 1.28, 1.4, 1.52], call: 'colvert' },
  sarcelle: { name: "Sarcelle d'hiver", sexed: true, size: 0.66, speed: 12.5, flap: 7, hp: 13, weight: [0.24, 0.46], pts: 1.6, erratic: 0.9, w: 16,
    medals: [0.33, 0.37, 0.4, 0.43], call: 'sarcelle' },
  pilet: { name: 'Canard pilet', sexed: true, size: 1.05, speed: 9, flap: 4.6, hp: 22, weight: [0.7, 1.26], pts: 1.3, erratic: 0.2, w: 10,
    medals: [0.9, 1.0, 1.1, 1.2], call: 'colvert', longTail: true },
  siffleur: { name: 'Canard siffleur', sexed: true, size: 0.88, speed: 8.6, flap: 5.4, hp: 18, weight: [0.55, 1.0], pts: 1.2, erratic: 0.25, w: 12,
    medals: [0.72, 0.8, 0.88, 0.95], call: 'siffleur' },
  souchet: { name: 'Canard souchet', sexed: true, size: 0.9, speed: 8, flap: 5.2, hp: 18, weight: [0.47, 0.86], pts: 1.2, erratic: 0.2, w: 9,
    medals: [0.6, 0.68, 0.75, 0.82], call: 'colvert', shovel: true },
  milouin: { name: 'Fuligule milouin', sexed: true, size: 0.92, speed: 10, flap: 6, hp: 20, weight: [0.7, 1.25], pts: 1.3, erratic: 0.2, w: 8,
    medals: [0.9, 1.0, 1.1, 1.2], call: 'colvert' },
  oie: { name: 'Oie cendrée', sexed: false, size: 1.75, speed: 7, flap: 3, hp: 55, weight: [2.4, 4.2], pts: 2.2, erratic: 0.04, w: 9,
    medals: [3.0, 3.4, 3.8, 4.1], call: 'oie', goose: true },
  cygne: { name: 'Cygne tuberculé', sexed: false, size: 2.5, speed: 8.5, flap: 2.6, hp: 90, weight: [9, 12], pts: 0, protected: true, w: 3, goose: true, swan: true },
  tadorne: { name: 'Tadorne de Belon', sexed: false, size: 1.1, speed: 8.4, flap: 4.6, hp: 22, weight: [0.9, 1.4], pts: 0, protected: true, w: 4 },
};

// Couleurs par région (sRGB) : tête, cou, collier, poitrine, flanc, dos, couverture, miroir, rémiges, ventre, queue, bec
const PLUMAGE = {
  colvert_m: { head: '#1b5a33', neck: '#1b5a33', ring: '#f0f0ea', breast: '#5e3320', flank: '#a7a6a0', back: '#6b6658', cov: '#8a8780', spec: '#2f3f9a', prim: '#4a4844', belly: '#c8c6be', tail: '#141414', bill: '#d6c13a' },
  colvert_f: { head: '#7a6044', neck: '#866a4c', ring: '#866a4c', breast: '#7a5c3e', flank: '#82643f', back: '#5f4630', cov: '#6e5640', spec: '#2f3f9a', prim: '#4a3f33', belly: '#9c8060', tail: '#6b5037', bill: '#c47a32' },
  sarcelle_m: { head: '#7d3320', neck: '#7d3320', ring: '#7d3320', breast: '#d6cbb0', flank: '#9a9a96', back: '#7b7b78', cov: '#706e6a', spec: '#1f8a4d', prim: '#4a4a46', belly: '#e2ddd0', tail: '#d8c460', bill: '#2a2a2a', mask: '#1f6b45' },
  sarcelle_f: { head: '#7a6248', neck: '#7a6248', ring: '#7a6248', breast: '#8a6c4e', flank: '#82664a', back: '#5e4834', cov: '#6a5844', spec: '#1f8a4d', prim: '#4a4035', belly: '#a89070', tail: '#6a5038', bill: '#3a3530' },
  pilet_m: { head: '#5a3a24', neck: '#5a3a24', ring: '#f0f0ea', breast: '#efeee6', flank: '#a3a39f', back: '#6d6d6a', cov: '#7b7b76', spec: '#3a6e40', prim: '#4b4b48', belly: '#efeee6', tail: '#1e1e1e', bill: '#6c7a88' },
  pilet_f: { head: '#8a7258', neck: '#8a7258', ring: '#8a7258', breast: '#8e7454', flank: '#86704e', back: '#625036', cov: '#6e5c44', spec: '#5a4a38', prim: '#4a4035', belly: '#a8916e', tail: '#6a5236', bill: '#4a5560' },
  siffleur_m: { head: '#8a3a22', neck: '#8a3a22', ring: '#8a3a22', breast: '#b48a88', flank: '#9a9a96', back: '#7a7a76', cov: '#e8e8e2', spec: '#2a6a3a', prim: '#4a4a46', belly: '#efeee6', tail: '#2a2a2a', bill: '#8a9aa8', crown: '#e8d8a0' },
  siffleur_f: { head: '#7a5a40', neck: '#7a5a40', ring: '#7a5a40', breast: '#8a6648', flank: '#86644a', back: '#5e4834', cov: '#6a5844', spec: '#3a4a3a', prim: '#4a4035', belly: '#e0d8c8', tail: '#5a4834', bill: '#7a8a98' },
  souchet_m: { head: '#1d5a3a', neck: '#1d5a3a', ring: '#efeee6', breast: '#efeee6', flank: '#8a4a26', back: '#3a3a36', cov: '#8aa0c0', spec: '#2a7a4a', prim: '#4a4a46', belly: '#8a4a26', tail: '#2a2a2a', bill: '#2a2a2a' },
  souchet_f: { head: '#7a6044', neck: '#7a6044', ring: '#7a6044', breast: '#80603e', flank: '#82643f', back: '#5f4630', cov: '#8aa0b8', spec: '#2a6a4a', prim: '#4a3f33', belly: '#9c8060', tail: '#6b5037', bill: '#8a6a3a' },
  milouin_m: { head: '#8a2c1c', neck: '#8a2c1c', ring: '#8a2c1c', breast: '#1a1816', flank: '#b8b8b2', back: '#a8a8a2', cov: '#9a9a96', spec: '#a8a8a2', prim: '#5a5a56', belly: '#d0d0ca', tail: '#1a1816', bill: '#3a3a3e' },
  milouin_f: { head: '#7a5a40', neck: '#7a5a40', ring: '#7a5a40', breast: '#6a5038', flank: '#8a8070', back: '#7a7062', cov: '#7a7266', spec: '#8a8478', prim: '#4a4640', belly: '#b0a490', tail: '#5a4834', bill: '#3a3a3e' },
  oie: { head: '#77705f', neck: '#7d7666', ring: '#7d7666', breast: '#8a8474', flank: '#7d7666', back: '#5f5a4d', cov: '#8e8b82', spec: '#8e8b82', prim: '#4a4842', belly: '#b9b4a6', tail: '#f0f0f0', bill: '#e88a3a' },
  cygne: { head: '#f5f5f2', neck: '#f5f5f2', ring: '#f5f5f2', breast: '#f5f5f2', flank: '#f2f2ee', back: '#efefea', cov: '#f2f2ee', spec: '#f2f2ee', prim: '#e8e8e2', belly: '#f5f5f2', tail: '#efefea', bill: '#e0602a' },
  tadorne: { head: '#10302a', neck: '#10302a', ring: '#f4f4f0', breast: '#b5652a', flank: '#f4f4f0', back: '#f4f4f0', cov: '#f4f4f0', spec: '#1a6a3a', prim: '#1a1a1a', belly: '#f4f4f0', tail: '#f4f4f0', bill: '#c8202a' },
};

const C = (h) => new THREE.Color(h);

// Géométrie d'un oiseau (échelle d'un colvert = 1) avec ailes articulées
function buildBirdGeometry(sp, plum) {
  const pos = [], col = [], wing = [], idx = [], piv = [];
  const P = {};
  for (const k in plum) P[k] = C(plum[k]);
  const goose = sp.goose;
  const neckLen = sp.swan ? 0.55 : goose ? 0.32 : 0.12;
  // Corps : stations (z, demi-largeur, demi-hauteur dessus, dessous)
  const L = goose ? 0.62 : 0.42;
  const stations = [
    [-0.5, 0.02, 0.02, 0.01], [-0.42, 0.06, 0.04, 0.03], [-0.3, 0.1, 0.06, 0.07], [-0.12, 0.12, 0.075, 0.085], [0.05, 0.12, 0.08, 0.09],
    [0.2, 0.105, 0.075, 0.085], [0.32, 0.075, 0.06, 0.07], [0.4, 0.045, 0.045, 0.05],
  ];
  const ring = 12;
  const start = 0;
  stations.forEach(([z, w, ht, hb], i) => {
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const s = Math.sin(a), c = -Math.cos(a);
      const x = w * s * (L / 0.42);
      const y = (c > 0 ? ht : hb) * c * (L / 0.42);
      pos.push(x, y, z * L * 1.15);
      // Couleurs : dessus = dos, flancs, dessous = ventre, avant = poitrine
      let k = P.flank;
      if (c > 0.6) k = P.back;
      else if (c < -0.55) k = P.belly;
      if (z > 0.15 && c < 0.5) k = P.breast;
      if (z < -0.35) k = P.tail;
      col.push(k.r, k.g, k.b);
      wing.push(0, 0, 0);
      piv.push(0, 0, 0);
    }
  });
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < ring; j++) {
      const a = start + i * (ring + 1) + j, b = a + 1, c = a + ring + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  // Cou + tête + bec (petit tube incliné)
  const base = pos.length / 3;
  const zBack = 0.32 * L * 1.15;
  const headZ = zBack + (goose ? 0.12 : 0.06), headY = neckLen + 0.07;
  const neckPts = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    neckPts.push([0, 0.03 + headY * t * (sp.swan ? 1 : 0.9), zBack + (headZ - zBack) * t + (sp.swan ? Math.sin(t * Math.PI) * -0.08 : 0)]);
  }
  const nr = 8;
  neckPts.forEach(([x, y, z], k) => {
    const r = (goose ? 0.04 : 0.038) * (1 - k * 0.06);
    for (let j = 0; j <= nr; j++) {
      const a = (j / nr) * Math.PI * 2;
      pos.push(x + Math.sin(a) * r, y + Math.cos(a) * r, z);
      const kc = k > 3 ? P.head : k === 2 && plum.ring !== plum.neck ? P.ring : P.neck;
      col.push(kc.r, kc.g, kc.b);
      wing.push(0, 0, 0);
      piv.push(0, 0, 0);
    }
  });
  for (let k = 0; k < neckPts.length - 1; k++)
    for (let j = 0; j < nr; j++) {
      const a = base + k * (nr + 1) + j, b = a + 1, c = a + nr + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  // Tête (sphère aplatie)
  const head = new THREE.SphereGeometry(goose ? 0.055 : 0.05, 10, 8).scale(0.85, 0.9, 1.15).toNonIndexed();
  const hp = head.attributes.position;
  const hb = pos.length / 3;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    pos.push(x, y + headY + 0.03, z + headZ);
    let kc = P.head;
    if (plum.mask && z > 0 && Math.abs(x) > 0.025 && y > -0.01) kc = C(plum.mask);
    if (plum.crown && y > 0.03) kc = C(plum.crown);
    col.push(kc.r, kc.g, kc.b);
    wing.push(0, 0, 0);
    piv.push(0, 0, 0);
    idx.push(hb + i);
  }
  // Bec : coin aplati (spatulé pour le souchet)
  const bw = sp.shovel ? 0.028 : goose ? 0.018 : 0.02, bl = sp.shovel ? 0.075 : goose ? 0.06 : 0.055;
  const bill = new THREE.BoxGeometry(bw * 2, 0.014, bl).toNonIndexed();
  const bp = bill.attributes.position;
  const bb = pos.length / 3;
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    const taper = sp.shovel ? 1 + (z / bl) * 0.6 : 1 - (z / bl) * 0.3;
    pos.push(bp.getX(i) * taper, bp.getY(i) + headY + 0.015 - z * 0.15, z + headZ + 0.05 + bl / 2);
    col.push(P.bill.r, P.bill.g, P.bill.b);
    wing.push(0, 0, 0);
    piv.push(0, 0, 0);
    idx.push(bb + i);
  }
  // Ailes : bras (épaule -> poignet) et main (poignet -> pointe), bord de fuite festonné
  const span = goose ? 0.85 : 0.46;
  for (const side of [1, -1]) {
    const shoulder = [0.07 * side, 0.05, 0.08];
    const nu = 6, nv = 3;
    const wb = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      const t = i / nu;
      const chord = (t < 0.45 ? lerp(0.2, 0.17, t / 0.45) : lerp(0.17, 0.05, (t - 0.45) / 0.55)) * (goose ? 1.35 : 1);
      const sweep = t > 0.45 ? (t - 0.45) * 0.22 : 0;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const x = shoulder[0] + side * span * t;
        const z = shoulder[2] + 0.03 - v * chord - sweep;
        const y = shoulder[1] + (1 - v) * 0.012;
        pos.push(x, y, z);
        let kc = v < 0.35 ? P.cov : t < 0.45 ? P.spec : P.prim;
        if (t < 0.45 && v >= 0.35 && v < 0.5) kc = C('#f0f0ea');
        if (t >= 0.45) kc = P.prim;
        if (v < 0.25) kc = P.back;
        col.push(kc.r, kc.g, kc.b);
        // side, segment (0 bras, 1 main), distance au poignet
        wing.push(side, t < 0.45 ? 0 : 1, t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55);
        piv.push(shoulder[0], shoulder[1], shoulder[2]);
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = wb + i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
      }
  }
  // Longue queue du pilet
  if (sp.longTail) {
    const tb = pos.length / 3;
    pos.push(0, 0.01, -0.22, 0.01, 0.0, -0.36, -0.01, 0.0, -0.36);
    for (let k = 0; k < 3; k++) { col.push(P.tail.r, P.tail.g, P.tail.b); wing.push(0, 0, 0); piv.push(0, 0, 0); }
    idx.push(tb, tb + 1, tb + 2, tb, tb + 2, tb + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lin = col.map((v) => Math.pow(v, 2.2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(lin, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 3));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv.map((v) => v * sp.size), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.scale(sp.size, sp.size, sp.size);
  g.computeBoundingSphere();
  return g;
}

// Oiseau naturalisé « en vol » (pavillon) : ailes relevées figées dans la géométrie
export function birdMountGeometry(species, sex) {
  const sp = BIRDS[species] || BIRDS.colvert;
  const key = PLUMAGE[species + '_' + sex] ? species + '_' + sex : PLUMAGE[species] ? species : 'colvert_m';
  const g = buildBirdGeometry(sp, PLUMAGE[key]);
  const pos = g.attributes.position, w = g.attributes.aWing, pv = g.attributes.aPivot;
  for (let i = 0; i < pos.count; i++) {
    const side = w.getX(i);
    if (Math.abs(side) < 0.5) continue;
    let ang = 1.0;
    if (w.getY(i) > 0.5) ang += 0.45 * w.getZ(i);
    const rx = pos.getX(i) - pv.getX(i), ry = pos.getY(i) - pv.getY(i);
    const c = Math.cos(ang), s2 = Math.sin(ang) * side;
    pos.setXY(i, rx * c - ry * s2 + pv.getX(i), rx * s2 + ry * c + pv.getY(i));
  }
  g.deleteAttribute('aWing');
  g.deleteAttribute('aPivot');
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function birdMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    injectGlobals(s);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aWing;
        attribute vec3 aPivot;
        attribute vec4 aFlap; // x : phase, y : amplitude, z : repli (posé), w : mort`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        if ( abs( aWing.x ) > 0.5 ) {
          float side = aWing.x;
          // Battement : bras autour de l'épaule, main avec un léger retard (onde)
          float ang = sin( aFlap.x ) * aFlap.y * 0.9 + mix( 0.12, -0.05, aFlap.z );
          if ( aWing.y > 0.5 ) ang += sin( aFlap.x - 0.7 ) * aFlap.y * 0.8 * aWing.z;
          ang -= aFlap.w * 0.6;
          vec3 rel = transformed - aPivot;
          float c = cos( ang ), s2 = sin( ang ) * side;
          vec3 r = vec3( rel.x * c - rel.y * s2, rel.x * s2 + rel.y * c, rel.z );
          vec3 flying = r + aPivot;
          // Ailes repliées le long du dos (posé, nage)
          vec3 folded = vec3( aPivot.x * 0.85, aPivot.y + 0.01 + abs( rel.x ) * 0.08, aPivot.z - abs( rel.x ) * 0.9 + rel.z * 0.3 );
          transformed = mix( flying, folded, aFlap.z );
        }
      `);
  };
  m.customProgramCacheKey = () => 'bird';
  return m;
}

// ------------------------------------------------------------------ un oiseau
class Bird {
  constructor(sys, flock, species, sex) {
    this.sys = sys;
    this.flock = flock;
    this.species = species;
    this.sp = BIRDS[species];
    this.sex = sex;
    this.key = PLUMAGE[species + '_' + sex] ? species + '_' + sex : species;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.phase = R() * Math.PI * 2;
    this.amp = 0.9;
    this.fold = 0;
    this.state = 'fly'; // fly | glide | swim | fall | dead
    this.hp = this.sp.hp * (0.85 + R() * 0.3);
    this.dmg = 0;
    this.alive = true;
    this.off = new THREE.Vector3((R() - 0.5) * 6, (R() - 0.5) * 2.5, (R() - 0.5) * 6);
    this.weight = lerp(this.sp.weight[0], this.sp.weight[1], Math.pow(R(), 1.6) * 0.92 + 0.04 * R()) * (sex === 'f' ? 0.92 : 1);
    this.erraticT = 0;
    this.err = new THREE.Vector3();
    this.retrieved = false;
  }

  hit(proj, info) {
    if (!this.alive) return;
    const d = proj.origin.distanceTo(this.pos);
    const ammo = proj.weapon && proj.dmg ? proj : null;
    const range = 45 * (proj.weapon && proj.weapon.range ? proj.weapon.range : 1);
    const falloff = clamp(1.2 - d / range, 0.12, 1);
    this.dmg += (proj.dmg || 12) * falloff * (info.head ? 1.6 : 1);
    void ammo;
    this.sys.pendingHits.add(this);
    this.lastShooter = proj.origin.clone();
  }

  resolveHits() {
    if (!this.alive) return;
    if (this.dmg >= this.hp) this.kill();
    else if (this.dmg > this.hp * 0.45) {
      this.kill(true);
    }
  }

  kill(wounded = false) {
    this.alive = false;
    this.state = 'fall';
    this.wounded = wounded;
    this.vel.multiplyScalar(wounded ? 0.7 : 0.5);
    this.vel.y = wounded ? -1 : 0.5;
    this.spin = (R() - 0.5) * 8;
    this.sys.onBirdDown(this);
  }

  get center() { return this.pos; }
}

// ------------------------------------------------------------------ système
export class BirdSystem {
  constructor(hunt, texgen, duckMode) {
    this.hunt = hunt;
    this.map = hunt.map;
    this.duckMode = duckMode;
    this.group = new THREE.Group();
    this.mat = birdMaterial();
    this.meshes = {};
    this.flocks = [];
    this.birds = [];
    this.spawnT = duckMode ? 6 : 40;
    this.pendingHits = new Set();
    this.decoys = [];
    const save = Save.get();
    this.hasDecoys = save.owned.includes('appelants');
    this.hasDog = save.owned.includes('chien');
    const speedK = save.options.birdSpeed || 1;
    this.speedK = speedK;
    for (const key in PLUMAGE) {
      const species = key.split('_')[0];
      const geo = buildBirdGeometry(BIRDS[species], PLUMAGE[key]);
      const flap = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4);
      flap.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFlap', flap);
      const m = new THREE.InstancedMesh(geo, this.mat, 64);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes[key] = m;
      this.group.add(m);
    }
    this.placeDecoys();
    // Quelques canards déjà posés sur l'étang
    for (let i = 0; i < (duckMode ? 3 : 2); i++) this.spawnFlock(true);
  }

  placeDecoys() {
    const hut = this.hunt.structures.hut;
    const n = this.hasDecoys ? 10 : 4;
    const fwd = new THREE.Vector3(-Math.sin(hut.yaw), 0, -Math.cos(hut.yaw));
    for (let i = 0; i < n; i++) {
      const p = hut.seatPos.clone().addScaledVector(fwd, 14 + R() * 14).add(new THREE.Vector3((R() - 0.5) * 16, 0, (R() - 0.5) * 6));
      if (this.map.waterDepth(p.x, p.z) < 0.15) continue;
      this.decoys.push({ pos: p.setY(this.map.water + 0.02), yaw: R() * 6.28, key: R() < 0.55 ? 'colvert_m' : 'colvert_f', bob: R() * 6 });
    }
  }

  pickSpecies() {
    const tbl = {};
    for (const k in BIRDS) tbl[k] = BIRDS[k].w;
    let tot = 0;
    for (const k in tbl) tot += tbl[k];
    let x = R() * tot;
    for (const k in tbl) { x -= tbl[k]; if (x <= 0) return k; }
    return 'colvert';
  }

  spawnFlock(onWater = false) {
    const species = this.pickSpecies();
    const sp = BIRDS[species];
    const n = sp.swan ? (R() < 0.6 ? 1 : 2) : sp.goose ? 4 + Math.floor(R() * 7) : 2 + Math.floor(R() * 6);
    const lake = PLACES.lake;
    const flock = { species, birds: [], state: 'approach', t: 0, passes: 0, target: new THREE.Vector3(), leaderPos: new THREE.Vector3(), leaderVel: new THREE.Vector3(), alarm: 0, landSpot: null };
    if (onWater) {
      flock.state = 'swim';
      flock.leaderPos.set(lake.x + (R() - 0.5) * lake.rx, this.map.water, lake.z + (R() - 0.5) * lake.rz * 0.8);
    } else {
      // Arrivée depuis l'horizon, à 50–80 m de haut
      const a = R() * Math.PI * 2;
      flock.leaderPos.set(lake.x + Math.cos(a) * 650, this.map.water + 55 + R() * 30, lake.z + Math.sin(a) * 650);
      flock.leaderVel.set(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(sp.speed * this.speedK);
    }
    for (let i = 0; i < n; i++) {
      const sex = sp.sexed ? (R() < 0.55 ? 'm' : 'f') : 'u';
      const b = new Bird(this, flock, species, sex);
      if (sp.goose && !onWater) {
        // Vol en V
        const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
        b.off.set(side * rank * 2.2, rank * 0.25, -rank * 2.6);
      }
      b.pos.copy(flock.leaderPos).add(onWater ? new THREE.Vector3(b.off.x, 0, b.off.z) : b.off);
      b.vel.copy(flock.leaderVel);
      if (onWater) { b.state = 'swim'; b.fold = 1; b.amp = 0; b.pos.y = this.map.water; }
      flock.birds.push(b);
      this.birds.push(b);
    }
    this.flocks.push(flock);
    return flock;
  }

  callDucks(p) {
    for (const f of this.flocks) {
      if (f.state === 'circle' || f.state === 'approach') {
        f.called = 1;
        f.target.copy(p);
      }
    }
  }

  hearShot(origin) {
    for (const f of this.flocks) {
      const d = f.leaderPos.distanceTo(origin);
      if (d < 260) {
        f.alarm = 1;
        if (f.state === 'swim') f.state = 'takeoff';
        else if (f.state !== 'leave') { f.state = 'leave'; f.t = 0; }
      }
    }
  }

  onBirdDown(b) {
    const h = this.hunt;
    h.effects.feathers(b.pos.clone(), new THREE.Color(0.5, 0.45, 0.38));
    const save = Save.get();
    save.stats.hits++;
    b.flock.alarm = 1;
    if (b.flock.state !== 'leave') { b.flock.state = 'leave'; b.flock.t = 0; }
  }

  // Grenaille contre les oiseaux
  raycast(a, b, rad) {
    let best = null;
    const ab = new THREE.Vector3().subVectors(b, a);
    const len2 = ab.lengthSq();
    for (const bird of this.birds) {
      if (!bird.alive || bird.state === 'swim' && false) continue;
      const r = 0.13 * bird.sp.size + rad;
      const t = clamp(new THREE.Vector3().subVectors(bird.pos, a).dot(ab) / len2, 0, 1);
      const p = a.clone().addScaledVector(ab, t);
      const d = p.distanceTo(bird.pos);
      if (d < r && (!best || t < best.t)) best = { bird, t, head: d < r * 0.4 };
    }
    return best;
  }

  update(dt, player, camera) {
    const m = this.map;
    const lake = PLACES.lake;
    const hut = this.hunt.structures.hut;
    // Nouveaux vols (plus nombreux à l'aube et au crépuscule)
    const hour = this.hunt.world.sky.hour;
    const passee = (hour > 6.3 && hour < 9.5) || (hour > 17 && hour < 20.5) ? 1.6 : 0.8;
    this.spawnT -= dt * passee;
    const active = this.flocks.filter((f) => f.state !== 'gone').length;
    if (this.spawnT <= 0 && active < (this.duckMode ? 6 : 3)) {
      this.spawnT = this.duckMode ? 18 + R() * 30 : 60 + R() * 80;
      this.spawnFlock(false);
    }
    // Résolution des impacts de grenaille (après la gerbe)
    for (const b of this.pendingHits) b.resolveHits();
    this.pendingHits.clear();
    const playerVisible = player.visibility;
    const decoyCenter = this.decoys.length ? this.decoys[0].pos : new THREE.Vector3(lake.x, m.water, lake.z);
    for (const f of this.flocks) {
      f.t += dt;
      const sp = BIRDS[f.species];
      const cruise = sp.speed * this.speedK;
      const L = f.leaderPos, V = f.leaderVel;
      let desired = null, speed = cruise, alt = m.water + 40;
      const center = new THREE.Vector3(lake.x, m.water, lake.z);
      if (f.state === 'approach') {
        desired = center.clone().sub(L).setY(0);
        alt = m.water + 45;
        if (desired.length() < 160) { f.state = 'circle'; f.t = 0; }
      } else if (f.state === 'circle') {
        // Tour au-dessus des appelants, puis décision de se poser
        const c = decoyCenter;
        const rel = L.clone().sub(c).setY(0);
        const r = 55 + 20 * Math.sin(f.t * 0.2);
        const tang = new THREE.Vector3(-rel.z, 0, rel.x).normalize();
        desired = tang.multiplyScalar(cruise).add(rel.clone().normalize().multiplyScalar((r - rel.length()) * 0.4));
        alt = m.water + 32 - Math.min(f.t, 20) * 0.6;
        speed = cruise * 0.85;
        const wary = playerVisible > 0.8 && L.distanceTo(player.pos) < 70;
        if (f.t > 14 + R() * 0.1 && !wary && (this.hasDecoys || R() < 0.004 || f.called)) {
          f.state = 'land';
          f.t = 0;
          f.landSpot = c.clone().add(new THREE.Vector3((R() - 0.5) * 20, 0, (R() - 0.5) * 12));
          if (m.waterDepth(f.landSpot.x, f.landSpot.z) < 0.3) f.landSpot.set(lake.x, m.water, lake.z);
        }
        if (f.t > 45 || (wary && f.t > 8)) { f.state = 'leave'; f.t = 0; }
      } else if (f.state === 'land') {
        // Ailes en coupe, pattes basses : approche lente et basse (tir facile)
        const to = f.landSpot.clone().sub(L);
        const hd = Math.hypot(to.x, to.z);
        desired = to.setY(0);
        speed = lerp(5, cruise * 0.75, clamp(hd / 80, 0, 1));
        alt = m.water + clamp(hd * 0.22, 0.2, 30);
        if (hd < 3 && L.y < m.water + 0.8) {
          f.state = 'swim';
          f.t = 0;
          for (const b of f.birds) if (b.alive) { b.state = 'swim'; this.hunt.world.water.ripple(b.pos.x, b.pos.z, 1.2); }
        }
      } else if (f.state === 'swim') {
        speed = 0.25;
        desired = new THREE.Vector3(Math.sin(f.t * 0.1), 0, Math.cos(f.t * 0.13));
        alt = m.water;
        if (f.t > 90 + R() * 0.2 || (player.pos.distanceTo(L) < 30 && playerVisible > 0.6)) f.state = 'takeoff';
      } else if (f.state === 'takeoff') {
        desired = L.clone().sub(player.pos).setY(0);
        speed = cruise * 0.8;
        alt = m.water + 30;
        for (const b of f.birds) if (b.alive && b.state === 'swim') { b.state = 'fly'; this.hunt.world.water.ripple(b.pos.x, b.pos.z, 1.5); }
        if (f.t > 3) { f.state = 'leave'; f.t = 0; }
      } else if (f.state === 'leave') {
        desired = L.clone().sub(center).setY(0);
        if (desired.lengthSq() < 1) desired.set(1, 0, 0);
        speed = cruise * (f.alarm ? 1.35 : 1);
        alt = m.water + 70;
        if (L.distanceTo(center) > 750) f.state = 'gone';
      }
      if (f.state !== 'swim' && f.state !== 'gone') {
        desired.normalize().multiplyScalar(speed);
        V.x = damp(V.x, desired.x, 1.2, dt);
        V.z = damp(V.z, desired.z, 1.2, dt);
        V.y = damp(V.y, clamp((alt - L.y) * 0.6, -4, 3.5), 2, dt);
        L.addScaledVector(V, dt);
        const gh = m.heightAt(L.x, L.z);
        if (L.y < gh + 8 && f.state !== 'land') L.y = gh + 8;
      } else if (f.state === 'swim') {
        L.addScaledVector(desired, dt * speed);
        L.y = m.water;
      }
      // Membres de la bande
      for (const b of f.birds) {
        if (!b.alive) continue;
        const target = L.clone();
        if (b.state === 'swim') {
          target.add(new THREE.Vector3(b.off.x * 1.3, 0, b.off.z * 1.3));
          target.y = m.water;
          b.pos.x = damp(b.pos.x, target.x, 0.5, dt);
          b.pos.z = damp(b.pos.z, target.z, 0.5, dt);
          b.pos.y = m.water + Math.sin(performance.now() / 700 + b.phase) * 0.01;
          b.vel.set(Math.sin(f.t * 0.1 + b.phase), 0, Math.cos(f.t * 0.13 + b.phase)).multiplyScalar(0.2);
          b.fold = damp(b.fold, 1, 4, dt);
          b.amp = 0;
          continue;
        }
        // Vol désordonné de la sarcelle
        b.erraticT -= dt;
        if (b.erraticT <= 0) {
          b.erraticT = 0.4 + R() * 0.8;
          b.err.set((R() - 0.5), (R() - 0.5) * 0.5, (R() - 0.5)).multiplyScalar(sp.erratic * 7);
        }
        const yawM = new THREE.Matrix4().lookAt(new THREE.Vector3(), V.clone().setY(0).normalize().negate(), new THREE.Vector3(0, 1, 0));
        const off = b.off.clone().applyMatrix4(yawM);
        target.add(off).add(b.err);
        const to = target.sub(b.pos);
        b.vel.lerp(V.clone().add(to.multiplyScalar(1.2)), 1 - Math.exp(-3 * dt));
        b.pos.addScaledVector(b.vel, dt);
        b.fold = damp(b.fold, 0, 6, dt);
        const gliding = f.state === 'land' || (f.state === 'circle' && Math.sin(f.t * 0.7 + b.phase) > 0.55);
        b.amp = damp(b.amp, gliding ? 0.12 : 0.85, 4, dt);
        b.phase += dt * Math.PI * 2 * sp.flap * (gliding ? 0.5 : 1) * (f.alarm ? 1.25 : 1);
      }
    }
    // Oiseaux abattus : chute et récupération
    for (const b of this.birds) {
      if (b.state === 'fall') {
        b.vel.y -= 9.8 * dt * (b.wounded ? 0.45 : 1);
        b.vel.multiplyScalar(Math.exp(-0.4 * dt));
        b.pos.addScaledVector(b.vel, dt);
        b.phase += dt * (b.spin || 4);
        b.amp = b.wounded ? 0.5 : 0.25;
        const gh = Math.max(m.heightAt(b.pos.x, b.pos.z), m.water);
        if (b.pos.y <= gh) {
          b.pos.y = gh;
          b.state = 'dead';
          b.deadT = 0;
          if (m.heightAt(b.pos.x, b.pos.z) < m.water) {
            this.hunt.effects.splash(b.pos.clone());
            this.hunt.world.water.ripple(b.pos.x, b.pos.z, 1.5);
            this.hunt.audio.impact('water', b.pos.clone());
          }
        }
      } else if (b.state === 'dead' && !b.retrieved) {
        b.deadT += dt;
        if (b.deadT > (this.hasDog ? 4 : 7)) {
          b.retrieved = true;
          this.hunt.onDuckRetrieved(b);
        }
      }
    }
    this.flocks = this.flocks.filter((f) => f.state !== 'gone' || f.birds.some((b) => !b.alive && !b.retrieved));
    this.birds = this.birds.filter((b) => !b.retrieved && (b.alive ? b.flock.state !== 'gone' : true));
    // Cris
    if (R() < dt * 0.6) {
      const f = this.flocks[Math.floor(R() * this.flocks.length)];
      if (f && f.birds.length && BIRDS[f.species].call) this.hunt.audio.duck(BIRDS[f.species].call, f.leaderPos.clone());
    }
    this.render(camera);
  }

  render() {
    const counts = {};
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    const put = (key, pos, yaw, pitch, roll, flap) => {
      const mesh = this.meshes[key];
      const i = counts[key] || 0;
      if (i >= 64) return;
      e.set(pitch, yaw, roll, 'YXZ');
      q.setFromEuler(e);
      mtx.compose(pos, q, one);
      mesh.setMatrixAt(i, mtx);
      const a = mesh.geometry.attributes.aFlap.array;
      a[i * 4] = flap[0]; a[i * 4 + 1] = flap[1]; a[i * 4 + 2] = flap[2]; a[i * 4 + 3] = flap[3];
      counts[key] = i + 1;
    };
    for (const b of this.birds) {
      const v = b.vel;
      const yaw = Math.atan2(v.x, v.z);
      const pitch = b.state === 'fly' ? -clamp(v.y * 0.08, -0.5, 0.5) : 0;
      const roll = b.state === 'fall' ? b.phase : 0;
      put(b.key, b.pos, yaw, b.state === 'fall' ? b.phase * 0.7 : pitch, roll, [b.phase, b.amp, b.fold, b.alive ? 0 : 1]);
    }
    const t = performance.now() / 1000;
    for (const d of this.decoys) {
      put(d.key, d.pos.clone().setY(this.map.water + Math.sin(t + d.bob) * 0.012), d.yaw + Math.sin(t * 0.2 + d.bob) * 0.2, 0, Math.sin(t * 1.3 + d.bob) * 0.03, [0, 0, 1, 0]);
    }
    for (const k in this.meshes) {
      const mesh = this.meshes[k];
      mesh.count = counts[k] || 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aFlap.needsUpdate = true;
    }
  }

  // Médaille d'un oiseau selon son poids
  static medal(species, weight) {
    const m = BIRDS[species].medals;
    if (!m) return 'aucune';
    if (weight >= m[3]) return 'diamant';
    if (weight >= m[2]) return 'or';
    if (weight >= m[1]) return 'argent';
    if (weight >= m[0]) return 'bronze';
    return 'aucune';
  }
}
