// Partie de chasse dans le domaine : monde, chasseur, armes, gibier, oiseaux, balistique,
// heure qui passe, interface, tir éthique, récupération du gibier.
import * as THREE from 'three';
import { ReserveScene } from '../world/reserve.js';
import { PLACES, STANDS } from '../world/reserveMap.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { Ballistics, energyAt } from './ballistics.js';
import { AnimalFactory } from '../animals/factory.js';
import { Population } from '../animals/population.js';
import { SPECIES, MEDAL_NAMES } from '../animals/species.js';
import { trophySummary, trophyTitle } from '../animals/trophies.js';
import { GunFactory } from '../gfx/guns.js';
import { Effects } from '../gfx/effects.js';
import { Structures } from '../world/structures.js';
import { HUD } from '../ui/hud.js';
import { GU } from '../gfx/globals.js';
import { audio } from '../core/audio.js';
import * as Save from '../core/save.js';
import { clamp, fmt, R, smoothstep, angleDiff } from '../core/math.js';
import { WEAPONS, GEAR } from '../data/catalog.js';
import { sunDirection } from '../gfx/sky.js';

export const WEATHERS = {
  clair: { name: 'Grand beau', clouds: 0.18, overcast: 0, haze: 0.1, fog: 1, rain: 0, wet: 0, wind: 0.6 },
  voile: { name: 'Voilé', clouds: 0.55, overcast: 0.2, haze: 0.25, fog: 1.1, rain: 0, wet: 0, wind: 1.0 },
  couvert: { name: 'Couvert', clouds: 0.92, overcast: 0.85, haze: 0.4, fog: 1.4, rain: 0, wet: 0.1, wind: 1.6 },
  brume: { name: 'Brume matinale', clouds: 0.35, overcast: 0.3, haze: 1.0, fog: 5.5, fogFalloff: 0.06, rain: 0, wet: 0.2, wind: 0.2 },
  pluie: { name: 'Pluie', clouds: 1, overcast: 1, haze: 0.6, fog: 2.4, rain: 1, wet: 1, wind: 2.2 },
};

const ETHICAL = new Set(['foudroye', 'coeur', 'poumons']);
const QUALITY = { foudroye: 1, coeur: 1, poumons: 0.95, poumon: 0.75, foie: 0.55, trachee: 0.55, ventre: 0.3, patte: 0.25, chair: 0.4 };
const OUTCOME_TEXT = {
  foudroye: 'Foudroyé sur place', coeur: 'Balle au cœur', poumons: 'Double poumon', poumon: 'Un poumon', foie: 'Balle au foie',
  trachee: 'Trachée', ventre: 'Balle de ventre (non éthique)', patte: 'Patte touchée', chair: 'Balle dans les muscles',
};

export class Hunt {
  constructor(app, opts) {
    this.app = app;
    this.engine = app.engine;
    this.opts = opts;
    this.mode = opts.mode || 'gros';
    this.paused = false;
    this.time = 0;
    this.downed = [];
    this.wounded = null;
    this.bag = [];
    this.fines = 0;
  }

  get scene() { return this.world.scene; }
  get hasCall() { const s = Save.get(); return !!s.loadout.call && s.owned.includes(s.loadout.call); }
  get hasSticks() { return Save.get().owned.includes('baton'); }
  get camera() { return this.world.camera; }
  get map() { return this.world.map; }

