// Plateaux (fosse, skeet, parcours de chasse) et stand carabine (cibles papier, gongs, sanglier courant).
'use strict';
HG.Clays = class Clays {
  constructor(game) {
    this.game = game; this.world = game.world; this.list = []; this.geo = new THREE.CylinderGeometry(0.055, 0.045, 0.028, 16); this.mat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }); this.matBlack = new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.6 });
    this.session = null; this.pullT = 0; this.fragGeo = new THREE.TetrahedronGeometry(0.03);
  }
  // ---------------------------------------------------------------- LANCEMENT
  launch(from, dir, speed, opts = {}) {
    const m = new THREE.Mesh(this.geo, opts.black ? this.matBlack : this.mat); m.castShadow = true; m.position.copy(from); this.world.scene.add(m);
    const c = { m, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), t: 0, hits: 0, alive: true, rabbit: !!opts.rabbit, spin: Math.random() * 6 };
    this.list.push(c); HG.audio.trapLaunch(from); if (this.session) this.session.inAir.push(c);
    return c;
  }
  update(dt) {
    const W = this.world;
    for (const c of this.list) {
      if (!c.alive) continue; c.t += dt;
      if (c.rabbit) { const g = W.height(c.pos.x, c.pos.z); c.vel.y -= 9.81 * dt; c.pos.addScaledVector(c.vel, dt); if (c.pos.y < g + 0.05) { c.pos.y = g + 0.05; c.vel.y = Math.abs(c.vel.y) * 0.4 + (Math.random() < 0.3 ? 2 : 0); c.vel.x *= 0.96; c.vel.z *= 0.96; } c.m.rotation.z += dt * 12; c.m.rotation.x = Math.PI / 2; if (c.t > 6 || Math.hypot(c.vel.x, c.vel.z) < 1) this.remove(c, false); }
      else { c.vel.y -= 9.81 * dt * 0.75; c.vel.multiplyScalar(1 - 0.06 * dt); c.pos.addScaledVector(c.vel, dt); c.m.rotation.y += dt * 20; c.m.rotation.x = 0.35 + Math.sin(c.t * 2) * 0.1; if (c.pos.y < W.height(c.pos.x, c.pos.z) + 0.05) this.remove(c, false); }
      c.m.position.copy(c.pos);
    }
    if (this.session) this.updateSession(dt);
  }
  remove(c, broken) { if (!c.alive) return; c.alive = false; this.world.scene.remove(c.m); if (this.session) { const i = this.session.inAir.indexOf(c); if (i >= 0) this.session.inAir.splice(i, 1); if (!broken && !c.counted) { c.counted = true; this.session.missed++; this.game.feed('Plateau manqué'); this.checkSessionEnd(); } } }
  breakClay(c, p) {
    if (!c.alive) return; c.counted = true; HG.audio.clayBreak(c.pos); this.game.save.stats.clays++;
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(this.fragGeo, c.m.material); f.position.copy(c.pos); this.world.scene.add(f); this.game.fx.push({ m: f, t: 0, life: 1.6, vel: new THREE.Vector3(c.vel.x * 0.5 + (Math.random() - 0.5) * 8, (Math.random()) * 6, c.vel.z * 0.5 + (Math.random() - 0.5) * 8), grav: true, spin: true }); }
    this.remove(c, true);
    if (this.session) { this.session.hit++; this.game.feed('💥 Plateau cassé ! (' + this.session.hit + '/' + this.session.total + ')'); this.game.ui.hitmarker(); this.checkSessionEnd(); } else { this.game.feed('💥 Plateau cassé !'); this.game.ui.hitmarker(); }
  }
  hitTest(p, ray, segLen) {
    for (const c of this.list) { if (!c.alive) continue; const d = ray.ray.distanceToPoint(c.pos); if (d < 0.14 && c.pos.distanceTo(p.prev) <= segLen + 0.2) { c.hits += p.pellets; if (p.kind !== 'shot' || c.hits >= 3) this.breakClay(c, p); return true; } }
    return false;
  }
  // ---------------------------------------------------------------- SESSIONS
  start(discipline, competition) {
    const W = this.world, U = HG.util; this.end();
    const s = { disc: discipline, competition, total: 25, launched: 0, hit: 0, missed: 0, inAir: [], station: 0, perStation: discipline === 'trap' ? 5 : discipline === 'skeet' ? 3 : 8, waiting: false, done: false, pull: null };
    this.session = s;
    if (discipline === 'trap') this.placeAt(W.trapField.posts[0], W.trapField.trench);
    else if (discipline === 'skeet') this.placeAt(W.skeetField.stations[0], { x: W.skeetField.x, z: W.skeetField.z });
    else this.placeAt(W.sportingField.stands[0], { x: W.sportingField.x, z: W.sportingField.z + 60 });
    this.game.feed((competition ? '🏆 Compétition ' : '🎯 Entraînement ') + { trap: 'Fosse', skeet: 'Skeet', sporting: 'Parcours de chasse' }[discipline] + ' : 25 plateaux. Appuyez sur E (PULL) pour lancer.');
    this.game.ui.setObjective(`${{ trap: 'Fosse', skeet: 'Skeet', sporting: 'Parcours' }[discipline]} — poste 1 — 0/25 — E : PULL`);
  }
  placeAt(post, lookAt) { const P = this.game.player; P.pos.set(post.x, this.world.height(post.x, post.z), post.z); P.yaw = Math.atan2(-(lookAt.x - post.x), -(lookAt.z - post.z)); P.pitch = 0.05; P.setStance('stand'); }
  end() { if (!this.session) return; for (const c of this.list) this.remove(c, true); this.session = null; this.game.ui.setObjective(''); }
  pull() {
    const s = this.session, W = this.world, U = HG.util; if (!s || s.done || s.inAir.length || s.launched >= s.total) return false;
    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
    if (s.disc === 'trap') { const t = W.trapField.trench; const from = v3(t.x + U.rand(-4, 4), W.height(t.x, t.z) + 0.9, t.z + 0.9); const a = U.rand(-0.75, 0.75), el = U.rand(0.25, 0.5); this.launch(from, v3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)), U.rand(27, 31)); s.launched++; }
    else if (s.disc === 'skeet') { const F = W.skeetField; const hi = v3(F.high.x, F.high.y + 3.05, F.high.z), lo = v3(F.low.x, F.low.y + 1.05, F.low.z); const center = v3(F.x, W.height(F.x, F.z) + 4.5, F.z - 3); const hd = center.clone().sub(hi).normalize(), ld = center.clone().sub(lo).normalize(); const st = s.station; const dbl = [0, 1, 5, 6, 7].includes(st) && s.launched % 3 === 2; if (dbl && s.launched + 1 < s.total) { this.launch(hi, hd, 23); this.launch(lo, ld, 23); s.launched += 2; } else { this.launch(s.launched % 2 ? lo : hi, s.launched % 2 ? ld : hd, 23); s.launched++; } }
    else { const F = W.sportingField, P = this.game.player; const kinds = ['crossL', 'crossR', 'teal', 'rabbit', 'incoming', 'away', 'battue', 'double']; const k = kinds[(s.launched * 3 + s.station) % kinds.length]; const gy = (x, z) => W.height(x, z); const px = P.pos.x, pz = P.pos.z;
      if (k === 'crossL' || k === 'crossR') { const sgn = k === 'crossL' ? -1 : 1; this.launch(v3(px + sgn * 30, gy(px + sgn * 30, pz + 35) + 1, pz + 35), v3(-sgn * 0.85, 0.3, 0.05), 24); s.launched++; }
      else if (k === 'teal') { this.launch(v3(px + U.rand(-4, 4), gy(px, pz + 28) + 0.5, pz + 28), v3(0, 1, 0.08), 26); s.launched++; }
      else if (k === 'rabbit') { this.launch(v3(px - 22, gy(px - 22, pz + 20) + 0.2, pz + 20), v3(1, 0.05, 0.1), 15, { rabbit: true }); s.launched++; }
      else if (k === 'incoming') { this.launch(v3(px + U.rand(-8, 8), gy(px, pz + 50) + 2, pz + 50), v3(0, 0.55, -1), 22); s.launched++; }
      else if (k === 'away') { this.launch(v3(px + U.rand(-2, 2), gy(px, pz + 6) + 1.2, pz + 6), v3(U.rand(-0.3, 0.3), 0.35, 1), 27); s.launched++; }
      else if (k === 'battue') { this.launch(v3(px - 25, gy(px - 25, pz + 15) + 6, pz + 15), v3(1, 0.05, 0.1), 32, { black: true }); s.launched++; }
      else { this.launch(v3(px + 26, gy(px + 26, pz + 30) + 1, pz + 30), v3(-0.8, 0.35, 0.1), 23); if (s.launched + 1 < s.total) { this.launch(v3(px - 26, gy(px - 26, pz + 30) + 1, pz + 30), v3(0.8, 0.4, 0.05), 23); s.launched += 2; } else s.launched++; }
    }
    s.pullT = 0; return true;
  }
  updateSession(dt) {
    const s = this.session; if (s.done) return; s.pullT = (s.pullT || 0) + dt;
    this.game.ui.setObjective(`${{ trap: 'Fosse', skeet: 'Skeet', sporting: 'Parcours' }[s.disc]} — poste ${s.station + 1} — ${s.hit}/${s.launched} (25) — E : PULL`);
  }
  checkSessionEnd() {
    const s = this.session, W = this.world; if (!s) return;
    const doneCount = s.hit + s.missed; const perSt = s.perStation; const nextStation = Math.min(Math.floor(doneCount / perSt), (s.disc === 'trap' ? 5 : s.disc === 'skeet' ? 8 : 3) - 1);
    if (nextStation !== s.station && doneCount < s.total) { s.station = nextStation; const f = s.disc === 'trap' ? W.trapField.posts[nextStation] : s.disc === 'skeet' ? W.skeetField.stations[nextStation] : W.sportingField.stands[nextStation]; if (f) { this.placeAt(f, s.disc === 'trap' ? W.trapField.trench : s.disc === 'skeet' ? { x: W.skeetField.x, z: W.skeetField.z } : { x: W.sportingField.x, z: W.sportingField.z + 60 }); this.game.feed('➡️ Poste ' + (nextStation + 1)); } }
    if (doneCount >= s.total) { s.done = true; this.game.onClaySessionEnd(s); }
  }
};

