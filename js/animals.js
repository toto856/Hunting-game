// Animaux : modèles procéduraux animés, sens (vue, ouïe, odorat), comportements, blessures, traces de sang.
'use strict';
HG.Animal = class Animal {
  constructor(sp, id, x, z, world, opts = {}) {
    const U = HG.util, D = HG.data.species[sp];
    this.sp = sp; this.d = D; this.id = id; this.world = world; this.kind = D.kind;
    this.pos = new THREE.Vector3(x, world.height(x, z), z); this.yaw = U.rand(0, Math.PI * 2);
    this.speed = 0; this.targetSpeed = 0; this.state = 'idle'; this.stateT = 0; this.awareness = 0; this.alertT = 0;
    this.mass = U.lerp(D.mass[0], D.mass[1], Math.pow(Math.random(), 0.8)); this.sizeF = 0.85 + (this.mass - D.mass[0]) / (D.mass[1] - D.mass[0]) * 0.3;
    this.hp = this.mass * 12 + 200; this.maxHp = this.hp; this.bleed = 0; this.wounded = false; this.dead = false; this.deathTimer = -1; this.hits = [];
    this.trophy = this.rollTrophy(); this.phase = Math.random() * 10; this.headDown = 0; this.alive = true;
    this.herd = opts.herd || null; this.leader = opts.leader || null; this.offset = new THREE.Vector3(U.rand(-6, 6), 0, U.rand(-6, 6));
    this.wanderT = 0; this.target = null; this.flying = false; this.alt = 0; this.vel = new THREE.Vector3(); this.hidden = D.ground ? true : false;
    this.lastBlood = null; this.callT = U.rand(5, 40); this.driven = null; this.attract = null; this.swim = false; this.collected = false; this.retrievedBy = null;
    this.fallT = 0; this.bark = 0; this.visibleDist = 1;
    this.group = this.buildModel(); this.group.position.copy(this.pos); world.scene.add(this.group);
    if (D.kind === 'water' && world.isWater(x, z)) { this.swim = true; this.pos.y = world.waterY; }
  }
  rollTrophy() { const D = this.d, U = HG.util; const q = U.clamp(U.gauss() * 0.18 + 0.55 + (this.mass - D.mass[0]) / (D.mass[1] - D.mass[0]) * 0.3, 0.05, 1); return q; }
  trophyLabel() {
    const D = this.d, q = this.trophy;
    if (D.antlers === true) return Math.round(6 + q * 12) + ' cors';
    if (D.antlers === 'small') return Math.round(2 + q * 4) + ' pointes';
    if (D.antlers === 'palmes' || D.antlers === 'moose') return Math.round(60 + q * (D.antlers === 'moose' ? 120 : 30)) + ' cm';
    if (D.tusks) return (14 + q * 12).toFixed(1) + ' cm';
    if (D.horns) return Math.round(D.horns === 'curl' ? 55 + q * 40 : D.horns === 'big' ? 70 + q * 40 : 18 + q * 10) + ' cm';
    return this.mass.toFixed(1) + ' kg';
  }
  // ================================================================ MODÈLE
  mat(c1, c2, opts) { const m = new THREE.MeshStandardMaterial({ map: HG.tex.fur(c1, c2, opts), roughness: 0.92 }); return m; }
  part(geo, mat, zone, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData = { zone, animal: this }; (parent || this.group).add(m); return m; }
  buildModel() {
    const D = this.d, U = HG.util, g = new THREE.Group(); this.group = g; g.userData = { animal: this };
    const L = D.len * this.sizeF, H = D.h * this.sizeF;
    const furOpts = {}; if (D.spots) furOpts.spots = '#f1e6c8'; if (D.stripes) furOpts.stripes = true;
    const fur = this.mat(D.colors[0], D.colors[1], furOpts), belly = this.mat(D.belly, D.colors[1]), dark = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.6 });
    this.parts = {};
    if (D.kind === 'bird' || D.kind === 'water') return this.buildBird(g, L, H, fur, belly, dark);
    // ---- quadrupède
    const bodyY = H * 0.62, bl = L * 0.55, br = H * 0.24;
    const body = new THREE.Group(); body.position.y = bodyY; g.add(body); this.parts.body = body;
    const chestG = new THREE.SphereGeometry(1, 14, 10); 
    const chest = this.part(chestG, fur, 'vital', body, bl * 0.22, 0.02, 0); chest.scale.set(bl * 0.42, br * 1.1, br * 0.95);
    const gut = this.part(chestG, fur, 'gut', body, -bl * 0.2, -0.01, 0); gut.scale.set(bl * 0.45, br * 1.02, br * 0.98);
    const rump = this.part(chestG, fur, 'rump', body, -bl * 0.42, 0.04, 0); rump.scale.set(bl * 0.22, br * 0.95, br * 0.85);
    const bellyM = this.part(chestG, belly, 'gut', body, 0, -br * 0.35, 0); bellyM.scale.set(bl * 0.5, br * 0.6, br * 0.8);
    if (D.bear) { rump.scale.set(bl * 0.3, br * 1.1, br * 1.0); const hump = this.part(chestG, fur, 'vital', body, bl * 0.2, br * 0.35, 0); hump.scale.set(bl * 0.2, br * 0.5, br * 0.7); }
    // cou + tête
    const neck = new THREE.Group(); neck.position.set(bl * 0.45, br * 0.45, 0); body.add(neck); this.parts.neck = neck;
    const nl = (D.antlers || D.horns ? 0.42 : 0.32) * H * (D.tusks ? 0.55 : 1);
    const neckM = this.part(new THREE.CylinderGeometry(br * 0.42, br * 0.55, nl, 10), fur, 'neck', neck, nl * 0.45, nl * 0.35, 0); neckM.rotation.z = -0.9 - (D.tusks ? 0.5 : 0);
    const head = new THREE.Group(); head.position.set(nl * 0.85, nl * 0.65, 0); neck.add(head); this.parts.head = head;
    if (D.tusks) head.position.set(nl * 0.7, nl * 0.2, 0);
    const hs = H * (D.tusks ? 0.26 : D.hare ? 0.32 : 0.2);
    const skull = this.part(new THREE.SphereGeometry(1, 12, 10), fur, 'head', head, 0, 0, 0); skull.scale.set(hs * 1.1, hs * 0.85, hs * 0.75);
    const snout = this.part(new THREE.CylinderGeometry(hs * 0.42, hs * 0.65, hs * 1.3, 10), D.tusks ? dark : fur, 'head', head, hs * 1.0, -hs * 0.2, 0); snout.rotation.z = Math.PI / 2 + 0.25;
    this.part(new THREE.SphereGeometry(hs * 0.22, 8, 6), dark, 'head', head, hs * 1.65, -hs * 0.35, 0); // nez
    for (const s of [-1, 1]) { this.part(new THREE.SphereGeometry(hs * 0.13, 8, 6), dark, 'head', head, hs * 0.55, hs * 0.25, s * hs * 0.6); const ear = this.part(new THREE.ConeGeometry(hs * (D.hare ? 0.25 : 0.32), hs * (D.hare ? 1.9 : D.tusks ? 0.7 : 0.9), 8), fur, 'head', head, -hs * 0.3, hs * 0.75, s * hs * 0.55); ear.rotation.z = D.hare ? 0.3 : 0.2; ear.rotation.x = s * 0.6; }
    // bois / cornes / défenses
    const boneMat = new THREE.MeshStandardMaterial({ color: D.antlers === 'moose' || D.antlers === 'palmes' ? 0xc9b48a : 0x8a7050, roughness: 0.8 });
    if (D.antlers === true) { for (const s of [-1, 1]) this.buildAntler(head, s, H * (0.45 + this.trophy * 0.35), boneMat, Math.round(3 + this.trophy * 4)); }
    if (D.antlers === 'small') { for (const s of [-1, 1]) this.buildAntler(head, s, H * (0.25 + this.trophy * 0.15), boneMat, Math.round(1 + this.trophy * 2)); }
    if (D.antlers === 'palmes' || D.antlers === 'moose') { for (const s of [-1, 1]) { const w = H * (D.antlers === 'moose' ? 0.55 : 0.35) * (0.7 + this.trophy * 0.5); const pal = this.part(new THREE.BoxGeometry(w * 0.9, w * 0.08, w * 0.6), boneMat, 'head', head, -hs * 0.2, hs * 0.9 + w * 0.3, s * (hs * 0.4 + w * 0.35)); pal.rotation.x = s * 0.5; pal.rotation.z = 0.3; const beam = this.part(new THREE.CylinderGeometry(hs * 0.1, hs * 0.14, w * 0.7, 6), boneMat, 'head', head, -hs * 0.1, hs * 0.6 + w * 0.15, s * (hs * 0.3 + w * 0.15)); beam.rotation.x = s * 1.1; } }
    if (D.horns) { for (const s of [-1, 1]) { const len = hs * (D.horns === 'big' ? 3.2 : D.horns === 'curl' ? 2.2 : 1.1) * (0.7 + this.trophy * 0.5); const segs = D.horns === 'hook' ? 3 : 6; let px = -hs * 0.1, py = hs * 0.8, pz = s * hs * 0.35, ang = D.horns === 'hook' ? -0.4 : 0.6; for (let i = 0; i < segs; i++) { const sl = len / segs; const seg = this.part(new THREE.CylinderGeometry(hs * 0.06 * (1 - i / segs * 0.7), hs * 0.1 * (1 - i / segs * 0.6), sl, 6), boneMat, 'head', head, px, py, pz); seg.rotation.z = ang; seg.rotation.x = s * (D.horns === 'curl' ? 0.35 * i : 0.15); px += Math.sin(-ang) * sl * 0.9; py += Math.cos(ang) * sl * 0.9; pz += s * sl * (D.horns === 'curl' ? 0.25 : 0.05); ang += D.horns === 'hook' ? 1.0 : D.horns === 'curl' ? 0.75 : 0.28; } } }
    if (D.tusks) { for (const s of [-1, 1]) { const t = this.part(new THREE.ConeGeometry(hs * 0.07, hs * (0.35 + this.trophy * 0.4), 6), new THREE.MeshStandardMaterial({ color: 0xf0e8d0 }), 'head', head, hs * 1.25, -hs * 0.25, s * hs * 0.35); t.rotation.z = 0.5; t.rotation.x = s * 0.5; } }
    // pattes
    this.legs = [];
    const legL = H * 0.6, legR = br * (D.tusks ? 0.28 : 0.2);
    for (const [lx, lz, front] of [[bl * 0.38, br * 0.55, 1], [bl * 0.38, -br * 0.55, 1], [-bl * 0.4, br * 0.55, 0], [-bl * 0.4, -br * 0.55, 0]]) {
      const leg = new THREE.Group(); leg.position.set(lx, -br * 0.5, lz); body.add(leg);
      const up = this.part(new THREE.CylinderGeometry(legR * 0.8, legR * 1.1, legL * 0.5, 8), fur, 'leg', leg, 0, -legL * 0.25, 0);
      const knee = new THREE.Group(); knee.position.y = -legL * 0.5; leg.add(knee);
      this.part(new THREE.CylinderGeometry(legR * 0.55, legR * 0.8, legL * 0.5, 8), fur, 'leg', knee, 0, -legL * 0.25, 0);
      this.part(new THREE.BoxGeometry(legR * 1.6, legR * 0.9, legR * 1.4), dark, 'leg', knee, legR * 0.2, -legL * 0.5, 0);
      this.legs.push({ g: leg, knee, front, side: lz > 0 ? 1 : -1 });
    }
    // queue
    const tail = this.part(new THREE.CylinderGeometry(br * 0.08, br * (D.canid ? 0.3 : 0.12), D.canid ? L * 0.35 : L * 0.12, 6), D.canid ? fur : belly, 'rump', body, -bl * 0.62, br * 0.35, 0); tail.rotation.z = D.canid ? 1.2 : -0.8; this.parts.tail = tail;
    g.scale.setScalar(1); this.radius = Math.max(bl, H) * 0.7;
    return g;
  }
  buildAntler(head, s, len, mat, tines) {
    const hs = this.d.h * this.sizeF * 0.2; const base = new THREE.Group(); base.position.set(-hs * 0.25, hs * 0.75, s * hs * 0.35); head.add(base);
    const beam = this.part(new THREE.CylinderGeometry(len * 0.02, len * 0.045, len, 6), mat, 'head', base, 0, len / 2, 0); beam.rotation.z = -0.35; beam.rotation.x = s * 0.55;
    for (let i = 0; i < tines; i++) { const t = (i + 1) / (tines + 1); const tine = this.part(new THREE.CylinderGeometry(0.004, len * 0.03, len * (0.35 - t * 0.15), 5), mat, 'head', base, Math.sin(0.35) * len * t * 0.6 + len * 0.1, Math.cos(0.35) * len * t, s * (Math.sin(0.55) * len * t * 0.3 + len * 0.05 * (i % 2 ? 1 : -1))); tine.rotation.z = -1.2 + (i % 2) * 0.5; tine.rotation.x = s * (0.3 + (i % 2) * 0.9); }
  }
  buildBird(g, L, H, fur, belly, dark) {
    const D = this.d; const body = new THREE.Group(); body.position.y = H * 0.55; g.add(body); this.parts.body = body;
    const bodyM = this.part(new THREE.SphereGeometry(1, 12, 9), fur, 'vital', body, 0, 0, 0); bodyM.scale.set(L * 0.36, H * 0.4, H * 0.36);
    const bel = this.part(new THREE.SphereGeometry(1, 10, 8), belly, 'vital', body, 0, -H * 0.12, 0); bel.scale.set(L * 0.3, H * 0.3, H * 0.33);
    const neck = new THREE.Group(); neck.position.set(L * 0.25, H * 0.2, 0); body.add(neck); this.parts.neck = neck;
    const nl = D.goose || D.wader ? H * 0.9 : D.longbeak ? H * 0.15 : H * 0.3;
    const neckM = this.part(new THREE.CylinderGeometry(H * 0.09, H * 0.13, nl, 8), D.goose ? fur : belly, 'neck', neck, nl * 0.25, nl * 0.4, 0); neckM.rotation.z = -0.5;
    const head = new THREE.Group(); head.position.set(nl * 0.5, nl * 0.8, 0); neck.add(head); this.parts.head = head;
    const headMat = D.duck && D.sp !== 'sarcelle' && !D.goose ? new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.6 }) : fur;
    this.part(new THREE.SphereGeometry(H * 0.16, 10, 8), headMat, 'head', head, 0, 0, 0);
    const beak = this.part(new THREE.ConeGeometry(H * 0.06, D.longbeak ? H * 0.55 : D.duck ? H * 0.28 : H * 0.16, 6), new THREE.MeshStandardMaterial({ color: D.duck ? 0xd9b23a : 0x8a7a5a }), 'head', head, H * 0.22, -H * 0.02, 0); beak.rotation.z = -Math.PI / 2;
    for (const s of [-1, 1]) this.part(new THREE.SphereGeometry(H * 0.03, 6, 5), dark, 'head', head, H * 0.08, H * 0.05, s * H * 0.12);
    // ailes
    this.wings = [];
    const wl = D.goose ? L * 0.9 : D.duck ? L * 0.7 : L * 0.55, wingMat = new THREE.MeshStandardMaterial({ map: HG.tex.fur(D.colors[0], D.colors[1]), side: THREE.DoubleSide, roughness: 0.9 });
    for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(L * 0.02, H * 0.15, s * H * 0.2); body.add(w); const wm = this.part(new THREE.PlaneGeometry(wl, L * 0.28), wingMat, 'vital', w, 0, 0, s * wl / 2); wm.rotation.x = Math.PI / 2; wm.rotation.z = 0.12; wm.geometry = wm.geometry.clone(); this.wings.push({ g: w, side: s }); }
    // queue
    const tail = this.part(new THREE.PlaneGeometry(D.longtail ? L * 0.7 : L * 0.25, H * 0.25), wingMat, 'rump', body, -L * (D.longtail ? 0.6 : 0.38), H * 0.05, 0); tail.rotation.x = Math.PI / 2 + 0.2; tail.rotation.z = D.longtail ? 0.25 : 0.1; this.parts.tail = tail;
    for (const s of [-1, 1]) { const leg = this.part(new THREE.CylinderGeometry(H * 0.02, H * 0.02, H * (D.wader ? 0.9 : 0.4), 5), new THREE.MeshStandardMaterial({ color: D.duck ? 0xd98a2a : 0x6a5a4a }), 'leg', body, -L * 0.05, -H * 0.4, s * H * 0.12); this.legs = this.legs || []; this.legs.push({ g: leg }); }
    this.radius = L * 0.4; return g;
  }
  // ================================================================ SENS
  sense(ctx, dt) {
    const U = HG.util, D = this.d, p = ctx.player; const dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz);
    if (dist > 400) { this.awareness = Math.max(0, this.awareness - dt * 0.2); return dist; }
    let inc = 0;
    // Vue : cône de vision large (proie) ; visibilité du joueur (posture, camouflage, mouvement, lumière)
    const ang = Math.atan2(dz, dx); const rel = Math.abs(U.angleDiff(this.yaw, ang));
    const fov = D.kind === 'bird' || D.kind === 'water' ? 2.9 : 2.4; const sightR = D.sight * ctx.visibility * (ctx.night ? 0.55 : 1);
    if (rel < fov && dist < sightR) { const cov = 1 - this.world.cover(p.x, p.z) * 0.5; inc += (1 - dist / sightR) * (0.35 + ctx.moving * 1.2) * cov * (this.state === 'alert' ? 1.6 : 1); }
    // Ouïe
    if (dist < ctx.noise * D.hear / 100) inc += (1 - dist / (ctx.noise * D.hear / 100)) * 0.9;
    // Odorat : le vent porte l'odeur du joueur vers l'animal
    const wx = Math.cos(ctx.wind.dir), wz = Math.sin(ctx.wind.dir); const toA = (-dx * wx - dz * wz) / (dist || 1);
    if (toA > 0.55 && dist < D.smell * (0.6 + ctx.wind.speed * 0.06)) inc += (toA - 0.5) * 2 * (1 - dist / D.smell) * 0.8 * (1 - ctx.scentCover);
    // Chien
    if (ctx.dog && ctx.dog.active) { const dd = Math.hypot(ctx.dog.pos.x - this.pos.x, ctx.dog.pos.z - this.pos.z); if (dd < 45) inc += (1 - dd / 45) * 1.5; }
    this.awareness = U.clamp(this.awareness + inc * dt - dt * 0.08, 0, 2);
    return dist;
  }
  // ================================================================ COMPORTEMENT
  update(dt, ctx) {
    const U = HG.util, D = this.d, W = this.world; this.stateT += dt; this.phase += dt;
    if (this.dead) { this.updateDead(dt); this.animate(dt); return; }
    const dist = this.sense(ctx, dt);
    if (this.bleed > 0) { this.hp -= this.bleed * dt; if (Math.random() < dt * 2.5 && this.speed > 0.2) ctx.blood(this.pos.clone(), this.sp); if (this.hp <= 0) return this.die(ctx, 'blessure'); }
    if (this.deathTimer > 0) { this.deathTimer -= dt; if (this.deathTimer <= 0) return this.die(ctx, 'tir'); }
    if (this.flying) return this.updateFlying(dt, ctx, dist);
    // vocalises
    this.callT -= dt; if (this.callT <= 0) { this.callT = U.rand(20, 90); if (dist < 300) this.vocalize(ctx); }
    // transitions
    if (this.state !== 'flee' && this.state !== 'driven') {
      if (this.awareness > 1.0 || (this.hidden === false && D.ground && dist < 12)) this.flee(ctx, dist);
      else if (this.awareness > 0.45 && this.state !== 'alert') { this.state = 'alert'; this.stateT = 0; this.targetSpeed = 0; }
      else if (this.state === 'alert' && this.awareness < 0.25 && this.stateT > 3) { this.state = 'idle'; this.stateT = 0; }
    }
    if (D.ground && this.hidden && !this.flying && (dist < (ctx.dogFlush ? 14 : 5) || (ctx.dog && ctx.dog.flushing && Math.hypot(ctx.dog.pos.x - this.pos.x, ctx.dog.pos.z - this.pos.z) < 6))) return this.flush(ctx);
    if (this.attract && this.state !== 'flee') { const a = this.attract; const ad = Math.hypot(a.x - this.pos.x, a.z - this.pos.z); if (ad > 25) { this.state = 'walk'; this.target = { x: a.x + U.rand(-10, 10), z: a.z + U.rand(-10, 10) }; } else this.attract = null; }
    // comportement selon état
    const speedWalk = D.walk * (D.kind === 'small' ? 1.4 : 1), speedRun = D.run || D.fly * 0.4;
    switch (this.state) {
      case 'idle':
        this.targetSpeed = 0; this.headDown = U.lerp(this.headDown, D.kind === 'small' || D.ground ? 0.3 : 0.9, dt);
        if (this.stateT > U.rand(4, 14)) { this.state = 'walk'; this.stateT = 0; this.pickTarget(ctx); }
        break;
      case 'walk': {
        this.headDown = U.lerp(this.headDown, 0.3, dt); this.targetSpeed = speedWalk;
        if (this.leader && !this.leader.dead && this.leader.state !== 'flee') { const t = this.leader.pos; this.target = { x: t.x + this.offset.x, z: t.z + this.offset.z }; if (this.leader.state === 'idle' && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 3) { this.state = 'idle'; this.stateT = 0; } }
        if (this.target) { const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z); if (d < 2) { this.state = 'idle'; this.stateT = 0; this.target = null; } else this.steer(this.target, dt, 1.5); }
        if (this.stateT > 30) { this.state = 'idle'; this.stateT = 0; }
        break; }
      case 'alert':
        this.targetSpeed = 0; this.headDown = U.lerp(this.headDown, 0, dt * 3);
        this.yaw = U.lerp(this.yaw, this.yaw + U.angleDiff(this.yaw, Math.atan2(ctx.player.z - this.pos.z, ctx.player.x - this.pos.x)) , dt * 1.5);
        break;
      case 'flee': {
        this.headDown = 0; this.targetSpeed = this.wounded ? speedRun * 0.6 : speedRun;
        if (this.target) this.steer(this.target, dt, 3.5);
        const safe = dist > D.sight * 1.6 + 60 && this.stateT > 6; if ((this.stateT > 25 || safe) && this.awareness < 0.8) { this.state = 'walk'; this.stateT = 0; this.awareness *= 0.5; this.pickTarget(ctx); }
        else if (this.stateT > 8 && Math.random() < dt * 0.3) this.target = this.fleeTarget(ctx);
        if (this.leader && this.leader.state === 'flee') this.target = { x: this.leader.pos.x + this.offset.x * 0.5, z: this.leader.pos.z + this.offset.z * 0.5 };
        break; }
      case 'driven': { // battue : pousse par la traque
        this.headDown = 0; const dr = this.driven; this.targetSpeed = this.stateT < dr.delay ? 0 : (this.wounded ? speedRun * 0.5 : speedRun * 0.75);
        if (this.stateT >= dr.delay) { if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 8) this.target = { x: this.pos.x + Math.cos(dr.dir) * 60 + U.rand(-12, 12), z: this.pos.z + Math.sin(dr.dir) * 60 + U.rand(-12, 12) }; this.steer(this.target, dt, 2.5); }
        if (this.stateT > dr.delay + 60) { this.state = 'flee'; this.stateT = 0; this.target = this.fleeTarget(ctx); }
        break; }
    }
    // charge du sanglier / ours blessé
    if (this.wounded && D.danger && this.state === 'flee' && dist < 18 && Math.random() < dt * 0.4) { this.target = { x: ctx.player.x, z: ctx.player.z }; this.charge = 2.5; }
    if (this.charge > 0) { this.charge -= dt; this.target = { x: ctx.player.x, z: ctx.player.z }; this.targetSpeed = speedRun; if (dist < 1.6) { ctx.playerHit(this); this.charge = 0; this.target = this.fleeTarget(ctx); } }
    // mouvement
    this.speed = U.lerp(this.speed, this.targetSpeed, dt * 3);
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.cos(this.yaw) * this.speed * dt, nz = this.pos.z + Math.sin(this.yaw) * this.speed * dt;
      const wet = W.isWater(nx, nz); const canWater = D.aquatic || D.kind === 'water' || (D.kind === 'big' && W.waterDepth(nx, nz) < 1.0);
      if (W.inBounds(nx, nz, 40) && (canWater || !wet) && (W.biome !== 'montagne' || W.normal(nx, nz).y > 0.45 || D.horns)) { this.pos.x = nx; this.pos.z = nz; } else { this.yaw += (Math.random() > 0.5 ? 1 : -1) * 1.2; this.target = null; }
    }
    this.swim = (D.kind === 'water' || D.aquatic) && W.isWater(this.pos.x, this.pos.z);
    this.pos.y = this.swim ? W.waterY - 0.05 : W.height(this.pos.x, this.pos.z);
    this.animate(dt);
  }
  pickTarget(ctx) { const U = HG.util, W = this.world; for (let i = 0; i < 8; i++) { const a = U.rand(0, 6.28), r = U.rand(15, 60); const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r; if (!W.inBounds(x, z, 50)) continue; if (!this.d.aquatic && this.d.kind !== 'water' && W.isWater(x, z)) continue; if (this.d.kind === 'water' && !W.isWater(x, z) && Math.random() < 0.7) continue; this.target = { x, z }; return; } this.target = null; }
  fleeTarget(ctx) { const U = HG.util; const a = Math.atan2(this.pos.z - ctx.player.z, this.pos.x - ctx.player.x) + U.rand(-0.6, 0.6); let r = 90; let x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r; if (!this.world.inBounds(x, z, 60)) { x = this.pos.x - Math.cos(a) * r * 0.5 + U.rand(-30, 30); z = this.pos.z - Math.sin(a) * r * 0.5 + U.rand(-30, 30); } return { x, z }; }
  flee(ctx, dist) { if (this.dead) return; if (this.d.kind === 'water' || (this.d.ground && !this.hidden)) return this.flush(ctx); this.state = 'flee'; this.stateT = 0; this.target = this.fleeTarget(ctx); this.awareness = 1.5; if (this.herd) for (const m of this.herd) if (m !== this && !m.dead && m.state !== 'flee' && Math.random() < 0.9) { m.state = 'flee'; m.stateT = 0; m.target = m.fleeTarget(ctx); m.awareness = 1.2; } if (this.d.vocal === 'aboiement' && Math.random() < 0.5) HG.audio.roeBark(this.pos); if (this.d.vocal === 'siffle') HG.audio.marmotWhistle(this.pos); }
  steer(t, dt, rate) { const U = HG.util; const want = Math.atan2(t.z - this.pos.z, t.x - this.pos.x); const d = U.angleDiff(this.yaw, want); this.yaw += U.clamp(d, -rate * dt, rate * dt); }
  vocalize(ctx) { const A = HG.audio, v = this.d.vocal; if (v === 'brame' && (ctx.hour < 9 || ctx.hour > 17)) A[this.sp === 'orignal' ? 'moose' : 'brame'](this.pos); else if (v === 'grognement') A.grunt(this.pos); else if (v === 'cri') A.pheasant(this.pos); else if (v === 'cancan') A.quack(this.pos, this.sp === 'sarcelle' ? 1.6 : 1); else if (v === 'cacarde') A.honk(this.pos); else if (v === 'croasse') A.crow(this.pos); else if (this.d.bear && Math.random() < 0.3) A.bear(this.pos); else if (this.d.canid && ctx.night && Math.random() < 0.4) A.foxBark(this.pos); }
  // ---- vol
  flush(ctx) { const U = HG.util, D = this.d; this.hidden = false; this.flying = true; this.state = 'fly'; this.stateT = 0; this.alt = 0; const away = Math.atan2(this.pos.z - ctx.player.z, this.pos.x - ctx.player.x) + U.rand(-0.9, 0.9); this.yaw = away; this.vel.set(Math.cos(away) * D.fly * 0.6, D.fly * 0.45, Math.sin(away) * D.fly * 0.6); this.flyT = U.rand(5, 12); HG.audio.flap(this.pos, 1); if (D.vocal === 'cri') HG.audio.pheasant(this.pos); if (D.duck) HG.audio.quack(this.pos, 1, 3); if (this.herd) for (const m of this.herd) if (m !== this && !m.dead && !m.flying) setTimeout(() => { if (!m.dead && !m.flying) m.flush(ctx); }, U.rand(100, 900)); this.awareness = 2; }
  updateFlying(dt, ctx, dist) {
    const U = HG.util, D = this.d, W = this.world; this.headDown = 0;
    const gY = W.height(this.pos.x, this.pos.z); const wantAlt = this.flyPattern === 'circle' ? 28 : this.flyPattern === 'landing' ? 0 : (D.ground ? 6 + Math.min(this.stateT * 2, 10) : 22);
    // direction cible
    if (this.flyPattern === 'circle') { const c = this.flyCenter; const a = Math.atan2(this.pos.z - c.z, this.pos.x - c.x); const want = a + 1.2; const tx = c.x + Math.cos(want) * this.flyR, tz = c.z + Math.sin(want) * this.flyR; this.steer({ x: tx, z: tz }, dt, 1.2); if (ctx.decoyLure && Math.random() < dt * 0.15) { this.flyPattern = 'landing'; this.landAt = { x: ctx.decoyLure.x + U.rand(-8, 8), z: ctx.decoyLure.z + U.rand(-8, 8) }; } }
    else if (this.flyPattern === 'landing') { this.steer(this.landAt, dt, 1.5); const ld = Math.hypot(this.landAt.x - this.pos.x, this.landAt.z - this.pos.z); if (ld < 6 && this.pos.y - gY < 1.5) { this.land(ctx); return; } }
    else { if (this.stateT > this.flyT && D.ground) { this.flyPattern = 'landing'; this.landAt = { x: this.pos.x + Math.cos(this.yaw) * 40, z: this.pos.z + Math.sin(this.yaw) * 40 }; } if (!W.inBounds(this.pos.x, this.pos.z, 80)) this.steer({ x: 0, z: 0 }, dt, 1.5); }
    const spd = D.fly * (this.flyPattern === 'landing' ? 0.6 : 1);
    const targetY = (this.flyPattern === 'landing' ? W.height(this.landAt.x, this.landAt.z) : gY) + wantAlt + (this.flyPattern === 'circle' ? Math.sin(this.phase * 0.5) * 4 : 0);
    const vy = U.clamp((targetY - this.pos.y) * 0.8, -6, 7);
    this.pos.x += Math.cos(this.yaw) * spd * dt; this.pos.z += Math.sin(this.yaw) * spd * dt; this.pos.y += vy * dt;
    const g2 = W.height(this.pos.x, this.pos.z); if (this.pos.y < g2 + 0.5) this.pos.y = g2 + 0.5;
    this.speed = spd; this.glide = vy < -1.5 && this.flyPattern !== 'landing';
    this.animate(dt);
  }
  land(ctx) { this.flying = false; this.flyPattern = null; this.state = 'idle'; this.stateT = 0; this.hidden = !!this.d.ground; this.awareness = 0.3; this.speed = 0; if (this.d.kind === 'water' && this.world.isWater(this.pos.x, this.pos.z)) { this.swim = true; HG.audio.splash(this.pos, 0.6); } }
  startCircling(center, r) { this.flying = true; this.state = 'fly'; this.flyPattern = 'circle'; this.flyCenter = center; this.flyR = r; this.pos.y = this.world.height(this.pos.x, this.pos.z) + 30; this.hidden = false; }
  // ================================================================ DÉGÂTS
  hit(zone, energy, kind, shooterPos, pellets = 1) {
    const U = HG.util, D = this.d; if (this.dead) return null;
    const isShot = kind === 'shot'; const dist = Math.hypot(this.pos.x - shooterPos.x, this.pos.z - shooterPos.z);
    const rec = { zone, energy, kind, dist, sp: this.sp, pellets };
    this.hits.push(rec); this.awareness = 2;
    if (D.kind === 'bird' || D.kind === 'water' || (D.kind === 'small' && isShot)) {
      const e = energy * (zone === 'vital' || zone === 'head' || zone === 'neck' ? 1 : 0.5);
      this.hp -= e * 6; if (this.hp <= 0 || zone === 'head') { this.dieNow(rec, shooterPos); rec.result = 'mort'; } else { this.wounded = true; this.bleed = Math.max(this.bleed, 6); rec.result = 'blessé'; if (this.flying && this.hp < this.maxHp * 0.4) { this.flyPattern = 'landing'; this.landAt = { x: this.pos.x + Math.cos(this.yaw) * 30, z: this.pos.z + Math.sin(this.yaw) * 30 }; } if (!this.flying && !this.dead) { if (D.kind === 'small') { this.state = 'flee'; this.stateT = 0; this.target = this.fleeTarget({ player: shooterPos }); } else this.flush({ player: shooterPos }); } }
      return rec;
    }
    // grand gibier
    let mult = { vital: 1.0, head: 1.6, neck: 1.1, gut: 0.45, rump: 0.3, leg: 0.15 }[zone] || 0.3;
    if (isShot) mult *= 0.12; // plombs sur grand gibier : blessure inutile
    const dmg = energy * mult; this.hp -= dmg;
    const ratio = energy / D.vital;
    if (zone === 'vital' && ratio >= 0.55) { this.deathTimer = ratio >= 1 ? U.rand(0.5, 3.5) : U.rand(4, 12); rec.result = 'mortel'; this.bleed = Math.max(this.bleed, 40); }
    else if ((zone === 'head' || zone === 'neck') && ratio >= 0.35) { this.dieNow(rec, shooterPos); rec.result = 'mort'; return rec; }
    else if (zone === 'gut' && ratio >= 0.4) { this.deathTimer = U.rand(50, 160); rec.result = 'mortel lent'; this.bleed = Math.max(this.bleed, 3); }
    else if (this.hp <= 0) { this.deathTimer = U.rand(1, 5); rec.result = 'mortel'; }
    else { rec.result = 'blessé'; this.bleed = Math.max(this.bleed, zone === 'leg' ? 1.5 : 4); }
    this.wounded = true; this.state = 'flee'; this.stateT = 0; this.target = this.fleeTarget({ player: shooterPos }); this.awareness = 2;
    if (this.herd) for (const m of this.herd) if (m !== this && !m.dead) { m.state = m.state === 'driven' ? 'driven' : 'flee'; m.stateT = 0; m.target = m.fleeTarget({ player: shooterPos }); }
    return rec;
  }
  dieNow(rec, shooterPos) { this.deathTimer = -1; this.die({ player: shooterPos }, 'tir'); }
  die(ctx, cause) {
    if (this.dead) return; this.dead = true; this.alive = false; this.state = 'dead'; this.stateT = 0; this.speed = 0; this.targetSpeed = 0; this.bleed = 0; this.charge = 0; this.deathCause = cause;
    this.fallVel = this.flying ? new THREE.Vector3(Math.cos(this.yaw) * this.speed * 0.5, 2, Math.sin(this.yaw) * this.speed * 0.5) : null; this.wasFlying = this.flying; this.flying = false;
    if (this.onDeath) this.onDeath(this);
    if (!this.wasFlying) HG.audio.thud(this.pos, this.d.kind === 'big' ? 1.5 : 0.6);
  }
  updateDead(dt) {
    const W = this.world; this.fallT += dt;
    if (this.wasFlying) { const gY = W.isWater(this.pos.x, this.pos.z) ? W.waterY : W.height(this.pos.x, this.pos.z); if (this.pos.y > gY + 0.1) { this.fallVel.y -= 9.8 * dt; this.pos.addScaledVector(this.fallVel, dt); this.group.rotation.x += dt * 6; this.group.rotation.z += dt * 4; if (this.pos.y <= gY + 0.1) { this.pos.y = gY + 0.1; if (W.isWater(this.pos.x, this.pos.z)) HG.audio.splash(this.pos, 0.7); else HG.audio.thud(this.pos, 0.5); this.group.rotation.set(0, this.yaw, 0); this.wasFlying = false; this.fallT = 0; } } else this.wasFlying = false; }
    else { const t = Math.min(1, this.fallT / 0.7); const e = t * t * (3 - 2 * t); this.group.rotation.z = e * Math.PI / 2 * 0.95; this.group.position.y = this.pos.y + (1 - e) * 0 - e * this.d.h * this.sizeF * 0.28; }
  }
  // ================================================================ ANIMATION
  animate(dt) {
    const g = this.group, D = this.d, U = HG.util; g.position.set(this.pos.x, this.dead && !this.wasFlying ? g.position.y : this.pos.y, this.pos.z); if (!this.dead) g.rotation.set(0, -this.yaw, 0);
    if (this.flying || this.wasFlying) { g.rotation.z = this.dead ? g.rotation.z : 0; if (!this.dead) g.rotation.x = 0; }
    if (this.dead) { if (this.legs) for (const l of this.legs) if (l.knee) { l.g.rotation.z = 0.4; l.knee.rotation.z = -0.6; } return; }
    const run = this.speed / ((D.run || 10)); const freq = D.kind === 'small' ? 9 : 5.5 + run * 4;
    if (this.legs && this.legs[0] && this.legs[0].knee) { // quadrupède
      const amp = U.clamp(this.speed * (D.kind === 'small' ? 0.7 : 0.35), 0, 1.0); const ph = this.phase * freq * (0.5 + this.speed * 0.15);
      for (let i = 0; i < 4; i++) { const l = this.legs[i]; const p = ph + (l.front ? 0 : Math.PI) + (l.side > 0 ? 0 : Math.PI) * (run > 0.5 ? 0.15 : 1); l.g.rotation.z = Math.sin(p) * amp; l.knee.rotation.z = Math.max(0, -Math.sin(p + 1.2)) * amp * 1.4 * (l.front ? -1 : -1); }
      const bob = Math.abs(Math.sin(ph)) * amp * 0.06; this.parts.body.position.y = D.h * this.sizeF * 0.62 + bob + (run > 0.6 ? Math.sin(ph) * 0.08 * run : 0);
      this.parts.body.rotation.z = run > 0.6 ? Math.sin(ph) * 0.06 * run : 0;
      this.parts.neck.rotation.z = U.lerp(this.parts.neck.rotation.z, -this.headDown * (D.tusks ? 0.5 : 1.1) + (this.state === 'alert' ? 0.35 : 0), dt * 4);
      this.parts.head.rotation.y = this.state === 'alert' ? Math.sin(this.phase * 0.8) * 0.4 : Math.sin(this.phase * 0.3) * 0.1;
      if (this.parts.tail) this.parts.tail.rotation.x = Math.sin(this.phase * 3) * (this.state === 'alert' ? 0.6 : 0.2);
    } else if (this.wings) {
      if (this.flying) { const fl = this.glide ? 0.05 : 1; const a = Math.sin(this.phase * (D.goose ? 9 : D.duck ? 16 : 14)) * 0.8 * fl; for (const w of this.wings) w.g.rotation.x = w.side * a; g.rotation.z = this.flyPattern === 'circle' ? -0.35 : 0; g.rotation.x = 0; this.parts.body.rotation.z = -0.15; }
      else { for (const w of this.wings) w.g.rotation.x = w.side * 0.05; this.parts.body.rotation.z = D.wader ? 0 : 0.15; this.parts.body.position.y = D.h * this.sizeF * 0.55 + (this.swim ? -D.h * this.sizeF * 0.25 : 0) + Math.abs(Math.sin(this.phase * 8)) * this.speed * 0.02; }
      this.parts.neck.rotation.z = U.lerp(this.parts.neck.rotation.z, this.flying ? 0.5 : -this.headDown * 0.9 + (this.state === 'alert' ? 0.5 : 0), dt * 4);
      if (this.legs) for (const l of this.legs) l.g.visible = !this.flying;
    }
  }
  dispose() { this.world.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry && o.geometry !== undefined) { /* géométries partagées possibles : on laisse le GC */ } }); }
};

