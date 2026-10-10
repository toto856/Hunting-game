// Outils de construction du pavillon : regroupement des géométries statiques par matériau,
// coordonnées de texture à l'échelle réelle, murs percés, étiquettes gravées (atlas).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectGlobals } from '../gfx/globals.js';

const ATTRS = ['position', 'normal', 'uv', 'color'];

function attrsFor(mat) {
  const a = ['position', 'normal', 'uv'];
  if (mat.vertexColors) a.push('color');
  // Normales de pelage lues sur le second jeu de coordonnées
  if ((mat.normalMap && mat.normalMap.channel === 1) || (mat.map && mat.map.channel === 1)) a.push('uv1');
  return a;
}

// Copie normalisée (non indexée, attributs utiles seulement), transformée
function prep(geo, matrix, attrs) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  for (const name of Object.keys(g.attributes)) if (!attrs.includes(name)) g.deleteAttribute(name);
  for (const name of attrs) {
    if (g.attributes[name]) continue;
    const n = g.attributes.position.count;
    const size = name === 'uv' || name === 'uv1' ? 2 : 3;
    const arr = new Float32Array(n * size);
    if (name === 'color') arr.fill(1);
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  // Couleurs : toujours en flottants pour la fusion
  const c = g.attributes.color;
  if (c && !(c.array instanceof Float32Array)) {
    const f = new Float32Array(c.count * 3);
    for (let i = 0; i < c.count; i++) { f[i * 3] = c.getX(i); f[i * 3 + 1] = c.getY(i); f[i * 3 + 2] = c.getZ(i); }
    g.setAttribute('color', new THREE.BufferAttribute(f, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// Coordonnées de texture planes selon l'axe dominant de la normale (en mètres / pas)
export function worldUV(g, su = 1, sv = su, ou = 0, ov = 0) {
  const p = g.attributes.position, n = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) g.setAttribute('uv', (uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2)));
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, (u - ou) / su, (v - ov) / sv);
  }
  uv.needsUpdate = true;
  return g;
}

// Pavé dont le fil (u) suit la plus grande dimension
export function boxGeo(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const dims = [w, h, d];
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)) > 0.5 ? 0 : Math.abs(n.getY(i)) > 0.5 ? 1 : 2;
    const t = [0, 1, 2].filter((k) => k !== ax);
    const [a, b] = dims[t[0]] >= dims[t[1]] ? [t[0], t[1]] : [t[1], t[0]];
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    uv.setXY(i, (c[a] + dims[a] * 0.37) / tile, (c[b] + dims[b] * 0.21) / tile);
  }
  return g;
}

// Regroupe tout ce qui est statique : un seul appel de rendu par matériau
export class Batcher {
  constructor() {
    this.groups = new Map();
  }

  add(mat, geo, matrix = null, opts = {}) {
    let e = this.groups.get(mat);
    if (!e) this.groups.set(mat, (e = { mat, geos: [], attrs: attrsFor(mat), cast: true, receive: true }));
    if (opts.cast === false) e.cast = false;
    const g = prep(geo, matrix, e.attrs);
    if (opts.uv === 'world') worldUV(g, opts.su || opts.tile || 1, opts.sv || opts.su || opts.tile || 1, opts.ou || 0, opts.ov || 0);
    e.geos.push(g);
    if (opts.dispose) geo.dispose();
    return g;
  }

  // Ajoute tous les maillages d'un objet (repère de l'objet racine)
  addObject(obj, opts = {}) {
    obj.updateMatrixWorld(true);
    const inv = obj.parent ? new THREE.Matrix4().copy(obj.parent.matrixWorld).invert() : null;
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible || o.isSkinnedMesh || o.isInstancedMesh) return;
      const m = inv ? new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) : o.matrixWorld;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      this.add(mat, o.geometry, m, { cast: opts.cast ?? o.castShadow });
    });
  }

  build(parent, name = '') {
    const out = [];
    for (const e of this.groups.values()) {
      if (!e.geos.length) continue;
      const geo = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
      if (!geo) continue;
      for (const g of e.geos) if (g !== geo) g.dispose();
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, e.mat);
      m.castShadow = e.cast;
      m.receiveShadow = true;
      m.name = name;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

// Mur extrudé (forme dans le plan x/y, épaisseur selon +z) avec ouvertures rectangulaires
// ou en arc. outline : [[x, y], ...] ; holes : [{ x0, x1, y0, y1, arch }]
export function wallGeo(outline, holes, thick) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x0, h.y0);
    p.lineTo(h.x1, h.y0);
    if (h.arch) {
      p.lineTo(h.x1, h.y1 - h.arch);
      const cx = (h.x0 + h.x1) / 2, rx = (h.x1 - h.x0) / 2;
      for (let k = 1; k < 12; k++) {
        const a = (k / 12) * Math.PI;
        p.lineTo(cx + Math.cos(a) * rx, h.y1 - h.arch + Math.sin(a) * h.arch);
      }
      p.lineTo(h.x0, h.y1 - h.arch);
    } else {
      p.lineTo(h.x1, h.y1);
      p.lineTo(h.x0, h.y1);
    }
    p.lineTo(h.x0, h.y0);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 4, steps: 1 });
  return g;
}

// Repère d'un mur : intérieur = face z = 0 du mur local, normale extérieure n
export function wallMatrix(origin, n) {
  const up = new THREE.Vector3(0, 1, 0);
  const nn = n.clone().normalize();
  const u = new THREE.Vector3().crossVectors(up, nn);
  return new THREE.Matrix4().makeBasis(u, up, nn).setPosition(origin);
}

