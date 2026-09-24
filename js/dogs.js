// Chien de chasse : suit le chasseur, arrête le petit gibier, rapporte, suit la voie du sang.
'use strict';
HG.Dog = class Dog {
  constructor(type, world, game) {
    const D = HG.data.dogs[type]; this.type = type; this.d = D; this.world = world; this.game = game; this.role = D.role;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.state = 'heel'; this.stateT = 0; this.active = true; this.flushing = false; this.carry = null; this.target = null; this.barkT = 0; this.phase = 0; this.pointAt = null; this.trackTarget = null; this.cmdT = 0;
    this.group = this.build(); world.scene.add(this.group);
  }
  build() {
    const D = this.d, g = new THREE.Group(); const fur = new THREE.MeshStandardMaterial({ map: HG.tex.fur(D.color, D.color, D.spots ? { patches: D.spots } : {}), roughness: 0.9 }); const dark = new THREE.MeshStandardMaterial({ color: 0x181410 });
    const small = this.type === 'teckel' || this.type === 'jagd' || this.type === 'beagle'; const L = small ? 0.75 : 1.0, H = small ? 0.32 : 0.55; this.L = L; this.H = H;
    const add = (geo, m, x, y, z, parent) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.castShadow = true; (parent || g).add(mm); return mm; };
    const body = new THREE.Group(); body.position.y = H * 0.75; g.add(body); this.body = body;
    const b = add(new THREE.SphereGeometry(1, 12, 9), fur, 0, 0, 0, body); b.scale.set(L * 0.42, H * 0.3, H * 0.3);
    const neck = add(new THREE.CylinderGeometry(H * 0.14, H * 0.18, H * 0.4, 8), fur, L * 0.4, H * 0.15, 0, body); neck.rotation.z = -0.9;
    const head = new THREE.Group(); head.position.set(L * 0.55, H * 0.32, 0); body.add(head); this.head = head;
    add(new THREE.SphereGeometry(H * 0.2, 10, 8), fur, 0, 0, 0, head); const sn = add(new THREE.CylinderGeometry(H * 0.09, H * 0.13, H * 0.3, 8), fur, H * 0.25, -H * 0.05, 0, head); sn.rotation.z = Math.PI / 2 + 0.2; add(new THREE.SphereGeometry(H * 0.05, 6, 5), dark, H * 0.4, -H * 0.05, 0, head);
    for (const s of [-1, 1]) { add(new THREE.SphereGeometry(H * 0.03, 6, 5), dark, H * 0.1, H * 0.08, s * H * 0.12, head); const ear = add(new THREE.BoxGeometry(H * 0.08, H * 0.25, H * 0.03), fur, -H * 0.05, -H * 0.02, s * H * 0.2, head); ear.rotation.x = s * 0.4; }
    this.legs = []; const legL = H * 0.7;
    for (const [lx, lz, f] of [[L * 0.3, H * 0.15, 1], [L * 0.3, -H * 0.15, 1], [-L * 0.3, H * 0.15, 0], [-L * 0.3, -H * 0.15, 0]]) { const leg = new THREE.Group(); leg.position.set(lx, -H * 0.2, lz); body.add(leg); add(new THREE.CylinderGeometry(H * 0.06, H * 0.05, legL, 6), fur, 0, -legL / 2, 0, leg); this.legs.push({ g: leg, f, s: lz > 0 ? 1 : -1 }); }
    const tail = add(new THREE.CylinderGeometry(H * 0.03, H * 0.06, L * 0.4, 6), fur, -L * 0.45, H * 0.15, 0, body); tail.rotation.z = 1.0; this.tail = tail;
    return g;
  }
  say(msg) { if (this.game.feed) this.game.feed('🐕 ' + this.d.name + ' : ' + msg); }
  command(ctx) { // F : ordre selon le rôle
    if (!this.active) return; this.cmdT = 0; const A = HG.animals;
    if (this.state === 'point') { this.state = 'flush'; this.stateT = 0; this.flushing = true; HG.audio.whistle(); this.say('lève le gibier !'); return; }
    if (this.role === 'retriever' || this.role === 'pointer') { const near = A.nearest(this.pos, (a) => a.dead && !a.collected && a.d.kind !== 'big' && !a.retrievedBy); if (near.a && near.d < 140) { this.state = 'fetch'; this.target = near.a; near.a.retrievedBy = this; HG.audio.whistle(); this.say('part rapporter.'); return; } }
    if (this.role === 'tracker') { const near = A.nearest(this.pos, (a) => (a.wounded || a.dead) && !a.collected && a.d.kind === 'big' && !a.retrievedBy); if (near.a && near.d < 400) { this.state = 'track'; this.trackTarget = near.a; HG.audio.whistle(); this.say('prend la voie du sang…'); return; } }
    if (this.role === 'pointer' && this.state === 'heel') { this.state = 'quest'; this.stateT = 0; HG.audio.whistle(); this.say('part en quête.'); return; }
    this.state = 'heel'; this.flushing = false; HG.audio.whistle(); this.say('au pied.');
  }
  update(dt, ctx) {
    const U = HG.util, W = this.world, p = ctx.player; this.stateT += dt; this.phase += dt; this.cmdT += dt;
    if (!this.active) { this.group.visible = false; return; } this.group.visible = true;
    const A = HG.animals; let want = null, spd = 0;
    const dp = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    switch (this.state) {
      case 'heel': { const bx = p.x - Math.cos(ctx.yaw) * 1.5 + Math.sin(ctx.yaw) * 1.2, bz = p.z - Math.sin(ctx.yaw) * 1.5 - Math.cos(ctx.yaw) * 1.2; const d = Math.hypot(bx - this.pos.x, bz - this.pos.z); if (d > 1.2) { want = { x: bx, z: bz }; spd = d > 12 ? 9 : d > 4 ? 4 : 1.6; }
        if (this.role === 'pointer' && ctx.smallGame) { const n = A.nearest(this.pos, (a) => !a.dead && a.hidden && a.d.ground); if (n.a && n.d < 30 * (this.d.range || 1) && Math.random() < dt * 0.5) { this.state = 'point'; this.pointAt = n.a; this.stateT = 0; this.say('marque l\'arrêt !'); } }
        break; }
      case 'quest': { if (!this.target || this.stateT > 12) { const a = ctx.yaw + U.rand(-1.2, 1.2); this.target = { x: p.x + Math.cos(a) * U.rand(15, 40 * (this.d.range || 1)), z: p.z + Math.sin(a) * U.rand(15, 40 * (this.d.range || 1)) }; this.stateT = 0; } want = this.target; spd = 6; if (Math.hypot(want.x - this.pos.x, want.z - this.pos.z) < 2) this.target = null;
        const n = A.nearest(this.pos, (a) => !a.dead && a.hidden && a.d.ground); if (n.a && n.d < 22 * (this.d.range || 1)) { this.state = 'point'; this.pointAt = n.a; this.stateT = 0; this.say('marque l\'arrêt !'); }
        if (dp > 90) this.state = 'heel'; break; }
      case 'point': { const a = this.pointAt; if (!a || a.dead || !a.hidden) { this.state = 'heel'; break; } const d = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z); if (d > 8) { want = a.pos; spd = 2.2; } else { spd = 0; this.yaw = Math.atan2(a.pos.z - this.pos.z, a.pos.x - this.pos.x); } if (this.stateT > 45) { this.state = 'flush'; this.flushing = true; this.stateT = 0; } break; }
      case 'flush': { const a = this.pointAt; if (!a || a.dead || !a.hidden || this.stateT > 6) { this.state = 'heel'; this.flushing = false; break; } want = a.pos; spd = 8; break; }
      case 'fetch': { const a = this.target; if (!a || a.collected) { this.state = 'heel'; this.target = null; break; } if (!this.carry) { want = a.pos; spd = 8; if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 1.2) { this.carry = a; a.group.visible = false; this.say('a le gibier en gueule.'); } } else { want = p; spd = 7; if (dp < 2.2) { const a2 = this.carry; this.carry = null; a2.retrievedBy = null; a2.group.visible = true; a2.pos.set(p.x + Math.cos(ctx.yaw) * 1.5, W.height(p.x + Math.cos(ctx.yaw) * 1.5, p.z + Math.sin(ctx.yaw) * 1.5), p.z + Math.sin(ctx.yaw) * 1.5); a2.group.position.copy(a2.pos); this.state = 'heel'; this.target = null; this.say('rapporte : ' + a2.d.name + '.'); this.game.onRetrieved(a2); } } break; }
      case 'track': { const a = this.trackTarget; if (!a || a.collected) { this.state = 'heel'; break; } if (a.dead) { want = a.pos; spd = 6; if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 2) { spd = 0; if (this.barkT <= 0) { HG.audio.bark(this.pos, this.type === 'teckel' ? 1.3 : 1); this.barkT = 2.5; if (!this.foundSaid) { this.foundSaid = true; this.say('a trouvé l\'animal ! (suivez les aboiements)'); this.game.markFound(a); } } } } else { const bl = this.game.animals.bloods; let near = null, bd = 1e9; for (const b of bl) { if (b.sp !== a.sp) continue; const d = Math.hypot(b.m.position.x - this.pos.x, b.m.position.z - this.pos.z); if (d < bd && d > 1.5) { bd = d; near = b; } } want = near && Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) > 40 ? near.m.position : a.pos; spd = 4.5; if (this.barkT <= 0) { HG.audio.houndBay(this.pos); this.barkT = 4; } } if (dp > 260) { this.state = 'heel'; this.say('revient : trop loin.'); } break; }
    }
    this.barkT -= dt;
    if (want) { const a = Math.atan2(want.z - this.pos.z, want.x - this.pos.x); this.yaw += U.clamp(U.angleDiff(this.yaw, a), -6 * dt, 6 * dt); }
    this.speed = U.lerp(this.speed, spd, dt * 5);
    if (this.speed > 0.05) { const nx = this.pos.x + Math.cos(this.yaw) * this.speed * dt, nz = this.pos.z + Math.sin(this.yaw) * this.speed * dt; if (W.inBounds(nx, nz, 20)) { this.pos.x = nx; this.pos.z = nz; } }
    const wet = W.isWater(this.pos.x, this.pos.z); this.pos.y = wet ? W.waterY - 0.15 : W.height(this.pos.x, this.pos.z);
    // animation
    this.group.position.copy(this.pos); this.group.rotation.set(0, -this.yaw, 0);
    const ph = this.phase * (6 + this.speed * 1.2), amp = U.clamp(this.speed * 0.25, 0, 0.9);
    for (const l of this.legs) l.g.rotation.z = Math.sin(ph + (l.f ? 0 : Math.PI) + (l.s > 0 ? 0 : 0.5)) * amp;
    this.body.position.y = this.H * 0.75 + Math.abs(Math.sin(ph)) * amp * 0.05;
    if (this.state === 'point') { this.body.rotation.z = 0.05; this.head.rotation.z = 0.25; this.tail.rotation.z = 0.05; this.legs[0].g.rotation.z = -0.9; }
    else { this.body.rotation.z = 0; this.head.rotation.z = -0.1 + (this.state === 'track' ? -0.5 : 0); this.tail.rotation.z = 1.0; this.tail.rotation.x = Math.sin(this.phase * 9) * (this.state === 'heel' && this.speed < 0.5 ? 0.5 : 0.15); }
    if (this.carry && this.carry.group) { this.carry.group.visible = true; this.carry.group.position.set(this.pos.x + Math.cos(this.yaw) * this.L * 0.7, this.pos.y + this.H * 0.75, this.pos.z + Math.sin(this.yaw) * this.L * 0.7); this.carry.group.rotation.set(0, -this.yaw + 1.5, 1.5); }
  }
  dispose() { this.world.scene.remove(this.group); }
};
