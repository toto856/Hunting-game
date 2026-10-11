// Individu de grand gibier : comportement (brouter, marcher, se coucher, alerte, fuite),
// perception du chasseur (vue, ouïe, proximité), dégâts selon les organes touchés.
import * as THREE from 'three';
import { clamp, lerp, angleDiff, dampAngle, damp, R } from '../core/math.js';
import { SPECIES } from './species.js';
import { buildVitals, buildHull, segEllipsoid, ORGANS } from './vitals.js';

const SENSES = {
  cerf: { sight: 150, hear: 95, wary: 1.0, maxSlope: 0.85 },
  chevreuil: { sight: 115, hear: 85, wary: 1.2, maxSlope: 0.9 },
  sanglier: { sight: 50, hear: 95, wary: 0.9, maxSlope: 0.8 },
  chamois: { sight: 240, hear: 85, wary: 1.3, maxSlope: 1.6 },
  daim: { sight: 135, hear: 90, wary: 1.1, maxSlope: 0.85 },
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const vitalsCache = {}, hullCache = {};

export class Animal {
  constructor(world, ind, group) {
    this.world = world;
    this.ind = ind;
    this.spec = SPECIES[ind.species];
    this.senses = SENSES[ind.species];
    this.group = group;
    this.pos = new THREE.Vector3(ind.x, world.map.heightAt(ind.x, ind.z), ind.z);
    this.yaw = R() * Math.PI * 2;
    this.speed = 0;
    this.targetSpeed = 0;
    this.goal = null;
    this.state = 'graze';
    this.stateT = 5 + R() * 20;
    this.suspicion = 0;
    this.threat = null;
    this.alive = true;
    this.dead = false;
    this.harvested = false;
    this.wounds = [];
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.headUpT = 0;
    this.fleeT = 0;
    this.dieT = -1;
    this.runLeft = 0;
    this.limp = 0;
    this.vis = null;
    this.lod = -1;
    this.pitch = 0;
    this.roll = 0;
    this.percT = R() * 0.3;
    this.calmT = 0;
    this.sound = null;
    this.callT = 10 + R() * 40;
    if (!vitalsCache[ind.species]) {
      vitalsCache[ind.species] = buildVitals(this.spec);
      hullCache[ind.species] = buildHull(this.spec);
    }
    this.vitals = vitalsCache[ind.species];
    this.hull = hullCache[ind.species];
  }

  get leader() { return this.group.members.find((m) => m.alive) || this; }
  get isLeader() { return this.leader === this; }

  setState(s, t) {
    this.state = s;
    this.stateT = t;
  }

  // ------------------------------------------------------------------ perception
  perceive(dt, player) {
    if (!player || !this.alive) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 320) {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.15);
      return;
    }
    const S = this.senses;
    const grazing = this.state === 'graze' && this.headUpT <= 0;
    let sight = 0;
    const range = S.sight * player.visibility * (this.state === 'alert' ? 1.35 : 1) * (grazing ? 0.55 : 1) * this.world.lightFactor;
    if (d < range) {
      const los = this.world.lineOfSight(this.pos.x, this.pos.y + this.spec.body[16][1] * this.ind.scale, this.pos.z, player.pos.x, player.eyeY, player.pos.z);
      sight = (1 - d / range) * los;
    }
    let hear = 0;
    const hr = S.hear * player.noise;
    if (d < hr) hear = 1 - d / hr;
    const close = d < 11 ? 1.5 * (1 - d / 11) : 0;
    const gain = (sight * 1.3 + hear * 0.9 + close) * S.wary;
    if (gain > 0.01) {
      this.suspicion += gain * dt * 1.6;
      this.threat = player.pos.clone();
      this.calmT = 0;
    } else this.suspicion = Math.max(0, this.suspicion - dt * 0.07);
    this.suspicion = Math.min(this.suspicion, 3);
  }

  // Coup de feu entendu
  hearShot(origin, loud = 1) {
    if (!this.alive) return;
    const d = this.pos.distanceTo(origin);
    if (d > 750 * loud) return;
    this.threat = origin.clone();
    if (d < 420 * loud) this.suspicion = 2.5;
    else this.suspicion = Math.max(this.suspicion, 0.8 + R() * 0.5);
  }

  // ------------------------------------------------------------------ décisions
  think(dt) {
    const st = this.state;
    this.stateT -= dt;
    const lead = this.leader;
    if (!this.alive) return;
    // Alerte / fuite (contagieuse dans la harde)
    const groupSusp = Math.max(this.suspicion, ...this.group.members.filter((m) => m.alive).map((m) => m.suspicion * 0.8));
    if (st !== 'flee' && st !== 'dying' && st !== 'wounded') {
      if (groupSusp > 1.0 || (this.wounds.length && this.suspicion > 0.3)) {
        this.startFlee();
        return;
      }
      if (groupSusp > 0.35 && st !== 'alert') {
        this.setState('alert', 4 + R() * 6);
        if (this.world.onAnimalSound && R() < 0.6) this.world.onAnimalSound(this, 'alarm');
        return;
      }
    }
    switch (st) {
      case 'graze':
        this.targetSpeed = 0;
        this.headUpT -= dt;
        if (this.headUpT < -6 - R() * 10) this.headUpT = 1.5 + R() * 3;
        if (this.stateT <= 0) this.pickNext();
        break;
      case 'idle':
        this.targetSpeed = 0;
        if (this.stateT <= 0) this.pickNext();
        break;
      case 'walk': {
        const g = this.goal;
        if (!g) { this.pickNext(); break; }
        const dist = Math.hypot(g.x - this.pos.x, g.z - this.pos.z);
        this.targetSpeed = this.spec.speeds.walk * this.ind.scale * (this.isLeader ? 1 : dist > 6 ? 1.4 : 0.9);
        if (dist < 1.5 || this.stateT <= 0) this.setState(R() < 0.7 ? 'graze' : 'idle', 8 + R() * 25);
        break;
      }
      case 'bed':
        this.targetSpeed = 0;
        if (this.stateT <= 0) this.setState('idle', 5);
        break;
      case 'alert':
        this.targetSpeed = 0;
        if (this.suspicion < 0.25 && this.stateT <= 0) this.setState('idle', 4 + R() * 4);
        if (this.stateT <= -10) this.setState('walk', 20), (this.goal = this.awayFromThreat(40));
        break;
      case 'flee': {
        this.fleeT -= dt;
        const k = this.fleeT > 0 ? 1 : 0.55;
        const run = this.spec.speeds.run * this.ind.scale;
        this.targetSpeed = lerp(this.spec.speeds.trot * this.ind.scale, run, k) * (1 - this.limp * 0.45);
        if (!this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 6) this.goal = this.awayFromThreat(120);
        if (this.fleeT < -12 && this.suspicion < 0.6) {
          this.suspicion = 0.2;
          this.setState(this.wounds.length ? 'bed' : 'idle', this.wounds.length ? 200 : 8);
        }
        break;
      }
      case 'wounded':
        this.state = 'flee';
        break;
      case 'dying':
        this.targetSpeed = this.runLeft > 0 ? this.spec.speeds.run * this.ind.scale * 0.85 : 0;
        if (!this.goal) this.goal = this.awayFromThreat(150);
        if (this.dieT <= 0) this.die();
        break;
      default:
        break;
    }
    // Cerf : brame à l'aube et au crépuscule (rut d'octobre)
    if (this.ind.species === 'cerf' && this.ind.sex === 'm' && (st === 'idle' || st === 'graze')) {
      this.callT -= dt;
      if (this.callT <= 0) {
        this.callT = 25 + R() * 70;
        if (this.world.rutActivity() > R()) {
          this.roarT = 3.5;
          if (this.world.onAnimalSound) this.world.onAnimalSound(this, 'roar');
        }
      }
    }
    this.roarT = Math.max(0, (this.roarT || 0) - dt);
  }

  pickNext() {
    const lead = this.leader;
    const w = this.world;
    const r = R();
    if (this.isLeader) {
      if (r < 0.45) {
        this.goal = w.pickGoal(this, this.group.home);
        this.setState('walk', 60);
      } else if (r < 0.85 || !w.isRestTime()) this.setState('graze', 15 + R() * 40);
      else this.setState('bed', 90 + R() * 160);
    } else {
      // Les suiveurs restent proches du meneur
      const off = this.group.offsets.get(this) || new THREE.Vector2();
      const g = new THREE.Vector3(lead.pos.x + off.x, 0, lead.pos.z + off.y);
      if (Math.hypot(g.x - this.pos.x, g.z - this.pos.z) > 5) {
        this.goal = g;
        this.setState('walk', 30);
      } else this.setState(lead.state === 'bed' ? 'bed' : R() < 0.75 ? 'graze' : 'idle', 8 + R() * 20);
    }
  }

  startFlee() {
    this.setState('flee', 999);
    this.fleeT = 6 + R() * 6;
    this.goal = this.awayFromThreat(160);
    if (this.world.onAnimalSound) this.world.onAnimalSound(this, 'flee');
  }

  awayFromThreat(dist) {
    const t = this.threat || this.pos.clone().add(new THREE.Vector3(R() - 0.5, 0, R() - 0.5));
    _v.set(this.pos.x - t.x, 0, this.pos.z - t.z);
    if (_v.lengthSq() < 0.01) _v.set(R() - 0.5, 0, R() - 0.5);
    _v.normalize();
    // Un peu d'aléa, et le groupe fuit dans la même direction
    const lead = this.leader;
    if (lead !== this && lead.goal && lead.state === 'flee') return lead.goal.clone().add(new THREE.Vector3((R() - 0.5) * 12, 0, (R() - 0.5) * 12));
    const a = Math.atan2(_v.z, _v.x) + (R() - 0.5) * 0.8;
    const g = new THREE.Vector3(this.pos.x + Math.cos(a) * dist, 0, this.pos.z + Math.sin(a) * dist);
    return this.world.clampGoal(g, this);
  }

  // ------------------------------------------------------------------ déplacement
  move(dt) {
    const w = this.world;
    const m = w.map;
    let desired = this.yaw;
    if (this.goal && this.targetSpeed > 0.05) {
      desired = Math.atan2(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      // Évitement : eau profonde, pente, bord du domaine
      const look = 3 + this.speed * 0.8;
      for (let k = 0; k < 6; k++) {
        const nx = this.pos.x + Math.sin(desired) * look, nz = this.pos.z + Math.cos(desired) * look;
        const bad = m.waterDepth(nx, nz) > (this.ind.species === 'sanglier' ? 0.5 : 0.25) || m.slopeAt(nx, nz) > this.senses.maxSlope || !m.inBounds(nx, nz, 40);
        if (!bad) break;
        desired += (k % 2 ? -1 : 1) * 0.6 * (k + 1);
      }
    }
    const turnRate = this.speed > 4 ? 2.2 : 1.6;
    const prevYaw = this.yaw;
    this.yaw = dampAngle(this.yaw, desired, turnRate, dt);
    this.turnRate = angleDiff(prevYaw, this.yaw) / Math.max(dt, 1e-3);
    const acc = this.targetSpeed > this.speed ? 3.5 : 5;
    this.speed = damp(this.speed, this.targetSpeed, acc, dt);
    if (this.speed > 0.01) {
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      if (w.veg) w.veg.collide(this.pos, 0.35 * this.ind.scale);
      if (!m.inBounds(this.pos.x, this.pos.z, 25)) {
        this.pos.x = clamp(this.pos.x, -m.half + 25, m.half - 25);
        this.pos.z = clamp(this.pos.z, -m.half + 25, m.half - 25);
      }
      if (this.state === 'dying') this.runLeft -= this.speed * dt;
    }
    // Suivre le relief : altitude, tangage, roulis
    const L = (this.spec.front.pts[4][2] - this.spec.rear.pts[4][2]) * this.ind.scale;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const hf = m.heightAt(this.pos.x + sy * L * 0.5, this.pos.z + cy * L * 0.5);
    const hb = m.heightAt(this.pos.x - sy * L * 0.5, this.pos.z - cy * L * 0.5);
    const hl = m.heightAt(this.pos.x + cy * 0.3, this.pos.z - sy * 0.3);
    const hr = m.heightAt(this.pos.x - cy * 0.3, this.pos.z + sy * 0.3);
    const ground = Math.max(m.heightAt(this.pos.x, this.pos.z), m.water - (this.ind.species === 'sanglier' ? 0.45 : 0.25));
    this.pos.y = damp(this.pos.y, (hf + hb) / 2 * 0.5 + ground * 0.5, 10, dt);
    this.pitch = damp(this.pitch, Math.atan2(hf - hb, L), 6, dt);
    this.roll = damp(this.roll, Math.atan2(hl - hr, 0.6) * 0.4, 6, dt);
  }

  // ------------------------------------------------------------------ mise à jour
  update(dt, player, frameVisible) {
    this.percT -= dt;
    if (this.percT <= 0 && this.alive) {
      this.percT = 0.25;
      this.perceive(0.25, player);
    }
    if (this.alive) {
      this.think(dt);
      this.move(dt);
      if (this.dieT > 0) this.dieT -= dt;
      if (this.dieT !== -1 && this.dieT <= 0 && this.state !== 'dying') this.die();
    }
    // Regard vers la menace en alerte
    if (this.threat && (this.state === 'alert' || this.headUpT > 0)) {
      const a = Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z);
      this.lookYaw = clamp(angleDiff(this.yaw, a), -1.3, 1.3);
    } else this.lookYaw *= 0.95;
    if (frameVisible && this.vis) this.animate(dt);
  }

  animate(dt) {
    const v = this.vis;
    v.holder.position.copy(this.pos);
    v.holder.rotation.set(0, 0, 0);
    v.holder.rotateY(this.yaw);
    v.holder.rotateX(-this.pitch);
    v.holder.rotateZ(this.roll);
    v.animator.update(dt, {
      speed: this.alive ? this.speed : 0,
      graze: this.state === 'graze' && this.headUpT <= 0,
      alert: this.state === 'alert' || (this.state === 'graze' && this.headUpT > 0),
      bed: this.state === 'bed',
      dead: this.dead,
      dropFast: this.dropFast,
      turn: this.turnRate * 0.4,
      lookYaw: this.lookYaw,
      limp: this.limp,
      roar: this.roarT > 0,
      kick: this._kick,
      stomp: this.state === 'alert' && Math.random() < 0.004,
    });
    this._kick = false;
  }

  die() {
    if (this.dead) return;
    this.alive = false;
    this.dead = true;
    this.state = 'dead';
    this.speed = 0;
    this.deathPos = this.pos.clone();
    if (this.world.onAnimalDied) this.world.onAnimalDied(this);
  }

  // ------------------------------------------------------------------ balistique terminale
  // Teste un segment de trajectoire (monde). Renvoie l'impact ou null.
  testHit(a, b) {
    if (!this.vis || this.harvested) return null;
    const bones = this.vis.bones;
    const wp = this.vis.worldPos;
    this.vis.holder.updateMatrixWorld(true);
    let best = null;
    for (const h of this.hull) {
      const bone = bones[h.bone];
      const r = segEllipsoid(a, b, bone, h, wp[h.bone], this.ind.scale);
      if (r && (!best || r[0] < best.t0)) best = { t0: r[0], t1: r[1], zone: h.zone, hull: h };
    }
    return best;
  }

  // Organes traversés par la balle (le long du segment a->b)
  organsOnPath(a, b) {
    const bones = this.vis.bones;
    const wp = this.vis.worldPos;
    const hits = [];
    for (const o of this.vitals) {
      const r = segEllipsoid(a, b, bones[o.bone], o, wp[o.bone], this.ind.scale);
      if (r) hits.push({ key: o.key, t: r[0], t1: r[1], depth: r[1] - r[0] });
    }
    hits.sort((x, y) => x.t - y.t);
    // Chemin dans l'espace du modèle (pose de liaison) pour la radiographie
    const bone = bones.spine2;
    const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const pa = a.clone().applyMatrix4(inv).add(wp.spine2);
    const pb = b.clone().applyMatrix4(inv).add(wp.spine2);
    return { hits, path: [pa, pb] };
  }

  // Applique les dégâts d'une balle (organes, énergie en joules)
  applyHit(info) {
    if (!this.alive) {
      this.wounds.push(info);
      return { killed: false, already: true };
    }
    this.wounds.push(info);
    const keys = new Set(info.organs.map((o) => o.key));
    const lungs = (keys.has('poumonG') ? 1 : 0) + (keys.has('poumonD') ? 1 : 0);
    let outcome = 'blesse';
    this.threat = info.from.clone();
    this.suspicion = 3;
    const energyOk = info.energy > this.spec.minEnergy * 0.6;
    if (keys.has('cerveau') || ((keys.has('colonne') || keys.has('cervicales')) && energyOk)) outcome = 'foudroye';
    else if (keys.has('coeur')) outcome = 'coeur';
    else if (lungs === 2) outcome = 'poumons';
    else if (lungs === 1) outcome = 'poumon';
    else if (keys.has('foie')) outcome = 'foie';
    else if (keys.has('trachee')) outcome = 'trachee';
    else if (keys.has('panse') || keys.has('intestins')) outcome = 'ventre';
    else if (info.zone === 'patte') outcome = 'patte';
    else outcome = 'chair';
    // Faible énergie : pénétration insuffisante (organes plus profonds épargnés)
    if (!energyOk && (outcome === 'coeur' || outcome === 'poumons')) outcome = 'poumon';
    this.lastOutcome = outcome;
    const sc = this.ind.scale;
    switch (outcome) {
      case 'foudroye':
        this.dropFast = true;
        this.dieT = 0.01;
        this.die();
        break;
      case 'coeur':
        this._kick = true;
        this.setState('dying', 99);
        this.runLeft = (30 + R() * 50) * sc;
        this.dieT = 5 + R() * 4;
        break;
      case 'poumons':
        this.setState('dying', 99);
        this.runLeft = (40 + R() * 70) * sc;
        this.dieT = 8 + R() * 6;
        break;
      case 'poumon':
        this.setState('dying', 99);
        this.runLeft = (90 + R() * 110) * sc;
        this.dieT = 25 + R() * 20;
        break;
      case 'foie':
      case 'trachee':
        this.setState('dying', 99);
        this.runLeft = (140 + R() * 150) * sc;
        this.dieT = 55 + R() * 50;
        break;
      case 'ventre':
        this.startFlee();
        this.dieT = 240 + R() * 120;
        break;
      case 'patte':
        this.limp = 1;
        this.startFlee();
        break;
      default:
        this.startFlee();
    }
    if (this.state === 'dying') this.goal = this.awayFromThreat(200);
    // Toute la harde fuit
    for (const m of this.group.members) if (m !== this && m.alive) m.hearShot(info.from, 1);
    return { killed: this.dead, outcome };
  }
}

export { ORGANS };
