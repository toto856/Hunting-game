// Catalogue de l'armurerie : armes, munitions, optiques, équipement, tenues et finitions.
// Les objets "exclusifs" ne s'achètent pas : ils se gagnent avec des trophées.

// Balistique : masse (g), vitesse initiale (m/s), coefficient balistique G1, calibre (mm)
export const WEAPONS = [
  // ---------------------------------------------------------------- carabines
  {
    id: 'r_308', kind: 'rifle', action: 'bolt', name: 'Carabine à verrou .308 Win', short: '.308 Win',
    desc: 'La polyvalente des battues et de l\'affût : cerf, sanglier, daim.', price: 0, level: 1,
    cal: '.308 Win', mass: 10.7, v0: 820, bc: 0.45, diam: 7.8, mag: 4, cycle: 0.85, reload: 2.4, recoil: 1.0, sway: 1.0, weight: 3.4,
    optic: 'scope39', look: { barrel: 0.6, stock: 'monte', wood: 'noyer', metal: 'bronze', sling: true },
  },
  {
    id: 'r_243', kind: 'rifle', action: 'bolt', name: 'Carabine légère .243 Win', short: '.243 Win',
    desc: 'Recul faible, trajectoire tendue. Idéale pour le chevreuil et le chamois.', price: 900, level: 2,
    cal: '.243 Win', mass: 6.5, v0: 905, bc: 0.38, diam: 6.2, mag: 4, cycle: 0.8, reload: 2.2, recoil: 0.6, sway: 0.92, weight: 3.0,
    optic: 'scope39', look: { barrel: 0.62, stock: 'monte', wood: 'noyer', metal: 'inox', sling: true },
  },
  {
    id: 'r_7x64', kind: 'rifle', action: 'bolt', name: 'Carabine de montagne 7×64', short: '7×64',
    desc: 'Le classique européen : puissante et précise jusqu\'à 300 m.', price: 2400, level: 4,
    cal: '7×64', mass: 10.5, v0: 860, bc: 0.55, diam: 7.2, mag: 4, cycle: 0.85, reload: 2.4, recoil: 1.05, sway: 0.85, weight: 3.2,
    optic: 'scope2515', look: { barrel: 0.65, stock: 'bavarois', wood: 'ronceux', metal: 'bronze', sling: true },
  },
  {
    id: 'r_lever', kind: 'rifle', action: 'lever', name: 'Carabine à levier .45-70', short: '.45-70',
    desc: 'Grosse balle lente, très efficace à courte distance. Organes de visée ouverts.', price: 2100, level: 3,
    cal: '.45-70 Gov', mass: 26.2, v0: 520, bc: 0.21, diam: 11.6, mag: 5, cycle: 0.55, reload: 3.4, recoil: 1.35, sway: 1.05, weight: 3.5,
    optic: 'iron', look: { barrel: 0.58, stock: 'droit', wood: 'noyer', metal: 'jaspe', sling: false, lever: true },
  },
  {
    id: 'r_93semi', kind: 'rifle', action: 'semi', name: 'Semi-automatique 9,3×62 de battue', short: '9,3×62 semi',
    desc: 'Deuxième tir immédiat sur sanglier courant. Point rouge.', price: 3600, level: 5,
    cal: '9,3×62', mass: 18.5, v0: 710, bc: 0.38, diam: 9.3, mag: 4, cycle: 0.18, reload: 2.2, recoil: 1.3, sway: 1.05, weight: 3.6,
    optic: 'reddot', look: { barrel: 0.52, stock: 'monte', wood: 'synthetique', metal: 'noir', sling: true },
  },
  {
    id: 'r_300wm', kind: 'rifle', action: 'bolt', name: 'Carabine .300 Win Mag tir long', short: '.300 WM',
    desc: 'Énergie maximale pour les grands cerfs et les tirs lointains. Fort recul.', price: 4800, level: 7,
    cal: '.300 Win Mag', mass: 11.7, v0: 900, bc: 0.5, diam: 7.8, mag: 3, cycle: 0.95, reload: 2.6, recoil: 1.6, sway: 0.95, weight: 3.9,
    optic: 'scope416', look: { barrel: 0.68, stock: 'monte', wood: 'lamelle', metal: 'noir', sling: true, brake: true },
  },
  {
    id: 'r_express', kind: 'rifle', action: 'double', name: 'Express juxtaposé 9,3×74R', short: 'Express 9,3',
    desc: 'Deux coups immédiats, pour l\'approche et la poursuite. Visée ouverte.', price: 7500, level: 8,
    cal: '9,3×74R', mass: 18.5, v0: 690, bc: 0.36, diam: 9.3, mag: 2, cycle: 0.2, reload: 2.2, recoil: 1.4, sway: 0.9, weight: 4.2,
    optic: 'iron', look: { barrel: 0.6, stock: 'anglais', wood: 'ronceux', metal: 'jaspe', engraved: true, double: true },
  },
  {
    id: 'r_drilling', kind: 'rifle', action: 'double', name: 'Drilling 12/12 × 9,3×74R', short: 'Drilling',
    desc: 'L\'arme mixte des forêts d\'Europe : un canon rayé sous deux canons lisses.', price: 9000, level: 9,
    cal: '9,3×74R', mass: 18.5, v0: 690, bc: 0.36, diam: 9.3, mag: 1, cycle: 0.2, reload: 2.4, recoil: 1.4, sway: 0.95, weight: 3.6,
    optic: 'scope2515', look: { barrel: 0.62, stock: 'bavarois', wood: 'ronceux', metal: 'jaspe', engraved: true, double: true, drilling: true },
    unlock: { text: 'Offert pour une médaille d\'Or au cerf ET au sanglier', all: [{ species: 'cerf', medal: 'or' }, { species: 'sanglier', medal: 'or' }] },
  },
  {
    id: 'r_diamant', kind: 'rifle', action: 'bolt', name: 'Carabine gravée « Diamant »', short: 'Diamant',
    desc: 'Pièce unique gravée à l\'or : précision et stabilité légendaires.', exclusive: true, level: 1,
    cal: '.300 Win Mag', mass: 11.7, v0: 910, bc: 0.52, diam: 7.8, mag: 3, cycle: 0.85, reload: 2.3, recoil: 1.3, sway: 0.7, weight: 3.6,
    optic: 'scope416', look: { barrel: 0.66, stock: 'monte', wood: 'ronceux', metal: 'or', engraved: true, sling: true },
    unlock: { text: 'Obtenir un trophée Diamant (grand gibier)', all: [{ medal: 'diamant', big: true }] },
  },
  {
    id: 'r_veneur', kind: 'rifle', action: 'bolt', name: 'Carabine « Grand Veneur »', short: 'Grand Veneur',
    desc: 'Réservée aux chasseurs d\'exception : bois de cerf incrusté, canon damas.', exclusive: true, level: 1,
    cal: '7×64', mass: 10.5, v0: 880, bc: 0.56, diam: 7.2, mag: 4, cycle: 0.75, reload: 2.2, recoil: 0.95, sway: 0.65, weight: 3.3,
    optic: 'scope2515', look: { barrel: 0.66, stock: 'bavarois', wood: 'ronceux', metal: 'damas', engraved: true, sling: true },
    unlock: { text: 'Obtenir 5 trophées Or (ou un Légendaire)', count: { medal: 'or', n: 5 }, any: [{ medal: 'legendaire' }] },
  },
  // ---------------------------------------------------------------- fusils
  {
    id: 's_ou12', kind: 'shotgun', action: 'break', name: 'Superposé cal.12', short: 'Superposé 12',
    desc: 'Le fusil de la passée : deux coups, gerbe régulière.', price: 0, level: 1,
    gauge: 12, pellets: 1, spread: 0.0125, mag: 2, cycle: 0.14, reload: 1.7, recoil: 1.0, sway: 0.9, weight: 3.3,
    optic: 'bead', look: { barrel: 0.72, stock: 'anglais', wood: 'noyer', metal: 'bronze', ou: true },
  },
  {
    id: 's_pump12', kind: 'shotgun', action: 'pump', name: 'Fusil à pompe cal.12', short: 'Pompe 12',
    desc: 'Robuste, 3 coups (réglementaire au gibier d\'eau).', price: 900, level: 1,
    gauge: 12, pellets: 1, spread: 0.0135, mag: 3, cycle: 0.55, reload: 0.5, perShell: true, recoil: 1.0, sway: 1.0, weight: 3.4,
    optic: 'bead', look: { barrel: 0.7, stock: 'droit', wood: 'synthetique', metal: 'noir', pump: true },
  },
  {
    id: 's_sxs12', kind: 'shotgun', action: 'break', name: 'Juxtaposé cal.12', short: 'Juxtaposé 12',
    desc: 'L\'élégance des chasses d\'antan : deux coups rapides.', price: 1100, level: 2,
    gauge: 12, pellets: 1.05, spread: 0.0122, mag: 2, cycle: 0.12, reload: 1.6, recoil: 1.05, sway: 0.88, weight: 3.1,
    optic: 'bead', look: { barrel: 0.7, stock: 'anglais', wood: 'ronceux', metal: 'jaspe', sxs: true, engraved: true },
  },
  {
    id: 's_semi12', kind: 'shotgun', action: 'semi', name: 'Semi-automatique cal.12', short: 'Semi-auto 12',
    desc: 'Trois coups rapides, recul adouci par emprunt de gaz.', price: 1400, level: 2,
    gauge: 12, pellets: 1, spread: 0.013, mag: 3, cycle: 0.2, reload: 0.42, perShell: true, recoil: 0.8, sway: 0.92, weight: 3.2,
    optic: 'bead', look: { barrel: 0.72, stock: 'droit', wood: 'synthetique', metal: 'noir', semi: true },
  },
  {
    id: 's_ou20', kind: 'shotgun', action: 'break', name: 'Superposé cal.20 léger', short: 'Superposé 20',
    desc: 'Léger et maniable, très stable. Gerbe plus légère.', price: 1800, level: 3,
    gauge: 20, pellets: 0.8, spread: 0.0115, mag: 2, cycle: 0.12, reload: 1.4, recoil: 0.65, sway: 0.7, weight: 2.8,
    optic: 'bead', look: { barrel: 0.7, stock: 'anglais', wood: 'noyer', metal: 'inox', ou: true, engraved: true },
  },
  {
    id: 's_mag12', kind: 'shotgun', action: 'semi', name: 'Semi-auto Magnum 3½"', short: 'Magnum 12',
    desc: 'Puissance et portée pour les oies. Lourd, fort recul.', price: 3200, level: 5,
    gauge: 12, pellets: 1.4, spread: 0.0118, mag: 3, cycle: 0.22, reload: 0.45, perShell: true, recoil: 1.5, sway: 1.15, weight: 3.6, range: 1.2,
    optic: 'bead', look: { barrel: 0.76, stock: 'droit', wood: 'camo', metal: 'noir', semi: true },
  },
  {
    id: 's_or', kind: 'shotgun', action: 'break', name: 'Superposé « Or Royal »', short: 'Or Royal',
    desc: 'Arme de collection gravée à l\'or fin. Gerbe parfaite.', exclusive: true, level: 1,
    gauge: 12, pellets: 1.15, spread: 0.0105, mag: 2, cycle: 0.1, reload: 1.2, recoil: 0.8, sway: 0.55, weight: 3.3, range: 1.15,
    optic: 'bead', look: { barrel: 0.74, stock: 'anglais', wood: 'ronceux', metal: 'or', ou: true, engraved: true },
    unlock: { text: 'Obtenir un canard Diamant ou 3 canards Or', any: [{ medal: 'diamant', duck: true }], count: { medal: 'or', n: 3, duck: true } },
  },
];

