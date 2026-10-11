// Animation procédurale des quadrupèdes : allures (pas, trot, galop) mélangées,
// broutage, alerte, regard, oreilles, queue, couchage, chute et mort.
import { clamp, damp, smoothstep, lerp } from '../core/math.js';

const TAU = Math.PI * 2;
const GAITS = {
  walk: { off: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 }, duty: 0.64, A: 0.3, Ar: 0.26, fold: 0.85, bob: 0.012, pitch: 0.0 },
  trot: { off: { LH: 0, RF: 0, RH: 0.5, LF: 0.5 }, duty: 0.44, A: 0.42, Ar: 0.38, fold: 1.15, bob: 0.025, pitch: 0.015 },
  run: { off: { LH: 0, RH: 0.07, LF: 0.46, RF: 0.54 }, duty: 0.3, A: 0.78, Ar: 0.66, fold: 1.5, bob: 0.06, pitch: 0.09 },
};

function legCurve(phi, duty, A) {
  // Renvoie [angle avant/arrière, flexion]
  if (phi < duty) {
    const u = phi / duty;
    return [A * (1 - 2 * u), 0.08 * Math.sin(Math.PI * u), u];
  }
  const u = (phi - duty) / (1 - duty);
  const s = u * u * (3 - 2 * u);
  return [-A + 2 * A * s, Math.sin(Math.PI * Math.min(1, u * 1.1)), -1];
}

export class Animator {
  constructor(rig, spec, scale) {
    this.b = rig.byName;
    this.spec = spec;
    this.scale = scale;
    this.phase = Math.random();
    this.t = Math.random() * 100;
    this.w = { walk: 1, trot: 0, run: 0 };
    this.graze = 0; this.alert = 0; this.bed = 0; this.dead = 0; this.roar = 0;
    this.lookYaw = 0; this.lookPitch = 0;
    this.turn = 0;
    this.speed = 0;
    this.deadSide = Math.random() < 0.5 ? 1 : -1;
    this.ear = [{ x: 0, z: 0, t: 0 }, { x: 0, z: 0, t: 0 }];
    this.tail = 0; this.tailT = 0;
    this.kick = 0; // ruade (tir au cœur)
    this.limp = 0;
    this.stomp = 0;
    this.base = {};
    for (const k in this.b) this.base[k] = this.b[k].position.clone();
  }

