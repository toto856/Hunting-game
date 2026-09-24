// Sauvegarde locale de la progression.
'use strict';
HG.save = (() => {
  const KEY = 'terres_sauvages_v1';
  const defaults = () => ({
    xp: 0, money: 1800,
    weapons: ['pompe12', 'c22lr'],
    optics: ['none'],
    dogs: [],
    equipment: [],
    ammo: { c12_p75: 50, c12_p6: 25, r22: 50 },
    options: { sensitivity: 1, volume: 0.8, invertY: false, quality: 'high', fov: 70, crosshair: true, hints: true },
    loadout: { primary: 'pompe12', secondary: 'c22lr', scope: { c22lr: 'none' }, ammo: { pompe12: 'c12_p6', c22lr: 'r22' }, choke: 'mod', dog: 'none', zero: 100 },
    last: { mode: 'lobby', weather: 'auto' },
    stats: { hunts: 0, shots: 0, hits: 0, kills: {}, best: {}, longest: 0, fines: 0, earned: 0, clays: 0, claysShot: 0, playTime: 0, bestTrap: 0, bestSkeet: 0, bestSporting: 0, wounded: 0 },
    licences: {},
  });
  let state = defaults();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw), def = defaults();
        state = Object.assign(def, d);
        state.options = Object.assign(def.options, d.options || {});
        state.loadout = Object.assign(def.loadout, d.loadout || {});
        state.loadout.scope = Object.assign({}, d.loadout && d.loadout.scope || {});
        state.loadout.ammo = Object.assign(def.loadout.ammo, d.loadout && d.loadout.ammo || {});
        state.stats = Object.assign(def.stats, d.stats || {});
        state.ammo = Object.assign({}, d.ammo || def.ammo);
      }
    } catch (e) { state = defaults(); }
    return state;
  }
  function write() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } }
  function reset() { state = defaults(); write(); }
  function level() { let l = 1; while (state.xp >= HG.data.xpForLevel(l + 1) && l < 10) l++; return l; }
  const get = () => state;
  const has = (cat, id) => (state[cat] || []).includes(id);
  return { load, write, reset, level, get, has };
})();
