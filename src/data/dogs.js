// Chiens de chasse : races proposées au chenil. Champ build = silhouette du modèle 3D
// ('retriever' | 'pointer' | 'hound' | 'terrier' | 'dachshund'), height = hauteur au garrot (m),
// colors = robes possibles (sRGB 0..1 : [base, marques]).
export const DOG_BREEDS = [
  { id: 'labrador', name: 'Labrador retriever', role: 'rapport', build: 'retriever', height: 0.57, price: 1800, level: 1,
    colors: [{ id: 'sable', name: 'Sable', base: [0.86, 0.72, 0.48] }, { id: 'noir', name: 'Noir', base: [0.06, 0.055, 0.05] }, { id: 'chocolat', name: 'Chocolat', base: [0.32, 0.2, 0.13] }],
    stats: { rapport: 0.95, flair: 0.7, nage: 0.95, vitesse: 0.7, endurance: 0.8, sang: 0.4 },
    desc: 'Le rapporteur par excellence : calme à la hutte, infatigable dans l\'eau froide.' },
];
