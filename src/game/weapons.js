// Armes portées (une carabine + un fusil) : vue subjective, visée, lunette à grossissement
// variable, tir, réarmement, rechargement, recul, effets (flamme, fumée, douilles).
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';
import { WEAPONS, AMMO, OPTICS } from '../data/catalog.js';
import { zeroAngle } from './ballistics.js';
import * as Save from '../core/save.js';

export class WeaponSystem {
  constructor(game, guns, camera) {
    this.game = game;
    this.guns = guns;
    this.camera = camera;
    this.view = new THREE.Group(); // attaché à la caméra (passe dédiée)
    this.slots = [];
    this.cur = 0;
    this.adsT = 0;
    this.ads = false;
    this.zoom = 1;
    this.state = 'idle';
    this.stateT = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.switchT = 0;
    this.flash = new THREE.PointLight(0xffb066, 0, 12, 2);
    this.flashT = 0;
    this.casings = [];
    this.shotCount = 0;
    this.binoc = false;
    this.binocZoom = 8;
  }

  // Charge l'équipement choisi au pavillon
  equip(loadout) {
    for (const s of this.slots) this.view.remove(s.root);
    this.slots = [];
    const save = Save.get();
    for (const key of ['rifle', 'shotgun']) {
      const id = loadout[key];
      if (!id) continue;
      const def = WEAPONS.find((w) => w.id === id);
      if (!def) continue;
      const skinId = save.skins[id] || 'std';
      const skinDef = (Save.catalog.SKINS.find((s) => s.id === skinId) || {});
      const optic = def.kind === 'rifle' && OPTICS[def.optic]?.kind === 'scope' ? save.scopes[id] || def.optic : def.optic;
      const built = this.guns.build(def, { wood: skinDef.wood, metal: skinDef.metal, engraved: skinDef.engraved, optic });
      const root = new THREE.Group();
      root.add(built.group);
      const outfit = Save.catalog.OUTFITS.find((o) => o.id === loadout.outfit) || Save.catalog.OUTFITS[0];
      const hands = this.guns.hands(outfit);
      root.add(hands);
      root.visible = false;
      this.view.add(root);
      const ammoId = key === 'rifle' ? loadout.ammoRifle : loadout.ammoShot;
      const ammo = AMMO.find((a) => a.id === ammoId && a.kind === def.kind) || AMMO.find((a) => a.kind === def.kind);
      const opt = OPTICS[optic] || OPTICS.iron;
      this.slots.push({
        key, def, ammo, opt, optic, built, root, hands,
        inMag: def.mag, chambered: true,
        zero: def.kind === 'rifle' ? zeroAngle(def.v0, def.bc, 100) : 0,
        zoom: opt.zoom[0],
      });
    }
    this.cur = Math.min(this.cur, this.slots.length - 1);
    this.select(this.cur, true);
    // Grossissement fixe des jumelles emportées (8× ou 10×)
    const bino = Save.catalog.GEAR.find((g) => g.id === loadout.binoc);
    this.binocZoom = bino && bino.zoom ? bino.zoom : 8;
  }

  get slot() { return this.slots[this.cur]; }

  select(i, instant = false) {
    if (!this.slots[i]) return;
    this.slots.forEach((s, k) => (s.root.visible = k === i));
    this.cur = i;
    this.state = instant ? 'idle' : 'switch';
    this.stateT = instant ? 0 : 0.7;
    this.ads = false;
  }

  // FOV voulu (degrés) pour le rendu
  fov(base) {
    const s = this.slot;
    if (this.binoc) return (2 * Math.atan(Math.tan((base * Math.PI) / 360) / this.binocZoom) * 180) / Math.PI;
    if (!s) return base;
    const z = this.adsT > 0.5 ? s.zoom : 1;
    const target = (2 * Math.atan(Math.tan((base * Math.PI) / 360) / z) * 180) / Math.PI;
    return lerp(base, target, s.opt.kind === 'scope' ? (this.adsT > 0.85 ? 1 : 0) : this.adsT);
  }

  get scoped() {
    const s = this.slot;
    return !!s && s.opt.kind === 'scope' && this.adsT > 0.85;
  }

