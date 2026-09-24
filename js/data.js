// Données du jeu : espèces, armes, munitions, optiques, chiens, équipement, territoires, modes.
'use strict';

HG.data = (() => {
  // ------------------------------------------------------------------ ESPÈCES
  // kind: 'big' (grand gibier), 'small' (petit gibier), 'bird' (oiseau), 'water' (gibier d'eau)
  // vital: résistance (énergie J nécessaire pour un tir vital propre)
  const species = {
    cerf:      { name: 'Cerf élaphe', kind: 'big', len: 2.2, h: 1.35, mass: [120, 240], walk: 1.2, run: 11, colors: ['#6f5232', '#8a6a44'], belly: '#b79b73', antlers: true, herd: [1, 6], sight: 90, hear: 110, smell: 260, value: 900, xp: 180, vital: 2200, trophy: 'Bois (cors)', legal: true, night: false, vocal: 'brame', danger: 0 },
    biche:     { name: 'Biche', kind: 'big', len: 1.9, h: 1.2, mass: [80, 130], walk: 1.2, run: 11, colors: ['#7a5a3a', '#8f7250'], belly: '#c0a684', antlers: false, herd: [2, 8], sight: 95, hear: 110, smell: 260, value: 380, xp: 90, vital: 1600, trophy: 'Poids', legal: true, female: true },
    daim:      { name: 'Daim', kind: 'big', len: 1.6, h: 0.95, mass: [55, 95], walk: 1.1, run: 10, colors: ['#9a7147', '#a37b52'], belly: '#d9c39c', spots: true, antlers: 'palmes', herd: [2, 7], sight: 90, hear: 100, smell: 220, value: 520, xp: 120, vital: 1500, trophy: 'Palmes' },
    chevreuil: { name: 'Chevreuil', kind: 'big', len: 1.2, h: 0.72, mass: [18, 32], walk: 1.0, run: 10, colors: ['#9e6d40', '#b07c4a'], belly: '#e8d7b5', antlers: 'small', herd: [1, 3], sight: 80, hear: 100, smell: 200, value: 320, xp: 80, vital: 900, trophy: 'Bois (pointes)', vocal: 'aboiement' },
    chevrette: { name: 'Chevrette', kind: 'big', len: 1.15, h: 0.7, mass: [16, 26], walk: 1.0, run: 10, colors: ['#a3713f', '#b58452'], belly: '#eadcbb', herd: [1, 3], sight: 80, hear: 100, smell: 200, value: 160, xp: 45, vital: 800, trophy: 'Poids', female: true },
    sanglier:  { name: 'Sanglier', kind: 'big', len: 1.5, h: 0.85, mass: [50, 140], walk: 1.2, run: 10, colors: ['#3a2c22', '#4a3a2c'], belly: '#5b4a3a', tusks: true, herd: [1, 8], sight: 45, hear: 110, smell: 300, value: 600, xp: 150, vital: 2000, trophy: 'Défenses (cm)', night: true, danger: 1, vocal: 'grognement' },
    laie:      { name: 'Laie', kind: 'big', len: 1.35, h: 0.75, mass: [45, 95], walk: 1.2, run: 10, colors: ['#3e3026', '#4c3c2f'], belly: '#5d4c3d', herd: [3, 9], sight: 45, hear: 110, smell: 300, value: 350, xp: 90, vital: 1600, trophy: 'Poids', night: true, female: true, vocal: 'grognement' },
    marcassin: { name: 'Marcassin', kind: 'big', len: 0.7, h: 0.4, mass: [8, 20], walk: 1.2, run: 8, colors: ['#8b6a3e', '#a58252'], belly: '#c9a877', stripes: true, herd: [3, 6], sight: 40, hear: 90, smell: 200, value: 0, xp: 0, vital: 500, protectedLabel: 'Tir interdit (marcassin rayé)', illegal: true },
    chamois:   { name: 'Chamois', kind: 'big', len: 1.2, h: 0.78, mass: [25, 45], walk: 1.1, run: 9, colors: ['#5a4a3a', '#7a6a55'], belly: '#c7b89b', horns: 'hook', herd: [2, 9], sight: 140, hear: 110, smell: 240, value: 700, xp: 170, vital: 900, trophy: 'Cornes (cm)' },
    mouflon:   { name: 'Mouflon', kind: 'big', len: 1.25, h: 0.75, mass: [30, 55], walk: 1.1, run: 9, colors: ['#6b4a2e', '#8a6a48'], belly: '#e0d3b8', horns: 'curl', herd: [3, 10], sight: 150, hear: 100, smell: 220, value: 850, xp: 190, vital: 1000, trophy: 'Enroulement (cm)' },
    bouquetin: { name: 'Bouquetin des Alpes', kind: 'big', len: 1.5, h: 0.9, mass: [70, 110], walk: 1.0, run: 8, colors: ['#8a7a62', '#a29377'], belly: '#d9cdb3', horns: 'big', herd: [2, 6], sight: 150, hear: 100, smell: 200, value: 0, xp: 0, vital: 1500, protectedLabel: 'ESPÈCE PROTÉGÉE', illegal: true, fine: 3000 },
    marmotte:  { name: 'Marmotte', kind: 'small', len: 0.55, h: 0.25, mass: [4, 7], walk: 0.6, run: 5, colors: ['#8b7148', '#a68a5c'], belly: '#d6c19a', herd: [1, 3], sight: 120, hear: 90, smell: 60, value: 0, xp: 0, vital: 200, protectedLabel: 'Tir interdit ici', illegal: true, fine: 800, vocal: 'siffle' },
    orignal:   { name: 'Orignal', kind: 'big', len: 2.9, h: 1.9, mass: [350, 600], walk: 1.3, run: 12, colors: ['#3a2a1c', '#4d3a28'], belly: '#6a5745', antlers: 'moose', herd: [1, 2], sight: 60, hear: 120, smell: 320, value: 1800, xp: 400, vital: 3200, trophy: 'Envergure (cm)' },
    wapiti:    { name: 'Wapiti', kind: 'big', len: 2.5, h: 1.5, mass: [220, 380], walk: 1.3, run: 12, colors: ['#8a6a44', '#a58860'], belly: '#d8c5a0', antlers: true, herd: [2, 10], sight: 100, hear: 110, smell: 280, value: 1400, xp: 320, vital: 2800, trophy: 'Bois (cors)', vocal: 'brame' },
    ours:      { name: 'Ours noir', kind: 'big', len: 1.7, h: 1.0, mass: [90, 250], walk: 1.0, run: 12, colors: ['#151210', '#231d18'], belly: '#2b241e', herd: [1, 1], sight: 50, hear: 100, smell: 400, value: 2200, xp: 450, vital: 3000, trophy: 'Crâne (cm)', danger: 2, bear: true },
    coyote:    { name: 'Coyote', kind: 'small', len: 1.1, h: 0.55, mass: [10, 18], walk: 1.2, run: 14, colors: ['#9a8562', '#b09a72'], belly: '#e2d6bc', herd: [1, 3], sight: 120, hear: 140, smell: 300, value: 220, xp: 70, vital: 500, trophy: 'Poids', night: true, canid: true },
    renard:    { name: 'Renard roux', kind: 'small', len: 0.75, h: 0.4, mass: [4, 9], walk: 1.2, run: 13, colors: ['#c1602a', '#d17838'], belly: '#f2e7d6', herd: [1, 1], sight: 110, hear: 140, smell: 280, value: 120, xp: 50, vital: 350, trophy: 'Poids', night: true, canid: true },
    lievre:    { name: 'Lièvre d\'Europe', kind: 'small', len: 0.6, h: 0.28, mass: [3, 5.5], walk: 0.6, run: 15, colors: ['#9b7d55', '#b09265'], belly: '#eee4d0', herd: [1, 2], sight: 90, hear: 130, smell: 80, value: 90, xp: 35, vital: 200, trophy: 'Poids', hare: true },
    lapin:     { name: 'Lapin de garenne', kind: 'small', len: 0.4, h: 0.2, mass: [1.2, 2], walk: 0.5, run: 10, colors: ['#8a7358', '#a08865'], belly: '#e8dfcc', herd: [2, 6], sight: 70, hear: 110, smell: 60, value: 40, xp: 18, vital: 120, trophy: 'Poids', hare: true },
    ragondin:  { name: 'Ragondin', kind: 'small', len: 0.6, h: 0.25, mass: [5, 9], walk: 0.5, run: 4, colors: ['#5a4530', '#6e5638'], belly: '#8e7658', herd: [1, 4], sight: 40, hear: 60, smell: 60, value: 60, xp: 25, vital: 250, trophy: 'Poids', aquatic: true },
    faisan:    { name: 'Faisan de Colchide', kind: 'bird', len: 0.8, h: 0.35, mass: [1, 1.5], walk: 0.6, fly: 16, colors: ['#8b3a1a', '#c4712a'], belly: '#5a2a10', herd: [1, 4], sight: 60, hear: 80, smell: 20, value: 55, xp: 25, vital: 60, trophy: 'Poids', ground: true, longtail: true, vocal: 'cri' },
    perdrix:   { name: 'Perdrix rouge', kind: 'bird', len: 0.35, h: 0.2, mass: [0.4, 0.55], walk: 0.6, fly: 17, colors: ['#8c6a4a', '#a3795a'], belly: '#d9b892', herd: [4, 12], sight: 60, hear: 80, smell: 20, value: 45, xp: 22, vital: 40, trophy: 'Compagnie', ground: true },
    becasse:   { name: 'Bécasse des bois', kind: 'bird', len: 0.35, h: 0.18, mass: [0.28, 0.35], walk: 0.4, fly: 14, colors: ['#6e5136', '#8a6a48'], belly: '#c9b090', herd: [1, 1], sight: 50, hear: 70, smell: 10, value: 110, xp: 45, vital: 35, trophy: 'Mordorée', ground: true, longbeak: true },
    pigeon:    { name: 'Pigeon ramier', kind: 'bird', len: 0.4, h: 0.18, mass: [0.45, 0.55], walk: 0.4, fly: 20, colors: ['#6e7280', '#8b8f9d'], belly: '#b9a9b0', herd: [3, 12], sight: 80, hear: 60, smell: 10, value: 25, xp: 12, vital: 40, trophy: 'Poids', flyer: true },
    corneille: { name: 'Corneille noire', kind: 'bird', len: 0.45, h: 0.2, mass: [0.45, 0.6], walk: 0.4, fly: 15, colors: ['#151515', '#222'], belly: '#1c1c1c', herd: [2, 8], sight: 120, hear: 80, smell: 10, value: 15, xp: 10, vital: 40, trophy: 'Régulation', flyer: true, vocal: 'croasse' },
    colvert:   { name: 'Canard colvert', kind: 'water', len: 0.55, h: 0.22, mass: [1, 1.4], walk: 0.4, fly: 20, colors: ['#5c4a36', '#2f6b3a'], belly: '#c9c0b0', herd: [3, 10], sight: 70, hear: 70, smell: 10, value: 50, xp: 25, vital: 45, trophy: 'Poids', duck: true, vocal: 'cancan' },
    sarcelle:  { name: 'Sarcelle d\'hiver', kind: 'water', len: 0.36, h: 0.16, mass: [0.3, 0.4], walk: 0.4, fly: 25, colors: ['#7a5b3a', '#4b6f3f'], belly: '#d8cfc0', herd: [4, 14], sight: 70, hear: 70, smell: 10, value: 45, xp: 24, vital: 30, trophy: 'Poids', duck: true },
    oie:       { name: 'Oie cendrée', kind: 'water', len: 0.85, h: 0.35, mass: [3, 4.5], walk: 0.5, fly: 19, colors: ['#8e8778', '#a39c8c'], belly: '#d9d3c4', herd: [4, 12], sight: 90, hear: 80, smell: 10, value: 95, xp: 40, vital: 90, trophy: 'Poids', duck: true, goose: true, vocal: 'cacarde' },
    cygne:     { name: 'Cygne tuberculé', kind: 'water', len: 1.4, h: 0.6, mass: [9, 13], walk: 0.5, fly: 18, colors: ['#f2f0ea', '#f7f5f0'], belly: '#ffffff', herd: [2, 4], sight: 90, hear: 80, smell: 10, value: 0, xp: 0, vital: 120, duck: true, goose: true, protectedLabel: 'ESPÈCE PROTÉGÉE', illegal: true, fine: 1500 },
    heron:     { name: 'Héron cendré', kind: 'water', len: 0.95, h: 0.9, mass: [1.5, 2], walk: 0.3, fly: 12, colors: ['#8d949a', '#b7bcc0'], belly: '#e2e4e6', herd: [1, 1], sight: 100, hear: 80, smell: 10, value: 0, xp: 0, vital: 60, protectedLabel: 'ESPÈCE PROTÉGÉE', illegal: true, fine: 1500, wader: true },
  };

  // ------------------------------------------------------------------ ARMES
  // type: shotgun | rifle | bow ; action: pump | semi | break2 | bolt | lever | double | bow
  // mv: vitesse initiale (m/s), moa: précision, cal: calibre / munition
  const weapons = {
    // Fusils
    pompe12:    { name: 'Fusil à pompe cal.12', type: 'shotgun', action: 'pump', cal: 'c12', cap: 4, price: 0, weight: 3.4, choke: true, desc: 'Fiable et polyvalent. Le fusil de tous les débuts.', tier: 0 },
    superpose12:{ name: 'Superposé cal.12', type: 'shotgun', action: 'break2', cal: 'c12', cap: 2, price: 1450, weight: 3.3, choke: true, desc: 'Deux coups, deux chokes. Le classique du ball-trap et de la battue.', tier: 1 },
    juxtapose12:{ name: 'Juxtaposé cal.12 « Bécassier »', type: 'shotgun', action: 'break2', cal: 'c12', cap: 2, price: 2100, weight: 2.9, choke: true, desc: 'Léger et vif, idéal pour le bois et le petit gibier devant soi.', tier: 1 },
    semi12:     { name: 'Semi-automatique cal.12', type: 'shotgun', action: 'semi', cal: 'c12', cap: 3, price: 1650, weight: 3.5, choke: true, desc: 'Trois coups rapides, recul adouci. Excellent à la passée.', tier: 1 },
    superpose20:{ name: 'Superposé cal.20', type: 'shotgun', action: 'break2', cal: 'c20', cap: 2, price: 1900, weight: 2.7, choke: true, desc: 'Fin et léger, un plaisir pour la bécasse et la perdrix.', tier: 2 },
    trap12:     { name: 'Fusil de Trap « Compétition »', type: 'shotgun', action: 'break2', cal: 'c12', cap: 2, price: 4200, weight: 3.8, choke: true, desc: 'Canons longs, bande haute : conçu pour les plateaux.', tier: 2, trap: true },
    // Carabines
    c22lr:      { name: 'Carabine .22 LR', type: 'rifle', action: 'bolt', cal: 'r22', cap: 10, price: 350, weight: 2.5, mv: 380, moa: 1.5, scope: true, desc: 'Petit calibre pour les nuisibles et le stand à 50 m.', tier: 0 },
    c243:       { name: 'Carabine à verrou .243 Win', type: 'rifle', action: 'bolt', cal: 'r243', cap: 4, price: 1300, weight: 3.2, mv: 900, moa: 0.8, scope: true, desc: 'Tendue et précise : chevreuil, chamois, renard.', tier: 1 },
    c270:       { name: 'Carabine à verrou .270 Win', type: 'rifle', action: 'bolt', cal: 'r270', cap: 4, price: 1550, weight: 3.3, mv: 880, moa: 0.9, scope: true, desc: 'La carabine de montagne par excellence.', tier: 1 },
    c308:       { name: 'Carabine à verrou .308 Win', type: 'rifle', action: 'bolt', cal: 'r308', cap: 4, price: 1400, weight: 3.4, mv: 820, moa: 1.0, scope: true, desc: 'Polyvalente : approche, affût, cerf et sanglier.', tier: 1 },
    c3006:      { name: 'Carabine à verrou .30-06', type: 'rifle', action: 'bolt', cal: 'r3006', cap: 4, price: 1600, weight: 3.5, mv: 850, moa: 1.0, scope: true, desc: 'Le calibre universel du grand gibier.', tier: 1 },
    semi3006:   { name: 'Semi-auto .30-06 « Battue »', type: 'rifle', action: 'semi', cal: 'r3006', cap: 5, price: 2400, weight: 3.6, mv: 840, moa: 1.6, scope: true, desc: 'Réarmement instantané pour le gibier lancé.', tier: 2 },
    express93:  { name: 'Express juxtaposé 9,3x74R', type: 'rifle', action: 'double', cal: 'r93', cap: 2, price: 5800, weight: 3.9, mv: 700, moa: 1.8, scope: true, desc: 'Deux coups lourds : le sanglier de battue et l\'ours.', tier: 3 },
    c300:       { name: 'Carabine .300 Win Mag', type: 'rifle', action: 'bolt', cal: 'r300', cap: 3, price: 3900, weight: 3.9, mv: 920, moa: 0.6, scope: true, desc: 'Longue portée : montagne et grands cervidés.', tier: 3 },
    c65:        { name: 'Carabine 6,5 Creedmoor « Précision »', type: 'rifle', action: 'bolt', cap: 5, cal: 'r65', price: 3200, weight: 4.1, mv: 830, moa: 0.5, scope: true, desc: 'La plus précise du catalogue. Tir lointain en montagne.', tier: 3 },
    lever4570:  { name: 'Lever-action .45-70', type: 'rifle', action: 'lever', cal: 'r4570', cap: 4, price: 1900, weight: 3.3, mv: 560, moa: 2.0, scope: true, desc: 'Coup de masse à courte distance. Orignal et ours en forêt.', tier: 2 },
    // Arc
    arc:        { name: 'Arc à poulies 60 lb', type: 'bow', action: 'bow', cal: 'fleche', cap: 1, price: 900, weight: 2.0, mv: 95, moa: 3, desc: 'Silencieux. Tir éthique à moins de 30 m.', tier: 1 },
  };

  // ------------------------------------------------------------------ MUNITIONS
  // pellets : nombre de plombs, pmass en g par plomb ; energy : J à la bouche pour balles
  const ammo = {
    c12_p75:  { name: 'Cal.12 plomb n°7,5 (ball-trap)', cal: 'c12', kind: 'shot', pellets: 380, pmass: 0.09, mv: 400, price: 9, box: 25, for: 'Plateaux, bécasse' },
    c12_p6:   { name: 'Cal.12 plomb n°6 (petit gibier)', cal: 'c12', kind: 'shot', pellets: 260, pmass: 0.13, mv: 400, price: 11, box: 25, for: 'Faisan, perdrix, lapin, lièvre' },
    c12_p4:   { name: 'Cal.12 acier n°4 (gibier d\'eau)', cal: 'c12', kind: 'shot', pellets: 190, pmass: 0.17, mv: 420, price: 14, box: 25, for: 'Canards (acier obligatoire en zone humide)' },
    c12_p2:   { name: 'Cal.12 acier n°2 (oies)', cal: 'c12', kind: 'shot', pellets: 120, pmass: 0.28, mv: 420, price: 16, box: 25, for: 'Oies, renard' },
    c12_slug: { name: 'Cal.12 balle Brenneke', cal: 'c12', kind: 'slug', pellets: 1, pmass: 28, mv: 430, price: 22, box: 10, for: 'Sanglier en battue (< 50 m)' },
    c20_p7:   { name: 'Cal.20 plomb n°7', cal: 'c20', kind: 'shot', pellets: 250, pmass: 0.1, mv: 390, price: 10, box: 25, for: 'Bécasse, perdrix' },
    c20_p5:   { name: 'Cal.20 plomb n°5', cal: 'c20', kind: 'shot', pellets: 170, pmass: 0.15, mv: 390, price: 12, box: 25, for: 'Faisan, lièvre' },
    r22:      { name: '.22 LR 40 gr', cal: 'r22', kind: 'bullet', mass: 2.6, mv: 380, bc: 0.12, price: 6, box: 50 },
    r243:     { name: '.243 Win 95 gr', cal: 'r243', kind: 'bullet', mass: 6.2, mv: 900, bc: 0.39, price: 32, box: 20 },
    r270:     { name: '.270 Win 130 gr', cal: 'r270', kind: 'bullet', mass: 8.4, mv: 880, bc: 0.43, price: 38, box: 20 },
    r308:     { name: '.308 Win 150 gr', cal: 'r308', kind: 'bullet', mass: 9.7, mv: 820, bc: 0.41, price: 36, box: 20 },
    r3006:    { name: '.30-06 165 gr', cal: 'r3006', kind: 'bullet', mass: 10.7, mv: 850, bc: 0.45, price: 40, box: 20 },
    r93:      { name: '9,3x74R 286 gr', cal: 'r93', kind: 'bullet', mass: 18.5, mv: 700, bc: 0.38, price: 75, box: 20 },
    r300:     { name: '.300 WM 180 gr', cal: 'r300', kind: 'bullet', mass: 11.7, mv: 920, bc: 0.5, price: 58, box: 20 },
    r65:      { name: '6,5 Creedmoor 140 gr', cal: 'r65', kind: 'bullet', mass: 9.1, mv: 830, bc: 0.6, price: 48, box: 20 },
    r4570:    { name: '.45-70 300 gr', cal: 'r4570', kind: 'bullet', mass: 19.4, mv: 560, bc: 0.2, price: 52, box: 20 },
    fleche:   { name: 'Flèche carbone lame de chasse', cal: 'fleche', kind: 'arrow', mass: 28, mv: 95, bc: 0.9, price: 15, box: 6 },
  };

  const chokes = {
    cyl:  { name: 'Lisse (Cylindrique)', spread: 1.35 },
    imp:  { name: '¼ (Improved)', spread: 1.15 },
    mod:  { name: '½ (Modified)', spread: 1.0 },
    full: { name: 'Full', spread: 0.72 },
  };

  const optics = {
    none:   { name: 'Organes de visée', zoom: [1], price: 0 },
    reddot: { name: 'Point rouge', zoom: [1], price: 380, reticle: 'dot', desc: 'Vision ouverte, idéal en battue.' },
    s16:    { name: 'Lunette 1-6x24', zoom: [1, 2, 4, 6], price: 750, reticle: 'duplex', desc: 'Battue et affût en forêt.' },
    s39:    { name: 'Lunette 3-9x42', zoom: [3, 5, 7, 9], price: 620, reticle: 'duplex', desc: 'La lunette d\'approche classique.' },
    s416:   { name: 'Lunette 4-16x50', zoom: [4, 8, 12, 16], price: 1450, reticle: 'mildot', desc: 'Montagne et longue distance, réticule mildot.' },
    s525:   { name: 'Lunette 5-25x56', zoom: [5, 10, 18, 25], price: 2900, reticle: 'mildot', desc: 'Tir lointain extrême.' },
    night:  { name: 'Lunette 3-12x56 « Crépuscule »', zoom: [3, 6, 9, 12], price: 1900, reticle: 'duplex', desc: 'Objectif 56 mm : très lumineuse pour l\'affût.', lowlight: true },
  };

  const dogs = {
    none:      { name: 'Sans chien', price: 0 },
    labrador:  { name: 'Labrador retriever', role: 'retriever', price: 900, color: '#d9b878', desc: 'Rapporte le gibier tombé, même dans l\'eau.' },
    epagneul:  { name: 'Épagneul breton', role: 'pointer', price: 1100, color: '#e8e0d0', spots: '#b25a2a', desc: 'Chien d\'arrêt : marque le petit gibier caché, le lève sur ordre et rapporte.' },
    setter:    { name: 'Setter anglais', role: 'pointer', price: 1400, color: '#f2efe8', spots: '#3a3a3a', desc: 'Grande quête, arrêt ferme à longue distance. Roi de la bécasse.', range: 1.5 },
    beagle:    { name: 'Beagle', role: 'tracker', price: 700, color: '#c58a4a', spots: '#f4efe4', desc: 'Chien courant : suit la voie du gibier blessé en donnant de la voix.' },
    teckel:    { name: 'Teckel « chien de rouge »', role: 'tracker', price: 1300, color: '#5a3a22', desc: 'Spécialiste de la recherche au sang, ne lâche jamais une piste.', range: 1.4 },
    jagd:      { name: 'Jagdterrier', role: 'tracker', price: 950, color: '#1e1a18', spots: '#8a5a3a', desc: 'Petit teigneux de battue, tient le sanglier au ferme.' },
  };

  const equipment = {
    camo:      { name: 'Tenue camouflage forêt', price: 420, effect: 'Visibilité -30 %', vis: 0.7 },
    camoNeige: { name: 'Tenue de montagne', price: 650, effect: 'Visibilité -25 %, endurance +20 % en pente', vis: 0.75, mountain: true },
    waders:    { name: 'Waders', price: 180, effect: 'Marche dans l\'eau sans ralentir', waders: true },
    jumelles:  { name: 'Jumelles 10x42', price: 350, effect: 'Observation x10', binoc: 10 },
    telemetre: { name: 'Jumelles télémètre 10x42 LRF', price: 1200, effect: 'Distance exacte et angle de tir', binoc: 10, lrf: true },
    baton:     { name: 'Bâton de pirsch', price: 160, effect: 'Stabilité debout +40 %', sway: 0.6 },
    bipied:    { name: 'Bipied', price: 220, effect: 'Stabilité couché +50 %', bipod: 0.5 },
    appeauCanard: { name: 'Appeau colvert', price: 60, effect: 'Attire les canards', call: 'colvert' },
    appeauOie: { name: 'Appeau oie', price: 70, effect: 'Attire les oies', call: 'oie' },
    appeauCerf:{ name: 'Appeau brame', price: 110, effect: 'Provoque les cerfs au brame', call: 'cerf' },
    appeauChevreuil: { name: 'Appeau chevreuil (« Buttolo »)', price: 45, effect: 'Attire les brocards', call: 'chevreuil' },
    appeauRenard: { name: 'Appeau renard (cri du lièvre)', price: 40, effect: 'Attire renards et coyotes', call: 'renard' },
    appelants: { name: '12 appelants canards', price: 240, effect: 'Formes flottantes qui attirent les vols', decoys: 12 },
    cartouchiere: { name: 'Cartouchière', price: 90, effect: 'Recharge 30 % plus rapide', reload: 0.7 },
    sacGibier: { name: 'Grand sac à gibier', price: 130, effect: 'Prime de +10 % à la vente', sell: 1.1 },
    couteau:   { name: 'Couteau d\'éviscération', price: 80, effect: 'Prise en charge plus rapide des animaux', dress: 0.5 },
    silencieux:{ name: 'Modérateur de son', price: 780, effect: 'Bruit de tir carabine -60 %', suppressor: 0.4 },
    thermos:   { name: 'Thermos & repas', price: 25, effect: 'Endurance max +15 %', stamina: 1.15 },
    agrainage: { name: 'Seau d\'agrainage (maïs)', price: 35, effect: 'Attire les sangliers à l\'affût', bait: true, consumable: true },
  };

  // ------------------------------------------------------------------ TERRITOIRES
  const maps = {
    camp:     { name: 'Camp d\'entraînement', biome: 'plaine', size: 900, seed: 11, water: false, snow: 0, autumn: 0.2, desc: 'Stand de tir 50-300 m, fosse de trap, skeet, parcours de chasse et sanglier courant.' },
    foret:    { name: 'Forêt de Chambord', biome: 'foret', size: 1600, seed: 21, water: true, snow: 0, autumn: 0.7, desc: 'Chênes, hêtres et pins ; clairières, étang et miradors. Cerf, chevreuil, sanglier, daim.' },
    plaine:   { name: 'Plaine de Beauce', biome: 'plaine', size: 1600, seed: 33, water: false, snow: 0, autumn: 0.4, desc: 'Chaumes, betteraves, haies et bosquets. Faisan, perdrix, lièvre, lapin, renard, pigeons.' },
    marais:   { name: 'Marais de Brière', biome: 'marais', size: 1500, seed: 45, water: true, snow: 0, autumn: 0.5, desc: 'Roselières, plans d\'eau et huttes. Colvert, sarcelle, oie cendrée.' },
    montagne: { name: 'Massif des Écrins', biome: 'montagne', size: 2000, seed: 58, water: false, snow: 0.6, autumn: 0.3, desc: 'Alpages, éboulis et arêtes. Chamois, mouflon (bouquetin protégé).' },
    boreal:   { name: 'Forêt boréale (Québec)', biome: 'boreal', size: 2000, seed: 71, water: true, snow: 0.3, autumn: 0.9, desc: 'Épinettes noires, lacs et tourbières. Orignal, wapiti, ours noir, coyote.' },
  };

  // ------------------------------------------------------------------ MODES
  // spawn: { espèce: poids } ; hours: [début, fin] ; duration: heures de jeu ; tscale: minutes de jeu / minute réelle
  const modes = {
    lobby:    { name: 'Camp d\'entraînement', map: 'camp', icon: '🎯', level: 1, licence: 0, hours: [10, 18], duration: 0, tscale: 6, desc: 'Entraînement libre carabine et fusil : stand 50-300 m, sanglier courant, fosse de trap, skeet, parcours de chasse. Armurerie et chenil.', weapons: 'all', spawn: {}, training: true },
    approche: { name: 'Chasse à l\'approche', map: 'foret', icon: '🦌', level: 1, licence: 120, hours: [6.5, 11], duration: 4.5, tscale: 12, desc: 'Pirsch en forêt à l\'aube. Progressez face au vent, repérez et approchez cerfs, chevreuils et sangliers pour un tir propre à moins de 150 m.', weapons: 'rifle', spawn: { chevreuil: 5, chevrette: 5, cerf: 2, biche: 3, sanglier: 2, laie: 2, marcassin: 1, daim: 2, renard: 2 }, quota: { cerf: 1, sanglier: 2, chevreuil: 2, daim: 1, biche: 1, chevrette: 1, laie: 1, renard: 3 } },
    affut:    { name: 'Affût au mirador', map: 'foret', icon: '🌙', level: 2, licence: 90, hours: [18.5, 23.5], duration: 5, tscale: 12, desc: 'Installé au mirador face à l\'agrainage, attendez la sortie des sangliers au crépuscule. Silence, patience et lunette lumineuse.', weapons: 'rifle', spawn: { sanglier: 5, laie: 5, marcassin: 3, renard: 2, chevreuil: 2, cerf: 1 }, quota: { sanglier: 3, laie: 2, renard: 2, chevreuil: 1, cerf: 1 }, fixed: true },
    battue:   { name: 'Battue au grand gibier', map: 'foret', icon: '📯', level: 3, licence: 150, hours: [9, 13], duration: 4, tscale: 12, desc: 'Posté sur la ligne, respectez l\'angle de sécurité de 30° pendant que traqueurs et chiens courants rabattent sangliers et cervidés. Trois traques.', weapons: 'battue', spawn: { sanglier: 6, laie: 4, marcassin: 3, cerf: 2, biche: 3, chevreuil: 4, renard: 2 }, quota: { sanglier: 5, laie: 3, cerf: 1, biche: 2, chevreuil: 2, renard: 3 }, battue: true },
    passee:   { name: 'Passée aux canards', map: 'marais', icon: '🦆', level: 1, licence: 80, hours: [5.5, 9.5], duration: 4, tscale: 12, desc: 'À la hutte au petit matin. Appelants, appeau et labrador pour les vols de colverts, sarcelles et oies. Acier obligatoire.', weapons: 'shotgun', spawn: { colvert: 8, sarcelle: 6, oie: 3, cygne: 1, heron: 1, ragondin: 2 }, quota: { colvert: 8, sarcelle: 10, oie: 3, ragondin: 5 }, water: true },
    petit:    { name: 'Petit gibier devant soi', map: 'plaine', icon: '🐓', level: 1, licence: 70, hours: [9, 14], duration: 5, tscale: 12, desc: 'Marche en plaine avec un chien d\'arrêt : faisans, perdrix, lièvres et lapins jaillissent des haies. Tir rapide au fusil.', weapons: 'shotgun', spawn: { faisan: 8, perdrix: 6, lievre: 4, lapin: 6, renard: 1, pigeon: 3 }, quota: { faisan: 4, perdrix: 6, lievre: 2, lapin: 6, renard: 2, pigeon: 10 } },
    becasse:  { name: 'Bécasse au bois', map: 'foret', icon: '🪶', level: 4, licence: 90, hours: [8, 12], duration: 4, tscale: 12, desc: 'La reine des bois : petits fusils, chien d\'arrêt et tirs instantanés entre les branches. Prélèvement maximal : 3.', weapons: 'shotgun', spawn: { becasse: 8, pigeon: 2, lapin: 2, chevreuil: 1 }, quota: { becasse: 3, pigeon: 5, lapin: 3 } },
    montagne: { name: 'Chasse en montagne', map: 'montagne', icon: '🏔️', level: 5, licence: 260, hours: [7, 13], duration: 6, tscale: 12, desc: 'Approche du chamois et du mouflon en alpage. Longs tirs en pente : compensez l\'angle et le vent. Bouquetin et marmotte protégés.', weapons: 'rifle', spawn: { chamois: 6, mouflon: 5, bouquetin: 2, marmotte: 5, renard: 1 }, quota: { chamois: 2, mouflon: 1, renard: 1 } },
    arc:      { name: 'Chasse à l\'arc', map: 'foret', icon: '🏹', level: 4, licence: 100, hours: [6.5, 10.5], duration: 4, tscale: 12, desc: 'Silence absolu. Approchez à moins de 30 m d\'un chevreuil ou d\'un sanglier et placez la flèche derrière l\'épaule.', weapons: 'bow', spawn: { chevreuil: 6, chevrette: 4, sanglier: 3, laie: 2, daim: 2, lapin: 3 }, quota: { chevreuil: 2, chevrette: 1, sanglier: 1, laie: 1, daim: 1, lapin: 3 } },
    nuisibles:{ name: 'Régulation des nuisibles', map: 'plaine', icon: '🦊', level: 2, licence: 40, hours: [17, 22], duration: 5, tscale: 12, desc: 'Renards, corneilles, pigeons et ragondins autour de la ferme. .22 LR ou fusil, appeau renard au crépuscule.', weapons: 'all', spawn: { renard: 5, corneille: 8, pigeon: 8, ragondin: 3, lapin: 4, lievre: 1 }, quota: { renard: 4, corneille: 20, pigeon: 20, ragondin: 6, lapin: 6 } },
    boreal:   { name: 'Expédition boréale', map: 'boreal', icon: '🍁', level: 7, licence: 900, hours: [6, 12], duration: 6, tscale: 12, desc: 'Orignal au brame, wapiti, ours noir et coyote dans les épinettes du Québec. Gros calibres obligatoires. Trophées de grande valeur.', weapons: 'rifle', spawn: { orignal: 3, wapiti: 4, ours: 2, coyote: 3, lievre: 2 }, quota: { orignal: 1, wapiti: 1, ours: 1, coyote: 3 } },
    trap:     { name: 'Compétition : Fosse (Trap)', map: 'camp', icon: '🥏', level: 1, licence: 40, duration: 0, tscale: 6, hours: [11, 17], desc: '25 plateaux sur 5 postes, lancés depuis la fosse. 20 € l\'inscription, jusqu\'à 400 € de prix.', weapons: 'shotgun', spawn: {}, clay: 'trap' },
    skeet:    { name: 'Compétition : Skeet', map: 'camp', icon: '🥏', level: 2, licence: 40, duration: 0, tscale: 6, hours: [11, 17], desc: '25 plateaux, 8 postes, cabanes haute et basse, doublés. Prix jusqu\'à 500 €.', weapons: 'shotgun', spawn: {}, clay: 'skeet' },
    sporting: { name: 'Compétition : Parcours de chasse', map: 'camp', icon: '🥏', level: 3, licence: 60, duration: 0, tscale: 6, hours: [11, 17], desc: '25 plateaux imitant le gibier : rabbit, battue, sarcelle, croisés, fuyants. Prix jusqu\'à 800 €.', weapons: 'shotgun', spawn: {}, clay: 'sporting' },
  };

  const weather = {
    beau:      { name: 'Grand beau', cloud: 0.15, fog: 0.0, wind: [1, 4], rain: 0, snow: 0 },
    voile:     { name: 'Ciel voilé', cloud: 0.5, fog: 0.15, wind: [2, 6], rain: 0, snow: 0 },
    couvert:   { name: 'Couvert', cloud: 0.9, fog: 0.3, wind: [3, 8], rain: 0, snow: 0 },
    brume:     { name: 'Brume matinale', cloud: 0.4, fog: 0.85, wind: [0.5, 2], rain: 0, snow: 0 },
    pluie:     { name: 'Pluie', cloud: 1, fog: 0.5, wind: [4, 10], rain: 1, snow: 0 },
    neige:     { name: 'Neige', cloud: 1, fog: 0.55, wind: [2, 7], rain: 0, snow: 1 },
    vent:      { name: 'Grand vent', cloud: 0.6, fog: 0.1, wind: [9, 16], rain: 0, snow: 0 },
  };

  const xpForLevel = (l) => Math.round(200 * (l - 1) * (l - 1) * 0.9 + 350 * (l - 1));
  const levelTitle = (l) => ['Novice', 'Chasseur débutant', 'Chasseur', 'Chasseur confirmé', 'Pisteur', 'Guide', 'Maître chasseur', 'Vénerie d\'élite', 'Légende des bois', 'Grand veneur'][Math.min(9, l - 1)];

  const weaponAllowed = (mode, w) => {
    const rule = modes[mode].weapons;
    if (rule === 'all') return true;
    if (rule === 'rifle') return w.type === 'rifle';
    if (rule === 'shotgun') return w.type === 'shotgun';
    if (rule === 'bow') return w.type === 'bow';
    if (rule === 'battue') return w.type !== 'bow';
    return true;
  };

  return { species, weapons, ammo, chokes, optics, dogs, equipment, maps, modes, weather, xpForLevel, levelTitle, weaponAllowed };
})();
