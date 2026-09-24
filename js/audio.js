// Moteur audio entièrement synthétisé (Web Audio) : tirs, cancanements, vent, pluie...
'use strict';

DH.audio = (() => {
  const { rand, randInt } = DH.util;
  let ctx = null, master, sfxBus, ambBus, reverb, reverbSend, echo, echoFb, echoSend;
  let noiseBuf = null, brownBuf = null;
  const amb = {};
  let volume = 0.8;
  let lastFootstep = 0;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.connect(master);

    // Bruits
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }

    // Réverbération (réponse impulsionnelle générée)
    reverb = ctx.createConvolver();
    const irLen = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    reverb.buffer = ir;
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.35;
    reverbSend.connect(reverb).connect(master);

    // Écho (vallée) réglé selon la carte
    echo = ctx.createDelay(2);
    echo.delayTime.value = 0.45;
    echoFb = ctx.createGain();
    echoFb.gain.value = 0.3;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 1400;
    echoSend = ctx.createGain();
    echoSend.gain.value = 0.2;
    echoSend.connect(echo);
    echo.connect(echoLp).connect(echoFb).connect(echo);
    echoLp.connect(master);
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }

  function setEcho(amount) {
    if (!ctx) return;
    echoSend.gain.value = amount;
    echoFb.gain.value = 0.2 + amount * 0.3;
    echo.delayTime.value = 0.3 + amount * 0.5;
  }

  // Écouteur = caméra
  function updateListener(cam) {
    if (!ctx) return;
    const l = ctx.listener;
    const p = cam.getWorldPosition(_v);
    const f = cam.getWorldDirection(_f);
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();

  // Sortie spatialisée
  function out3D(pos, gain = 1, refDist = 6) {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (!pos) {
      g.connect(sfxBus);
      return g;
    }
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.maxDistance = 2000;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p).connect(sfxBus);
    return g;
  }

  function noiseSrc(buf = noiseBuf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  // ----------------------------------------------------------------- TIRS
  function shot(kind = 'shotgun', power = 1, pos = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out3D(pos, pos ? 1.6 : 1, 20);
    // Détonation (bruit filtré)
    const n = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const isRifle = kind === 'rifle';
    lp.frequency.setValueAtTime(isRifle ? 9000 : 6000, t);
    lp.frequency.exponentialRampToValueAtTime(isRifle ? 600 : 250, t + (isRifle ? 0.25 : 0.45));
    const g = ctx.createGain();
    env(g, t, 0.002, 1.3 * power, isRifle ? 0.35 : 0.7);
    n.connect(lp).connect(g);
    g.connect(o);
    if (!pos) {
      g.connect(reverbSend);
      g.connect(echoSend);
    }
    n.start(t, rand(0, 1));
    n.stop(t + 1);
    // Coup sourd
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isRifle ? 180 : 130, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const og = ctx.createGain();
    env(og, t, 0.002, 1.2 * power * (isRifle ? 0.5 : 1), 0.3);
    osc.connect(og).connect(o);
    osc.start(t);
    osc.stop(t + 0.4);
    // Claquement
    const c = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    env(cg, t, 0.001, 0.9 * power, 0.05);
    c.connect(hp).connect(cg).connect(o);
    c.start(t, rand(0, 1));
    c.stop(t + 0.1);
  }

  function click(freq = 2000, dur = 0.03, gain = 0.4, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3;
    const g = ctx.createGain();
    env(g, t, 0.001, gain, dur);
    n.connect(bp).connect(g).connect(sfxBus);
    n.start(t, rand(0, 1));
    n.stop(t + dur + 0.05);
  }

  const pump = () => { click(900, 0.06, 0.5); click(1400, 0.05, 0.5, 0.22); };
  const shellIn = () => { click(2600, 0.03, 0.35); click(1200, 0.04, 0.25, 0.05); };
  const breakOpen = () => { click(1800, 0.05, 0.45); click(700, 0.08, 0.3, 0.05); };
  const breakClose = () => { click(1100, 0.06, 0.6); };
  const dryFire = () => click(3000, 0.02, 0.4);
  const bolt = () => { click(1500, 0.05, 0.4); click(2200, 0.04, 0.4, 0.2); click(1000, 0.05, 0.4, 0.35); };
  const magOut = () => { click(1300, 0.05, 0.4); };
  const uiClick = () => click(3200, 0.02, 0.15);

  // ----------------------------------------------------------------- CANARDS
  function quack(pos, pitch = 1, count = 0) {
    if (!ctx) return;
    count = count || randInt(1, 4);
    const t0 = ctx.currentTime;
    const o = out3D(pos, 1.1, 8);
    for (let i = 0; i < count; i++) {
      const t = t0 + i * rand(0.15, 0.22);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f0 = 520 * pitch * rand(0.95, 1.05);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + 0.14);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 1100 * pitch;
      f1.Q.value = 2.5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 2600 * pitch;
      f2.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.015);
      g.gain.setValueAtTime(0.8, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(o);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  // Cacardement d'oie
  function honk(pos, pitch = 1) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = out3D(pos, 1.2, 12);
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.3;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      const f0 = 330 * pitch;
      osc.frequency.setValueAtTime(f0 * 0.8, t);
      osc.frequency.linearRampToValueAtTime(f0, t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + 0.22);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900 * pitch;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      env(g, t, 0.02, 0.5, 0.22);
      osc.connect(f).connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  function flap(pos, dur = 0.8) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = out3D(pos, 0.8, 5);
    const n = Math.floor(dur * 9);
    for (let i = 0; i < n; i++) {
      const t = t0 + i / 9;
      const s = noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(500, 900);
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      env(g, t, 0.02, 0.5 * (1 - i / n), 0.07);
      s.connect(bp).connect(g).connect(o);
      s.start(t, rand(0, 1.5));
      s.stop(t + 0.12);
    }
  }

  function splash(pos, size = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out3D(pos, 1.2 * size, 6);
    const s = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(3000, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = ctx.createGain();
    env(g, t, 0.005, 0.8, 0.5);
    s.connect(bp).connect(g).connect(o);
    s.start(t, rand(0, 1));
    s.stop(t + 0.6);
  }

  function thud(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out3D(pos, 1, 6);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.7, 0.18);
    osc.connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function clayBreak(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out3D(pos, 1.4, 10);
    for (let i = 0; i < 4; i++) {
      const s = noiseSrc();
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = rand(2500, 6000);
      hp.Q.value = 2;
      const g = ctx.createGain();
      env(g, t + i * 0.012, 0.001, 0.6, 0.12);
      s.connect(hp).connect(g).connect(o);
      s.start(t + i * 0.012, rand(0, 1));
      s.stop(t + 0.3);
    }
  }

  function trapLaunch(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = out3D(pos, 1, 8);
    const s = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    const g = ctx.createGain();
    env(g, t, 0.002, 0.8, 0.12);
    s.connect(bp).connect(g).connect(o);
    s.start(t, rand(0, 1));
    s.stop(t + 0.2);
  }

  // Appeau : série de cancanements décroissants (« hail call »)
  function duckCall() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * 0.2;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f0 = 620 - i * 30;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.15);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 2;
      const g = ctx.createGain();
      env(g, t, 0.01, 0.55 - i * 0.05, 0.16);
      osc.connect(bp).connect(g).connect(sfxBus);
      g.connect(reverbSend);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  function bark(pos) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = out3D(pos, 1.2, 6);
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.25;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 800;
      const g = ctx.createGain();
      env(g, t, 0.005, 0.7, 0.1);
      osc.connect(bp).connect(g).connect(o);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  function thunder(delay = 0, power = 1) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = noiseSrc(brownBuf);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.4 * power, t + 0.08);
    g.gain.setValueAtTime(1.0 * power, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    s.connect(lp).connect(g).connect(sfxBus);
    g.connect(reverbSend);
    s.loop = true;
    s.start(t);
    s.stop(t + 3.6);
  }

  function footstep(surface) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastFootstep < 0.15) return;
    lastFootstep = now;
    const t = now;
    const s = noiseSrc();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (surface === 'water') {
      f.type = 'lowpass'; f.frequency.value = 1800; env(g, t, 0.01, 0.35, 0.25);
    } else if (surface === 'snow') {
      f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.7; env(g, t, 0.02, 0.18, 0.12);
    } else {
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8; env(g, t, 0.005, 0.14, 0.08);
    }
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t, rand(0, 1.5));
    s.stop(t + 0.3);
  }

  function hitMarker() { click(4500, 0.02, 0.2); }
  function ding() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 1320;
    const g = ctx.createGain();
    env(g, t, 0.005, 0.2, 0.4);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.5);
  }
  function buzz() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 140;
    const g = ctx.createGain();
    env(g, t, 0.005, 0.25, 0.5);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.6);
  }

  // ----------------------------------------------------------------- AMBIANCES
  function loopNoise(bus, type, freq, q, gain, buf = noiseBuf) {
    const s = noiseSrc(buf);
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(bus);
    s.start();
    return { s, f, g };
  }

  function startAmbient(weather, time) {
    if (!ctx) return;
    stopAmbient();
    const w = weather.wind;
    amb.wind = loopNoise(ambBus, 'bandpass', 300 + w * 25, 0.6, Math.min(0.9, 0.05 + w * 0.05), brownBuf);
    amb.windHi = loopNoise(ambBus, 'highpass', 3000, 0.5, Math.min(0.2, w * 0.012));
    if (weather.rain) amb.rain = loopNoise(ambBus, 'highpass', 1200, 0.3, 0.12 + weather.rain.count / 60000);
    amb.gustT = 0;
    amb.baseWind = w;
    amb.night = !!time.night;
    amb.birdT = rand(2, 6);
  }

  function stopAmbient() {
    for (const k of ['wind', 'windHi', 'rain']) {
      if (amb[k]) {
        try { amb[k].s.stop(); } catch (e) { /* déjà arrêté */ }
        amb[k] = null;
      }
    }
  }

  // Rafales, oiseaux, grillons
  function updateAmbient(dt) {
    if (!ctx || !amb.wind) return;
    amb.gustT += dt;
    const gust = 0.7 + 0.3 * Math.sin(amb.gustT * 0.4) + 0.2 * Math.sin(amb.gustT * 1.3);
    amb.wind.g.gain.setTargetAtTime(Math.min(1, (0.05 + amb.baseWind * 0.05) * gust), ctx.currentTime, 0.3);
    amb.wind.f.frequency.setTargetAtTime(250 + amb.baseWind * 25 * gust, ctx.currentTime, 0.3);
    amb.birdT -= dt;
    if (amb.birdT <= 0) {
      amb.birdT = rand(3, 9);
      if (amb.night) cricket(); else if (amb.baseWind < 10) chirp();
    }
  }

  function chirp() {
    const t0 = ctx.currentTime;
    const n = randInt(2, 5);
    const base = rand(2500, 4200);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rand(0.08, 0.14);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.6), t + 0.06);
      const g = ctx.createGain();
      env(g, t, 0.005, 0.03, 0.07);
      o.connect(g).connect(ambBus);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  function cricket() {
    const t0 = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator();
      o.frequency.value = 4400;
      const g = ctx.createGain();
      env(g, t, 0.003, 0.02, 0.04);
      o.connect(g).connect(ambBus);
      o.start(t);
      o.stop(t + 0.06);
    }
  }

  return {
    init, setVolume, setEcho, click, updateListener, shot, pump, shellIn, breakOpen, breakClose, dryFire, bolt, magOut,
    uiClick, quack, honk, flap, splash, thud, clayBreak, trapLaunch, duckCall, bark, thunder, footstep,
    hitMarker, ding, buzz, startAmbient, stopAmbient, updateAmbient,
    get ready() { return !!ctx; },
  };
})();
