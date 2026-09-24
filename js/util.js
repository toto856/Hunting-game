// Utilitaires : maths, aléatoire à graine, bruit de Perlin / fbm, helpers.
'use strict';
const HG = (window.HG = window.HG || {});
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

HG.util = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function weighted(obj) {
    let total = 0; for (const k in obj) total += obj[k];
    let r = Math.random() * total;
    for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
    return Object.keys(obj)[0];
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const rng = mulberry32(seed);
    const p = []; for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
    function noise2(x, y) {
      let X = Math.floor(x), Y = Math.floor(y); x -= X; y -= Y; X &= 255; Y &= 255;
      const u = fade(x), v = fade(y);
      const aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]], ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
      return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u), lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v) * 0.7;
    }
    function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
      let a = 1, f = 1, s = 0, n = 0;
      for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
      return s / n;
    }
    function ridge(x, y, oct = 4) {
      let a = 1, f = 1, s = 0, n = 0;
      for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise2(x * f, y * f)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
      return s / n;
    }
    return { noise2, fbm, ridge, rng };
  }
  const money = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const hhmm = (h) => { const hh = Math.floor(h) % 24; const mm = Math.floor((h % 1) * 60); return pad(hh) + ':' + pad(mm); };
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const $ = (id) => document.getElementById(id);
  const fmtDist = (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km');
  const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  return { clamp, lerp, smoothstep, rand, randInt, pick, chance, gauss, weighted, mulberry32, makeNoise, money, pad, hhmm, dist2, angleDiff, el, $, fmtDist, hash2 };
})();
