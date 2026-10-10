// Écrans : titre, pause, carte du domaine, préparation de sortie, armurerie, vestiaire,
// salle des trophées, carnet (zones vitales), options, bilan de chasse.
import * as Save from '../core/save.js';
import { WEAPONS, AMMO, OPTICS, GEAR, OUTFITS, SKINS, xpForLevel } from '../data/catalog.js';
import { SPECIES, MEDALS, MEDAL_NAMES } from '../animals/species.js';
import { buildVitals } from '../animals/vitals.js';
import { PLACES, STANDS, PATHS } from '../world/reserveMap.js';
import { energyAt } from '../game/ballistics.js';
import { fmt, clamp } from '../core/math.js';
import { audio } from '../core/audio.js';
import { PRESETS } from '../core/quality.js';
import { hasTouch } from '../core/quality.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MEDAL_CLASS = { aucune: 'none', bronze: 'bronze', argent: 'silver', or: 'gold', diamant: 'diamond', legendaire: 'legend' };
const BIRD_NAMES = { colvert: 'Canard colvert', sarcelle: "Sarcelle d'hiver", pilet: 'Canard pilet', siffleur: 'Canard siffleur', souchet: 'Canard souchet', milouin: 'Fuligule milouin', oie: 'Oie cendrée' };
const speciesName = (id) => SPECIES[id]?.name || BIRD_NAMES[id] || id;

export const TIMES = [
  { id: 'aube', name: 'Aube', hour: 7.0, desc: 'Le gibier regagne le couvert, brame du cerf' },
  { id: 'matin', name: 'Matinée', hour: 9.2, desc: 'Lumière rasante, animaux encore actifs' },
  { id: 'midi', name: 'Mi-journée', hour: 12.6, desc: 'Le grand gibier se couche en forêt' },
  { id: 'apm', name: 'Après-midi', hour: 15.6, desc: 'Reprise d\'activité en lisière' },
  { id: 'soir', name: 'Crépuscule', hour: 18.1, desc: 'La passée du soir, sangliers de sortie' },
  { id: 'nuit', name: 'Nuit (hutte)', hour: 21.0, desc: 'Gibier d\'eau seulement : chasse de nuit à la hutte' },
];

