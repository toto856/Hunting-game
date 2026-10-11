// Progression du chasseur : stockage local + synchronisation entre appareils (Mac / iPhone)
// quand le jeu est ouvert depuis Claude (base de données privée par joueur).
import { WEAPONS, OUTFITS, SKINS, AMMO, OPTICS, GEAR, trophyCondition, xpForLevel } from '../data/catalog.js';

const KEY = 'hautevallee_save_v1';

const defaults = () => ({
  v: 1,
  t: 0,
  money: 1500,
  xp: 0,
  owned: ['r_308', 's_ou12', 'std', 'acier4', 'scope39', 'iron', 'bead', 'jum8', 'loden', 'skin:std', 'app_canard'],
  loadout: { rifle: 'r_308', shotgun: 's_ou12', ammoRifle: 'std', ammoShot: 'acier4', binoc: 'jum8', call: 'app_canard', outfit: 'loden' },
  scopes: {}, // arme -> optique montée
  skins: {}, // arme -> finition
  trophies: [], // { id, species, sex, score, medal, weight, fur, trophy, date, dist, organs, quality, weapon, legendary }
  stats: { shots: 0, hits: 0, kills: {}, longest: 0, sessions: 0, ethical: 0, unethical: 0, fines: 0, ducks: 0 },
  options: { sens: 1, touchSens: 1, invertY: false, volume: 0.8, music: 0.4, quality: null, fov: 72, aimToggle: false, hints: true, birdSpeed: 1 },
  last: { mode: 'gros', hour: 7.5, weather: 'clair', stand: 'lodge', region: 'france', density: 'normale' },
  rewards: [], // objets gagnés grâce aux trophées (déjà notifiés)
  // ---- v3
  wear: {}, // tenue portée : emplacement (tete, haut, veste, bas, pieds, mains, gilet) -> id d'article
  backpack: [], // ids des équipements emportés dans le sac à dos
  dogs: [], // chiens possédés : { id, breed, name }
  lodge: { level: 0, rooms: {} }, // 0 abri, 1 pavillon, 2 grand domaine ; niveau de chaque pièce
  regions: ['france'], // destinations de chasse débloquées
  account: null, // { email, id } : compte du joueur (progression retrouvée sur un autre appareil)
  day: 0, // jours écoulés (nuits passées à la chambre)
});

let state = defaults();
let frozen = false; // mode démonstration : rien n'est enregistré
let cloud = null; // { ref, ready }
let writeTimer = null;
let writing = false;
const listeners = new Set();

function merge(base, d) {
  const old = !('lodge' in d) && (d.trophies || d.owned); // sauvegarde antérieure aux améliorations du pavillon
  const out = Object.assign(base, d);
  const def = defaults();
  // Objets simples : valeurs par défaut complétées par la sauvegarde
  for (const k of ['loadout', 'stats', 'options', 'last', 'wear', 'lodge']) out[k] = Object.assign(def[k], d[k] || {});
  out.lodge.rooms = Object.assign({}, (d.lodge && d.lodge.rooms) || {});
  out.scopes = d.scopes || {};
  out.skins = d.skins || {};
  out.trophies = d.trophies || [];
  out.rewards = d.rewards || [];
  out.backpack = d.backpack || [];
  out.dogs = d.dogs || [];
  out.regions = d.regions || def.regions;
  // Les joueurs qui avaient déjà le pavillon le gardent
  if (old) out.lodge.level = Math.max(out.lodge.level, 1);
  for (const id of def.owned) if (!out.owned.includes(id)) out.owned.push(id);
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = merge(defaults(), JSON.parse(raw));
  } catch (e) {
    state = defaults();
  }
  return state;
}

export function get() { return state; }

function writeLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
}

export function freeze() { frozen = true; }

export function write() {
  if (frozen) return;
  state.t = Date.now();
  writeLocal();
  // Écriture distante groupée (une à la fois)
  if (cloud && cloud.ref) {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(pushCloud, 1500);
  }
}

async function pushCloud() {
  if (!cloud || !cloud.ref || writing) return;
  writing = true;
  try {
    await cloud.ref.set({ save: JSON.stringify(state), t: state.t });
    cloud.ok = true;
  } catch (e) {
    cloud.ok = false;
    if (e && e.code === 'invalid_argument') cloud.ref = null; // lecture seule pour ce visiteur
  } finally {
    writing = false;
  }
}

// Connexion à la sauvegarde partagée entre appareils (si disponible)
export async function initCloud() {
  if (frozen) return false;
  try {
    const c = window.claude;
    if (!c || !c.use) return false;
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if (!db || !user) return false;
    const uid = await user.id();
    if (!uid) return false;
    const ref = db.collection('data/users/' + uid).doc('save');
    cloud = { ref, ok: false };
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data();
      const remote = JSON.parse(d.save || '{}');
      if ((remote.t || 0) > (state.t || 0)) {
        state = merge(defaults(), remote);
        writeLocal();
        for (const f of listeners) f('cloud');
      } else if ((state.t || 0) > (remote.t || 0)) pushCloud();
    } else pushCloud();
    cloud.ok = true;
    return true;
  } catch (e) {
    return false;
  }
}

export function cloudStatus() {
  if (!cloud) return 'local';
  return cloud.ok ? 'sync' : 'local';
}

export function onChange(f) { listeners.add(f); }

export function reset() {
  state = defaults();
  write();
}

export function level() {
  let l = 1;
  while (state.xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function levelProgress() {
  const l = level();
  const a = xpForLevel(l), b = xpForLevel(l + 1);
  return { level: l, cur: state.xp - a, need: b - a };
}

export const owns = (id) => state.owned.includes(id);

// État d'un article : 'owned' | 'buy' | 'level' | 'locked' | 'reward'
export function itemStatus(item, key = item.id) {
  if (owns(key)) return 'owned';
  if (item.unlock && trophyCondition(item.unlock, state.trophies)) return 'reward';
  if (item.exclusive) return 'locked';
  if ((item.level || 1) > level()) return 'level';
  return 'buy';
}

export function buy(item, key = item.id) {
  const st = itemStatus(item, key);
  if (st === 'reward') {
    state.owned.push(key);
    write();
    return { ok: true, free: true };
  }
  if (st !== 'buy') return { ok: false };
  if (state.money < (item.price || 0)) return { ok: false, money: true };
  state.money -= item.price || 0;
  state.owned.push(key);
  write();
  return { ok: true };
}

// Nouveaux objets gagnés par les trophées (à annoncer)
export function newRewards() {
  const all = [...WEAPONS, ...OUTFITS, ...SKINS.map((s) => ({ ...s, id: 'skin:' + s.id }))];
  const out = [];
  for (const it of all) {
    if (!it.unlock || owns(it.id) || state.rewards.includes(it.id)) continue;
    if (trophyCondition(it.unlock, state.trophies)) {
      state.rewards.push(it.id);
      out.push(it);
    }
  }
  if (out.length) write();
  return out;
}

export function addTrophy(t) {
  state.trophies.push(t);
  write();
}

export const catalog = { WEAPONS, OUTFITS, SKINS, AMMO, OPTICS, GEAR };