HG.Range = class Range {
  constructor(game) { this.game = game; this.world = game.world; this.decals = []; }
  hitTest(p, ray, segLen) {
    const R = this.world.range; if (!R) return false; const objs = [...R.targets, ...R.gongs, R.boar ? R.boar.mesh : null].filter(Boolean);
    const inter = ray.intersectObjects(objs, false); if (!inter.length) return false;
    const i = inter[0], o = i.object, ud = o.userData; const dist = i.point.distanceTo(p.shot.origin);
    if (ud.hitType === 'gong') { HG.audio.gong(i.point); this.game.feed(`🔔 Gong ${ud.dist} m touché !`); this.game.ui.hitmarker(); return true; }
    if (ud.hitType === 'boar') { HG.audio.paper(i.point); const local = o.worldToLocal(i.point.clone()); const dx = local.x - 0.35, dy = local.y - 0.05; const r = Math.hypot(dx * 1.3, dy); const score = r < 0.08 ? 10 : r < 0.16 ? 8 : r < 0.25 ? 6 : r < 0.4 ? 3 : 1; this.game.feed(`🐗 Sanglier courant : ${score} pts (${Math.round(dist)} m)`); this.game.ui.hitmarker(); this.decal(i.point, o); return true; }
    if (ud.hitType === 'target') { HG.audio.paper(i.point); const local = o.worldToLocal(i.point.clone()); const r = Math.hypot(local.x, local.y); const ring = Math.max(0, 10 - Math.floor(r / 0.06)); const clock = Math.round((Math.atan2(local.y, -local.x) / (Math.PI * 2) * 12 + 15) % 12) || 12; const cm = Math.round(r * 100); this.game.feed(`🎯 Cible ${ud.dist} m : ${ring > 0 ? ring + ' pts' : 'hors cible'} — ${cm} cm à ${clock} h`); this.game.ui.hitmarker(); this.decal(i.point, o); if (this.game.mode === 'lobby') this.game.session.rangeScore = (this.game.session.rangeScore || 0) + ring; return true; }
    return false;
  }
  decal(point, o) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })); const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())); m.position.copy(point).addScaledVector(n, 0.004); m.lookAt(point.clone().add(n)); this.world.scene.add(m); this.decals.push(m); if (this.decals.length > 120) this.world.scene.remove(this.decals.shift()); }
};