export const WEATHER_LIST = [
  { id: 'clair', name: 'Grand beau' }, { id: 'voile', name: 'Voilé' }, { id: 'couvert', name: 'Couvert' },
  { id: 'brume', name: 'Brume matinale' }, { id: 'pluie', name: 'Pluie' },
];

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.layer = document.createElement('div');
    this.layer.className = 'screens';
    this.root.appendChild(this.layer);
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    this.root.appendChild(this.toasts);
    this.open = null;
    this.mapImg = null;
    this.sync = 'local';
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' && this.open.closable !== false) { e.preventDefault(); this.close(); }
    });
  }

  toast(msg, ms = 3800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 600);
  }

  setSync(s) {
    this.sync = s;
    const e = $('.sync-badge');
    if (e) e.textContent = s === 'sync' ? 'Progression synchronisée' : 'Progression sur cet appareil';
  }

  // ------------------------------------------------------------------ fenêtre générique
  show(html, opts = {}) {
    this.close(true);
    const w = document.createElement('div');
    w.className = 'screen ' + (opts.cls || '');
    w.innerHTML = `<div class="panel ${opts.panel || ''}">${opts.closable === false ? '' : '<button class="close" aria-label="Fermer">✕</button>'}${html}</div>`;
    this.layer.appendChild(w);
    this.open = { el: w, onClose: opts.onClose, closable: opts.closable };
    const app = this.app;
    app.input.enabled = false;
    app.input.clearHeld();
    app.input.exitLock();
    if (app.current) app.current.paused = true;
    if (app.touch) app.touch.hide(true);
    const c = w.querySelector('.close');
    if (c) c.addEventListener('click', () => this.close());
    w.addEventListener('click', (e) => { if (e.target === w && opts.closable !== false) this.close(); });
    audio.ui();
    return w;
  }

  close(silent = false) {
    if (!this.open) return;
    const o = this.open;
    this.open = null;
    o.el.remove();
    if (silent) return;
    const app = this.app;
    if (app.current) app.current.paused = false;
    app.input.enabled = true;
    if (app.touch) app.touch.hide(false);
    if (o.onClose) o.onClose();
    else app.requestPlayLock();
  }

  // ------------------------------------------------------------------ titre
  showTitle() {
    const s = Save.get();
    const lp = Save.levelProgress();
    const w = this.show(`
      <div class="title-mark">Domaine de Hautevallée</div>
      <div class="title-sub">Réserve de chasse · grand gibier d'Europe & gibier d'eau</div>
      <div class="title-stats">
        <span><b>Niveau ${lp.level}</b></span><span>${fmt.money(s.money)}</span><span>${s.trophies.length} trophée${s.trophies.length > 1 ? 's' : ''}</span>
      </div>
      <div class="title-actions">
        <button class="btn big" data-a="go">Entrer au pavillon</button>
        <button class="btn ghost" data-a="help">Commandes</button>
        <button class="btn ghost" data-a="opt">Options</button>
      </div>
      <div class="sync-badge">${this.sync === 'sync' ? 'Progression synchronisée' : 'Progression sur cet appareil'}</div>
      <p class="title-note">Le pavillon est votre camp de base : salle des trophées à gauche, armurerie et vestiaire à droite, table des cartes au centre pour partir chasser.</p>
    `, { cls: 'title', panel: 'title-panel', closable: false });
    w.querySelector('[data-a="go"]').addEventListener('click', () => { audio.unlock(); this.close(); });
    w.querySelector('[data-a="help"]').addEventListener('click', () => this.openHelp(() => this.showTitle()));
    w.querySelector('[data-a="opt"]').addEventListener('click', () => this.openOptions(() => this.showTitle()));
  }

  openHelp(back) {
    const touch = hasTouch;
    const w = this.show(`
      <h2>Commandes</h2>
      <div class="cols">
        <div><h3>Clavier & souris</h3><table class="keys">
          <tr><td>Z Q S D / W A S D</td><td>Se déplacer</td></tr>
          <tr><td>Souris</td><td>Regarder</td></tr>
          <tr><td>Clic gauche</td><td>Tirer</td></tr>
          <tr><td>Clic droit</td><td>Épauler / lunette</td></tr>
          <tr><td>Molette</td><td>Grossissement de la lunette</td></tr>
          <tr><td>Maj</td><td>Courir · en visée : retenir son souffle</td></tr>
          <tr><td>C / X</td><td>Accroupi / couché</td></tr>
          <tr><td>R</td><td>Recharger</td></tr>
          <tr><td>1 · 2 · A</td><td>Carabine · fusil · changer</td></tr>
          <tr><td>B</td><td>Jumelles (identifier le gibier)</td></tr>
          <tr><td>F</td><td>Appeau</td></tr>
          <tr><td>V</td><td>Bâton de tir</td></tr>
          <tr><td>E</td><td>Interagir (mirador, gibier, armurerie…)</td></tr>
          <tr><td>M</td><td>Carte</td></tr>
          <tr><td>Échap</td><td>Pause</td></tr>
        </table></div>
        <div><h3>iPhone / tactile</h3><table class="keys">
          <tr><td>Pouce gauche</td><td>Joystick (poussez à fond pour courir)</td></tr>
          <tr><td>Pouce droit</td><td>Glisser n'importe où pour regarder</td></tr>
          <tr><td>VISER</td><td>Épauler / lunette (bascule)</td></tr>
          <tr><td>FEU</td><td>Tirer — on peut aussi glisser dessus pour viser</td></tr>
          <tr><td>À la lunette</td><td>Pincer pour zoomer, bouton TIR à gauche, bouton SOUFFLE pour stabiliser</td></tr>
        </table>${touch ? '' : '<p class="muted">Les commandes tactiles apparaissent automatiquement sur téléphone et tablette.</p>'}</div>
      </div>
      <button class="btn" data-a="back">Retour</button>`, { onClose: back });
    w.querySelector('[data-a="back"]').addEventListener('click', () => this.close());
  }

  // ------------------------------------------------------------------ pause
  openPause(hunt) {
    const w = this.show(`
      <h2>Pause</h2>
      <div class="menu-list">
        <button class="btn" data-a="resume">Reprendre</button>
        <button class="btn ghost" data-a="map">Carte du domaine</button>
        <button class="btn ghost" data-a="journal">Carnet du chasseur</button>
        <button class="btn ghost" data-a="opt">Options</button>
        <button class="btn ghost" data-a="help">Commandes</button>
        <button class="btn danger" data-a="lodge">Rentrer au pavillon</button>
      </div>`, { panel: 'narrow' });
    w.querySelector('[data-a="resume"]').addEventListener('click', () => this.close());
    w.querySelector('[data-a="map"]').addEventListener('click', () => this.openMap(hunt));
    w.querySelector('[data-a="journal"]').addEventListener('click', () => this.openJournal());
    w.querySelector('[data-a="opt"]').addEventListener('click', () => this.openOptions());
    w.querySelector('[data-a="help"]').addEventListener('click', () => this.openHelp());
    w.querySelector('[data-a="lodge"]').addEventListener('click', () => { this.close(true); this.app.endHunt(hunt); });
  }

  // ------------------------------------------------------------------ menu du pavillon
  openLodgeMenu() {
    const s = Save.get();
    const lp = Save.levelProgress();
    const w = this.show(`
      <h2>Pavillon de chasse</h2>
      <p class="muted">Niveau ${lp.level} · ${fmt.money(s.money)} · ${s.trophies.length} trophée${s.trophies.length > 1 ? 's' : ''}</p>
      <div class="menu-list">
        <button class="btn" data-a="resume">Reprendre</button>
        <button class="btn" data-a="go">Partir chasser</button>
        <button class="btn ghost" data-a="trophies">Salle des trophées</button>
        <button class="btn ghost" data-a="armory">Armurerie</button>
        <button class="btn ghost" data-a="outfit">Vestiaire</button>
        <button class="btn ghost" data-a="journal">Carnet du chasseur</button>
        <button class="btn ghost" data-a="opt">Options</button>
        <button class="btn ghost" data-a="help">Commandes</button>
      </div>
      <div class="sync-badge">${this.sync === 'sync' ? 'Progression synchronisée' : 'Progression sur cet appareil'}</div>`, { panel: 'narrow' });
    const back = () => this.openLodgeMenu();
    const on = (a, f) => w.querySelector(`[data-a="${a}"]`).addEventListener('click', f);
    on('resume', () => this.close());
    on('go', () => this.openExpedition());
    on('trophies', () => this.openTrophies(back));
    on('armory', () => this.openShop('rifle', back));
    on('outfit', () => this.openShop('outfit', back));
    on('journal', () => this.openJournal(back));
    on('opt', () => this.openOptions(back));
    on('help', () => this.openHelp(back));
  }

  // ------------------------------------------------------------------ carte
  buildMapImage(map) {
    if (this.mapImg) return this.mapImg;
    const n = map.n;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    const H = map.heights;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const h = H[k];
        const hx = H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)];
        const hz = H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i];
        const shade = clamp(0.75 - (hx * 0.9 + hz * 0.6) * 0.25, 0.35, 1.15);
        let r = 188, gg = 178, b = 140;
        const f = map.forest[k];
        if (h > 300) { r = 176; gg = 170; b = 160; }
        if (f > 0.35) { r = 96; gg = 112; b = 74; }
        if (map.splat[k * 4 + 2] > 120) { r = 150; gg = 150; b = 110; }
        if (h < map.water) { r = 92; gg = 128; b = 140; }
        const contour = Math.abs(((h % 10) + 10) % 10) < 0.35 && h > map.water ? 0.82 : 1;
        img.data[k * 4] = r * shade * contour;
        img.data[k * 4 + 1] = gg * shade * contour;
        img.data[k * 4 + 2] = b * shade * contour;
        img.data[k * 4 + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const toPx = (x, z) => [(x + map.half) / map.res, (z + map.half) / map.res];
    g.strokeStyle = 'rgba(120,82,40,0.9)';
    g.lineCap = 'round';
    for (const p of PATHS) {
      g.lineWidth = p.w * 0.45;
      g.beginPath();
      p.pts.forEach(([x, z], i) => { const [px, pz] = toPx(x, z); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); });
      g.stroke();
    }
    this.mapImg = { canvas: c, toPx };
    return this.mapImg;
  }

  openMap(hunt) {
    const map = hunt.map;
    const mi = this.buildMapImage(map);
    const places = [
      { ...PLACES.lodge, icon: '⌂', id: 'lodge' }, { ...PLACES.hut, icon: '⌖', id: 'hutte' },
      ...STANDS.map((s) => ({ ...s, icon: '▲' })),
    ];
    const w = this.show(`
      <h2>Domaine de Hautevallée</h2>
      <div class="map-wrap"><canvas class="map-canvas"></canvas></div>
      <div class="map-side">
        <h3>Se rendre à</h3>
        <div class="travel">${places.map((p) => `<button class="btn ghost small" data-go="${p.id}">${p.icon} ${esc(p.name)}</button>`).join('')}</div>
        <ul class="legend">
          <li><i class="lg forest"></i>Forêt</li><li><i class="lg water"></i>Étang</li><li><i class="lg marsh"></i>Marais</li><li><i class="lg rock"></i>Massif</li>
          <li>▲ Mirador · ⌖ Hutte · ⌂ Pavillon · ✚ Gibier à terre</li>
        </ul>
        <p class="muted">Lieux-dits : ${Object.values(PLACES).filter((p) => p.name && !p.h).map((p) => p.name).join(' · ')}</p>
      </div>`, { panel: 'wide map-panel' });
    const cv = w.querySelector('.map-canvas');
    const size = Math.min(620, innerWidth - 60, innerHeight - 160);
    cv.width = cv.height = size * 2;
    cv.style.width = cv.style.height = size + 'px';
    const g = cv.getContext('2d');
    const k = cv.width / mi.canvas.width;
    const draw = () => {
      g.drawImage(mi.canvas, 0, 0, cv.width, cv.height);
      g.font = `${22}px "Barlow Condensed", sans-serif`;
      g.textAlign = 'center';
      for (const p of places) {
        const [x, z] = mi.toPx(p.x, p.z);
        g.fillStyle = '#1b1b14';
        g.fillText(p.icon, x * k, z * k + 7);
      }
      for (const name of ['lake', 'marsh', 'meadow', 'peak', 'beechwood', 'pinewood']) {
        const p = PLACES[name];
        const [x, z] = mi.toPx(p.x, p.z);
        g.fillStyle = 'rgba(30,30,22,0.75)';
        g.font = `italic ${20}px "Cormorant SC", serif`;
        g.fillText(p.name, x * k, z * k - 14);
      }
      for (const a of hunt.downed || []) {
        if (a.harvested) continue;
        const [x, z] = mi.toPx(a.pos.x, a.pos.z);
        g.fillStyle = '#b8261c';
        g.fillText('✚', x * k, z * k + 7);
      }
      const pl = hunt.player;
      if (pl) {
        const [x, z] = mi.toPx(pl.pos.x, pl.pos.z);
        g.save();
        g.translate(x * k, z * k);
        g.rotate(-pl.yaw);
        g.fillStyle = '#d33';
        g.beginPath();
        g.moveTo(0, -14); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath();
        g.fill();
        g.restore();
      }
    };
    draw();
    w.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.go;
      this.close();
      this.travel(hunt, id);
    }));
  }

  travel(hunt, id) {
    const p = hunt.player;
    if (id === 'lodge') {
      const L = hunt.structures.lodge.door;
      p.seat = null;
      p.pos.set(L.x, hunt.map.heightAt(L.x, L.z), L.z - 2);
      p.yaw = 0;
    } else if (id === 'hutte') {
      const h = hunt.structures.hut;
      p.seat = { y: h.seatPos.y, eye: 1.05, rest: 0.55, hut: true };
      p.pos.copy(h.seatPos);
      p.yaw = h.yaw;
    } else {
      const s = hunt.structures.standById(id);
      if (!s) return;
      p.seat = { y: s.top.y, eye: 1.15, rest: 0.4, stand: s };
      p.pos.copy(s.top);
      p.yaw = s.def.yaw;
    }
    // Le trajet prend du temps
    hunt.world.sky.hour = (hunt.world.sky.hour + 0.25) % 24;
    hunt.hud.message('Vous arrivez à destination (15 min de marche)', '');
  }

  // ------------------------------------------------------------------ préparation de la sortie (table des cartes)
  openExpedition() {
    const s = Save.get();
    const last = s.last;
    let mode = last.mode || 'gros', time = TIMES.find((t) => Math.abs(t.hour - last.hour) < 0.6)?.id || 'aube', weather = last.weather || 'clair', stand = last.stand || 'pre';
    const w = this.show(`
      <h2>Préparer la sortie</h2>
      <div class="exp">
        <section><h3>Type de chasse</h3><div class="seg" data-g="mode">
          <button data-v="gros"><b>Grand gibier</b><span>Cerf, chevreuil, sanglier, chamois, daim · carabine</span></button>
          <button data-v="canard"><b>Gibier d'eau</b><span>Canards et oies à la hutte · fusil</span></button>
        </div></section>
        <section><h3>Point de départ</h3><div class="seg wrap" data-g="stand">
          <button data-v="lodge">Pavillon (à pied)</button>
          ${STANDS.map((st) => `<button data-v="${st.id}">${esc(st.name)}</button>`).join('')}
          <button data-v="hutte">Hutte de la Brème</button>
        </div></section>
        <section><h3>Moment</h3><div class="seg wrap" data-g="time">${TIMES.map((t) => `<button data-v="${t.id}" title="${esc(t.desc)}"><b>${t.name}</b><span>${fmt.time(t.hour)}</span></button>`).join('')}</div></section>
        <section><h3>Météo</h3><div class="seg wrap" data-g="weather">${WEATHER_LIST.map((x) => `<button data-v="${x.id}">${x.name}</button>`).join('')}</div></section>
        <section class="loadout"></section>
      </div>
      <div class="exp-foot">
        <p class="muted exp-note"></p>
        <button class="btn big" data-a="go">Partir chasser</button>
      </div>`, { panel: 'wide' });
    const refresh = () => {
      for (const [g, v] of [['mode', mode], ['time', time], ['weather', weather], ['stand', stand]]) {
        w.querySelectorAll(`[data-g="${g}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      }
      w.querySelectorAll('[data-g="time"] button[data-v="nuit"]').forEach((b) => (b.disabled = mode !== 'canard'));
      const lo = s.loadout;
      const wr = WEAPONS.find((x) => x.id === lo.rifle), ws = WEAPONS.find((x) => x.id === lo.shotgun);
      const out = OUTFITS.find((o) => o.id === lo.outfit);
      w.querySelector('.loadout').innerHTML = `<h3>Équipement emporté</h3><div class="lo-grid">
        <div><em>Carabine</em><b>${mode === 'canard' ? '—' : esc(wr ? wr.name : '—')}</b></div>
        <div><em>Fusil</em><b>${esc(ws ? ws.name : '—')}</b></div>
        <div><em>Munitions</em><b>${esc(AMMO.find((a) => a.id === lo.ammoRifle)?.name || '')} · ${esc(AMMO.find((a) => a.id === lo.ammoShot)?.name || '')}</b></div>
        <div><em>Tenue</em><b>${esc(out ? out.name : '')}</b></div>
        <div><em>Appeau</em><b>${esc(GEAR.find((g) => g.id === lo.call)?.name || 'Aucun')}</b></div>
      </div><button class="btn ghost small" data-a="armory">Changer à l'armurerie</button>`;
      w.querySelector('[data-a="armory"]').addEventListener('click', () => this.openShop('rifle', () => this.openExpedition()));
      const note = mode === 'canard'
        ? 'Passée : les vols arrivent surtout à l\'aube et au crépuscule. Plomb interdit près de l\'eau : cartouches acier, bismuth ou tungstène.'
        : 'Chasse de jour uniquement (une heure avant le lever du soleil jusqu\'à une heure après son coucher). Le cerf brame à l\'aube et au crépuscule : c\'est le rut d\'octobre.';
      w.querySelector('.exp-note').textContent = note;
    };
    w.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const g = seg.dataset.g;
      if (g === 'mode') { mode = b.dataset.v; if (mode === 'canard') stand = 'hutte'; else if (stand === 'hutte') stand = 'pre'; if (mode !== 'canard' && time === 'nuit') time = 'soir'; }
      if (g === 'time') time = b.dataset.v;
      if (g === 'weather') weather = b.dataset.v;
      if (g === 'stand') stand = b.dataset.v;
      audio.ui();
      refresh();
    }));
    refresh();
    w.querySelector('[data-a="go"]').addEventListener('click', () => {
      const hour = TIMES.find((t) => t.id === time).hour;
      this.close(true);
      this.app.startHunt({ mode, hour, weather, stand });
    });
  }

  // ------------------------------------------------------------------ armurerie & vestiaire
  openShop(tab = 'rifle', back) {
    const tabs = [
      ['rifle', 'Carabines'], ['shotgun', 'Fusils'], ['ammo', 'Munitions'], ['optic', 'Optiques'],
      ['gear', 'Équipement'], ['outfit', 'Vestiaire'], ['skin', 'Finitions'],
    ];
    const w = this.show(`
      <div class="shop-head"><h2>${tab === 'outfit' ? 'Vestiaire' : 'Armurerie'}</h2><div class="purse"></div></div>
      <nav class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</nav>
      <div class="shop-list"></div>`, { panel: 'wide shop', onClose: back });
    const list = w.querySelector('.shop-list');
    const render = () => {
      const s = Save.get();
      w.querySelector('.purse').innerHTML = `<b>${fmt.money(s.money)}</b><span>Niveau ${Save.level()}</span>`;
      list.innerHTML = this.shopItems(tab).map((it) => this.itemCard(it, tab)).join('');
      list.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => this.buyItem(b.dataset.buy, tab, render)));
      list.querySelectorAll('[data-eq]').forEach((b) => b.addEventListener('click', () => { this.equipItem(b.dataset.eq, tab, b.dataset.slot); render(); }));
    };
    w.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      w.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      w.querySelector('.shop-head h2').textContent = tab === 'outfit' ? 'Vestiaire' : 'Armurerie';
      audio.ui();
      render();
    }));
    render();
  }

  shopItems(tab) {
    if (tab === 'rifle' || tab === 'shotgun') return WEAPONS.filter((w) => w.kind === tab).map((w) => ({ ...w, key: w.id }));
    if (tab === 'ammo') return AMMO.map((a) => ({ ...a, key: a.id }));
    if (tab === 'optic') return Object.entries(OPTICS).filter(([, o]) => o.kind === 'scope' || o.kind === 'dot').map(([id, o]) => ({ ...o, id, key: id }));
    if (tab === 'gear') return GEAR.map((g) => ({ ...g, key: g.id }));
    if (tab === 'outfit') return OUTFITS.map((o) => ({ ...o, key: o.id }));
    if (tab === 'skin') return SKINS.map((k) => ({ ...k, key: 'skin:' + k.id }));
    return [];
  }

  itemCard(it, tab) {
    const s = Save.get();
    const st = Save.itemStatus(it, it.key);
    const lo = s.loadout;
    let stats = '';
    if (it.kind === 'rifle' && tab === 'rifle') {
      const e100 = energyAt(it.mass, it.v0 * Math.exp(-(0.00036 / it.bc) * 100));
      stats = `<span>${it.cal}</span><span>${Math.round(e100)} J à 100 m</span><span>${it.mag} coups</span><span>Recul ${bar(it.recoil / 1.6)}</span><span>${OPTICS[it.optic]?.name || ''}</span>`;
    } else if (it.kind === 'shotgun' && tab === 'shotgun') {
      stats = `<span>Calibre ${it.gauge}</span><span>${it.mag} coups</span><span>Recul ${bar(it.recoil / 1.6)}</span><span>Stabilité ${bar(1.2 - it.sway)}</span>`;
    } else if (tab === 'optic') stats = `<span>×${it.zoom[0]} – ×${it.zoom[1]}</span>${it.illum ? '<span>Point lumineux</span>' : ''}`;
    else if (tab === 'outfit') stats = `<span>Forêt ${bar(1.2 - it.vis.forest)}</span><span>Marais ${bar(1.2 - it.vis.marsh)}</span><span>Montagne ${bar(1.2 - it.vis.rock)}</span>`;
    else if (tab === 'skin') stats = `<span>${[it.wood && 'Bois', it.metal && 'Métal', it.engraved && 'Gravure'].filter(Boolean).join(' · ') || 'Finition d\'origine'}</span>`;
    let equipped = false, action = '';
    if (st === 'owned') {
      if (tab === 'rifle') equipped = lo.rifle === it.id;
      if (tab === 'shotgun') equipped = lo.shotgun === it.id;
      if (tab === 'ammo') equipped = lo.ammoRifle === it.id || lo.ammoShot === it.id;
      if (tab === 'outfit') equipped = lo.outfit === it.id;
      if (tab === 'gear') equipped = lo.call === it.id || lo.binoc === it.id;
      if (tab === 'optic') {
        const rifles = WEAPONS.filter((w) => w.kind === 'rifle' && Save.owns(w.id) && (OPTICS[w.optic]?.kind === 'scope' || OPTICS[w.optic]?.kind === it.kind));
        action = rifles.map((r) => `<button class="btn small ${((s.scopes[r.id] || r.optic) === it.id) ? 'on' : 'ghost'}" data-eq="${it.key}" data-slot="${r.id}">Sur ${esc(r.short)}</button>`).join('');
      } else if (tab === 'skin') {
        const owned = WEAPONS.filter((w) => Save.owns(w.id));
        action = owned.map((r) => `<button class="btn small ${((s.skins[r.id] || 'std') === it.id) ? 'on' : 'ghost'}" data-eq="${it.key}" data-slot="${r.id}">${esc(r.short)}</button>`).join('');
      } else if (tab === 'gear' && !it.slot.match(/call|binoc/)) action = '<span class="tag ok">Toujours emporté</span>';
      else action = equipped ? '<span class="tag ok">Équipé</span>' : `<button class="btn small" data-eq="${it.key}">Équiper</button>`;
    } else if (st === 'buy') action = `<button class="btn small" data-buy="${it.key}">Acheter · ${fmt.money(it.price || 0)}</button>`;
    else if (st === 'reward') action = `<button class="btn small gold" data-buy="${it.key}">Récupérer la récompense</button>`;
    else if (st === 'level') action = `<span class="tag">Niveau ${it.level} requis · ${fmt.money(it.price || 0)}</span>`;
    else action = `<span class="tag lock">À gagner : ${esc(it.unlock ? it.unlock.text : '')}</span>`;
    const exclusive = it.exclusive ? '<span class="excl">Exclusif</span>' : it.unlock ? '<span class="excl">Récompense possible</span>' : '';
    const swatch = tab === 'outfit' ? `<div class="swatch">${it.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>` : '';
    return `<article class="item ${st}${equipped ? ' equipped' : ''}">
      ${swatch}<div class="item-main"><h4>${esc(it.name)} ${exclusive}</h4>
      <p>${esc(it.desc || (it.unlock ? it.unlock.text : ''))}</p><div class="stats">${stats}</div>
      ${it.unlock && st !== 'owned' && !it.exclusive ? `<p class="muted small">Offert gratuitement : ${esc(it.unlock.text)}</p>` : ''}</div>
      <div class="item-act">${action}</div></article>`;
  }

  buyItem(key, tab, render) {
    const it = this.shopItems(tab).find((x) => x.key === key);
    if (!it) return;
    const r = Save.buy(it, key);
    if (r.ok) {
      audio.ui('buy');
      this.toast(r.free ? `Récompense obtenue : ${it.name}` : `Acheté : ${it.name}`);
      this.equipItem(key, tab);
      if (this.app.current && this.app.current.refreshDisplays) this.app.current.refreshDisplays();
    } else {
      audio.ui('error');
      this.toast(r.money ? 'Fonds insuffisants' : 'Indisponible pour le moment');
    }
    render();
  }

  equipItem(key, tab, slot) {
    const s = Save.get();
    const lo = s.loadout;
    if (!Save.owns(key)) return;
    if (tab === 'rifle') lo.rifle = key;
    if (tab === 'shotgun') lo.shotgun = key;
    if (tab === 'ammo') { const a = AMMO.find((x) => x.id === key); if (a.kind === 'rifle') lo.ammoRifle = key; else lo.ammoShot = key; }
    if (tab === 'outfit') lo.outfit = key;
    if (tab === 'gear') { const g = GEAR.find((x) => x.id === key); if (g.slot === 'call') lo.call = key; if (g.slot === 'binoc') lo.binoc = key; }
    if (tab === 'optic' && slot) s.scopes[slot] = key;
    if (tab === 'skin' && slot) s.skins[slot] = key.replace('skin:', '');
    Save.write();
    audio.ui();
    if (this.app.current && this.app.current.refreshDisplays) this.app.current.refreshDisplays();
  }

  // ------------------------------------------------------------------ salle des trophées
  openTrophies(back) {
    const s = Save.get();
    const list = [...s.trophies].sort((a, b) => rank(b.medal) - rank(a.medal) || b.score - a.score);
    const counts = { bronze: 0, argent: 0, or: 0, diamant: 0, legendaire: 0 };
    for (const t of list) if (counts[t.medal] !== undefined) counts[t.medal]++;
    const best = {};
    for (const t of list) if (!best[t.species]) best[t.species] = t.id;
    const w = this.show(`
      <h2>Salle des trophées</h2>
      <div class="medal-row">${Object.entries(counts).map(([m, n]) => `<span class="mchip ${MEDAL_CLASS[m]}">${MEDAL_NAMES[m]} <b>${n}</b></span>`).join('')}</div>
      ${list.length ? '' : '<p class="muted">Aucun trophée pour l\'instant. Partez chasser depuis la table des cartes : vos plus beaux trophées seront naturalisés et accrochés ici.</p>'}
      <div class="trophy-grid">${list.map((t) => `
        <article class="trophy ${MEDAL_CLASS[t.medal]}">
          <div class="t-medal"><span>${t.duck ? fmt.dec(t.weight, 2) : fmt.dec(t.score, 1)}</span><em>${t.duck ? 'kg' : 'pts'}</em></div>
          <div><h4>${esc(speciesName(t.species))}${best[t.species] === t.id ? ' <span class="best">record</span>' : ''}</h4>
          <p>${MEDAL_NAMES[t.medal]}${t.legendary ? ' · Légendaire' : ''}${t.duck ? '' : ' · ' + fmt.kg(t.weight)}</p>
          <p class="muted small">${new Date(t.date).toLocaleDateString('fr-FR')}${t.dist ? ' · tir à ' + t.dist + ' m' : ''}${t.weapon ? ' · ' + esc(t.weapon) : ''}</p></div>
        </article>`).join('')}</div>`, { panel: 'wide', onClose: back });
    void w;
  }

  // ------------------------------------------------------------------ carnet : zones vitales
  openJournal(back) {
    const ids = Object.keys(SPECIES);
    let cur = ids[0];
    const w = this.show(`
      <h2>Carnet du chasseur</h2>
      <nav class="tabs">${ids.map((id) => `<button data-sp="${id}" class="${id === cur ? 'on' : ''}">${SPECIES[id].name}</button>`).join('')}<button data-sp="regles">Règles & éthique</button></nav>
      <div class="journal"></div>`, { panel: 'wide', onClose: back });
    const body = w.querySelector('.journal');
    const render = () => {
      if (cur === 'regles') {
        body.innerHTML = `<div class="rules">
          <h3>Bien tirer</h3><ul>
            <li>Le meilleur angle est l'animal de profil : visez dans l'axe de la patte avant, au tiers inférieur du corps. Cœur et poumons s'y trouvent.</li>
            <li>Animal trois-quarts arrière : visez vers l'épaule opposée pour traverser la cage thoracique.</li>
            <li>Évitez les tirs de face, de dos, sur animal en course ou trop lointain : un tir au ventre ou à la patte fait souffrir l'animal.</li>
            <li>Un tir au foie tue plus lentement ; un tir au ventre est à éviter absolument.</li>
            <li>Le sanglier a les organes plus bas et plus en avant : visez juste au-dessus du coude.</li>
            <li>Utilisez un calibre adapté : en France, une balle de grand gibier doit garder au moins 1 000 joules à 100 m.</li></ul>
          <h3>Règles du domaine</h3><ul>
            <li>Grand gibier : tir de jour uniquement, d'une heure avant le lever du soleil à une heure après son coucher.</li>
            <li>Gibier d'eau : grenaille de plomb interdite à moins de 100 m de l'eau — acier, bismuth ou tungstène. La chasse de nuit à la hutte est autorisée.</li>
            <li>Cygne tuberculé et tadorne de Belon sont protégés : ne tirez pas.</li>
            <li>Gilet orange recommandé lors des déplacements.</li></ul>
          <h3>Médailles (inspirées des barèmes CIC)</h3>
          <table class="medtab"><tr><th>Espèce</th><th>Bronze</th><th>Argent</th><th>Or</th><th>Diamant</th></tr>
          ${Object.entries(MEDALS).map(([k, m]) => `<tr><td>${SPECIES[k].name}</td><td>${m.bronze}</td><td>${m.argent}</td><td>${m.or}</td><td>${m.diamant}</td></tr>`).join('')}</table></div>`;
      } else {
        const sp = SPECIES[cur];
        const m = MEDALS[cur];
        body.innerHTML = `<div class="jr">
          <figure class="vitals">${vitalSVG(sp)}<figcaption>Zone de tir idéale (profil) : cœur et poumons</figcaption></figure>
          <div><h3>${sp.name} <em>${sp.latin}</em></h3>
          <p><b>Mâle :</b> ${sp.male} · <b>Femelle :</b> ${sp.female} · Poids : ${sp.weight.m[0]}–${sp.weight.m[1]} kg (mâle)</p>
          <p><b>Où viser :</b> ${sp.vitalHint}</p>
          <p><b>Arme :</b> ${sp.calibers}</p>
          <p><b>Trophée :</b> Bronze ${m.bronze} · Argent ${m.argent} · Or ${m.or} · Diamant ${m.diamant} ${m.unit}</p>
          <p><b>Pelages :</b> ${sp.furs.map((f) => f.name + (f.rare ? ' (rare)' : '')).join(', ')}</p>
          <p><b>Prélevés :</b> ${Save.get().stats.kills[cur] || 0}</p></div></div>`;
      }
    };
    w.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => {
      cur = b.dataset.sp;
      w.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    render();
  }

  // ------------------------------------------------------------------ options
  openOptions(back) {
    const s = Save.get();
    const o = s.options;
    const q = this.app.engine.qualityName;
    const w = this.show(`
      <h2>Options</h2>
      <div class="opts">
        <label>Sensibilité souris <input type="range" id="o-sens" min="0.2" max="3" step="0.05" value="${o.sens}"></label>
        <label>Sensibilité tactile <input type="range" id="o-tsens" min="0.2" max="3" step="0.05" value="${o.touchSens}"></label>
        <label>Champ de vision <input type="range" id="o-fov" min="55" max="95" step="1" value="${o.fov}"><output>${o.fov}°</output></label>
        <label>Volume <input type="range" id="o-vol" min="0" max="1" step="0.05" value="${o.volume}"></label>
        <label>Vitesse des oiseaux <input type="range" id="o-bird" min="0.6" max="1.3" step="0.05" value="${o.birdSpeed}"><output>×${fmt.dec(o.birdSpeed, 2)}</output></label>
        <label class="chk"><input type="checkbox" id="o-inv" ${o.invertY ? 'checked' : ''}> Inverser l'axe vertical</label>
        <label class="chk"><input type="checkbox" id="o-aim" ${o.aimToggle ? 'checked' : ''}> Visée par bascule (au lieu de maintenir)</label>
        <label class="chk"><input type="checkbox" id="o-cross" ${o.crosshair !== false ? 'checked' : ''}> Point de visée à la hanche</label>
        <div class="q"><span>Qualité graphique</span><div class="seg wrap">${Object.entries(PRESETS).map(([k, p]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${p.label}</button>`).join('')}</div>
        <p class="muted small">Changer la qualité relance le jeu (la progression est conservée).</p></div>
        <div class="danger-zone"><button class="btn danger small" data-a="reset">Effacer la progression</button></div>
      </div>`, { panel: 'narrow', onClose: back });
    const bind = (id, key, num = true, after) => {
      const e = w.querySelector(id);
      e.addEventListener('input', () => {
        o[key] = e.type === 'checkbox' ? e.checked : num ? Number(e.value) : e.value;
        if (after) after(e);
        Save.write();
      });
    };
    bind('#o-sens', 'sens');
    bind('#o-tsens', 'touchSens');
    bind('#o-fov', 'fov', true, (e) => (e.nextElementSibling.textContent = e.value + '°'));
    bind('#o-vol', 'volume', true, () => audio.setVolume(o.volume));
    bind('#o-bird', 'birdSpeed', true, (e) => (e.nextElementSibling.textContent = '×' + fmt.dec(Number(e.value), 2)));
    bind('#o-inv', 'invertY');
    bind('#o-aim', 'aimToggle', true, () => (this.app.input.aimToggle = o.aimToggle || hasTouch));
    bind('#o-cross', 'crosshair');
    w.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.q !== q) this.app.applyQuality(b.dataset.q); }));
    const reset = w.querySelector('[data-a="reset"]');
    reset.addEventListener('click', () => {
      if (reset.dataset.armed) { Save.reset(); location.reload(); }
      else { reset.dataset.armed = '1'; reset.textContent = 'Confirmer : tout effacer'; }
    });
  }

  // ------------------------------------------------------------------ bilan de sortie
  showSummary(hunt, cb) {
    const bag = hunt.bag;
    const s = Save.get();
    const rows = bag.map((t) => `<tr><td>${esc(t.duck ? t.name : speciesName(t.species))}</td><td>${t.duck ? fmt.dec(t.weight, 2) + ' kg' : fmt.dec(t.score, 1) + ' pts'}</td><td><span class="mchip ${MEDAL_CLASS[t.medal]}">${MEDAL_NAMES[t.medal]}</span></td></tr>`).join('');
    const w = this.show(`
      <h2>Retour au pavillon</h2>
      ${bag.length ? `<table class="bag"><tr><th>Gibier</th><th>Cotation</th><th>Médaille</th></tr>${rows}</table>` : '<p class="muted">Bredouille cette fois. Observez aux jumelles, approchez à couvert et profitez des miradors à l\'aube et au crépuscule.</p>'}
      <p>Solde : <b>${fmt.money(s.money)}</b> · Niveau ${Save.level()}</p>
      <button class="btn big" data-a="ok">Entrer au pavillon</button>`, { panel: 'narrow', closable: false, onClose: cb });
    w.querySelector('[data-a="ok"]').addEventListener('click', () => this.close());
  }
}

function rank(m) { return { aucune: 0, bronze: 1, argent: 2, or: 3, diamant: 4, legendaire: 5 }[m] || 0; }
function bar(v) {
  const n = clamp(Math.round(v * 5), 0, 5);
  return `<i class="bar5">${'●'.repeat(n)}${'○'.repeat(5 - n)}</i>`;
}

// Silhouette de profil (à partir du profil anatomique) et zones vitales
export function vitalSVG(sp) {
  const B = sp.body;
  const top = B.map((s) => [s[0], s[1] + s[2]]);
  const bot = B.map((s) => [s[0], s[1] - s[3]]).reverse();
  const minZ = B[0][0] - 0.05, maxZ = B[B.length - 1][0] + 0.05;
  const W = 360, H = 240;
  const sc = Math.min(W / (maxZ - minZ), H / 1.9);
  const X = (z) => (z - minZ) * sc, Y = (y) => H - y * sc - 8;
  const pts = [...top, ...bot].map(([z, y]) => `${X(z).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const legs = [sp.front, sp.rear].map((l) => `<polyline points="${l.pts.map((p) => `${X(p[2]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="${(l.r[2] * sc * 1.6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const v = buildVitals(sp);
  const ell = (o, fill, op) => `<ellipse cx="${X(o.c.z).toFixed(1)}" cy="${Y(o.c.y).toFixed(1)}" rx="${(o.r.z * sc).toFixed(1)}" ry="${(o.r.y * sc).toFixed(1)}" fill="${fill}" opacity="${op}"/>`;
  const lung = v.find((o) => o.key === 'poumonG'), heart = v.find((o) => o.key === 'coeur'), liver = v.find((o) => o.key === 'foie');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Zones vitales du ${sp.name}">
    <polygon points="${pts}" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="1.5"/>${legs}
    ${ell(lung, '#e98b98', 0.75)}${ell(liver, '#7b2a1e', 0.55)}${ell(heart, '#b3122a', 0.95)}
    <circle cx="${X(heart.c.z).toFixed(1)}" cy="${Y(heart.c.y + heart.r.y * 0.6).toFixed(1)}" r="7" fill="none" stroke="#1b6b2a" stroke-width="2.5"/>
    <line x1="${X(heart.c.z).toFixed(1)}" y1="${(Y(heart.c.y + heart.r.y * 0.6) - 12).toFixed(1)}" x2="${X(heart.c.z).toFixed(1)}" y2="${(Y(heart.c.y + heart.r.y * 0.6) + 12).toFixed(1)}" stroke="#1b6b2a" stroke-width="1.5"/>
    <line x1="${(X(heart.c.z) - 12).toFixed(1)}" y1="${Y(heart.c.y + heart.r.y * 0.6).toFixed(1)}" x2="${(X(heart.c.z) + 12).toFixed(1)}" y2="${Y(heart.c.y + heart.r.y * 0.6).toFixed(1)}" stroke="#1b6b2a" stroke-width="1.5"/>
  </svg>`;
}

export { xpForLevel };
