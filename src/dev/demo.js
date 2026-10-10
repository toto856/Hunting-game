// Progression de démonstration (contrôle visuel du pavillon) : ?demo=trophees
// Rien n'est enregistré : la sauvegarde du joueur n'est jamais modifiée.
import { makeTrophy } from '../animals/trophies.js';
import { SPECIES } from '../animals/species.js';
import { BIRDS, BirdSystem } from '../animals/birds.js';
import { rng } from '../core/math.js';
import * as Save from '../core/save.js';

export function fillDemo() {
  Save.freeze();
  const s = Save.get();
  const r = rng(4242);
  const list = [];
  const add = (species, sex, q, age, fur) => {
    const t = makeTrophy(species, Math.floor(r() * 1e6), q, age);
    list.push({ id: 'demo' + list.length, species, sex, score: t ? t.score : 0, medal: t ? t.medal : 'aucune', weight: SPECIES[species].weight.m[1] * 0.9,
      fur: fur || SPECIES[species].furs[0].id, trophy: t, date: Date.now() - list.length * 864e5, dist: 80 + Math.round(r() * 160), scale: 1, weapon: '.308 Win' });
  };
  add('cerf', 'm', 1.05, 1.0);
  add('cerf', 'm', 0.75, 0.8, 'gris');
  add('cerf', 'm', 0.5, 0.6);
  add('chevreuil', 'm', 0.95, 0.9);
  add('chevreuil', 'm', 0.6, 0.7, 'menil');
  add('sanglier', 'm', 0.9, 0.95);
  add('sanglier', 'm', 0.6, 0.7);
  add('chamois', 'm', 0.85, 0.9);
  add('daim', 'm', 0.95, 0.9);
  add('daim', 'm', 0.6, 0.6);
  for (const [sp, sex] of [['colvert', 'm'], ['colvert', 'f'], ['sarcelle', 'm'], ['pilet', 'm'], ['oie', 'm'], ['siffleur', 'm']]) {
    const b = BIRDS[sp];
    const w = b.weight[0] + (b.weight[1] - b.weight[0]) * (0.75 + r() * 0.25);
    list.push({ id: 'demo' + list.length, species: sp, sex, score: w, medal: BirdSystem.medal(sp, w), weight: w, date: Date.now(), dist: 0, duck: true });
  }
  s.trophies = list;
  s.money = 12500;
  s.xp = 9000;
  s.owned.push('r_7x64', 'r_300wm', 's_sxs12', 'automne', 'ghillie', 'skin:ronceux');
  s.skins.r_7x64 = 'ronceux';
}
