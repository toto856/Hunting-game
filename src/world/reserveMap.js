// Domaine de Hautevallée : relief, eau, forêts, chemins et lieux-dits.
// Données pures (aucun rendu) : hauteurs, carte de texturage, densités.
import { makeNoise } from '../core/noise.js';
import { clamp, lerp, smoothstep, nextFrame, hash2 } from '../core/math.js';

export const WORLD = {
  half: 768,          // demi-côté (m)
  res: 2,             // pas de la grille (m)
  water: 100,         // niveau de l'étang
  seed: 1871,
};

// Lieux-dits et équipements
export const PLACES = {
  lodge: { x: 40, z: 560, r: 48, h: 121, name: 'Pavillon de chasse' },
  lake: { x: -390, z: 70, rx: 150, rz: 105, name: 'Étang de la Brème' },
  marsh: { x: -480, z: 205, rx: 140, rz: 95, name: 'Marais des Joncs' },
  meadow: { x: 0, z: 140, rx: 240, rz: 180, name: 'Le Grand Pré' },
  hut: { x: -352, z: 172, yaw: 0.1, name: 'Hutte de la Brème' },
  peak: { x: 140, z: -640, name: 'La Dent Grise' },
  refuge: { x: 70, z: -470, name: 'Refuge de la Crête' },
  beechwood: { x: 430, z: 40, name: 'Forêt des Hêtres' },
  pinewood: { x: -430, z: -250, name: 'Sapinière du Nord' },
  wallow: { x: -250, z: 250, name: 'Souille aux sangliers' },
};

// Postes d'affût (miradors) : position et orientation
export const STANDS = [
  { id: 'pre', x: -150, z: 250, yaw: -0.4, name: 'Mirador du Grand Pré' },
  { id: 'lisiere', x: 225, z: 95, yaw: 1.5, name: 'Mirador de la Lisière' },
  { id: 'combe', x: 380, z: -170, yaw: 2.4, name: 'Mirador de la Combe' },
  { id: 'crete', x: -40, z: -420, yaw: 3.1, name: 'Affût de la Crête' },
];

// Chemins (polylignes) : largeur en mètres
export const PATHS = [
  { w: 4.2, gravel: true, pts: [[70, 768], [55, 660], [42, 600], [40, 560], [28, 470], [10, 390], [0, 300], [-20, 200], [-40, 90], [-60, 20]] },
  { w: 2.4, pts: [[-60, 20], [-140, 60], [-220, 110], [-290, 150], [-340, 178]] },
  { w: 2.4, pts: [[-60, 20], [-30, -80], [10, -180], [40, -280], [20, -330], [80, -380], [50, -430], [70, -470]] },
  { w: 2.4, pts: [[-10, 210], [80, 190], [170, 150], [260, 110], [340, 60], [430, 20], [520, -40], [600, -110]] },
  { w: 1.6, pts: [[340, 60], [360, -40], [380, -170]] },
  { w: 1.6, pts: [[-150, 250], [-200, 260], [-250, 250]] },
];

function ellipseD(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  return Math.sqrt(dx * dx + dz * dz);
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  const dx = ax + abx * t - px, dz = az + abz * t - pz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function pathDistance(x, z) {
  let best = 1e9, w = 0, gravel = false;
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const d = segDist(x, z, a[0], a[1], b[0], b[1]) - p.w * 0.5;
      if (d < best) { best = d; w = p.w; gravel = !!p.gravel; }
    }
  }
  return { d: best, w, gravel };
}

export class ReserveMap {
  constructor() {
    this.half = WORLD.half;
    this.res = WORLD.res;
    this.n = Math.round((this.half * 2) / this.res) + 1;
    this.noise = makeNoise(WORLD.seed);
    this.noise2 = makeNoise(WORLD.seed + 77);
    this.heights = new Float32Array(this.n * this.n);
    this.splat = new Uint8Array(this.n * this.n * 4);
    this.forest = new Float32Array(this.n * this.n);
    this.water = WORLD.water;
  }