  update(dt, st) {
    this.t += dt;
    const sp = this.spec;
    const s = this.scale;
    const speed = st.speed;
    this.speed = speed;
    // Poids des allures selon la vitesse (relative à la taille)
    const vw = sp.speeds.walk * s, vt = sp.speeds.trot * s;
    const target = { walk: 0, trot: 0, run: 0 };
    if (speed < vw * 1.25) target.walk = 1;
    else if (speed < vt * 1.25) {
      const k = smoothstep(vw * 1.15, vw * 1.6, speed);
      target.walk = 1 - k; target.trot = k;
    } else {
      const k = smoothstep(vt * 1.1, vt * 1.6, speed);
      target.trot = 1 - k; target.run = k;
    }
    for (const g in this.w) this.w[g] = damp(this.w[g], target[g], 6, dt);
    const stride = (this.w.walk * sp.stride.walk + this.w.trot * sp.stride.trot + this.w.run * sp.stride.run) * s;
    const moving = smoothstep(0.05, 0.35, speed);
    this.phase = (this.phase + (speed / Math.max(stride, 0.1)) * dt + (1 - moving) * 0) % 1;

    this.graze = damp(this.graze, st.graze ? 1 : 0, 2.2, dt);
    this.alert = damp(this.alert, st.alert ? 1 : 0, 5, dt);
    this.bed = damp(this.bed, st.bed ? 1 : 0, 1.2, dt);
    this.dead = damp(this.dead, st.dead ? 1 : 0, st.dropFast ? 9 : 2.2, dt);
    this.roar = damp(this.roar, st.roar ? 1 : 0, 3, dt);
    this.turn = damp(this.turn, clamp(st.turn || 0, -1.5, 1.5), 4, dt);
    this.lookYaw = damp(this.lookYaw, clamp(st.lookYaw || 0, -1.3, 1.3), 4, dt);
    this.lookPitch = damp(this.lookPitch, clamp(st.lookPitch || 0, -0.5, 0.5), 4, dt);
    this.limp = damp(this.limp, st.limp || 0, 3, dt);
    if (st.kick) this.kick = 1;
    this.kick = Math.max(0, this.kick - dt * 2.2);
    if (st.stomp && this.stomp <= 0) this.stomp = 1;
    this.stomp = Math.max(0, this.stomp - dt * 2.5);

    const B = this.b;
    const R = {};
    const add = (name, x = 0, y = 0, z = 0) => {
      const r = R[name] || (R[name] = [0, 0, 0]);
      r[0] += x; r[1] += y; r[2] += z;
    };
    // --- Pattes : somme pondérée des allures
    let bob = 0, pitch = 0, flexSpine = 0;
    for (const g of ['walk', 'trot', 'run']) {
      const wg = this.w[g] * moving;
      if (wg < 0.001) continue;
      const G = GAITS[g];
      for (const leg of ['LF', 'RF', 'LH', 'RH']) {
        const front = leg[1] === 'F';
        const side = leg[0];
        let phi = (this.phase + G.off[leg]) % 1;
        const [a, flex] = legCurve(phi, G.duty, front ? G.A : G.Ar);
        const fold = G.fold * flex;
        const limpK = this.limp > 0 && leg === 'LF' ? 1 - this.limp * 0.7 : 1;
        if (front) {
          add('fUpper' + side, -a * wg * limpK);
          add('fLower' + side, (0.12 * a + 0.25 * fold) * wg);
          add('fKnee' + side, 1.25 * fold * wg * limpK);
          add('fFet' + side, (0.5 * fold - (phi < G.duty ? 0.18 * Math.sin(Math.PI * phi / G.duty) : 0)) * wg);
        } else {
          add('rUpper' + side, -a * wg);
          add('rStifle' + side, -0.45 * fold * wg);
          add('rHock' + side, 0.85 * fold * wg);
          add('rFet' + side, (0.55 * fold - (phi < G.duty ? 0.15 * Math.sin(Math.PI * phi / G.duty) : 0)) * wg);
        }
      }
      const cyc = g === 'run' ? 1 : 2;
      bob += -G.bob * (0.5 - 0.5 * Math.cos(TAU * cyc * this.phase)) * wg;
      pitch += G.pitch * Math.sin(TAU * this.phase) * wg;
      if (g === 'run') flexSpine += 0.07 * Math.sin(TAU * this.phase) * wg;
      // Hochement de tête au pas
      add('neck1', 0.035 * Math.sin(TAU * 2 * this.phase + 0.6) * wg * (g === 'run' ? 2 : 1));
    }
    // --- Corps
    add('pelvis', pitch * 0.5 + flexSpine * 0.6);
    add('spine1', -flexSpine * 0.5);
    add('spine2', -flexSpine * 0.4, this.turn * 0.1);
    add('spine3', flexSpine * 0.3, this.turn * 0.12);
    add('root', pitch * 0.3);

    // --- Broutage / alerte / regard
    const g = this.graze * (1 - this.dead) * (1 - this.alert * 0.9);
    add('neck1', g * 1.0 - this.alert * 0.28 - this.roar * 0.35, this.turn * 0.18);
    add('neck2', g * 0.38 - this.alert * 0.1 - this.roar * 0.25);
    add('head', g * 0.42 - this.alert * 0.12 - this.roar * 0.55 + this.lookPitch * 0.5, g * 0.22 * Math.sin(this.t * 0.6));
    add('neck2', 0, this.lookYaw * 0.45);
    add('head', 0, this.lookYaw * 0.45 + this.turn * 0.12);
    if (g > 0.3) {
      // Petits pas en broutant, mâchonnement
      add('head', 0.04 * Math.sin(this.t * 7) * g);
    }
    // Coup de patte (méfiance)
    if (this.stomp > 0) add('fUpperLF', -0.5 * Math.sin(this.stomp * Math.PI), 0, 0), add('fKneeLF', 0.9 * Math.sin(this.stomp * Math.PI));
    // Ruade (balle au cœur)
    if (this.kick > 0) {
      const k = Math.sin(this.kick * Math.PI);
      add('rUpperL', -0.9 * k); add('rUpperR', -0.9 * k); add('pelvis', -0.25 * k);
      add('rHockL', -0.6 * k); add('rHockR', -0.6 * k);
    }
    // --- Oreilles
    for (let i = 0; i < 2; i++) {
      const e = this.ear[i];
      e.t -= dt;
      if (e.t <= 0) {
        e.t = 0.6 + Math.random() * 3.5;
        e.x = (Math.random() - 0.5) * 0.8;
        e.z = (Math.random() - 0.5) * 0.5;
      }
      const side = i === 0 ? 'L' : 'R';
      const fwd = this.alert;
      add('ear' + side, lerp(e.x * 0.6, -0.5, fwd) * (1 - this.dead), 0, lerp(e.z, 0, fwd) * (1 - this.dead) - this.dead * 0.6 * (i ? -1 : 1));
    }
    // --- Queue
    this.tailT -= dt;
    if (this.tailT <= 0) { this.tailT = 0.8 + Math.random() * 4; this.tail = (Math.random() - 0.5) * 1.2; }
    add('tail1', -0.2 * this.alert, this.tail * 0.5 * Math.sin(this.t * 9) * (1 - this.dead));
    add('tail2', 0, this.tail * 0.3 * Math.sin(this.t * 9 + 0.5));

    // --- Couché (pattes repliées sous le corps)
    const bd = Math.max(this.bed, 0);
    if (bd > 0.001) {
      add('fUpperL', 0.6 * bd); add('fUpperR', 0.6 * bd);
      add('fLowerL', -1.5 * bd); add('fLowerR', -1.5 * bd);
      add('fKneeL', 2.7 * bd); add('fKneeR', 2.7 * bd);
      add('rUpperL', -0.5 * bd); add('rUpperR', -0.5 * bd);
      add('rStifleL', -1.2 * bd); add('rStifleR', -1.2 * bd);
      add('rHockL', 2.3 * bd); add('rHockR', 2.3 * bd);
      add('neck1', -0.15 * bd);
    }
    // --- Mort : sur le flanc, pattes tendues
    const d = this.dead;
    if (d > 0.001) {
      for (const n of ['fUpperL', 'fUpperR']) add(n, -0.35 * d);
      for (const n of ['rUpperL', 'rUpperR']) add(n, 0.3 * d);
      for (const n of ['fKneeL', 'fKneeR', 'rHockL', 'rHockR']) add(n, 0.15 * d);
      add('neck1', 0.25 * d, 0, 0);
      add('neck2', 0.1 * d);
      add('head', 0.35 * d, 0, -0.3 * d * this.deadSide);
    }
    // Application
    for (const k in B) {
      const r = R[k];
      if (r) B[k].rotation.set(r[0], r[1], r[2]);
      else B[k].rotation.set(0, 0, 0);
    }
    // Racine : rebond, couché, chute sur le côté (rotation autour du centre du corps)
    const root = B.root;
    const halfW = sp.body[7][4];
    const bodyC = sp.body[7][1];
    const th = d * this.deadSide * 1.42;
    const cy = lerp(bodyC - bd * bodyC * 0.62, halfW * 1.08, d);
    root.rotation.z = th;
    root.position.set(bodyC * Math.sin(th), cy - bodyC * Math.cos(th) + bob * (1 - d), 0);
  }
}
