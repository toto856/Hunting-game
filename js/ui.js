// Interface : menus, armurerie, carnet de chasse, options, HUD en jeu.
'use strict';

DH.ui = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const D = DH.data;
  let game = null;
  let root, hud, pauseEl, loadingEl;
  let sel = null;
  let feedEl, centerEl, floatEl;
  let centerT = 0;
  let hudCache = {};

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => n.toLocaleString('fr-FR') + ' €';
  const lvl = () => DH.save.level();
  const S = () => DH.save.get();

  function init(g) {
    game = g;
    root = $('#menu-root');
    hud = $('#hud');
    pauseEl = $('#pause');
    loadingEl = $('#loading');
    feedEl = $('#feed');
    centerEl = $('#center-msg');
    floatEl = $('#float-msg');
    root.addEventListener('click', onClick);
    pauseEl.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    pauseEl.addEventListener('input', onInput);
    pauseEl.addEventListener('change', onInput);
    buildCompass();
    if (game.input.isTouch) game.input.setupTouch($('#touch-ui'));
  }

  function click() { DH.audio.uiClick(); }

  // ================================================================ ÉCRANS
  function profileBar() {
    const s = S(), l = lvl();
    const a = D.xpForLevel(l), b = D.xpForLevel(l + 1);
    const pct = Math.round(((s.xp - a) / (b - a)) * 100);
    return `
      <div class="profile">
        <div class="lvl-badge">${l}</div>
        <div class="xp"><div class="xp-label">Niveau ${l} · ${s.xp.toLocaleString('fr-FR')} XP</div>
          <div class="bar"><i style="width:${pct}%"></i></div><div class="xp-next">${(b - s.xp).toLocaleString('fr-FR')} XP avant le niveau ${l + 1}</div></div>
        <div class="money">${money(s.money)}</div>
      </div>`;
  }

  function showMain() {
    root.className = 'screen-main';
    root.innerHTML = `
      <div class="main-wrap">
        <div class="title-block">
          <div class="kicker">Chasse au gibier d'eau</div>
          <h1>PASSÉE</h1>
          <div class="sub">Marais, lacs gelés, toundra et bayous — six territoires, six modes, onze météos.</div>
        </div>
        ${profileBar()}
        <nav class="main-nav">
          <button class="btn primary big" data-action="setup">Partir à la chasse</button>
          <button class="btn" data-action="armory">Armurerie</button>
          <button class="btn" data-action="journal">Carnet de chasse</button>
          <button class="btn" data-action="options">Options</button>
          <button class="btn" data-action="controls">Commandes</button>
        </nav>
        <div class="foot">Conseil : visez <em>devant</em> les oiseaux en vol — les plombs mettent un dixième de seconde à arriver.</div>
      </div>`;
  }

  // ---------------------------------------------------------------- PRÉPARATION
  function validSel() {
    const s = S(), l = lvl();
    sel = sel || Object.assign({}, s.last, { loadout: [...s.last.loadout] });
    const okMap = D.maps.find((m) => m.id === sel.map && m.level <= l);
    if (!okMap) sel.map = 'marais';
    if (!D.modes.find((m) => m.id === sel.mode && m.level <= l)) sel.mode = 'classique';
    if (sel.weather !== 'auto' && !D.weathers.find((m) => m.id === sel.weather && m.level <= l)) sel.weather = 'auto';
    if (!D.times.find((m) => m.id === sel.time && m.level <= l)) sel.time = 'jour';
    if (!s.weapons.includes(sel.loadout[0])) sel.loadout[0] = s.weapons[0];
    if (sel.loadout[1] && (!s.weapons.includes(sel.loadout[1]) || sel.loadout[1] === sel.loadout[0])) sel.loadout[1] = null;
    if (!s.cartridges.includes(sel.cartridge)) sel.cartridge = 'lead6';
    if (!D.chokes.find((c) => c.id === sel.choke)) sel.choke = 'mod';
  }

  function card(item, active, locked, extra = '', cls = '') {
    return `<button class="card ${cls} ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-pick="${item.id}" ${locked ? 'disabled' : ''}>
      ${extra}
      <div class="card-name">${item.icon ? item.icon + ' ' : ''}${esc(item.name)}</div>
      ${item.desc ? `<div class="card-desc">${esc(item.desc)}</div>` : ''}
      ${locked ? `<div class="lock">🔒 Niveau ${item.level}</div>` : ''}
    </button>`;
  }

  function showSetup() {
    validSel();
    const s = S(), l = lvl();
    const map = D.maps.find((m) => m.id === sel.map);
    const wid = sel.weather === 'auto' ? map.weather : sel.weather;
    const w = D.weathers.find((x) => x.id === wid);
    const t = D.times.find((x) => x.id === sel.time);
    const mo = D.modes.find((x) => x.id === sel.mode);
    const mul = (mo.xp * w.xp * t.xp).toFixed(2);
    const best = s.stats.best[sel.mode + ':' + sel.map];
    const weaponOpts = (cur, allowNone) => (allowNone ? `<option value="">— Aucune —</option>` : '') + s.weapons.map((id) => {
      const d = D.weapons.find((x) => x.id === id);
      return `<option value="${id}" ${cur === id ? 'selected' : ''}>${esc(d.name)}</option>`;
    }).join('');
    root.className = 'screen-setup';
    root.innerHTML = `
      <div class="panel wide">
        <header class="panel-head"><button class="back" data-action="main">←</button><h2>Préparer la sortie</h2>${profileBar()}</header>
        <div class="setup-grid">
          <section class="group" data-group="map"><h3>Territoire</h3>
            <div class="cards maps">${D.maps.map((m) => card(m, m.id === sel.map, m.level > l, `<div class="thumb map-${m.id}"></div>`, 'map-card')).join('')}</div>
          </section>
          <section class="group" data-group="mode"><h3>Mode de jeu</h3>
            <div class="cards modes">${D.modes.map((m) => card(m, m.id === sel.mode, m.level > l)).join('')}</div>
          </section>
          <section class="group" data-group="weather"><h3>Météo</h3>
            <div class="chips">
              <button class="chip ${sel.weather === 'auto' ? 'active' : ''}" data-pick="auto">🎲 Météo du territoire</button>
              ${D.weathers.map((x) => `<button class="chip ${x.id === sel.weather ? 'active' : ''} ${x.level > l ? 'locked' : ''}" data-pick="${x.id}" ${x.level > l ? 'disabled' : ''}>${x.icon} ${x.name}${x.level > l ? ` <small>🔒${x.level}</small>` : ''}</button>`).join('')}
            </div>
          </section>
          <section class="group" data-group="time"><h3>Moment de la journée</h3>
            <div class="chips">${D.times.map((x) => `<button class="chip ${x.id === sel.time ? 'active' : ''} ${x.level > l ? 'locked' : ''}" data-pick="${x.id}" ${x.level > l ? 'disabled' : ''}>${x.icon} ${x.name}${x.level > l ? ` <small>🔒${x.level}</small>` : ''}</button>`).join('')}</div>
          </section>
          <section class="group loadout"><h3>Équipement</h3>
            <label>Arme principale<select data-field="w0">${weaponOpts(sel.loadout[0], false)}</select></label>
            <label>Arme secondaire<select data-field="w1">${weaponOpts(sel.loadout[1], true)}</select></label>
            <label>Cartouches<select data-field="cartridge">${s.cartridges.map((id) => { const c = D.cartridges.find((x) => x.id === id); return `<option value="${id}" ${sel.cartridge === id ? 'selected' : ''}>${esc(c.name)}</option>`; }).join('')}</select></label>
            ${s.equipment.includes('chokes') ? `<label>Choke<select data-field="choke">${D.chokes.map((c) => `<option value="${c.id}" ${sel.choke === c.id ? 'selected' : ''}>${c.name} — ${c.desc}</option>`).join('')}</select></label>` : ''}
            <div class="equip-list">${D.equipment.map((e) => `<span class="tag ${s.equipment.includes(e.id) ? 'on' : ''}">${esc(e.name)}</span>`).join('')}</div>
          </section>
        </div>
        <footer class="setup-foot">
          <div class="summary">
            <b>${esc(map.name)}</b> · ${mo.icon} ${esc(mo.name)} · ${w.icon} ${esc(w.name)} · ${t.icon} ${esc(t.name)}
            <span class="mult">XP ×${mul}</span>${best ? `<span class="best">Record : ${best.toLocaleString('fr-FR')}</span>` : ''}
          </div>
          <button class="btn primary big" data-action="start">Commencer la chasse</button>
        </footer>
      </div>`;
  }

  // ---------------------------------------------------------------- ARMURERIE
  let armoryTab = 'weapons';
  function statBar(label, v) {
    v = Math.max(0.05, Math.min(1, v));
    return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
  }
  function weaponStats(d) {
    return statBar('Puissance', d.bullet ? 0.85 : d.pellets / 1.5) +
      statBar('Groupement', d.bullet ? 1 : 1 - (d.spread - 0.009) / 0.0065) +
      statBar('Cadence', 1 - d.cycle / 0.85) +
      statBar('Capacité', d.capacity / 5) +
      statBar('Stabilité', 1 - (d.sway - 0.4) / 1.1);
  }

  function showArmory(tab) {
    if (tab) armoryTab = tab;
    const s = S(), l = lvl();
    let items = '';
    const shopCard = (item, owned, kind, body) => {
      const locked = item.level > l;
      const afford = s.money >= item.price;
      let btn;
      if (owned) btn = `<span class="owned">✔ Possédé</span>`;
      else if (locked) btn = `<span class="lock">🔒 Niveau ${item.level}</span>`;
      else btn = `<button class="btn ${afford ? 'primary' : ''}" data-buy="${kind}:${item.id}" ${afford ? '' : 'disabled'}>Acheter · ${money(item.price)}</button>`;
      return `<div class="shop-card ${owned ? 'is-owned' : ''} ${locked ? 'locked' : ''}">
        <div class="shop-name">${esc(item.name)}</div>
        <div class="card-desc">${esc(item.desc || '')}</div>
        ${body || ''}
        <div class="shop-foot">${btn}</div></div>`;
    };
    if (armoryTab === 'weapons') {
      items = D.weapons.map((d) => shopCard(d, s.weapons.includes(d.id), 'weapon',
        `<div class="specs">${d.bullet ? 'Balle .17 HMR' : 'Calibre ' + d.gauge} · ${{ pump: 'Pompe', break: 'Basculant', semi: 'Semi-auto', bolt: 'Verrou' }[d.action]} · ${d.capacity} coup${d.capacity > 1 ? 's' : ''}</div>${weaponStats(d)}`)).join('');
    } else if (armoryTab === 'ammo') {
      items = D.cartridges.map((c) => shopCard(c, s.cartridges.includes(c.id), 'cart',
        `<div class="specs">${c.pellets} plombs · portée utile ${c.range} m · ${c.speed} m/s</div>${statBar('Énergie', c.dmg / 18)}${statBar('Portée', c.range / 60)}`)).join('');
    } else {
      items = D.equipment.map((e) => shopCard(e, s.equipment.includes(e.id), 'equip')).join('');
    }
    root.className = 'screen-armory';
    root.innerHTML = `
      <div class="panel wide">
        <header class="panel-head"><button class="back" data-action="main">←</button><h2>Armurerie</h2>${profileBar()}</header>
        <div class="tabs">
          <button class="tab ${armoryTab === 'weapons' ? 'active' : ''}" data-tab="weapons">Fusils</button>
          <button class="tab ${armoryTab === 'ammo' ? 'active' : ''}" data-tab="ammo">Munitions</button>
          <button class="tab ${armoryTab === 'equip' ? 'active' : ''}" data-tab="equip">Équipement</button>
        </div>
        <div class="shop">${items}</div>
      </div>`;
  }

  function buy(kind, id) {
    const s = S();
    const list = { weapon: D.weapons, cart: D.cartridges, equip: D.equipment }[kind];
    const item = list.find((x) => x.id === id);
    if (!item || item.level > lvl() || s.money < item.price) return;
    const key = { weapon: 'weapons', cart: 'cartridges', equip: 'equipment' }[kind];
    if (s[key].includes(id)) return;
    s.money -= item.price;
    s[key].push(id);
    DH.save.write();
    DH.audio.init();
    DH.audio.ding();
    toast(`${item.name} ajouté à votre équipement !`);
    showArmory();
  }

  // ---------------------------------------------------------------- CARNET
  function showJournal() {
    const s = S(), st = s.stats;
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const total = Object.values(st.kills).reduce((a, b) => a + b, 0);
    const sp = Object.entries(D.species).map(([id, x]) => {
      const n = st.kills[id] || 0;
      const c = x.colors;
      return `<div class="species ${n ? '' : 'unknown'} ${x.protected ? 'prot' : ''}">
        <div class="swatch" style="background:linear-gradient(135deg, ${c.head} 0 30%, ${c.chest} 30% 55%, ${c.body} 55% 80%, ${c.spec} 80%)"></div>
        <div><div class="sp-name">${esc(x.name)}</div><div class="card-desc">${esc(x.info)}</div>
        <div class="sp-meta">${x.protected ? 'Protégée' : x.pts + ' pts'} · ${n} prélevé${n > 1 ? 's' : ''}</div></div></div>`;
    }).join('');
    const bests = Object.entries(st.best).map(([k, v]) => {
      const [mo, mp] = k.split(':');
      const m1 = D.modes.find((x) => x.id === mo), m2 = D.maps.find((x) => x.id === mp);
      return m1 && m2 ? `<tr><td>${m1.icon} ${esc(m1.name)}</td><td>${esc(m2.name)}</td><td>${v.toLocaleString('fr-FR')}</td></tr>` : '';
    }).join('');
    root.className = 'screen-journal';
    root.innerHTML = `
      <div class="panel wide">
        <header class="panel-head"><button class="back" data-action="main">←</button><h2>Carnet de chasse</h2>${profileBar()}</header>
        <div class="stats-row">
          <div><b>${st.hunts}</b><span>sorties</span></div>
          <div><b>${total}</b><span>oiseaux</span></div>
          <div><b>${acc} %</b><span>tirs au but</span></div>
          <div><b>${st.longest} m</b><span>plus long tir</span></div>
          <div><b>${st.clays}</b><span>plateaux</span></div>
          <div><b>${Math.round(st.playTime / 60)} min</b><span>sur le terrain</span></div>
        </div>
        <h3>Espèces</h3>
        <div class="species-grid">${sp}</div>
        <h3>Records</h3>
        ${bests ? `<table class="records"><tr><th>Mode</th><th>Territoire</th><th>Score</th></tr>${bests}</table>` : '<p class="card-desc">Aucun record pour le moment.</p>'}
      </div>`;
  }

  // ---------------------------------------------------------------- OPTIONS
  let optionsFrom = 'main';
  function showOptions(from) {
    if (from) optionsFrom = from;
    const o = S().options;
    const target = optionsFrom === 'pause' ? pauseEl : root;
    if (optionsFrom !== 'pause') root.className = 'screen-options';
    target.innerHTML = `
      <div class="panel">
        <header class="panel-head"><button class="back" data-action="${optionsFrom === 'pause' ? 'pause-menu' : 'main'}">←</button><h2>Options</h2></header>
        <div class="options">
          <label>Sensibilité de la souris <input type="range" min="0.2" max="3" step="0.05" value="${o.sensitivity}" data-opt="sensitivity"><output>${o.sensitivity.toFixed(2)}</output></label>
          <label>Champ de vision <input type="range" min="60" max="100" step="1" value="${o.fov}" data-opt="fov"><output>${o.fov}°</output></label>
          <label>Volume <input type="range" min="0" max="1" step="0.05" value="${o.volume}" data-opt="volume"><output>${Math.round(o.volume * 100)} %</output></label>
          <label>Qualité graphique <select data-opt="quality">
            <option value="low" ${o.quality === 'low' ? 'selected' : ''}>Basse (mobile / ordinateur ancien)</option>
            <option value="medium" ${o.quality === 'medium' ? 'selected' : ''}>Moyenne</option>
            <option value="high" ${o.quality === 'high' ? 'selected' : ''}>Haute</option></select></label>
          <label class="check"><input type="checkbox" data-opt="invertY" ${o.invertY ? 'checked' : ''}> Inverser l'axe vertical</label>
          <label class="check"><input type="checkbox" data-opt="crosshair" ${o.crosshair ? 'checked' : ''}> Afficher le réticule (hors visée)</label>
          ${optionsFrom === 'pause' ? '<p class="card-desc">La qualité graphique s\'applique entièrement à la prochaine partie.</p>' : '<button class="btn danger" data-action="reset">Effacer la progression</button>'}
        </div>
      </div>`;
  }

  function controlsHtml() {
    return `
        <div class="controls">
          <div><kbd>Z Q S D</kbd> / <kbd>W A S D</kbd><span>Se déplacer</span></div>
          <div><kbd>Souris</kbd><span>Regarder</span></div>
          <div><kbd>Clic gauche</kbd><span>Tirer</span></div>
          <div><kbd>Clic droit</kbd><span>Épauler / viser</span></div>
          <div><kbd>Maj</kbd><span>Courir — en visée : retenir sa respiration</span></div>
          <div><kbd>C</kbd> / <kbd>Ctrl</kbd><span>S'accroupir (plus discret)</span></div>
          <div><kbd>Espace</kbd><span>Sauter</span></div>
          <div><kbd>R</kbd><span>Recharger</span></div>
          <div><kbd>1</kbd> <kbd>2</kbd> / <kbd>Molette</kbd><span>Changer d'arme</span></div>
          <div><kbd>F</kbd><span>Appeau (attire les vols)</span></div>
          <div><kbd>B</kbd><span>Jumelles</span></div>
          <div><kbd>E</kbd><span>Ramasser le gibier</span></div>
          <div><kbd>Tab</kbd><span>Tableau de chasse</span></div>
          <div><kbd>Échap</kbd> / <kbd>P</kbd><span>Pause</span></div>
        </div>
        <h3>Conseils de chasse</h3>
        <ul class="tips">
          <li>Les plombs ont un temps de vol : donnez de l'<b>avance</b> aux oiseaux qui croisent.</li>
          <li>Au-delà de la portée utile de la cartouche, les plombs perdent leur énergie.</li>
          <li>Tirer un oiseau posé ne rapporte que la moitié des points (tir peu sportif).</li>
          <li>Restez dans l'affût et accroupi : les canards posés vous repéreront moins vite.</li>
          <li>Le vent dévie légèrement la gerbe et pousse les vols. Le blizzard et le brouillard font voler les canards plus bas.</li>
          <li>Ne tirez jamais le cygne ni le tadorne : espèces protégées !</li>
        </ul>
`;
  }

  function showControls() {
    root.className = 'screen-controls';
    root.innerHTML = `
      <div class="panel">
        <header class="panel-head"><button class="back" data-action="main">←</button><h2>Commandes</h2></header>
        ${controlsHtml()}
      </div>`;
  }

  // ---------------------------------------------------------------- RÉSULTATS
  function showResults(r) {
    const acc = r.shots ? Math.round((r.hitShots / r.shots) * 100) : 0;
    const bag = Object.entries(r.bag).map(([id, n]) => `<div class="bag-item ${D.species[id].protected ? 'bad' : ''}"><span>${esc(D.species[id].name)}</span><b>×${n}</b></div>`).join('') || '<p class="card-desc">Carnier vide…</p>';
    root.className = 'screen-results';
    root.innerHTML = `
      <div class="panel">
        <header class="panel-head"><h2>${esc(r.reason)}</h2></header>
        <div class="result-score"><span>Score</span><b>${r.score.toLocaleString('fr-FR')}</b>${r.record ? '<em>Nouveau record !</em>' : ''}</div>
        <div class="stats-row">
          ${r.clays ? `<div><b>${r.clays.hit}/${r.clays.total}</b><span>plateaux</span></div>` : ''}
          <div><b>${r.shots}</b><span>tirs</span></div>
          <div><b>${acc} %</b><span>précision</span></div>
          <div><b>${Math.round(r.longest)} m</b><span>plus long tir</span></div>
          <div><b>${r.retrieved}</b><span>ramassés</span></div>
        </div>
        ${r.clays ? '' : `<h3>Tableau de chasse</h3><div class="bag">${bag}</div>`}
        ${r.protectedKills ? `<p class="warn">⚠ ${r.protectedKills} espèce(s) protégée(s) abattue(s).</p>` : ''}
        <div class="rewards">
          <div>+${r.xp.toLocaleString('fr-FR')} XP <small>(×${r.xpMul.toFixed(2)})</small></div>
          <div>+${money(r.money)}</div>
        </div>
        ${r.lvlAfter > r.lvlBefore ? `<div class="levelup">NIVEAU ${r.lvlAfter} !<ul>${r.unlocks.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}
        ${profileBar()}
        <div class="row">
          <button class="btn primary" data-action="again">Rejouer</button>
          <button class="btn" data-action="setup-from-results">Changer de sortie</button>
          <button class="btn" data-action="menu">Menu principal</button>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- PAUSE
  function showPause(on) {
    pauseEl.classList.toggle('hidden', !on);
    if (!on) return;
    pauseEl.innerHTML = `
      <div class="panel small">
        <h2>Pause</h2>
        <div class="col">
          <button class="btn primary big" data-action="resume">Reprendre</button>
          <button class="btn" data-action="pause-options">Options</button>
          <button class="btn" data-action="pause-controls">Commandes</button>
          <button class="btn danger" data-action="quit">Terminer la partie</button>
        </div>
        <p class="card-desc">${game.input.isTouch ? '' : 'Cliquez sur « Reprendre » pour reprendre le contrôle de la souris.'}</p>
      </div>`;
  }

  function showLoading(on) {
    loadingEl.classList.toggle('hidden', !on);
    if (on) {
      root.innerHTML = '';
      root.className = '';
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  // ================================================================ ÉVÉNEMENTS
  function onClick(e) {
    const b = e.target.closest('[data-action],[data-pick],[data-tab],[data-buy]');
    if (!b || b.disabled) return;
    click();
    if (b.dataset.pick) {
      const group = b.closest('[data-group]').dataset.group;
      sel[group] = b.dataset.pick;
      if (group === 'map') game.buildMenuWorld(sel.map);
      return showSetup();
    }
    if (b.dataset.tab) return showArmory(b.dataset.tab);
    if (b.dataset.buy) {
      const [k, id] = b.dataset.buy.split(':');
      return buy(k, id);
    }
    DH.audio.init();
    switch (b.dataset.action) {
      case 'main': return showMain();
      case 'setup': sel = null; return showSetup();
      case 'armory': return showArmory();
      case 'journal': return showJournal();
      case 'options': return showOptions('main');
      case 'controls': return showControls();
      case 'start':
        root.innerHTML = '';
        root.className = '';
        return game.startHunt(Object.assign({}, sel, { loadout: [...sel.loadout] }));
      case 'again':
        root.innerHTML = '';
        root.className = '';
        validSel();
        return game.startHunt(Object.assign({}, S().last, { loadout: [...S().last.loadout] }));
      case 'setup-from-results':
        game.toMenu();
        sel = null;
        return showSetup();
      case 'menu': return game.toMenu();
      case 'resume':
        if (game.input.isTouch) game.resume();
        else game.input.requestLock();
        return;
      case 'pause-options': return showOptions('pause');
      case 'pause-controls':
        pauseEl.innerHTML = `<div class="panel"><header class="panel-head"><button class="back" data-action="pause-menu">←</button><h2>Commandes</h2></header>${controlsHtml()}</div>`;
        return;
      case 'pause-menu': return showPause(true);
      case 'quit':
        showPause(false);
        return game.quit();
      case 'reset':
        if (confirm('Effacer toute la progression ?')) {
          DH.save.reset();
          game.opts = S().options;
          showMain();
        }
        return;
    }
  }

  function onInput(e) {
    const el = e.target;
    const o = S().options;
    if (el.dataset.field) {
      validSel();
      if (el.dataset.field === 'w0') sel.loadout[0] = el.value;
      else if (el.dataset.field === 'w1') sel.loadout[1] = el.value || null;
      else sel[el.dataset.field] = el.value;
      if (e.type === 'change') showSetup();
      return;
    }
    if (el.dataset.opt) {
      const k = el.dataset.opt;
      if (el.type === 'checkbox') o[k] = el.checked;
      else if (el.tagName === 'SELECT') {
        if (k === 'quality') game.setQuality(el.value);
        o[k] = el.value;
      } else o[k] = parseFloat(el.value);
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = k === 'volume' ? Math.round(o[k] * 100) + ' %' : k === 'fov' ? o[k] + '°' : o[k].toFixed(2);
      if (k === 'volume') DH.audio.setVolume(o.volume);
      game.opts = o;
      DH.save.write();
    }
  }

  // ================================================================ HUD
  function buildCompass() {
    const strip = $('#compass-strip');
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let d = -180; d <= 540; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const label = names[n];
      html += `<span class="${label ? 'major' : ''}" style="left:${(d + 180) * 3}px">${label || '|'}</span>`;
    }
    strip.innerHTML = html;
  }

  function showHud(on) {
    hud.classList.toggle('hidden', !on);
    $('#touch-ui').classList.toggle('hidden', !(on && game.input.isTouch));
    if (!on) {
      $('#scope').classList.add('hidden');
      $('#binoc').classList.add('hidden');
    }
  }

  function initHud(g) {
    hudCache = {};
    feedEl.innerHTML = '';
    centerEl.textContent = '';
    $('#hud-map').textContent = `${g.map.name} · ${g.weather.icon} ${g.weather.name} · ${g.time.icon} ${g.time.name}`;
    $('#bag-board').classList.add('hidden');
  }

  function setText(id, v) {
    if (hudCache[id] === v) return;
    hudCache[id] = v;
    $(id).textContent = v;
  }
  function setHtml(id, v) {
    if (hudCache[id] === v) return;
    hudCache[id] = v;
    $(id).innerHTML = v;
  }

  function updateHud(g, dt) {
    const w = g.weapons, gun = w.gun, p = g.player;
    setText('#hud-mode', g.mode.hud(g));
    setText('#hud-score', g.score.toLocaleString('fr-FR'));
    setHtml('#hud-side', g.mode.side ? g.mode.side(g) : '');
    // Munitions
    let shells = '';
    for (let i = 0; i < gun.def.capacity; i++) shells += `<i class="${i < gun.mag ? 'full' : ''} ${gun.def.bullet ? 'bullet' : ''}"></i>`;
    setHtml('#ammo-shells', shells);
    setText('#ammo-reserve', gun.reserve === Infinity ? '∞' : String(gun.reserve));
    setText('#ammo-name', gun.def.short + (w.guns.length > 1 ? `  [${w.cur + 1}/${w.guns.length}]` : ''));
    setText('#ammo-state', gun.state === 'reloading' ? 'Rechargement…' : gun.mag === 0 ? (gun.reserve > 0 ? 'R pour recharger' : 'Plus de munitions') : '');
    // Réticule
    const cross = $('#crosshair');
    const showCross = g.opts.crosshair && w.adsT < 0.5 && !g.binoculars;
    cross.style.opacity = showCross ? 1 - w.adsT * 2 : 0;
    if (showCross) {
      const spread = gun.def.bullet ? 0.01 : gun.def.spread * w.cart.spreadMul * w.choke.mul * 2.2;
      const px = Math.max(10, (spread / Math.tan(THREE.MathUtils.degToRad(g.camera.fov) / 2)) * (innerHeight / 2) * (1 + p.speedNow * 0.15));
      cross.style.width = cross.style.height = Math.round(px * 2) + 'px';
    }
    // Lunette / jumelles
    $('#scope').classList.toggle('hidden', !(gun.def.scope && w.adsT > 0.9));
    $('#binoc').classList.toggle('hidden', !g.binoculars);
    // Boussole
    const heading = ((-THREE.MathUtils.radToDeg(p.yaw) % 360) + 360) % 360;
    const cw = hudCache.compassW || (hudCache.compassW = $('#compass').clientWidth || 300);
    $('#compass-strip').style.transform = `translateX(${cw / 2 - (heading + 180) * 3}px)`;
    // Vent
    const wind = g.world.wind;
    const wh = THREE.MathUtils.radToDeg(Math.atan2(wind.x, -wind.z));
    $('#wind-arrow').style.transform = `rotate(${wh - heading}deg)`;
    setText('#wind-speed', `${Math.round(g.world.windSpeed * 3.6)} km/h`);
    // Souffle / endurance
    const breath = $('#breath');
    breath.style.opacity = w.adsT > 0.5 ? 1 : 0;
    $('#breath i').style.width = Math.round(p.breath * 100) + '%';
    $('#stamina').style.opacity = p.stamina < 0.99 ? 1 : 0;
    $('#stamina i').style.width = Math.round(p.stamina * 100) + '%';
    // Aides
    let hint = '';
    if (g.nearDead) hint = `E — Ramasser : ${g.nearDead.spec.name}`;
    else if (g.world.inBlind(p.pos) && p.crouching) hint = 'Caché dans l\'affût';
    setText('#hint', hint);
    const tools = [];
    if (g.hasEquip('call') && g.cfg.mode !== 'balltrap') tools.push(g.callCd > 0 ? `F Appeau (${Math.ceil(g.callCd)} s)` : 'F Appeau');
    if (g.hasEquip('binoc')) tools.push('B Jumelles');
    if (g.ducks.dog) tools.push('🐕 ' + ({ follow: 'Au pied', go: 'Va chercher !', return: 'Rapporte' }[g.ducks.dog.state] || ''));
    setText('#tools', tools.join('   ·   '));
    setText('#stance', p.crouching ? '▼ Accroupi' : p.sprinting ? '» Course' : '');
    // Tableau (Tab)
    const board = $('#bag-board');
    const showBoard = g.input.down('Tab');
    board.classList.toggle('hidden', !showBoard);
    if (showBoard) {
      const rows = Object.entries(g.bag).map(([id, n]) => `<div class="bag-item ${D.species[id].protected ? 'bad' : ''}"><span>${D.species[id].name}</span><b>×${n}</b></div>`).join('') || '<p>Carnier vide</p>';
      setHtml('#bag-board', `<h3>Tableau de chasse</h3>${rows}<div class="bag-foot">Tirs : ${g.shots} · Ramassés : ${g.retrieved}</div>`);
    }
    // Messages centraux
    if (centerT > 0) {
      centerT -= dt;
      if (centerT <= 0) centerEl.classList.remove('show');
    }
  }

  function feed(label, pts, cls = '', extra = '') {
    const d = document.createElement('div');
    d.className = 'feed-item ' + (cls || (pts < 0 ? 'bad' : ''));
    d.innerHTML = `<span>${esc(label)}</span>${pts !== null && pts !== undefined ? `<b>${pts > 0 ? '+' : ''}${pts}</b>` : ''}${extra ? `<b>${esc(extra)}</b>` : ''}`;
    feedEl.prepend(d);
    while (feedEl.children.length > 6) feedEl.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 4500);
    setTimeout(() => d.remove(), 5200);
  }

  function centerMsg(text, dur = 2) {
    centerEl.textContent = text;
    centerEl.classList.add('show');
    centerT = dur;
  }

  function floatMsg(text, cls = 'neutral') {
    const d = document.createElement('div');
    d.className = 'float ' + cls;
    d.textContent = text;
    floatEl.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  let hmTimer = null;
  function hitMarker(killed) {
    const h = $('#hitmarker');
    h.className = 'show' + (killed ? ' kill' : '');
    clearTimeout(hmTimer);
    hmTimer = setTimeout(() => (h.className = ''), killed ? 320 : 160);
  }

  function bumpScore() {
    const s = $('#hud-score');
    s.classList.remove('bump');
    void s.offsetWidth;
    s.classList.add('bump');
  }

  return {
    init, showMain, showSetup, showArmory, showJournal, showOptions, showControls, showResults, showPause, showLoading, toast,
    showHud, initHud, updateHud, feed, centerMsg, floatMsg, hitMarker, bumpScore,
  };
})();