  // Altitude brute (fonction continue)
  rawHeight(x, z) {
    const N = this.noise, N2 = this.noise2;
    let h = 110 + 7 * N.fbm(x / 520, z / 520, 4) + 2.6 * N.fbm(x / 140, z / 140, 3);

    // Collines boisées à l'est
    const east = smoothstep(110, 430, x);
    h += east * (22 + 20 * N.fbm(x / 300 + 4, z / 300, 4) + 9 * N.ridged(x / 170, z / 170, 3));

    // Combe : vallon frais dans la forêt
    const combe = Math.exp(-Math.pow((x - 0.25 * z - 400) / 40, 2)) * smoothstep(-300, -60, z) * smoothstep(120, -60, z);
    h -= combe * 10;

    // Massif au nord
    const mz = smoothstep(-240, -660, z);
    const rdg = 0.62 * N2.ridged((x + 1000) / 420, (z + 1000) / 300, 3) + 0.38 * (N2.fbm(x / 260, z / 220, 4) * 0.5 + 0.5);
    const peak = Math.exp(-(((x - 140) ** 2) / (2 * 240 ** 2) + ((z + 650) ** 2) / (2 * 160 ** 2)));
    let mount = mz * mz * (60 + 120 * rdg) + peak * 120 + mz * 8 * N.fbm(x / 40, z / 40, 3);
    // Strates rocheuses (falaises) sur le versant sud
    const strata = smoothstep(0.35, 0.8, N.fbm(x / 90, z / 70, 3) * 0.5 + 0.5) * smoothstep(-380, -520, z) * smoothstep(-700, -560, z);
    const terr = 18;
    const stepped = Math.floor(mount / terr) * terr + terr * smoothstep(0.2, 1, (mount % terr) / terr);
    mount = lerp(mount, stepped, strata * 0.55);
    h += mount;

    // Grand Pré (aplani)
    const md = ellipseD(x, z, PLACES.meadow.x, PLACES.meadow.z, PLACES.meadow.rx, PLACES.meadow.rz) + 0.15 * N.fbm(x / 110, z / 110, 2);
    h = lerp(h, 108.5 + 2.2 * N.fbm(x / 95, z / 95, 3) + 0.04 * (z - 140) * 0.3, smoothstep(1.2, 0.55, md) * 0.88);

    // Étang : cuvette générale puis fond
    const lk = PLACES.lake;
    const ld = ellipseD(x, z, lk.x, lk.z, lk.rx, lk.rz) + 0.13 * N.fbm(x / 55, z / 55, 3);
    h -= 9 * smoothstep(2.8, 1.0, ld);
    if (ld < 1.7) {
      const shore = 100.25 + Math.max(0, ld - 1) * 5.5 + 0.35 * N.fbm(x / 18, z / 18, 2);
      const bottom = 99.65 - 3.4 * (1 - Math.min(1, ld * ld)) + 0.4 * N.fbm(x / 30, z / 30, 2);
      const target = ld < 1 ? bottom : shore;
      h = lerp(h, target, smoothstep(1.7, 1.0, ld));
      if (ld < 1) h = Math.min(h, bottom + 0.2);
    }

    // Marais : roselière basse avec des mares
    const mk = PLACES.marsh;
    const mdd = ellipseD(x, z, mk.x, mk.z, mk.rx, mk.rz) + 0.18 * N.fbm(x / 45, z / 45, 3);
    if (mdd < 1.6) {
      const marshH = 100.12 + 0.55 * N.fbm(x / 16, z / 16, 3) + 0.25 * N.fbm(x / 6, z / 6, 2);
      h = lerp(h, Math.min(h, marshH + Math.max(0, mdd - 0.9) * 3), smoothstep(1.6, 0.85, mdd));
    }

    // Souille (bauge boueuse)
    const wl = PLACES.wallow;
    const wd = Math.hypot(x - wl.x, z - wl.z);
    h -= 0.6 * smoothstep(9, 2, wd);

    // Plateau du pavillon
    const L = PLACES.lodge;
    const lodgeD = Math.hypot(x - L.x, z - L.z);
    h = lerp(h, L.h, smoothstep(L.r + 40, L.r, lodgeD));

    // Bordure : collines qui ferment le domaine
    const edge = Math.max(Math.abs(x), Math.abs(z));
    h += 75 * Math.pow(smoothstep(600, 768, edge), 2) * (0.7 + 0.3 * N.fbm(x / 120, z / 120, 2));
    return h;
  }

