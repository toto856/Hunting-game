// Sons entièrement synthétisés (Web Audio) : armes, pas, gibier, ambiance, trompe de chasse.
import * as THREE from 'three';

let ctx = null;

function mkNoise(c, seconds, pink = false) {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return buf;
}

// Réponse impulsionnelle : vallée (échos sur les versants) ou pièce boisée
function mkIR(c, kind) {
  const len = kind === 'indoor' ? 1.2 : 3.6;
  const n = Math.floor(c.sampleRate * len);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      const env = kind === 'indoor' ? Math.exp(-t * 5.5) : Math.exp(-t * 1.6) * 0.5;
      d[i] = (Math.random() * 2 - 1) * env * (kind === 'indoor' ? 0.6 : 0.35);
    }
    if (kind !== 'indoor') {
      // Échos discrets renvoyés par le relief
      for (const [delay, g] of [[0.42, 0.55], [0.71, 0.35], [1.15, 0.28], [1.7, 0.18], [2.3, 0.1]]) {
        const s0 = Math.floor((delay + ch * 0.013) * c.sampleRate);
        for (let k = 0; k < 2200 && s0 + k < n; k++) d[s0 + k] += (Math.random() * 2 - 1) * g * Math.exp(-k / 500);
      }
    }
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.extraAnimal = {};
    this.ready = false;
    this.vol = 0.8;
    this.listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1) };
    this.amb = null;
    this.envKind = 'outdoor';
    this.birdT = 3;
    this.loops = {};
  }

  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      this.c = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.vol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.noise = mkNoise(ctx, 2.5);
      this.pink = mkNoise(ctx, 4, true);
      this.verb = ctx.createConvolver();
      this.verb.buffer = mkIR(ctx, 'outdoor');
      this.verbIn = ctx.createConvolver();
      this.verbIn.buffer = mkIR(ctx, 'indoor');
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.55;
      this.verb.connect(this.wet);
      this.verbIn.connect(this.wet);
      this.wet.connect(this.master);
      this.ready = true;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
  }

  setEnv(kind) {
    this.envKind = kind;
  }

  get now() { return ctx ? ctx.currentTime : 0; }

  out(dry = 1, wet = 0.3) {
    const g = ctx.createGain();
    g.gain.value = dry;
    g.connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.envKind === 'indoor' ? this.verbIn : this.verb);
    }
    return g;
  }

  // Source spatialisée (gibier, impacts)
  spatial(pos, dryK = 1, wet = 0.25) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 6;
    p.rolloffFactor = 1.1;
    p.maxDistance = 2000;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    const d = this.listener.pos.distanceTo(pos);
    // Les aigus s'atténuent avec la distance
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(700, 16000 - d * 28);
    lp.connect(p);
    p.connect(this.out(dryK, wet));
    return lp;
  }

  updateListener(cam) {
    if (!ctx) return;
    const L = ctx.listener;
    const p = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.listener.pos.copy(p);
    this.listener.fwd.copy(f);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- briques
  burst(dest, t, { dur = 0.1, f = 1000, q = 1, type = 'bandpass', gain = 1, attack = 0.002, buf, rate = 1 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = buf || this.noise;
    s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return { s, fl, g };
  }

  tone(dest, t, { f0 = 200, f1, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, vib = 0, vibF = 6 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = vibF;
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return { o, g };
  }

  // ---------------------------------------------------------------- armes
  gunshot(def, pos = null) {
    if (!this.ready) return;
    const t = this.now + (pos ? this.listener.pos.distanceTo(pos) / 343 : 0);
    const dest = pos ? this.spatial(pos, 1.6, 0.6) : this.out(1, 0.75);
    const shot = def.kind === 'shotgun';
    const big = def.recoil || 1;
    this.burst(dest, t, { dur: shot ? 0.05 : 0.035, f: shot ? 2200 : 3800, q: 0.7, gain: 1.4, attack: 0.0008 });
    this.burst(dest, t, { dur: shot ? 0.35 : 0.22, f: shot ? 900 : 1400, type: 'lowpass', q: 0.5, gain: 1.6 * big, attack: 0.001 });
    this.tone(dest, t, { f0: shot ? 90 : 120, f1: 35, dur: 0.32, gain: 0.9 * big, attack: 0.002 });
    this.burst(dest, t + 0.01, { dur: 0.9, f: 400, type: 'lowpass', gain: 0.35, attack: 0.02, buf: this.pink });
  }

  impact(kind, pos) {
    if (!this.ready) return;
    const d = this.listener.pos.distanceTo(pos);
    const t = this.now + d / 343;
    const dest = this.spatial(pos, 1.4, 0.3);
    if (kind === 'flesh') {
      // Le « claquement » sourd de la balle qui porte
      this.tone(dest, t, { f0: 140, f1: 60, dur: 0.12, gain: 0.8 });
      this.burst(dest, t, { dur: 0.08, f: 600, type: 'lowpass', gain: 0.7 });
    } else if (kind === 'water') {
      this.burst(dest, t, { dur: 0.35, f: 1800, q: 0.6, gain: 0.6 });
      this.burst(dest, t + 0.05, { dur: 0.4, f: 500, type: 'lowpass', gain: 0.4 });
    } else if (kind === 'wood') {
      this.tone(dest, t, { f0: 420, f1: 300, dur: 0.07, gain: 0.5, type: 'triangle' });
      this.burst(dest, t, { dur: 0.05, f: 2500, gain: 0.5 });
    } else {
      this.burst(dest, t, { dur: 0.12, f: 900, type: 'lowpass', gain: 0.5 });
    }
  }

  click(dest, t, f = 2500, g = 0.4, dur = 0.025) { this.burst(dest, t, { dur, f, q: 3, gain: g, attack: 0.0005 }); }

  dryFire() { if (this.ready) this.click(this.out(0.7, 0.05), this.now, 3200, 0.5); }
  weaponHandle() {
    if (!this.ready) return;
    const d = this.out(0.6, 0.05), t = this.now;
    this.burst(d, t, { dur: 0.15, f: 1500, q: 0.8, gain: 0.25 });
    this.click(d, t + 0.25, 2000, 0.3);
  }
  boltCycle(t0 = 0) {
    if (!this.ready) return;
    const d = this.out(0.8, 0.08), t = this.now + t0;
    this.click(d, t, 2600, 0.5);
    this.burst(d, t + 0.08, { dur: 0.12, f: 1800, q: 1.5, gain: 0.3 });
    this.click(d, t + 0.32, 3000, 0.45);
    this.burst(d, t + 0.36, { dur: 0.1, f: 1500, q: 1.5, gain: 0.25 });
    this.click(d, t + 0.5, 2200, 0.55);
  }
  reloadStart(def) {
    if (!this.ready) return;
    const d = this.out(0.7, 0.05), t = this.now;
    if (def.action === 'break' || def.action === 'double') {
      this.click(d, t, 1800, 0.5);
      this.burst(d, t + 0.05, { dur: 0.25, f: 900, q: 1, gain: 0.3 });
    } else this.click(d, t + 0.1, 2400, 0.4);
  }
  shellIn() { if (this.ready) this.click(this.out(0.7, 0.05), this.now, 1600, 0.45, 0.04); }
  reloadDone(def) {
    if (!this.ready) return;
    const d = this.out(0.7, 0.05), t = this.now;
    this.click(d, t, def.kind === 'shotgun' ? 1400 : 2600, 0.6, 0.04);
  }
  casing(shot) {
    if (!this.ready) return;
    const d = this.out(0.35, 0.05), t = this.now + 0.45;
    if (shot) this.tone(d, t, { f0: 400, dur: 0.05, gain: 0.15, type: 'triangle' });
    else for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.08, { f0: 4200 + Math.random() * 800, dur: 0.04, gain: 0.12 / (i + 1) });
  }
  ui(kind = 'click') {
    if (!this.ready) return;
    const d = this.out(0.4, 0), t = this.now;
    if (kind === 'buy') {
      this.tone(d, t, { f0: 880, dur: 0.12, gain: 0.25, type: 'triangle' });
      this.tone(d, t + 0.09, { f0: 1320, dur: 0.18, gain: 0.22, type: 'triangle' });
    } else if (kind === 'binoc') this.burst(d, t, { dur: 0.1, f: 2000, q: 1, gain: 0.2 });
    else if (kind === 'error') this.tone(d, t, { f0: 180, dur: 0.18, gain: 0.25, type: 'square' });
    else this.click(d, t, 2500, 0.2, 0.02);
  }

  // ---------------------------------------------------------------- pas
  step(surface, k = 0.6) {
    if (!this.ready) return;
    const d = this.out(0.55 * k, 0.06), t = this.now;
    switch (surface) {
      case 'forest':
        for (let i = 0; i < 5; i++) this.burst(d, t + i * 0.012 + Math.random() * 0.02, { dur: 0.04, f: 2500 + Math.random() * 3000, q: 2, gain: 0.25 });
        this.burst(d, t, { dur: 0.12, f: 700, type: 'lowpass', gain: 0.25 });
        break;
      case 'gravel':
      case 'rock':
        for (let i = 0; i < 6; i++) this.burst(d, t + i * 0.01 + Math.random() * 0.03, { dur: 0.025, f: 3000 + Math.random() * 2500, q: 4, gain: 0.25 });
        break;
      case 'marsh':
      case 'water':
        this.burst(d, t, { dur: 0.28, f: 700, q: 0.7, gain: 0.45 });
        this.burst(d, t + 0.06, { dur: 0.2, f: 1600, q: 1.2, gain: 0.2 });
        break;
      case 'wood':
        this.tone(d, t, { f0: 110, f1: 70, dur: 0.09, gain: 0.35, type: 'triangle' });
        this.burst(d, t, { dur: 0.05, f: 900, q: 1, gain: 0.2 });
        break;
      default:
        this.burst(d, t, { dur: 0.16, f: 3500, q: 0.5, gain: 0.18 });
        this.burst(d, t, { dur: 0.08, f: 500, type: 'lowpass', gain: 0.2 });
    }
  }

  // ---------------------------------------------------------------- gibier
  // Cris propres aux espèces ajoutées ailleurs : fn(audio, dest, t, kind)
  registerAnimal(species, fn) { this.extraAnimal[species] = fn; }

  animal(species, kind, pos) {
    if (!this.ready) return;
    const t = this.now + this.listener.pos.distanceTo(pos) / 343;
    const d = this.spatial(pos, 1.2, 0.5);
    if (this.extraAnimal[species]) return this.extraAnimal[species](this, d, t, kind);
    if (kind === 'roar' && species === 'cerf') return this.roar(d, t);
    if (kind === 'alarm' || kind === 'flee') {
      if (species === 'chevreuil') {
        for (let i = 0; i < 3; i++) this.bark(d, t + i * 1.3);
      } else if (species === 'chamois') {
        this.burst(d, t, { dur: 0.7, f: 2800, q: 6, gain: 0.5, attack: 0.05 });
      } else if (species === 'sanglier') {
        for (let i = 0; i < 4; i++) this.grunt(d, t + i * 0.22, 1.3);
      } else if (species === 'cerf' || species === 'daim') {
        this.bark(d, t, 0.6);
      }
      if (kind === 'flee') this.hooves(d, t + 0.1, species === 'sanglier' ? 0.5 : 1);
    }
  }

  roar(d, t) {
    // Brame : souffle rauque, fondamentale basse irrégulière et formants
    const dur = 2.6 + Math.random() * 1.2;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(150 + Math.random() * 40, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(85, t + dur);
    const jit = ctx.createOscillator();
    const jg = ctx.createGain();
    jit.frequency.value = 23;
    jg.gain.value = 18;
    jit.connect(jg).connect(o.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.7, t + 0.35);
    env.gain.setValueAtTime(0.7, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1050; f2.Q.value = 4;
    const g1 = ctx.createGain(); g1.gain.value = 1.2;
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    o.connect(f1).connect(g1).connect(env);
    o.connect(f2).connect(g2).connect(env);
    env.connect(d);
    o.start(t); jit.start(t);
    o.stop(t + dur + 0.1); jit.stop(t + dur + 0.1);
    this.burst(d, t, { dur, f: 600, q: 0.6, gain: 0.25, attack: 0.3 });
    // Grognements de fin
    for (let i = 0; i < 3; i++) this.grunt(d, t + dur + 0.25 + i * 0.32, 0.7);
  }

  bark(d, t, k = 1) {
    this.tone(d, t, { f0: 330, f1: 220, dur: 0.22, type: 'sawtooth', gain: 0.35 * k, attack: 0.01 });
    this.burst(d, t, { dur: 0.22, f: 800, q: 1.5, gain: 0.5 * k, attack: 0.01 });
  }

  grunt(d, t, k = 1) {
    this.tone(d, t, { f0: 110 * k, f1: 80 * k, dur: 0.16, type: 'sawtooth', gain: 0.35, vib: 20, vibF: 30 });
    this.burst(d, t, { dur: 0.15, f: 500, q: 2, gain: 0.25 });
  }

  hooves(d, t, k = 1) {
    for (let i = 0; i < 14; i++) {
      const tt = t + i * 0.16 + (i % 4) * 0.035;
      this.tone(d, tt, { f0: 90, f1: 50, dur: 0.06, gain: 0.3 * k * Math.exp(-i * 0.12), type: 'triangle' });
    }
  }

  duck(species, pos) {
    if (!this.ready) return;
    const t = this.now + this.listener.pos.distanceTo(pos) / 343;
    const d = this.spatial(pos, 1.0, 0.35);
    if (species === 'oie') {
      for (let i = 0; i < 2; i++) this.tone(d, t + i * 0.35, { f0: 420, f1: 360, dur: 0.2, type: 'sawtooth', gain: 0.2, vib: 25, vibF: 40 });
    } else if (species === 'sarcelle') {
      this.tone(d, t, { f0: 2300, f1: 2100, dur: 0.12, type: 'sine', gain: 0.12 });
      this.tone(d, t + 0.18, { f0: 2300, f1: 2100, dur: 0.12, type: 'sine', gain: 0.1 });
    } else if (species === 'siffleur') {
      this.tone(d, t, { f0: 1500, f1: 2200, dur: 0.3, type: 'sine', gain: 0.12 });
    } else {
      // Cancanement décroissant de la cane
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.24;
        this.tone(d, tt, { f0: 520 - i * 25, f1: 380, dur: 0.14, type: 'square', gain: 0.12 / (1 + i * 0.3) });
        this.burst(d, tt, { dur: 0.12, f: 1200, q: 3, gain: 0.12 / (1 + i * 0.3) });
      }
    }
  }

  wings(pos, rate = 5) {
    if (!this.ready) return;
    const t = this.now;
    const d = this.spatial(pos, 0.9, 0.15);
    for (let i = 0; i < 6; i++) this.burst(d, t + i / rate, { dur: 0.08, f: 900, q: 0.8, gain: 0.25 });
  }

  // ---------------------------------------------------------------- ambiance
  startAmbience(kind = 'forest') {
    if (!this.ready) return;
    this.stopAmbience();
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'indoor' ? 220 : 520;
    const wg = ctx.createGain();
    wg.gain.value = kind === 'indoor' ? 0.1 : 0.45;
    src.connect(lp).connect(wg).connect(g);
    src.start();
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    this.amb = { g, src, lp, wg, kind };
  }

  stopAmbience() {
    if (this.amb) {
      const a = this.amb;
      a.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      setTimeout(() => a.src.stop(), 1000);
      this.amb = null;
    }
  }

  // Vent selon la météo + oiseaux/chouettes selon l'heure
  ambience(dt, { wind = 0.3, hour = 10, rain = 0, indoor = false, fire = false } = {}) {
    if (!this.ready || !this.amb) return;
    const a = this.amb;
    const t = ctx.currentTime;
    a.wg.gain.setTargetAtTime(indoor ? 0.06 : 0.12 + wind * 0.5 + rain * 0.5, t, 1.5);
    a.lp.frequency.setTargetAtTime(indoor ? 200 : 380 + wind * 600 + rain * 2500, t, 1.5);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 5;
      const p = this.listener.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 120, 8 + Math.random() * 10, (Math.random() - 0.5) * 120));
      if (indoor) {
        if (fire) this.crackle();
      } else if (hour > 6.5 && hour < 19.5 && rain < 0.5) this.bird(p);
      else if (hour > 20 || hour < 6) { if (Math.random() < 0.3) this.owl(p); }
    }
  }

  bird(p) {
    const d = this.spatial(p, 0.5, 0.2), t = this.now;
    const kind = Math.floor(Math.random() * 4);
    if (kind === 0) {
      // Mésange : « ti-tu ti-tu »
      for (let i = 0; i < 4; i++) {
        this.tone(d, t + i * 0.22, { f0: 5200, f1: 5000, dur: 0.07, gain: 0.05 });
        this.tone(d, t + i * 0.22 + 0.09, { f0: 3800, f1: 3700, dur: 0.08, gain: 0.05 });
      }
    } else if (kind === 1) {
      // Rouge-gorge : trilles descendantes
      for (let i = 0; i < 7; i++) this.tone(d, t + i * 0.09, { f0: 4500 + Math.random() * 1800, f1: 3000 + Math.random() * 800, dur: 0.07, gain: 0.04 });
    } else if (kind === 2) {
      // Corneille lointaine
      for (let i = 0; i < 2; i++) this.tone(d, t + i * 0.45, { f0: 620, f1: 480, dur: 0.25, type: 'sawtooth', gain: 0.05, vib: 30, vibF: 50 });
    } else {
      // Pic : tambourinage
      for (let i = 0; i < 12; i++) this.click(d, t + i * 0.045, 1800, 0.12 * (1 - i / 14), 0.015);
    }
  }

  owl(p) {
    const d = this.spatial(p, 0.6, 0.4), t = this.now;
    this.tone(d, t, { f0: 420, f1: 400, dur: 0.5, gain: 0.08 });
    this.tone(d, t + 1.2, { f0: 430, f1: 380, dur: 0.25, gain: 0.06 });
    this.tone(d, t + 1.6, { f0: 430, f1: 390, dur: 0.9, gain: 0.07, vib: 8, vibF: 9 });
  }

  crackle() {
    const d = this.out(0.3, 0.1), t = this.now;
    for (let i = 0; i < 6; i++) this.burst(d, t + Math.random() * 1.2, { dur: 0.02, f: 2000 + Math.random() * 3000, q: 2, gain: 0.25 * Math.random() });
  }

  // ---------------------------------------------------------------- trompe de chasse
  // Harmoniques naturelles d'une trompe en ré : n × 73,4 Hz
  fanfare(kind = 'honneurs') {
    if (!this.ready) return;
    const d = this.out(0.5, 0.6);
    const H = (n) => 73.42 * n;
    const tunes = {
      honneurs: [[4, 0.3], [6, 0.3], [8, 0.6], [6, 0.2], [8, 0.2], [10, 0.6], [8, 0.3], [6, 0.3], [8, 0.9]],
      diamant: [[6, 0.2], [8, 0.2], [10, 0.2], [12, 0.6], [10, 0.2], [12, 0.2], [10, 0.2], [8, 0.4], [10, 0.4], [12, 1.0]],
      court: [[6, 0.18], [8, 0.18], [10, 0.5]],
    };
    let t = this.now + 0.1;
    for (const [n, dur] of tunes[kind] || tunes.honneurs) {
      this.brass(d, t, H(n), dur * 1.15);
      t += dur;
    }
  }

  brass(d, t, f, dur) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f * 1.002;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * 6, t + 0.06);
    lp.frequency.linearRampToValueAtTime(f * 4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
    g.gain.setValueAtTime(0.16, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const v = ctx.createOscillator();
    const vg = ctx.createGain();
    v.frequency.value = 5.5;
    vg.gain.value = f * 0.004;
    v.connect(vg).connect(o.frequency);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(d);
    for (const x of [o, o2, v]) { x.start(t); x.stop(t + dur + 0.05); }
  }
}

export const audio = new AudioEngine();
