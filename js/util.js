// Utilitaires généraux : maths, aléatoire à graine, bruit de Perlin, géométries.
'use strict';

const DH = (window.DH = window.DH || {});
DH.UP = new THREE.Vector3(0, 1, 0);
// Couleurs hexadécimales interprétées en sRGB (rendu linéaire correct)
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

DH.util = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // Tirage pondéré : { cle: poids, ... }
  function weighted(obj) {
    let total = 0;
    for (const k in obj) total += obj[k];
    let r = Math.random() * total;
    for (const k in obj) {
      r -= obj[k];
      if (r <= 0) return k;
    }
    return Object.keys(obj)[0];
  }

  // Générateur pseudo-aléatoire déterministe
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bruit de Perlin 2D avec graine
  function makeNoise(seed) {
    const rng = mulberry32(seed);
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y) => {
      switch (h & 7) {
        case 0: return x + y;
        case 1: return -x + y;
        case 2: return x - y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
      }
    };
    function noise2(x, y) {
      let X = Math.floor(x), Y = Math.floor(y);
      x -= X; y -= Y;
      X &= 255; Y &= 255;
      const u = fade(x), v = fade(y);
      const aa = perm[X + perm[Y]], ab = perm[X + perm[Y + 1]];
      const ba = perm[X + 1 + perm[Y]], bb = perm[X + 1 + perm[Y + 1]];
      return lerp(
        lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
        lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
        v
      ) * 0.7;
    }
    function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
      let s = 0, a = 1, f = 1, n = 0;
      for (let i = 0; i < oct; i++) {
        s += a * noise2(x * f, y * f);
        n += a;
        a *= gain;
        f *= lac;
      }
      return s / n;
    }
    function ridged(x, y, oct = 4) {
      let s = 0, a = 1, f = 1, n = 0;
      for (let i = 0; i < oct; i++) {
        s += a * (1 - Math.abs(noise2(x * f, y * f) * 1.4));
        n += a;
        a *= 0.5;
        f *= 2;
      }
      return s / n;
    }
    return { noise2, fbm, ridged, rng };
  }

  // Fusionne des géométries (converties en non-indexées). Couleur par sommet optionnelle.
  function mergeGeometries(list) {
    let count = 0;
    const parts = list.map((item) => {
      const g = (item.geo || item).index ? (item.geo || item).toNonIndexed() : (item.geo || item);
      count += g.attributes.position.count;
      return { g, color: item.color };
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const hasUv = parts.every((p) => p.g.attributes.uv);
    const uv = hasUv ? new Float32Array(count * 2) : null;
    let o = 0;
    const c = new THREE.Color();
    for (const { g, color } of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nor.set(g.attributes.normal.array, o * 3);
      if (hasUv) uv.set(g.attributes.uv.array, o * 2);
      c.set(color || 0xffffff);
      for (let i = 0; i < n; i++) {
        col[(o + i) * 3] = c.r;
        col[(o + i) * 3 + 1] = c.g;
        col[(o + i) * 3 + 2] = c.b;
      }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (hasUv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  }

  // Géométrie transformée (copie)
  function xf(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geo.clone();
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    g.applyMatrix4(m);
    return g;
  }

  // Distance d'un point à un segment : renvoie t et distance²
  const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
  function segPointDist2(a, b, p) {
    _ab.subVectors(b, a);
    _ap.subVectors(p, a);
    const len2 = _ab.lengthSq();
    let t = len2 > 0 ? _ap.dot(_ab) / len2 : 0;
    t = clamp(t, 0, 1);
    const dx = a.x + _ab.x * t - p.x;
    const dy = a.y + _ab.y * t - p.y;
    const dz = a.z + _ab.z * t - p.z;
    return { t, d2: dx * dx + dy * dy + dz * dz };
  }

  // Nombre gaussien (Box-Muller)
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  const angleDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  return {
    clamp, lerp, smoothstep, rand, randInt, pick, chance, weighted, mulberry32,
    makeNoise, mergeGeometries, xf, segPointDist2, gauss, canvasTexture, fmtTime, angleDiff,
  };
})();
