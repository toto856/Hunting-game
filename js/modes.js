// Logique spécifique des modes : battue (traques, ligne, sécurité), passée (vols, appelants), affût (agrainage), etc.
'use strict';
HG.Modes = {};

// ---------------------------------------------------------------- BATTUE
HG.Modes.battue = {
  start(g) {
    const W = g.world, U = HG.util, P = g.player; const s = g.session; s.drive = 0; s.driveState = 'brief'; s.driveT = 0; s.beaters = []; s.lineZ = P.pos.z; s.lineX = P.pos.x; s.excluded = false;
    // postes voisins (piquets + gilets orange)
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0x552200 }); s.posts = [];
    for (const dx of [-45, 45, -90, 90]) { const x = P.pos.x + dx, z = P.pos.z, y = W.height(x, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.7, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a3a })); m.position.set(x, y + 0.85, z); W.scene.add(m); const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), orange); v.position.set(x, y + 1.3, z); W.scene.add(v); const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9b090 })); h.position.set(x, y + 1.75, z); W.scene.add(h); s.posts.push({ x, z, meshes: [m, v, h] }); W.markers.push({ x, z, label: 'Poste voisin', icon: '🟠' }); }
    for (let i = 0; i < 6; i++) s.beaters.push({ x: P.pos.x - 150 + i * 60, z: P.pos.z - 420, hornT: U.rand(4, 12), bayT: U.rand(2, 8) });
    g.ui.setObjective('Battue — briefing : restez à votre poste, angle de 30° obligatoire.');
    g.feed('📯 Le chef de battue rappelle les consignes : tir fichant, jamais dans la ligne (30°), pas de tir vers la traque.');
    g.hint('Attendez le signal de la trompe. Tirez seulement quand l\'animal a dépassé la ligne ou croise devant vous à plus de 30° de la ligne.');
  },
  startDrive(g) {
    const s = g.session, W = g.world, U = HG.util, P = g.player; s.drive++; s.driveState = 'drive'; s.driveT = 0; s.driveLen = 300;
    for (const b of s.beaters) { b.z = P.pos.z - 420; }
    HG.audio.horn(new THREE.Vector3(P.pos.x, P.pos.y + 2, P.pos.z - 400)); g.feed('📯 Traque ' + s.drive + '/3 lancée ! Les chiens sont découplés.'); g.ui.setObjective('Traque ' + s.drive + '/3 — les rabatteurs arrivent du nord');
    const table = { sanglier: 4, laie: 3, marcassin: 2, cerf: 1, biche: 2, chevreuil: 3, renard: 1 }; const n = U.randInt(5, 8);
    for (let i = 0; i < n; i++) { const sp = U.weighted(table); g.animals.spawnHerd(sp, { x: P.pos.x + U.rand(-120, 120), z: P.pos.z - U.rand(120, 380) }, 0, 20, { force: true, driven: { dir: Math.PI / 2, delay: U.rand(10, 120) } }); }
  },
  update(g, dt) {
    const s = g.session, U = HG.util, P = g.player, A = HG.audio; s.driveT += dt;
    if (s.driveState === 'brief' && s.driveT > 12) this.startDrive(g);
    else if (s.driveState === 'drive') {
      for (const b of s.beaters) { b.z += dt * 1.35; b.hornT -= dt; b.bayT -= dt; const pos = new THREE.Vector3(b.x, g.world.height(b.x, b.z) + 1.5, b.z); if (b.hornT <= 0) { b.hornT = U.rand(15, 40); if (Math.random() < 0.4) A.horn(pos); else A.whistle(); } if (b.bayT <= 0) { b.bayT = U.rand(3, 9); A.houndBay(pos); } }
      s.beaterZ = s.beaters[0].z;
      if (s.driveT > s.driveLen || s.beaterZ > P.pos.z - 25) { s.driveState = 'pause'; s.driveT = 0; A.horn(new THREE.Vector3(P.pos.x, P.pos.y + 2, P.pos.z - 30)); g.feed('📯 Fin de traque ' + s.drive + '. Déchargez les armes.'); for (const a of g.animals.list) if (a.state === 'driven') { a.state = 'flee'; a.stateT = 0; a.target = a.fleeTarget({ player: P.pos }); } }
      const near = P.pos.distanceTo(new THREE.Vector3(s.lineX, P.pos.y, s.lineZ)); if (near > 12 && !s.leftPost) { s.leftPost = true; g.feed('⚠️ Vous quittez votre poste : interdit pendant la traque ! (-150 €)'); g.fine(150, 'Poste quitté pendant la traque'); }
      if (near < 6) s.leftPost = false;
    } else if (s.driveState === 'pause') { if (s.drive >= 3) { if (s.driveT > 8) g.endHunt('Fin de la battue'); } else if (s.driveT > 45) this.startDrive(g); else g.ui.setObjective('Pause entre les traques… prochaine dans ' + Math.ceil(45 - s.driveT) + ' s'); }
  },
  onShot(g, shot) {
    const s = g.session, P = g.player; const dir = P.forward(new THREE.Vector3()); const ang = Math.atan2(dir.x, -dir.z); // 0 = nord (-z)
    const toLine = Math.min(Math.abs(HG.util.angleDiff(ang, Math.PI / 2)), Math.abs(HG.util.angleDiff(ang, -Math.PI / 2)));
    if (toLine < Math.PI / 6 && Math.abs(dir.y) < 0.35) { g.fine(500, 'Tir dans la ligne (angle < 30°)'); g.feed('🚫 TIR DANGEREUX dans la ligne des postes ! -500 €'); s.dangerShots = (s.dangerShots || 0) + 1; if (s.dangerShots >= 2) { g.feed('🚫 Exclu de la battue par le chef de ligne.'); g.endHunt('Exclu de la battue (sécurité)'); } }
    else if (s.driveState === 'drive' && Math.abs(ang) < Math.PI / 8 && s.beaterZ > P.pos.z - 130 && dir.y > -0.05) { g.fine(300, 'Tir vers la traque'); g.feed('🚫 Tir en direction des rabatteurs ! -300 €'); }
    if (s.driveState !== 'drive') { g.fine(100, 'Tir hors traque'); g.feed('⚠️ Tir en dehors de la traque : -100 €'); }
  },
  end(g) { const s = g.session; if (s.posts) for (const p of s.posts) for (const m of p.meshes) g.world.scene.remove(m); },
};

