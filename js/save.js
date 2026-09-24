// Sauvegarde de la progression (localStorage).
'use strict';

DH.save = (() => {
  const KEY = 'passee_save_v1';

  const defaults = () => ({
    xp: 0,
    money: 300,
    weapons: ['pump'],
    cartridges: ['lead6'],
    equipment: [],
    options: { sensitivity: 1, volume: 0.8, invertY: false, quality: 'high', fov: 75, crosshair: true },
    last: { map: 'marais', mode: 'classique', weather: 'auto', time: 'jour', loadout: ['pump', null], cartridge: 'lead6', choke: 'mod' },
    stats: { hunts: 0, shots: 0, hits: 0, kills: {}, best: {}, longest: 0, protectedShot: 0, clays: 0, playTime: 0 },
  });

  let state = defaults();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const def = defaults();
        state = Object.assign(def, d);
        state.options = Object.assign(def.options, d.options || {});
        state.last = Object.assign(def.last, d.last || {});
        state.stats = Object.assign(def.stats, d.stats || {});
      }
    } catch (e) {
      state = defaults();
    }
    return state;
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* stockage indisponible : la partie continue sans sauvegarde */ }
  }

  function reset() {
    state = defaults();
    write();
  }

  function level() {
    let l = 1;
    while (state.xp >= DH.data.xpForLevel(l + 1)) l++;
    return l;
  }

  const get = () => state;

  return { load, write, reset, level, get };
})();