  update(dt, input, player) {
    const s = this.slot;
    if (!s) return;
    const g = this.game;
    this.stateT -= dt;
    // Jumelles
    if (input.hit('binoc')) {
      this.binoc = !this.binoc;
      this.ads = false;
      if (g.audio) g.audio.ui('binoc');
    }
    if (this.binoc) {
      input.pinch = 0;
      s.root.visible = false;
      if (input.hit('fire') || input.hit('aim')) this.binoc = false;
      this.adsT = damp(this.adsT, 0, 12, dt);
      return;
    }
    s.root.visible = !this.scoped;
    // Changement d'arme
    if ((input.hit('w1') && this.cur !== 0) || (input.hit('w2') && this.cur !== 1) || input.hit('next') || (input.wheel && !this.ads)) {
      const next = input.hit('w1') ? 0 : input.hit('w2') ? 1 : (this.cur + 1) % this.slots.length;
      if (next !== this.cur && this.slots[next]) {
        this.select(next);
        if (g.audio) g.audio.weaponHandle();
        return;
      }
    }
    // Visée
    const sprinting = player.sprinting;
    const wantAds = (input.down('aim') || this.adsToggle) && !sprinting && this.state !== 'switch' && this.state !== 'reload';
    this.ads = wantAds;
    this.adsT = damp(this.adsT, wantAds ? 1 : 0, s.opt.kind === 'scope' ? 10 : 13, dt);
    // Grossissement variable
    if (this.ads && s.opt.kind === 'scope') {
      let z = s.zoom;
      if (input.wheel) z *= input.wheel < 0 ? 1.18 : 1 / 1.18;
      if (input.down('zoomIn')) z *= 1 + dt * 1.6;
      if (input.down('zoomOut')) z /= 1 + dt * 1.6;
      if (input.pinch) z *= input.pinch;
      s.zoom = clamp(z, s.opt.zoom[0], s.opt.zoom[1]);
    }
    input.pinch = 0;
    // États
    if (this.state !== 'idle' && this.stateT <= 0) {
      if (this.state === 'cycle') {
        s.chambered = s.inMag > 0 || s.def.action === 'double' || s.def.action === 'break';
        if (s.def.action === 'bolt' || s.def.action === 'lever' || s.def.action === 'pump') this.ejectCasing(s);
      }
      if (this.state === 'reload') {
        if (s.def.perShell) {
          s.inMag++;
          if (s.inMag < s.def.mag && !input.down('fire')) {
            this.stateT = s.def.reload;
            if (g.audio) g.audio.shellIn();
            this.state = 'reload';
            return this.animate(dt, player);
          }
        } else s.inMag = s.def.mag;
        s.chambered = true;
        if (g.audio) g.audio.reloadDone(s.def);
      }
      this.state = 'idle';
    }
    // Tir
    if (input.hit('fire') && this.state === 'idle') {
      if (s.chambered && s.inMag > 0) this.fire(s, player);
      else {
        if (g.audio) g.audio.dryFire();
        this.startReload(s);
      }
    }
    // Rechargement
    if (input.hit('reload') && this.state === 'idle' && s.inMag < s.def.mag) this.startReload(s);
    this.animate(dt, player);
  }

  startReload(s) {
    if (s.inMag >= s.def.mag) return;
    this.state = 'reload';
    this.stateT = s.def.perShell ? s.def.reload : s.def.reload;
    if (s.def.action === 'break' || s.def.action === 'double') {
      // Bascule : éjection des étuis tirés
      const fired = s.def.mag - s.inMag;
      for (let i = 0; i < fired; i++) setTimeout(() => this.ejectCasing(s, true), 250 + i * 60);
    }
    if (this.game.audio) this.game.audio.reloadStart(s.def);
  }

  fire(s, player) {
    const g = this.game;
    const def = s.def;
    s.inMag--;
    s.chambered = def.action === 'semi' || def.action === 'double' || def.action === 'break' ? s.inMag > 0 : false;
    this.state = 'cycle';
    this.stateT = def.cycle;
    this.shotCount++;
    const shotId = this.shotCount;
    const cam = this.camera;
    const origin = cam.position.clone();
    const dir = player.aimDirection(new THREE.Vector3());
    if (def.kind === 'rifle') {
      // Hausse pour le réglage à 100 m (le canon est sous la ligne de visée)
      const axis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const d2 = dir.clone().applyAxisAngle(axis, -s.zero);
      const cu = s.ammo.pen || 1;
      g.ballistics.fire({ origin, dir: d2, speed: def.v0, mass: def.mass, bc: def.bc, weapon: def, shotId, pen: cu, trace: true });
      origin.addScaledVector(dir, 0.5);
    } else {
      const am = s.ammo;
      const n = Math.round(am.pellets * def.pellets);
      const spread = def.spread * am.spreadMul;
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      for (let i = 0; i < n; i++) {
        const gx = gauss() * spread, gy = gauss() * spread;
        const d = dir.clone().addScaledVector(right, gx).addScaledVector(up, gy).normalize();
        g.ballistics.fire({ origin, dir: d, speed: am.speed * (0.97 + Math.random() * 0.06), mass: 0.25, pellet: true, dmg: am.dmg, maxRange: am.range * (def.range || 1) * 2.4, weapon: def, shotId, ammo: am });
      }
    }
    // Recul, flamme, son, fumée, gibier alerté
    player.kick(def.recoil * (def.kind === 'shotgun' ? 1.1 : 1));
    this.kick = 0.06 * def.recoil;
    this.kickRot = 0.12 * def.recoil;
    this.flashT = 0.06;
    const mw = new THREE.Vector3();
    s.built.parts.muzzle.getWorldPosition(mw);
    if (this.scoped) mw.copy(origin).addScaledVector(dir, 0.9);
    if (g.onGunshot) g.onGunshot(origin, def, mw, dir);
    if (def.action === 'semi') this.ejectCasing(s);
  }