// ---------------------------------------------------------------- PASSÉE (gibier d'eau)
HG.Modes.passee = {
  start(g) {
    const W = g.world, P = g.player; const h = W.structures.find((s) => s.type === 'hutte'); if (h) { P.pos.set(h.x, h.y, h.z); P.yaw = -h.ry + Math.PI; } g.session.flightT = 8; g.session.lureT = 0;
    g.ui.setObjective('Passée — attendez les vols, appeau (Q), chien (F) pour rapporter'); g.feed('🦆 Les premiers vols arrivent avec le jour. Cygnes et hérons sont protégés !');
    for (let i = 0; i < 3; i++) g.animals.spawnHerd(HG.util.pick(['colvert', 'sarcelle', 'colvert']), P.pos, 100, 250, { air: true });
  },
  update(g, dt) {
    const s = g.session, U = HG.util, P = g.player; s.flightT -= dt; s.lureT = Math.max(0, s.lureT - dt);
    if (s.flightT <= 0) { s.flightT = U.rand(25, 70) * (g.hour > 8.5 ? 1.8 : 1); const sp = U.weighted({ colvert: 5, sarcelle: 4, oie: 2, cygne: 0.4, heron: 0.5 }); g.animals.spawnHerd(sp, P.pos, 200, 400, { air: true }); if (HG.data.species[sp].vocal === 'cancan') setTimeout(() => HG.audio.quack(new THREE.Vector3(P.pos.x + 200, P.pos.y + 30, P.pos.z), 1, 3), 1500); }
    g.ctx.decoyLure = s.lureT > 0 && g.world.decoys && g.world.decoys.length ? { x: g.world.decoys[0].position.x, z: g.world.decoys[0].position.z } : null;
  },
  onCall(g) { g.session.lureT = 40; g.feed('📯 Appeau : les canards en vol repèrent les appelants.'); },
};

