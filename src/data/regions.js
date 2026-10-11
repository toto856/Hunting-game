// Destinations de chasse : le domaine en France et les voyages à l'étranger (salle des voyages du pavillon).
// fauna : espèces présentes (identifiants de SPECIES ; celles qui n'existent pas encore sont ignorées).
export const REGIONS = {
  france: {
    id: 'france', name: 'Domaine de Hautevallée', country: 'France', price: 0, level: 1,
    desc: 'Forêts de feuillus, prairies, étangs et contreforts : le domaine familial.',
    fauna: ['cerf', 'chevreuil', 'sanglier', 'chamois', 'daim'], birds: ['colvert', 'sarcelle', 'pilet', 'siffleur', 'souchet', 'milouin', 'oie'],
    modes: ['gros', 'battue', 'canard'],
  },
  ecosse: {
    id: 'ecosse', name: 'Highlands', country: 'Écosse', price: 4500, level: 4,
    desc: 'Landes de bruyère, lochs et tourbières : approche du cerf et chasse du lagopède.',
    fauna: ['cerf', 'chevreuil', 'sika'], birds: ['lagopede', 'faisan', 'colvert', 'sarcelle'],
    modes: ['gros', 'petitgibier', 'canard'],
  },
  siberie: {
    id: 'siberie', name: 'Taïga de l\'Altaï', country: 'Sibérie', price: 9000, level: 7,
    desc: 'Taïga enneigée de bouleaux et de mélèzes : ours brun, élan, maral et loup.',
    fauna: ['ours', 'elan', 'wapiti', 'chevreuil', 'sanglier', 'loup'], birds: ['tetras'],
    modes: ['gros'],
  },
  amerique: {
    id: 'amerique', name: 'Rocheuses du Montana', country: 'États-Unis', price: 7500, level: 6,
    desc: 'Prairies, trembles et pins ponderosa au pied des Rocheuses : wapiti, cerfs, ours et orignal.',
    fauna: ['wapiti', 'virginie', 'mulet', 'elan', 'oursnoir', 'ours', 'pronghorn', 'bighorn', 'loup'], birds: ['dindon', 'bernache', 'colvert'],
    modes: ['gros', 'canard'],
  },
  alpes: {
    id: 'alpes', name: 'Haute montagne', country: 'Alpes', price: 3500, level: 3,
    desc: 'Alpages, mélèzins et éboulis sous les sommets : chamois, bouquetin et mouflon.',
    fauna: ['chamois', 'bouquetin', 'mouflon', 'chevreuil', 'cerf'], birds: ['tetraslyre'],
    modes: ['gros'],
  },
};

export const REGION_LIST = Object.values(REGIONS);
