// Populations du domaine : hardes, compagnies, chevreuils, chamois, daims ; zones de vie,
// rythme de la journée, matérialisation 3D près du chasseur, niveaux de détail.
import * as THREE from 'three';
import { rng, clamp, smoothstep, R } from '../core/math.js';
import { SPECIES } from './species.js';
import { makeTrophy } from './trophies.js';
import { Animal } from './animal.js';
import { PLACES, pathDistance } from '../world/reserveMap.js';

// Compositions par espèce : [nombre de groupes, taille min/max, part de mâles, solitaires]
const PLAN = {
  cerf: { groups: 5, size: [3, 7], males: 0.22, solo: 3 },
  chevreuil: { groups: 11, size: [1, 3], males: 0.45, solo: 3 },
  sanglier: { groups: 4, size: [3, 6], males: 0.0, solo: 3 },
  chamois: { groups: 3, size: [4, 8], males: 0.2, solo: 3 },
  daim: { groups: 3, size: [4, 9], males: 0.3, solo: 1 },
};

function pickFur(spec, r) {
  const tot = spec.furs.reduce((a, f) => a + f.p, 0);
  let x = r() * tot;
  for (const f of spec.furs) {
    x -= f.p;
    if (x <= 0) return f.id;
  }
  return spec.furs[0].id;
}

export function makeIndividual(species, sex, r, x, z) {
  const spec = SPECIES[species];
  // Qualité génétique et âge : quelques "patriarches" exceptionnels
  let q = clamp((r() + r() + r()) / 3 + (r() - 0.5) * 0.25, 0, 1);
  let age = r();
  const exceptional = r() < 0.035;
  if (exceptional) { q = 0.88 + r() * 0.12; age = 0.82 + r() * 0.18; }
  const legendary = species === 'cerf' && sex === 'm' && r() < 0.004;
  const [w0, w1] = spec.weight[sex];
  const k = clamp(q * 0.5 + age * 0.6, 0, 1.1);
  const weight = (w0 + (w1 - w0) * k) * (0.92 + r() * 0.16) * (legendary ? 1.15 : 1);
  const scale = (sex === 'm' ? 1 : spec.scaleF) * (0.9 + 0.13 * k) * (species === 'chamois' ? 0.9 : 1) * (legendary ? 1.05 : 1);
  const fur = legendary ? (spec.furs.find((f) => f.id === 'pie') ? 'pie' : spec.furs[0].id) : pickFur(spec, r);
  const hasTrophy = sex === 'm' || species === 'chamois';
  const trophy = hasTrophy ? makeTrophy(species, Math.floor(r() * 1e9), sex === 'f' ? q * 0.7 : q, age, legendary) : null;
  return { id: Math.floor(r() * 1e9), species, sex, q, age, weight, scale, fur, trophy, legendary, x, z };
}

export class Population {
  constructor(world, factory, seed) {
    this.world = world;
    this.factory = factory;
    this.r = rng(seed);
    this.groups = [];
    this.animals = [];
    this.scene = null;
  }

  // Point de départ adapté à l'espèce
  habitatPoint(species) {
    const m = this.world.map;
    const r = this.r;
    for (let tries = 0; tries < 400; tries++) {
      const x = (r() * 2 - 1) * (m.half - 80), z = (r() * 2 - 1) * (m.half - 80);
      const h = m.heightAt(x, z);
      if (h < m.water + 0.3) continue;
      const slope = m.slopeAt(x, z);
      const f = m.forestAt(x, z);
      const dLodge = Math.hypot(x - PLACES.lodge.x, z - PLACES.lodge.z);
      if (dLodge < 180) continue;
      let ok = false;
      if (species === 'chamois') ok = h > 235 && slope > 0.25;
      else if (species === 'sanglier') ok = f > 0.5 && h < 220 && slope < 0.6;
      else if (species === 'cerf') ok = h < 290 && slope < 0.6 && (f > 0.35 || r() < 0.25);
      else if (species === 'daim') ok = h < 180 && slope < 0.45 && (f < 0.5 || r() < 0.3) && z > -260;
      else ok = h < 260 && slope < 0.65;
      if (ok) return { x, z };
    }
    return { x: (r() - 0.5) * 400, z: (r() - 0.5) * 400 };
  }