// =====================================================================================
HG.Animals = class Animals {
  constructor(world, mode, game) {
    this.world = world; this.mode = mode; this.game = game; this.list = []; this.nextId = 1; this.bloods = []; this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0e0e, transparent: true, opacity: 0.85, depthWrite: false });
    this.bloodGeo = new THREE.CircleGeometry(0.12, 7); this.bloodGeo.rotateX(-Math.PI / 2); this.spawnT = 0;
  }
  spawnInitial(player) {
    const M = HG.data.modes[this.mode], U = HG.util; if (!M.spawn || !Object.keys(M.spawn).length) return;
    const total = M.battue ? 0 : this.world.biome === 'montagne' ? 34 : 40;
    let n = 0, guard = 0;
    while (n < total && guard++ < 400) { const sp = U.weighted(M.spawn); const c = this.spawnHerd(sp, player, 120, 650); n += c; }
  }
  spawnHerd(sp, player, minD, maxD, opts = {}) {
    const U = HG.util, D = HG.data.species[sp], W = this.world; let x, z, ok = false;
    for (let t = 0; t < 30 && !ok; t++) {
      const a = opts.angle != null ? opts.angle + U.rand(-0.4, 0.4) : U.rand(0, 6.28), r = U.rand(minD, maxD); x = player.x + Math.cos(a) * r; z = player.z + Math.sin(a) * r;
      if (!W.inBounds(x, z, 60)) continue;
      const wet = W.isWater(x, z);
      if (D.kind === 'water') { if (!wet && !opts.air) continue; }
      else if (wet) continue;
      if (W.biome === 'montagne') { const y = W.height(x, z); if (D.horns && y < 120) continue; if (!D.horns && y > 250) continue; if (W.normal(x, z).y < 0.5) continue; }
      if (D.ground && W.biome === 'plaine' && W.cover(x, z) < 0.2 && Math.random() < 0.6) continue;
      if (D.night && !W.isNight && Math.random() < 0.5 && !opts.force) continue;
      ok = true;
    }
    if (!ok) return 0;
    const count = U.randInt(D.herd[0], D.herd[1]); const herd = [];
    for (let i = 0; i < count; i++) {
      const ax = x + U.rand(-8, 8), az = z + U.rand(-8, 8); if (D.kind !== 'water' && W.isWater(ax, az)) continue;
      const a = new HG.Animal(sp, this.nextId++, ax, az, W, { herd, leader: herd[0] || null }); herd.push(a); this.list.push(a); a.onDeath = (an) => this.game.onAnimalDeath(an);
      if (opts.air && (D.kind === 'water' || D.flyer)) a.startCircling({ x: player.x + U.rand(-60, 60), z: player.z + U.rand(-60, 60) }, U.rand(60, 140));
      if (opts.driven) { a.state = 'driven'; a.stateT = 0; a.driven = opts.driven; }
    }
    return herd.length;
  }
  blood(pos, sp) { const m = new THREE.Mesh(this.bloodGeo, this.bloodMat); m.position.set(pos.x, this.world.height(pos.x, pos.z) + 0.03, pos.z); m.scale.setScalar(1 + Math.random()); this.world.scene.add(m); this.bloods.push({ m, sp, t: 0 }); if (this.bloods.length > 300) { const b = this.bloods.shift(); this.world.scene.remove(b.m); } }
  update(dt, ctx) {
    ctx.blood = (p, sp) => this.blood(p, sp);
    for (const a of this.list) { const d = Math.hypot(a.pos.x - ctx.player.x, a.pos.z - ctx.player.z); a.group.visible = d < 900; if (d > 700 && !a.dead) { a.stateT += dt; continue; } a.update(dt, ctx); }
    // repeuplement progressif loin du joueur
    this.spawnT += dt; const M = HG.data.modes[this.mode];
    const alive = this.list.filter((a) => !a.dead).length;
    if (M.spawn && Object.keys(M.spawn).length && !M.battue && this.spawnT > 18 && alive < 42) { this.spawnT = 0; const sp = HG.util.weighted(M.spawn); const D = HG.data.species[sp]; this.spawnHerd(sp, ctx.player, 250, 600, { air: (D.kind === 'water' || D.flyer) && Math.random() < 0.7 }); }
    // nettoyage des animaux morts ramassés ou très loin
    for (let i = this.list.length - 1; i >= 0; i--) { const a = this.list[i]; if (a.collected || (a.dead && a.stateT > 900)) { a.dispose(); this.list.splice(i, 1); } }
  }
  nearest(pos, pred) { let best = null, bd = 1e9; for (const a of this.list) { if (pred && !pred(a)) continue; const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z); if (d < bd) { bd = d; best = a; } } return { a: best, d: bd }; }
  dispose() { for (const a of this.list) a.dispose(); for (const b of this.bloods) this.world.scene.remove(b.m); this.list = []; }
};
