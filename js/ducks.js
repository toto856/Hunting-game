// Canards : modèles 3D procéduraux, vols en formation, IA (posé, envol, alerte), chien rapporteur.
'use strict';

(() => {
  const { rand, randInt, pick, clamp, lerp, weighted, chance } = DH.util;
  const matCache = new Map();
  const mat = (color) => {
    if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
    return matCache.get(color);
  };
  const G = {
    sphere: new THREE.SphereGeometry(1, 12, 9),
    sphereLo: new THREE.SphereGeometry(1, 8, 6),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 6),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const part = (geo, color, sx, sy, sz, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------------ MODÈLE
  DH.buildDuckModel = function (spec) {
    const c = spec.colors;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const goose = !!spec.goose;
    part(G.sphere, c.body, 0.15, 0.13, 0.3, 0, 0, 0, body);
    part(G.sphere, c.chest, 0.135, 0.125, 0.14, 0, -0.005, 0.16, body);
    part(G.sphere, c.belly, 0.125, 0.08, 0.22, 0, -0.06, 0.0, body);
    part(G.sphere, c.back, 0.115, 0.06, 0.24, 0, 0.075, -0.04, body);
    if (c.band) part(G.sphere, c.band, 0.14, 0.13, 0.06, 0, 0.0, 0.2, body);
    // Queue
    const tail = part(G.cone, c.tail, 0.07, spec.longTail ? 0.3 : 0.12, 0.03, 0, 0.04, -0.3 - (spec.longTail ? 0.12 : 0.03), body);
    tail.rotation.x = -Math.PI / 2 - 0.15;
    // Cou + tête (pivot pour tendre le cou en vol)
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.06, 0.2);
    body.add(neckPivot);
    const neckLen = spec.swan ? 0.42 : goose ? 0.24 : 0.1;
    part(G.cyl, c.chest === c.head ? c.head : c.head, 0.04, neckLen, 0.04, 0, neckLen / 2, 0, neckPivot);
    if (c.ring) part(G.cyl, c.ring, 0.046, 0.018, 0.046, 0, 0.012, 0, neckPivot);
    const head = new THREE.Group();
    head.position.set(0, neckLen + 0.04, 0);
    neckPivot.add(head);
    part(G.sphere, c.head, 0.065, 0.068, 0.085, 0, 0, 0.01, head);
    if (c.mask) {
      part(G.sphere, c.mask, 0.03, 0.025, 0.045, 0.045, 0.012, 0.005, head);
      part(G.sphere, c.mask, 0.03, 0.025, 0.045, -0.045, 0.012, 0.005, head);
    }
    const bill = part(G.box, c.bill, 0.042, 0.018, spec.swan ? 0.09 : 0.075, 0, -0.012, 0.11, head);
    bill.castShadow = false;
    if (spec.id === 'mandarin') part(G.sphere, c.head, 0.03, 0.06, 0.07, 0, 0.03, -0.05, head);
    // Ailes articulées
    const mkWing = (side) => {
      const inner = new THREE.Group();
      inner.position.set(side * 0.09, 0.06, 0.04);
      body.add(inner);
      part(G.box, c.wing, 0.3, 0.016, 0.2, side * 0.15, 0, 0, inner);
      part(G.box, c.spec, 0.12, 0.018, 0.05, side * 0.16, 0, -0.08, inner);
      const outer = new THREE.Group();
      outer.position.set(side * 0.29, 0, 0);
      inner.add(outer);
      const tip = part(G.box, c.wing, 0.28, 0.012, 0.15, side * 0.13, 0, -0.02, outer);
      tip.rotation.y = side * 0.25;
      part(G.box, goose ? '#3a3a38' : c.back, 0.14, 0.013, 0.1, side * 0.22, 0, -0.05, outer);
      return { inner, outer, side };
    };
    const wings = [mkWing(1), mkWing(-1)];
    const s = spec.size * 1.3;
    root.scale.setScalar(s);
    return { root, body, neckPivot, head, wings };
  };

  function poseWings(model, flap, fold, glide) {
    for (const w of model.wings) {
      if (fold > 0.5) {
        w.inner.rotation.set(0.1, w.side * 1.1, -w.side * 0.15);
        w.outer.rotation.set(0, w.side * 1.9, 0);
        w.inner.scale.setScalar(0.72);
      } else {
        w.inner.scale.setScalar(1);
        const a = glide ? 0.12 : Math.sin(flap) * 0.85 + 0.1;
        const b = glide ? 0.1 : Math.sin(flap - 0.9) * 0.55;
        w.inner.rotation.set(0, 0, w.side * a);
        w.outer.rotation.set(0, 0, w.side * b);
      }
    }
  }

  // ------------------------------------------------------------------ CANARD
  class Duck {
    constructor(mgr, specId, pos) {
      this.mgr = mgr;
      this.specId = specId;
      this.spec = DH.data.species[specId];
      this.spec.id = specId;
      this.model = DH.buildDuckModel(this.spec);
      mgr.group.add(this.model.root);
      this.pos = pos.clone();
      this.vel = new THREE.Vector3();
      this.hp = this.spec.hp;
      this.maxHp = this.spec.hp;
      this.state = 'fly';
      this.flock = null;
      this.offset = new THREE.Vector3();
      this.phase = Math.random() * 10;
      this.flapT = Math.random() * 10;
      this.t = 0;
      this.alive = true;
      this.radius = 0.3 * this.spec.size * 1.3;
      this.bank = 0;
      this.swimHeading = Math.random() * Math.PI * 2;
      this.dabble = 0;
      this.quackT = rand(2, 10);
      this.wounded = false;
      this.speedMul = mgr.speedMul;
      this.center = new THREE.Vector3();
    }

    get flying() { return this.state === 'fly' || this.state === 'land' || this.state === 'takeoff' || this.state === 'solo'; }

    // Centre de la zone touchable
    hitCenter() {
      return this.center.copy(this.pos);
    }

    hit(dmg, vel, shot) {
      if (!this.alive) return false;
      this.hp -= dmg;
      this.mgr.fx.feathersBurst(this.pos, [this.spec.colors.body, this.spec.colors.back, this.spec.colors.chest, '#f0f0f0'], 3, this.vel);
      if (this.hp <= 0) {
        this.kill(vel, shot);
        return true;
      }
      if (!this.wounded) {
        this.wounded = true;
        if (this.state === 'swim') this.takeoff(this.mgr.game.player.pos);
        else if (this.state === 'fly') this.leaveFlock('flee');
      }
      return false;
    }

    kill(vel, shot) {
      const wasFlying = this.flying;
      this.alive = false;
      this.state = 'fall';
      if (this.flock) this.flock.remove(this);
      this.flock = null;
      this.vel.multiplyScalar(wasFlying ? 0.7 : 0).addScaledVector(vel.clone().normalize(), 1.5);
      if (!wasFlying) this.vel.y = 0.5;
      this.spin = new THREE.Vector3(rand(-4, 4), rand(-3, 3), rand(-6, 6));
      this.mgr.fx.feathersBurst(this.pos, [this.spec.colors.body, this.spec.colors.back, this.spec.colors.chest, '#f4f4f4'], 18, this.vel);
      this.mgr.onKill(this, shot, wasFlying);
    }

    leaveFlock(mode) {
      if (this.flock) this.flock.remove(this);
      const f = this.mgr.newFlock(this.pos, this.vel, mode);
      f.add(this, new THREE.Vector3());
      f.speed *= this.wounded ? 0.8 : 1;
    }

    takeoff(threatPos) {
      if (this.state !== 'swim') return;
      this.state = 'takeoff';
      this.t = 0;
      const away = this.pos.clone().sub(threatPos).setY(0).normalize();
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      this.vel.copy(away).multiplyScalar(2).setY(3.5);
      if (this.mgr.game.frameQuacks < 3) {
        this.mgr.game.frameQuacks++;
        this.spec.goose ? DH.audio.honk(this.pos, this.spec.quack) : DH.audio.quack(this.pos, this.spec.quack, 3);
        DH.audio.flap(this.pos, 1.2);
      }
      this.mgr.fx.splash(this.pos, 0.5);
    }

    update(dt) {
      this.t += dt;
      const w = this.mgr.world;
      const m = this.model;
      const spd = this.spec.speed * this.speedMul * (this.wounded ? 0.75 : 1);
      switch (this.state) {
        case 'fly': {
          const f = this.flock;
          if (!f) {
            this.leaveFlock('exit');
            break;
          }
          const heading = Math.atan2(f.vel.x, f.vel.z);
          const off = this.offset.clone().applyAxisAngle(DH.UP, heading);
          const desired = f.pos.clone().add(off);
          const erratic = this.spec.erratic;
          if (erratic > 0) {
            desired.x += Math.sin(this.t * 2.3 + this.phase) * erratic * 2.5;
            desired.y += Math.sin(this.t * 1.7 + this.phase * 2) * erratic * 1.5;
          }
          const v = desired.sub(this.pos).multiplyScalar(1.8).add(f.vel);
          const max = spd * 1.6;
          if (v.length() > max) v.setLength(max);
          this.vel.lerp(v, 1 - Math.exp(-3 * dt));
          this.pos.addScaledVector(this.vel, dt);
          this.avoidGround(4);
          this.flapT += dt * (this.spec.goose ? 9 : 14) * (0.9 + 0.2 * Math.sin(this.phase));
          const glide = f.mode === 'approach' && Math.sin(this.t * 0.7 + this.phase) > 0.2;
          poseWings(m, this.flapT, 0, glide);
          m.neckPivot.rotation.x = 1.35;
          break;
        }
        case 'solo': {
          // Canard isolé sans vol (secours)
          this.pos.addScaledVector(this.vel, dt);
          this.flapT += dt * 14;
          poseWings(m, this.flapT, 0, false);
          break;
        }
        case 'land': {
          const tgt = this.landTarget;
          const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
          const d = Math.hypot(dx, dz);
          const desAlt = clamp(d * 0.28, 0, 25) + 0.15;
          const hs = clamp(d * 0.5, 2.5, spd * 0.85);
          const dv = new THREE.Vector3(dx / (d || 1) * hs, clamp((desAlt - this.pos.y) * 1.3, -5, 2), dz / (d || 1) * hs);
          this.vel.lerp(dv, 1 - Math.exp(-2 * dt));
          this.pos.addScaledVector(this.vel, dt);
          this.flapT += dt * (d < 8 ? 16 : 6);
          poseWings(m, this.flapT, 0, d > 12);
          m.neckPivot.rotation.x = lerp(0.3, 1.3, clamp(d / 15, 0, 1));
          if (d < 1.6 && this.pos.y < 0.7) {
            this.state = 'swim';
            this.pos.y = 0;
            this.vel.set(dx, 0, dz).setLength(1.2);
            this.swimHeading = Math.atan2(this.vel.x, this.vel.z);
            this.mgr.fx.splash(this.pos, 0.6);
            DH.audio.splash(this.pos, 0.4);
            this.mgr.game.onDuckLanded(this);
          }
          if (this.t > 25) {
            // Atterrissage raté : repart
            this.leaveFlock('exit');
            this.state = 'fly';
          }
          break;
        }
        case 'swim': {
          this.dabble = Math.max(0, this.dabble - dt);
          if (this.dabble <= 0 && chance(dt * 0.05)) this.dabble = rand(1.5, 3);
          if (chance(dt * 0.3)) this.swimHeading += rand(-0.8, 0.8);
          const sp = this.dabble > 0 ? 0 : 0.35;
          const nx = this.pos.x + Math.sin(this.swimHeading) * 2, nz = this.pos.z + Math.cos(this.swimHeading) * 2;
          if (!w.isOpenWater(nx, nz, 0.3)) this.swimHeading += Math.PI * rand(0.6, 1.4);
          this.vel.set(Math.sin(this.swimHeading) * sp, 0, Math.cos(this.swimHeading) * sp);
          this.vel.addScaledVector(w.wind, 0.01);
          this.pos.addScaledVector(this.vel, dt);
          this.pos.y = Math.sin(this.t * 1.8 + this.phase) * 0.02;
          poseWings(m, 0, 1, false);
          m.neckPivot.rotation.x = this.dabble > 0 ? 2.2 : 0.2 + Math.sin(this.t * 0.8) * 0.1;
          this.quackT -= dt;
          if (this.quackT <= 0) {
            this.quackT = rand(6, 20);
            if (this.mgr.distToPlayer(this.pos) < 90) {
              this.spec.goose ? DH.audio.honk(this.pos, this.spec.quack) : DH.audio.quack(this.pos, this.spec.quack);
            }
          }
          // Détection du chasseur
          const game = this.mgr.game;
          const pd = this.mgr.distToPlayer(this.pos);
          if (pd < game.player.detectRadius() * this.spec.wary) this.mgr.flushAround(this.pos, 18, game.player.pos);
          break;
        }
        case 'takeoff': {
          this.vel.y = lerp(this.vel.y, 2.5, dt);
          const hor = new THREE.Vector3(this.vel.x, 0, this.vel.z);
          hor.setLength(Math.min(spd, hor.length() + dt * 8));
          this.vel.x = hor.x;
          this.vel.z = hor.z;
          this.pos.addScaledVector(this.vel, dt);
          this.flapT += dt * 18;
          poseWings(m, this.flapT, 0, false);
          m.neckPivot.rotation.x = 1.0;
          if (this.t > 1.6) {
            this.state = 'fly';
            const group = this.mgr.takeoffGroup;
            if (group && group.alive && group.members.length < 14 && this.pos.distanceTo(group.pos) < 30) group.add(this, new THREE.Vector3(rand(-3, 3), rand(-1, 1), rand(-4, 0)));
            else {
              const f = this.mgr.newFlock(this.pos, this.vel, 'flee');
              f.add(this, new THREE.Vector3());
              this.mgr.takeoffGroup = f;
            }
          }
          break;
        }
        case 'fall': {
          this.vel.y -= 9.8 * dt;
          this.vel.multiplyScalar(1 - 0.25 * dt);
          this.pos.addScaledVector(this.vel, dt);
          m.root.rotation.x += this.spin.x * dt;
          m.root.rotation.z += this.spin.z * dt;
          poseWings(m, this.t * 3, 0, true);
          const g = w.groundAt(this.pos.x, this.pos.z);
          const onWater = w.heightAt(this.pos.x, this.pos.z) < -0.05 && !w.isIce(this.pos.x, this.pos.z);
          const floor = onWater ? 0 : g;
          if (this.pos.y <= floor + 0.05) {
            this.pos.y = floor;
            this.state = 'dead';
            this.onWater = onWater;
            this.deadT = 0;
            m.root.rotation.set(0, m.root.rotation.y, rand(1.2, 1.8) * (chance(0.5) ? 1 : -1));
            if (onWater) {
              this.mgr.fx.splash(this.pos, 1.1);
              DH.audio.splash(this.pos, 1);
            } else {
              DH.audio.thud(this.pos);
              if (w.snowAmount > 0.4) this.mgr.fx.puff(this.pos, '#f4f6fa');
            }
            this.mgr.game.onDuckDown(this);
          }
          return this.applyTransform(true);
        }
        case 'dead': {
          this.deadT += dt;
          if (this.onWater) {
            this.pos.addScaledVector(w.wind, dt * 0.03);
            this.pos.y = Math.sin(this.t * 1.5) * 0.02 - 0.03;
          }
          poseWings(m, 0, 0, true);
          return this.applyTransform(true);
        }
        case 'carried':
          return;
      }
      this.applyTransform(false);
    }

    avoidGround(min) {
      const g = this.mgr.world.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y < g + min) {
        this.pos.y = lerp(this.pos.y, g + min, 0.1);
        this.vel.y = Math.max(this.vel.y, 1);
      }
    }

    applyTransform(keepRot) {
      const r = this.model.root;
      r.position.copy(this.pos);
      if (keepRot) return;
      if (this.state === 'swim') {
        r.rotation.set(this.dabble > 0 ? 0.9 : 0, this.swimHeading, 0);
        return;
      }
      const v = this.vel;
      if (v.lengthSq() > 0.01) {
        const yaw = Math.atan2(v.x, v.z);
        const pitch = -Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.6;
        const turn = DH.util.angleDiff(this.lastYaw ?? yaw, yaw);
        this.lastYaw = yaw;
        this.bank = lerp(this.bank, clamp(-turn * 25, -0.8, 0.8), 0.1);
        r.rotation.set(pitch, yaw, this.bank, 'YXZ');
      }
    }

    dispose() {
      this.mgr.group.remove(this.model.root);
    }
  }

  // ------------------------------------------------------------------ VOL (groupe)
  class Flock {
    constructor(mgr, pos, vel, mode) {
      this.mgr = mgr;
      this.pos = pos.clone();
      this.vel = vel.clone();
      if (this.vel.lengthSq() < 1) this.vel.set(rand(-1, 1), 0, rand(-1, 1)).setLength(10);
      this.mode = mode;
      this.members = [];
      this.speed = 15;
      this.alt = rand(22, 42);
      this.goal = new THREE.Vector3();
      this.waypoints = randInt(1, 3);
      this.alive = true;
      this.t = 0;
      this.willLand = false;
      this.landSpot = null;
      this.circleAng = 0;
      if (mode === 'flee' || mode === 'exit') this.setExit();
    }

    add(duck, offset) {
      duck.flock = this;
      duck.offset.copy(offset);
      this.members.push(duck);
      if (this.members.length === 1) this.speed = duck.spec.speed * duck.speedMul * (duck.wounded ? 0.75 : 1);
    }

    remove(duck) {
      this.members = this.members.filter((d) => d !== duck);
      if (!this.members.length) this.alive = false;
    }

    setExit() {
      const p = this.mgr.game.player.pos;
      const away = this.pos.clone().sub(p).setY(0);
      if (away.lengthSq() < 1) away.set(1, 0, 0);
      away.normalize().applyAxisAngle(DH.UP, rand(-0.6, 0.6));
      this.goal.copy(this.pos).addScaledVector(away, 600);
      if (this.mode === 'flee') this.alt = rand(35, 55);
    }

    update(dt) {
      this.t += dt;
      const toGoal = new THREE.Vector3();
      let speed = this.speed;
      switch (this.mode) {
        case 'transit':
        case 'called': {
          toGoal.subVectors(this.goal, this.pos).setY(0);
          if (toGoal.length() < 25) {
            if (this.willLand && this.landSpot) {
              this.mode = 'approach';
              this.approachT = rand(7, 13);
              this.circleAng = Math.atan2(this.pos.z - this.landSpot.z, this.pos.x - this.landSpot.x);
            } else if (--this.waypoints <= 0) {
              this.mode = 'exit';
              this.setExit();
            } else {
              this.goal.copy(this.mgr.randomPassPoint());
            }
          }
          break;
        }
        case 'approach': {
          this.approachT -= dt;
          const R = 38;
          this.circleAng += (speed / R) * dt;
          const g = this.landSpot.clone().add(new THREE.Vector3(Math.cos(this.circleAng) * R, 0, Math.sin(this.circleAng) * R));
          toGoal.subVectors(g, this.pos).setY(0);
          this.alt = lerp(this.alt, 13, dt * 0.3);
          speed *= 0.8;
          if (this.approachT <= 0) {
            this.mgr.landFlock(this);
            return;
          }
          break;
        }
        case 'flee':
          speed *= 1.3;
        // fallthrough
        case 'exit':
          toGoal.subVectors(this.goal, this.pos).setY(0);
          break;
      }
      const dir = toGoal.normalize();
      const desired = dir.multiplyScalar(speed);
      desired.y = clamp((this.alt - this.pos.y) * 0.6, -3.5, 5);
      this.vel.lerp(desired, 1 - Math.exp(-(this.mode === 'flee' ? 1.8 : 0.9) * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.pos.addScaledVector(this.mgr.world.wind, dt * 0.15);
      const g = this.mgr.world.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y < g + 12) this.pos.y = lerp(this.pos.y, g + 12, dt * 2);
      if ((this.mode === 'exit' || this.mode === 'flee') && (Math.abs(this.pos.x) > 330 || Math.abs(this.pos.z) > 330)) {
        this.mgr.despawnFlock(this);
      }
    }
  }

  // ------------------------------------------------------------------ CHIEN
  class Dog {
    constructor(mgr) {
      this.mgr = mgr;
      const g = new THREE.Group();
      const coat = pick(['#2a1c12', '#141414', '#c8a060']);
      const b = new THREE.Group();
      g.add(b);
      part(G.box, coat, 0.28, 0.26, 0.7, 0, 0.5, 0, b);
      part(G.box, coat, 0.2, 0.22, 0.24, 0, 0.72, 0.42, b);
      part(G.box, coat, 0.12, 0.1, 0.16, 0, 0.66, 0.6, b);
      part(G.box, '#111', 0.05, 0.04, 0.03, 0, 0.7, 0.68, b);
      part(G.box, coat, 0.04, 0.14, 0.08, 0.11, 0.66, 0.4, b);
      part(G.box, coat, 0.04, 0.14, 0.08, -0.11, 0.66, 0.4, b);
      this.tail = part(G.box, coat, 0.05, 0.05, 0.3, 0, 0.6, -0.45, b);
      this.tail.rotation.x = 0.5;
      this.legs = [];
      for (const [x, z] of [[0.09, 0.25], [-0.09, 0.25], [0.09, -0.25], [-0.09, -0.25]]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.42, z);
        b.add(pivot);
        part(G.box, coat, 0.07, 0.42, 0.08, 0, -0.21, 0, pivot);
        this.legs.push(pivot);
      }
      this.mouth = new THREE.Group();
      this.mouth.position.set(0, 0.64, 0.66);
      b.add(this.mouth);
      this.root = g;
      this.body = b;
      mgr.group.add(g);
      this.pos = mgr.game.player.pos.clone().add(new THREE.Vector3(1.2, 0, 0.5));
      this.state = 'follow';
      this.target = null;
      this.t = 0;
      this.heading = 0;
      this.queue = [];
    }

    fetch(duck) {
      this.queue.push(duck);
    }

    update(dt) {
      this.t += dt;
      const w = this.mgr.world;
      const player = this.mgr.game.player;
      let goal = null, speed = 0;
      if (this.state === 'follow') {
        this.queue = this.queue.filter((d) => d.state === 'dead');
        if (this.queue.length) {
          this.target = this.queue.shift();
          this.state = 'go';
          DH.audio.bark(this.pos);
        } else {
          const side = new THREE.Vector3(Math.cos(player.yaw) * 1.4, 0, -Math.sin(player.yaw) * 1.4);
          goal = player.pos.clone().add(side).add(new THREE.Vector3(Math.sin(player.yaw) * 0.8, 0, Math.cos(player.yaw) * 0.8));
          speed = this.pos.distanceTo(goal) > 2 ? 5 : 0;
        }
      }
      if (this.state === 'go') {
        if (!this.target || this.target.state !== 'dead') {
          this.state = 'follow';
        } else {
          goal = this.target.pos;
          speed = 7;
          if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 0.9) {
            this.state = 'return';
            this.target.state = 'carried';
            this.mouth.add(this.target.model.root);
            this.target.model.root.position.set(0, -0.05, 0.05);
            this.target.model.root.rotation.set(0, Math.PI / 2, 1.3);
            this.target.model.root.scale.setScalar(this.target.spec.size);
          }
        }
      }
      if (this.state === 'return') {
        goal = player.pos;
        speed = 6.5;
        if (this.pos.distanceTo(player.pos) < 1.6) {
          this.mouth.remove(this.target.model.root);
          this.mgr.game.onRetrieved(this.target, true);
          this.target.state = 'retrieved';
          this.target.gone = true;
          this.target = null;
          this.state = 'follow';
        }
      }
      let moving = false;
      if (goal && speed > 0) {
        const d = new THREE.Vector3(goal.x - this.pos.x, 0, goal.z - this.pos.z);
        const dist = d.length();
        if (dist > 0.3) {
          d.normalize();
          const inWater = w.heightAt(this.pos.x, this.pos.z) < -0.4 && !w.isIce(this.pos.x, this.pos.z);
          const s = inWater ? speed * 0.45 : speed;
          this.pos.addScaledVector(d, Math.min(dist, s * dt));
          this.heading = Math.atan2(d.x, d.z);
          moving = true;
        }
      }
      const h = w.heightAt(this.pos.x, this.pos.z);
      const swim = h < -0.4 && !w.isIce(this.pos.x, this.pos.z);
      this.pos.y = swim ? -0.45 : w.groundAt(this.pos.x, this.pos.z);
      this.root.position.copy(this.pos);
      this.root.rotation.y = DH.util.lerp(this.root.rotation.y, this.root.rotation.y + DH.util.angleDiff(this.root.rotation.y, this.heading), 0.2);
      const k = moving ? Math.sin(this.t * 14) * 0.7 : 0;
      this.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? k : -k)));
      this.tail.rotation.y = Math.sin(this.t * (moving ? 12 : 6)) * 0.5;
      if (swim && moving && chance(dt * 4)) this.mgr.fx.ripple(this.pos, 1.5);
    }

    dispose() {
      this.mgr.group.remove(this.root);
    }
  }

  // ------------------------------------------------------------------ GESTIONNAIRE
  DH.DuckManager = class DuckManager {
    constructor(game, opts = {}) {
      this.game = game;
      this.world = game.world;
      this.fx = game.fx;
      this.group = new THREE.Group();
      game.scene.add(this.group);
      this.ducks = [];
      this.flocks = [];
      this.decoys = [];
      this.speedMul = opts.speedMul || 1;
      this.spawnT = 2;
      this.interval = opts.interval || 9;
      this.maxActive = opts.maxActive || 22;
      this.speciesWeights = opts.species || game.map.species;
      this.enabled = opts.enabled !== false;
      this.escaped = 0;
      this.onKill = (duck, shot, flying) => game.onDuckKilled(duck, shot, flying);
      this.dog = opts.dog ? new Dog(this) : null;
      this.takeoffGroup = null;
    }

    distToPlayer(p) {
      return p.distanceTo(this.game.player.pos);
    }

    newFlock(pos, vel, mode) {
      const f = new Flock(this, pos, vel, mode);
      this.flocks.push(f);
      return f;
    }

    pickSpecies() {
      return weighted(this.speciesWeights);
    }

    // Point de passage proche du chasseur
    randomPassPoint() {
      const p = this.game.player.pos;
      const a = rand(0, Math.PI * 2), r = rand(0, 45);
      return new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z - 22 + Math.sin(a) * r);
    }

    chooseLandSpot() {
      if (this.decoys.length && chance(0.7)) {
        const d = pick(this.decoys);
        const p = this.world.randomWaterPoint(d.pos.x, d.pos.z, 12, 0.5);
        if (p) return p;
      }
      const p = this.game.player.pos;
      return chance(0.6) ? this.world.randomWaterPoint(p.x, p.z - 40, 90) : this.world.randomWaterPoint(0, 0, 180);
    }

    flockSize(spec) {
      if (spec.swan) return randInt(2, 3);
      if (spec.goose) return randInt(5, 11);
      if (spec.id === 'sarcelle') return randInt(4, 9);
      if (spec.rare) return randInt(1, 3);
      return randInt(2, 7);
    }

    // Arrivée d'un vol depuis l'horizon
    spawnFlock(opts = {}) {
      const specId = opts.species || this.pickSpecies();
      const spec = DH.data.species[specId];
      spec.id = specId;
      const n = opts.count || Math.max(1, Math.round(this.flockSize(spec) * (opts.sizeMul || 1)));
      const ang = rand(0, Math.PI * 2);
      const start = new THREE.Vector3(Math.cos(ang) * 300, rand(25, 45), Math.sin(ang) * 300);
      const f = this.newFlock(start, new THREE.Vector3(), 'transit');
      f.goal.copy(this.randomPassPoint());
      f.vel.subVectors(f.goal, start).setY(0).setLength(spec.speed);
      f.alt = this.game.time.night ? rand(12, 24) : rand(14, 34);
      if (this.game.weather.fog > 0.015) f.alt = rand(10, 20);
      const landChance = (this.decoys.length ? 0.55 : 0.3) * (spec.swan ? 0.5 : 1);
      f.willLand = !opts.noLand && chance(landChance);
      if (f.willLand) f.landSpot = this.chooseLandSpot();
      if (!f.landSpot) f.willLand = false;
      const vee = spec.goose;
      for (let i = 0; i < n; i++) {
        const mixed = !vee && chance(0.15) ? this.pickSpecies() : specId;
        const sid = DH.data.species[mixed].goose && !vee ? specId : mixed;
        let off;
        if (vee) {
          const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
          off = new THREE.Vector3(side * rank * 2.2, rank * 0.15, -rank * 1.9);
        } else {
          off = new THREE.Vector3(rand(-3.5, 3.5), rand(-1.5, 1.5), -i * 1.3 + rand(-1, 1));
        }
        const d = new Duck(this, sid, start.clone().add(off));
        d.vel.copy(f.vel);
        d.wave = opts.wave;
        f.add(d, off);
        this.ducks.push(d);
      }
      return f;
    }

    // Groupe déjà posé sur l'eau au début
    spawnSwimming(count, near) {
      const specId = this.pickSpecies();
      const spec = DH.data.species[specId];
      if (spec.swan && count > 3) count = 2;
      const c = near ? this.world.randomWaterPoint(near.x, near.z, 60) : this.world.randomWaterPoint(0, 0, 170);
      if (!c) return;
      for (let i = 0; i < count; i++) {
        const p = this.world.randomWaterPoint(c.x, c.z, 8, 0.4) || c.clone();
        const sid = chance(0.8) ? specId : this.pickSpecies();
        const d = new Duck(this, sid, p);
        d.state = 'swim';
        d.pos.y = 0;
        this.ducks.push(d);
      }
    }

    landFlock(f) {
      for (const d of f.members) {
        d.state = 'land';
        d.t = 0;
        d.flock = null;
        const p = this.world.randomWaterPoint(f.landSpot.x, f.landSpot.z, 9, 0.4) || f.landSpot.clone();
        d.landTarget = p;
      }
      if (f.members.length && this.game.frameQuacks < 3) {
        const d = f.members[0];
        d.spec.goose ? DH.audio.honk(d.pos, d.spec.quack) : DH.audio.quack(d.pos, d.spec.quack, 4);
      }
      f.members = [];
      f.alive = false;
    }

    despawnFlock(f) {
      for (const d of f.members) {
        d.gone = true;
        d.escaped = true;
        this.escaped++;
        this.game.onDuckEscaped(d);
      }
      f.members = [];
      f.alive = false;
    }

    // Coup de feu : les canards posés s'envolent, les vols s'écartent
    alarm(pos, radius = 130) {
      this.takeoffGroup = null;
      const sorted = this.ducks.filter((d) => d.state === 'swim' && d.pos.distanceTo(pos) < radius);
      for (const d of sorted) d.takeoff(pos);
      for (const f of this.flocks) {
        if (!f.alive || f.mode === 'flee') continue;
        const dist = f.pos.distanceTo(pos);
        if (dist < 75) {
          f.mode = 'flee';
          f.setExit();
        }
      }
      for (const d of this.ducks) {
        if (d.state === 'land' && d.pos.distanceTo(pos) < radius) {
          d.state = 'fly';
          d.leaveFlock('flee');
        }
      }
    }

    flushAround(pos, r, threat) {
      this.takeoffGroup = null;
      for (const d of this.ducks) if (d.state === 'swim' && d.pos.distanceTo(pos) < r) d.takeoff(threat);
    }

    // Appeau
    call(playerPos) {
      let n = 0;
      for (const f of this.flocks) {
        if (!f.alive || f.mode === 'flee' || f.mode === 'approach') continue;
        if (f.pos.distanceTo(playerPos) < 260) {
          f.mode = 'called';
          f.goal.copy(playerPos).add(new THREE.Vector3(rand(-20, 20), 0, -35));
          if (chance(0.75)) {
            f.willLand = true;
            f.landSpot = this.chooseLandSpot();
            if (!f.landSpot) f.willLand = false;
          }
          f.waypoints = 2;
          n++;
          if (f.members[0]) setTimeout(() => f.members[0] && DH.audio.quack(f.members[0].pos, f.members[0].spec.quack, 2), 900);
        }
      }
      return n;
    }

    placeDecoys(center, count = 7) {
      const specs = ['colvert_m', 'colvert_f'];
      for (let i = 0; i < count; i++) {
        const p = this.world.randomWaterPoint(center.x, center.z, 10, 0.3);
        if (!p) continue;
        const spec = Object.assign({}, DH.data.species[specs[i % 2]]);
        const m = DH.buildDuckModel(spec);
        poseWings(m, 0, 1, false);
        m.neckPivot.rotation.x = 0.15;
        m.root.position.copy(p);
        m.root.rotation.y = rand(0, Math.PI * 2);
        this.group.add(m.root);
        this.decoys.push({ model: m, pos: p, phase: rand(0, 6) });
      }
    }

    get activeCount() {
      return this.ducks.filter((d) => d.alive && !d.gone).length;
    }

    targets() {
      return this.ducks;
    }

    update(dt) {
      const game = this.game;
      if (this.enabled) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = this.interval * rand(0.6, 1.4) / (game.time.flocks || 1);
          if (this.activeCount < this.maxActive) this.spawnFlock();
        }
      }
      for (const f of this.flocks) if (f.alive) f.update(dt);
      this.flocks = this.flocks.filter((f) => f.alive);
      for (const d of this.ducks) {
        if (d.gone) continue;
        d.update(dt);
        // Cancanements en vol
        if (d.alive && d.state === 'fly') {
          d.quackT -= dt;
          if (d.quackT <= 0) {
            d.quackT = rand(4, 14);
            if (this.distToPlayer(d.pos) < 120 && game.frameQuacks < 2) {
              game.frameQuacks++;
              d.spec.goose ? DH.audio.honk(d.pos, d.spec.quack) : DH.audio.quack(d.pos, d.spec.quack, randInt(1, 3));
            }
          }
        }
        if (d.state === 'dead' && d.deadT > 150) d.gone = true;
      }
      for (const d of this.ducks) if (d.gone && d.model.root.parent === this.group) d.dispose();
      this.ducks = this.ducks.filter((d) => !d.gone);
      for (const dc of this.decoys) {
        dc.phase += dt;
        dc.model.root.position.y = Math.sin(dc.phase * 1.6) * 0.02;
        dc.model.root.rotation.z = Math.sin(dc.phase * 1.1) * 0.05;
      }
      if (this.dog) this.dog.update(dt);
    }

    // Canard mort le plus proche (ramassage manuel)
    nearestDead(pos, maxDist) {
      let best = null, bd = maxDist;
      for (const d of this.ducks) {
        if (d.state !== 'dead') continue;
        const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    }

    dispose() {
      this.game.scene.remove(this.group);
    }
  };
})();
