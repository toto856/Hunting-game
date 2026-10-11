// Balistique : balles (traînée selon le coefficient balistique, gravité, réglage à 100 m)
// et plombs ; collisions avec le gibier, les oiseaux, les troncs, le sol et l'eau.
import * as THREE from 'three';

const G = 9.81;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// Angle de hausse pour un réglage (zéro) à "zero" mètres
export function zeroAngle(v0, bc, zero = 100) {
  const k = 0.00036 / bc;
  // Temps de vol avec traînée quadratique : t = (e^(k x) - 1) / (k v0)
  const t = (Math.exp(k * zero) - 1) / (k * v0);
  const drop = 0.5 * G * t * t;
  return Math.atan2(drop, zero);
}

export function energyAt(mass, v) {
  return 0.5 * (mass / 1000) * v * v;
}

// Table de tir (chute en cm) pour l'interface
export function dropTable(v0, bc, zero = 100) {
  const k = 0.00036 / bc;
  const ang = zeroAngle(v0, bc, zero);
  const out = [];
  for (const x of [50, 100, 150, 200, 250, 300]) {
    const t = (Math.exp(k * x) - 1) / (k * v0);
    const drop = 0.5 * G * t * t - Math.tan(ang) * x;
    const v = v0 * Math.exp(-k * x);
    out.push({ x, drop: -drop * 100, v });
  }
  return out;
}

export class Ballistics {
  constructor(world) {
    this.world = world;
    this.list = [];
  }

  fire(opts) {
    // opts : origin, dir, speed, mass (g), bc, pellet (bool), dmg, maxRange, weapon, shotId
    const p = {
      pos: opts.origin.clone(), prev: opts.origin.clone(), vel: opts.dir.clone().multiplyScalar(opts.speed),
      k: opts.pellet ? opts.drag || 0.0055 : 0.00036 / opts.bc, mass: opts.mass, pellet: !!opts.pellet, dmg: opts.dmg || 0,
      dist: 0, maxRange: opts.maxRange || 1200, alive: true, origin: opts.origin.clone(), shotId: opts.shotId, weapon: opts.weapon,
      v0: opts.speed, trace: opts.trace,
    };
    this.list.push(p);
    return p;
  }

  update(dt) {
    const steps = 4;
    const h = dt / steps;
    for (const p of this.list) {
      for (let s = 0; s < steps && p.alive; s++) {
        const v = p.vel.length();
        // Traînée quadratique + gravité
        p.vel.addScaledVector(p.vel, -p.k * v * h);
        p.vel.y -= G * h;
        p.prev.copy(p.pos);
        p.pos.addScaledVector(p.vel, h);
        p.dist += v * h;
        this.collide(p);
        if (p.dist > p.maxRange || p.pos.y < -50) p.alive = false;
      }
    }
    this.list = this.list.filter((p) => p.alive);
  }

  collide(p) {
    const w = this.world;
    const a = p.prev, b = p.pos;
    const segLen = a.distanceTo(b);
    // Oiseaux
    if (w.birds) {
      const hb = w.birds.raycast(a, b, p.pellet ? 0.06 : 0.03);
      if (hb) {
        hb.bird.hit(p, hb);
        if (w.onBirdHit) w.onBirdHit(hb.bird, p);
        if (!p.pellet) { p.alive = false; return; }
        p.vel.multiplyScalar(0.6);
      }
    }
    // Gibier
    if (w.population) {
      const h = w.population.raycast(a, b);
      if (h) {
        const entry = _a.copy(a).lerp(b, h.hit.t0);
        if (w.onAnimalHit) w.onAnimalHit(h.animal, h.hit, entry.clone(), p);
        p.alive = false;
        return;
      }
    }
    // Troncs
    if (w.veg) {
      const th = w.veg.treeHit(a, b);
      if (th) {
        if (w.onImpact) w.onImpact('wood', new THREE.Vector3(th.x, th.y, th.z), p);
        p.alive = false;
        return;
      }
    }
    // Structures (miradors, hutte, pavillon)
    if (w.structureHit) {
      const sh = w.structureHit(a, b);
      if (sh) {
        if (w.onImpact) w.onImpact('wood', sh, p);
        p.alive = false;
        return;
      }
    }
    // Eau et sol (marche le long du segment)
    const m = w.map;
    if (!m) return;
    const n = Math.max(1, Math.ceil(segLen / 0.8));
    for (let i = 1; i <= n; i++) {
      _b.copy(a).lerp(b, i / n);
      const gh = m.heightAt(_b.x, _b.z);
      if (gh < m.water && _b.y < m.water) {
        _b.y = m.water;
        if (w.onImpact) w.onImpact('water', _b.clone(), p);
        p.alive = false;
        return;
      }
      if (_b.y < gh) {
        _b.y = gh;
        if (w.onImpact) w.onImpact('ground', _b.clone(), p);
        p.alive = false;
        return;
      }
    }
  }
}
