// Armes : modèles à la première personne, mécaniques (pompe, verrou, basculant, arc), balistique des projectiles.
'use strict';
HG.Weapons = class Weapons {
  constructor(game) {
    this.game = game; this.save = HG.save.get(); this.cam = game.camera; this.world = game.world; this.player = game.player;
    this.slots = []; this.cur = 0; this.busy = 0; this.busyLabel = ''; this.projectiles = []; this.zoomIdx = 0; this.chamberEmpty = false; this.drawn = 0; this.rig = new THREE.Group(); this.cam.add(this.rig); this.raycaster = new THREE.Raycaster(); this.tracer = []; this.lastShotT = 0;
    this.fireT = 0; this.shotsFired = 0; this.smokeMat = new THREE.SpriteMaterial({ color: 0xcfc8b8, transparent: true, opacity: 0.5, depthWrite: false }); this.flashMat = new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  setLoadout(ids) {
    const D = HG.data, S = this.save; this.slots = [];
    for (const id of ids) { if (!id) continue; const w = D.weapons[id]; if (!w) continue; const ammoId = S.loadout.ammo[id] || Object.keys(D.ammo).find((a) => D.ammo[a].cal === w.cal); const optic = w.scope ? (S.loadout.scope[id] || 'none') : 'none'; this.slots.push({ id, w, ammoId, ammo: D.ammo[ammoId], optic: D.optics[optic], opticId: optic, chamber: 0, cap: w.cap, zero: S.loadout.zero || 100, model: null }); }
    if (!this.slots.length) this.slots.push({ id: 'pompe12', w: D.weapons.pompe12, ammoId: 'c12_p6', ammo: D.ammo.c12_p6, optic: D.optics.none, opticId: 'none', chamber: 0, cap: 4, zero: 50 });
    for (const s of this.slots) { s.zeroAngle = this.computeZero(s); s.model = this.buildModel(s); s.chamber = Math.min(s.cap, this.reserve(s)); if (s.w.action === 'bow') s.chamber = Math.min(1, this.reserve(s)); }
    this.cur = 0; this.show();
  }
  get slot() { return this.slots[this.cur]; }
  reserve(s) { return this.save.ammo[s.ammoId] || 0; }
  show() { for (const s of this.slots) s.model.visible = false; const s = this.slot; s.model.visible = true; this.zoomIdx = 0; this.drawn = 0; this.game.ui.updateAmmo(); }
  switchWeapon() { if (this.slots.length < 2 || this.busy > 0) return; this.cur = (this.cur + 1) % this.slots.length; this.busy = 0.7; this.busyLabel = 'Changement d\'arme'; this.show(); HG.audio.magIn(); }
  // ---------------------------------------------------------------- MODÈLES
  buildModel(s) {
    const g = new THREE.Group(); const w = s.w; const wood = new THREE.MeshStandardMaterial({ map: HG.tex.wood(), roughness: 0.5, metalness: 0 }); const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.8 }); const black = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, metalness: 0.3 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.rotation.set(rx, ry, rz); g.add(mm); return mm; };
    if (w.type === 'bow') {
      const riser = add(new THREE.BoxGeometry(0.03, 0.5, 0.05), black, 0, 0, 0); for (const sgn of [-1, 1]) { const limb = add(new THREE.BoxGeometry(0.04, 0.45, 0.015), new THREE.MeshStandardMaterial({ color: 0x3a4a3a }), 0, sgn * 0.42, 0.02, sgn * 0.35, 0, 0); const cam = add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), steel, 0, sgn * 0.62, 0.05, Math.PI / 2, 0, 0); }
      const str = add(new THREE.CylinderGeometry(0.0015, 0.0015, 1.3, 4), new THREE.MeshBasicMaterial({ color: 0xdddddd }), 0, 0, 0.09); s.string = str;
      const arrow = add(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x222 }), 0.01, 0.01, -0.28, Math.PI / 2, 0, 0); s.arrow = arrow; add(new THREE.ConeGeometry(0.008, 0.04, 6), steel, 0.01, 0.01, -0.67, -Math.PI / 2, 0, 0).name = 'tip';
      g.userData.hip = { x: 0.16, y: -0.2, z: -0.45, rz: 0.2 }; g.userData.ads = { x: 0.06, y: -0.12, z: -0.35, rz: 0.1 }; return this.finishModel(g);
    }
    const isShot = w.type === 'shotgun'; const bl = isShot ? (w.trap ? 0.8 : 0.72) : w.action === 'lever' ? 0.55 : 0.62;
    // crosse + poignée
    add(new THREE.BoxGeometry(0.045, 0.11, 0.3), wood, 0, -0.06, 0.28, -0.12, 0, 0); add(new THREE.BoxGeometry(0.04, 0.07, 0.16), wood, 0, -0.02, 0.1);
    // boîtier
    add(new THREE.BoxGeometry(0.04, 0.06, 0.22), steel, 0, 0.0, -0.05);
    // canon(s)
    const barrels = w.action === 'break2' || w.action === 'double' ? (w.id === 'juxtapose12' || w.action === 'double' ? [[-0.012, 0], [0.012, 0]] : [[0, 0.012], [0, -0.012]]) : [[0, 0]];
    for (const [bx, by] of barrels) add(new THREE.CylinderGeometry(isShot ? 0.011 : 0.009, isShot ? 0.012 : 0.011, bl, 10), steel, bx, 0.01 + by, -0.15 - bl / 2, Math.PI / 2, 0, 0);
    if (isShot) add(new THREE.BoxGeometry(0.008, 0.006, bl * 0.9), steel, 0, 0.026, -0.15 - bl / 2); // bande ventilée
    if (w.action === 'pump' || w.action === 'semi') { const tube = add(new THREE.CylinderGeometry(0.009, 0.009, bl * 0.7, 8), steel, 0, -0.012, -0.15 - bl * 0.35, Math.PI / 2, 0, 0); const fore = add(new THREE.CylinderGeometry(0.022, 0.024, 0.16, 10), wood, 0, -0.005, -0.34, Math.PI / 2, 0, 0); s.fore = fore; }
    else add(new THREE.BoxGeometry(0.04, 0.045, 0.26), wood, 0, -0.012, -0.3);
    if (w.action === 'bolt') { const b = add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), steel, 0.02, 0.012, -0.02, 0, 0, 1.3); add(new THREE.SphereGeometry(0.011, 8, 6), steel, 0.055, -0.01, -0.02); s.boltM = b; }
    if (w.action === 'lever') add(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI), steel, 0, -0.045, 0.02, 0, Math.PI / 2, 0);
    if (w.action === 'bolt' || w.action === 'semi' && !isShot) add(new THREE.BoxGeometry(0.03, 0.06, 0.08), black, 0, -0.06, -0.06);
    // guidon / hausse / lunette
    add(new THREE.BoxGeometry(0.004, 0.012, 0.004), black, 0, 0.03, -0.15 - bl + 0.02); s.frontSight = g.children[g.children.length - 1];
    if (s.opticId !== 'none') { const o = s.optic; if (o.reticle === 'dot') { add(new THREE.BoxGeometry(0.03, 0.03, 0.05), black, 0, 0.05, -0.1); add(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12), new THREE.MeshBasicMaterial({ color: 0x224466, transparent: true, opacity: 0.5 }), 0, 0.052, -0.125, Math.PI / 2, 0, 0); } else { const L = 0.28; add(new THREE.CylinderGeometry(0.014, 0.014, L, 12), black, 0, 0.055, -0.1, Math.PI / 2, 0, 0); add(new THREE.CylinderGeometry(0.02, 0.016, 0.07, 12), black, 0, 0.055, -0.1 - L / 2 - 0.03, Math.PI / 2, 0, 0); add(new THREE.CylinderGeometry(0.016, 0.018, 0.05, 12), black, 0, 0.055, -0.1 + L / 2 + 0.02, Math.PI / 2, 0, 0); add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), black, 0, 0.055, -0.1, 0, 0, 0); add(new THREE.BoxGeometry(0.02, 0.03, 0.03), black, 0, 0.03, -0.02); add(new THREE.BoxGeometry(0.02, 0.03, 0.03), black, 0, 0.03, -0.2); } }
    else add(new THREE.BoxGeometry(0.02, 0.008, 0.006), black, 0, 0.03, -0.1);
    g.userData.hip = { x: 0.2, y: -0.22, z: -0.42, rz: 0.06, ry: 0.06 }; g.userData.ads = { x: 0, y: s.opticId !== 'none' ? -0.055 : -0.032, z: -0.28 + (s.opticId !== 'none' ? 0.04 : 0), rz: 0, ry: 0 };
    return this.finishModel(g);
  }
  finishModel(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; o.renderOrder = 10; } }); g.visible = false; this.rig.add(g); return g; }
  computeZero(s) { if (s.w.type !== 'rifle') return 0; const zero = s.zero || 100; const d = this.dropAt(s, zero); return Math.atan2(d, zero); }
  dropAt(s, dist) { const v = s.w.mv || s.ammo.mv; const c = this.dragCoef(s.ammo); let x = 0, y = 0, vx = v, vy = 0, t = 0; while (x < dist && t < 5) { const dt = 0.002; const sp = Math.hypot(vx, vy); vx -= c * sp * vx * dt; vy -= c * sp * vy * dt + 9.81 * dt; x += vx * dt; y += vy * dt; t += dt; } return -y; }
  dragCoef(a) { return a.kind === 'bullet' ? 0.00041 / a.bc : a.kind === 'shot' ? 0.002 / a.pmass : a.kind === 'slug' ? 0.005 : 0.0006; }
  // ---------------------------------------------------------------- MISE À JOUR
  update(dt, ctx) {
    const s = this.slot, P = this.player, U = HG.util; if (this.busy > 0) { this.busy -= dt; if (this.busy <= 0) { this.busy = 0; this.busyLabel = ''; this.game.ui.updateAmmo(); } }
    // position du modèle : hanche ↔ visée, recul, marche
    const m = s.model, a = P.aiming, hip = m.userData.hip, ads = m.userData.ads;
    const bobx = Math.sin(P.bob * 0.5) * 0.01 * (1 - a), boby = Math.abs(Math.sin(P.bob)) * 0.008 * (1 - a);
    this.fireT = Math.max(0, this.fireT - dt * 6);
    m.position.set(U.lerp(hip.x, ads.x, a) + bobx, U.lerp(hip.y, ads.y, a) + boby + (this.busy > 0 && this.busyLabel === 'Rechargement' ? -0.08 : 0), U.lerp(hip.z, ads.z, a) + this.fireT * 0.06);
    m.rotation.set(-this.fireT * 0.12 + (this.busy > 0 && this.busyLabel === 'Rechargement' ? 0.25 : 0), U.lerp(hip.ry || 0, ads.ry || 0, a), U.lerp(hip.rz, ads.rz, a));
    if (s.w.action === 'bow') { const want = P.wantAim && s.chamber > 0 ? 1 : 0; this.drawn = U.clamp(this.drawn + (want ? dt / 0.8 : -dt * 4), 0, 1); if (s.arrow) s.arrow.position.z = -0.28 + this.drawn * 0.45; if (s.string) s.string.position.z = 0.09 + this.drawn * 0.4; if (want && this.drawn > 0 && this.drawn < 0.05) HG.audio.bowDraw(); }
    // zoom / FOV
    const zoomTab = s.optic.zoom, zoom = zoomTab[Math.min(this.zoomIdx, zoomTab.length - 1)]; const baseFov = this.game.baseFov; const irons = s.opticId === 'none';
    const fov = U.lerp(baseFov, irons ? baseFov * 0.8 : baseFov / zoom, a); if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    P.aimZoom = a > 0.5 ? zoom : 1; this.scoped = a > 0.6 && !irons && s.optic.reticle !== 'dot'; this.currentZoom = zoom;
    // tir automatique maintenu (semi seulement pas en mode rafale)
    this.updateProjectiles(dt, ctx);
  }
  handle(action) {
    const s = this.slot, A = HG.audio;
    if (action === 'Fire') return this.tryFire();
    if (action === 'KeyR') return this.reload();
    if (action === 'ZoomIn' || action === 'ZoomOut') { const n = s.optic.zoom.length; if (n > 1) { this.zoomIdx = HG.util.clamp(this.zoomIdx + (action === 'ZoomIn' ? 1 : -1), 0, n - 1); A.uiClick(); } return; }
  }
  tryFire() {
    const s = this.slot, A = HG.audio, P = this.player; if (this.busy > 0) return;
    if (s.w.action === 'bow') { if (s.chamber <= 0) { this.game.hint('Plus de flèches. R pour encocher.'); return; } if (this.drawn < 0.95) { this.game.hint('Maintenez le clic droit pour armer l\'arc'); return; } this.fire(); s.chamber = 0; this.drawn = 0; P.wantAim = false; this.busy = 0.6; return; }
    if (s.chamber <= 0) { A.dryFire(); if (this.reserve(s) > 0) { this.game.hint('Chargeur vide : appuyez sur R'); } else this.game.hint('Plus de munitions (' + s.ammo.name + ')'); return; }
    this.fire(); s.chamber--; this.save.ammo[s.ammoId] = Math.max(0, (this.save.ammo[s.ammoId] || 0) - 1);
    const act = s.w.action;
    if (act === 'pump') { this.busy = 0.55; this.busyLabel = 'Pompe'; setTimeout(() => A.pump(), 180); }
    else if (act === 'bolt') { this.busy = 0.95; this.busyLabel = 'Culasse'; setTimeout(() => A.bolt(), 250); }
    else if (act === 'lever') { this.busy = 0.7; this.busyLabel = 'Levier'; setTimeout(() => A.lever(), 200); }
    else if (act === 'semi') this.busy = s.w.type === 'shotgun' ? 0.28 : 0.2;
    else if (act === 'break2' || act === 'double') this.busy = 0.22;
    this.game.ui.updateAmmo();
  }
  reload() {
    const s = this.slot, A = HG.audio, eq = this.game.eq; if (this.busy > 0) return;
    const res = this.reserve(s); const need = s.cap - s.chamber; if (need <= 0) { this.game.hint('Arme déjà chargée'); return; } if (res <= 0) { this.game.hint('Aucune munition en réserve : achetez-en à l\'armurerie'); A.dryFire(); return; }
    const n = Math.min(need, res); const f = eq.reload || 1; const act = s.w.action;
    if (act === 'bow') { this.busy = 1.1 * f; this.busyLabel = 'Encoche'; setTimeout(() => { s.chamber = 1; A.shellIn(); this.game.ui.updateAmmo(); }, 900 * f); return; }
    if (act === 'break2' || act === 'double') { this.busy = 1.9 * f; this.busyLabel = 'Rechargement'; A.breakOpen(); setTimeout(() => A.shellIn(), 600 * f); if (n > 1) setTimeout(() => A.shellIn(), 1000 * f); setTimeout(() => { A.breakClose(); s.chamber += n; this.game.ui.updateAmmo(); }, 1700 * f); return; }
    if (s.w.type === 'shotgun') { this.busy = (0.4 + n * 0.55) * f; this.busyLabel = 'Rechargement'; for (let i = 0; i < n; i++) setTimeout(() => { s.chamber++; A.shellIn(); this.game.ui.updateAmmo(); }, (400 + i * 550) * f); if (act === 'pump') setTimeout(() => A.pump(), (400 + n * 550) * f - 100); return; }
    this.busy = 2.2 * f; this.busyLabel = 'Rechargement'; A.magIn(); setTimeout(() => { s.chamber += n; if (act === 'bolt') A.bolt(); this.game.ui.updateAmmo(); }, 1900 * f);
  }
  // ---------------------------------------------------------------- TIR
  fire() {
    const s = this.slot, P = this.player, U = HG.util, A = HG.audio, W = this.world, eq = this.game.eq;
    const dir = P.forward(new THREE.Vector3()); const origin = this.cam.position.clone().addScaledVector(dir, 0.6);
    // dispersion : précision intrinsèque + posture/souffle (non visée = large)
    const moa = (s.w.moa || 0) * 0.00029; const aim = P.aiming; const hipSpread = (1 - aim) * 0.06;
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const zeroA = s.zeroAngle || 0;
    const kind = s.ammo.kind; const wind = W.wind; const windV = new THREE.Vector3(Math.cos(wind.dir), 0, Math.sin(wind.dir)).multiplyScalar(wind.speed * (1 + wind.gust * 0.35));
    const shotInfo = { weapon: s.id, ammo: s.ammoId, kind, origin: origin.clone(), t: this.game.time, dist: 0, hits: [] };
    const launch = (d, mass, v, extra) => { const p = { pos: origin.clone(), vel: d.clone().multiplyScalar(v), mass, c: this.dragCoef(s.ammo), kind, t: 0, prev: origin.clone(), pellets: extra.pellets || 1, shot: shotInfo, done: false, wind: windV, arrow: kind === 'arrow' ? this.makeArrowMesh() : null }; this.projectiles.push(p); };
    if (kind === 'shot') {
      const choke = HG.data.chokes[this.save.loadout.choke || 'mod'].spread * (s.w.choke ? 1 : 1.2); const sigma = 0.0095 * choke; const reps = 24; const perRep = s.ammo.pellets / reps;
      for (let i = 0; i < reps; i++) { const d = dir.clone().addScaledVector(right, U.gauss() * sigma + (U.rand(-1, 1) * hipSpread)).addScaledVector(up, U.gauss() * sigma + U.rand(-1, 1) * hipSpread + zeroA).normalize(); launch(d, s.ammo.pmass / 1000, s.ammo.mv * U.rand(0.96, 1.04), { pellets: perRep }); }
    } else {
      const d = dir.clone().addScaledVector(right, U.gauss() * moa + U.rand(-1, 1) * hipSpread).addScaledVector(up, U.gauss() * moa + U.rand(-1, 1) * hipSpread + zeroA).normalize();
      const mass = kind === 'slug' ? s.ammo.pmass / 1000 : s.ammo.mass / 1000; const v = s.w.mv || s.ammo.mv; launch(d, mass, v, {});
    }
    // son, recul, flash
    const isRifle = s.w.type === 'rifle', suppressed = isRifle && eq.suppressor; A.shot(s.w.type === 'bow' ? 'bow' : isRifle ? 'rifle' : 'shotgun', 1, null, suppressed);
    const rec = s.w.type === 'bow' ? 0.01 : (isRifle ? 0.05 + (s.ammo.mass || 8) * 0.003 : 0.07) * (P.stance === 'prone' ? 0.6 : 1);
    P.kick(rec, U.rand(-0.008, 0.008), s.w.type === 'bow' ? 0.2 : 1.2); this.fireT = 1;
    if (s.w.type !== 'bow') { const fl = new THREE.Sprite(this.flashMat.clone()); fl.scale.setScalar(0.5); fl.position.copy(origin).addScaledVector(dir, 0.8); W.scene.add(fl); setTimeout(() => W.scene.remove(fl), 45); const sm = new THREE.Sprite(this.smokeMat.clone()); sm.scale.setScalar(0.4); sm.position.copy(origin).addScaledVector(dir, 1.0); W.scene.add(sm); this.game.fx.push({ m: sm, t: 0, life: 1.2, vel: new THREE.Vector3(windV.x * 0.3, 0.5, windV.z * 0.3), grow: 1.2 }); }
    // bruit : effraie les animaux alentour
    this.game.onShotFired(shotInfo, suppressed ? 200 : s.w.type === 'bow' ? 20 : isRifle ? 700 : 550);
    this.save.stats.shots++; this.shotsFired++;
  }
  makeArrowMesh() { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 5), new THREE.MeshStandardMaterial({ color: 0x222 })); m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); this.world.scene.add(g); return g; }
  updateProjectiles(dt, ctx) {
    const W = this.world, animals = this.game.animals.list, U = HG.util; const sub = 3, h = dt / sub; const tmpDir = new THREE.Vector3();
    for (const p of this.projectiles) {
      if (p.done) continue;
      for (let k = 0; k < sub && !p.done; k++) {
        p.prev.copy(p.pos); const rel = tmpDir.copy(p.vel).sub(p.wind); const sp = rel.length();
        p.vel.addScaledVector(rel, -p.c * sp * h); p.vel.y -= 9.81 * h; p.pos.addScaledVector(p.vel, h); p.t += h;
        if (p.arrow) { p.arrow.position.copy(p.pos); p.arrow.lookAt(p.pos.clone().add(p.vel)); }
        const seg = p.pos.clone().sub(p.prev); const segLen = seg.length(); if (segLen < 1e-5) continue;
        this.raycaster.set(p.prev, seg.clone().normalize()); this.raycaster.far = segLen + 0.05;
        // sol / eau
        if (p.pos.y < W.height(p.pos.x, p.pos.z)) { this.impactGround(p, 'ground'); break; }
        if (W.waterY > -100 && p.prev.y > W.waterY && p.pos.y <= W.waterY) { this.impactGround(p, 'water'); break; }
        // animaux : test sphère puis maillages
        let hitAnimal = null;
        for (const a of animals) { if (a.dead && a.stateT > 2) continue; const r = a.radius + 0.4; const d = distPointSeg(a.pos.x, a.pos.y + a.d.h * a.sizeF * 0.5, a.pos.z, p.prev, p.pos); if (d > r) continue; const inter = this.raycaster.intersectObject(a.group, true); if (inter.length) { hitAnimal = { a, i: inter[0] }; break; } }
        if (hitAnimal) { this.impactAnimal(p, hitAnimal.a, hitAnimal.i); break; }
        // cibles fixes / plateaux
        const st = this.game.hitTargets(p, this.raycaster, segLen); if (st) { p.done = true; if (p.arrow) W.scene.remove(p.arrow); break; }
        if (p.t > 6 || Math.abs(p.pos.x) > W.half + 500) { p.done = true; if (p.arrow) W.scene.remove(p.arrow); }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
    function distPointSeg(x, y, z, a, b) { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z; const l2 = abx * abx + aby * aby + abz * abz; let t = l2 > 0 ? ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t), z - (a.z + abz * t)); }
  }
  energy(p) { return 0.5 * p.mass * p.vel.lengthSq() * p.pellets; }
  impactGround(p, what) { p.done = true; if (p.arrow) { p.arrow.position.copy(p.pos); this.game.fx.push({ m: p.arrow, t: 0, life: 40, still: true }); } if (p.kind === 'shot' && p.pellets < 3) return; if (what === 'water') { HG.audio.splash(p.pos, 0.4); this.game.spawnPuff(p.pos, 0x9fb8c8, 0.5); } else { const d = p.pos.distanceTo(this.cam.position); if (d < 250 && (p.kind !== 'shot' || Math.random() < 0.15)) { HG.audio.dirt(p.pos); this.game.spawnPuff(p.pos, 0x8a7a5a, 0.5); } } }
  impactAnimal(p, a, inter) {
    const zone = inter.object.userData.zone || 'gut'; const e = this.energy(p); const dist = p.pos.distanceTo(p.shot.origin);
    const rec = a.hit(zone, e, p.kind, p.shot.origin, p.pellets); p.done = true; if (p.arrow) this.world.scene.remove(p.arrow);
    if (rec) { rec.dist = dist; rec.energy = e; rec.zone = zone; p.shot.hits.push(rec); HG.audio.hitFlesh(a.pos); this.game.spawnPuff(inter.point, 0x8a1010, 0.35); this.game.onAnimalHit(a, rec, p.shot); }
  }
  dispose() { this.cam.remove(this.rig); for (const p of this.projectiles) if (p.arrow) this.world.scene.remove(p.arrow); }
};