  // Densité forestière 0..1 et type de boisement
  rawForest(x, z, h, slope) {
    const N = this.noise;
    let f = 0;
    const n = N.fbm(x / 160, z / 160, 4) * 0.5 + 0.5;
    const n2 = N.fbm(x / 45 + 9, z / 45, 3) * 0.5 + 0.5;
    // Est : hêtraie-chênaie
    f = Math.max(f, smoothstep(170, 260, x) * smoothstep(0.32, 0.5, n));
    // Nord-ouest : sapinière
    f = Math.max(f, smoothstep(-200, -300, x) * smoothstep(-40, -140, z) * smoothstep(0.25, 0.45, n));
    // Versants du massif sous la limite des arbres
    f = Math.max(f, smoothstep(-230, -320, z) * smoothstep(305, 270, h) * smoothstep(0.28, 0.45, n));
    // Bosquets au sud et autour de l'étang
    f = Math.max(f, smoothstep(0.62, 0.72, n) * 0.85);
    // Haies et arbres isolés
    f = Math.max(f, smoothstep(0.72, 0.8, n2) * 0.5);
    // Exclusions
    const md = ellipseD(x, z, PLACES.meadow.x, PLACES.meadow.z, PLACES.meadow.rx, PLACES.meadow.rz);
    f *= smoothstep(0.85, 1.15, md) * 0.95 + 0.05 * smoothstep(0.75, 0.95, n2);
    const lk = PLACES.lake;
    f *= smoothstep(1.05, 1.3, ellipseD(x, z, lk.x, lk.z, lk.rx, lk.rz));
    const mk = PLACES.marsh;
    f *= smoothstep(0.95, 1.3, ellipseD(x, z, mk.x, mk.z, mk.rx, mk.rz));
    f *= smoothstep(PLACES.lodge.r + 5, PLACES.lodge.r + 35, Math.hypot(x - PLACES.lodge.x, z - PLACES.lodge.z));
    f *= smoothstep(0.75, 0.5, slope);
    f *= smoothstep(330, 300, h);
    return clamp(f, 0, 1);
  }

