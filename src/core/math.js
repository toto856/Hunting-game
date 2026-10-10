// Outils mathématiques et aléatoires.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(a, b, k, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-k * dt));
}

// Générateur pseudo-aléatoire déterministe (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  const r = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  r.weighted = (obj) => {
    let total = 0;
    for (const k in obj) total += obj[k];
    let x = r() * total;
    for (const k in obj) {
      x -= obj[k];
      if (x <= 0) return k;
    }
    return Object.keys(obj)[0];
  };
  return r;
}

export const R = rng((Date.now() ^ 0x5bd1e995) >>> 0);

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const fmt = {
  int: (n) => Math.round(n).toLocaleString('fr-FR'),
  money: (n) => Math.round(n).toLocaleString('fr-FR') + ' €',
  dec: (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  dist: (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' km'),
  kg: (k) => k.toLocaleString('fr-FR', { maximumFractionDigits: k < 10 ? 2 : 0 }) + ' kg',
  time: (h) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - Math.floor(h)) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },
};

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