export const AMMO = [
  { id: 'std', name: 'Balle à expansion (standard)', kind: 'rifle', price: 0, desc: 'Balle chemisée à pointe molle.', pen: 1.0, integrity: 1.0 },
  { id: 'cuivre', name: 'Balle sans plomb cuivre', kind: 'rifle', price: 350, level: 3, desc: 'Monolithique : pénétration profonde, venaison préservée.', pen: 1.25, integrity: 1.15 },
  { id: 'acier4', name: 'Acier n°4', kind: 'shotgun', price: 0, pellets: 10, dmg: 13, range: 40, speed: 420, spreadMul: 0.9, desc: 'Plomb interdit à moins de 100 m de l\'eau : acier obligatoire.' },
  { id: 'acier2', name: 'Acier n°2 (oies)', kind: 'shotgun', price: 150, level: 2, pellets: 8, dmg: 18, range: 46, speed: 410, spreadMul: 0.95, desc: 'Plombs plus gros pour les oies.' },
  { id: 'bismuth', name: 'Bismuth n°4', kind: 'shotgun', price: 380, level: 3, pellets: 11, dmg: 15, range: 46, speed: 400, spreadMul: 0.95, desc: 'Énergie proche du plomb, sans toxicité.' },
  { id: 'tss', name: 'Tungstène TSS n°7', kind: 'shotgun', price: 900, level: 6, pellets: 15, dmg: 16, range: 58, speed: 400, spreadMul: 0.85, desc: 'Le nec plus ultra : densité et portée hors norme.' },
];