  generate() {
    const r = this.r;
    for (const species in PLAN) {
      const P = PLAN[species];
      const make = (n, males) => {
        const home = this.habitatPoint(species);
        const group = { species, home: { x: home.x, z: home.z, r: species === 'chamois' ? 140 : species === 'chevreuil' ? 110 : 190 }, members: [], offsets: new Map() };
        for (let i = 0; i < n; i++) {
          const sex = i < males ? 'm' : 'f';
          const ind = makeIndividual(species, sex, r, home.x + (r() - 0.5) * 14, home.z + (r() - 0.5) * 14);
          const a = new Animal(this.world, ind, group);
          group.members.push(a);
          group.offsets.set(a, new THREE.Vector2((r() - 0.5) * 16, (r() - 0.5) * 16));
          this.animals.push(a);
        }
        // Le meneur : la femelle la plus âgée (hardes), le mâle s'il est seul
        group.members.sort((a, b) => (a.ind.sex === b.ind.sex ? b.ind.age - a.ind.age : a.ind.sex === 'f' ? -1 : 1));
        this.groups.push(group);
      };
      for (let g = 0; g < P.groups; g++) {
        const n = r.int(P.size[0], P.size[1]);
        const males = species === 'chevreuil' ? (r() < 0.6 ? 1 : 0) : Math.round(n * P.males * (0.6 + r() * 0.8));
        make(n, males);
      }
      for (let s = 0; s < P.solo; s++) make(1, 1);
    }
    for (const a of this.animals) a.pos.y = this.world.map.heightAt(a.pos.x, a.pos.z);
  }

  attach(scene) { this.scene = scene; }

  // Matérialisation et niveaux de détail autour du chasseur
  update(dt, player, camera) {
    const cp = camera.position;
    const q = this.world.engine.q;
    let shown = 0;
    // Tri sommaire par distance pour limiter le nombre d'animaux affichés
    for (const a of this.animals) a._d = Math.hypot(a.pos.x - cp.x, a.pos.z - cp.z);
    const near = this.animals.filter((a) => a._d < 520 && !a.harvested).sort((x, y) => x._d - y._d);
    const allowed = new Set(near.slice(0, q.maxAnimals));
    for (const a of this.animals) {
      const want = allowed.has(a);
      if (want && !a.vis) {
        a.vis = this.factory.create(a.ind);
        this.scene.add(a.vis.holder);
      } else if (!want && a.vis && !(a.dead && a._d < 700)) {
        this.scene.remove(a.vis.holder);
        a.vis = null;
        a.lod = -1;
      }
      if (a.vis) {
        const lod = a._d < q.animalsFull * 0.3 ? 0 : a._d < q.animalsFull ? 1 : 2;
        if (lod !== a.lod) {
          this.factory.setLod(a.vis, lod);
          a.lod = lod;
        }
        shown++;
      }
      // Simulation : complète près du joueur, allégée au loin
      if (a._d < 700 || a.state === 'dying') a.update(dt, player, !!a.vis);
      else {
        a._farT = (a._farT || 0) + dt;
        if (a._farT > 1) {
          a.update(a._farT, null, false);
          a._farT = 0;
        }
      }
    }
    this.shown = shown;
  }

  hearShot(origin, loud) {
    for (const a of this.animals) a.hearShot(origin, loud);
  }

  // Projectile contre tous les animaux visibles : premier impact
  raycast(a, b) {
    let best = null;
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b);
    for (const an of this.animals) {
      if (!an.vis || an.harvested) continue;
      if (an.pos.distanceTo(mid) > len * 0.5 + 3) continue;
      const h = an.testHit(a, b);
      if (h && (!best || h.t0 < best.hit.t0)) best = { animal: an, hit: h };
    }
    return best;
  }
}