// Rugosité lue dans l'alpha de la texture couleur (générateur procédural)
export function roughFromAlpha(mat, lo, hi) {
  mat.onBeforeCompile = (s) => {
    injectGlobals(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\nfloat texRough = sampledDiffuseColor.a;\n#else\nfloat texRough = 0.5;\n#endif\ndiffuseColor.a = opacity;')
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix( ${lo.toFixed(3)}, ${hi.toFixed(3)}, texRough );`);
  };
  mat.customProgramCacheKey = () => 'ra' + lo + '_' + hi;
  return mat;
}

// Atlas d'étiquettes : chaque cellule est dessinée sur un canevas commun (laiton gravé, bois…)
export class LabelAtlas {
  constructor(cellW = 320, cellH = 80, cols = 3) {
    this.cw = cellW;
    this.ch = cellH;
    this.cols = cols;
    this.cells = [];
    this.uses = [];
    // Cellule 0 : laiton uni (chants des plaques)
    this.plain = this.cell((g, w, h) => brass(g, w, h, false));
  }

  cell(draw) {
    this.cells.push(draw);
    return this.cells.length - 1;
  }

  // Plaque (pavé fin) dont la face avant (+z) porte la cellule
  plate(w, h, d, cellId) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.uses.push({ g, cellId });
    return g;
  }

  // Panneau plat (plan) portant la cellule
  quad(w, h, cellId) {
    const g = new THREE.PlaneGeometry(w, h);
    this.uses.push({ g, cellId, quad: true });
    return g;
  }

  finish(maxAniso = 4) {
    const rows = Math.ceil(this.cells.length / this.cols);
    const c = document.createElement('canvas');
    c.width = this.cw * this.cols;
    c.height = this.ch * rows;
    const g = c.getContext('2d');
    this.cells.forEach((draw, i) => {
      const x = (i % this.cols) * this.cw, y = Math.floor(i / this.cols) * this.ch;
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.rect(0, 0, this.cw, this.ch);
      g.clip();
      draw(g, this.cw, this.ch);
      g.restore();
    });
    const rect = (id) => {
      const col = id % this.cols, row = Math.floor(id / this.cols);
      return { u0: col / this.cols, u1: (col + 1) / this.cols, v0: 1 - (row + 1) / rows, v1: 1 - row / rows };
    };
    for (const u of this.uses) {
      const uv = u.g.attributes.uv;
      const r = rect(u.cellId), p = rect(this.plain);
      const pc = [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2];
      for (let i = 0; i < uv.count; i++) {
        const front = u.quad || (i >= 16 && i < 20);
        if (front) uv.setXY(i, r.u0 + (r.u1 - r.u0) * uv.getX(i), r.v0 + (r.v1 - r.v0) * uv.getY(i));
        else uv.setXY(i, pc[0], pc[1]);
      }
      uv.needsUpdate = true;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture = tex;
    return tex;
  }
}

// Fond de laiton brossé
export function brass(g, w, h, frame = true) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#d7b468');
  gr.addColorStop(0.45, '#b98d3e');
  gr.addColorStop(1, '#8e6a2c');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.12;
  for (let i = 0; i < h; i += 2) {
    g.fillStyle = i % 4 ? '#fff3c8' : '#5a4010';
    g.fillRect(0, i, w, 1);
  }
  g.globalAlpha = 1;
  if (frame) {
    g.strokeStyle = 'rgba(60,40,10,0.7)';
    g.lineWidth = Math.max(2, h * 0.05);
    g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  }
}

// Texte gravé sur laiton (deux lignes)
export function engrave(title, sub, opts = {}) {
  return (g, w, h) => {
    brass(g, w, h, true);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ink = opts.ink || '#2b1e0c';
    const line = (txt, y, size, font) => {
      let s = size;
      g.font = `${font} ${s}px ${opts.family || '"Cormorant SC", "Cormorant Garamond", Georgia, serif'}`;
      while (g.measureText(txt).width > w * 0.88 && s > 8) { s -= 1; g.font = `${font} ${s}px ${opts.family || '"Cormorant SC", Georgia, serif'}`; }
      g.fillStyle = 'rgba(255,240,200,0.55)';
      g.fillText(txt, w / 2, y + 1.2);
      g.fillStyle = ink;
      g.fillText(txt, w / 2, y);
    };
    if (sub) {
      line(title, h * 0.36, h * 0.34, '600');
      line(sub, h * 0.7, h * 0.24, '500');
    } else line(title, h * 0.52, h * 0.4, '600');
  };
}

// Enseigne en bois sculpté (lettres dorées)
export function carvedSign(text, w = 1024, h = 192, sub = '') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3b2614');
  gr.addColorStop(0.5, '#2c1b0d');
  gr.addColorStop(1, '#22150a');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // Fil du bois
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 25},${25 + Math.random() * 15},${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    const y = Math.random() * h;
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 5 + (Math.random() - 0.5) * 3);
    g.stroke();
  }
  g.strokeStyle = 'rgba(200,160,80,0.55)';
  g.lineWidth = 4;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = sub ? h * 0.36 : h * 0.46;
  g.font = `600 ${size}px "Cormorant SC", "Cormorant Garamond", Georgia, serif`;
  const ty = sub ? h * 0.4 : h * 0.53;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillText(text, w / 2 + 2, ty + 3);
  const gold = g.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
  gold.addColorStop(0, '#f3d692');
  gold.addColorStop(0.5, '#c99a45');
  gold.addColorStop(1, '#8e6420');
  g.fillStyle = gold;
  g.fillText(text, w / 2, ty);
  if (sub) {
    g.font = `italic 500 ${h * 0.2}px "Cormorant Garamond", Georgia, serif`;
    g.fillStyle = 'rgba(230,200,140,0.85)';
    g.fillText(sub, w / 2, h * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export { ATTRS };