  async load(progress) {
    const save = Save.get();
    this.world = new ReserveScene(this.engine, this.app.texgen, { hour: this.opts.hour ?? 8 });
    await this.world.load((p, l) => progress(p * 0.8, l));
    const w = this.world;
    w.sky.setWeather(WEATHERS[this.opts.weather] || WEATHERS.clair);
    this.weather = WEATHERS[this.opts.weather] || WEATHERS.clair;
    w.sky.hour = this.opts.hour ?? 8;
    progress(0.82, 'Miradors et hutte');
    this.structures = new Structures(w.map, this.app.texgen, this.app.guns);
    this.scene.add(this.structures.group);
    progress(0.86, 'Gibier');
    this.factory = this.app.animalFactory || (this.app.animalFactory = new AnimalFactory(this.engine, this.app.texgen));
    this.population = new Population(this, this.factory, (Date.now() & 0xffff) ^ 0x5a17);
    this.population.generate();
    this.population.attach(this.scene);
    this.ballistics = new Ballistics(this);
    this.effects = new Effects(this.scene);
    if (this.mode === 'canard' || true) {
      const { BirdSystem } = await import('../animals/birds.js');
      this.birds = new BirdSystem(this, this.app.texgen, this.mode === 'canard');
      this.scene.add(this.birds.group);
    }
    progress(0.92, 'Armes');
    // Joueur : départ choisi
    const spawn = this.spawnPoint(this.opts.stand);
    this.player = new Player(this, spawn);
    if (spawn.seat) this.player.seat = spawn.seat;
    this.weapons = new WeaponSystem(this, this.app.guns, this.camera);
    const lo = { ...save.loadout };
    if (this.mode === 'canard') lo.rifle = null;
    this.weapons.equip(lo);
    if (this.mode === 'canard') this.weapons.select(0, true);
    this.viewScene = new THREE.Scene();
    this.viewScene.add(this.weapons.view);
    this.viewLight = new THREE.DirectionalLight(0xffffff, 2);
    this.viewAmb = new THREE.HemisphereLight(0xbfd4ff, 0x404030, 0.6);
    this.viewScene.add(this.viewLight, this.viewAmb, this.weapons.flash);
    this.scene.add(this.camera);
    // Interface
    this.hud = new HUD(document.getElementById('ui'));
    this.hud.show(true);
    this.audio = audio;
    audio.setEnv('outdoor');
    audio.startAmbience('forest');
    progress(1, 'Bonne chasse');
    this.started = performance.now();
    Save.get().stats.sessions++;
    Save.write();
    const st = STANDS.find((s) => s.id === this.opts.stand);
    this.hud.big(this.mode === 'canard' ? 'Passée au gibier d\'eau' : 'Chasse au grand gibier', st ? st.name : spawn.name || PLACES.lodge.name, 3.5);
  }

  spawnPoint(id) {
    const m = this.map;
    if (this.mode === 'canard' || id === 'hutte') {
      const h = this.structures.hut;
      return { x: h.seatPos.x, z: h.seatPos.z, yaw: h.yaw, seat: { y: h.seatPos.y, eye: 1.05, rest: 0.55, hut: true }, name: PLACES.hut.name };
    }
    const st = STANDS.find((s) => s.id === id);
    if (st) {
      const s = this.structures.standById(st.id);
      return { x: s.top.x, z: s.top.z, yaw: st.yaw, seat: { y: s.top.y, eye: 1.15, rest: 0.4, stand: s }, name: st.name };
    }
    const L = PLACES.lodge;
    return { x: L.x + 6, z: L.z - 38, yaw: 0, name: PLACES.lodge.name };
  }

