// Interface : menus, hub (chasses, armurerie, chenil, carnet, réglages), HUD, cartes, bilans.
'use strict';
HG.UI = class UI {
  constructor(game) {
    this.g = game; const $ = HG.util.$; this.$ = $; this.overlayOpen = false; this.feedEl = $('feed'); this.hintT = 0; this.mapOpen = false; this.hudT = 0; this.labelT = 0;
    $('menu-root').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.action(b.dataset.act, b.dataset); });
    $('overlay').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.action(b.dataset.act, b.dataset); });
    $('pause').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.action(b.dataset.act, b.dataset); });
    document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.g.running && this.overlayOpen && !this.$('overlay').classList.contains('locked')) this.closeOverlay(); });
    this.buildCompass(); this.buildReticle();
  }
  // ================================================================ MENU PRINCIPAL
  showMainMenu() {
    const S = this.g.save, D = HG.data, U = HG.util, lvl = HG.save.level(); this.closeAll();
    const r = this.$('menu-root'); r.classList.remove('hidden'); r.innerHTML = `
      <div class="menu-bg"></div>
      <div class="menu-card">
        <h1>TERRES<span>SAUVAGES</span></h1>
        <p class="tag">Simulateur de chasse réaliste — 11 modes, 6 territoires, 26 espèces, ball-trap, chiens et armurerie</p>
        <div class="menu-stats"><b>${D.levelTitle(lvl)}</b> · niveau ${lvl} · ${U.money(S.money)} · ${Object.values(S.stats.kills).reduce((a, b) => a + b, 0)} prises</div>
        <button class="big" data-act="lobby">▶ Entrer au camp d'entraînement</button>
        <div class="row"><button data-act="hub" data-tab="chasses">🗺️ Chasses</button><button data-act="hub" data-tab="armurerie">🔫 Armurerie</button><button data-act="hub" data-tab="chenil">🐕 Chenil</button><button data-act="hub" data-tab="carnet">📖 Carnet</button><button data-act="hub" data-tab="reglages">⚙️ Réglages</button></div>
        <p class="help">Souris : regarder · Clic gauche : tir · Clic droit : viser · Molette : zoom lunette · ZQSD/WASD : marcher · Maj : courir · C : accroupi · Z/X : couché · H : bloquer le souffle · R : recharger · E : agir / PULL · Q : appeau · F : chien · B : jumelles · M : carte · L : zéro lunette · K : choke · 1/2 : arme · Tab : menu</p>
      </div>`;
  }
  action(act, d) {
    const g = this.g, A = HG.audio; A.init(); A.uiClick();
    if (act === 'lobby') { this.$('menu-root').classList.add('hidden'); g.startMode('lobby'); }
    else if (act === 'hub') this.openHub(d.tab);
    else if (act === 'close') this.closeOverlay();
    else if (act === 'resume') g.resume();
    else if (act === 'quit') { g.stop(); this.showMainMenu(); }
    else if (act === 'endhunt') { this.closeOverlay(); g.endHunt('Retour au camp'); }
    else if (act === 'camp') g.backToCamp();
    else if (act === 'mode') this.showModeDetail(d.id);
    else if (act === 'start') this.startHunt(d.id);
    else if (act === 'buy') this.buy(d.cat, d.id);
    else if (act === 'equip') this.equip(d.cat, d.id, d.slot);
    else if (act === 'set') this.setOption(d.key, d.val);
    else if (act === 'reset') { if (confirm('Effacer toute la progression ?')) { HG.save.reset(); g.save = HG.save.get(); location.reload(); } }
    else if (act === 'tab') this.openHub(d.tab);
    else if (act === 'clay') { this.closeOverlay(); g.clays.start(d.disc, false); }
  }
  // ================================================================ HUB
  openHub(tab = 'chasses') {
    const g = this.g; if (g.running && document.pointerLockElement) document.exitPointerLock();
    this.overlayOpen = true; const o = this.$('overlay'); o.classList.remove('hidden', 'locked'); const S = g.save, U = HG.util, lvl = HG.save.level();
    const tabs = [['chasses', '🗺️ Chasses'], ['armurerie', '🔫 Armurerie'], ['chenil', '🐕 Chenil'], ['carnet', '📖 Carnet'], ['reglages', '⚙️ Réglages']];
    let body = '';
    if (tab === 'chasses') body = this.hubChasses(); else if (tab === 'armurerie') body = this.hubArmurerie(); else if (tab === 'chenil') body = this.hubChenil(); else if (tab === 'carnet') body = this.hubCarnet(); else body = this.hubReglages();
    o.innerHTML = `<div class="panel hub"><div class="hub-head"><div class="tabs">${tabs.map(([id, n]) => `<button class="${id === tab ? 'on' : ''}" data-act="tab" data-tab="${id}">${n}</button>`).join('')}</div><div class="wallet">💰 <b id="money">${U.money(S.money)}</b> · ${HG.data.levelTitle(lvl)} (niv. ${lvl}) <span class="xpbar"><i style="width:${this.xpPct()}%"></i></span></div><button class="x" data-act="${g.running ? 'resume' : 'close'}">✕</button></div><div class="hub-body">${body}</div></div>`;
  }
  xpPct() { const S = this.g.save, l = HG.save.level(), a = HG.data.xpForLevel(l), b = HG.data.xpForLevel(l + 1); return Math.round(HG.util.clamp((S.xp - a) / (b - a), 0, 1) * 100); }
  hubChasses() {
    const D = HG.data, S = this.g.save, lvl = HG.save.level(), U = HG.util;
    return `<div class="grid modes">${Object.entries(D.modes).map(([id, m]) => { const locked = lvl < m.level; return `<div class="card mode ${locked ? 'locked' : ''}" data-act="${locked ? '' : 'mode'}" data-id="${id}"><div class="ico">${m.icon}</div><h3>${m.name}</h3><div class="sub">${D.maps[m.map].name}${m.duration ? ' · ' + m.hours[0] + 'h → ' + (m.hours[0] + m.duration) + 'h' : ''}</div><p>${m.desc}</p><div class="foot">${locked ? '🔒 Niveau ' + m.level : (m.licence ? 'Licence ' + U.money(m.licence) : 'Gratuit')} · ${m.weapons === 'all' ? 'Toutes armes' : m.weapons === 'rifle' ? 'Carabine' : m.weapons === 'shotgun' ? 'Fusil' : m.weapons === 'bow' ? 'Arc' : 'Carabine / fusil (balles)'}</div></div>`; }).join('')}</div>`;
  }
  showModeDetail(id) {
    const D = HG.data, m = D.modes[id], S = this.g.save, U = HG.util, g = this.g; const o = this.$('overlay'); const map = D.maps[m.map];
    const ids = g.allowedLoadout ? g.allowedLoadout(id) : []; const okW = ids.length > 0; const ammoOk = ids.every((w) => (S.ammo[S.loadout.ammo[w] || ''] || 0) > 0 || Object.keys(D.ammo).some((a) => D.ammo[a].cal === D.weapons[w].cal && S.ammo[a] > 0));
    const species = Object.keys(m.spawn).map((sp) => { const s = D.species[sp]; return `<span class="chip ${s.illegal ? 'bad' : ''}">${s.name}${m.quota && m.quota[sp] ? ' ×' + m.quota[sp] : ''}${s.illegal ? ' ⛔' : ''}</span>`; }).join('');
    const weathers = ['auto', ...Object.keys(D.weather)].map((w) => `<option value="${w}" ${S.last.weather === w ? 'selected' : ''}>${w === 'auto' ? 'Météo du jour (aléatoire)' : D.weather[w].name}</option>`).join('');
    o.innerHTML = `<div class="panel detail"><button class="x" data-act="tab" data-tab="chasses">←</button><div class="ico">${m.icon}</div><h2>${m.name}</h2><div class="sub">${map.name} — ${map.desc}</div><p>${m.desc}</p>
      ${species ? '<div class="chips">' + species + '</div>' : ''}
      <div class="form"><label>Météo <select id="sel-weather">${weathers}</select></label>
      <div class="loadout">${ids.length ? ids.map((w) => `<span class="chip">${D.weapons[w].name} · ${D.ammo[S.loadout.ammo[w]] ? D.ammo[S.loadout.ammo[w]].name : '?'} (${S.ammo[S.loadout.ammo[w]] || 0})</span>`).join('') : '<span class="chip bad">Aucune arme compatible dans votre équipement</span>'}${S.loadout.dog !== 'none' && !m.clay ? '<span class="chip">🐕 ' + D.dogs[S.loadout.dog].name + '</span>' : ''}</div>
      ${!ammoOk ? '<p class="warn">⚠️ Pas de munitions pour vos armes : passez à l\'armurerie.</p>' : ''}
      ${S.money < m.licence ? '<p class="warn">⚠️ Argent insuffisant pour la licence (' + U.money(m.licence) + ').</p>' : ''}
      <div class="row"><button data-act="tab" data-tab="armurerie">🔫 Armurerie</button><button class="big" data-act="start" data-id="${id}" ${okW && S.money >= m.licence ? '' : 'disabled'}>▶ Partir (${m.licence ? U.money(m.licence) : 'gratuit'})</button></div></div></div>`;
  }
  startHunt(id) { const S = this.g.save, m = HG.data.modes[id]; const w = this.$('sel-weather') ? this.$('sel-weather').value : 'auto'; S.last.weather = w; S.money -= m.licence; HG.save.write(); this.closeAll(); this.$('menu-root').classList.add('hidden'); this.g.startMode(id, { weather: w }); }
  hubArmurerie() {
    const D = HG.data, S = this.g.save, U = HG.util;
    const wCards = Object.entries(D.weapons).map(([id, w]) => { const own = S.weapons.includes(id); const isP = S.loadout.primary === id, isS = S.loadout.secondary === id; return `<div class="card ${own ? 'own' : ''}"><h4>${w.name}</h4><div class="sub">${w.type === 'shotgun' ? 'Fusil' : w.type === 'rifle' ? 'Carabine' : 'Arc'} · ${w.cap} coup${w.cap > 1 ? 's' : ''} · ${{ pump: 'à pompe', semi: 'semi-auto', break2: 'basculant', bolt: 'à verrou', lever: 'à levier', double: 'express', bow: 'à poulies' }[w.action]}${w.mv ? ' · ' + w.mv + ' m/s · ' + w.moa + ' MOA' : ''}</div><p>${w.desc}</p><div class="foot">${own ? `<button data-act="equip" data-cat="weapon" data-id="${id}" data-slot="primary" class="${isP ? 'on' : ''}">${isP ? '✔ Principale' : 'Principale'}</button><button data-act="equip" data-cat="weapon" data-id="${id}" data-slot="secondary" class="${isS ? 'on' : ''}">${isS ? '✔ Secondaire' : 'Secondaire'}</button>` : `<button data-act="buy" data-cat="weapons" data-id="${id}" ${S.money < w.price ? 'disabled' : ''}>Acheter ${U.money(w.price)}</button>`}</div>${own && w.scope ? this.scopeSelect(id) : ''}${own ? this.ammoSelect(id) : ''}</div>`; }).join('');
    const aCards = Object.entries(D.ammo).map(([id, a]) => `<div class="card small"><h4>${a.name}</h4><div class="sub">${a.kind === 'shot' ? a.pellets + ' plombs de ' + a.pmass + ' g' : a.kind === 'bullet' ? a.mass + ' g · BC ' + a.bc : a.kind === 'slug' ? 'Balle ' + a.pmass + ' g' : 'Flèche ' + a.mass + ' g'}${a.for ? ' · ' + a.for : ''}</div><div class="foot"><span>En stock : <b>${S.ammo[id] || 0}</b></span><button data-act="buy" data-cat="ammo" data-id="${id}" ${S.money < a.price ? 'disabled' : ''}>Boîte de ${a.box} · ${U.money(a.price)}</button></div></div>`).join('');
    const oCards = Object.entries(D.optics).filter(([id]) => id !== 'none').map(([id, o]) => `<div class="card small ${S.optics.includes(id) ? 'own' : ''}"><h4>${o.name}</h4><div class="sub">Grossissement ${o.zoom.join('/')}x${o.lowlight ? ' · lumineuse' : ''}</div><p>${o.desc || ''}</p><div class="foot">${S.optics.includes(id) ? '<span>✔ Possédée (à monter sur une carabine)</span>' : `<button data-act="buy" data-cat="optics" data-id="${id}" ${S.money < o.price ? 'disabled' : ''}>Acheter ${U.money(o.price)}</button>`}</div></div>`).join('');
    const eCards = Object.entries(D.equipment).map(([id, e]) => { const own = S.equipment.includes(id); return `<div class="card small ${own ? 'own' : ''}"><h4>${e.name}</h4><div class="sub">${e.effect}</div><div class="foot">${own && !e.consumable ? '<span>✔ Équipé</span>' : `<button data-act="buy" data-cat="equipment" data-id="${id}" ${S.money < e.price ? 'disabled' : ''}>${own ? 'Racheter' : 'Acheter'} ${U.money(e.price)}</button>`}</div></div>`; }).join('');
    const chokes = Object.entries(D.chokes).map(([id, c]) => `<button data-act="equip" data-cat="choke" data-id="${id}" class="${(S.loadout.choke || 'mod') === id ? 'on' : ''}">${c.name}</button>`).join('');
    const zeros = [50, 100, 150, 200, 300].map((z) => `<button data-act="equip" data-cat="zero" data-id="${z}" class="${(S.loadout.zero || 100) === z ? 'on' : ''}">${z} m</button>`).join('');
    return `<h3>Armes <span class="sub">Principale : ${D.weapons[S.loadout.primary] ? D.weapons[S.loadout.primary].name : '—'} · Secondaire : ${D.weapons[S.loadout.secondary] ? D.weapons[S.loadout.secondary].name : '—'}</span></h3><div class="grid">${wCards}</div>
      <h3>Réglages</h3><div class="row wrap"><span>Choke (fusils) :</span>${chokes}</div><div class="row wrap"><span>Zéro des lunettes :</span>${zeros}</div>
      <h3>Munitions</h3><div class="grid">${aCards}</div><h3>Optiques</h3><div class="grid">${oCards}</div><h3>Équipement</h3><div class="grid">${eCards}</div>`;
  }
  scopeSelect(wid) { const D = HG.data, S = this.g.save; const cur = S.loadout.scope[wid] || 'none'; return `<div class="row wrap tiny"><span>Optique :</span>${['none', ...S.optics.filter((o) => o !== 'none')].map((o) => `<button data-act="equip" data-cat="scope" data-id="${o}" data-slot="${wid}" class="${cur === o ? 'on' : ''}">${D.optics[o].name}</button>`).join('')}</div>`; }
  ammoSelect(wid) { const D = HG.data, S = this.g.save, w = D.weapons[wid]; const list = Object.entries(D.ammo).filter(([, a]) => a.cal === w.cal); const cur = S.loadout.ammo[wid]; return `<div class="row wrap tiny"><span>Munition :</span>${list.map(([id, a]) => `<button data-act="equip" data-cat="ammo" data-id="${id}" data-slot="${wid}" class="${cur === id ? 'on' : ''}">${a.name.replace(/^Cal\.\d+ /, '')} (${S.ammo[id] || 0})</button>`).join('')}</div>`; }
  hubChenil() {
    const D = HG.data, S = this.g.save, U = HG.util;
    return `<p class="lead">Un chien change tout : le retriever rapporte (même dans l'eau), le chien d'arrêt trouve et lève le petit gibier, le chien de rouge retrouve l'animal blessé. Ordres avec <b>F</b>.</p><div class="grid">${Object.entries(D.dogs).map(([id, d]) => { const own = id === 'none' || S.dogs.includes(id); const cur = (S.loadout.dog || 'none') === id; return `<div class="card ${own ? 'own' : ''}"><h4>${d.name}</h4><div class="sub">${d.role === 'retriever' ? 'Rapporteur' : d.role === 'pointer' ? 'Chien d\'arrêt' : d.role === 'tracker' ? 'Chien de sang / courant' : ''}</div><p>${d.desc || 'Partez seul.'}</p><div class="foot">${own ? `<button data-act="equip" data-cat="dog" data-id="${id}" class="${cur ? 'on' : ''}">${cur ? '✔ Sélectionné' : 'Emmener'}</button>` : `<button data-act="buy" data-cat="dogs" data-id="${id}" ${S.money < d.price ? 'disabled' : ''}>Adopter ${U.money(d.price)}</button>`}</div></div>`; }).join('')}</div>`;
  }
  hubCarnet() {
    const D = HG.data, S = this.g.save, st = S.stats, U = HG.util;
    const rows = Object.entries(D.species).map(([id, s]) => { const k = st.kills[id] || 0, b = st.best[id]; return `<tr class="${s.illegal ? 'bad' : ''}"><td>${s.name}</td><td>${s.kind === 'big' ? 'Grand gibier' : s.kind === 'small' ? 'Petit gibier' : s.kind === 'water' ? 'Gibier d\'eau' : 'Oiseau'}</td><td>${s.illegal ? '⛔ ' + s.protectedLabel : U.money(s.value)}</td><td>${k}</td><td>${b ? b.label + ' (' + b.score + '/100' + (b.dist ? ', ' + b.dist + ' m' : '') + ')' : '—'}</td></tr>`; }).join('');
    return `<div class="stats"><div><b>${st.hunts}</b> sorties</div><div><b>${st.shots}</b> tirs · <b>${st.shots ? Math.round(st.hits / st.shots * 100) : 0} %</b> au but</div><div><b>${Object.values(st.kills).reduce((a, b) => a + b, 0)}</b> prises</div><div><b>${st.wounded}</b> blessés</div><div><b>${U.money(st.earned)}</b> gagnés</div><div><b>${U.money(st.fines)}</b> d'amendes</div><div><b>${st.clays}</b> plateaux cassés / ${st.claysShot}</div><div>Records : Trap <b>${st.bestTrap}</b> · Skeet <b>${st.bestSkeet}</b> · Parcours <b>${st.bestSporting}</b></div><div>Tir le plus long : <b>${st.longest} m</b></div><div><b>${Math.round(st.playTime / 60)} min</b> de jeu</div></div>
      <table class="codex"><tr><th>Espèce</th><th>Catégorie</th><th>Valeur</th><th>Prises</th><th>Meilleur trophée</th></tr>${rows}</table>`;
  }
  hubReglages() {
    const o = this.g.save.options; const opt = (key, label, vals) => `<div class="row wrap"><span>${label}</span>${vals.map(([v, n]) => `<button data-act="set" data-key="${key}" data-val="${v}" class="${String(o[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    return opt('quality', 'Qualité graphique', [['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']]) + opt('sensitivity', 'Sensibilité souris', [[0.5, '0.5'], [0.75, '0.75'], [1, '1'], [1.5, '1.5'], [2, '2']]) + opt('fov', 'Champ de vision', [[60, '60'], [70, '70'], [80, '80'], [90, '90']]) + opt('volume', 'Volume', [[0, 'Muet'], [0.4, '40 %'], [0.8, '80 %'], [1, '100 %']]) + opt('invertY', 'Inverser l\'axe vertical', [[false, 'Non'], [true, 'Oui']]) + opt('crosshair', 'Réticule à la hanche', [[true, 'Oui'], [false, 'Non']]) + `<div class="row"><button data-act="reset">🗑️ Effacer la progression</button></div>`;
  }
  setOption(key, val) { const o = this.g.save.options; const v = val === 'true' ? true : val === 'false' ? false : isNaN(val) ? val : Number(val); o[key] = v; HG.save.write(); if (key === 'volume') HG.audio.setVolume(v); if (key === 'quality') this.g.applyQuality(v); if (key === 'fov') { this.g.baseFov = v; this.g.camera.fov = v; this.g.camera.updateProjectionMatrix(); } this.openHub('reglages'); }
  buy(cat, id) {
    const S = this.g.save, D = HG.data, A = HG.audio; let price = 0;
    if (cat === 'weapons') { price = D.weapons[id].price; if (S.money < price) return A.uiError(); S.money -= price; S.weapons.push(id); if (!S.loadout.ammo[id]) S.loadout.ammo[id] = Object.keys(D.ammo).find((a) => D.ammo[a].cal === D.weapons[id].cal); if (!S.loadout.primary || !D.weapons[S.loadout.primary]) S.loadout.primary = id; else if (!S.loadout.secondary) S.loadout.secondary = id; }
    else if (cat === 'ammo') { price = D.ammo[id].price; if (S.money < price) return A.uiError(); S.money -= price; S.ammo[id] = (S.ammo[id] || 0) + D.ammo[id].box; }
    else if (cat === 'optics') { price = D.optics[id].price; if (S.money < price) return A.uiError(); S.money -= price; S.optics.push(id); }
    else if (cat === 'equipment') { price = D.equipment[id].price; if (S.money < price) return A.uiError(); S.money -= price; if (!S.equipment.includes(id)) S.equipment.push(id); }
    else if (cat === 'dogs') { price = D.dogs[id].price; if (S.money < price) return A.uiError(); S.money -= price; S.dogs.push(id); S.loadout.dog = id; }
    A.uiBuy(); HG.save.write(); this.openHub(cat === 'dogs' ? 'chenil' : 'armurerie'); this.refreshLoadout();
  }
  equip(cat, id, slot) {
    const S = this.g.save, D = HG.data;
    if (cat === 'weapon') { if (slot === 'primary') { if (S.loadout.secondary === id) S.loadout.secondary = S.loadout.primary; S.loadout.primary = id; } else { if (S.loadout.primary === id) S.loadout.primary = S.loadout.secondary; S.loadout.secondary = id; } }
    else if (cat === 'scope') S.loadout.scope[slot] = id; else if (cat === 'ammo') S.loadout.ammo[slot] = id; else if (cat === 'choke') S.loadout.choke = id; else if (cat === 'zero') S.loadout.zero = Number(id); else if (cat === 'dog') S.loadout.dog = id;
    HG.save.write(); this.openHub(cat === 'dog' ? 'chenil' : 'armurerie'); this.refreshLoadout();
  }
  refreshLoadout() { const g = this.g; if (g.running && g.weapons) { g.weapons.setLoadout(g.allowedLoadout(g.mode)); if (g.dog && (g.save.loadout.dog !== g.dog.type)) { g.dog.dispose(); g.dog = null; } if (!g.dog && g.save.loadout.dog !== 'none' && HG.data.dogs[g.save.loadout.dog] && !g.M.clay) { g.dog = new HG.Dog(g.save.loadout.dog, g.world, g); g.dog.pos.copy(g.player.pos); } } }
  // ================================================================ OVERLAYS
  closeOverlay() { this.overlayOpen = false; this.$('overlay').classList.add('hidden'); if (this.g.running && !this.g.paused && !this.g.player.isTouch && !this.g.player.dragLook) this.g.player.requestLock(); }
  closeAll() { this.closeOverlay(); this.$('pause').classList.add('hidden'); this.$('menu-root').classList.add('hidden'); this.$('harvest').classList.add('hidden'); }
  showLoading(v) { this.$('loading').classList.toggle('hidden', !v); }
  showHUD(v) { this.$('hud').classList.toggle('hidden', !v); this.$('touch-ui').classList.toggle('hidden', !v || !('ontouchstart' in window)); if (!v) { this.$('scope').classList.add('hidden'); this.$('binoc').classList.add('hidden'); } }
  showPause(v) { const p = this.$('pause'); p.classList.toggle('hidden', !v); if (v) { const S = this.g.session; p.innerHTML = `<div class="panel"><h2>Pause</h2><p>${this.g.M.name} · ${HG.util.hhmm(this.g.hour)}${S ? ' · ' + S.bag.length + ' prise(s) · ' + HG.util.money(S.earned) : ''}</p><div class="col"><button class="big" data-act="resume">▶ Reprendre</button><button data-act="hub" data-tab="carnet">📖 Carnet & réglages</button>${this.g.mode !== 'lobby' ? '<button data-act="endhunt">🏁 Terminer la chasse (bilan)</button>' : '<button data-act="quit">⏏ Menu principal</button>'}</div><p class="help">Molette : zoom · H : souffle · L : zéro · K : choke · M : carte · T : munitions</p></div>`; } }
  showHarvest(card) { const U = HG.util; const h = this.$('harvest'); h.classList.remove('hidden'); h.innerHTML = card.illegal ? `<div class="hcard bad"><h3>⛔ ${card.name}</h3><p>${card.note}</p><p>Amende appliquée · XP −100</p></div>` : `<div class="hcard"><h3>${card.medal ? (card.medal === 'Or' ? '🥇' : card.medal === 'Argent' ? '🥈' : '🥉') + ' ' : ''}${card.name}</h3><p>${card.mass.toFixed(1)} kg · ${card.trophy} · trophée ${card.trophyScore}/100${card.medal ? ' · Médaille ' + card.medal : ''}</p><p>${card.notes.join(' · ')}</p><p class="money">+${U.money(card.money)} · +${card.xp} XP</p></div>`; clearTimeout(this.hT); this.hT = setTimeout(() => h.classList.add('hidden'), 6500); }
  showClayResult(s, money) { const o = this.$('overlay'); this.overlayOpen = true; o.classList.remove('hidden'); o.innerHTML = `<div class="panel"><h2>${{ trap: 'Fosse', skeet: 'Skeet', sporting: 'Parcours de chasse' }[s.disc]} — ${s.hit}/25</h2><p class="lead">${s.hit >= 24 ? '🏆 Série exceptionnelle !' : s.hit >= 20 ? '🥈 Très belle série.' : s.hit >= 15 ? '🥉 Correct, continuez à travailler le swing.' : 'Entraînez-vous : anticipez le plateau et gardez le fusil en mouvement.'}</p>${s.competition ? '<p class="money">Prix : ' + HG.util.money(money) + ' · +' + s.hit * 8 + ' XP</p>' : ''}<div class="row">${s.competition ? '<button class="big" data-act="camp">Retour au camp</button>' : `<button class="big" data-act="clay" data-disc="${s.disc}">🔁 Nouvelle série</button><button data-act="resume">Continuer</button>`}</div></div>`; }
  showBilan(b) {
    const U = HG.util; const o = this.$('overlay'); this.overlayOpen = true; o.classList.remove('hidden'); o.classList.add('locked');
    const rows = b.bag.map((c) => `<tr class="${c.illegal ? 'bad' : ''}"><td>${c.name}</td><td>${c.illegal ? '—' : c.mass.toFixed(1) + ' kg'}</td><td>${c.illegal ? c.note : c.trophy + ' (' + c.trophyScore + ')' + (c.medal ? ' ' + (c.medal === 'Or' ? '🥇' : c.medal === 'Argent' ? '🥈' : '🥉') : '')}</td><td>${c.illegal ? '' : c.dist + ' m'}</td><td>${c.illegal ? '' : U.money(c.money)}</td></tr>`).join('');
    const fines = b.fines.map((f) => `<li>${f.reason} : −${U.money(f.amount)}</li>`).join('');
    const net = b.earned - b.finesTotal - b.licence;
    o.innerHTML = `<div class="panel bilan"><h2>Bilan — ${b.mode}</h2><div class="sub">${b.reason}</div>
      <div class="stats"><div><b>${b.shots}</b> tirs</div><div><b>${b.hits}</b> touchés</div><div><b>${b.bag.length}</b> prises</div><div><b>${b.wounded}</b> blessés</div><div><b>+${b.xp}</b> XP</div></div>
      ${rows ? `<table class="codex"><tr><th>Animal</th><th>Poids</th><th>Trophée</th><th>Distance</th><th>Valeur</th></tr>${rows}</table>` : '<p class="lead">Tableau vide : la nature ne se laisse pas prendre si facilement.</p>'}
      ${fines ? `<h4>Amendes</h4><ul class="fines">${fines}</ul>` : ''}
      <div class="total">Gains ${U.money(b.earned)} − licence ${U.money(b.licence)} − amendes ${U.money(b.finesTotal)} = <b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${U.money(net)}</b></div>
      <div class="row"><button class="big" data-act="camp">🏕️ Retour au camp</button></div></div>`;
    HG.save.write();
  }
  showBinoc(v) { this.$('binoc').classList.toggle('hidden', !v); const g = this.g; if (v) { g.camera.fov = g.baseFov / (g.eq.binoc || 10); } else g.camera.fov = g.baseFov; g.camera.updateProjectionMatrix(); }
  showPrompt(t) { const p = this.$('prompt'); if (p.textContent !== t) p.textContent = t; p.classList.toggle('hidden', !t); }
  setObjective(t) { this.$('hud-mode').textContent = t; }
  feed(msg) { const e = HG.util.el('div', 'msg', msg); this.feedEl.appendChild(e); while (this.feedEl.children.length > 6) this.feedEl.removeChild(this.feedEl.firstChild); setTimeout(() => { e.classList.add('fade'); setTimeout(() => e.remove(), 900); }, 7000); }
  hint(msg) { const h = this.$('hint'); h.textContent = msg; h.classList.remove('hidden'); clearTimeout(this.hintTO); this.hintTO = setTimeout(() => h.classList.add('hidden'), 4000); }
  hitmarker() { const h = this.$('hitmarker'); h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
  updateMoney() { const m = this.$('money'); if (m) m.textContent = HG.util.money(this.g.save.money); this.$('hud-money').textContent = HG.util.money(this.g.save.money); }
  toggleAmmoPanel() { const g = this.g, s = g.weapons.slot; this.hint(`${s.w.name} — ${s.ammo.name} — réserve ${g.weapons.reserve(s)}${s.w.type === 'shotgun' ? ' — choke ' + HG.data.chokes[g.save.loadout.choke || 'mod'].name : s.w.type === 'rifle' ? ' — zéro ' + s.zero + ' m' : ''}`); }
  updateAmmo() { const g = this.g; if (!g.weapons) return; const s = g.weapons.slot; this.$('ammo-name').textContent = s.w.name + (s.opticId !== 'none' ? ' · ' + s.optic.name : ''); this.$('ammo-shells').innerHTML = Array.from({ length: s.cap }, (_, i) => `<i class="${i < s.chamber ? 'on' : ''} ${s.w.type}"></i>`).join(''); this.$('ammo-reserve').textContent = g.weapons.reserve(s) + ' en réserve · ' + s.ammo.name.replace(/\(.*\)/, ''); this.$('ammo-state').textContent = s.w.type === 'rifle' ? 'Zéro ' + s.zero + ' m' : s.w.type === 'shotgun' ? 'Choke ' + HG.data.chokes[g.save.loadout.choke || 'mod'].name.split(' ')[0] : ''; }
  // ================================================================ HUD
  buildCompass() { const s = this.$('compass-strip'); let h = ''; for (let k = 0; k < 3; k++) for (let d = 0; d < 360; d += 15) { const n = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'O' : d % 45 === 0 ? (d < 90 ? 'NE' : d < 180 ? 'SE' : d < 270 ? 'SO' : 'NO') : ''; h += `<span class="${n.length === 1 ? 'card' : ''}">${n || '·'}</span>`; } s.innerHTML = h; }
  buildReticle() { const c = this.$('reticle'); const S = 600; c.width = S; c.height = S; }
  drawReticle(type) { const c = this.$('reticle'), x = c.getContext('2d'), S = c.width, m = S / 2; x.clearRect(0, 0, S, S); x.strokeStyle = '#111'; x.fillStyle = '#111'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, m); x.lineTo(S, m); x.moveTo(m, 0); x.lineTo(m, S); x.stroke(); x.lineWidth = 4; x.beginPath(); x.moveTo(0, m); x.lineTo(m - 90, m); x.moveTo(m + 90, m); x.lineTo(S, m); x.moveTo(m, 0); x.lineTo(m, m - 90); x.moveTo(m, m + 90); x.lineTo(m, S); x.stroke(); if (type === 'mildot') { for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { x.beginPath(); x.arc(m + s * i * 20, m, 2.2, 0, 7); x.fill(); x.beginPath(); x.arc(m, m + s * i * 20, 2.2, 0, 7); x.fill(); } } this.reticleType = type; }
  updateHUD(dt) {
    const g = this.g, P = g.player, W = g.world, U = HG.util, $ = this.$; this.hudT += dt;
    // viseur / lunette
    const sc = g.weapons.scoped; $('scope').classList.toggle('hidden', !sc); if (sc && this.reticleType !== g.weapons.slot.optic.reticle) this.drawReticle(g.weapons.slot.optic.reticle);
    const dot = P.aiming > 0.6 && g.weapons.slot.optic.reticle === 'dot'; $('reddot').classList.toggle('hidden', !dot);
    $('crosshair').classList.toggle('hidden', sc || dot || g.binoc || !g.save.options.crosshair || (P.aiming > 0.6 && g.weapons.slot.w.type !== 'shotgun'));
    const sp = P.swayAmp * 4000; $('crosshair').style.setProperty('--gap', (8 + sp + (1 - P.aiming) * 14) + 'px');
    if (this.hudT < 0.1) return; this.hudT = 0;
    // boussole, vent, heure
    const heading = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360; $('compass-strip').style.transform = `translateX(${-(heading / 15) * 22 - 24 * 22 + 150}px)`;
    const wrel = Math.atan2(Math.cos(W.wind.dir), -Math.sin(W.wind.dir)) + P.yaw; $('wind-arrow').style.transform = `rotate(${wrel * 180 / Math.PI}rad)`; $('wind-arrow').style.transform = `rotate(${wrel}rad)`; $('wind-speed').textContent = Math.round(W.wind.speed * (1 + W.wind.gust * 0.35) * 3.6) + ' km/h';
    $('hud-time').textContent = U.hhmm(g.hour) + (g.endHour ? ' / ' + U.hhmm(g.endHour) : '') + ' · ' + W.weather.name; $('hud-money').textContent = U.money(g.save.money);
    $('stance').textContent = (P.fixed ? 'Mirador · ' : '') + (P.stance === 'prone' ? 'Couché' : P.stance === 'crouch' ? 'Accroupi' : 'Debout') + (P.inWater ? ' · dans l\'eau' : '');
    $('stamina').querySelector('i').style.width = (P.stamina / (g.eq.stamina || 1) * 100) + '%'; $('breath').querySelector('i').style.width = (P.breath * 100) + '%'; $('heart').textContent = Math.round(P.heart) + ' bpm';
    const nz = U.clamp(P.noise / 100, 0, 1); $('noise').querySelector('i').style.width = nz * 100 + '%'; $('noise').className = 'gauge ' + (nz > 0.6 ? 'bad' : nz > 0.3 ? 'mid' : 'good');
    const vz = U.clamp(P.visibility / 1.4, 0, 1); $('vis').querySelector('i').style.width = vz * 100 + '%'; $('vis').className = 'gauge ' + (vz > 0.7 ? 'bad' : vz > 0.45 ? 'mid' : 'good');
    $('busy').textContent = g.weapons.busyLabel || (P.holding ? 'Souffle bloqué' : '');
    // identification de l'animal visé
    let best = null, bd = 1e9; const f = P.forward(new THREE.Vector3()); const cone = 0.012 * (g.binoc ? 0.4 : 1) / Math.sqrt(P.aimZoom || 1);
    for (const a of g.animals.list) { const v = new THREE.Vector3(a.pos.x - g.camera.position.x, a.pos.y + a.d.h * a.sizeF * 0.5 - g.camera.position.y, a.pos.z - g.camera.position.z); const d = v.length(); if (d > 600) continue; v.divideScalar(d); const dev = 1 - v.dot(f); if (dev < cone * (1 + 4 / d) && d < bd) { bd = d; best = a; } }
    const lab = $('target-label'); if (best && (g.binoc || P.aiming > 0.5 || bd < 60)) { const lrf = g.eq.lrf || g.binoc; lab.innerHTML = `<b>${best.d.name}</b> ${best.dead ? '(mort)' : ''}${best.d.illegal ? ' <span class="bad">⛔ ' + best.d.protectedLabel + '</span>' : ''}${lrf ? ' · ' + Math.round(bd) + ' m' : bd < 60 ? ' · ~' + Math.round(bd / 5) * 5 + ' m' : ''}${g.eq.lrf && !best.dead ? ' · trophée ~' + Math.round(best.trophy * 100) : ''}${best.state === 'alert' ? ' · 👀 en alerte' : best.state === 'flee' ? ' · 💨 fuit' : ''}`; lab.classList.remove('hidden'); } else lab.classList.add('hidden');
    // chien
    $('dog-state').textContent = g.dog ? '🐕 ' + g.dog.d.name + ' : ' + { heel: 'au pied', quest: 'en quête', point: 'À L\'ARRÊT !', flush: 'lève', fetch: 'rapporte', track: 'sur la voie' }[g.dog.state] : '';
    this.drawMinimap();
  }
  // ================================================================ CARTES
  buildMinimap(W) { const c = document.createElement('canvas'); const S = 256; c.width = S; c.height = S; const x = c.getContext('2d'); const img = x.createImageData(S, S); const d = img.data; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const wx = (i / S - 0.5) * W.size, wz = (j / S - 0.5) * W.size; const h = W.height(wx, wz); const k = (j * S + i) * 4; if (h < W.waterY) { d[k] = 40; d[k + 1] = 70; d[k + 2] = 110; } else { const n = W.normal(wx, wz).y; const cov = W.cover(wx, wz); const sh = 0.6 + (h - W.height(wx - 20, wz - 20)) * 0.02; let r = 110, g = 130, b = 60; if (h > W.snowLine) { r = 230; g = 235; b = 240; } else if (n < 0.75) { r = 120; g = 115; b = 105; } if (cov > 0.2 && h < W.snowLine) { r = 50 + (1 - cov) * 40; g = 90 + (1 - cov) * 30; b = 40; } d[k] = U(r * sh); d[k + 1] = U(g * sh); d[k + 2] = U(b * sh); } d[k + 3] = 255; } x.putImageData(img, 0, 0); this.mapImg = c; function U(v) { return v < 0 ? 0 : v > 255 ? 255 : v; } }
  drawMinimap() { const g = this.g, W = g.world, P = g.player; const c = this.$('minimap'), x = c.getContext('2d'); const S = c.width; if (!this.mapImg) return; const scale = this.mapOpen ? 1 : 6; x.save(); x.clearRect(0, 0, S, S); x.beginPath(); if (!this.mapOpen) x.arc(S / 2, S / 2, S / 2 - 2, 0, 7); else x.rect(0, 0, S, S); x.clip(); const px = (P.pos.x / W.size + 0.5) * 256, pz = (P.pos.z / W.size + 0.5) * 256; if (this.mapOpen) x.drawImage(this.mapImg, 0, 0, S, S); else { x.translate(S / 2, S / 2); x.rotate(P.yaw); x.drawImage(this.mapImg, -px * scale * S / 256, -pz * scale * S / 256, S * scale, S * scale); x.rotate(-P.yaw); x.translate(-S / 2, -S / 2); }
    const toScreen = (wx, wz) => { const mx = (wx / W.size + 0.5) * 256, mz = (wz / W.size + 0.5) * 256; if (this.mapOpen) return [mx * S / 256, mz * S / 256]; const dx = (mx - px) * scale * S / 256, dz = (mz - pz) * scale * S / 256; const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw); return [S / 2 + dx * cs - dz * sn, S / 2 + dx * sn + dz * cs]; };
    x.font = (this.mapOpen ? 14 : 11) + 'px sans-serif'; x.textAlign = 'center';
    for (const m of W.markers) { const [sx, sy] = toScreen(m.x, m.z); if (sx < -10 || sy < -10 || sx > S + 10 || sy > S + 10) continue; x.fillText(m.icon, sx, sy + 4); if (this.mapOpen) { x.fillStyle = '#fff'; x.fillText(m.label, sx, sy + 18); } }
    if (this.mapOpen) { for (const a of g.animals.list) if (a.dead && !a.collected) { const [sx, sy] = toScreen(a.pos.x, a.pos.z); x.fillText('☠️', sx, sy + 4); } if (g.dog) { const [sx, sy] = toScreen(g.dog.pos.x, g.dog.pos.z); x.fillText('🐕', sx, sy + 4); } if (g.session && g.session.beaters && g.session.driveState === 'drive') for (const b of g.session.beaters) { const [sx, sy] = toScreen(b.x, b.z); x.fillStyle = '#ff8800'; x.beginPath(); x.arc(sx, sy, 4, 0, 7); x.fill(); } }
    else if (g.dog) { const [sx, sy] = toScreen(g.dog.pos.x, g.dog.pos.z); x.fillStyle = '#ffd27a'; x.beginPath(); x.arc(sx, sy, 3, 0, 7); x.fill(); }
    // joueur
    const [jx, jy] = this.mapOpen ? toScreen(P.pos.x, P.pos.z) : [S / 2, S / 2]; x.fillStyle = '#ffffff'; x.strokeStyle = '#000'; x.lineWidth = 1.5; x.save(); x.translate(jx, jy); x.rotate(this.mapOpen ? -P.yaw : 0); x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.closePath(); x.fill(); x.stroke(); x.restore();
    // vent (carte ouverte)
    if (this.mapOpen) { x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = '14px sans-serif'; x.fillText('Vent → ' + Math.round(W.wind.speed * 3.6) + ' km/h', 10, 20); x.save(); x.translate(120, 15); x.rotate(Math.atan2(Math.sin(W.wind.dir), Math.cos(W.wind.dir)) ); x.beginPath(); x.moveTo(12, 0); x.lineTo(-8, -6); x.lineTo(-8, 6); x.closePath(); x.fill(); x.restore(); x.fillText('N ↑', S - 40, 20); }
    x.restore(); }
  toggleMap() { this.mapOpen = !this.mapOpen; const c = this.$('minimap'); const S = this.mapOpen ? Math.min(window.innerWidth, window.innerHeight) - 80 : 170; c.width = S; c.height = S; c.classList.toggle('big', this.mapOpen); this.drawMinimap(); }
};