export const OPTICS = {
  scope39: { name: 'Lunette 3-9×40', kind: 'scope', zoom: [3, 9], reticle: 'duplex', price: 0 },
  scope2515: { name: 'Lunette 2,5-15×56 éclairée', kind: 'scope', zoom: [2.5, 15], reticle: 'r4', illum: true, price: 1500, level: 4 },
  scope416: { name: 'Lunette 4-16×50 tir long', kind: 'scope', zoom: [4, 16], reticle: 'mildot', price: 2200, level: 6 },
  reddot: { name: 'Viseur point rouge', kind: 'dot', zoom: [1, 1.5], reticle: 'dot', price: 600, level: 3 },
  iron: { name: 'Organes de visée', kind: 'iron', zoom: [1.25, 1.25], price: 0 },
  bead: { name: 'Bande et guidon', kind: 'bead', zoom: [1.12, 1.12], price: 0 },
};

export const GEAR = [
  { id: 'jum8', name: 'Jumelles 8×42', price: 0, slot: 'binoc', zoom: 8, desc: 'Touche B : observer et identifier le gibier.' },
  { id: 'jum10t', name: 'Jumelles télémètre 10×42', price: 900, level: 3, slot: 'binoc', zoom: 10, range: true, desc: 'Mesure la distance et estime le trophée.' },
  { id: 'app_cerf', name: 'Appeau à cerf (brame)', price: 250, level: 2, slot: 'call', call: 'cerf', desc: 'Touche F : imite le brame. Les cerfs en rut viennent défier l\'intrus.' },
  { id: 'app_chev', name: 'Appeau à chevreuil', price: 150, level: 1, slot: 'call', call: 'chevreuil', desc: 'Imite le « fiep » de la chevrette : attire les brocards.' },
  { id: 'app_canard', name: 'Appeau à canard', price: 100, level: 1, slot: 'call', call: 'canard', desc: 'Attire les vols de canards vers vos appelants.' },
  { id: 'appelants', name: 'Appelants (formes)', price: 300, level: 1, slot: 'decoys', desc: 'Plus de canards se posent devant la hutte.' },
  { id: 'baton', name: 'Bâton de tir', price: 180, level: 1, slot: 'sticks', desc: 'Touche V : appui stable debout, tremblement fortement réduit.' },
  { id: 'chien', name: 'Labrador rapporteur', price: 1800, level: 3, slot: 'dog', desc: 'Rapporte vos canards : +20 % de gains au gibier d\'eau.' },
];