  // ------------------------------------------------------------------ interface "monde" (animaux, balles)
  get veg() { return this.world.veg; }
  get lightFactor() {
    const sd = GU.uSunDir.value;
    return clamp(0.35 + sd.y * 3, 0.35, 1);
  }
  groundAt(x, z) {
    const s = this.structures && this.structures.floorAt(x, z);
    return Math.max(this.map.heightAt(x, z), s ?? -1e9);
  }
  collide(pos, r) {
    this.world.veg.collide(pos, r);
    if (this.structures) this.structures.collide(pos, r);
  }
  coverAt(x, z, eye) {
    // Herbes hautes, roseaux, fougères : on est mieux caché accroupi ou couché
    const m = this.map;
    const reeds = m.splatAt(x, z, 2) > 0.5 && m.heightAt(x, z) < m.water + 0.5;
    const ferns = m.splatAt(x, z, 0) > 0.55;
    let c = 1;
    if (reeds) c = eye < 1.2 ? 0.45 : 0.7;
    else if (ferns) c = eye < 0.8 ? 0.55 : eye < 1.2 ? 0.8 : 0.95;
    if (this.player && this.player.seat && this.player.seat.hut) c *= 0.5;
    return c;
  }
  lineOfSight(x0, y0, z0, x1, y1, z1) {
    const m = this.map;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.ceil(d / 5));
    let forest = 0;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
      if (m.heightAt(x, z) > y - 0.2) return 0;
      forest += m.forestAt(x, z) * (d / n);
    }
    return Math.exp(-forest * 0.028);
  }
  pickGoal(animal, home) {
    const m = this.map;
    const feeding = this.isFeedingTime();
    for (let k = 0; k < 20; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * home.r;
      const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
      if (!m.inBounds(x, z, 50) || m.waterDepth(x, z) > 0.05 || m.slopeAt(x, z) > animal.senses.maxSlope * 0.8) continue;
      const f = m.forestAt(x, z);
      // À l'aube et au crépuscule : lisières et prés ; en journée : couvert forestier
      const wantOpen = feeding && animal.ind.species !== 'sanglier';
      if (wantOpen && f > 0.7 && R() < 0.7) continue;
      if (!feeding && f < 0.3 && R() < 0.7 && animal.ind.species !== 'chamois') continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(home.x, 0, home.z);
  }
  clampGoal(g, animal) {
    const m = this.map;
    g.x = clamp(g.x, -m.half + 60, m.half - 60);
    g.z = clamp(g.z, -m.half + 60, m.half - 60);
    void animal;
    return g;
  }
  isFeedingTime() {
    const h = this.world.sky.hour;
    return (h > 6 && h < 10.5) || (h > 16.5 && h < 21);
  }
  isRestTime() { return !this.isFeedingTime(); }
  rutActivity() {
    const h = this.world.sky.hour;
    return h < 9.5 || h > 17.5 ? 0.75 : 0.18;
  }
  isLegalTime() {
    const h = this.world.sky.hour;
    return h >= 6.9 && h <= 20.35;
  }
  onAnimalSound(animal, kind) {
    audio.animal(animal.ind.species, kind, animal.pos.clone().setY(animal.pos.y + 1));
  }
  onAnimalDied(animal) {
    if (!animal.shotByPlayer) return;
    if (!this.downed.includes(animal)) this.downed.push(animal);
    if (this.wounded === animal) this.wounded = null;
    const d = animal.pos.distanceTo(this.player.pos);
    if (d < 400) this.hud.message(`${SPECIES[animal.ind.species].name} à terre`, 'good');
  }
  structureHit(a, b) { return this.structures ? this.structures.segmentHit(a, b) : null; }

  onImpact(kind, pos, proj) {
    if (kind === 'water') {
      this.effects.splash(pos);
      this.world.water.ripple(pos.x, pos.z, 1);
    } else if (kind === 'wood') this.effects.chips(pos);
    else this.effects.dust(pos);
    if (!proj.pellet) audio.impact(kind, pos);
  }

  onAnimalHit(animal, hit, entry, proj) {
    const v = proj.vel.length();
    const def = proj.weapon;
    const save = Save.get();
    const E = proj.pellet ? 0.5 * 0.0003 * v * v * 30 : energyAt(def.mass, v) * (proj.pen || 1);
    const dir = proj.vel.clone().normalize();
    const pen = proj.pellet ? 0.05 : clamp((E / 1500) * (proj.pen || 1), 0.2, 2.2);
    const a = entry.clone().addScaledVector(dir, -0.04);
    const b = entry.clone().addScaledVector(dir, pen);
    const path = animal.organsOnPath(a, b);
    const organs = path.hits.filter((o) => o.t <= 1);
    const dist = proj.origin.distanceTo(entry);
    const info = {
      organs, zone: hit.zone, energy: E, from: this.player.pos.clone(), dist, weapon: def.id, weaponName: def.short,
      path: path.path, pathLen: pen, time: this.world.sky.hour, pellet: proj.pellet,
    };
    animal.shotByPlayer = true;
    const res = animal.applyHit(info);
    this.effects.hair(entry, new THREE.Color(0.4, 0.3, 0.22));
    audio.impact('flesh', entry);
    save.stats.hits++;
    if (!animal.dead && !res.already) {
      this.wounded = animal;
      this.woundedSeen = animal.pos.clone();
      this.woundedT = 240;
    }
    if (animal.dead && !this.downed.includes(animal)) this.onAnimalDied(animal);
    this.hud.message('Balle au but', 'hit');
    if (!this.isLegalTime()) {
      this.hud.message('Tir de nuit interdit sur le grand gibier !', 'bad');
      animal.illegal = true;
    }
    Save.write();
  }

  onBirdHit(bird, proj) {
    void bird; void proj;
  }

  // Canard rapporté (par le chien ou à la récupération)
  async onDuckRetrieved(b) {
    const { BIRDS, BirdSystem } = await import('../animals/birds.js');
    const sp = BIRDS[b.species];
    const s = Save.get();
    const sexName = b.sex === 'm' ? ' ♂' : b.sex === 'f' ? ' ♀' : '';
    if (sp.protected) {
      const fine = 1500;
      s.money -= fine;
      s.stats.fines += fine;
      this.hud.message(`${sp.name} : espèce protégée ! Amende de ${fmt.money(fine)}`, 'bad');
      Save.write();
      return;
    }
    const medal = BirdSystem.medal(b.species, b.weight);
    const medalK = { aucune: 1, bronze: 1.25, argent: 1.5, or: 2, diamant: 3 }[medal];
    const dogK = this.birds.hasDog ? 1.2 : 1;
    const money = Math.round(18 * sp.pts * medalK * dogK);
    const xp = Math.round(25 * sp.pts * medalK);
    s.money += money;
    s.xp += xp;
    s.stats.ducks++;
    s.stats.kills[b.species] = (s.stats.kills[b.species] || 0) + 1;
    const rec = { species: b.species, name: sp.name + sexName, weight: b.weight, medal };
    this.bag.push({ ...rec, duck: true });
    const who = this.birds.hasDog ? 'Votre labrador rapporte' : 'Récupéré :';
    this.hud.message(`${who} ${sp.name}${sexName} — ${b.weight.toFixed(2).replace('.', ',')} kg${medal !== 'aucune' ? ' · ' + MEDAL_NAMES[medal] : ''} · +${fmt.money(money)}`, medal !== 'aucune' ? 'medal-' + medal : 'good');
    if (medal !== 'aucune') {
      Save.addTrophy({
        id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), species: b.species, sex: b.sex, score: Math.round(b.weight * 100) / 100,
        medal, weight: Math.round(b.weight * 100) / 100, date: Date.now(), dist: 0, duck: true,
      });
      if (medal === 'or' || medal === 'diamant') audio.fanfare(medal === 'diamant' ? 'diamant' : 'court');
    }
    for (const r of Save.newRewards()) this.hud.message(`Récompense débloquée : ${r.name} (armurerie)`, 'reward');
    Save.write();
  }

  onGunshot(origin, def, muzzle, dir) {
    audio.gunshot(def);
    this.effects.smoke(muzzle, dir);
    this.population.hearShot(origin, def.kind === 'shotgun' ? 0.75 : 1);
    if (this.birds) this.birds.hearShot(origin);
    const s = Save.get();
    s.stats.shots++;
    if (def.action === 'bolt' || def.action === 'lever' || def.action === 'pump') audio.boltCycle(0.25);
  }

  // ------------------------------------------------------------------ boucle
  resize(w, h) { this.world.resize(w, h); }

  update(dt) {
    if (this.harvest) {
      this.harvest.update(dt);
      return;
    }
    if (this.paused) return;
    const input = this.app.input;
    const w = this.world;
    this.time += dt;
    // Heure : 1 minute réelle = 12 minutes de jeu
    w.sky.hour = (w.sky.hour + (dt * 12) / 3600) % 24;
    const save = Save.get();
    const opt = save.options;
    // Joueur
    const s = this.weapons.slot;
    const ctx = {
      ads: this.weapons.ads, fov: this.camera.fov, weaponSway: s ? s.def.sway : 1,
      hasSticks: save.owned.includes('baton'),
      onStep: (surf, k) => audio.step(surf, k),
      onBoundary: () => this.hud.message('Limite du domaine', 'warn'),
    };
    this.player.update(dt, input, ctx);
    // Interactions (affûts, gibier abattu)
    this.handleInteract(input);
    if (input.hit('map') && this.app.ui) this.app.ui.openMap(this);
    if (input.hit('call')) this.useCall();
    // Armes
    this.weapons.update(dt, input, this.player);
    this.ballistics.update(dt);
    // Caméra
    this.player.applyCamera(this.camera);
    const base = opt.fov;
    this.camera.fov = this.weapons.fov(base);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    w.update(dt);
    this.structures.update(dt);
    // Gibier
    this.population.update(dt, this.player, this.camera);
    if (this.birds) this.birds.update(dt, this.player, this.camera);
    this.effects.update(dt);
    // Lumière de la vue subjective = soleil
    this.viewLight.color.copy(w.sky.sun.color);
    this.viewLight.intensity = w.sky.sun.intensity * 0.8;
    this.viewLight.position.copy(w.sky.sun.position).normalize();
    this.viewScene.environment = this.scene.environment;
    this.viewScene.environmentIntensity = 0.7;
    audio.updateListener(this.camera);
    audio.ambience(dt, { wind: this.weather.wind * 0.3, hour: w.sky.hour, rain: this.weather.rain });
    GU.uWind.value.set(this.weather.wind * 0.9, 0, this.weather.wind * 0.5);
    this.updateHUD(dt);
    // Animal blessé : marqueur temporaire
    if (this.wounded) {
      this.woundedT -= dt;
      if (this.wounded.alive && this.wounded.pos.distanceTo(this.player.pos) < 120) this.woundedSeen.copy(this.wounded.pos);
      if (this.woundedT <= 0 || !this.wounded.alive) this.wounded = this.wounded.alive ? null : this.wounded;
    }
    if (input.hit('pause') && this.app.ui) this.app.ui.openPause(this);
  }

  useCall() {
    const save = Save.get();
    const callId = save.loadout.call;
    const gear = GEAR.find((g) => g.id === callId);
    if (!gear || !save.owned.includes(callId)) return;
    this.callT = this.callT || 0;
    if (this.time - this.callT < 6) return;
    this.callT = this.time;
    const p = this.player.pos;
    if (gear.call === 'cerf') {
      audio.roar(audio.out(0.9, 0.6), audio.now);
      for (const a of this.population.animals) {
        if (a.ind.species !== 'cerf' || a.ind.sex !== 'm' || !a.alive) continue;
        const d = a.pos.distanceTo(p);
        if (d < 600 && a.state !== 'flee' && R() < 0.65) {
          a.goal = p.clone().add(new THREE.Vector3((R() - 0.5) * 50, 0, (R() - 0.5) * 50));
          a.setState('walk', 90);
          a.suspicion = Math.min(a.suspicion, 0.2);
          if (R() < 0.7) setTimeout(() => this.onAnimalSound(a, 'roar'), 2500 + R() * 3000);
        }
      }
      this.hud.message('Brame imité… un cerf répondra peut-être', '');
    } else if (gear.call === 'chevreuil') {
      for (const a of this.population.animals) {
        if (a.ind.species !== 'chevreuil' || a.ind.sex !== 'm' || !a.alive) continue;
        if (a.pos.distanceTo(p) < 350 && a.state !== 'flee' && R() < 0.6) {
          a.goal = p.clone().add(new THREE.Vector3((R() - 0.5) * 30, 0, (R() - 0.5) * 30));
          a.setState('walk', 70);
        }
      }
      this.hud.message('« Fiep » de chevrette…', '');
    } else if (gear.call === 'canard' && this.birds) {
      audio.duck('colvert', this.camera.position.clone().add(new THREE.Vector3(0, 0, -2)));
      this.birds.callDucks(p);
    }
  }

  handleInteract(input) {
    const p = this.player;
    let prompt = null, act = null;
    // Gibier à terre
    for (const a of this.downed) {
      if (a.harvested) continue;
      if (a.pos.distanceTo(p.pos) < 3.2) {
        prompt = `Examiner : ${SPECIES[a.ind.species][a.ind.sex === 'm' ? 'male' : 'female']}`;
        act = () => this.openHarvest(a);
      }
    }
    // Miradors / hutte
    if (!act) {
      const st = this.structures.interactAt(p);
      if (st) {
        prompt = st.label;
        act = () => st.run(this);
      }
    }
    this.prompt = prompt;
    if (act && input.hit('interact')) act();
  }

  async openHarvest(animal) {
    const { HarvestView } = await import('../ui/harvest.js');
    const rec = this.computeHarvest(animal);
    animal.harvested = true;
    if (animal.vis) { this.scene.remove(animal.vis.holder); }
    this.app.input.exitLock();
    this.harvest = new HarvestView(this, animal, rec, () => {
      this.harvest.dispose();
      this.harvest = null;
      this.hud.show(true);
      this.app.requestPlayLock();
    });
    this.hud.show(false);
  }

  computeHarvest(animal) {
    const ind = animal.ind;
    const spec = SPECIES[ind.species];
    const first = animal.wounds[0];
    const outcome = animal.lastOutcomeFirst || (first ? this.outcomeOf(animal, first) : 'chair');
    const shots = animal.wounds.length;
    let quality = QUALITY[outcome] ?? 0.4;
    if (shots > 1) quality *= 0.85;
    const ethical = ETHICAL.has(outcome) && shots === 1;
    const trophy = ind.trophy && ind.sex === 'm' || (ind.trophy && ind.species === 'chamois') ? ind.trophy : null;
    const medal = trophy ? trophy.medal : 'aucune';
    const medalK = { aucune: 1, bronze: 1.3, argent: 1.6, or: 2.2, diamant: 3.5, legendaire: 6 }[medal];
    const furK = spec.furs.find((f) => f.id === ind.fur)?.rare ? 2 : 1;
    const energyOk = first ? first.energy >= spec.minEnergy * 0.8 : true;
    let money = Math.round(spec.value * (ind.weight / spec.weight.m[1]) * 1.4 * medalK * furK * (0.5 + 0.5 * quality));
    let xp = Math.round(spec.xp * (0.6 + 0.4 * quality) * (medal === 'aucune' ? 1 : medalK * 0.8));
    const notes = [];
    if (ethical) { notes.push('Tir éthique : mort rapide'); xp = Math.round(xp * 1.25); }
    else if (outcome === 'ventre' || outcome === 'patte') notes.push('Tir à éviter : l\'animal a souffert');
    if (!energyOk) { notes.push(`Calibre trop léger pour ce gibier (${spec.calibers})`); money = Math.round(money * 0.7); }
    if (furK > 1) notes.push('Pelage rare !');
    let fine = 0;
    if (animal.illegal) { fine = 750; money = 0; xp = Math.round(xp * 0.2); notes.push('Tir hors des heures légales : amende de 750 €'); }
    const dist = first ? first.dist : 0;
    return {
      species: ind.species, sex: ind.sex, name: spec[ind.sex === 'm' ? 'male' : 'female'], speciesName: spec.name,
      weight: ind.weight, fur: spec.furs.find((f) => f.id === ind.fur)?.name || ind.fur, furId: ind.fur, rareFur: furK > 1,
      trophy, score: trophy ? trophy.score : 0, medal, medalName: MEDAL_NAMES[medal], summary: trophySummary(trophy), title: trophyTitle(ind.species, ind.sex, trophy),
      outcome, outcomeText: OUTCOME_TEXT[outcome], quality, ethical, shots, dist, money, xp, fine, notes,
      weapon: first ? first.weaponName : '', organs: animal.wounds.flatMap((w) => w.organs.map((o) => o.key)),
      wounds: animal.wounds, legendary: ind.legendary, ind,
    };
  }

  outcomeOf(animal, info) {
    const keys = new Set(info.organs.map((o) => o.key));
    const lungs = (keys.has('poumonG') ? 1 : 0) + (keys.has('poumonD') ? 1 : 0);
    if (keys.has('cerveau') || keys.has('colonne') || keys.has('cervicales')) return 'foudroye';
    if (keys.has('coeur')) return 'coeur';
    if (lungs === 2) return 'poumons';
    if (lungs === 1) return 'poumon';
    if (keys.has('foie')) return 'foie';
    if (keys.has('trachee')) return 'trachee';
    if (keys.has('panse') || keys.has('intestins')) return 'ventre';
    if (info.zone === 'patte') return 'patte';
    return 'chair';
  }

  // Validation du tableau : trophée, argent, expérience, récompenses
  commitHarvest(rec) {
    const s = Save.get();
    s.money += rec.money - rec.fine;
    s.xp += rec.xp;
    s.stats.kills[rec.species] = (s.stats.kills[rec.species] || 0) + 1;
    s.stats.longest = Math.max(s.stats.longest, rec.dist);
    if (rec.ethical) s.stats.ethical++;
    else s.stats.unethical++;
    s.stats.fines += rec.fine;
    const t = {
      id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      species: rec.species, sex: rec.sex, score: rec.score, medal: rec.medal, weight: Math.round(rec.weight * 10) / 10,
      fur: rec.furId, trophy: rec.trophy, date: Date.now(), dist: Math.round(rec.dist), outcome: rec.outcome,
      quality: Math.round(rec.quality * 100), weapon: rec.weapon, legendary: !!rec.legendary, scale: rec.ind.scale,
    };
    Save.addTrophy(t);
    this.bag.push(t);
    const rewards = Save.newRewards();
    return rewards;
  }

  updateHUD(dt) {
    const p = this.player, wsys = this.weapons, s = wsys.slot, sky = this.world.sky;
    const marks = [];
    for (const a of this.downed) {
      if (a.harvested) continue;
      const d = a.pos.distanceTo(p.pos);
      if (d < 600) marks.push({ bearing: bearingTo(p.pos, a.pos), icon: '✚', cls: 'down', dist: d, label: 'Gibier à terre' });
    }
    if (this.wounded && this.woundedSeen) {
      const d = this.woundedSeen.distanceTo(p.pos);
      marks.push({ bearing: bearingTo(p.pos, this.woundedSeen), icon: '◆', cls: 'wound', dist: d, label: 'Animal blessé' });
    }
    const L = PLACES.lodge;
    marks.push({ bearing: bearingTo(p.pos, new THREE.Vector3(L.x, 0, L.z)), icon: '⌂', cls: 'home', dist: Math.hypot(L.x - p.pos.x, L.z - p.pos.z), label: 'Pavillon' });
    // Détection la plus forte
    let det = null;
    for (const a of this.population.animals) {
      if (!a.alive || !a.vis) continue;
      if (a.suspicion > 0.12 && (!det || a.suspicion > det.level)) det = { level: Math.min(1, a.suspicion), bearing: bearingTo(p.pos, a.pos) };
    }
    const opt = Save.get().options;
    let zoomText = '';
    if (s && wsys.ads && s.opt.kind === 'scope') zoomText = '×' + s.zoom.toFixed(1).replace('.', ',');
    const state = wsys.state === 'reload' ? 'Rechargement…' : s && !s.chambered && s.inMag > 0 && wsys.state === 'idle' ? 'Réarmer' : '';
    this.hud.update(dt, {
      yaw: p.yaw, hour: sky.hour, weatherName: this.weather.name,
      weapon: s ? s.def.short : '', ammo: s ? s.inMag + ' / ' + s.def.mag : '', ammoName: s ? s.ammo.name : '', zoomText, state,
      stance: p.stance, noise: p.noise, visibility: p.visibility, breath: p.breath, holding: p.holding, scoped: wsys.scoped,
      ads: wsys.ads, binoc: wsys.binoc, crosshair: opt.crosshair !== false, prompt: this.prompt, marks, detect: det,
      seat: !!p.seat, sticks: p.sticks,
    });
    if (this.app.touch) this.app.touch.setAction(this.prompt ? this.prompt.split(' : ')[0] : null);
    // Lunette & jumelles
    const scoped = wsys.scoped;
    this.hud.drawScope(scoped, s ? s.opt : {}, s ? s.zoom : 1, p.sway.clone().multiplyScalar(12), sky.hour < 8.2 || sky.hour > 18.4);
    if (wsys.binoc) this.hud.drawBinoc(true, this.identify());
    else this.hud.drawBinoc(false);
  }

  // Jumelles : identification de l'animal au centre de la vue
  identify() {
    const cam = this.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null;
    for (const a of this.population.animals) {
      if (!a.vis || a.harvested) continue;
      const c = a.pos.clone().setY(a.pos.y + 0.8 * a.ind.scale);
      const to = c.clone().sub(cam.position);
      const d = to.length();
      const ang = to.normalize().angleTo(dir);
      if (ang < 0.035 && (!best || d < best.d)) best = { a, d };
    }
    const save = Save.get();
    const rangeFinder = GEAR.find((g) => g.id === save.loadout.binoc)?.range;
    const out = { range: null, animal: null };
    // Distance au sol visé (télémètre)
    if (rangeFinder) {
      if (best) out.range = best.d;
      else {
        for (let d = 2; d < 900; d += 2) {
          const p = cam.position.clone().addScaledVector(dir, d);
          if (p.y < this.map.heightAt(p.x, p.z)) { out.range = d; break; }
        }
      }
    }
    if (best) {
      const a = best.a;
      const spec = SPECIES[a.ind.species];
      const sexName = a.ind.sex === 'm' ? spec.male : spec.female;
      let stars = '';
      if (a.ind.trophy && (a.ind.sex === 'm' || a.ind.species === 'chamois')) {
        const n = { aucune: 1, bronze: 2, argent: 3, or: 4, diamant: 5, legendaire: 5 }[a.ind.trophy.medal];
        stars = 'Trophée estimé ' + '★'.repeat(n) + '☆'.repeat(5 - n);
      }
      const fur = spec.furs.find((f) => f.id === a.ind.fur);
      out.animal = {
        name: spec.name, sex: sexName + (a.dead ? ' (abattu)' : ''), dist: rangeFinder ? fmt.dist(best.d) : '', stars,
        fur: fur && fur.rare ? 'Pelage : ' + fur.name : '',
      };
    }
    return out;
  }

  render(r) {
    if (this.harvest) return this.harvest.render(r);
    this.world.render(r);
    r.autoClear = false;
    r.clearDepth();
    if (!this.weapons.scoped && !this.weapons.binoc) {
      this.weapons.view.position.copy(this.camera.position);
      this.weapons.view.quaternion.copy(this.camera.quaternion);
      this.weapons.view.updateMatrixWorld(true);
      r.render(this.viewScene, this.camera);
    }
    r.autoClear = true;
  }

  dispose() {
    this.hud.show(false);
    this.hud.root.remove();
    this.hud.scope.remove();
    this.hud.binoc.remove();
    this.hud.vignette.remove();
    audio.stopAmbience();
    if (this.harvest) { this.harvest.dispose(); this.harvest = null; }
    // Mémoire graphique rendue avant le chargement du pavillon (indispensable sur téléphone)
    const seen = new Set();
    const free = (root) => root && root.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.isSkinnedMesh && o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); o.skeleton.dispose(); }
      if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    });
    const w = this.world;
    free(w.scene);
    free(this.viewScene);
    if (w.sky) w.sky.dispose();
    if (w.water && w.water.probeRT) w.water.probeRT.dispose();
    if (w.veg && w.veg.atlas && w.veg.atlas.rts) w.veg.atlas.rts.forEach((rt) => rt.dispose());
    if (w.terrain && w.terrain.dispose) w.terrain.dispose();
    w.scene.environment = null;
  }
}

function bearingTo(from, to) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z));
  return ((a * 180) / Math.PI + 360) % 360;
}

export { sunDirection };