  async generate(progress) {
    const { n, res, half } = this;
    for (let j = 0; j < n; j++) {
      const z = -half + j * res;
      for (let i = 0; i < n; i++) {
        this.heights[j * n + i] = this.rawHeight(-half + i * res, z);
      }
      if (j % 48 === 0) {
        if (progress) progress(0.6 * (j / n));
        await nextFrame();
      }
    }
    // Texturage, forêts
    const N = this.noise;
    for (let j = 0; j < n; j++) {
      const z = -half + j * res;
      for (let i = 0; i < n; i++) {
        const x = -half + i * res;
        const k = j * n + i;
        const h = this.heights[k];
        const nx = this.heights[j * n + Math.min(n - 1, i + 1)] - this.heights[j * n + Math.max(0, i - 1)];
        const nz = this.heights[Math.min(n - 1, j + 1) * n + i] - this.heights[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(nx, nz) / (2 * res);
        const fo = this.rawForest(x, z, h, slope);
        this.forest[k] = fo;
        const p = pathDistance(x, z);
        const lk = PLACES.lake, mk = PLACES.marsh;
        const ld = ellipseD(x, z, lk.x, lk.z, lk.rx, lk.rz);
        const mdd = ellipseD(x, z, mk.x, mk.z, mk.rx, mk.rz);
        const nn = N.fbm(x / 30, z / 30, 3) * 0.5 + 0.5;
        // R : sous-bois, G : terre, B : boue, A : graviers/éboulis
        let r = smoothstep(0.25, 0.7, fo);
        let g = smoothstep(1.2, -0.6, p.d) * (p.gravel ? 0.35 : 1);
        g = Math.max(g, smoothstep(0.78, 0.9, nn) * 0.45 * (1 - r));
        g = Math.max(g, smoothstep(100.9, 100.3, h) * smoothstep(0.9, 1.2, ld) * 0.6);
        let b = smoothstep(100.55, 100.05, h) * smoothstep(0.85, 1.15, Math.min(ld, mdd) + 0.2);
        b = Math.max(b, smoothstep(1.2, 0.6, mdd) * 0.75);
        const wl = PLACES.wallow;
        b = Math.max(b, smoothstep(12, 4, Math.hypot(x - wl.x, z - wl.z)));
        let a = p.gravel ? smoothstep(1.0, -0.8, p.d) : 0;
        a = Math.max(a, smoothstep(0.55, 0.9, slope) * smoothstep(250, 300, h) * 0.8);
        a = Math.max(a, smoothstep(340, 380, h) * smoothstep(0.62, 0.4, nn) * 0.5);
        const o = k * 4;
        this.splat[o] = clamp(r * 255, 0, 255);
        this.splat[o + 1] = clamp(g * 255, 0, 255);
        this.splat[o + 2] = clamp(b * 255, 0, 255);
        this.splat[o + 3] = clamp(a * 255, 0, 255);
      }
      if (j % 64 === 0) {
        if (progress) progress(0.6 + 0.4 * (j / n));
        await nextFrame();
      }
    }
  }

  // Hauteur interpolée (bilinéaire) — identique au maillage
  heightAt(x, z) {
    const { n, res, half } = this;
    const fx = clamp((x + half) / res, 0, n - 1.001);
    const fz = clamp((z + half) / res, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const H = this.heights;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  normalAt(x, z, out) {
    const e = this.res;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  sample(arr, x, z, stride = 1, ch = 0) {
    const { n, res, half } = this;
    const fx = clamp((x + half) / res, 0, n - 1.001);
    const fz = clamp((z + half) / res, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const g = (ii, jj) => arr[(jj * n + ii) * stride + ch];
    return lerp(lerp(g(i, j), g(i + 1, j), tx), lerp(g(i, j + 1), g(i + 1, j + 1), tx), tz);
  }

  forestAt(x, z) { return this.sample(this.forest, x, z); }
  splatAt(x, z, ch) { return this.sample(this.splat, x, z, 4, ch) / 255; }
  waterDepth(x, z) { return this.water - this.heightAt(x, z); }
  isWater(x, z) { return this.heightAt(x, z) < this.water; }
  inBounds(x, z, m = 30) { return Math.abs(x) < this.half - m && Math.abs(z) < this.half - m; }

  slopeAt(x, z) {
    const e = this.res;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // Classe de milieu (pour les animaux et le son des pas)
  biomeAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < this.water - 0.05) return 'water';
    if (this.splatAt(x, z, 2) > 0.5) return 'marsh';
    if (h > 300 || this.slopeAt(x, z) > 0.7) return 'rock';
    if (this.forestAt(x, z) > 0.45) return 'forest';
    const p = pathDistance(x, z);
    if (p.d < 0.5) return p.gravel ? 'gravel' : 'path';
    return 'meadow';
  }

  rand(x, z, s = 0) { return hash2(Math.floor(x * 7.1), Math.floor(z * 7.3), s); }
}
