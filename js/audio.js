// Moteur audio entièrement synthétisé (Web Audio).
'use strict';
HG.audio = (() => {
  const { rand, randInt, clamp } = HG.util;
  let ctx = null, master, sfxBus, ambBus, reverbSend, echoSend, echo, echoFb;
  let noiseBuf, brownBuf;
  let volume = 0.8, lastFoot = 0;
  const amb = {};
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 8;
    master = ctx.createGain(); master.gain.value = volume; master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.connect(master);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    const reverb = ctx.createConvolver();
    const irLen = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.5); }
    reverb.buffer = ir;
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.3; reverbSend.connect(reverb).connect(master);
    echo = ctx.createDelay(2); echo.delayTime.value = 0.5;
    echoFb = ctx.createGain(); echoFb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    echoSend = ctx.createGain(); echoSend.gain.value = 0.25;
    echoSend.connect(echo); echo.connect(lp).connect(echoFb).connect(echo); lp.connect(master);
  }
  function setVolume(v) { volume = v; if (master) master.gain.value = v; }
  function setEcho(a) { if (!ctx) return; echoSend.gain.value = a; echoFb.gain.value = 0.2 + a * 0.35; echo.delayTime.value = 0.3 + a * 0.6; }
  function updateListener(cam) {
    if (!ctx) return;
    const l = ctx.listener, p = cam.getWorldPosition(_v), f = cam.getWorldDirection(_f), t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }
  function out3D(pos, gain = 1, ref = 6, max = 1500) {
    const g = ctx.createGain(); g.gain.value = gain;
    if (!pos) { g.connect(sfxBus); return g; }
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = 1.2;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p).connect(sfxBus); return g;
  }
  const noiseSrc = (buf = noiseBuf) => { const s = ctx.createBufferSource(); s.buffer = buf; return s; };
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(type, f0, f1, t, a, peak, dec, out, filt) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + dec);
    const g = ctx.createGain(); env(g, t, a, peak, dec);
    if (filt) { const f = ctx.createBiquadFilter(); f.type = filt.type || 'bandpass'; f.frequency.value = filt.f; f.Q.value = filt.q || 1; o.connect(f).connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + a + dec + 0.05); return g;
  }

  // ---------------------------------------------------------------- TIRS
  function shot(kind = 'shotgun', power = 1, pos = null, suppressed = false) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out3D(pos, pos ? 1.8 : 1, 25, 3000);
    if (kind === 'bow') {
      const n = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.5;
      const g = ctx.createGain(); env(g, t, 0.005, 0.5, 0.12); n.connect(bp).connect(g).connect(o); n.start(t, rand(0, 1)); n.stop(t + 0.2);
      tone('sine', 90, 60, t, 0.005, 0.4, 0.15, o); return;
    }
    const rifle = kind === 'rifle';
    const n = noiseSrc(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hi = suppressed ? 3000 : rifle ? 9500 : 6500;
    lp.frequency.setValueAtTime(hi, t); lp.frequency.exponentialRampToValueAtTime(rifle ? 500 : 220, t + (rifle ? 0.3 : 0.5));
    const g = ctx.createGain(); env(g, t, 0.002, (suppressed ? 0.45 : 1.4) * power, rifle ? 0.4 : 0.75);
    n.connect(lp).connect(g); g.connect(o);
    if (!pos) { g.connect(reverbSend); if (!suppressed) g.connect(echoSend); }
    n.start(t, rand(0, 1)); n.stop(t + 1);
    tone('sine', rifle ? 200 : 130, 35, t, 0.002, (suppressed ? 0.5 : 1.3) * power * (rifle ? 0.6 : 1), 0.32, o);
    if (!suppressed) { const c = noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const cg = ctx.createGain(); env(cg, t, 0.001, 1 * power, 0.05); c.connect(hp).connect(cg).connect(o); c.start(t, rand(0, 1)); c.stop(t + 0.1); }
  }
  function click(freq = 2000, dur = 0.03, gain = 0.4, delay = 0) {
    if (!ctx) return; const t = ctx.currentTime + delay;
    const n = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const g = ctx.createGain(); env(g, t, 0.001, gain, dur); n.connect(bp).connect(g).connect(sfxBus); n.start(t, rand(0, 1)); n.stop(t + dur + 0.05);
  }
  const pump = () => { click(900, 0.06, 0.5); click(1400, 0.05, 0.5, 0.22); };
  const shellIn = () => { click(2600, 0.03, 0.35); click(1200, 0.04, 0.25, 0.05); };
  const breakOpen = () => { click(1800, 0.05, 0.45); click(700, 0.08, 0.3, 0.05); };
  const breakClose = () => click(1100, 0.06, 0.6);
  const dryFire = () => click(3000, 0.02, 0.4);
  const bolt = () => { click(1500, 0.05, 0.4); click(2200, 0.04, 0.4, 0.2); click(1000, 0.05, 0.4, 0.35); };
  const lever = () => { click(1200, 0.06, 0.45); click(1600, 0.05, 0.4, 0.18); };
  const magIn = () => { click(1300, 0.05, 0.4); click(900, 0.06, 0.5, 0.25); };
  const uiClick = () => click(3200, 0.02, 0.15);
  const uiBuy = () => { if (!ctx) return; const t = ctx.currentTime; tone('sine', 880, 880, t, 0.01, 0.2, 0.1, sfxBus); tone('sine', 1320, 1320, t + 0.1, 0.01, 0.2, 0.2, sfxBus); };
  const uiError = () => { if (!ctx) return; tone('square', 220, 160, ctx.currentTime, 0.01, 0.15, 0.25, sfxBus); };
  const bowDraw = () => { if (!ctx) return; const t = ctx.currentTime; const n = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.linearRampToValueAtTime(900, t + 0.7); bp.Q.value = 6; const g = ctx.createGain(); env(g, t, 0.1, 0.25, 0.7); n.connect(bp).connect(g).connect(sfxBus); n.start(t, rand(0, 1)); n.stop(t + 0.9); };

  // ---------------------------------------------------------------- IMPACTS
  function thud(pos, size = 1) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1, 8); tone('sine', 140 * (size > 1 ? 0.7 : 1), 45, t, 0.003, 0.8, 0.2 * size, o); const n = noiseSrc(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; const g = ctx.createGain(); env(g, t, 0.003, 0.5, 0.12); n.connect(lp).connect(g).connect(o); n.start(t, rand(0, 1)); n.stop(t + 0.3); }
  function hitFlesh(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.1, 10, 600); const n = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7; const g = ctx.createGain(); env(g, t, 0.002, 0.9, 0.09); n.connect(bp).connect(g).connect(o); n.start(t, rand(0, 1)); n.stop(t + 0.15); tone('sine', 110, 60, t, 0.002, 0.5, 0.1, o); }
  function gong(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.3, 15, 1500); [520, 1310, 2040].forEach((f, i) => tone('sine', f, f * 0.98, t, 0.003, 0.5 / (i + 1), 1.4 - i * 0.3, o)); click(3000, 0.02, 0.4); }
  function dirt(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 0.8, 8, 500); const n = noiseSrc(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; const g = ctx.createGain(); env(g, t, 0.003, 0.6, 0.15); n.connect(lp).connect(g).connect(o); n.start(t, rand(0, 1)); n.stop(t + 0.25); }
  function paper(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 0.7, 10, 600); const n = noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const g = ctx.createGain(); env(g, t, 0.001, 0.5, 0.05); n.connect(hp).connect(g).connect(o); n.start(t, rand(0, 1)); n.stop(t + 0.1); }
  function clayBreak(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.4, 12); for (let i = 0; i < 4; i++) { const s = noiseSrc(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(2500, 6000); f.Q.value = 2; const g = ctx.createGain(); env(g, t + i * 0.012, 0.001, 0.6, 0.12); s.connect(f).connect(g).connect(o); s.start(t + i * 0.012, rand(0, 1)); s.stop(t + 0.3); } }
  function trapLaunch(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1, 8); const s = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; const g = ctx.createGain(); env(g, t, 0.002, 0.8, 0.12); s.connect(bp).connect(g).connect(o); s.start(t, rand(0, 1)); s.stop(t + 0.2); }
  function splash(pos, size = 1) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.2 * size, 6); const s = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(3000, t); bp.frequency.exponentialRampToValueAtTime(400, t + 0.5); const g = ctx.createGain(); env(g, t, 0.005, 0.8, 0.5); s.connect(bp).connect(g).connect(o); s.start(t, rand(0, 1)); s.stop(t + 0.6); }
  function whoosh() { if (!ctx) return; const t = ctx.currentTime; const n = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(3000, t); bp.frequency.exponentialRampToValueAtTime(600, t + 0.3); bp.Q.value = 2; const g = ctx.createGain(); env(g, t, 0.01, 0.4, 0.3); n.connect(bp).connect(g).connect(sfxBus); n.start(t, rand(0, 1)); n.stop(t + 0.4); }

  // ---------------------------------------------------------------- ANIMAUX
  function quack(pos, pitch = 1, count = 0) {
    if (!ctx) return; count = count || randInt(1, 4); const t0 = ctx.currentTime, o = out3D(pos, 1.1, 8);
    for (let i = 0; i < count; i++) { const t = t0 + i * rand(0.15, 0.22); const f0 = 520 * pitch * rand(0.95, 1.05); tone('sawtooth', f0, f0 * 0.72, t, 0.015, 0.8, 0.15, o, { f: 1100 * pitch, q: 2.5 }); }
  }
  function honk(pos, pitch = 1) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.2, 12); const n = randInt(1, 3); for (let i = 0; i < n; i++) tone('square', 300 * pitch, 260 * pitch, t0 + i * 0.3, 0.03, 0.45, 0.22, o, { f: 900 * pitch, q: 1.5 }); }
  function flap(pos, dur = 0.8) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 0.8, 5); const n = Math.floor(dur * 9); for (let i = 0; i < n; i++) { const t = t0 + i / 9; const s = noiseSrc(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(500, 900); bp.Q.value = 0.8; const g = ctx.createGain(); env(g, t, 0.02, 0.5 * (1 - i / n), 0.07); s.connect(bp).connect(g).connect(o); s.start(t, rand(0, 1.5)); s.stop(t + 0.12); } }
  function brame(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.6, 30, 2500); const o1 = tone('sawtooth', 110, 80, t, 0.3, 0.6, 1.6, o, { f: 350, q: 1.2 }); tone('sawtooth', 165, 120, t + 0.05, 0.3, 0.3, 1.5, o, { f: 700, q: 1.5 }); o.connect(reverbSend); }
  function grunt(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1, 8); const n = randInt(1, 3); for (let i = 0; i < n; i++) { const t = t0 + i * 0.25; const s = noiseSrc(brownBuf); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(150, 260); bp.Q.value = 3; const g = ctx.createGain(); env(g, t, 0.03, 1.2, 0.15); s.connect(bp).connect(g).connect(o); s.start(t, rand(0, 1)); s.stop(t + 0.25); } }
  function roeBark(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.3, 15, 1200); for (let i = 0; i < randInt(1, 3); i++) tone('sawtooth', 380, 240, t0 + i * 0.5, 0.01, 0.6, 0.14, o, { f: 900, q: 2 }); }
  function pheasant(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.2, 12); for (let i = 0; i < 2; i++) tone('square', 1500, 1100, t0 + i * 0.22, 0.01, 0.4, 0.12, o, { f: 2200, q: 3 }); }
  function crow(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1, 12); for (let i = 0; i < randInt(1, 3); i++) tone('sawtooth', 900, 620, t0 + i * 0.3, 0.02, 0.45, 0.16, o, { f: 1400, q: 1.5 }); }
  function foxBark(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1, 12); for (let i = 0; i < 2; i++) tone('sawtooth', 1100, 700, t0 + i * 0.4, 0.01, 0.5, 0.12, o, { f: 1600, q: 2 }); }
  function marmotWhistle(pos) { if (!ctx) return; tone('sine', 3200, 2900, ctx.currentTime, 0.01, 0.5, 0.25, out3D(pos, 1.2, 20, 1200)); }
  function moose(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.6, 30, 2500); tone('sawtooth', 90, 70, t, 0.4, 0.7, 1.4, o, { f: 250, q: 1 }); }
  function bear(pos) { if (!ctx) return; const t = ctx.currentTime, o = out3D(pos, 1.5, 15); const s = noiseSrc(brownBuf); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 120; bp.Q.value = 2; const g = ctx.createGain(); env(g, t, 0.1, 1.5, 0.8); s.connect(bp).connect(g).connect(o); s.start(t, rand(0, 1)); s.stop(t + 1); }
  function bark(pos, pitch = 1) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.2, 8); for (let i = 0; i < 2; i++) tone('sawtooth', 420 * pitch, 220 * pitch, t0 + i * 0.25, 0.005, 0.7, 0.1, o, { f: 800 * pitch, q: 1 }); }
  function houndBay(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.3, 25, 2000); for (let i = 0; i < 3; i++) tone('sawtooth', 500, 320, t0 + i * 0.45, 0.05, 0.5, 0.35, o, { f: 900, q: 1.2 }); }
  function whine(pos) { if (!ctx) return; tone('sine', 1300, 1700, ctx.currentTime, 0.1, 0.25, 0.4, out3D(pos, 0.8, 5)); }

  // ---------------------------------------------------------------- APPEAUX & CORNE
  function duckCall() { if (!ctx) return; const t0 = ctx.currentTime; for (let i = 0; i < 6; i++) { const f0 = 620 - i * 30; const g = tone('sawtooth', f0, f0 * 0.7, t0 + i * 0.2, 0.01, 0.55 - i * 0.05, 0.16, sfxBus, { f: 1300, q: 2 }); g.connect(reverbSend); } }
  function gooseCall() { if (!ctx) return; const t0 = ctx.currentTime; for (let i = 0; i < 3; i++) tone('square', 280, 240, t0 + i * 0.35, 0.03, 0.4, 0.25, sfxBus, { f: 800, q: 1.5 }); }
  function deerCall() { if (!ctx) return; const t = ctx.currentTime; const g = tone('sawtooth', 120, 85, t, 0.3, 0.5, 1.4, sfxBus, { f: 380, q: 1.2 }); g.connect(reverbSend); }
  function roeCall() { if (!ctx) return; const t0 = ctx.currentTime; for (let i = 0; i < 3; i++) tone('sine', 1800, 1500, t0 + i * 0.4, 0.02, 0.3, 0.12, sfxBus); }
  function hareCall() { if (!ctx) return; const t0 = ctx.currentTime; for (let i = 0; i < 4; i++) tone('sawtooth', 2200, 1600, t0 + i * 0.3, 0.02, 0.35, 0.2, sfxBus, { f: 2500, q: 2 }); }
  function horn(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 1.6, 40, 3000); const notes = [392, 392, 523, 392, 659]; notes.forEach((f, i) => { const g = tone('sawtooth', f, f, t0 + i * 0.35, 0.05, 0.4, 0.4, o, { type: 'lowpass', f: 1800 }); }); o.connect(reverbSend); }
  function whistle() { if (!ctx) return; const t = ctx.currentTime; tone('sine', 2400, 3200, t, 0.05, 0.4, 0.3, sfxBus); }
  function heartbeat(rate) { if (!ctx) return; const t = ctx.currentTime; tone('sine', 60, 40, t, 0.01, 0.35 * rate, 0.12, sfxBus); tone('sine', 55, 38, t + 0.16, 0.01, 0.25 * rate, 0.1, sfxBus); }
  function breathOut() { if (!ctx) return; const t = ctx.currentTime; const n = noiseSrc(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g = ctx.createGain(); env(g, t, 0.15, 0.2, 0.6); n.connect(lp).connect(g).connect(sfxBus); n.start(t, rand(0, 1)); n.stop(t + 0.8); }
  function cash() { if (!ctx) return; const t = ctx.currentTime; [1047, 1319, 1568].forEach((f, i) => tone('sine', f, f, t + i * 0.08, 0.005, 0.2, 0.25, sfxBus)); }
  function fanfare() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.12, 0.01, 0.3, 0.5, sfxBus)); }
  function fail() { if (!ctx) return; const t = ctx.currentTime; [400, 300, 200].forEach((f, i) => tone('sawtooth', f, f * 0.9, t + i * 0.2, 0.01, 0.25, 0.3, sfxBus, { type: 'lowpass', f: 1200 })); }

  // ---------------------------------------------------------------- PAS
  function footstep(surface, loud = 1) {
    if (!ctx) return; const now = ctx.currentTime; if (now - lastFoot < 0.12) return; lastFoot = now; const t = now;
    const s = noiseSrc(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    if (surface === 'water') { f.type = 'lowpass'; f.frequency.value = 2500; env(g, t, 0.01, 0.5 * loud, 0.25); }
    else if (surface === 'snow') { f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6; env(g, t, 0.01, 0.35 * loud, 0.12); }
    else if (surface === 'leaves') { f.type = 'highpass'; f.frequency.value = 1500; env(g, t, 0.005, 0.45 * loud, 0.14); }
    else if (surface === 'rock') { f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5; env(g, t, 0.003, 0.4 * loud, 0.07); }
    else if (surface === 'wood') { f.type = 'lowpass'; f.frequency.value = 500; env(g, t, 0.003, 0.5 * loud, 0.1); }
    else { f.type = 'lowpass'; f.frequency.value = 800; env(g, t, 0.005, 0.3 * loud, 0.09); }
    s.connect(f).connect(g).connect(sfxBus); s.start(t, rand(0, 1)); s.stop(t + 0.35);
  }

  // ---------------------------------------------------------------- AMBIANCES
  function ambStart(name, build) { if (!ctx || amb[name]) return; amb[name] = build(); }
  function ambStop(name) { const a = amb[name]; if (!a) return; const t = ctx.currentTime; a.gain.gain.setTargetAtTime(0, t, 0.8); setTimeout(() => { try { a.nodes.forEach((n) => n.stop && n.stop()); } catch (e) {} }, 3000); delete amb[name]; }
  function ambSet(name, v) { const a = amb[name]; if (a) a.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.5); }
  function windAmb() { const s = noiseSrc(brownBuf); s.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg).connect(lp.frequency); const g = ctx.createGain(); g.gain.value = 0; s.connect(lp).connect(g).connect(ambBus); s.start(); lfo.start(); return { gain: g, nodes: [s, lfo] }; }
  function rainAmb() { const s = noiseSrc(); s.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; const g = ctx.createGain(); g.gain.value = 0; s.connect(hp).connect(g).connect(ambBus); s.start(); return { gain: g, nodes: [s] }; }
  function waterAmb() { const s = noiseSrc(); s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.5; const g = ctx.createGain(); g.gain.value = 0; s.connect(bp).connect(g).connect(ambBus); s.start(); return { gain: g, nodes: [s] }; }
  function cricketsAmb() { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 4200; const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 14; const lg = ctx.createGain(); lg.gain.value = 1; const mg = ctx.createGain(); mg.gain.value = 0; lfo.connect(lg).connect(mg.gain); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 8; const g = ctx.createGain(); g.gain.value = 0; o.connect(mg).connect(bp).connect(g).connect(ambBus); o.start(); lfo.start(); return { gain: g, nodes: [o, lfo] }; }
  function birdChirp(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 0.35, 15, 400); const n = randInt(2, 5); const base = rand(2200, 4200); for (let i = 0; i < n; i++) tone('sine', base * rand(0.9, 1.1), base * rand(1.05, 1.4), t0 + i * rand(0.08, 0.16), 0.01, 0.35, 0.07, o); }
  function owl(pos) { if (!ctx) return; const t0 = ctx.currentTime, o = out3D(pos, 0.6, 20, 800); tone('sine', 420, 380, t0, 0.05, 0.4, 0.3, o); tone('sine', 400, 360, t0 + 0.45, 0.05, 0.4, 0.5, o); }
  function thunder(delay = 0, power = 1) { if (!ctx) return; const t = ctx.currentTime + delay; const s = noiseSrc(brownBuf); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1.4 * power, t + 0.08); g.gain.setValueAtTime(1 * power, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); s.connect(lp).connect(g).connect(sfxBus); g.connect(reverbSend); s.loop = true; s.start(t); s.stop(t + 3.6); }

  function setAmbience(w) {
    if (!ctx) return;
    ambStart('wind', windAmb); ambStart('rain', rainAmb); ambStart('water', waterAmb); ambStart('crickets', cricketsAmb);
    ambSet('wind', clamp(0.15 + w.wind * 0.06, 0, 1.1));
    ambSet('rain', w.rain * 0.4);
    ambSet('water', w.water ? 0.12 : 0);
    ambSet('crickets', w.night ? 0.05 : 0);
  }
  function stopAll() { Object.keys(amb).forEach(ambStop); }

  return { init, setVolume, setEcho, updateListener, shot, pump, shellIn, breakOpen, breakClose, dryFire, bolt, lever, magIn, uiClick, uiBuy, uiError, bowDraw, thud, hitFlesh, gong, dirt, paper, clayBreak, trapLaunch, splash, whoosh, quack, honk, flap, brame, grunt, roeBark, pheasant, crow, foxBark, marmotWhistle, moose, bear, bark, houndBay, whine, duckCall, gooseCall, deerCall, roeCall, hareCall, horn, whistle, heartbeat, breathOut, cash, fanfare, fail, footstep, setAmbience, stopAll, birdChirp, owl, thunder, get ctx() { return ctx; } };
})();