  ejectCasing(s, broke = false) {
    const g = this.game;
    if (!g.scene) return;
    const c = this.guns.casing(s.def.kind === 'shotgun');
    const p = new THREE.Vector3();
    (s.built.parts.eject || s.built.parts.muzzle).getWorldPosition(p);
    if (this.scoped) p.copy(this.camera.position).add(new THREE.Vector3(0.1, -0.08, -0.2).applyQuaternion(this.camera.quaternion));
    c.position.copy(p);
    g.scene.add(c);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const vel = broke ? new THREE.Vector3(0, -0.5, 0).addScaledVector(right, 0.2) : right.multiplyScalar(2.2).add(new THREE.Vector3(0, 1.6, 0));
    this.casings.push({ m: c, v: vel, spin: new THREE.Vector3(Math.random() * 20, Math.random() * 10, 15), t: 8 });
    if (g.audio) g.audio.casing(s.def.kind === 'shotgun');
  }

  animate(dt, player) {
    const s = this.slot;
    if (!s) return;
    const root = s.root;
    const b = s.built;
    // Positions hanche / visée
    const hip = new THREE.Vector3(0.155, -0.165, -0.22);
    let eyeZ = 0.25;
    if (s.opt.kind === 'scope') eyeZ = 0.17;
    else if (s.opt.kind === 'dot') eyeZ = 0.2;
    const adsPos = new THREE.Vector3(0, -b.sightY, -eyeZ);
    const pos = hip.clone().lerp(adsPos, this.adsT);
    let rx = lerp(0.04, 0, this.adsT), ry = lerp(0.06, 0, this.adsT), rz = lerp(0.03, 0, this.adsT);
    // Course : arme basse
    const run = player.sprinting ? 1 : 0;
    this._run = damp(this._run || 0, run, 6, dt);
    rx -= this._run * 0.45;
    ry += this._run * 0.5;
    pos.y -= this._run * 0.06;
    // Balancement de marche
    pos.x += player.bob.x * (1 - this.adsT * 0.85) * 0.8;
    pos.y += player.bob.y * (1 - this.adsT * 0.85) * 0.6;
    // Recul
    this.kick = damp(this.kick, 0, 14, dt);
    this.kickRot = damp(this.kickRot, 0, 11, dt);
    pos.z += this.kick;
    rx += this.kickRot;
    // Réarmement / rechargement / changement
    if (this.state === 'cycle' && (s.def.action === 'bolt' || s.def.action === 'lever' || s.def.action === 'pump')) {
      const k = 1 - clamp(this.stateT / s.def.cycle, 0, 1);
      const w = Math.sin(k * Math.PI);
      rz += 0.12 * w * (1 - this.adsT * 0.7);
      if (b.parts.boltHandle) b.parts.boltHandle.rotation.z = -1.2 * clamp(w * 2, 0, 1);
      if (b.parts.bolt) {
        const bolt = b.parts.bolt;
        if (bolt.userData.z0 === undefined) bolt.userData.z0 = bolt.position.z;
        bolt.position.z = bolt.userData.z0 + 0.075 * clamp(w * 1.6 - 0.3, 0, 1);
      }
      if (b.parts.lever) b.parts.lever.rotation.x = 0.7 * w;
      if (b.parts.pump) b.parts.pump.position.z = -0.29 + 0.07 * w;
    } else if (b.parts.boltHandle) b.parts.boltHandle.rotation.z = 0;
    if (this.state === 'reload') {
      const total = s.def.reload;
      const k = 1 - clamp(this.stateT / total, 0, 1);
      const w = Math.sin(Math.min(1, k * 1.2) * Math.PI);
      rx -= 0.5 * w;
      rz += 0.35 * w;
      pos.y -= 0.08 * w;
    }
    if (this.state === 'switch') {
      const w = Math.sin(clamp(this.stateT / 0.7, 0, 1) * Math.PI);
      pos.y -= 0.25 * w;
      rx -= 0.6 * w;
    }
    root.position.copy(pos);
    root.rotation.set(rx, ry, rz);
    // Flamme de bouche
    this.flashT -= dt;
    this.flash.intensity = this.flashT > 0 ? 30 * (this.flashT / 0.06) : 0;
    if (this.flashT > 0) b.parts.muzzle.getWorldPosition(this.flash.position);
    // Douilles
    const m = this.game.map;
    for (const c of this.casings) {
      c.t -= dt;
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.z += c.spin.z * dt;
      const gh = m ? m.heightAt(c.m.position.x, c.m.position.z) : this.game.groundAt(c.m.position.x, c.m.position.z);
      if (c.m.position.y < gh + 0.01) {
        c.m.position.y = gh + 0.01;
        if (Math.abs(c.v.y) < 0.6) c.rest = true;
        c.v.y *= -0.3;
        c.v.x *= 0.5;
        c.v.z *= 0.5;
      }
    }
    for (const c of this.casings) if (c.t <= 0) this.game.scene.remove(c.m);
    this.casings = this.casings.filter((c) => c.t > 0);
  }

  ammoText() {
    const s = this.slot;
    if (!s) return '';
    return `${s.inMag}${s.chambered ? '' : ' (à réarmer)'}`;
  }
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
