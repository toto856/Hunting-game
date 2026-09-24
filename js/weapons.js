// Armes : modèles 3D en vue subjective, animations, rechargement et balistique des plombs.
'use strict';

DH.Weapons = class Weapons {
  constructor(game, cfg) {
    this.game = game;
    this.camera = game.camera;
    this.holder = new THREE.Group();
    this.camera.add(this.holder);
    this.cart = DH.data.cartridges.find((c) => c.id === cfg.cartridge) || DH.data.cartridges[0];
    this.choke = DH.data.chokes.find((c) => c.id === cfg.choke) || DH.data.chokes[1];
    const unlimited = !!cfg.unlimited;
    const belt = game.hasEquip('belt') ? 1.5 : 1;
    this.guns = cfg.loadout.filter(Boolean).map((id) => {
      const def = DH.data.weapons.find((w) => w.id === id);
      const model = this.buildModel(def);
      model.root.visible = false;
      this.holder.add(model.root);
      return {
        def, model, mag: def.capacity,
        reserve: unlimited ? Infinity : Math.round(def.reserve * belt * (cfg.ammoMul || 1)),
        state: 'ready', timer: 0, cooldown: 0, anim: 0, reloadStep: 0,
      };
    });
    this.cur = 0;
    this.guns[0].model.root.visible = true;
    this.adsT = 0;
    this.switchT = 0;
    this.projectiles = [];
    this.kick = 0;
    this.flashT = 0;
    this.shotId = 0;
    this.pendingSwitch = -1;

    // Flash de bouche
    const flashTex = DH.util.canvasTexture(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,230,1)');
      grd.addColorStop(0.25, 'rgba(255,200,90,0.9)');
      grd.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.flash.scale.setScalar(0.35);
    this.holder.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 12);
    this.holder.add(this.flashLight);
    this.flashTex = flashTex;
  }

  get gun() { return this.guns[this.cur]; }

  // ======================================================== MODÈLES
  buildModel(def) {
    const L = def.look;
    const wood = new THREE.MeshStandardMaterial({ color: L.wood, roughness: 0.6, metalness: 0.0 });
    const metal = new THREE.MeshStandardMaterial({ color: L.metal, roughness: L.gold ? 0.3 : 0.42, metalness: L.gold ? 0.7 : 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.5, metalness: 0.4 });
    const brass = new THREE.MeshStandardMaterial({ color: '#d8b24a', roughness: 0.3, metalness: 0.9 });
    const camo = this.game.hasEquip('camo');
    const sleeve = new THREE.MeshLambertMaterial({ color: camo ? '#4f5a36' : '#5a5448' });
    const glove = new THREE.MeshLambertMaterial({ color: camo ? '#3d4a2e' : '#2e2a24' });
    const box = (w, h, d, m, x, y, z, parent, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      parent.add(mesh);
      return mesh;
    };
    const cyl = (r, len, m, x, y, z, parent, seg = 12) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const root = new THREE.Group();
    const gun = new THREE.Group();
    root.add(gun);
    // Crosse + poignée
    const stockMat = L.synthetic ? new THREE.MeshStandardMaterial({ color: L.wood, roughness: 0.8 }) : wood;
    box(0.044, 0.1, 0.33, stockMat, 0, -0.045, 0.21, gun, -0.13);
    box(0.04, 0.058, 0.12, stockMat, 0, -0.012, 0.04, gun, -0.2);
    box(0.046, 0.02, 0.02, dark, 0, -0.1, 0.37, gun);
    // Boîtier
    const recv = box(0.046, 0.068, 0.2, metal, 0, 0.002, -0.1, gun);
    if (L.engraved) box(0.054, 0.04, 0.12, new THREE.MeshStandardMaterial({ color: L.gold ? '#f0d070' : '#b8b8b0', metalness: 0.9, roughness: 0.3 }), 0, 0.004, -0.11, gun);
    box(0.008, 0.028, 0.06, dark, 0, -0.045, -0.05, gun);
    // Canons
    const barrels = new THREE.Group();
    barrels.position.set(0, -0.01, -0.19);
    gun.add(barrels);
    const Lb = def.bullet ? 0.56 : L.long ? 0.82 : 0.72;
    let ribY;
    if (def.bullet) {
      cyl(0.0105, Lb, metal, 0, 0.03, -Lb / 2, barrels);
      ribY = 0.042;
    } else if (L.barrels === 2 && L.side) {
      cyl(0.0122, Lb, metal, 0.0125, 0.03, -Lb / 2, barrels);
      cyl(0.0122, Lb, metal, -0.0125, 0.03, -Lb / 2, barrels);
      box(0.012, 0.006, Lb, dark, 0, 0.043, -Lb / 2, barrels);
      ribY = 0.047;
    } else if (L.barrels === 2) {
      cyl(0.0118, Lb, metal, 0, 0.047, -Lb / 2, barrels);
      cyl(0.0118, Lb, metal, 0, 0.022, -Lb / 2, barrels);
      box(0.008, 0.005, Lb, dark, 0, 0.061, -Lb / 2, barrels);
      ribY = 0.064;
    } else {
      cyl(0.0125, Lb, metal, 0, 0.03, -Lb / 2, barrels);
      box(0.008, 0.005, Lb, dark, 0, 0.044, -Lb / 2, barrels);
      ribY = 0.047;
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), brass);
    bead.position.set(0, ribY + 0.002, -Lb + 0.01);
    if (!def.bullet) barrels.add(bead);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, -Lb - 0.02);
    barrels.add(muzzle);
    // Devant (bascule) / pompe
    let pump = null;
    if (def.action === 'break') {
      box(0.05, 0.034, 0.2, wood, 0, 0.0, -0.14, barrels);
    } else if (!def.bullet) {
      cyl(0.0095, Lb * 0.66, metal, 0, 0.002, -Lb * 0.33, barrels);
      pump = new THREE.Group();
      barrels.add(pump);
      box(0.05, 0.044, 0.2, def.action === 'pump' ? stockMat : stockMat, 0, 0.004, -0.17, pump);
    } else {
      box(0.046, 0.04, 0.3, wood, 0, 0.0, -0.12, barrels);
    }
    // Carabine : lunette, chargeur, culasse
    let bolt = null;
    let sightY = ribY + 0.004;
    if (def.bullet) {
      const scope = new THREE.Group();
      scope.position.set(0, 0.08, -0.12);
      gun.add(scope);
      cyl(0.016, 0.3, dark, 0, 0, 0, scope, 16);
      cyl(0.023, 0.07, dark, 0, 0, -0.16, scope, 16);
      cyl(0.02, 0.06, dark, 0, 0, 0.15, scope, 16);
      box(0.01, 0.035, 0.02, dark, 0, -0.03, -0.06, scope);
      box(0.01, 0.035, 0.02, dark, 0, -0.03, 0.07, scope);
      box(0.03, 0.05, 0.06, dark, 0, -0.055, -0.1, gun);
      bolt = new THREE.Group();
      bolt.position.set(0.03, 0.02, -0.02);
      gun.add(bolt);
      const handle = cyl(0.005, 0.05, metal, 0.02, 0, 0, bolt, 6);
      handle.rotation.set(0, 0, Math.PI / 2);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), metal);
      knob.position.set(0.045, -0.005, 0);
      bolt.add(knob);
      sightY = 0.08;
    }
    // Mains et manches
    const leftHand = new THREE.Group();
    if (pump) {
      leftHand.position.set(0, -0.028, -0.17);
      pump.add(leftHand);
    } else if (def.action === 'break') {
      leftHand.position.set(0, -0.03, -0.14);
      barrels.add(leftHand);
    } else {
      leftHand.position.set(0, -0.03, -0.3);
      gun.add(leftHand);
    }
    box(0.07, 0.05, 0.1, glove, -0.012, -0.005, 0, leftHand);
    const lArm = box(0.085, 0.085, 0.42, sleeve, -0.07, -0.1, 0.2, leftHand);
    lArm.rotation.set(0.35, -0.35, 0);
    const rightHand = new THREE.Group();
    rightHand.position.set(0.01, -0.03, 0.05);
    gun.add(rightHand);
    box(0.06, 0.07, 0.09, glove, 0.01, 0, 0, rightHand);
    const rArm = box(0.09, 0.09, 0.4, sleeve, 0.1, -0.1, 0.2, rightHand);
    rArm.rotation.set(0.3, 0.55, 0);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    return { root, gun, barrels, pump, bolt, muzzle, sightY, Lb, recv };
  }

  // ======================================================== BOUCLE
  update(dt, input, player) {
    const g = this.gun;
    const def = g.def;
    const game = this.game;
    const tch = input.touch;
    const busy = g.state !== 'ready';
    g.cooldown -= dt;

    // Changement d'arme
    let want = -1;
    if (input.pressed('Digit1')) want = 0;
    if (input.pressed('Digit2')) want = 1;
    if (input.mouse.wheel && this.guns.length > 1) want = (this.cur + 1) % this.guns.length;
    if (tch.switchPressed && this.guns.length > 1) want = (this.cur + 1) % this.guns.length;
    if (want >= 0 && want !== this.cur && want < this.guns.length && this.switchT <= 0) {
      this.pendingSwitch = want;
      this.switchT = 0.55;
      g.state = 'ready';
    }
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.pendingSwitch >= 0 && this.switchT < 0.28) {
        this.gun.model.root.visible = false;
        this.cur = this.pendingSwitch;
        this.pendingSwitch = -1;
        this.gun.model.root.visible = true;
        DH.audio.click(900, 0.05, 0.3);
      }
    }

    const binoc = game.binoculars;
    const wantAds = (input.mouse.right || tch.aim) && !binoc && this.switchT <= 0 && !player.sprinting && g.state !== 'reloading';
    this.adsT = DH.util.lerp(this.adsT, wantAds ? 1 : 0, 1 - Math.exp(-(def.scope ? 9 : 12) * dt));
    this.ads = this.adsT > 0.85;

    // Tir
    const trigger = input.mouse.leftPressed || tch.firePressed;
    const hold = input.mouse.left || tch.fire;
    if (trigger && !binoc && this.switchT <= 0) {
      if (g.state === 'reloading' && def.action !== 'break' && g.mag > 0) {
        g.state = 'ready';
      }
      if (g.state === 'ready' && g.cooldown <= 0) {
        if (g.mag > 0) this.fire(player);
        else {
          DH.audio.dryFire();
          this.startReload();
        }
      }
    }
    void hold;
    if ((input.pressed('KeyR') || tch.reloadPressed) && !busy) this.startReload();

    // Machine à états
    switch (g.state) {
      case 'cycling':
        g.timer -= dt;
        g.anim = 1 - Math.max(0, g.timer) / def.cycle;
        if (g.timer <= 0) {
          g.state = 'ready';
          g.anim = 0;
        }
        break;
      case 'reloading':
        this.updateReload(dt);
        break;
    }

    this.updateModel(dt, player);
    this.updateProjectiles(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
  }

  fire(player) {
    const g = this.gun, def = g.def, game = this.game;
    g.mag--;
    g.cooldown = def.fireDelay;
    const cart = this.cart;
    const kind = def.bullet ? 'rifle' : 'shotgun';
    const power = def.bullet ? 0.6 : (def.gauge === 20 ? 0.8 : def.gauge === 10 ? 1.25 : 1);
    DH.audio.shot(kind, power);
    player.kick(def.recoil * (def.bullet ? 1 : cart.recoil || 1));
    this.kick = 1;
    // Flash + fumée
    const mw = new THREE.Vector3();
    g.model.muzzle.getWorldPosition(mw);
    this.flash.position.copy(this.holder.worldToLocal(mw.clone()));
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar(def.bullet ? 0.15 : 0.32 + Math.random() * 0.1);
    this.flash.visible = !(def.scope && this.ads);
    this.flashLight.position.copy(this.flash.position);
    this.flashLight.intensity = game.time.night ? 4 : 2;
    this.flashT = 0.05;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    game.fx.smokePuff(mw.clone().addScaledVector(fwd, 0.2), def.bullet ? 0.2 : 0.35, 0xdddddd, 0.35, fwd.clone().multiplyScalar(2));

    // Projectiles
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const shot = { id: ++this.shotId, time: game.clock, origin: origin.clone(), hits: new Set(), kills: [], hitCount: 0, impacts: 0, rifle: !!def.bullet };
    let n, spread, speed, dmg, range;
    if (def.bullet) {
      n = 1; spread = def.spread * (this.ads ? 1 : 25); speed = 780; dmg = 70; range = 220;
    } else {
      n = Math.round(cart.pellets * def.pellets);
      spread = def.spread * cart.spreadMul * this.choke.mul * (this.ads ? 1 : 1.15);
      speed = cart.speed;
      dmg = cart.dmg;
      range = cart.range * (def.range || 1);
    }
    for (let i = 0; i < n; i++) {
      const d = fwd.clone().addScaledVector(right, DH.util.gauss() * spread).addScaledVector(up, DH.util.gauss() * spread).normalize();
      this.projectiles.push({ pos: origin.clone(), vel: d.multiplyScalar(speed), dmg, range, dist: 0, shot, bullet: !!def.bullet, age: 0 });
    }
    game.onShot(shot);

    // Éjection / réarmement
    if (def.action === 'pump' || def.action === 'bolt') {
      g.state = 'cycling';
      g.timer = def.cycle;
      g.anim = 0;
      setTimeout(() => {
        if (def.action === 'pump') DH.audio.pump(); else DH.audio.bolt();
      }, 120);
      setTimeout(() => this.eject(g), def.action === 'pump' ? 280 : 350);
    } else if (def.action === 'semi') {
      this.eject(g);
    }
  }

  eject(g) {
    if (!this.game.fx || g !== this.gun) return;
    const p = new THREE.Vector3();
    g.model.recv.getWorldPosition(p);
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    p.add(new THREE.Vector3(0.05, 0.03, -0.1).applyQuaternion(q));
    const v = new THREE.Vector3(DH.util.rand(1.5, 2.5), DH.util.rand(1.5, 2.5), DH.util.rand(-0.3, 0.5)).applyQuaternion(q);
    this.game.fx.ejectShell(p, v);
  }

  startReload() {
    const g = this.gun, def = g.def;
    if (g.mag >= def.capacity || g.reserve <= 0 || g.state === 'reloading') return;
    g.state = 'reloading';
    g.reloadStep = 0;
    g.timer = 0;
    if (def.action === 'break') {
      g.timer = def.reloadBreak;
      DH.audio.breakOpen();
      g.ejected = false;
    } else if (def.action === 'bolt') {
      g.timer = def.reloadMag;
      DH.audio.magOut();
    } else {
      g.timer = 0.35;
    }
  }

  updateReload(dt) {
    const g = this.gun, def = g.def;
    g.timer -= dt;
    if (def.action === 'break') {
      const total = def.reloadBreak;
      const t = 1 - g.timer / total;
      g.anim = t;
      if (t > 0.25 && !g.ejected) {
        g.ejected = true;
        const fired = def.capacity - g.mag;
        for (let i = 0; i < fired; i++) this.eject(g);
      }
      if (t > 0.45 && g.reloadStep === 0) { g.reloadStep = 1; DH.audio.shellIn(); }
      if (t > 0.62 && g.reloadStep === 1) { g.reloadStep = 2; DH.audio.shellIn(); }
      if (g.timer <= 0) {
        const need = def.capacity - g.mag;
        const take = Math.min(need, g.reserve);
        g.mag += take;
        g.reserve -= take;
        DH.audio.breakClose();
        g.state = 'ready';
        g.anim = 0;
      }
    } else if (def.action === 'bolt') {
      g.anim = 1 - g.timer / def.reloadMag;
      if (g.timer <= 0) {
        const need = def.capacity - g.mag;
        const take = Math.min(need, g.reserve);
        g.mag += take;
        g.reserve -= take;
        DH.audio.bolt();
        g.state = 'ready';
        g.anim = 0;
      }
    } else {
      // Chargement cartouche par cartouche
      g.anim = 1;
      if (g.timer <= 0) {
        if (g.mag < def.capacity && g.reserve > 0) {
          g.mag++;
          g.reserve--;
          DH.audio.shellIn();
          g.shellBump = 1;
          g.timer = def.reloadShell;
        }
        if (g.mag >= def.capacity || g.reserve <= 0) {
          g.state = 'ready';
          g.anim = 0;
          if (def.action === 'pump') setTimeout(DH.audio.pump, 80);
        }
      }
    }
  }

  updateModel(dt, player) {
    const g = this.gun, m = g.model, def = g.def;
    const a = this.adsT;
    const hip = new THREE.Vector3(0.16, -0.2, -0.36);
    const ads = new THREE.Vector3(0, -m.sightY - (def.scope ? 0 : 0.016), def.scope ? -0.16 : -0.34);
    const p = hip.clone().lerp(ads, a);
    // Balancement lié au déplacement
    const t = player.t;
    const moveAmp = Math.min(1, player.speedNow / 4) * (1 - a * 0.8);
    p.x += Math.cos(player.bobT) * 0.012 * moveAmp;
    p.y += Math.abs(Math.sin(player.bobT)) * 0.012 * moveAmp + Math.sin(t * 1.3) * 0.002 * (1 - a);
    if (player.sprinting) {
      p.x -= 0.05;
      p.y -= 0.05;
    }
    // Recul visuel
    this.kick = Math.max(0, this.kick - dt * 6);
    p.z += this.kick * 0.07;
    p.y += this.kick * 0.012;
    // Changement d'arme
    if (this.switchT > 0) {
      const s = Math.sin((this.switchT / 0.55) * Math.PI);
      p.y -= s * 0.3;
    }
    let rx = this.kick * 0.18, ry = (1 - a) * 0.04, rz = 0;
    if (player.sprinting) { ry += 0.5; rx -= 0.2; }
    // Animations
    if (m.pump) m.pump.position.z = g.state === 'cycling' && def.action === 'pump' ? Math.sin(g.anim * Math.PI) * 0.1 : 0;
    if (m.bolt) {
      const b = g.state === 'cycling' || g.state === 'reloading' ? Math.sin(g.anim * Math.PI) : 0;
      m.bolt.rotation.z = b * 1.2;
      m.bolt.position.z = -0.02 + b * 0.06;
    }
    m.barrels.rotation.x = 0;
    if (g.state === 'reloading') {
      if (def.action === 'break') {
        const k = Math.sin(Math.min(1, g.anim * 1.15) * Math.PI);
        m.barrels.rotation.x = -0.6 * Math.min(1, k * 2);
        rx += 0.35 * k;
        p.y -= 0.06 * k;
        p.z += 0.05 * k;
      } else if (def.action === 'bolt') {
        const k = Math.sin(g.anim * Math.PI);
        rz -= 0.5 * k;
        p.y -= 0.08 * k;
      } else {
        rz -= 0.7;
        rx += 0.25;
        p.y -= 0.07;
        p.x -= 0.03;
        g.shellBump = Math.max(0, (g.shellBump || 0) - dt * 6);
        p.y += (g.shellBump || 0) * 0.015;
      }
    }
    m.root.position.lerp(p, 1 - Math.exp(-25 * dt));
    m.root.rotation.set(rx, ry, rz);
    // Lunette : on masque l'arme en visée
    m.root.visible = !(def.scope && this.adsT > 0.9);
  }

  // ======================================================== BALISTIQUE
  updateProjectiles(dt) {
    const game = this.game;
    const w = game.world;
    const targets = game.getTargets();
    const next = new THREE.Vector3();
    const wind = w.wind;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      // Traînée aérodynamique (relative au vent) + gravité
      const k = p.bullet ? 0.00035 : 0.0028;
      const rel = p.vel.clone().sub(wind);
      const sp = rel.length();
      p.vel.addScaledVector(rel, -k * sp * dt);
      p.vel.y -= 9.81 * dt;
      next.copy(p.pos).addScaledVector(p.vel, dt);
      let dead = false;
      // Cibles
      for (const t of targets) {
        if (!t.alive) continue;
        const c = t.hitCenter();
        // test grossier
        const mx = (p.pos.x + next.x) / 2 - c.x, mz = (p.pos.z + next.z) / 2 - c.z;
        const segLen = p.vel.length() * dt;
        if (mx * mx + mz * mz > (segLen + 3) * (segLen + 3)) continue;
        const r = t.radius * (p.bullet ? 1 : 1.1);
        const res = DH.util.segPointDist2(p.pos, next, c);
        if (res.d2 < r * r) {
          const dist = p.dist + segLen * res.t;
          let dmg = p.dmg;
          if (!p.bullet) {
            const R = p.range;
            if (dist > R) dmg *= Math.max(0, 1 - (dist - R) / (R * 0.7));
          }
          if (dmg > 0.5) {
            p.shot.hits.add(t);
            p.shot.hitCount++;
            p.shot.lastDist = dist;
            game.onHit(t, dmg, p.vel, p.shot, dist);
          }
          dead = true;
          break;
        }
      }
      p.dist += p.vel.length() * dt;
      // Sol / eau
      if (!dead) {
        const h = w.heightAt(next.x, next.z);
        const surf = w.isIce(next.x, next.z) ? 0.02 : Math.max(h, 0);
        if (next.y < surf) {
          dead = true;
          if (p.shot.impacts < 4 && p.dist < 120) {
            p.shot.impacts++;
            const ip = next.clone();
            ip.y = surf;
            if (h < 0 && !w.isIce(next.x, next.z)) {
              game.fx.spawn(game.fx.drops, { pos: ip, vel: new THREE.Vector3(0, DH.util.rand(2, 3.5), 0), life: 0.8, gravity: 9.8, drag: 0.2, color: new THREE.Color('#e0e8ee'), scale: 1.2 });
              game.fx.ripple(ip, 0.8);
            } else game.fx.puff(ip, w.snowAmount > 0.4 || w.isIce(next.x, next.z) ? '#f4f6fa' : '#6a5a40');
          }
        }
      }
      if (dead || p.dist > p.range * 2.4 || p.age > 2) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.pos.copy(next);
    }
  }

  dispose() {
    this.camera.remove(this.holder);
    this.holder.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.flashTex.dispose();
  }
};
