// Boucle principale, sessions de chasse, modes de jeu, score et progression.
'use strict';

(() => {
  const { rand, randInt, pick, clamp, fmtTime, chance } = DH.util;

  // ------------------------------------------------------------------ PLATEAU D'ARGILE
  const clayGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.024, 18);
  const clayMat = new THREE.MeshLambertMaterial({ color: '#ff5a14' });
  class Clay {
    constructor(game, pos, vel) {
      this.game = game;
      this.mesh = new THREE.Mesh(clayGeo, clayMat);
      this.mesh.castShadow = true;
      this.mesh.scale.setScalar(1.25);
      game.scene.add(this.mesh);
      this.pos = pos.clone();
      this.vel = vel.clone();
      this.alive = true;
      this.radius = 0.2;
      this.t = 0;
      this.center = new THREE.Vector3();
    }
    hitCenter() { return this.center.copy(this.pos); }
    hit(dmg, vel) {
      if (!this.alive) return;
      this.alive = false;
      this.broken = true;
      this.game.fx.clayBurst(this.pos, this.vel);
      DH.audio.clayBreak(this.pos);
      this.game.scene.remove(this.mesh);
      return true;
    }
    update(dt) {
      if (!this.alive) return;
      this.t += dt;
      this.vel.y -= 9.8 * dt * 0.75; // portance du plateau
      this.vel.multiplyScalar(1 - 0.22 * dt);
      this.pos.addScaledVector(this.vel, dt);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0.15, this.t * 25, 0.1);
      const g = this.game.world.groundAt(this.pos.x, this.pos.z);
      if (this.pos.y < Math.max(g, this.game.world.heightAt(this.pos.x, this.pos.z) < 0 ? 0 : g)) {
        this.alive = false;
        this.missed = true;
        if (this.game.world.heightAt(this.pos.x, this.pos.z) < 0 && !this.game.world.isIce(this.pos.x, this.pos.z)) this.game.fx.splash(this.pos, 0.3);
        this.game.scene.remove(this.mesh);
      }
    }
    dispose() { this.game.scene.remove(this.mesh); }
  }

  // ------------------------------------------------------------------ MODES
  const MODES = {
    classique: {
      ducks: { interval: 5, maxActive: 26 },
      setup(g) { g.timeLeft = 180; },
      update(g, dt) {
        g.timeLeft -= dt;
        if (g.timeLeft <= 0) g.finish('Fin de la chasse !');
      },
      hud: (g) => `⏱ ${fmtTime(g.timeLeft)}`,
    },
    libre: {
      ducks: { interval: 8, maxActive: 22 },
      unlimited: true,
      setup(g) { g.timeLeft = Infinity; },
      update() {},
      hud: (g) => `🌿 ${fmtTime(g.clock)}`,
    },
    chrono: {
      ducks: { interval: 4, maxActive: 30 },
      setup(g) { g.timeLeft = 60; },
      update(g, dt) {
        g.timeLeft -= dt;
        if (g.timeLeft <= 0) g.finish('Temps écoulé !');
      },
      onKill(g, duck, info) {
        if (duck.spec.protected) {
          g.timeLeft -= 10;
          g.ui.floatMsg('-10 s', 'bad');
          return;
        }
        const add = 4 + (info.doubled ? 3 : 0) + (duck.spec.rare ? 5 : 0);
        g.timeLeft += add;
        g.ui.floatMsg(`+${add} s`, 'good');
      },
      hud: (g) => `⏱ ${fmtTime(g.timeLeft)}`,
    },
    reglementee: {
      ducks: { interval: 6.5, maxActive: 24 },
      setup(g) {
        g.timeLeft = 300;
        g.infractions = 0;
        // Quotas : les 3 espèces chassables les plus fréquentes du territoire
        const sp = Object.entries(g.map.species).filter(([k]) => !DH.data.species[k].protected).sort((a, b) => b[1] - a[1]).slice(0, 3);
        g.quota = {};
        sp.forEach(([k], i) => (g.quota[k] = [3, 2, 2][i]));
        g.ui.centerMsg('Quotas : ' + Object.entries(g.quota).map(([k, n]) => `${n} ${DH.data.species[k].name}`).join(' · '), 6);
      },
      update(g, dt) {
        g.timeLeft -= dt;
        if (g.timeLeft <= 0) g.finish('Fin de la journée de chasse');
        else if (Object.entries(g.quota).every(([k, n]) => (g.bag[k] || 0) >= n)) g.finish('Quotas atteints !', 800);
      },
      onKill(g, duck) {
        const k = duck.specId;
        if (duck.spec.protected) {
          g.infract('Espèce protégée abattue !');
        } else if (!(k in g.quota)) {
          g.infract('Espèce hors quota : ' + duck.spec.name);
        } else if (g.bag[k] > g.quota[k]) {
          g.infract('Quota dépassé : ' + duck.spec.name);
        }
      },
      hud: (g) => `⏱ ${fmtTime(g.timeLeft)} · ⚠ ${g.infractions}/3`,
      side: (g) => Object.entries(g.quota).map(([k, n]) => `<div class="${(g.bag[k] || 0) >= n ? 'ok' : ''}">${DH.data.species[k].name} <b>${g.bag[k] || 0}/${n}</b></div>`).join(''),
    },
    survie: {
      ducks: { enabled: false },
      setup(g) {
        g.lives = 3;
        g.wave = 0;
        g.waveState = 'break';
        g.waveTimer = 3;
      },
      update(g, dt) {
        if (g.waveState === 'break') {
          g.waveTimer -= dt;
          if (g.waveTimer <= 0) {
            g.wave++;
            g.waveState = 'run';
            g.waveTotal = 5 + g.wave * 3;
            g.waveSpawned = 0;
            g.waveKilled = 0;
            g.waveEscaped = 0;
            g.waveSpawnT = 0;
            g.ducks.speedMul = 1 + g.wave * 0.05;
            // Munitions de renfort
            for (const gun of g.weapons.guns) if (gun.reserve !== Infinity) gun.reserve += Math.ceil(g.waveTotal * 1.6);
            g.ui.centerMsg(`Vague ${g.wave} — ${g.waveTotal} oiseaux`, 2.5);
            DH.audio.ding();
          }
        } else {
          g.waveSpawnT -= dt;
          if (g.waveSpawned < g.waveTotal && g.waveSpawnT <= 0) {
            g.waveSpawnT = rand(2, 4) / (1 + g.wave * 0.08);
            const f = g.ducks.spawnFlock({ noLand: true, wave: g.wave, count: Math.min(g.waveTotal - g.waveSpawned, randInt(2, 5)) });
            g.waveSpawned += f.members.length;
          }
          if (g.waveSpawned >= g.waveTotal && g.waveKilled + g.waveEscaped >= g.waveTotal) {
            const ratio = g.waveKilled / g.waveTotal;
            if (ratio < 0.6) {
              g.lives--;
              DH.audio.buzz();
              g.ui.centerMsg(`Vague ratée (${Math.round(ratio * 100)} %) — une vie perdue`, 3);
              if (g.lives <= 0) return g.finish(`Épuisé à la vague ${g.wave}`);
            } else {
              const bonus = Math.round(200 * g.wave * ratio);
              g.addScore(bonus);
              g.ui.centerMsg(`Vague ${g.wave} réussie ! +${bonus}`, 3);
            }
            g.waveState = 'break';
            g.waveTimer = 5;
          }
        }
      },
      onKill(g, duck) { if (duck.wave === g.wave) g.waveKilled++; },
      onEscape(g, duck) { if (duck.wave === g.wave) g.waveEscaped++; },
      hud: (g) => `❤ ${'●'.repeat(Math.max(0, g.lives))}${'○'.repeat(3 - Math.max(0, g.lives))} · Vague ${g.wave}`,
      side: (g) => g.waveState === 'run' ? `<div>Abattus <b>${g.waveKilled}</b> / ${g.waveTotal}</div><div>Échappés <b>${g.waveEscaped}</b></div>` : '',
    },
    balltrap: {
      ducks: { enabled: false },
      setup(g) {
        g.player.frozenMove = true;
        g.clays = [];
        g.claysLaunched = 0;
        g.claysHit = 0;
        g.clayTotal = 25;
        g.pullT = 3;
        g.ui.centerMsg('Ball-trap : 25 plateaux — les 10 derniers en doublés', 3.5);
      },
      update(g, dt) {
        for (const c of g.clays) c.update(dt);
        const flying = g.clays.some((c) => c.alive);
        if (!flying) {
          g.pullT -= dt;
          if (g.claysLaunched >= g.clayTotal) {
            if (g.pullT < -1.5) g.finish('Série terminée');
            return;
          }
          if (g.pullT <= 0) {
            g.pullT = rand(2, 3.2);
            const dbl = g.claysLaunched >= 15;
            const n = dbl ? 2 : 1;
            for (let i = 0; i < n; i++) g.launchClay(i);
            g.ui.floatMsg('Pull !', 'neutral');
          }
        }
        g.clays = g.clays.filter((c) => c.alive);
      },
      hud: (g) => `🎯 ${g.claysHit} / ${g.claysLaunched} (${g.clayTotal})`,
    },
  };

  // ------------------------------------------------------------------ JEU
  DH.Game = class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.opts = DH.save.get().options;
      this.initRenderer();
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(this.opts.fov, innerWidth / innerHeight, 0.03, 1600);
      this.scene.add(this.camera);
      this.input = new DH.Input(this.canvas);
      this.ui = DH.ui;
      this.state = 'menu';
      this.clock = 0;
      this.last = performance.now();
      this.menuT = 0;
      window.addEventListener('resize', () => this.resize());
      this.input.onLockChange = (locked) => {
        if (this.state === 'playing' && !locked && !this.input.isTouch) this.pause();
        if (this.state === 'paused' && locked) this.resume();
      };
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && this.state === 'playing' && (this.input.isTouch || !this.input.locked)) this.pause();
        if ((e.code === 'KeyP') && this.state === 'playing') {
          this.input.exitLock();
          this.pause();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') {
          this.input.exitLock();
          this.pause();
        }
      });
      this.buildMenuWorld();
      this.renderer.setAnimationLoop((t) => this.loop(t));
    }

    initRenderer() {
      const q = this.opts.quality;
      if (this.renderer) {
        this.renderer.dispose();
      }
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.25 : 0.85));
      this.renderer.setSize(innerWidth, innerHeight);
      this.renderer.shadowMap.enabled = q !== 'low';
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }

    setQuality(q) {
      if (q === this.opts.quality) return;
      this.opts.quality = q;
      DH.save.write();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.25 : 0.85));
      this.renderer.shadowMap.enabled = q !== 'low';
      if (this.state === 'menu') this.buildMenuWorld();
    }

    resize() {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    }

    hasEquip(id) {
      return DH.save.get().equipment.includes(id);
    }

    // Décor animé derrière les menus
    buildMenuWorld(mapId) {
      this.disposeSession();
      if (this.menuWorld) this.menuWorld.dispose();
      const s = DH.save.get();
      const lvl = DH.save.level();
      const map = DH.data.maps.find((m) => m.id === (mapId || s.last.map) && m.level <= lvl) || DH.data.maps[0];
      const weather = DH.data.weathers.find((w) => w.id === map.weather) || DH.data.weathers[0];
      const time = DH.data.times.find((t) => t.id === 'aube');
      this.menuWorld = new DH.World(this.scene, { map, weather, time, quality: this.opts.quality === 'high' ? 'medium' : 'low' });
      this.menuMap = map;
    }

    // ================================================================ SESSION
    startHunt(cfg) {
      const s = DH.save.get();
      s.last = Object.assign(s.last, cfg);
      DH.save.write();
      DH.audio.init();
      DH.audio.setVolume(this.opts.volume);
      this.input.requestLock();
      this.ui.showLoading(true);
      setTimeout(() => {
        try {
          this.buildSession(cfg);
          this.ui.showLoading(false);
          this.ui.showHud(true);
          this.state = 'playing';
          this.input.enabled = true;
          if (!this.input.isTouch && !this.input.locked) this.pause();
        } catch (e) {
          console.error(e);
          this.ui.showLoading(false);
          this.ui.toast('Erreur de chargement : ' + e.message);
          this.toMenu();
        }
      }, 40);
    }

    buildSession(cfg) {
      if (this.menuWorld) {
        this.menuWorld.dispose();
        this.menuWorld = null;
      }
      this.disposeSession();
      this.cfg = cfg;
      this.map = DH.data.maps.find((m) => m.id === cfg.map);
      this.modeDef = DH.data.modes.find((m) => m.id === cfg.mode);
      this.mode = MODES[cfg.mode];
      const wid = cfg.weather === 'auto' ? this.map.weather : cfg.weather;
      this.weather = DH.data.weathers.find((w) => w.id === wid);
      this.time = DH.data.times.find((t) => t.id === cfg.time);
      const sp = this.map.spawn;
      const clearZones = [];
      if (cfg.mode === 'balltrap') {
        this.traps = [{ x: sp.x - 16, z: sp.z - 20 }, { x: sp.x, z: sp.z - 25 }, { x: sp.x + 16, z: sp.z - 20 }];
        for (const t of this.traps) clearZones.push({ x: t.x, z: t.z, r: 7, flat: true });
        clearZones.push({ x: sp.x, z: sp.z - 45, r: 38 });
      }
      this.world = new DH.World(this.scene, { map: this.map, weather: this.weather, time: this.time, quality: this.opts.quality, clearZones });
      if (cfg.mode === 'balltrap') {
        this.world.blind.visible = false;
        this.world.boxes = [];
        this.world.buildTrapRange(new THREE.Vector3(sp.x, 0, sp.z), this.traps);
      }
      this.fx = new DH.FX(this.scene, this.world);
      this.player = new DH.Player(this);
      this.clock = 0;
      this.score = 0;
      this.bag = {};
      this.kills = [];
      this.shots = 0;
      this.hitShots = 0;
      this.retrieved = 0;
      this.retrieveMoney = 0;
      this.streak = 0;
      this.lastKillT = -10;
      this.callCd = 0;
      this.binoculars = false;
      this.infractions = 0;
      this.longest = 0;
      this.finished = false;
      this.frameQuacks = 0;
      this.protectedKills = 0;
      const md = this.mode.ducks || {};
      this.ducks = new DH.DuckManager(this, {
        interval: md.interval, maxActive: md.maxActive, enabled: md.enabled,
        dog: this.hasEquip('dog') && cfg.mode !== 'balltrap',
      });
      this.weapons = new DH.Weapons(this, { loadout: cfg.loadout, cartridge: cfg.cartridge, choke: this.hasEquip('chokes') ? cfg.choke : 'mod', unlimited: !!this.mode.unlimited });
      if (cfg.mode !== 'balltrap' && cfg.mode !== 'survie') {
        if (this.hasEquip('decoys')) {
          const c = this.world.randomWaterPoint(sp.x, sp.z - 30, 22, 0.4);
          if (c) this.ducks.placeDecoys(c, 8);
        }
        this.ducks.spawnSwimming(randInt(3, 6), new THREE.Vector3(sp.x, 0, sp.z - 40));
        this.ducks.spawnSwimming(randInt(2, 5), new THREE.Vector3(sp.x, 0, sp.z - 40));
        for (let i = 0; i < 3; i++) this.ducks.spawnSwimming(randInt(2, 6));
        this.ducks.spawnFlock();
        this.ducks.spawnFlock();
        this.ducks.spawnT = 3;
      }
      this.mode.setup(this);
      DH.audio.setEcho(this.map.echo);
      DH.audio.startAmbient(this.weather, this.time);
      this.camera.fov = this.opts.fov;
      this.camera.updateProjectionMatrix();
      this.ui.initHud(this);
    }

    disposeSession() {
      if (!this.world) return;
      if (this.clays) this.clays.forEach((c) => c.dispose());
      this.clays = null;
      this.weapons.dispose();
      this.ducks.dispose();
      this.fx.dispose();
      this.world.dispose();
      this.world = null;
      DH.audio.stopAmbient();
    }

    getTargets() {
      if (this.cfg.mode === 'balltrap') return this.clays || [];
      return this.ducks.targets();
    }

    launchClay(i) {
      if (i === 0) this.nextTrap = randInt(0, this.traps.length - 1);
      else this.nextTrap = (this.nextTrap + randInt(1, this.traps.length - 1)) % this.traps.length;
      const t = this.traps[this.nextTrap];
      const sp = this.map.spawn;
      const pos = new THREE.Vector3(t.x, t.y || this.world.heightAt(t.x, t.z) + 1, t.z);
      const away = new THREE.Vector3(t.x - sp.x, 0, t.z - sp.z).normalize();
      const ang = rand(-0.9, 0.9);
      away.applyAxisAngle(DH.UP, ang);
      const el = rand(0.3, 0.55);
      const speed = rand(24, 30);
      const vel = new THREE.Vector3(away.x * Math.cos(el), Math.sin(el), away.z * Math.cos(el)).multiplyScalar(speed);
      this.clays.push(new Clay(this, pos, vel));
      this.claysLaunched++;
      DH.audio.trapLaunch(pos);
    }

    // ================================================================ ÉVÉNEMENTS
    onShot(shot) {
      this.shots++;
      DH.save.get().stats.shots++;
      if (this.cfg.mode !== 'balltrap') this.ducks.alarm(this.player.pos);
      setTimeout(() => {
        if (shot.hitCount > 0) this.hitShots++;
      }, 400);
    }

    onHit(target, dmg, vel, shot, dist) {
      if (target instanceof Clay) {
        if (target.hit(dmg, vel)) {
          this.claysHit++;
          const pts = 100 + (dist > 30 ? 50 : 0);
          this.addScore(pts);
          DH.save.get().stats.clays++;
          this.ui.hitMarker(true);
          this.ui.feed(`Plateau pulvérisé · ${dist.toFixed(0)} m`, pts);
        }
        return;
      }
      const killed = target.hit(dmg, vel, shot);
      this.ui.hitMarker(killed);
      DH.audio.hitMarker();
    }

    onDuckKilled(duck, shot, flying) {
      const spec = duck.spec;
      const dist = shot ? shot.origin.distanceTo(duck.pos) : 0;
      const st = DH.save.get().stats;
      st.kills[duck.specId] = (st.kills[duck.specId] || 0) + 1;
      this.bag[duck.specId] = (this.bag[duck.specId] || 0) + 1;
      const info = { doubled: false };
      if (shot) {
        shot.kills.push(duck);
        info.doubled = shot.kills.length >= 2;
      }
      let pts;
      if (spec.protected) {
        pts = spec.pts;
        this.protectedKills++;
        st.protectedShot++;
        DH.audio.buzz();
        this.ui.feed(`⚠ ${spec.name} — ESPÈCE PROTÉGÉE`, pts, 'bad');
        this.streak = 0;
      } else {
        const distMul = 1 + Math.max(0, dist - 20) / 40;
        const flyMul = flying ? 1 : 0.5;
        if (this.clock - this.lastKillT < 3) this.streak++;
        else this.streak = 1;
        this.lastKillT = this.clock;
        const streakMul = Math.min(3, 1 + (this.streak - 1) * 0.25);
        const dblMul = info.doubled ? 1.5 : 1;
        const rifleMul = shot && shot.rifle && flying ? 1.5 : 1;
        pts = Math.round(spec.pts * distMul * flyMul * streakMul * dblMul * rifleMul);
        let label = `${spec.name} · ${dist.toFixed(0)} m`;
        if (!flying) label += ' · tir posé';
        if (rifleMul > 1) label += ' · tir d\'élite';
        this.ui.feed(label, pts);
        if (info.doubled) this.ui.centerMsg(shot.kills.length >= 3 ? 'TRIPLÉ !' : 'COUP DOUBLE !', 1.4);
        else if (this.streak >= 3) this.ui.floatMsg(`Série ×${this.streak}`, 'good');
        if (dist > this.longest) this.longest = dist;
        if (dist > st.longest) st.longest = Math.round(dist);
        if (spec.rare) this.ui.floatMsg('Espèce rare !', 'gold');
      }
      duck.points = pts;
      this.addScore(pts);
      this.kills.push({ id: duck.specId, dist, pts });
      if (this.mode.onKill) this.mode.onKill(this, duck, info);
    }

    onDuckDown(duck) {
      if (this.ducks.dog) this.ducks.dog.fetch(duck);
    }

    onDuckLanded() {}

    onDuckEscaped(duck) {
      if (this.mode.onEscape) this.mode.onEscape(this, duck);
    }

    onRetrieved(duck, byDog) {
      this.retrieved++;
      const bonus = Math.max(0, Math.round((duck.points || 0) * (byDog ? 0.25 : 0.2)));
      this.retrieveMoney += bonus;
      this.ui.feed(byDog ? `Rapporté par le chien` : 'Gibier ramassé', null, 'info', `+${bonus} €`);
    }

    infract(reason) {
      this.infractions++;
      this.addScore(-200);
      DH.audio.buzz();
      this.ui.centerMsg(`⚠ Infraction ${this.infractions}/3 : ${reason}`, 3);
      if (this.infractions >= 3) this.finish('Permis de chasse retiré !');
    }

    addScore(n) {
      this.score += n;
      this.ui.bumpScore();
    }

    // ================================================================ BOUCLE
    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
      this.last = now;
      if (this.state === 'playing') {
        this.update(dt);
      } else if (this.state === 'menu' && this.menuWorld) {
        this.menuT += dt;
        const w = this.menuWorld;
        const sp = w.map.spawn;
        const a = this.menuT * 0.035;
        this.camera.position.set(sp.x + Math.sin(a) * 30, w.groundAt(sp.x, sp.z) + 6 + Math.sin(this.menuT * 0.2), sp.z - 10 + Math.cos(a) * 30);
        this.camera.lookAt(sp.x - Math.sin(a) * 60, 5, sp.z - 30 - Math.cos(a) * 40);
        if (this.camera.fov !== 60) {
          this.camera.fov = 60;
          this.camera.updateProjectionMatrix();
        }
        w.update(dt, this.camera, this.renderer);
      }
      if (this.state !== 'loading') this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
    }

    update(dt) {
      const input = this.input;
      this.clock += dt;
      this.frameQuacks = 0;
      const w = this.weapons;
      this.player.update(dt, input, { ads: w.ads, fov: this.camera.fov, weaponDef: w.gun.def });
      this.player.applyCamera(this.camera);
      w.update(dt, input, this.player);

      // Zoom
      let fov = this.opts.fov;
      if (this.binoculars) fov = 9;
      else fov = DH.util.lerp(this.opts.fov, w.gun.def.adsFov, w.adsT);
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }

      // Actions
      if ((input.pressed('KeyB') || input.touch.binocPressed) && this.hasEquip('binoc')) {
        this.binoculars = !this.binoculars;
        DH.audio.click(1200, 0.04, 0.2);
      }
      this.callCd -= dt;
      if ((input.pressed('KeyF') || input.touch.callPressed) && this.cfg.mode !== 'balltrap') {
        if (!this.hasEquip('call')) this.ui.floatMsg("Achetez l'appeau à l'armurerie", 'neutral');
        else if (this.callCd <= 0) {
          this.callCd = 7;
          DH.audio.duckCall();
          const n = this.ducks.call(this.player.pos);
          this.ui.floatMsg(n ? `Appeau : ${n} vol${n > 1 ? 's' : ''} intéressé${n > 1 ? 's' : ''}` : 'Appeau : aucun vol à portée', n ? 'good' : 'neutral');
        }
      }
      const near = this.cfg.mode !== 'balltrap' ? this.ducks.nearestDead(this.player.pos, 2.6) : null;
      this.nearDead = near;
      if (near && (input.pressed('KeyE') || input.touch.usePressed)) {
        near.gone = true;
        near.state = 'retrieved';
        this.onRetrieved(near, false);
      }

      this.world.update(dt, this.camera, this.renderer);
      this.ducks.update(dt);
      this.fx.update(dt, this.camera);
      this.mode.update(this, dt);
      DH.audio.updateListener(this.camera);
      DH.audio.updateAmbient(dt);
      this.ui.updateHud(this, dt);
    }

    // ================================================================ PAUSE / FIN
    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.enabled = false;
      this.ui.showPause(true);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.input.enabled = true;
      this.ui.showPause(false);
      this.last = performance.now();
    }

    finish(reason, bonus = 0) {
      if (this.finished) return;
      this.finished = true;
      if (bonus) this.addScore(bonus);
      this.state = 'ended';
      this.input.enabled = false;
      this.input.exitLock();
      const s = DH.save.get();
      const lvlBefore = DH.save.level();
      const xpMul = this.modeDef.xp * this.weather.xp * this.time.xp;
      const xp = Math.max(0, Math.round(this.score * xpMul));
      const money = Math.max(0, Math.round(xp * 0.55)) + this.retrieveMoney + (this.ducks.dog ? Math.round(xp * 0.1) : 0);
      s.xp += xp;
      s.money += money;
      s.stats.hunts++;
      s.stats.hits += this.hitShots;
      s.stats.playTime += Math.round(this.clock);
      const bk = this.cfg.mode + ':' + this.cfg.map;
      const record = !s.stats.best[bk] || this.score > s.stats.best[bk];
      if (record && this.score > 0) s.stats.best[bk] = this.score;
      DH.save.write();
      const lvlAfter = DH.save.level();
      const unlocks = [];
      if (lvlAfter > lvlBefore) {
        const between = (x) => x.level > lvlBefore && x.level <= lvlAfter;
        DH.data.maps.filter(between).forEach((m) => unlocks.push('🗺️ Territoire : ' + m.name));
        DH.data.modes.filter(between).forEach((m) => unlocks.push('🎮 Mode : ' + m.name));
        DH.data.weathers.filter(between).forEach((m) => unlocks.push(m.icon + ' Météo : ' + m.name));
        DH.data.times.filter(between).forEach((m) => unlocks.push(m.icon + ' Moment : ' + m.name));
        DH.data.weapons.filter(between).forEach((m) => unlocks.push('🔫 En vente : ' + m.name));
        DH.data.cartridges.filter(between).forEach((m) => unlocks.push('🧨 En vente : ' + m.name));
        DH.data.equipment.filter(between).forEach((m) => unlocks.push('🎒 En vente : ' + m.name));
      }
      DH.audio.stopAmbient();
      this.ui.showHud(false);
      this.ui.showResults({
        reason, score: this.score, xp, xpMul, money, bag: this.bag, shots: this.shots, hitShots: this.hitShots,
        retrieved: this.retrieved, longest: this.longest, record: record && this.score > 0, lvlBefore, lvlAfter, unlocks,
        mode: this.modeDef, map: this.map, clays: this.cfg.mode === 'balltrap' ? { hit: this.claysHit, total: this.clayTotal } : null,
        protectedKills: this.protectedKills, infractions: this.infractions,
      });
    }

    quit() {
      this.finish('Partie abandonnée');
    }

    toMenu() {
      this.state = 'menu';
      this.input.enabled = false;
      this.input.exitLock();
      this.ui.showHud(false);
      this.ui.showPause(false);
      this.buildMenuWorld();
      this.ui.showMain();
    }
  };
})();
