// Textures procédurales (canvas) : sol, écorce, branches, feuillages, herbe, roche, fourrure...
'use strict';
HG.tex = (() => {
  const { clamp, lerp, rand, makeNoise } = HG.util;
  const cache = {};
  const N = makeNoise(7);
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toTex(c, repeat = 1, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
    if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; else if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8; t.needsUpdate = true; return t;
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function fillNoise(ctx, w, h, fn) {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const c = fn(x / w, y / h, x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255; }
    ctx.putImageData(img, 0, 0);
  }
  // Bruit périodique (tuilable) via coordonnées circulaires
  function tnoise(u, v, f, oct = 4) {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    return N.fbm(Math.cos(a) * f + Math.sin(b) * f * 0.5 + 10, Math.sin(a) * f + Math.cos(b) * f * 0.5 + 20, oct);
  }

  // ------------------------------------------------------------- SOL
  function ground(kind) {
    const key = 'ground_' + kind; if (cache[key]) return cache[key];
    const S = 512, c = canvas(S, S), ctx = c.getContext('2d');
    const pal = {
      grass: [hexToRgb('#4a6a2a'), hexToRgb('#6e8a36'), hexToRgb('#3f5a22'), hexToRgb('#7d7a44')],
      forest: [hexToRgb('#5e4a30'), hexToRgb('#7d6240'), hexToRgb('#4a6a2c'), hexToRgb('#9a7a48')],
      marsh: [hexToRgb('#4c5c2a'), hexToRgb('#6e7a38'), hexToRgb('#3b4a1e'), hexToRgb('#5c5a3a')],
      rock: [hexToRgb('#6e6a62'), hexToRgb('#8a857a'), hexToRgb('#57534c'), hexToRgb('#9a958a')],
      snow: [hexToRgb('#e8ecf2'), hexToRgb('#f6f8fb'), hexToRgb('#d0d8e4'), hexToRgb('#ffffff')],
      field: [hexToRgb('#8a7a48'), hexToRgb('#a8955a'), hexToRgb('#6a5a34'), hexToRgb('#b9a66a')],
      boreal: [hexToRgb('#3f4a2a'), hexToRgb('#5c6a36'), hexToRgb('#6a4a2a'), hexToRgb('#8a8a5a')],
    }[kind] || [[80, 100, 40], [110, 130, 60], [60, 80, 30], [120, 110, 70]];
    fillNoise(ctx, S, S, (u, v) => {
      const n1 = tnoise(u, v, 6, 5) * 0.5 + 0.5, n2 = tnoise(u + 0.3, v + 0.7, 18, 3) * 0.5 + 0.5, n3 = tnoise(u + 0.6, v + 0.1, 40, 2) * 0.5 + 0.5;
      let col = mix(pal[0], pal[1], n1);
      col = mix(col, pal[2], clamp((n2 - 0.5) * 2, 0, 1));
      col = mix(col, pal[3], clamp((n3 - 0.62) * 4, 0, 1) * 0.6);
      const sh = 0.85 + n3 * 0.3;
      return [col[0] * sh, col[1] * sh, col[2] * sh];
    });
    // brins / feuilles / cailloux
    const rng = HG.util.mulberry32(kind.length * 31);
    for (let i = 0; i < 1800; i++) {
      const x = rng() * S, y = rng() * S, l = 2 + rng() * 6, a = rng() * Math.PI;
      ctx.strokeStyle = `rgba(${Math.floor(rng() * 60 + (kind === 'snow' ? 190 : 20))},${Math.floor(rng() * 60 + (kind === 'snow' ? 200 : 40))},${Math.floor(rng() * 40 + (kind === 'snow' ? 210 : 10))},${0.25 + rng() * 0.3})`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    if (kind === 'forest' || kind === 'boreal') for (let i = 0; i < 400; i++) { // feuilles mortes
      const x = rng() * S, y = rng() * S; ctx.fillStyle = `rgba(${140 + rng() * 80},${70 + rng() * 50},${20 + rng() * 30},${0.35 + rng() * 0.3})`;
      ctx.beginPath(); ctx.ellipse(x, y, 2 + rng() * 3, 1.2 + rng() * 2, rng() * 3, 0, 7); ctx.fill();
    }
    return (cache[key] = toTex(c, 1));
  }

  // ------------------------------------------------------------- ÉCORCE
  function bark(kind) {
    const key = 'bark_' + kind; if (cache[key]) return cache[key];
    const W = 256, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
    const base = { pine: [hexToRgb('#6b4a32'), hexToRgb('#3e2a1c')], oak: [hexToRgb('#6a6258'), hexToRgb('#3a342c')], birch: [hexToRgb('#eae6dc'), hexToRgb('#8f8a80')], spruce: [hexToRgb('#4a3a2c'), hexToRgb('#2a1e16')], beech: [hexToRgb('#8c8878'), hexToRgb('#5a5648')] }[kind] || [[100, 80, 60], [50, 40, 30]];
    fillNoise(ctx, W, H, (u, v) => {
      const n = tnoise(u * 1, v * 0.25, 5, 4) * 0.5 + 0.5, s = tnoise(u * 3, v * 0.1, 14, 3) * 0.5 + 0.5;
      let t = clamp(n * 0.6 + s * 0.6, 0, 1);
      if (kind === 'birch') { t = s > 0.62 ? 1 : n * 0.15; }
      return mix(base[0], base[1], t);
    });
    if (kind === 'birch') { for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(30,25,20,0.8)'; const y = Math.random() * H; ctx.fillRect(Math.random() * W, y, 20 + Math.random() * 60, 2 + Math.random() * 5); } }
    else for (let i = 0; i < 60; i++) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1 + Math.random() * 2; ctx.beginPath(); const x = Math.random() * W; ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 8, H * 0.3, x - 8, H * 0.6, x + 4, H); ctx.stroke(); }
    const t = toTex(c, 1); t.repeat.set(1, 3); return (cache[key] = t);
  }

  // ------------------------------------------------------------- BRANCHE DE CONIFÈRE (alpha)
  function conifer(kind) {
    const key = 'conifer_' + kind; if (cache[key]) return cache[key];
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    const col = { pine: ['#2f5a2a', '#4a7a36', '#1f3f1c'], spruce: ['#1f3d24', '#2f5a34', '#142a18'], fir: ['#24482a', '#3a6a3a', '#183020'] }[kind] || ['#2f5a2a', '#4a7a36', '#1f3f1c'];
    ctx.clearRect(0, 0, S, S);
    // rameau central + rameaux latéraux couverts d'aiguilles
    const rng = HG.util.mulberry32(kind.length * 17 + 3);
    function twig(x0, y0, x1, y1, depth) {
      ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = depth === 0 ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      const n = Math.floor(L / 3);
      for (let i = 0; i < n; i++) {
        const t = i / n, px = x0 + dx * t, py = y0 + dy * t, len = (depth === 0 ? 14 : 9) * (0.6 + rng() * 0.6) * (1 - t * 0.4);
        for (const s of [-1, 1]) {
          const ang = 0.5 + rng() * 0.5;
          const ex = px + (nx * s * Math.cos(ang) + (dx / L) * Math.sin(ang)) * len, ey = py + (ny * s * Math.cos(ang) + (dy / L) * Math.sin(ang)) * len;
          ctx.strokeStyle = col[Math.floor(rng() * 3)]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
        }
      }
      if (depth < 1) { for (let i = 1; i <= 4; i++) { const t = i / 5, px = x0 + dx * t, py = y0 + dy * t; for (const s of [-1, 1]) { const len = L * 0.35 * (1 - t * 0.5); twig(px, py, px + (nx * s * 0.8 + (dx / L) * 0.55) * len, py + (ny * s * 0.8 + (dy / L) * 0.55) * len, depth + 1); } } }
    }
    twig(S / 2, S - 4, S / 2, 10, 0);
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache[key] = t);
  }

  // ------------------------------------------------------------- FEUILLAGE (alpha) : amas de feuilles
  function leaves(kind, autumn = 0) {
    const key = 'leaves_' + kind + '_' + Math.round(autumn * 4); if (cache[key]) return cache[key];
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    const greens = ['#3f6b2a', '#4f7f34', '#2f5520', '#5e8a3a'];
    const golds = ['#c7862a', '#d9a13a', '#b0561f', '#e0b04a', '#9c3d1a'];
    const rng = HG.util.mulberry32(kind.length * 23 + Math.round(autumn * 10));
    const cx = S / 2, cy = S / 2;
    const leafN = kind === 'bush' ? 260 : 220;
    for (let i = 0; i < leafN; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * S * 0.46;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const useGold = rng() < autumn;
      const col = useGold ? golds[Math.floor(rng() * golds.length)] : greens[Math.floor(rng() * greens.length)];
      const sz = kind === 'birch' ? 6 : kind === 'oak' ? 11 : 9;
      const s = sz * (0.6 + rng() * 0.7), rot = rng() * Math.PI;
      const shade = 0.75 + (y / S) * 0.4;
      const [rr, gg, bb] = hexToRgb(col);
      ctx.fillStyle = `rgb(${rr * shade | 0},${gg * shade | 0},${bb * shade | 0})`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
      if (kind === 'oak') { ctx.moveTo(0, -s); for (let k = 0; k < 7; k++) { const aa = -Math.PI / 2 + (k + 1) * (Math.PI * 2 / 7); const rr2 = k % 2 ? s * 0.55 : s; ctx.lineTo(Math.cos(aa) * rr2 * 0.6, Math.sin(aa) * rr2); } ctx.closePath(); }
      else ctx.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    }
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache[key] = t);
  }

  // ------------------------------------------------------------- HERBE (brin, alpha)
  function grassBlade(kind = 'green') {
    const key = 'grass_' + kind; if (cache[key]) return cache[key];
    const W = 64, H = 128, c = canvas(W, H), ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H);
    const cols = kind === 'dry' ? ['#9c8f4e', '#b3a55c', '#7f7440'] : kind === 'reed' ? ['#7f8f44', '#9aa356', '#647032'] : ['#4a6e28', '#5f8532', '#3a5a1f'];
    for (let i = 0; i < 6; i++) {
      const x0 = 8 + Math.random() * (W - 16), w = 1.6 + Math.random() * 2, h = H * (0.55 + Math.random() * 0.45), bend = (Math.random() - 0.5) * 30;
      const grad = ctx.createLinearGradient(0, H, 0, H - h); grad.addColorStop(0, '#2a3f14'); grad.addColorStop(0.6, cols[i % 3]); grad.addColorStop(1, cols[(i + 1) % 3]);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x0 - w, H); ctx.quadraticCurveTo(x0 + bend * 0.5, H - h * 0.5, x0 + bend, H - h); ctx.quadraticCurveTo(x0 + bend * 0.5 + w, H - h * 0.5, x0 + w, H); ctx.fill();
    }
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache[key] = t);
  }

  // ------------------------------------------------------------- ROCHE
  function rock() {
    if (cache.rock) return cache.rock;
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    fillNoise(ctx, S, S, (u, v) => { const n = tnoise(u, v, 5, 5) * 0.5 + 0.5, m = tnoise(u + 0.5, v, 20, 3) * 0.5 + 0.5; const g = 90 + n * 70 + m * 30; return [g * 1.02, g, g * 0.95 - (m > 0.65 ? 20 : 0)]; });
    return (cache.rock = toTex(c, 2));
  }
  // ------------------------------------------------------------- FOURRURE / PLUMAGE
  function fur(c1, c2, opts = {}) {
    const key = 'fur_' + c1 + c2 + JSON.stringify(opts); if (cache[key]) return cache[key];
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    const a = hexToRgb(c1), b = hexToRgb(c2);
    fillNoise(ctx, S, S, (u, v) => { const n = tnoise(u, v * 4, 30, 3) * 0.5 + 0.5, m = tnoise(u + 0.2, v, 6, 3) * 0.5 + 0.5; return mix(a, b, clamp(n * 0.7 + m * 0.5, 0, 1)); });
    if (opts.spots) { ctx.fillStyle = opts.spots; for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, 3 + Math.random() * 5, 0, 7); ctx.fill(); } }
    if (opts.stripes) { for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#e8cfa0' : '#3b2a1a'; ctx.fillRect(0, i * S / 7, S, S / 14); } }
    if (opts.patches) { ctx.fillStyle = opts.patches; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(Math.random() * S, Math.random() * S, 20 + Math.random() * 40, 15 + Math.random() * 30, Math.random() * 3, 0, 7); ctx.fill(); } }
    return (cache[key] = toTex(c, 1));
  }
  // ------------------------------------------------------------- CIBLES / PLATEAUX
  function target() {
    if (cache.target) return cache.target;
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d'); ctx.fillStyle = '#f2ecd8'; ctx.fillRect(0, 0, S, S);
    for (let r = 10; r >= 1; r--) { ctx.fillStyle = r >= 8 ? '#1a1a1a' : r % 2 ? '#f2ecd8' : '#d9d0b8'; ctx.beginPath(); ctx.arc(S / 2, S / 2, r * S / 22, 0, 7); ctx.fill(); if (r === 10) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; } }
    ctx.strokeStyle = '#333'; for (let r = 1; r <= 10; r++) { ctx.beginPath(); ctx.arc(S / 2, S / 2, r * S / 22, 0, 7); ctx.stroke(); }
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache.target = t);
  }
  function boarTarget() {
    if (cache.boarTarget) return cache.boarTarget;
    const W = 256, H = 160, c = canvas(W, H), ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#3a2c22'; ctx.beginPath(); ctx.ellipse(120, 90, 90, 42, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(210, 80, 34, 26, 0.3, 0, 7); ctx.fill();
    ctx.fillRect(60, 110, 14, 45); ctx.fillRect(90, 115, 14, 42); ctx.fillRect(150, 115, 14, 42); ctx.fillRect(175, 110, 14, 45);
    for (let r = 4; r >= 1; r--) { ctx.strokeStyle = r === 1 ? '#f33' : '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(150, 92, r * 9, 0, 7); ctx.stroke(); }
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache.boarTarget = t);
  }
  function wood() {
    if (cache.wood) return cache.wood;
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    fillNoise(ctx, S, S, (u, v) => { const n = tnoise(u * 0.2, v * 3, 8, 3) * 0.5 + 0.5; return mix([150, 110, 70], [90, 60, 35], n); });
    return (cache.wood = toTex(c, 1));
  }
  function cloth(color) {
    const key = 'cloth_' + color; if (cache[key]) return cache[key];
    const S = 128, c = canvas(S, S), ctx = c.getContext('2d'); const b = hexToRgb(color);
    fillNoise(ctx, S, S, (u, v) => { const n = tnoise(u, v, 40, 2) * 0.5 + 0.5; return [b[0] * (0.85 + n * 0.3), b[1] * (0.85 + n * 0.3), b[2] * (0.85 + n * 0.3)]; });
    return (cache[key] = toTex(c, 4));
  }
  function camo() {
    if (cache.camo) return cache.camo;
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d'); ctx.fillStyle = '#6b6a4e'; ctx.fillRect(0, 0, S, S);
    const cols = ['#3c4a2a', '#8a7a52', '#2a2a20', '#a09a78', '#55603a'];
    for (let i = 0; i < 260; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse(Math.random() * S, Math.random() * S, 6 + Math.random() * 22, 4 + Math.random() * 12, Math.random() * 3, 0, 7); ctx.fill(); }
    return (cache.camo = toTex(c, 2));
  }
  function waterNormal() {
    if (cache.waterN) return cache.waterN;
    const S = 256, c = canvas(S, S), ctx = c.getContext('2d');
    fillNoise(ctx, S, S, (u, v) => { const e = 0.004; const h = (x, y) => tnoise(x, y, 12, 3); const dx = h(u + e, v) - h(u - e, v), dy = h(u, v + e) - h(u, v - e); return [128 + dx * 900, 128 + dy * 900, 255]; });
    const t = toTex(c, 8, false); return (cache.waterN = t);
  }
  function puff() {
    if (cache.puff) return cache.puff;
    const S = 128, c = canvas(S, S), ctx = c.getContext('2d'); const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.15) + ')'; ctx.beginPath(); ctx.arc(S / 2 + (Math.random() - 0.5) * S * 0.6, S / 2 + (Math.random() - 0.5) * S * 0.6, 8 + Math.random() * 18, 0, 7); ctx.fill(); }
    const t = toTex(c, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache.puff = t);
  }
  return { puff, ground, bark, conifer, leaves, grassBlade, rock, fur, target, boarTarget, wood, cloth, camo, waterNormal };
})();