// Tenues : facteur de visibilité par milieu (plus bas = plus discret)
export const OUTFITS = [
  { id: 'loden', name: 'Tenue loden classique', price: 0, colors: ['#3f4a35', '#2d3527', '#5b4a32'], pattern: 'loden', vis: { forest: 0.9, meadow: 0.95, marsh: 1, rock: 1 } },
  { id: 'battue', name: 'Gilet de battue orange', price: 80, colors: ['#ff6a00', '#d95500', '#2d3527'], pattern: 'orange', vis: { forest: 0.95, meadow: 1, marsh: 1, rock: 1 }, desc: 'Obligatoire en battue. Les cervidés distinguent mal l\'orange.' },
  { id: 'automne', name: 'Camouflage forêt d\'automne', price: 600, level: 2, colors: ['#5b3b1f', '#8a5a2b', '#2e2a1c', '#a97b3d'], pattern: 'leaves', vis: { forest: 0.65, meadow: 0.85, marsh: 0.9, rock: 0.9 } },
  { id: 'roseaux', name: 'Camouflage roseaux (marais)', price: 500, level: 2, colors: ['#8a7c52', '#5e5536', '#b0a070', '#3e3a28'], pattern: 'reeds', vis: { forest: 0.85, meadow: 0.8, marsh: 0.6, rock: 0.95 } },
  { id: 'roche', name: 'Tenue montagne gris roche', price: 600, level: 3, colors: ['#6e6c66', '#4d4b46', '#8f8c84'], pattern: 'rock', vis: { forest: 0.95, meadow: 0.9, marsh: 1, rock: 0.6 } },
  { id: 'ghillie', name: 'Tenue ghillie', price: 2400, level: 6, colors: ['#4a5a2a', '#6a6a3a', '#3a3a20', '#7a6a40'], pattern: 'ghillie', vis: { forest: 0.55, meadow: 0.55, marsh: 0.6, rock: 0.7 } },
  { id: 'tweed', name: 'Tenue tweed « Gentleman »', exclusive: true, colors: ['#6b5a3e', '#4a3d2a', '#8a7a55'], pattern: 'tweed', vis: { forest: 0.85, meadow: 0.9, marsh: 0.95, rock: 0.95 },
    unlock: { text: 'Obtenir 3 trophées Or', count: { medal: 'or', n: 3 } } },
  { id: 'veneur', name: 'Tenue « Grand Veneur »', exclusive: true, colors: ['#1f3a2a', '#a8323a', '#c9a45c'], pattern: 'veneur', vis: { forest: 0.8, meadow: 0.85, marsh: 0.9, rock: 0.9 },
    unlock: { text: 'Obtenir un trophée Diamant', any: [{ medal: 'diamant' }] } },
];

