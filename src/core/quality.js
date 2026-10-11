// Détection de l'appareil et préréglages graphiques.

const ua = navigator.userAgent || '';
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);
export const isMobile = isIOS || isAndroid || /Mobi/.test(ua);
export const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
export const isPhone = isMobile && Math.min(screen.width, screen.height) < 600;

// Paramètres par niveau. Tout ce qui coûte cher est ici.
export const PRESETS = {
  bas: {
    label: 'Bas', pixelRatio: 1.0, antialias: false, shadowSize: 1024, shadowDist: 45,
    texSize: 512, grassRadius: 22, grassDensity: 1.6, treeNear: 45, treeMid: 160, viewDist: 520,
    terrainLod: [70, 180, 380], animalsFull: 90, reflections: false, post: false, fur: false, maxAnimals: 50,
  },
  moyen: {
    label: 'Moyen', pixelRatio: 1.35, antialias: true, shadowSize: 2048, shadowDist: 60,
    texSize: 1024, grassRadius: 30, grassDensity: 2.4, treeNear: 60, treeMid: 220, viewDist: 700,
    terrainLod: [90, 230, 480], animalsFull: 130, reflections: true, post: false, fur: true, maxAnimals: 70,
  },
  eleve: {
    label: 'Élevé', pixelRatio: 1.6, antialias: true, shadowSize: 2048, shadowDist: 80,
    texSize: 1024, grassRadius: 44, grassDensity: 3.4, treeNear: 85, treeMid: 300, viewDist: 900,
    terrainLod: [120, 300, 620], animalsFull: 180, reflections: true, post: true, fur: true, maxAnimals: 90,
  },
  ultra: {
    label: 'Ultra', pixelRatio: 2.0, antialias: true, shadowSize: 4096, shadowDist: 110,
    texSize: 1024, grassRadius: 58, grassDensity: 4.4, treeNear: 120, treeMid: 420, viewDist: 1100,
    terrainLod: [150, 380, 760], animalsFull: 240, reflections: true, post: true, fur: true, maxAnimals: 110,
  },
  // Ultra Max : tout au maximum (feuillage le plus détaillé, ombres et herbe très lointaines) — ordinateurs puissants
  ultramax: {
    label: 'Ultra Max', pixelRatio: 2.0, antialias: true, shadowSize: 4096, shadowDist: 150,
    texSize: 2048, grassRadius: 80, grassDensity: 5.6, treeNear: 180, treeMid: 560, viewDist: 1400,
    terrainLod: [190, 460, 900], animalsFull: 320, reflections: true, post: true, fur: true, maxAnimals: 130,
    ultramax: true,
  },
};
// Niveau de détail du feuillage (0 : simple, 1 : normal, 2 : maximal) et nombre de coques de fourrure
for (const [k, p] of Object.entries(PRESETS)) {
  p.foliage = k === 'ultramax' ? 2 : k === 'bas' ? 0 : 1;
  p.furShells = { bas: 0, moyen: 6, eleve: 8, ultra: 12, ultramax: 16 }[k];
}

export function defaultQuality() {
  if (isPhone) return 'moyen';
  if (isMobile) return 'moyen';
  return 'eleve';
}

export function getPreset(name) {
  return PRESETS[name] || PRESETS[defaultQuality()];
}
