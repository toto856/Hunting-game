// Données du jeu : armes, munitions, équipements, espèces, cartes, météo, modes.
'use strict';

DH.data = (() => {
  // ------------------------------------------------------------------ ARMES
  // spread : écart-type angulaire (radians) de la gerbe avant choke
  const weapons = [
    {
      id: 'pump', name: 'Fusil à pompe Cal.12', short: 'Pompe 12',
      desc: "Robuste et fiable. Réarmement manuel à la pompe après chaque tir.",
      level: 1, price: 0, action: 'pump', gauge: 12,
      pellets: 1.0, spread: 0.0135, capacity: 5, reserve: 40,
      cycle: 0.55, fireDelay: 0.1, reloadShell: 0.5, recoil: 1.0, sway: 1.0, adsFov: 55,
      look: { wood: '#5a3518', metal: '#2a2c30', barrels: 1, tube: true },
    },
    {
      id: 'sxs', name: 'Juxtaposé Cal.12', short: 'Juxtaposé',
      desc: "Le classique des marais : deux canons, deux coups rapides, rechargement en brisant l'arme.",
      level: 2, price: 900, action: 'break', gauge: 12,
      pellets: 1.05, spread: 0.0125, capacity: 2, reserve: 40,
      cycle: 0.14, fireDelay: 0.14, reloadBreak: 1.7, recoil: 1.1, sway: 0.9, adsFov: 54,
      look: { wood: '#6e3d17', metal: '#3a3a3a', barrels: 2, side: true, engraved: true },
    },
    {
      id: 'ou20', name: 'Superposé Cal.20 « Bécassier »', short: 'Superposé 20',
      desc: 'Léger et maniable, très stable en visée. Gerbe plus légère.',
      level: 3, price: 1500, action: 'break', gauge: 20,
      pellets: 0.8, spread: 0.0115, capacity: 2, reserve: 50,
      cycle: 0.12, fireDelay: 0.12, reloadBreak: 1.4, recoil: 0.65, sway: 0.6, adsFov: 52,
      look: { wood: '#8a4b20', metal: '#50535a', barrels: 2, side: false, engraved: true },
    },
    {
      id: 'semi', name: 'Semi-automatique Cal.12', short: 'Semi-auto',
      desc: 'Emprunt des gaz : trois coups rapides, recul adouci.',
      level: 4, price: 2500, action: 'semi', gauge: 12,
      pellets: 1.0, spread: 0.013, capacity: 3, reserve: 45,
      cycle: 0.2, fireDelay: 0.2, reloadShell: 0.42, recoil: 0.8, sway: 0.9, adsFov: 55,
      look: { wood: '#3b3f35', metal: '#1c1d20', barrels: 1, tube: true, synthetic: true },
    },
    {
      id: 'rifle', name: 'Carabine .17 HMR à lunette', short: 'Carabine .17',
      desc: 'Pour les tirs de précision à longue distance. Une seule balle : visez juste !',
      level: 5, price: 3200, action: 'bolt', gauge: 0, bullet: true,
      pellets: 1, spread: 0.0008, capacity: 5, reserve: 40,
      cycle: 0.75, fireDelay: 0.1, reloadMag: 2.0, recoil: 0.35, sway: 0.7, adsFov: 14, scope: true,
      look: { wood: '#6b4020', metal: '#202226', barrels: 1, scope: true },
    },
    {
      id: 'magnum', name: 'Magnum Cal.10 « Canardière »', short: 'Magnum 10',
      desc: 'Puissance et portée extrêmes pour les oies. Lourd, fort recul.',
      level: 7, price: 5500, action: 'pump', gauge: 10,
      pellets: 1.45, spread: 0.012, capacity: 3, reserve: 30,
      cycle: 0.75, fireDelay: 0.1, reloadShell: 0.6, recoil: 1.7, sway: 1.45, adsFov: 53,
      range: 1.25,
      look: { wood: '#4a2a12', metal: '#2e3a2e', barrels: 1, tube: true, long: true },
    },
    {
      id: 'gold', name: 'Superposé d\'exception « Or Royal »', short: 'Or Royal',
      desc: 'Arme de collection gravée à l\'or fin. Gerbe parfaite, stabilité légendaire.',
      level: 12, price: 15000, action: 'break', gauge: 12,
      pellets: 1.15, spread: 0.0105, capacity: 2, reserve: 60,
      cycle: 0.1, fireDelay: 0.1, reloadBreak: 1.2, recoil: 0.8, sway: 0.5, adsFov: 50, range: 1.15,
      look: { wood: '#3d1e0c', metal: '#c9a23a', barrels: 2, side: false, engraved: true, gold: true },
    },
  ];

  // ------------------------------------------------------------------ CARTOUCHES
  const cartridges = [
    { id: 'lead6', name: 'Plomb n°6 (standard)', level: 1, price: 0, pellets: 11, dmg: 11, range: 38, speed: 390, spreadMul: 1.0, desc: 'Cartouche de base polyvalente.' },
    { id: 'steel4', name: 'Acier n°4', level: 2, price: 350, pellets: 10, dmg: 13, range: 42, speed: 420, spreadMul: 0.9, desc: 'Obligatoire en zone humide. Gerbe serrée, plus rapide.' },
    { id: 'bismuth5', name: 'Bismuth n°5', level: 4, price: 900, pellets: 12, dmg: 14, range: 46, speed: 400, spreadMul: 0.95, desc: 'Excellente énergie, portée accrue.' },
    { id: 'magnum2', name: 'Magnum 3" n°2', level: 6, price: 1800, pellets: 13, dmg: 18, range: 50, speed: 410, spreadMul: 1.0, recoil: 1.3, desc: 'Grosse charge pour les oies. Recul important.' },
    { id: 'tss7', name: 'Tungstène TSS n°7', level: 9, price: 4000, pellets: 16, dmg: 16, range: 60, speed: 400, spreadMul: 0.85, desc: 'Le nec plus ultra : densité et portée hors norme.' },
  ];

  // ------------------------------------------------------------------ CHOKES
  const chokes = [
    { id: 'cyl', name: 'Cylindrique', mul: 1.45, desc: 'Gerbe très ouverte, idéal < 20 m' },
    { id: 'mod', name: '1/2 choke', mul: 1.0, desc: 'Équilibré' },
    { id: 'full', name: 'Full choke', mul: 0.68, desc: 'Gerbe serrée, tirs lointains' },
  ];

  // ------------------------------------------------------------------ ÉQUIPEMENT
  const equipment = [
    { id: 'call', name: 'Appeau à canard', level: 1, price: 200, key: 'F', desc: 'Touche F : attire les vols proches vers vous.' },
    { id: 'binoc', name: 'Jumelles 10×42', level: 1, price: 350, key: 'B', desc: 'Touche B : repérez les vols au loin.' },
    { id: 'belt', name: 'Cartouchière', level: 2, price: 500, desc: '+50 % de munitions de réserve.' },
    { id: 'decoys', name: 'Appelants (formes)', level: 2, price: 650, desc: 'Des leurres posés sur l\'eau : plus de canards se posent devant vous.' },
    { id: 'chokes', name: 'Jeu de chokes', level: 3, price: 600, desc: 'Choisissez l\'ouverture de votre gerbe avant la partie.' },
    { id: 'camo', name: 'Tenue camouflage', level: 3, price: 900, desc: 'Les canards vous repèrent beaucoup moins vite.' },
    { id: 'dog', name: 'Labrador rapporteur', level: 4, price: 2200, desc: 'Votre chien rapporte le gibier : +25 % de gains.' },
    { id: 'waders', name: 'Waders', level: 5, price: 800, desc: 'Marchez dans l\'eau plus profonde sans ralentir autant.' },
  ];

  // ------------------------------------------------------------------ ESPÈCES
  const species = {
    colvert_m: {
      name: 'Canard colvert ♂', pts: 50, hp: 26, speed: 15, size: 1.0, erratic: 0.2, quack: 1.0, wary: 1.0,
      colors: { head: '#1c6b3c', ring: '#f2f2f2', chest: '#6a3a22', body: '#b8b3aa', back: '#5b594f', wing: '#77736a', spec: '#3940b8', bill: '#d9c02c', tail: '#1e1e1e', belly: '#c9c6bf' },
      info: 'Le plus commun des canards. Tête vert bouteille, collier blanc.',
    },
    colvert_f: {
      name: 'Canard colvert ♀', pts: 50, hp: 24, speed: 15, size: 0.95, erratic: 0.2, quack: 1.15, wary: 1.0,
      colors: { head: '#8b6a48', chest: '#7a5a3c', body: '#80603f', back: '#5e4630', wing: '#6d5540', spec: '#3940b8', bill: '#c9782c', tail: '#6b5037', belly: '#9b7b58' },
      info: 'Plumage brun chiné, discret. Cancane bruyamment.',
    },
    sarcelle: {
      name: "Sarcelle d'hiver", pts: 85, hp: 16, speed: 19, size: 0.68, erratic: 1.0, quack: 1.6, wary: 1.3,
      colors: { head: '#8a3520', mask: '#1f6b45', chest: '#d9ceb0', body: '#9b9b96', back: '#7c7c78', wing: '#6d6b66', spec: '#1f8a4d', bill: '#2a2a2a', tail: '#e0cc6a', belly: '#e6e0d0' },
      info: 'Le plus petit canard d\'Europe. Vol rapide et zigzagant.',
    },
    pilet: {
      name: 'Canard pilet', pts: 70, hp: 26, speed: 17, size: 1.05, erratic: 0.3, quack: 0.9, wary: 1.1, longTail: true,
      colors: { head: '#5b3a24', ring: '#f0f0f0', chest: '#f0efe8', body: '#a3a39f', back: '#6d6d6a', wing: '#7b7b76', spec: '#3a6e40', bill: '#6c7a88', tail: '#1e1e1e', belly: '#f0efe8' },
      info: 'Silhouette élancée, longue queue effilée.',
    },
    mandarin: {
      name: 'Canard mandarin', pts: 250, hp: 20, speed: 15, size: 0.82, erratic: 0.4, quack: 1.4, wary: 1.4, rare: true,
      colors: { head: '#e0762e', mask: '#f5f5f0', chest: '#5d2b6e', body: '#c77b36', back: '#3b3a45', wing: '#e08a2e', spec: '#2a5ea8', bill: '#d63a2c', tail: '#2a2a30', belly: '#f5f5f0' },
      info: 'Rare et spectaculaire. Rapporte gros !',
    },
    branchu: {
      name: 'Canard branchu', pts: 180, hp: 20, speed: 16, size: 0.85, erratic: 0.4, quack: 1.3, wary: 1.3, rare: true,
      colors: { head: '#1d5a44', mask: '#f5f5f5', chest: '#7a3a2a', body: '#c9b27a', back: '#2a2c3a', wing: '#2e3a5a', spec: '#3a58b8', bill: '#d63a2c', tail: '#1a1a22', belly: '#e8e0cc' },
      info: 'Le joyau des bayous américains.',
    },
    eider: {
      name: 'Eider à duvet', pts: 95, hp: 34, speed: 16, size: 1.2, erratic: 0.15, quack: 0.7, wary: 0.9,
      colors: { head: '#f0f0ea', mask: '#111111', chest: '#f2e2c8', body: '#f0f0ea', back: '#f0f0ea', wing: '#1a1a1a', spec: '#1a1a1a', bill: '#8a9a6a', tail: '#111', belly: '#151515' },
      info: 'Canard marin massif des mers froides.',
    },
    oie: {
      name: 'Oie cendrée', pts: 130, hp: 60, speed: 13, size: 1.75, erratic: 0.05, quack: 0.55, wary: 1.2, goose: true,
      colors: { head: '#77705f', chest: '#8a8474', body: '#7d7666', back: '#5f5a4d', wing: '#8e8b82', spec: '#9aa0a6', bill: '#e88a3a', tail: '#f0f0f0', belly: '#b9b4a6' },
      info: 'Vole en V en cacardant. Robuste : visez bien.',
    },
    bernache: {
      name: 'Bernache du Canada', pts: 140, hp: 62, speed: 13, size: 1.8, erratic: 0.05, quack: 0.6, wary: 1.2, goose: true,
      colors: { head: '#151515', mask: '#f2f2f2', chest: '#c9c0ae', body: '#7a6a55', back: '#5a4c3c', wing: '#6a5c4a', spec: '#6a5c4a', bill: '#151515', tail: '#151515', belly: '#e0d8c8' },
      info: 'Grande oie à cou noir et joues blanches.',
    },
    cygne: {
      name: 'Cygne tuberculé', pts: -400, hp: 90, speed: 11, size: 2.5, erratic: 0, quack: 0.4, wary: 0.6, goose: true, protected: true, swan: true,
      colors: { head: '#f7f7f4', chest: '#f7f7f4', body: '#f7f7f4', back: '#f0f0ec', wing: '#f4f4f0', spec: '#f4f4f0', bill: '#e0602a', tail: '#f0f0ec', belly: '#f7f7f4' },
      info: 'ESPÈCE PROTÉGÉE — ne pas tirer !',
    },
    tadorne: {
      name: 'Tadorne de Belon', pts: -300, hp: 28, speed: 15, size: 1.1, erratic: 0.1, quack: 1.1, wary: 1.0, protected: true,
      colors: { head: '#10302a', chest: '#b5652a', body: '#f4f4f0', back: '#f4f4f0', wing: '#f4f4f0', spec: '#1a6a3a', bill: '#c8202a', tail: '#f4f4f0', belly: '#f4f4f0', band: '#b5652a' },
      info: 'ESPÈCE PROTÉGÉE en France — ne pas tirer !',
    },
  };

  // ------------------------------------------------------------------ CARTES
  // shape : fonction de relief utilisée par le monde
  const maps = [
    {
      id: 'marais', name: 'Marais de Camargue', level: 1,
      desc: 'Étangs, roselières et tamaris sous le soleil du Midi.',
      seed: 1234, shape: 'marsh', amp: 3.2, snow: 0, frozen: false, echo: 0.15,
      spawn: { x: 0, z: 34, yaw: 0 },
      basins: [
        { x: 0, z: -18, r: 42, d: 2.4 }, { x: -85, z: -55, r: 32, d: 2 }, { x: 90, z: -25, r: 36, d: 2 },
        { x: -30, z: -115, r: 50, d: 2.6 }, { x: 75, z: -115, r: 40, d: 2 }, { x: -120, z: 60, r: 30, d: 1.8 },
      ],
      ground: ['#6f7d3a', '#8b8a45', '#5d6b30', '#9c8f58'], mud: '#5a5040', sand: '#b8a67a', rock: '#8a8478',
      veg: { deciduous: 90, pine: 70, bush: 260, reeds: 7000, grass: 7000, rocks: 30 },
      canopy: ['#5f7a36', '#6e8a3c', '#4f6b30', '#7a8a4a'], reed: '#9a9a55', grass: '#8a9a48',
      water: { deep: '#27433f', shallow: '#4f6b58' },
      species: { colvert_m: 30, colvert_f: 22, sarcelle: 18, pilet: 12, oie: 6, mandarin: 2, tadorne: 5, cygne: 3 },
      weather: 'clair',
    },
    {
      id: 'foret', name: "Lac de la Forêt d'Automne", level: 2,
      desc: 'Un lac paisible cerné de chênes, érables et bouleaux flamboyants.',
      seed: 777, shape: 'lake', amp: 16, snow: 0, frozen: false, echo: 0.35,
      spawn: { x: 0, z: 30, yaw: 0 },
      basins: [{ x: 0, z: -60, r: 85, d: 4 }, { x: -110, z: -20, r: 35, d: 2.5 }, { x: 70, z: 70, r: 20, d: 1.5 }],
      ground: ['#6b5a2e', '#7d6a34', '#5c5a2c', '#8a5a2a'], mud: '#4d3f2c', sand: '#8f7a52', rock: '#7a756c',
      veg: { deciduous: 750, pine: 180, birch: 160, bush: 300, reeds: 2500, grass: 5000, rocks: 60 },
      canopy: ['#c8561e', '#d88a1e', '#b8321a', '#e0b02a', '#8a6a1e', '#a0401a', '#6a7a2a'], reed: '#a08a4a', grass: '#8a7a3a',
      water: { deep: '#1e3238', shallow: '#3f5a52' },
      species: { colvert_m: 32, colvert_f: 24, sarcelle: 12, mandarin: 6, pilet: 8, oie: 8, cygne: 4, tadorne: 2 },
      weather: 'nuageux',
    },
    {
      id: 'riviere', name: 'Rivière Gelée', level: 4,
      desc: "Une rivière prise par les glaces. Les canards se regroupent dans les trous d'eau libre.",
      seed: 4242, shape: 'river', amp: 12, snow: 0.9, frozen: true, echo: 0.3,
      spawn: { x: 0, z: 34, yaw: 0 },
      basins: [{ x: 0, z: -2, r: 26, d: 3 }, { x: -95, z: 0, r: 22, d: 3 }, { x: 105, z: 0, r: 20, d: 3 }],
      ground: ['#6a6448', '#5a5a44', '#7a6a4a'], mud: '#4a4538', sand: '#8a8070', rock: '#6a6a6e',
      veg: { pine: 520, birch: 140, bare: 220, bush: 120, reeds: 1800, grass: 1500, rocks: 80 },
      canopy: ['#2c4a30', '#35553a', '#28402c'], reed: '#b0a070', grass: '#a09a70',
      water: { deep: '#1a2c38', shallow: '#3a5260' },
      species: { colvert_m: 34, colvert_f: 24, sarcelle: 10, pilet: 10, oie: 10, bernache: 6, cygne: 5 },
      weather: 'neige_legere',
    },
    {
      id: 'toundra', name: 'Toundra du Grand Nord', level: 6,
      desc: "Immensité blanche, vent glacial et grands vols d'oies migratrices.",
      seed: 9001, shape: 'tundra', amp: 7, snow: 1, frozen: true, echo: 0.05,
      spawn: { x: 0, z: 30, yaw: 0 },
      basins: [{ x: 0, z: -20, r: 34, d: 2.5 }, { x: -90, z: -80, r: 40, d: 2.5 }, { x: 100, z: -60, r: 30, d: 2 }, { x: 40, z: 110, r: 30, d: 2 }],
      ground: ['#7a7560', '#6a6a58', '#8a8068'], mud: '#4a4538', sand: '#8a8070', rock: '#6a6a70',
      veg: { pine: 140, bare: 80, bush: 200, reeds: 800, grass: 1200, rocks: 160 },
      canopy: ['#23402c', '#2a4a32'], reed: '#b8a878', grass: '#a8a078',
      water: { deep: '#162632', shallow: '#324a58' },
      species: { oie: 28, bernache: 22, eider: 22, colvert_m: 12, colvert_f: 8, cygne: 8 },
      weather: 'blizzard',
    },
    {
      id: 'fjord', name: 'Fjord Norvégien', level: 9,
      desc: 'Falaises vertigineuses et eaux profondes. Les cimes sont enneigées.',
      seed: 3131, shape: 'fjord', amp: 55, snow: 0.15, snowLine: 18, frozen: false, echo: 0.6,
      spawn: { x: 0, z: 26, yaw: 0 },
      basins: [{ x: 0, z: -10, r: 30, d: 4 }],
      ground: ['#4f6a38', '#5a7040', '#6a6a48'], mud: '#3f3a30', sand: '#7a7058', rock: '#6e6e70',
      veg: { pine: 900, birch: 200, bush: 250, reeds: 900, grass: 4000, rocks: 260 },
      canopy: ['#1f3d28', '#284a30', '#2f5236'], reed: '#8a9050', grass: '#6a8a40',
      water: { deep: '#102a36', shallow: '#2a4a50' },
      species: { eider: 30, colvert_m: 18, colvert_f: 14, oie: 12, bernache: 8, sarcelle: 10, cygne: 4 },
      weather: 'nuageux',
    },
    {
      id: 'bayou', name: 'Bayou de Louisiane', level: 12,
      desc: 'Cyprès chauves drapés de mousse espagnole, brume chaude et eaux sombres.',
      seed: 5150, shape: 'bayou', amp: 2.2, snow: 0, frozen: false, echo: 0.2,
      spawn: { x: 0, z: 30, yaw: 0 },
      basins: [{ x: 0, z: -12, r: 36, d: 2.2 }, { x: -70, z: -80, r: 45, d: 2 }, { x: 80, z: -70, r: 40, d: 2 }],
      ground: ['#4a5a2a', '#5a6a30', '#3f4a24'], mud: '#3a3424', sand: '#6a5a3a', rock: '#5a5a50',
      veg: { cypress: 380, deciduous: 160, bush: 350, reeds: 4500, grass: 5000, rocks: 10 },
      canopy: ['#4a6a2a', '#5a7a30', '#3a5a24'], reed: '#7a8a40', grass: '#6a8a38',
      water: { deep: '#1e2a1c', shallow: '#3a4a2c' },
      species: { colvert_m: 22, colvert_f: 18, branchu: 14, sarcelle: 16, pilet: 10, bernache: 8, cygne: 4 },
      weather: 'brouillard',
    },
  ];

  // ------------------------------------------------------------------ MÉTÉO
  // particles : style de précipitation ; snowAdd : accumulation au sol ; fog : densité
  const weathers = [
    { id: 'clair', name: 'Grand beau', icon: '☀️', level: 1, fog: 0.0022, clouds: 0.15, wind: 2, dim: 1, xp: 1.0 },
    { id: 'nuageux', name: 'Couvert', icon: '☁️', level: 1, fog: 0.003, clouds: 0.75, wind: 4, dim: 0.7, xp: 1.05 },
    { id: 'pluie', name: 'Pluie', icon: '🌧️', level: 1, fog: 0.006, clouds: 0.95, wind: 5, dim: 0.5, xp: 1.15, rain: { count: 9000, speed: 13, len: 0.5 } },
    { id: 'neige_legere', name: 'Neige légère', icon: '🌨️', level: 1, fog: 0.005, clouds: 0.85, wind: 2, dim: 0.65, xp: 1.1, snowAdd: 0.35,
      snow: { count: 3500, size: 0.07, fall: 1.1, sway: 0.4, swayFreq: 0.8, wind: 1, opacity: 0.9 } },
    { id: 'brouillard', name: 'Brouillard', icon: '🌫️', level: 2, fog: 0.022, clouds: 0.9, wind: 0.5, dim: 0.55, xp: 1.3 },
    { id: 'gros_flocons', name: 'Gros flocons', icon: '❄️', level: 3, fog: 0.009, clouds: 0.95, wind: 1.2, dim: 0.55, xp: 1.2, snowAdd: 0.7,
      snow: { count: 2200, size: 0.2, fall: 0.75, sway: 0.9, swayFreq: 0.5, wind: 0.6, opacity: 0.95, flake: 'big' } },
    { id: 'neige_fondante', name: 'Neige fondante', icon: '🌨️', level: 4, fog: 0.008, clouds: 1, wind: 4, dim: 0.45, xp: 1.2, snowAdd: 0.15,
      rain: { count: 4000, speed: 9, len: 0.3 },
      snow: { count: 2500, size: 0.1, fall: 2.6, sway: 0.2, swayFreq: 1.3, wind: 1, opacity: 0.75, flake: 'wet' } },
    { id: 'poudreuse', name: 'Poudreuse scintillante', icon: '✨', level: 5, fog: 0.004, clouds: 0.1, wind: 1, dim: 1, xp: 1.15, snowAdd: 0.6,
      snow: { count: 7000, size: 0.035, fall: 0.35, sway: 0.6, swayFreq: 1.5, wind: 0.8, opacity: 1, flake: 'sparkle' } },
    { id: 'gresil', name: 'Grésil', icon: '🧊', level: 6, fog: 0.007, clouds: 1, wind: 5, dim: 0.5, xp: 1.25, snowAdd: 0.2,
      snow: { count: 6000, size: 0.035, fall: 7.5, sway: 0.05, swayFreq: 2, wind: 1, opacity: 0.9, flake: 'pellet' } },
    { id: 'orage', name: 'Orage', icon: '⛈️', level: 7, fog: 0.008, clouds: 1, wind: 8, dim: 0.32, xp: 1.35, lightning: true,
      rain: { count: 14000, speed: 16, len: 0.7 } },
    { id: 'blizzard', name: 'Blizzard', icon: '🌪️', level: 8, fog: 0.028, clouds: 1, wind: 15, dim: 0.5, xp: 1.5, snowAdd: 0.9,
      snow: { count: 14000, size: 0.06, fall: 2.2, sway: 1.5, swayFreq: 2.2, wind: 1.3, opacity: 0.9 } },
  ];

  // ------------------------------------------------------------------ MOMENT DE LA JOURNÉE
  const times = [
    { id: 'aube', name: 'Aube', icon: '🌅', level: 1, sunElev: 6, sunAz: 100, xp: 1.1,
      sky: { top: '#3b5a8f', horizon: '#f2a26a', sun: '#ffb070' }, sunI: 1.4, hemi: 0.55, flocks: 1.3 },
    { id: 'jour', name: 'Journée', icon: '🌞', level: 1, sunElev: 42, sunAz: 160, xp: 1.0,
      sky: { top: '#3f7ad0', horizon: '#b8d4ea', sun: '#fff4e0' }, sunI: 2.4, hemi: 0.8, flocks: 1.0 },
    { id: 'crepuscule', name: 'Crépuscule', icon: '🌇', level: 3, sunElev: 3, sunAz: 255, xp: 1.15,
      sky: { top: '#2a2f5f', horizon: '#e8683a', sun: '#ff7a3a' }, sunI: 1.2, hemi: 0.45, flocks: 1.4 },
    { id: 'nuit', name: 'Nuit de pleine lune', icon: '🌕', level: 6, sunElev: 35, sunAz: 200, xp: 1.4, night: true,
      sky: { top: '#0a1024', horizon: '#34466a', sun: '#b8ccff' }, sunI: 0.7, hemi: 0.4, flocks: 0.9 },
  ];

  // ------------------------------------------------------------------ MODES
  const modes = [
    { id: 'classique', name: 'Chasse classique', icon: '🦆', level: 1, xp: 1.0,
      desc: '3 minutes pour réaliser le meilleur tableau de chasse.' },
    { id: 'libre', name: 'Chasse libre', icon: '🌿', level: 1, xp: 0.5,
      desc: 'Pas de chrono, munitions illimitées. Explorez et chassez à votre rythme.' },
    { id: 'chrono', name: 'Contre-la-montre', icon: '⏱️', level: 2, xp: 1.1,
      desc: '60 s au départ, chaque prise ajoute du temps. Tenez le plus longtemps possible !' },
    { id: 'balltrap', name: 'Ball-trap', icon: '🎯', level: 3, xp: 1.0,
      desc: '25 plateaux d\'argile lancés depuis les fosses. Doublés en fin de série.' },
    { id: 'reglementee', name: 'Chasse réglementée', icon: '📜', level: 5, xp: 1.3,
      desc: 'Respectez les quotas et les espèces protégées. 3 infractions = permis retiré.' },
    { id: 'survie', name: 'Survie — Grande migration', icon: '🔥', level: 7, xp: 1.4,
      desc: 'Des vagues de plus en plus nombreuses. Prélevez 60 % de chaque vague ou perdez une vie.' },
  ];

  // XP cumulée nécessaire pour atteindre un niveau
  const xpForLevel = (lvl) => Math.round(450 * Math.pow(lvl - 1, 1.55));

  return { weapons, cartridges, chokes, equipment, species, maps, weathers, times, modes, xpForLevel };
})();