// Finitions d'arme (bois + métal)
export const SKINS = [
  { id: 'std', name: 'Noyer et bronzage (d\'origine)', price: 0, wood: null, metal: null },
  { id: 'ronceux', name: 'Noyer ronceux', price: 400, level: 2, wood: 'ronceux' },
  { id: 'lamelle', name: 'Bois lamellé gris', price: 300, level: 2, wood: 'lamelle' },
  { id: 'synth', name: 'Synthétique noir', price: 200, level: 1, wood: 'synthetique', metal: 'noir' },
  { id: 'camo_auto', name: 'Camouflage forêt d\'automne', price: 350, level: 2, wood: 'camo' },
  { id: 'camo_ros', name: 'Camouflage roseaux', price: 350, level: 2, wood: 'camo_ros' },
  { id: 'cerakote', name: 'Cerakote vert olive', price: 300, level: 3, metal: 'olive' },
  { id: 'gravure', name: 'Gravure argent', price: 1500, level: 6, metal: 'inox', engraved: true },
  { id: 'damas', name: 'Canons damas', price: 2500, level: 8, metal: 'damas' },
  { id: 'or', name: 'Gravure à l\'or', exclusive: true, wood: 'ronceux', metal: 'or', engraved: true,
    unlock: { text: 'Obtenir un trophée Diamant', any: [{ medal: 'diamant' }] } },
  { id: 'brame', name: 'Gravure « Cerf bramant »', exclusive: true, metal: 'inox', engraved: true, wood: 'ronceux',
    unlock: { text: 'Obtenir un cerf médaille d\'Or', any: [{ species: 'cerf', medal: 'or' }] } },
];

const MEDAL_RANK = { aucune: 0, bronze: 1, argent: 2, or: 3, diamant: 4, legendaire: 5 };
export const DUCKS = new Set(['colvert', 'sarcelle', 'pilet', 'siffleur', 'souchet', 'milouin', 'oie']);

// Conditions de déblocage par trophées
export function trophyCondition(cond, trophies) {
  const ok = (c) => trophies.some((t) =>
    (!c.species || t.species === c.species) &&
    (!c.big || !DUCKS.has(t.species)) &&
    (!c.duck || DUCKS.has(t.species)) &&
    MEDAL_RANK[t.medal] >= MEDAL_RANK[c.medal]);
  if (cond.all && cond.all.every(ok)) return true;
  if (cond.any && cond.any.some(ok)) return true;
  if (cond.count) {
    const n = trophies.filter((t) => MEDAL_RANK[t.medal] >= MEDAL_RANK[cond.count.medal] && (!cond.count.duck || DUCKS.has(t.species))).length;
    if (n >= cond.count.n) return true;
  }
  return false;
}

export function findItem(id) {
  return WEAPONS.find((w) => w.id === id) || AMMO.find((a) => a.id === id) || GEAR.find((g) => g.id === id) ||
    OUTFITS.find((o) => o.id === id) || SKINS.find((s) => s.id === id) || (OPTICS[id] ? { id, ...OPTICS[id] } : null);
}

export const xpForLevel = (lvl) => Math.round(600 * Math.pow(lvl - 1, 1.5));
