// Boucle de jeu : session de chasse, interactions, scoring, prélèvements, effets, HUD.
'use strict';
HG.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas; const S = HG.save.get(); this.save = S;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputEncoding = THREE.sRGBEncoding; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality(S.options.quality);
    this.scene = new THREE.Scene(); this.baseFov = S.options.fov || 70; this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.08, 6000); this.scene.add(this.camera);
    this.ui = new HG.UI(this); this.fx = []; this.time = 0; this.running = false; this.paused = false; this.mode = null; this.clock = new THREE.Clock(); this.ctx = {};
    window.addEventListener('resize', () => this.resize()); this.resize();
    this.animate = this.animate.bind(this); requestAnimationFrame(this.animate);
  }
  applyQuality(q) { const pr = q === 'low' ? 0.6 : q === 'medium' ? 0.85 : Math.min(window.devicePixelRatio || 1, 1.6); this.renderer.setPixelRatio(pr); this.renderer.shadowMap.enabled = q !== 'low'; }
  resize() { const w = window.innerWidth, h = window.innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  get eq() { const E = HG.data.equipment, out = {}; for (const id of this.save.equipment) { const e = E[id]; for (const k in e) if (!['name', 'price', 'effect'].includes(k)) out[k] = e[k]; } return out; }
  // ================================================================ SESSION
  startMode(modeId, opts = {}) {
    const D = HG.data, M = D.modes[modeId], U = HG.util; this.stop();
    this.mode = modeId; this.M = M; this.ui.closeAll(); this.ui.showLoading(true);
    setTimeout(() => {
      HG.audio.init();
      const wid = opts.weather && opts.weather !== 'auto' ? opts.weather : U.weighted(modeId === 'lobby' ? { beau: 4, voile: 3, couvert: 1 } : M.map === 'montagne' ? { beau: 4, voile: 3, couvert: 2, neige: 2, vent: 2, brume: 1 } : M.map === 'marais' ? { brume: 4, beau: 2, voile: 3, couvert: 2, pluie: 2, vent: 1 } : M.map === 'boreal' ? { beau: 3, voile: 3, couvert: 2, neige: 3, brume: 1 } : { beau: 3, voile: 3, couvert: 2, brume: 3, pluie: 2, vent: 1 });
      this.world = new HG.World(this.scene, M.map, wid); this.scene.background = null;
      HG.audio.setEcho(M.map === 'montagne' ? 0.6 : M.map === 'foret' || M.map === 'boreal' ? 0.3 : 0.1);
      this.hour = opts.hour != null ? opts.hour : M.hours[0]; this.endHour = M.duration ? this.hour + M.duration : null; this.world.setTime(this.hour);
      this.player = new HG.Player(this.camera, this.canvas, this.world, this.save.options); this.player.holdAim = false; this.player.enabled = true;
      this.player.onLockChange = (locked, failed) => { if (failed) this.hint('Verrouillage souris refusé : cliquez-glissez pour regarder.'); if (!locked && this.running && !this.paused && !this.ui.overlayOpen && !failed && !this.player.dragLook) this.pause(); };
      const sp = this.world.spawnPoint || (modeId === 'lobby' ? { x: 0, z: -12 } : this.pickSpawn()); this.player.pos.set(sp.x, this.world.height(sp.x, sp.z), sp.z); this.player.yaw = modeId === 'lobby' ? Math.PI : U.rand(0, 6.28);
      this.weapons = new HG.Weapons(this); this.weapons.setLoadout(this.allowedLoadout(modeId));
      this.animals = new HG.Animals(this.world, modeId, this); HG.animals = this.animals;
      this.dog = this.save.loadout.dog && this.save.loadout.dog !== 'none' && D.dogs[this.save.loadout.dog] && !M.clay ? new HG.Dog(this.save.loadout.dog, this.world, this) : null;
      if (this.dog) { this.dog.pos.set(sp.x + 1.5, this.world.height(sp.x + 1.5, sp.z), sp.z); }
      this.clays = new HG.Clays(this); this.range = new HG.Range(this);
      this.session = { mode: modeId, bag: [], earned: 0, fines: [], xp: 0, shots: 0, hits: 0, startHour: this.hour, events: [], quota: {}, wounded: 0, licence: M.licence, ended: false, startTime: performance.now() };
      this.ctx = { player: this.player.pos, yaw: 0, wind: this.world.wind, noise: 10, visibility: 1, moving: 0, night: false, scentCover: 0, hour: this.hour, dog: null, eq: this.eq, playerHit: (a) => this.playerHit(a), hint: (t) => this.hint(t), smallGame: false };
      this.animals.spawnInitial(this.player.pos);
      if (HG.Modes[modeId] && HG.Modes[modeId].start) HG.Modes[modeId].start(this);
      this.ui.showLoading(false); this.ui.showHUD(true); this.ui.updateAmmo(); this.ui.buildMinimap(this.world);
      this.running = true; this.paused = false; this.callT = 0; this.excite = 0; this.binoc = false; this.time = 0;
      this.save.last.mode = modeId; if (modeId !== 'lobby') this.save.stats.hunts++; HG.save.write();
      if (!this.player.isTouch) this.player.requestLock();
    }, 60);
  }
  allowedLoadout(modeId) { const S = this.save, D = HG.data; const ids = [S.loadout.primary, S.loadout.secondary].filter((id) => id && D.weapons[id] && S.weapons.includes(id) && D.weaponAllowed(modeId, D.weapons[id])); if (!ids.length) { const any = S.weapons.find((id) => D.weaponAllowed(modeId, D.weapons[id])); if (any) ids.push(any); } return ids; }
  pickSpawn() { const W = this.world, U = HG.util; for (let i = 0; i < 100; i++) { const x = U.rand(-W.half * 0.5, W.half * 0.5), z = U.rand(-W.half * 0.5, W.half * 0.5); if (!W.isWater(x, z) && W.normal(x, z).y > 0.8 && (W.biome !== 'montagne' || W.height(x, z) < 120)) return { x, z }; } return { x: 0, z: 0 }; }
  stop() { this.running = false; if (this.world) { if (HG.Modes[this.mode] && HG.Modes[this.mode].end) HG.Modes[this.mode].end(this); this.animals.dispose(); if (this.dog) this.dog.dispose(); this.weapons.dispose(); this.clays.end(); for (const f of this.fx) this.scene.remove(f.m); this.fx = []; while (this.scene.children.length) this.scene.remove(this.scene.children[0]); this.scene.add(this.camera); this.world = null; HG.audio.stopAll(); } this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); if (this.player) { this.player.enabled = false; this.player.fixed = null; } if (document.pointerLockElement) document.exitPointerLock(); this.ui.showHUD(false); }
  pause() { if (!this.running || this.paused) return; this.paused = true; this.ui.showPause(true); if (document.pointerLockElement) document.exitPointerLock(); }
  resume() { this.paused = false; this.ui.showPause(false); this.ui.closeOverlay(); if (!this.player.isTouch && !this.player.dragLook) this.player.requestLock(); this.clock.getDelta(); }
  feed(msg) { this.ui.feed(msg); }
  hint(msg) { this.ui.hint(msg); }
  fine(amount, reason) { this.session.fines.push({ amount, reason }); this.save.money -= amount; this.save.stats.fines += amount; HG.audio.fail(); this.ui.updateMoney(); }
  // ================================================================ BOUCLE
  animate() {
    requestAnimationFrame(this.animate); const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.running || !this.world) return;
    if (this.paused || this.ui.overlayOpen) { this.renderer.render(this.scene, this.camera); return; }
    this.time += dt; const W = this.world, P = this.player, S = this.session, M = this.M;
    // temps de jeu
    this.hour += dt * M.tscale / 60; if (this.hour >= 24) this.hour -= 24; W.setTime(this.hour);
    if (this.endHour != null && this.hour >= this.endHour && !S.ended) return this.endHunt('Fin de la journée de chasse');
    // actions clavier
    for (const a of P.consumeActions()) this.handleAction(a);
    if (P.mouseDown && this.weapons.slot.w.action === 'semi' && this.weapons.busy <= 0 && this.autoFireOk) { /* semi : un coup par clic */ }
    this.ctx.eq = this.eq; this.ctx.excite = this.excite;
    P.update(dt, this.ctx);
    this.weapons.update(dt, this.ctx);
    // contexte animaux
    const c = this.ctx; c.yaw = -P.yaw + Math.PI / 2; c.player = P.pos; c.noise = P.noise; c.visibility = P.visibility; c.moving = P.moving; c.night = W.isNight; c.hour = this.hour; c.scentCover = this.eq.vis ? 0.15 : 0; c.dog = this.dog && this.dog.active ? { pos: this.dog.pos, active: this.dog.state !== 'heel', flushing: this.dog.flushing } : null; c.dogFlush = this.dog && this.dog.role === 'pointer' && this.dog.state === 'flush';
    this.animals.update(dt, c);
    if (this.dog) this.dog.update(dt, { player: P.pos, yaw: c.yaw, smallGame: c.smallGame });
    this.clays.update(dt);
    if (HG.Modes[this.mode] && HG.Modes[this.mode].update) HG.Modes[this.mode].update(this, dt);
    this.updateFx(dt); this.excite = Math.max(0, this.excite - dt * 4);
    W.update(dt, P.pos, this.camera, M.tscale);
    HG.audio.updateListener(this.camera); HG.audio.setAmbience({ wind: W.wind.speed * (1 + W.wind.gust * 0.3), rain: W.weather.rain, water: W.map.water && W.waterDepth(P.pos.x, P.pos.z) > -2 && W.isWater(P.pos.x + 10, P.pos.z), night: W.isNight });
    if (Math.random() < dt * (W.isNight ? 0.02 : 0.15) && !W.weather.rain) { const a = Math.random() * 6.28; const p = new THREE.Vector3(P.pos.x + Math.cos(a) * 30, P.pos.y + 6, P.pos.z + Math.sin(a) * 30); W.isNight ? HG.audio.owl(p) : HG.audio.birdChirp(p); }
    this.checkInteractions();
    this.ui.updateHUD(dt);
    this.save.stats.playTime += dt;
    this.renderer.render(this.scene, this.camera);
  }
  updateFx(dt) { for (const f of this.fx) { f.t += dt; if (f.still) continue; if (f.vel) { if (f.grav) f.vel.y -= 9.8 * dt; f.m.position.addScaledVector(f.vel, dt); } if (f.grow) f.m.scale.addScalar(f.grow * dt); if (f.m.material && f.m.material.opacity != null && f.m.isSprite) f.m.material.opacity = Math.max(0, 0.5 * (1 - f.t / f.life)); if (f.spin) { f.m.rotation.x += dt * 8; f.m.rotation.y += dt * 6; } } for (let i = this.fx.length - 1; i >= 0; i--) if (this.fx[i].t > this.fx[i].life) { this.scene.remove(this.fx[i].m); this.fx.splice(i, 1); } }
  spawnPuff(pos, color, size) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false })); m.scale.setScalar(size); m.position.copy(pos); this.scene.add(m); this.fx.push({ m, t: 0, life: 0.9, vel: new THREE.Vector3(0, 0.6, 0), grow: size * 1.5 }); }
  // ================================================================ ACTIONS
  handleAction(a) {
    const k = a.key, P = this.player, Wp = this.weapons, A = HG.audio;
    if (k === 'Escape') { if (this.ui.overlayOpen) this.ui.closeOverlay(); else this.pause(); return; }
    if (k === 'Tab') { if (this.mode === 'lobby') this.ui.openHub('chasses'); else this.ui.openHub('carnet'); return; }
    if (k === 'Fire') { if (this.binoc) return; return Wp.handle('Fire'); }
    if (k === 'KeyR') return Wp.handle('KeyR');
    if (k === 'ZoomIn' || k === 'ZoomOut') return Wp.handle(k);
    if (k === 'KeyC' || k === 'ControlLeft') { P.setStance(P.stance === 'crouch' ? 'stand' : 'crouch'); return; }
    if (k === 'KeyZ' || k === 'KeyX') { P.setStance(P.stance === 'prone' ? 'stand' : 'prone'); return; }
    if (k === 'Digit1') { if (Wp.cur !== 0 && Wp.slots.length) { Wp.switchWeapon(); } return; }
    if (k === 'Digit2' || k === 'Digit0') { Wp.switchWeapon(); return; }
    if (k === 'KeyE') return this.interact();
    if (k === 'KeyQ') return this.useCall();
    if (k === 'KeyF') { if (this.dog) this.dog.command(this.ctx); else this.hint('Pas de chien : achetez-en un au chenil.'); return; }
    if (k === 'KeyB') { if (!this.eq.binoc) { this.hint('Achetez des jumelles à l\'armurerie.'); return; } this.binoc = !this.binoc; P.wantAim = false; this.ui.showBinoc(this.binoc); return; }
    if (k === 'KeyM') { this.ui.toggleMap(); return; }
    if (k === 'KeyT') { this.ui.toggleAmmoPanel(); return; }
    if (k === 'Breath') { P.touchBreath = !P.touchBreath; return; }
    if (k === 'KeyL') { const s = Wp.slot; if (s.w.type === 'rifle') { s.zero = s.zero === 100 ? 150 : s.zero === 150 ? 200 : s.zero === 200 ? 300 : s.zero === 300 ? 50 : 100; s.zeroAngle = Wp.computeZero(s); this.save.loadout.zero = s.zero; this.hint('Réglage lunette : zéro à ' + s.zero + ' m'); A.uiClick(); this.ui.updateAmmo(); } return; }
    if (k === 'KeyK') { const ids = Object.keys(HG.data.chokes); const cur = this.save.loadout.choke || 'mod'; const next = ids[(ids.indexOf(cur) + 1) % ids.length]; this.save.loadout.choke = next; this.hint('Choke : ' + HG.data.chokes[next].name); A.uiClick(); this.ui.updateAmmo(); return; }
  }
  checkInteractions() {
    const P = this.player, W = this.world; let best = null, bd = 1e9;
    if (this.clays.session && !this.clays.session.done) { this.ui.showPrompt(this.clays.session.inAir.length ? '' : 'E : PULL'); return; }
    for (const it of W.interact) { const d = Math.hypot(it.x - P.pos.x, it.z - P.pos.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    if (P.fixed) { this.ui.showPrompt('E : descendre du mirador'); this.nearInteract = { type: 'exit' }; return; }
    const dead = this.animals.nearest(P.pos, (a) => a.dead && !a.collected && !a.retrievedBy); if (dead.a && dead.d < 3 && (!best || dead.d < bd)) { this.nearInteract = { type: 'collect', animal: dead.a }; this.ui.showPrompt('E : prélever ' + dead.a.d.name); return; }
    this.nearInteract = best; this.ui.showPrompt(best ? 'E : ' + best.label : '');
  }
  interact() {
    const it = this.nearInteract, P = this.player, W = this.world, A = HG.audio;
    if (this.clays.session && !this.clays.session.done) { if (!this.clays.pull()) { if (this.clays.session.inAir.length) this.hint('Plateau en vol !'); } return; }
    if (!it) return;
    if (it.type === 'exit') { P.fixed = null; const s = this.onMirador; P.pos.set(s.x + Math.sin(s.ry) * 2, W.height(s.x, s.z), s.z + Math.cos(s.ry) * 2); A.footstep('wood'); this.ui.setObjective(this.M.name); return; }
    if (it.type === 'collect') return this.collectAnimal(it.animal);
    if (it.type === 'mirador') { P.fixed = { y: it.y, x: it.x, z: it.z }; P.pos.set(it.x, it.y, it.z); P.setStance('stand'); this.onMirador = W.structures.find((s) => s.type === 'mirador' && s.x === it.x); A.footstep('wood'); this.feed('Installé au mirador : tir stable, visibilité réduite pour le gibier.'); return; }
    if (it.type === 'hutte') { P.pos.set(it.x, it.y, it.z); P.setStance('crouch'); this.feed('Dans la hutte : accroupi, à l\'abri des regards.'); return; }
    if (it.type === 'Armurerie') return this.ui.openHub('armurerie');
    if (it.type === 'Chenil') return this.ui.openHub('chenil');
    if (it.type === 'Bureau des chasses') return this.ui.openHub('chasses');
    if (it.type === 'Poste carabine') { P.pos.set(0, W.height(0, -12), -12); P.yaw = Math.PI; P.pitch = 0; this.hint('Stand 50 → 300 m. L : changer le zéro de la lunette. Sanglier courant à gauche.'); return; }
    if (it.type === 'trap' || it.type === 'skeet' || it.type === 'sporting') { if (this.weapons.slot.w.type !== 'shotgun') { const i = this.weapons.slots.findIndex((s) => s.w.type === 'shotgun'); if (i < 0) { this.hint('Il faut un fusil pour les plateaux (1/2 pour changer d\'arme).'); return; } this.weapons.cur = i; this.weapons.show(); } this.clays.start(it.type, false); return; }
  }
  useCall() {
    const eq = this.eq, A = HG.audio; if (this.callT > 0) return; this.callT = 8; setTimeout(() => { this.callT = 0; }, 8000);
    const calls = this.save.equipment.map((id) => HG.data.equipment[id].call).filter(Boolean); if (!calls.length) { this.hint('Aucun appeau : achetez-en un à l\'armurerie.'); return; }
    const M = this.M; let used = null;
    if (M.water && calls.includes('oie') && Math.random() < 0.4) used = 'oie'; else if (M.water && calls.includes('colvert')) used = 'colvert'; else if (calls.includes('cerf') && (this.mode === 'approche' || this.mode === 'boreal')) used = 'cerf'; else if (calls.includes('chevreuil') && (this.mode === 'approche' || this.mode === 'arc')) used = 'chevreuil'; else if (calls.includes('renard')) used = 'renard'; else used = calls[0];
    if (used === 'colvert') { A.duckCall(); if (HG.Modes.passee.onCall && this.mode === 'passee') HG.Modes.passee.onCall(this); }
    if (used === 'oie') { A.gooseCall(); if (this.mode === 'passee') HG.Modes.passee.onCall(this); }
    if (used === 'cerf') { A.deerCall(); this.attractSpecies(['cerf', 'wapiti', 'orignal'], 400, 0.6); }
    if (used === 'chevreuil') { A.roeCall(); this.attractSpecies(['chevreuil'], 250, 0.7); }
    if (used === 'renard') { A.hareCall(); this.attractSpecies(['renard', 'coyote'], 350, 0.7); }
    this.ctx.noise = 60; this.excite = 5;
  }
  attractSpecies(list, range, chance) { const P = this.player.pos; let n = 0; for (const a of this.animals.list) { if (a.dead || !list.includes(a.sp) || a.state === 'flee') continue; const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z); if (d < range && Math.random() < chance) { a.attract = { x: P.x + HG.util.rand(-20, 20), z: P.z + HG.util.rand(-20, 20) }; a.state = 'walk'; n++; if (a.d.vocal === 'brame') setTimeout(() => HG.audio[a.sp === 'orignal' ? 'moose' : 'brame'](a.pos), 1500); } } if (n) this.feed('👂 Une réponse au loin…'); }
  // ================================================================ ÉVÉNEMENTS DE TIR
  onShotFired(shot, noiseRadius) {
    const P = this.player.pos; this.session.shots++; this.excite = 12;
    for (const a of this.animals.list) { if (a.dead) continue; const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z); if (d < noiseRadius) { a.awareness = Math.max(a.awareness, d < noiseRadius * 0.5 ? 2 : 0.9); if (d < noiseRadius * 0.5 && a.state !== 'driven' && !a.hidden) a.flee(this.ctx, d); } }
    if (HG.Modes[this.mode] && HG.Modes[this.mode].onShot) HG.Modes[this.mode].onShot(this, shot);
  }
  onAnimalHit(a, rec, shot) {
    const S = this.session; if (!shot.counted) { shot.counted = true; S.hits++; this.save.stats.hits++; }
    this.ui.hitmarker(); a.hitBy = shot; a.lastRec = rec;
    const zoneName = { vital: 'cœur / poumons', head: 'tête', neck: 'cou', gut: 'ventre', rump: 'arrière-main', leg: 'patte' }[rec.zone];
    if (a.d.illegal) { const f = a.d.fine || 2000; this.fine(f, 'Tir sur ' + a.d.name + ' (' + a.d.protectedLabel + ')'); this.feed('🚫 ' + a.d.protectedLabel + ' : ' + a.d.name + ' ! Amende ' + HG.util.money(f)); }
    else this.feed(`🎯 Touché : ${a.d.name} — ${zoneName} à ${Math.round(rec.dist)} m (${Math.round(rec.energy)} J) → ${rec.result}`);
    if (rec.result === 'blessé' && a.d.kind === 'big') { S.wounded++; this.save.stats.wounded++; this.hint('Animal blessé : suivez la piste de sang (chien de rouge : F).'); }
    if (rec.kind === 'shot' && a.d.kind === 'big' && !a.finedShot) { a.finedShot = true; this.fine(200, 'Tir à plombs sur grand gibier'); this.feed('🚫 Tir à plombs sur du grand gibier : interdit ! -200 €'); }
    if (shot.weapon === 'c22lr' && a.d.kind === 'big' && !a.fined22) { a.fined22 = true; this.fine(300, 'Calibre non conforme (.22 LR sur grand gibier)'); this.feed('🚫 .22 LR sur du grand gibier : calibre interdit ! -300 €'); }
  }
  onAnimalDeath(a) {
    const P = this.player.pos; const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
    if (!a.hitBy) return; // mort naturelle / chien
    this.feed(`☠️ ${a.d.name} ${a.deathCause === 'blessure' ? 'retrouvé mort' : 'abattu'} à ${Math.round(d)} m. Allez le prélever (E).`); this.world.markers.push({ x: a.pos.x, z: a.pos.z, label: a.d.name, icon: '☠️', temp: true, animal: a });
    if (this.dog && this.dog.role === 'retriever' && a.d.kind !== 'big' && this.dog.state === 'heel') setTimeout(() => { if (this.dog && !a.collected && !a.retrievedBy) this.dog.command(this.ctx); }, 800);
    if (d > 300) this.save.stats.longest = Math.max(this.save.stats.longest, Math.round(d));
  }
  markFound(a) { this.world.markers.push({ x: a.pos.x, z: a.pos.z, label: a.d.name + ' (trouvé)', icon: '🐕', temp: true, animal: a }); }
  onRetrieved(a) { this.collectAnimal(a, true); }
  playerHit(a) { this.player.kick(0.3, 0.3, 8); this.fine(0, ''); this.session.fines.pop(); this.feed('🩸 ' + a.d.name + ' vous a chargé ! Vous êtes blessé : la chasse s\'arrête.'); HG.audio.bear(this.player.pos); this.endHunt('Blessé par un ' + a.d.name); }
  collectAnimal(a, byDog) {
    if (a.collected) return; a.collected = true; const U = HG.util, D = a.d, S = this.session, rec = a.lastRec || { zone: 'gut', dist: 0, result: '' };
    const eq = this.eq; let mult = 1, notes = [];
    if (D.illegal) { const card = { name: D.name, illegal: true, note: D.protectedLabel, money: 0, xp: -100, mass: a.mass }; S.xp -= 100; S.bag.push(card); this.ui.showHarvest(card); a.group.visible = false; return; }
    const zm = { vital: [1.3, 'Tir de cœur : parfait'], head: [1.0, 'Tir de tête'], neck: [1.0, 'Tir de cou'], gut: [0.5, 'Tir de ventre : mauvais placement'], rump: [0.35, 'Tir d\'arrière-main'], leg: [0.3, 'Tir de patte'] }[rec.zone] || [0.5, ''];
    mult *= zm[0]; notes.push(zm[1]);
    if (a.deathCause === 'blessure') { mult *= 0.75; notes.push('Retrouvé après recherche'); }
    const wpn = HG.data.weapons[(a.hitBy || {}).weapon] || {}; const maxD = wpn.type === 'bow' ? 35 : wpn.type === 'shotgun' ? 45 : this.mode === 'montagne' ? 400 : 300;
    if (rec.dist > maxD) { mult *= 0.7; notes.push('Tir trop lointain (' + Math.round(rec.dist) + ' m)'); } else if (rec.dist > maxD * 0.6 && wpn.type === 'rifle') { mult *= 1.1; notes.push('Beau tir à ' + Math.round(rec.dist) + ' m'); }
    if (rec.kind === 'shot' && D.kind === 'big') { mult *= 0.2; notes.push('Plombs sur grand gibier'); }
    if (D.female && a.herd && a.herd.some((m) => m.sp === 'marcassin' && !m.dead)) { this.fine(300, 'Laie suitée abattue'); notes.push('Laie suitée : amende 300 €'); mult *= 0.5; }
    S.quota[a.sp] = (S.quota[a.sp] || 0) + 1; const q = this.M.quota && this.M.quota[a.sp]; if (q != null && S.quota[a.sp] > q) { this.fine(400, 'Quota dépassé : ' + D.name); notes.push('Quota dépassé (-400 €)'); mult *= 0; }
    if (byDog) notes.push('Rapporté par ' + this.dog.d.name);
    const trophyF = 0.7 + a.trophy * 0.9; const money = Math.round(D.value * mult * trophyF * (eq.sell || 1)); const xp = Math.round(D.xp * Math.max(0.3, mult) * (0.8 + a.trophy * 0.4));
    this.save.money += money; S.earned += money; S.xp += xp; this.save.xp += xp; this.save.stats.earned += money; this.save.stats.kills[a.sp] = (this.save.stats.kills[a.sp] || 0) + 1;
    const best = this.save.stats.best[a.sp]; const score = Math.round(a.trophy * 100); if (!best || score > best.score) this.save.stats.best[a.sp] = { score, label: a.trophyLabel(), mass: a.mass, dist: Math.round(rec.dist) };
    const card = { name: D.name, mass: a.mass, trophy: a.trophyLabel(), trophyScore: score, zone: rec.zone, dist: Math.round(rec.dist), money, xp, notes, kind: D.kind, medal: score >= 92 ? 'Or' : score >= 80 ? 'Argent' : score >= 65 ? 'Bronze' : null };
    S.bag.push(card); this.ui.showHarvest(card); HG.audio.cash(); this.ui.updateMoney(); HG.save.write();
    a.group.visible = false; const mi = this.world.markers.findIndex((m) => m.animal === a); if (mi >= 0) this.world.markers.splice(mi, 1);
    const lvlBefore = HG.save.level(); if (HG.save.level() > lvlBefore) HG.audio.fanfare();
  }
  onClaySessionEnd(s) {
    const disc = s.disc, hit = s.hit; let money = 0; const stats = this.save.stats; this.save.stats.claysShot += 25;
    if (s.competition) { const table = { trap: [0, 100, 220, 400], skeet: [0, 120, 260, 500], sporting: [0, 150, 350, 800] }[disc]; money = hit >= 24 ? table[3] : hit >= 20 ? table[2] : hit >= 15 ? table[1] : 0; this.save.money += money; this.session.earned += money; const xp = hit * 8; this.session.xp += xp; this.save.xp += xp; const key = 'best' + disc[0].toUpperCase() + disc.slice(1); stats[key] = Math.max(stats[key] || 0, hit); HG.save.write(); this.ui.updateMoney(); if (money) HG.audio.fanfare(); else HG.audio.fail(); }
    else { HG.audio.fanfare(); }
    this.ui.showClayResult(s, money);
    if (s.competition) setTimeout(() => this.endHunt('Compétition terminée'), 100); else this.clays.session = null;
  }
  endHunt(reason) {
    const S = this.session; if (S.ended) return; S.ended = true; this.running = false; if (document.pointerLockElement) document.exitPointerLock();
    const fines = S.fines.reduce((t, f) => t + f.amount, 0); const lvl = HG.save.level(); HG.save.write();
    if (this.mode === 'lobby') { this.stop(); this.ui.showMainMenu(); return; }
    this.ui.showBilan({ reason, bag: S.bag, earned: S.earned, fines: S.fines, finesTotal: fines, xp: S.xp, shots: S.shots, hits: S.hits, wounded: S.wounded, licence: S.licence, level: lvl, mode: this.M.name, clay: this.clays.session });
  }
  backToCamp() { this.ui.closeAll(); this.startMode('lobby'); }
  hitTargets(p, ray, segLen) { if (this.clays.hitTest(p, ray, segLen)) return true; if (this.range.hitTest(p, ray, segLen)) return true; return false; }
};