// ---------------------------------------------------------------- AFFÛT
HG.Modes.affut = {
  start(g) {
    const W = g.world, P = g.player; const m = W.structures.find((s) => s.type === 'mirador'); if (m) { P.pos.set(m.x, m.y, m.z); P.fixed = { y: m.y, x: m.x, z: m.z }; P.yaw = -m.ry + Math.PI; P.pitch = -0.15; g.onMirador = m; }
    g.session.boarT = 60; g.ui.setObjective('Affût — silence : les sangliers sortent à la nuit tombée vers l\'agrainage'); g.feed('🌙 Installé au mirador. Attendez la sortie des sangliers ; ne tirez pas les marcassins rayés.');
  },
  update(g, dt) {
    const s = g.session, U = HG.util, W = g.world; s.boarT -= dt * (g.hour > 19.5 ? 1.6 : 0.5) * (g.eq.bait ? 1.5 : 1);
    if (s.boarT <= 0) { s.boarT = U.rand(60, 160); const sp = U.weighted({ sanglier: 4, laie: 4, renard: 2, chevreuil: 1, cerf: 1 }); const b = W.bait; const n = g.animals.spawnHerd(sp, { x: b.x, z: b.z }, 160, 260, { force: true }); if (n) { const herd = g.animals.list.slice(-n); for (const a of herd) a.attract = { x: b.x, z: b.z }; if (HG.data.species[sp].vocal === 'grognement') g.feed('👂 Des grognements dans le fourré…'); } }
    if (W.bait) for (const a of g.animals.list) if (!a.dead && a.d.tusks && a.state === 'idle' && Math.hypot(a.pos.x - W.bait.x, a.pos.z - W.bait.z) > 30 && Math.random() < dt * 0.05) a.attract = { x: W.bait.x, z: W.bait.z };
  },
};

// ---------------------------------------------------------------- NUISIBLES (vols de corvidés / pigeons)
HG.Modes.nuisibles = {
  start(g) { g.session.flightT = 15; g.ui.setObjective('Régulation — renards, corneilles, pigeons, ragondins'); g.feed('🦊 Appeau renard (Q) au crépuscule. Les corneilles passent au-dessus des champs.'); },
  update(g, dt) { const s = g.session, U = HG.util; s.flightT -= dt; if (s.flightT <= 0) { s.flightT = U.rand(30, 80); g.animals.spawnHerd(U.pick(['corneille', 'pigeon', 'pigeon']), g.player.pos, 150, 350, { air: true }); } },
};

// ---------------------------------------------------------------- Modes standards (approche, montagne, arc, petit gibier, bécasse, boréal)
const _std = (obj, msg) => ({ start(g) { g.ui.setObjective(obj); g.feed(msg); if (g.mode === 'petit' || g.mode === 'becasse') g.ctx.smallGame = true; }, update(g, dt) { if (g.mode === 'petit' && Math.random() < dt * 0.01) g.animals.spawnHerd('pigeon', g.player.pos, 150, 300, { air: true }); } });
HG.Modes.approche = _std('Approche — progressez face au vent, tir propre < 150 m', '🦌 Le brame résonne dans la forêt. Observez le vent (flèche) : les cervidés vous sentiront à 250 m.');
HG.Modes.montagne = _std('Montagne — chamois et mouflon en alpage ; bouquetin et marmotte protégés', '🏔️ Compensez l\'angle de tir : en forte pente, visez plus bas que la distance réelle.');
HG.Modes.arc = _std('Chasse à l\'arc — approchez à moins de 30 m', '🏹 Silence absolu. Tir derrière l\'épaule uniquement.');
HG.Modes.petit = _std('Petit gibier — quêtez les haies avec votre chien (F : quête / lever)', '🐓 Marchez le long des haies : le chien marque l\'arrêt, F pour faire lever.');
HG.Modes.becasse = _std('Bécasse — 3 oiseaux maximum, tir instantané entre les arbres', '🪶 La mordorée tient bien devant le chien. Tirez vite mais sûr.');
HG.Modes.boreal = _std('Expédition boréale — orignal, wapiti, ours noir', '🍁 Un ours blessé charge : gardez une cartouche en réserve.');
HG.Modes.lobby = { start(g) { g.ui.setObjective('Camp d\'entraînement — Tab : menu (chasses, armurerie, chenil)'); g.feed('Bienvenue au camp. Stand carabine devant vous, fosse à l\'ouest, skeet à l\'est, parcours au sud.'); }, update() {} };
HG.Modes.trap = { start(g) { g.clays.start('trap', true); }, update() {} };
HG.Modes.skeet = { start(g) { g.clays.start('skeet', true); }, update() {} };
HG.Modes.sporting = { start(g) { g.clays.start('sporting', true); }, update() {} };
