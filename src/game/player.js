// Le chasseur : déplacements (debout, accroupi, couché), endurance, souffle, bruit,
// discrétion, regard (souris / tactile), tremblement et recul.
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep } from '../core/math.js';
import * as Save from '../core/save.js';
import { OUTFITS } from '../data/catalog.js';

const EYE = { stand: 1.66, crouch: 1.08, prone: 0.34 };
const SPEED = { stand: 2.1, crouch: 1.05, prone: 0.42, sprint: 5.4 };

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.pos.y = world.groundAt(spawn.x, spawn.z);
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.stance = 'stand';
    this.eye = EYE.stand;
    this.stamina = 1;
    this.breath = 1;
    this.holding = false;
    this.sprinting = false;
    this.moving = false;
    this.speedNow = 0;
    this.noise = 0;
    this.visibility = 1;
    this.bobT = 0;
    this.bob = new THREE.Vector2();
    this.sway = new THREE.Vector2();
    this.recoil = { p: 0, y: 0, v: 0 };
    this.t = 0;
    this.stepDist = 0;
    this.onGround = true;
    this.sticks = false;
    this.rest = 0; // appui (mirador, bâton)
    this.seat = null; // poste d'affût occupé
    this.frozen = false;
    this.inWater = 0;
    this.surface = 'meadow';
  }

  get eyeY() { return this.pos.y + this.eye; }

  setStance(s) {
    if (this.seat) return;
    if (s === this.stance) s = 'stand';
    // Impossible de se coucher dans l'eau
    if (s === 'prone' && this.inWater > 0.15) s = 'crouch';
    this.stance = s;
  }

  update(dt, input, ctx) {
    this.t += dt;
    const opt = Save.get().options;
    const ads = ctx.ads;
    // ---- Regard (sensibilité proportionnelle au champ de vision : précis à la lunette)
    const fovK = ctx.fov / opt.fov;
    const touch = input.look.touch;
    const base = touch ? 0.0042 * opt.touchSens : 0.0022 * opt.sens;
    const k = base * Math.pow(fovK, touch ? 0.9 : 1);
    this.yaw -= input.look.dx * k;
    this.pitch -= input.look.dy * k * (opt.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    // ---- Posture
    if (input.hit('crouch')) this.setStance('crouch');
    if (input.hit('prone')) this.setStance('prone');
    if (input.hit('jump') && this.stance !== 'stand') this.setStance('stand');
    this.eye = damp(this.eye, this.seat ? this.seat.eye : EYE[this.stance], 7, dt);

    // ---- Déplacement
    const ax = input.axes();
    let mx = ax.x, mz = ax.y;
    if (this.frozen || this.seat) { mx = 0; mz = 0; }
    const touchRun = input.move.touchMag > 0.95;
    this.sprinting = (input.down('shift') || touchRun) && !ads && mz > 0.3 && this.stance === 'stand' && this.stamina > 0.05;
    let speed = this.sprinting ? SPEED.sprint : SPEED[this.stance];
    if (input.move.touchMag > 0 && !this.sprinting) speed *= clamp(input.move.touchMag * 1.15, 0.35, 1);
    if (ads) speed *= 0.5;
    const m = this.world.map;
    const depth = m ? m.waterDepth(this.pos.x, this.pos.z) : 0;
    this.inWater = Math.max(0, depth);
    if (depth > 0.1) speed *= depth > 0.5 ? 0.45 : 0.7;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    const wx = (fwdX * mz + rgtX * mx) * speed, wz = (fwdZ * mz + rgtZ * mx) * speed;
    const accel = 9;
    this.vel.x = damp(this.vel.x, wx, accel, dt);
    this.vel.z = damp(this.vel.z, wz, accel, dt);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // Limites : eau trop profonde, pente, bordure, obstacles
    if (m) {
      const nd = m.waterDepth(this.pos.x, this.pos.z);
      const slope = m.slopeAt(this.pos.x, this.pos.z);
      const climbing = m.heightAt(this.pos.x, this.pos.z) > m.heightAt(prevX, prevZ);
      if (nd > 0.95 || (slope > 1.05 && climbing) || !m.inBounds(this.pos.x, this.pos.z, 22)) {
        this.pos.x = prevX;
        this.pos.z = prevZ;
        this.vel.multiplyScalar(0.3);
        if (!m.inBounds(this.pos.x, this.pos.z, 30) && ctx.onBoundary) ctx.onBoundary();
      } else if (slope > 0.7 && climbing) {
        // Montée raide : ralentissement
        this.pos.x = lerp(prevX, this.pos.x, 0.55);
        this.pos.z = lerp(prevZ, this.pos.z, 0.55);
      }
    }
    if (this.world.collide) this.world.collide(this.pos, 0.35);
    const ground = this.seat ? this.seat.y : this.world.groundAt(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, ground, 18, dt);

    // ---- Endurance, bruit, discrétion
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = hs;
    this.moving = hs > 0.25;
    this.stamina = clamp(this.stamina + (this.sprinting ? -dt / 9 : dt / 7), 0, 1);
    this.surface = m ? m.biomeAt(this.pos.x, this.pos.z) : 'wood';
    const surfNoise = { forest: 1.3, gravel: 1.25, path: 0.8, marsh: 1.35, water: 1.5, rock: 1.1, meadow: 0.95, wood: 1.0 }[this.surface] || 1;
    const stanceNoise = { stand: 1, crouch: 0.55, prone: 0.3 }[this.stance];
    this.noise = clamp((hs / SPEED.sprint) * 1.15 * surfNoise * stanceNoise + (this.sprinting ? 0.25 : 0), 0, 1.4);
    const outfit = OUTFITS.find((o) => o.id === Save.get().loadout.outfit) || OUTFITS[0];
    const biome = this.surface === 'water' ? 'marsh' : this.surface === 'gravel' || this.surface === 'path' ? 'meadow' : this.surface;
    const camo = outfit.vis[biome] ?? 1;
    const stanceVis = { stand: 1, crouch: 0.62, prone: 0.32 }[this.stance];
    const cover = this.world.coverAt ? this.world.coverAt(this.pos.x, this.pos.z, this.eye) : 1;
    const seat = this.seat ? 0.45 : 1;
    this.visibility = clamp(stanceVis * camo * cover * seat * (this.moving ? 1.25 : 0.7), 0.05, 1.3);

    // ---- Pas
    if (this.moving) {
      this.bobT += hs * dt * (this.stance === 'stand' ? 2.0 : 1.4);
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 1.35 : this.stance === 'prone' ? 0.5 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (ctx.onStep) ctx.onStep(this.surface, this.sprinting ? 1 : this.stance === 'stand' ? 0.6 : 0.3);
      }
    }
    const bobAmp = Math.min(1, hs / 3) * (ads ? 0.25 : 1) * (this.stance === 'prone' ? 0.4 : 1);
    this.bob.set(Math.cos(this.bobT) * 0.028 * bobAmp, Math.abs(Math.sin(this.bobT)) * 0.04 * bobAmp);

    // ---- Souffle (retenir : Maj / bouton) et tremblement
    const wantHold = ads && (input.down('shift') || input.down('breath')) && !this.moving;
    if (wantHold && this.breath > 0.02) {
      this.holding = true;
      this.breath = Math.max(0, this.breath - dt / 6);
    } else {
      this.holding = false;
      this.breath = Math.min(1, this.breath + dt / (this.breath < 0.05 ? 7 : 4.5));
    }
    if (input.hit('sticks') && ctx.hasSticks) this.sticks = !this.sticks;
    if (this.moving) this.sticks = false;
    const wsway = ctx.weaponSway || 1;
    let amp = 0.0042 * wsway;
    amp *= ads ? 1 : 1.5;
    amp *= { stand: 1, crouch: 0.6, prone: 0.28 }[this.stance];
    amp *= 1 + (1 - this.stamina) * 1.8;
    if (this.moving) amp *= 2.2;
    if (this.sticks) amp *= 0.35;
    if (this.seat) amp *= this.seat.rest || 0.4;
    if (this.holding) amp *= 0.12;
    else if (this.breath < 0.3) amp *= 2.2;
    const t = this.t;
    const br = Math.sin(t * 1.6) * (this.holding ? 0 : 0.35);
    const tx = (Math.sin(t * 0.73) + Math.sin(t * 1.91 + 1) * 0.55 + Math.sin(t * 3.7) * 0.18) * amp;
    const ty = (Math.sin(t * 1.13 + 2) + Math.sin(t * 2.47) * 0.4 + br) * amp * 0.85;
    this.sway.x = damp(this.sway.x, tx, 5, dt);
    this.sway.y = damp(this.sway.y, ty, 5, dt);
    // Recul : retour amorti
    this.recoil.v -= this.recoil.p * 60 * dt;
    this.recoil.v *= Math.exp(-11 * dt);
    this.recoil.p += this.recoil.v * dt;
    this.recoil.y *= Math.exp(-8 * dt);
  }

  kick(amount) {
    const k = { stand: 1, crouch: 0.85, prone: 0.6 }[this.stance];
    this.recoil.v += 1.6 * amount * k;
    this.recoil.y += (Math.random() - 0.5) * 0.03 * amount;
  }

  applyCamera(cam) {
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    cam.position.set(this.pos.x + rgtX * this.bob.x, this.pos.y + this.eye + this.bob.y, this.pos.z + rgtZ * this.bob.x);
    cam.rotation.set(this.pitch + this.sway.y + this.recoil.p * 0.06, this.yaw + this.sway.x + this.recoil.y, 0, 'YXZ');
  }

  aimDirection(out = new THREE.Vector3()) {
    const p = this.pitch + this.sway.y + this.recoil.p * 0.06, y = this.yaw + this.sway.x + this.recoil.y;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
}
