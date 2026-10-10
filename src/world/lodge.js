// Pavillon de chasse (camp de base) : grande salle avec cheminée et table des cartes en
// relief, salle des trophées (vos prises naturalisées), armurerie (râteliers, vitrine des
// récompenses, comptoir, établi) et vestiaire (mannequins). On s'y déplace librement ;
// regarder un objet et appuyer sur E (ou le bouton d'action) ouvre l'écran correspondant.
import * as THREE from 'three';
import { Player } from '../game/player.js';
import { AnimalFactory } from '../animals/factory.js';
import { SPECIES, MEDAL_NAMES } from '../animals/species.js';
import { makeTrophy, buildTrophyGeometry, antlerMaterial } from '../animals/trophies.js';
import { BIRDS } from '../animals/birds.js';
import { WEAPONS, OUTFITS, SKINS, AMMO, OPTICS, GEAR, DUCKS } from '../data/catalog.js';
import * as Save from '../core/save.js';
import { audio } from '../core/audio.js';
import { isMobile, hasTouch } from '../core/quality.js';
import { GU, GLSL_NOISE } from '../gfx/globals.js';
import { BARK } from '../gfx/vegTextures.js';
import { FOREST } from '../gfx/terrainLayers.js';
import { OAK_FLOOR, PLASTER, PANEL, BEAM, STONE, RUG, CLUB_LEATHER, FURN } from '../gfx/lodgeTextures.js';
import { Batcher, boxGeo, wallGeo, wallMatrix, roughFromAlpha, LabelAtlas, engrave, carvedSign } from './lodgeBuild.js';
import { shoulderMount, fullMount, shieldGeometry, ovalGeometry, birdMount, MEDAL_COLORS } from './mounts.js';
import { ReserveMap, WORLD, PLACES, STANDS, PATHS } from './reserveMap.js';
import { makeNoise } from '../core/noise.js';
import { fmt, clamp, lerp, smoothstep, rng, nextFrame } from '../core/math.js';

// Volume intérieur (m)
const X0 = -14.6, X1 = 14.6, Z0 = -6.6, Z1 = 6.6;
const H = 4.4, RIDGE = 7.6, WT = 0.45;
const PX = 5; // cloisons à x = ±5
const OW = 2.0; // demi-largeur des passages
const TRUSS = [-9.8, -2.5, 2.5, 9.8];
const ALPHA = Math.atan((RIDGE - H) / Z1);
const roofY = (z) => H + (RIDGE - H) * (1 - Math.abs(z) / Z1);
const MEDAL_RANK = { aucune: 0, bronze: 1, argent: 2, or: 3, diamant: 4, legendaire: 5 };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(
  v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), typeof s === 'number' ? v3(s, s, s) : s);
const BIRD_NAMES = { colvert: 'Canard colvert', sarcelle: "Sarcelle d'hiver", pilet: 'Canard pilet', siffleur: 'Canard siffleur', souchet: 'Canard souchet', milouin: 'Fuligule milouin', oie: 'Oie cendrée' };

// Direction du soleil (fin d'après-midi, ouest-sud-ouest)
const SUN = v3(-0.74, 0.34, 0.58).normalize();
const LAMP = [20, 26, 26]; // intensité des lustres (grande salle, trophées, armurerie)

const FLAME_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aSize;
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
void main() {
  vUv = uv;
  vSeed = aSize.z;
  vec3 camRight = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
  vec3 right = normalize( vec3( camRight.x, 0.0, camRight.z ) + 1e-5 );
  float flick = 1.0 + 0.13 * sin( uTime * 11.0 + aSize.z * 40.0 ) + 0.08 * sin( uTime * 23.0 + aSize.z * 17.0 );
  vec3 p = aCenter + right * ( uv.x - 0.5 ) * aSize.x + vec3( 0.0, uv.y * aSize.y * flick, 0.0 );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGain;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
void main() {
  vec2 uv = vUv;
  float t = uTime * 1.7 + vSeed * 10.0;
  float n = fbm2( vec2( uv.x * 3.0 + vSeed * 7.0, uv.y * 2.4 - t * 1.5 ) );
  float n2 = fbm2( vec2( uv.x * 7.0 - vSeed * 3.0, uv.y * 5.0 - t * 2.6 ) );
  float w = 0.46 * ( 1.0 - uv.y * 0.92 ) * ( 0.7 + 0.6 * n );
  float dx = abs( uv.x - 0.5 + ( n2 - 0.5 ) * 0.3 * uv.y );
  float body = smoothstep( w, w * 0.2, dx ) * smoothstep( 0.0, 0.1, uv.y );
  float tip = 1.0 - smoothstep( 0.25, 0.95, uv.y + ( n - 0.5 ) * 0.55 );
  float f = body * tip;
  vec3 col = mix( vec3( 1.0, 0.2, 0.03 ), vec3( 1.0, 0.58, 0.16 ), smoothstep( 0.1, 0.55, f ) );
  col = mix( col, vec3( 1.0, 0.9, 0.62 ), smoothstep( 0.6, 0.95, f ) * ( 1.0 - uv.y ) );
  gl_FragColor = vec4( col * f * uGain, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const EMBER_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
varying float vA;
void main() {
  float life = fract( uTime * ( 0.22 + aSeed * 0.25 ) + aSeed * 13.7 );
  vec3 p = position;
  p.y += life * 1.15;
  p.x += sin( life * 6.0 + aSeed * 30.0 ) * 0.14 * life;
  p.z += cos( life * 5.0 + aSeed * 20.0 ) * 0.05 * life;
  vA = ( 1.0 - life ) * smoothstep( 0.0, 0.08, life ) * step( 0.25, fract( aSeed * 7.31 + uTime * 0.05 ) );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_PointSize = uPx * ( 0.006 + 0.008 * aSeed ) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const EMBER_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length( gl_PointCoord - 0.5 );
  float a = smoothstep( 0.5, 0.0, d ) * vA;
  gl_FragColor = vec4( vec3( 1.0, 0.42, 0.08 ) * a * 5.0, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Braises : lueur pulsée sous les bûches
const BED_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  vec2 p = vUv * vec2( 6.0, 3.0 );
  float n = fbm2( p + vec2( 0.0, uTime * 0.15 ) );
  float c = fbm2( p * 2.3 - uTime * 0.08 );
  float glow = smoothstep( 0.45, 0.8, n ) * ( 0.6 + 0.4 * sin( uTime * 2.0 + c * 9.0 ) );
  float edge = smoothstep( 0.0, 0.25, vUv.x ) * smoothstep( 1.0, 0.75, vUv.x ) * smoothstep( 0.0, 0.3, vUv.y ) * smoothstep( 1.0, 0.7, vUv.y );
  vec3 ash = vec3( 0.05, 0.045, 0.04 ) * ( 0.6 + 0.8 * c );
  vec3 col = ash + vec3( 1.0, 0.28, 0.04 ) * glow * edge * 2.2;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Rayons de soleil : volume additif, poussière en suspension
const RAY_VERT = /* glsl */ `
attribute vec2 aTS;
varying vec2 vTS;
varying vec3 vW;
void main() {
  vTS = aTS;
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RAY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vTS;
varying vec3 vW;
${GLSL_NOISE}
void main() {
  float along = pow( 1.0 - vTS.x, 1.4 );
  float edge = sin( 3.14159 * clamp( vTS.y, 0.0, 1.0 ) );
  float dust = 0.75 + 0.5 * fbm2( vW.xz * 1.3 + vec2( uTime * 0.03, vW.y * 0.7 ) );
  float a = along * edge * dust;
  gl_FragColor = vec4( uColor * a, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class LodgeHUD {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'lodge-hud';
    this.el.innerHTML = `<div class="lh-top"><b>Pavillon de chasse</b><span class="lh-stats"></span></div>
      <div class="lh-dot"></div><div class="lh-prompt"></div><div class="lh-hint"></div>`;
    root.appendChild(this.el);
    this.stats = this.el.querySelector('.lh-stats');
    this.prompt = this.el.querySelector('.lh-prompt');
    this.hint = this.el.querySelector('.lh-hint');
    this.dot = this.el.querySelector('.lh-dot');
    this._p = null;
    this._s = '';
  }

  update(prompt, stats) {
    if (prompt !== this._p) {
      this._p = prompt;
      this.prompt.innerHTML = prompt ? `${hasTouch ? '' : '<kbd>E</kbd> '}${prompt}` : '';
      this.prompt.classList.toggle('on', !!prompt);
      this.dot.classList.toggle('on', !!prompt);
    }
    if (stats !== this._s) {
      this._s = stats;
      this.stats.textContent = stats;
    }
  }

  showHint(text, ms = 9000) {
    this.hint.textContent = text;
    this.hint.classList.add('on');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => this.hint.classList.remove('on'), ms);
  }

  show(on) { this.el.hidden = !on; }
  dispose() { this.el.remove(); }
}

export class Lodge {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.paused = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0907);
    const opt = Save.get().options;
    this.camera = new THREE.PerspectiveCamera(opt.fov, this.engine.width / this.engine.height, 0.04, 90);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.colliders = [];
    this.items = [];
    this.displayItems = [];
    this.owned = []; // ressources propres à libérer
    this.t = 0;
    this.dirty = false;
    this.shadowDirty = true;
    this.exposure = 1.3;
    this.windows = [];
    this.map = null; // pas de relief : le joueur marche sur le parquet
  }

  // ------------------------------------------------------------------ chargement
  async load(progress) {
    const step = async (p, label) => { progress(p, label); await nextFrame(); };
    const q = this.engine.q;
    this.hi = q.shadowSize >= 2048;
    this.ts = q.texSize >= 1024 && !isMobile ? 1024 : 512;
    this.sb = new Batcher();
    // Polices des plaques gravées (sans bloquer si elles tardent)
    if (document.fonts && document.fonts.load) {
      await Promise.race([Promise.all(['600 40px "Cormorant SC"', 'italic 600 26px "Cormorant Garamond"', '600 25px "Alegreya Sans"'].map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 1500))]);
    }
    await step(0.06, 'Pavillon : parquet, boiseries, pierre');
    this.makeMaterials();
    await step(0.16, 'Charpente');
    this.buildArchitecture();
    this.buildWindows();
    this.buildDoor();
    await step(0.26, 'Cheminée');
    this.buildFireplace();
    this.buildHallFurniture();
    this.buildChandeliers();
    await step(0.36, 'Table des cartes du domaine');
    this.buildMapTable();
    await step(0.44, 'Salle des trophées');
    this.factory = this.app.animalFactory || (this.app.animalFactory = new AnimalFactory(this.engine, this.app.texgen));
    await this.buildTrophies((p) => progress(0.44 + p * 0.34, 'Salle des trophées'));
    await step(0.8, 'Armurerie et vestiaire');
    this.buildArmoryStatic();
    this.buildDisplays();
    await step(0.9, 'Lumières');
    this.buildLights();
    this.buildSunRays();
    this.sb.build(this.root, 'static');
    this.player = new Player(this, { x: 0, z: 4.9, yaw: 0 });
    // Point de vue imposé (captures de contrôle) : ?cam=x,z,lacet,tangage
    const cam = new URLSearchParams(location.search).get('cam');
    if (cam) {
      const [x, z, yaw, pitch] = cam.split(',').map(Number);
      this.player.pos.set(x, 0, z);
      this.player.yaw = yaw || 0;
      this.player.pitch = pitch || 0;
    }
    this.hud = new LodgeHUD(document.getElementById('ui'));
    this.hud.show(true);
    await step(0.96, 'Ambiance');
    this.captureEnv();
    const first = !Save.get().stats.sessions;
    this.hud.showHint(first
      ? 'Bienvenue au pavillon ! Approchez-vous de la table des cartes pour partir chasser. Trophées à gauche, armurerie et vestiaire à droite.'
      : 'Table des cartes : partir chasser · À gauche : vos trophées · À droite : armurerie et vestiaire', first ? 12000 : 7000);
    progress(1, 'Bienvenue au pavillon');
  }

  // ------------------------------------------------------------------ matériaux
  makeMaterials() {
    const tg = this.app.texgen, ts = this.ts;
    const P = (name, body, size, ns) => tg.pair('lodge-' + name, body, size, { normalStrength: ns });
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const fl = P('floor', OAK_FLOOR, ts, 3);
    this.mFloor = roughFromAlpha(std({ map: fl.map, normalMap: fl.normal, normalScale: new THREE.Vector2(0.55, 0.55) }), 0.22, 0.8);
    this.mCeil = std({ map: fl.map, normalMap: fl.normal, color: 0x8a7a6c, roughness: 0.8 });
    const pl = P('plaster', PLASTER, ts, 2);
    this.mPlaster = std({ map: pl.map, normalMap: pl.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.94 });
    const pn = P('panel', PANEL, ts, 7);
    this.mPanel = std({ map: pn.map, normalMap: pn.normal, roughness: 0.5 });
    const bm = P('beam', BEAM, ts, 5);
    this.mBeam = std({ map: bm.map, normalMap: bm.normal, roughness: 0.82 });
    const fu = P('furniture', FURN, ts, 2);
    this.mDark = std({ map: fu.map, normalMap: fu.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.42 });
    this.mShield = std({ map: bm.map, normalMap: bm.normal, normalScale: new THREE.Vector2(0.5, 0.5), color: 0xb09078, roughness: 0.45 });
    const st = P('stone', STONE, ts, 7);
    this.mStone = std({ map: st.map, normalMap: st.normal, roughness: 0.92 });
    const rg = P('rug', RUG, ts, 2);
    this.mRug = std({ map: rg.map, normalMap: rg.normal, roughness: 1 });
    const le = P('leather', CLUB_LEATHER, 512, 3);
    this.mLeather = roughFromAlpha(new THREE.MeshPhysicalMaterial({ map: le.map, normalMap: le.normal, normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.25, sheenColor: new THREE.Color(0.5, 0.3, 0.2) }), 0.3, 0.7);
    const bk = P('bark', BARK.oak, 512, 5);
    this.mBark = std({ map: bk.map, normalMap: bk.normal, roughness: 0.95 });
    const fo = P('forestfloor', FOREST, 512, 4);
    this.mLitter = std({ map: fo.map, normalMap: fo.normal, color: 0x9a8f80, roughness: 0.95 });
    this.mIron = std({ color: 0x1c1a18, roughness: 0.5, metalness: 0.85 });
    this.mBrass = std({ color: 0xc9a050, roughness: 0.3, metalness: 1 });
    this.mSoot = std({ color: 0x0a0807, roughness: 1 });
    this.mAsh = std({ color: 0x2b2724, roughness: 1 });
    this.mPaper = std({ color: 0xe9dfc6, roughness: 0.92 });
    this.mCandle = std({ color: 0xf0e4c8, roughness: 0.55, emissive: 0x3a2208, emissiveIntensity: 0.6 });
    this.mGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.6 });
    this.mVelvet = new THREE.MeshPhysicalMaterial({ color: 0x15301f, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0.25, 0.5, 0.32), sheenRoughness: 0.45 });
    this.mFelt = std({ color: 0x2f3a28, roughness: 1 });
    this.mManne = std({ color: 0xcfc6b4, roughness: 0.75 });
    this.mBoot = std({ color: 0x2a1c12, roughness: 0.55 });
    this.mBird = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    this.mAntler = antlerMaterial();
    for (const m of [this.mFloor, this.mCeil, this.mPlaster, this.mPanel, this.mBeam, this.mDark, this.mShield, this.mStone, this.mRug, this.mLeather, this.mBark, this.mLitter,
      this.mIron, this.mBrass, this.mSoot, this.mAsh, this.mPaper, this.mCandle, this.mGlass, this.mVelvet, this.mFelt, this.mManne, this.mBoot, this.mBird, this.mAntler]) this.owned.push(m);
  }

  // Pavé statique (fil du bois le long de la grande dimension)
  box(mat, w, h, d, x, y, z, o = {}) {
    const g = boxGeo(w, h, d, o.tile || 1);
    (o.batch || this.sb).add(mat, g, at(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), o);
    g.dispose();
    if (o.col) this.collider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  geo(mat, g, m, o = {}) {
    (o.batch || this.sb).add(mat, g, m, o);
    g.dispose();
  }

  collider(x0, z0, x1, z1) {
    this.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  // ------------------------------------------------------------------ architecture
  buildArchitecture() {
    const wopt = { uv: 'world', su: 2.0 };
    // Parquet
    this.geo(this.mFloor, new THREE.PlaneGeometry(X1 - X0 + 0.1, Z1 - Z0 + 0.1).rotateX(-Math.PI / 2), null, { uv: 'world', su: 2.4 });
    // Murs gouttereaux et pignons (percements : porte, fenêtres)
    const D = 0.95, DH = 2.75;
    const arcPts = (x0, x1, yb, hgt, n = 12) => {
      const out = [];
      for (let k = 1; k < n; k++) {
        const a = Math.PI - (k / n) * Math.PI;
        out.push([(x0 + x1) / 2 + Math.cos(a) * (x1 - x0) / 2, yb + Math.sin(a) * hgt]);
      }
      return out;
    };
    const south = [[X0 - WT, 0], [-D, 0], [-D, DH - 0.35], ...arcPts(-D, D, DH - 0.35, 0.35), [D, DH - 0.35], [D, 0], [X1 + WT, 0], [X1 + WT, H + 0.35], [X0 - WT, H + 0.35]];
    this.winDefs = [
      { wall: 'S', x0: -3.75, x1: -2.25, y0: 1.15, y1: 3.35 },
      { wall: 'S', x0: 2.25, x1: 3.75, y0: 1.15, y1: 3.35 },
      { wall: 'W', x0: -1.1, x1: 1.1, y0: 1.15, y1: 3.55 },
      { wall: 'E', x0: -0.8, x1: 0.8, y0: 1.5, y1: 2.95 },
    ];
    const holes = (w) => this.winDefs.filter((d) => d.wall === w);
    this.geo(this.mPlaster, wallGeo(south, holes('S'), WT), wallMatrix(v3(0, 0, Z1), v3(0, 0, 1)), wopt);
    this.geo(this.mPlaster, wallGeo([[X0 - WT, 0], [X1 + WT, 0], [X1 + WT, H + 0.35], [X0 - WT, H + 0.35]], [], WT), wallMatrix(v3(0, 0, Z0), v3(0, 0, -1)), wopt);
    const gable = [[Z0 - WT, 0], [Z1 + WT, 0], [Z1 + WT, H + 0.2], [0, RIDGE + 0.45], [Z0 - WT, H + 0.2]];
    this.geo(this.mPlaster, wallGeo(gable, holes('W'), WT), wallMatrix(v3(X0, 0, 0), v3(-1, 0, 0)), wopt);
    this.geo(this.mPlaster, wallGeo(gable, holes('E'), WT), wallMatrix(v3(X1, 0, 0), v3(1, 0, 0)), wopt);
    // Cloisons percées d'un large passage
    const OH = 3.25;
    const part = [[Z0, 0], [-OW, 0], [-OW, OH], [OW, OH], [OW, 0], [Z1, 0], [Z1, H + 0.15], [0, RIDGE + 0.3], [Z0, H + 0.15]];
    for (const sx of [-1, 1]) {
      this.geo(this.mPlaster, wallGeo(part, [], 0.3), wallMatrix(v3(sx * PX - 0.15, 0, 0), v3(1, 0, 0)), wopt);
      this.collider(sx * PX - 0.15, Z0, sx * PX + 0.15, -OW);
      this.collider(sx * PX - 0.15, OW, sx * PX + 0.15, Z1);
      // Encadrement de chêne du passage
      for (const sz of [-1, 1]) this.box(this.mBeam, 0.42, OH, 0.26, sx * PX, OH / 2, sz * (OW + 0.13), { tile: 1.2, ry: Math.PI / 2 });
      this.box(this.mBeam, 0.42, 0.32, OW * 2 + 0.52, sx * PX, OH + 0.16, 0, { tile: 1.2 });
    }
    // Lambris bas, plinthes et cimaises
    const segs = [
      ['x', Z1, X0, -PX - 0.15, -1], ['x', Z1, -PX + 0.15, -D - 0.14, -1], ['x', Z1, D + 0.14, PX - 0.15, -1], ['x', Z1, PX + 0.15, X1, -1],
      ['x', Z0, X0, -PX - 0.15, 1], ['x', Z0, -PX + 0.15, -1.9, 1], ['x', Z0, 1.9, PX - 0.15, 1], ['x', Z0, PX + 0.15, X1, 1],
      ['z', X0, Z0, Z1, 1], ['z', X1, Z0, Z1, -1],
      ['z', -PX - 0.15, Z0, -OW - 0.26, -1], ['z', -PX - 0.15, OW + 0.26, Z1, -1], ['z', -PX + 0.15, Z0, -OW - 0.26, 1], ['z', -PX + 0.15, OW + 0.26, Z1, 1],
      ['z', PX - 0.15, Z0, -OW - 0.26, -1], ['z', PX - 0.15, OW + 0.26, Z1, -1], ['z', PX + 0.15, Z0, -OW - 0.26, 1], ['z', PX + 0.15, OW + 0.26, Z1, 1],
    ];
    for (const [ax, c, a, b, n] of segs) {
      const len = b - a, mid = (a + b) / 2;
      const put = (mat, thick, h, y, o) => {
        if (ax === 'x') this.box(mat, len, h, thick, mid, y, c + n * thick / 2, o);
        else this.box(mat, thick, h, len, c + n * thick / 2, y, mid, o);
      };
      put(this.mPanel, 0.04, 1.03, 0.12 + 0.515, { uv: 'world', su: 0.9, sv: 1.03, ou: a, ov: 0.12 });
      put(this.mBeam, 0.065, 0.13, 0.065, { tile: 1.5 });
      put(this.mBeam, 0.075, 0.06, 1.17, { tile: 1.5 });
    }
    // Pans de bois : poteaux, sablières
    for (const x of TRUSS) {
      for (const z of [Z0 + 0.07, Z1 - 0.07]) this.box(this.mBeam, 0.26, H - 1.2, 0.14, x, (H + 1.2) / 2, z, { tile: 1.2 });
    }
    for (const z of [Z0 + 0.11, Z1 - 0.11]) this.box(this.mBeam, X1 - X0, 0.32, 0.22, 0, H - 0.16, z, { tile: 1.2 });
    // Fermes de charpente
    const rl = Math.hypot(Z1, RIDGE - H);
    for (const x of TRUSS) {
      this.box(this.mBeam, 0.26, 0.34, Z1 - Z0, x, H - 0.17, 0, { tile: 1.2 });
      this.box(this.mBeam, 0.22, RIDGE - H, 0.22, x, (H + RIDGE) / 2, 0, { tile: 1.2 });
      for (const s of [-1, 1]) {
        // Arbalétrier (sous le voligeage)
        const cy = (H + RIDGE) / 2 - 0.13 * Math.cos(ALPHA), cz = s * Z1 / 2 - s * 0.13 * Math.sin(ALPHA);
        this.box(this.mBeam, 0.24, 0.26, rl, x, cy, cz, { tile: 1.2, rx: s * ALPHA });
        // Jambes de force (du poinçon vers les arbalétriers)
        const ay = H + 0.9, bz = s * 2.9, by = roofY(bz) - 0.3;
        const len = Math.hypot(bz, by - ay);
        this.box(this.mBeam, 0.18, 0.18, len, x, (ay + by) / 2, bz / 2, { tile: 1.2, rx: Math.atan2(-(by - ay), bz) });
      }
    }
    // Pannes, faîtage et voligeage
    for (const k of [1 / 3, 2 / 3]) {
      for (const s of [-1, 1]) {
        const z = s * Z1 * k;
        const y = roofY(z) - 0.1 * Math.cos(ALPHA);
        this.box(this.mBeam, X1 - X0, 0.2, 0.18, 0, y, z - s * 0.1 * Math.sin(ALPHA), { tile: 1.2, rx: s * ALPHA });
      }
    }
    this.box(this.mBeam, X1 - X0, 0.3, 0.26, 0, RIDGE - 0.15, 0, { tile: 1.2 });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(X1 - X0 + 1, rl + 0.4);
      this.geo(this.mCeil, g, at(0, (H + RIDGE) / 2, s * Z1 / 2, 0, Math.PI / 2 + s * ALPHA), { uv: 'world', su: 2.4 });
    }
    // Limites du bâtiment
    this.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
  }

  // Fenêtres : dormant, petits bois, vitrage lumineux (vue sur le domaine), appui de pierre
  buildWindows() {
    const ext = this.exteriorTexture();
    for (const w of this.winDefs) {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2, ww = w.x1 - w.x0, hh = w.y1 - w.y0;
      let m, out;
      if (w.wall === 'S') { m = wallMatrix(v3(0, 0, Z1), v3(0, 0, 1)); out = v3(0, 0, 1); }
      else if (w.wall === 'W') { m = wallMatrix(v3(X0, 0, 0), v3(-1, 0, 0)); out = v3(-1, 0, 0); }
      else { m = wallMatrix(v3(X1, 0, 0), v3(1, 0, 0)); out = v3(1, 0, 0); }
      const L = (x, y, z) => new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(x, y, z));
      const fz = WT * 0.62, fd = 0.09, fw = 0.075;
      const add = (mat, gw, gh, gd, x, y, z, o = {}) => { const g = boxGeo(gw, gh, gd, 1.2); this.sb.add(mat, g, L(x, y, z), o); g.dispose(); };
      add(this.mBeam, ww, fw, fd, cx, w.y0 + fw / 2, fz);
      add(this.mBeam, ww, fw, fd, cx, w.y1 - fw / 2, fz);
      add(this.mBeam, fw, hh, fd, w.x0 + fw / 2, cy, fz);
      add(this.mBeam, fw, hh, fd, w.x1 - fw / 2, cy, fz);
      add(this.mBeam, 0.045, hh, 0.06, cx, cy, fz);
      const rows = Math.round(hh / 0.55);
      for (let k = 1; k < rows; k++) add(this.mBeam, ww, 0.035, 0.05, cx, w.y0 + (hh * k) / rows, fz);
      // Appui intérieur
      add(this.mStone, ww + 0.16, 0.06, WT * 0.6 + 0.08, cx, w.y0 - 0.03, WT * 0.3 - 0.04, { tile: 1.4 });
      // Vitrage (ne projette pas d'ombre : le soleil entre)
      const bright = w.wall === 'W' ? 3.4 : w.wall === 'S' ? 2.6 : 1.5;
      const mat = new THREE.MeshBasicMaterial({ map: ext, color: new THREE.Color(bright, bright * 0.96, bright * 0.9), fog: false });
      this.owned.push(mat);
      // La face visible regarde l'intérieur (z local négatif)
      const pg = new THREE.PlaneGeometry(ww - 0.02, hh - 0.02).rotateY(Math.PI).translate(cx, cy, fz + 0.03).applyMatrix4(m);
      const pane = new THREE.Mesh(pg, mat);
      this.root.add(pane);
      this.owned.push(pg);
      const inner = new THREE.Vector3(cx, cy, 0).applyMatrix4(m);
      this.windows.push({ def: w, center: inner, out, m, ww, hh, cx, cy });
    }
  }

  exteriorTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#b9cde0');
    sky.addColorStop(0.42, '#f0e2c4');
    sky.addColorStop(0.56, '#f6dcae');
    sky.addColorStop(0.62, '#7d8a5c');
    sky.addColorStop(1, '#a9a46a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 512);
    // Lisière lointaine floue
    g.filter = 'blur(6px)';
    g.fillStyle = 'rgba(60,72,52,0.75)';
    g.beginPath();
    g.moveTo(0, 330);
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, 300 - Math.abs(Math.sin(x * 0.07)) * 34 - Math.random() * 18);
    g.lineTo(256, 340);
    g.lineTo(0, 340);
    g.fill();
    g.fillStyle = 'rgba(40,50,36,0.8)';
    g.beginPath();
    g.moveTo(0, 360);
    for (let x = 0; x <= 256; x += 6) g.lineTo(x, 330 - Math.abs(Math.sin(x * 0.11 + 2)) * 40 - Math.random() * 14);
    g.lineTo(256, 370);
    g.lineTo(0, 370);
    g.fill();
    g.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.owned.push(t);
    return t;
  }

  buildDoor() {
    const z = Z1 + WT * 0.6;
    for (const s of [-1, 1]) {
      this.box(this.mDark, 0.93, 2.4, 0.07, s * 0.475, 1.2, z, { tile: 0.8 });
      for (const k of [0, 1, 2, 3]) this.box(this.mBeam, 0.9, 0.012, 0.075, s * 0.475, 0.3 + k * 0.6, z - 0.002, { tile: 0.8 });
      for (const y of [0.45, 1.95]) this.box(this.mIron, 0.62, 0.05, 0.012, s * (0.95 - 0.33), y, z - 0.042);
      const ring = new THREE.TorusGeometry(0.055, 0.009, 8, 20);
      this.geo(this.mIron, ring, at(s * 0.12, 1.05, z - 0.06));
    }
    const sh = new THREE.Shape();
    sh.moveTo(-0.95, 0);
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI - (k / 16) * Math.PI;
      sh.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.35);
    }
    sh.lineTo(-0.95, 0);
    this.geo(this.mDark, new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false }), at(0, 2.4, z - 0.035));
    this.items.push({ id: 'door', pos: v3(0, 1.4, Z1 - 0.2), r: 3.2, cone: 0.45, label: 'Sortir chasser : préparer la sortie', run: () => this.app.ui.openExpedition() });
    // Trompe de chasse au-dessus de la porte
    const pts = [];
    for (let k = 0; k <= 160; k++) {
      const t = k / 160;
      const a = t * Math.PI * 2 * 2.5;
      const r = 0.24 + 0.02 * Math.sin(t * 9);
      pts.push(v3(Math.cos(a) * r, Math.sin(a) * r * 0.92, 0.04 * Math.sin(a * 0.5)));
    }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.011, 8, false);
    this.geo(this.mBrass, coil, at(0, 3.35, Z1 - 0.08));
    const bell = new THREE.LatheGeometry([0.012, 0.014, 0.02, 0.03, 0.05, 0.08, 0.115].map((r, i) => new THREE.Vector2(r, i * 0.035)), 24);
    this.geo(this.mBrass, bell, at(0.24, 3.35, Z1 - 0.12, 0, 0, -Math.PI / 2));
  }

  // ------------------------------------------------------------------ cheminée et feu
  buildFireplace() {
    const zf = -5.75, depth = -Z0 + zf;
    this.geo(this.mStone, wallGeo([[-1.9, 0], [1.9, 0], [1.9, 5.3], [-1.9, 5.3]], [{ x0: -0.85, x1: 0.85, y0: 0.3, y1: 1.52, arch: 0.3 }], depth),
      wallMatrix(v3(0, 0, zf), v3(0, 0, -1)), { uv: 'world', su: 1.4 });
    // Foyer noirci
    const soot = (g, m) => this.geo(this.mSoot, g, m);
    soot(new THREE.PlaneGeometry(1.7, 1.25), at(0, 0.9, Z0 + 0.12));
    for (const s of [-1, 1]) soot(new THREE.PlaneGeometry(0.75, 1.25).rotateY(-s * Math.PI / 2), at(s * 0.84, 0.9, zf - 0.38));
    soot(new THREE.PlaneGeometry(1.7, 0.75).rotateX(Math.PI / 2), at(0, 1.35, zf - 0.38));
    this.geo(this.mAsh, new THREE.PlaneGeometry(1.68, 0.74).rotateX(-Math.PI / 2), at(0, 0.305, zf - 0.38));
    // Manteau, corbeaux, âtre
    this.box(this.mBeam, 4.1, 0.24, 0.44, 0, 1.74, zf + 0.14, { tile: 1.2 });
    for (const s of [-1, 1]) this.box(this.mStone, 0.28, 0.3, 0.3, s * 1.62, 1.47, zf + 0.12, { tile: 1.4 });
    this.box(this.mStone, 4.6, 0.07, 0.95, 0, 0.035, zf + 0.475, { uv: 'world', su: 1.4 });
    this.collider(-2.3, Z0, 2.3, zf + 0.95);
    // Chenets et bûches
    for (const s of [-1, 1]) {
      this.geo(this.mIron, new THREE.CylinderGeometry(0.022, 0.026, 0.36, 10), at(s * 0.42, 0.48, zf - 0.08));
      this.geo(this.mIron, new THREE.SphereGeometry(0.042, 14, 10), at(s * 0.42, 0.68, zf - 0.08));
      this.box(this.mIron, 0.035, 0.035, 0.55, s * 0.42, 0.36, zf - 0.35);
    }
    const logs = [[-0.02, 0.4, -6.05, 0.09, 0.82, 0.06], [0.05, 0.41, -6.27, 0.085, 0.86, -0.08], [0.0, 0.54, -6.16, 0.075, 0.78, 0.25], [-0.25, 0.36, -5.93, 0.05, 0.5, 0.6]];
    for (const [x, y, z, r, l, a] of logs) this.geo(this.mBark, new THREE.CylinderGeometry(r, r * 1.08, l, 14, 1).rotateZ(Math.PI / 2), at(x, y, z, a));
    // Lit de braises (animé)
    this.uFire = { uTime: GU.uTime, uGain: { value: 3.2 } };
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.6).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uTime: GU.uTime }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: BED_FRAG,
    }));
    bed.position.set(0, 0.31, -6.14);
    this.root.add(bed);
    this.owned.push(bed.geometry, bed.material);
    // Flammes (billboards) + bougies des lustres ajoutées plus tard
    this.flames = [];
    const fl = [[-0.18, 0.42, -6.12, 0.42, 0.62], [0.12, 0.43, -6.18, 0.5, 0.78], [0.0, 0.5, -6.1, 0.36, 0.55], [0.28, 0.4, -6.08, 0.3, 0.45], [-0.32, 0.38, -6.0, 0.26, 0.38], [0.02, 0.4, -6.25, 0.55, 0.9]];
    for (const [x, y, z, w, h] of fl) this.flames.push([x, y, z, w, h, Math.random()]);
    // Escarbilles
    const n = 70, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.7;
      pos[i * 3 + 1] = 0.45;
      pos[i * 3 + 2] = -6.15 + (Math.random() - 0.5) * 0.3;
      seed[i] = Math.random();
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    eg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uEmber = { uTime: GU.uTime, uPx: { value: 800 } };
    const em = new THREE.Points(eg, new THREE.ShaderMaterial({ uniforms: this.uEmber, vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    em.frustumCulled = false;
    this.root.add(em);
    this.owned.push(eg, em.material);
    this.firePos = v3(0, 0.78, -5.98);
  }

  // ------------------------------------------------------------------ mobilier de la grande salle
  buildHallFurniture() {
    // Tapis devant le feu
    this.geo(this.mRug, new THREE.PlaneGeometry(3.7, 2.7).rotateX(-Math.PI / 2), at(0, 0.006, -3.45), { cast: false });
    // Fauteuils club
    for (const s of [-1, 1]) this.clubChair(s * 1.3, -3.25, s * 0.5 + Math.PI);
    // Table basse
    this.box(this.mDark, 0.95, 0.05, 0.6, 0, 0.46, -3.1, { tile: 1 });
    for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) this.box(this.mDark, 0.05, 0.44, 0.05, x, 0.22, -3.1 + z);
    this.collider(-0.5, -3.4, 0.5, -2.8);
    // Bibliothèques de part et d'autre de la cheminée
    for (const s of [-1, 1]) this.bookcase(s * 3.5, Z0 + 0.21);
    // Panier à bois
    this.box(this.mDark, 0.6, 0.35, 0.45, 2.45, 0.175, -5.35, { tile: 1 });
    for (let k = 0; k < 7; k++) this.geo(this.mBark, new THREE.CylinderGeometry(0.05, 0.055, 0.55, 10).rotateZ(Math.PI / 2), at(2.45, 0.3 + (k % 3) * 0.08 + Math.floor(k / 3) * 0.03, -5.48 + (k % 3) * 0.12, Math.random() * 0.2 - 0.1));
    this.collider(2.1, -5.6, 2.8, -5.1);
    // Pupitre du carnet et registre du domaine (cloison ouest, côté salle)
    const lx = -PX + 0.9;
    this.box(this.mDark, 0.12, 1.0, 0.12, lx, 0.5, 4.3);
    this.box(this.mDark, 0.42, 0.04, 0.42, lx, 0.02, 4.3);
    this.box(this.mDark, 0.5, 0.04, 0.62, lx, 1.07, 4.3, { rz: -0.32 });
    for (const s of [-1, 1]) this.box(this.mPaper, 0.36, 0.012, 0.27, lx - 0.01, 1.1, 4.3 + s * 0.14, { rz: -0.32 });
    this.collider(lx - 0.3, 4.0, lx + 0.3, 4.6);
    this.items.push({ id: 'journal', pos: v3(lx, 1.15, 4.3), r: 3.0, cone: 0.35, label: 'Carnet du chasseur : zones vitales, règles, barèmes', run: () => this.app.ui.openJournal() });
    // Registre (tableau dessiné, mis à jour à chaque visite)
    this.regCanvas = document.createElement('canvas');
    this.regCanvas.width = 640;
    this.regCanvas.height = 460;
    this.regTex = new THREE.CanvasTexture(this.regCanvas);
    this.regTex.colorSpace = THREE.SRGBColorSpace;
    this.regTex.anisotropy = 4;
    const regMat = new THREE.MeshStandardMaterial({ map: this.regTex, roughness: 0.85 });
    this.owned.push(this.regTex, regMat);
    const reg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.93), regMat);
    reg.position.set(-PX + 0.2, 2.0, 4.3);
    reg.rotation.y = Math.PI / 2;
    this.root.add(reg);
    this.owned.push(reg.geometry);
    this.box(this.mBeam, 0.05, 1.05, 1.42, -PX + 0.165, 2.0, 4.3, { tile: 1 });
    // Portemanteau près de la porte
    this.box(this.mDark, 0.07, 1.85, 0.07, 1.55, 0.925, Z1 - 0.35);
    this.box(this.mDark, 0.5, 0.03, 0.5, 1.55, 0.015, Z1 - 0.35);
    for (let k = 0; k < 4; k++) this.box(this.mDark, 0.2, 0.025, 0.025, 1.55 + Math.cos(k * 1.57) * 0.08, 1.75, Z1 - 0.35 + Math.sin(k * 1.57) * 0.08, { ry: k * 1.57 });
    this.geo(this.mFelt, new THREE.CylinderGeometry(0.11, 0.12, 0.13, 20), at(1.62, 1.86, Z1 - 0.35, 0, 0.2));
    this.geo(this.mFelt, new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), at(1.62, 1.8, Z1 - 0.35, 0, 0.2));
    this.collider(1.3, Z1 - 0.6, 1.8, Z1);
    // Enseignes au-dessus des passages
    this.sign('Salle des trophées', v3(-PX + 0.17, 3.86, 0), Math.PI / 2, 1.9, 0.36);
    this.sign('Armurerie · Vestiaire', v3(PX - 0.17, 3.86, 0), -Math.PI / 2, 1.9, 0.36);
    this.sign('Grande salle', v3(-PX - 0.17, 3.86, 0), -Math.PI / 2, 1.5, 0.3);
    this.sign('Grande salle', v3(PX + 0.17, 3.86, 0), Math.PI / 2, 1.5, 0.3);
  }

  sign(text, pos, ry, w, h, sub = '') {
    const tex = carvedSign(text, 1024, Math.round((1024 * h) / w), sub);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1 });
    this.owned.push(tex, mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(pos);
    m.rotation.y = ry;
    m.receiveShadow = true;
    this.root.add(m);
    this.owned.push(m.geometry);
    const back = boxGeo(w + 0.06, h + 0.06, 0.04, 1);
    const mm = new THREE.Matrix4().compose(pos.clone().add(v3(0, 0, -0.025).applyAxisAngle(v3(0, 1, 0), ry)), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), ry), v3(1, 1, 1));
    this.sb.add(this.mBeam, back, mm);
    back.dispose();
  }

  clubChair(x, z, ry) {
    const g = new THREE.Group();
    const L = this.mLeather;
    const rb = (w, h, d, px, py, pz, r = 0.06) => {
      const m = new THREE.Mesh(new RoundedBox(w, h, d, r), L);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    rb(0.86, 0.36, 0.84, 0, 0.26, 0, 0.08);
    rb(0.62, 0.14, 0.66, 0, 0.5, 0.05, 0.06);
    rb(0.86, 0.5, 0.2, 0, 0.62, -0.34, 0.09).rotation.x = -0.12;
    for (const s of [-1, 1]) rb(0.17, 0.3, 0.84, s * 0.36, 0.55, 0, 0.08);
    for (const [fx, fz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 10), this.mDark);
      f.position.set(fx, 0.04, fz);
      g.add(f);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.sb.addObject(g);
    g.traverse((o) => o.geometry && o.geometry.dispose());
    this.collider(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }

  bookcase(x, z) {
    const W = 2.3, Hh = 2.5, Dd = 0.42;
    const m = this.mDark;
    this.box(m, 0.05, Hh, Dd, x - W / 2, Hh / 2, z, { tile: 1.5 });
    this.box(m, 0.05, Hh, Dd, x + W / 2, Hh / 2, z, { tile: 1.5 });
    this.box(m, W + 0.1, 0.08, Dd + 0.04, x, Hh, z, { tile: 1.5 });
    this.box(m, W, Hh, 0.02, x, Hh / 2, z - Dd / 2 + 0.01, { tile: 1.5 });
    const shelves = [0.1, 0.56, 1.02, 1.48, 1.94];
    for (const y of shelves) this.box(m, W, 0.035, Dd, x, y, z, { tile: 1.5 });
    this.collider(x - W / 2 - 0.05, Z0, x + W / 2 + 0.05, z + Dd / 2);
    // Livres (instances colorées)
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const max = 260;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const inst = new THREE.InstancedMesh(geo, mat, max);
    const cols = ['#5b1e16', '#2c3b26', '#1f2a3d', '#6b4a22', '#3a2a1e', '#7a6a50', '#4d1a2a', '#26302c', '#8a7350', '#2a2420'].map((c) => new THREE.Color(c));
    const r = rng(Math.round(x * 100 + 7));
    let n = 0;
    const mtx = new THREE.Matrix4();
    for (const y of shelves) {
      let px = x - W / 2 + 0.06;
      while (px < x + W / 2 - 0.08 && n < max) {
        if (r() < 0.06) { px += 0.12 + r() * 0.2; continue; }
        const t = 0.025 + r() * 0.045, hgt = 0.24 + r() * 0.17, dep = 0.17 + r() * 0.12;
        const lean = r() < 0.08 ? (r() - 0.5) * 0.4 : 0;
        mtx.compose(v3(px + t / 2, y + 0.018, z + Dd / 2 - dep / 2 - 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean)), v3(t, hgt, dep));
        inst.setMatrixAt(n, mtx);
        inst.setColorAt(n, cols[Math.floor(r() * cols.length)].clone().multiplyScalar(0.7 + r() * 0.5));
        n++;
        px += t + 0.002;
      }
    }
    inst.count = n;
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.root.add(inst);
    this.owned.push(geo, mat);
  }

  // ------------------------------------------------------------------ lustres en bois de cerf
  buildChandeliers() {
    this.lamps = [];
    const spots = [[0, RIDGE - 0.3, 3.35, 1.3], [-9.8, H - 0.34, 3.25, 0], [9.8, H - 0.34, 3.25, 0]];
    const t = makeTrophy('cerf', 777, 0.55, 0.65);
    const ag = buildTrophyGeometry(t, SPECIES.cerf, 0.85);
    const b = SPECIES.cerf.antlerBase;
    ag.translate(0, -b[1] * 0.85, -b[2] * 0.85 + 0.12);
    for (const [x, yTop, yRing, z] of spots) {
      // Chaîne
      const n = Math.max(2, Math.floor((yTop - yRing - 0.35) / 0.075));
      for (let k = 0; k < n; k++) this.geo(this.mIron, new THREE.TorusGeometry(0.028, 0.006, 6, 12), at(x, yTop - k * 0.075, z, k % 2 ? Math.PI / 2 : 0));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const top = v3(x, yRing + 0.36, z), rim = v3(x + Math.cos(a) * 0.5, yRing, z + Math.sin(a) * 0.5);
        const len = top.distanceTo(rim);
        const mid = top.clone().add(rim).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), top.clone().sub(rim).normalize());
        this.geo(this.mIron, new THREE.CylinderGeometry(0.006, 0.006, len, 6), new THREE.Matrix4().compose(mid, q, v3(1, 1, 1)));
      }
      this.geo(this.mIron, new THREE.TorusGeometry(0.5, 0.022, 8, 48).rotateX(Math.PI / 2), at(x, yRing, z));
      this.geo(this.mIron, new THREE.SphereGeometry(0.07, 14, 10), at(x, yRing + 0.02, z));
      for (let k = 0; k < 3; k++) {
        const g = ag.clone();
        this.geo(this.mAntler, g, at(x, yRing + 0.02, z, (k / 3) * Math.PI * 2 + 0.3));
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cx = x + Math.cos(a) * 0.5, cz = z + Math.sin(a) * 0.5;
        this.geo(this.mBrass, new THREE.CylinderGeometry(0.03, 0.02, 0.03, 12), at(cx, yRing + 0.035, cz));
        this.geo(this.mCandle, new THREE.CylinderGeometry(0.014, 0.015, 0.16, 10), at(cx, yRing + 0.13, cz), { cast: false });
        this.flames.push([cx, yRing + 0.205, cz, 0.032, 0.07, Math.random()]);
      }
      this.lamps.push(v3(x, yRing + 0.1, z));
    }
    ag.dispose();
  }

  // ------------------------------------------------------------------ table des cartes (maquette du domaine)
  buildMapTable() {
    const cx = 0, cz = 1.3, top = 0.92;
    const TW = 2.55;
    this.box(this.mDark, TW, 0.07, TW, cx, top - 0.035, cz, { tile: 1.5 });
    for (const s of [-1, 1]) {
      this.box(this.mDark, TW - 0.2, 0.14, 0.05, cx, top - 0.14, cz + s * (TW / 2 - 0.12), { tile: 1.5 });
      this.box(this.mDark, 0.05, 0.14, TW - 0.2, cx + s * (TW / 2 - 0.12), top - 0.14, cz, { tile: 1.5 });
    }
    const leg = new THREE.LatheGeometry([[0.07, 0], [0.075, 0.05], [0.055, 0.1], [0.06, 0.3], [0.085, 0.38], [0.055, 0.46], [0.05, 0.62], [0.07, 0.7], [0.07, 0.79], [0.0, 0.79]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.geo(this.mDark, leg.clone(), at(cx + x * (TW / 2 - 0.14), 0.06, cz + z * (TW / 2 - 0.14)));
    leg.dispose();
    this.collider(cx - TW / 2, cz - TW / 2, cx + TW / 2, cz + TW / 2);
    // Relief : hauteurs brutes du domaine (fonction continue, sans générer la carte complète)
    const N = 129, half = WORLD.half;
    const ctx = { noise: makeNoise(WORLD.seed), noise2: makeNoise(WORLD.seed + 77) };
    const Hh = new Float32Array(N * N), F = new Float32Array(N * N);
    const cell = (half * 2) / (N - 1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) Hh[j * N + i] = ReserveMap.prototype.rawHeight.call(ctx, -half + i * cell, -half + j * cell);
    let hmax = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hx = Hh[j * N + Math.min(N - 1, i + 1)] - Hh[j * N + Math.max(0, i - 1)];
      const hz = Hh[Math.min(N - 1, j + 1) * N + i] - Hh[Math.max(0, j - 1) * N + i];
      F[k] = ReserveMap.prototype.rawForest.call(ctx, -half + i * cell, -half + j * cell, Hh[k], Math.hypot(hx, hz) / (2 * cell));
      hmax = Math.max(hmax, Hh[k]);
    }
    const MW = 2.15, base = top + 0.02;
    const vs = 0.3 / (hmax - 98);
    const g = new THREE.PlaneGeometry(MW, MW, N - 1, N - 1).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const i = k % N, j = Math.floor(k / N);
      const edge = i === 0 || j === 0 || i === N - 1 || j === N - 1;
      p.setY(k, edge ? 0.004 : Math.max(0.004, (Hh[j * N + i] - 98) * vs));
    }
    g.computeVertexNormals();
    const tex = this.paintMap(Hh, F, N);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 });
    this.owned.push(tex, mat);
    const relief = new THREE.Mesh(g, mat);
    relief.position.set(cx, base, cz);
    relief.castShadow = true;
    relief.receiveShadow = true;
    this.root.add(relief);
    this.owned.push(g);
    // Plan d'eau (étang et marais)
    const wy = (100 - 98) * vs + 0.0015;
    const toM = (wx) => (wx / (half * 2)) * MW;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(toM(400), toM(360)).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x3d5a63, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.8, clearcoat: 1 }));
    water.position.set(cx + toM(-430), base + wy, cz + toM(130));
    this.root.add(water);
    this.owned.push(water.geometry, water.material);
    // Cadre de la maquette
    for (const s of [-1, 1]) {
      this.box(this.mBeam, MW + 0.12, 0.08, 0.06, cx, base + 0.02, cz + s * (MW / 2 + 0.03), { tile: 1 });
      this.box(this.mBeam, 0.06, 0.08, MW + 0.12, cx + s * (MW / 2 + 0.03), base + 0.02, cz, { tile: 1 });
    }
    // Repères en relief : miradors (fanions), hutte, pavillon
    const hAt = (wx, wz) => {
      const fi = clamp((wx + half) / cell, 0, N - 1.001), fj = clamp((wz + half) / cell, 0, N - 1.001);
      const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
      const a = Hh[j * N + i], b2 = Hh[j * N + i + 1], c = Hh[(j + 1) * N + i], d = Hh[(j + 1) * N + i + 1];
      return (lerp(lerp(a, b2, tx), lerp(c, d, tx), tz) - 98) * vs;
    };
    const red = new THREE.MeshStandardMaterial({ color: 0xa8231a, roughness: 0.6 });
    this.owned.push(red);
    for (const s of STANDS) {
      const x = cx + toM(s.x), z = cz + toM(s.z), y = base + hAt(s.x, s.z);
      this.geo(this.mIron, new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 6), at(x, y + 0.035, z));
      const flag = new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0.035, -0.01, 0), v3(0, -0.022, 0)]);
      flag.computeVertexNormals();
      const fm = new THREE.Mesh(flag, red);
      fm.position.set(x, y + 0.07, z);
      fm.material.side = THREE.DoubleSide;
      this.root.add(fm);
      this.owned.push(flag);
    }
    const house = (wx, wz, w, h, d, ry) => {
      const x = cx + toM(wx), z = cz + toM(wz), y = base + hAt(wx, wz);
      this.box(this.mPaper, w, h, d, x, y + h / 2, z, { ry });
      this.geo(red, new THREE.CylinderGeometry(0.001, w * 0.62, h * 0.8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, d / w), at(x, y + h + h * 0.4, z, ry));
    };
    house(PLACES.lodge.x, PLACES.lodge.z, 0.04, 0.018, 0.02, 0);
    house(PLACES.hut.x, PLACES.hut.z, 0.016, 0.01, 0.012, PLACES.hut.yaw);
    this.items.push({ id: 'table', pos: v3(cx, top + 0.1, cz), r: 3.6, cone: 0.7, prio: -0.05, label: 'Table des cartes : préparer la sortie (grand gibier ou gibier d\'eau)', run: () => this.app.ui.openExpedition() });
  }

  // Carte peinte du domaine (texture de la maquette)
  paintMap(Hh, F, N) {
    const S = 1024, P = 512, half = WORLD.half;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const low = document.createElement('canvas');
    low.width = low.height = P;
    const lg = low.getContext('2d');
    const img = lg.createImageData(P, P);
    const samp = (arr, fx, fz) => {
      const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz));
      const tx = fx - i, tz = fz - j;
      return lerp(lerp(arr[j * N + i], arr[j * N + i + 1], tx), lerp(arr[(j + 1) * N + i], arr[(j + 1) * N + i + 1], tx), tz);
    };
    const mk = PLACES.marsh;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const fx = (x / (P - 1)) * (N - 1), fz = (y / (P - 1)) * (N - 1);
      const h = samp(Hh, fx, fz), f = samp(F, fx, fz);
      const hx = samp(Hh, Math.min(N - 1, fx + 0.5), fz) - samp(Hh, Math.max(0, fx - 0.5), fz);
      const hz = samp(Hh, fx, Math.min(N - 1, fz + 0.5)) - samp(Hh, fx, Math.max(0, fz - 0.5));
      const shade = clamp(0.92 - (hx * 0.9 + hz * 0.7) * 0.05, 0.55, 1.2);
      const wx = (x / (P - 1)) * half * 2 - half, wz = (y / (P - 1)) * half * 2 - half;
      let col = [196, 186, 132];
      col = mixc(col, [168, 172, 104], smoothstep(105, 112, h) * 0.6);
      const md = Math.hypot((wx - mk.x) / mk.rx, (wz - mk.z) / mk.rz);
      if (md < 1.15) col = mixc(col, [150, 146, 96], smoothstep(1.15, 0.8, md));
      if (f > 0.25) col = mixc(col, wx > 150 ? [112, 96, 54] : [70, 86, 56], smoothstep(0.25, 0.55, f));
      if (h > 260) col = mixc(col, [150, 142, 128], smoothstep(260, 320, h));
      if (h > 390) col = mixc(col, [236, 234, 226], smoothstep(390, 420, h));
      if (h < 100.1) col = mixc([80, 112, 120], [110, 138, 140], smoothstep(97, 100.1, h));
      const contour = h > 100.2 && Math.abs(((h + 5) % 10) - 5) < 0.45 ? (Math.abs(((h + 25) % 50) - 25) < 0.6 ? 0.72 : 0.85) : 1;
      const o = (y * P + x) * 4;
      img.data[o] = col[0] * shade * contour;
      img.data[o + 1] = col[1] * shade * contour;
      img.data[o + 2] = col[2] * shade * contour;
      img.data[o + 3] = 255;
    }
    lg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(low, 0, 0, S, S);
    // Grain du papier
    g.globalAlpha = 0.06;
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#3b2a12' : '#fff6d8';
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    g.globalAlpha = 1;
    const toPx = (wx, wz) => [((wx + half) / (half * 2)) * S, ((wz + half) / (half * 2)) * S];
    // Chemins
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of PATHS) {
      g.strokeStyle = p.gravel ? 'rgba(232,214,170,0.95)' : 'rgba(110,74,36,0.85)';
      g.lineWidth = p.gravel ? 4 : 2.2;
      g.setLineDash(p.gravel ? [] : [7, 5]);
      g.beginPath();
      p.pts.forEach(([x, z], i) => { const [px, pz] = toPx(x, z); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); });
      g.stroke();
    }
    g.setLineDash([]);
    // Lieux-dits
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = (txt, wx, wz, size, style = 'italic 600', color = 'rgba(40,30,18,0.9)') => {
      const [px, pz] = toPx(wx, wz);
      g.font = `${style} ${size}px "Cormorant Garamond", "Cormorant SC", Georgia, serif`;
      g.fillStyle = 'rgba(250,240,210,0.55)';
      g.fillText(txt, px + 1, pz + 1);
      g.fillStyle = color;
      g.fillText(txt, px, pz);
    };
    for (const k of ['lake', 'marsh', 'meadow', 'peak', 'beechwood', 'pinewood', 'refuge', 'wallow']) {
      const p = PLACES[k];
      label(p.name, p.x, p.z + (k === 'peak' ? 40 : 0), k === 'meadow' ? 30 : 22);
    }
    label('Pavillon', PLACES.lodge.x + 70, PLACES.lodge.z + 22, 22, '700');
    for (const s of STANDS) {
      const [px, pz] = toPx(s.x, s.z);
      g.fillStyle = '#a8231a';
      g.beginPath();
      g.moveTo(px, pz - 9); g.lineTo(px + 8, pz + 6); g.lineTo(px - 8, pz + 6); g.closePath();
      g.fill();
      label(s.name.replace('Mirador ', '').replace('Affût ', ''), s.x, s.z + 34, 18, '600', 'rgba(120,26,18,0.95)');
    }
    // Cartouche, rose des vents, échelle
    g.strokeStyle = 'rgba(60,40,18,0.85)';
    g.lineWidth = 10;
    g.strokeRect(5, 5, S - 10, S - 10);
    g.lineWidth = 2;
    g.strokeRect(18, 18, S - 36, S - 36);
    g.font = '700 34px "Cormorant SC", Georgia, serif';
    g.fillStyle = 'rgba(50,34,16,0.92)';
    g.fillText('Domaine de Hautevallée', S / 2, S - 48);
    const rx = S - 90, ry = 95;
    g.fillStyle = 'rgba(60,40,18,0.9)';
    g.beginPath(); g.moveTo(rx, ry - 46); g.lineTo(rx + 11, ry); g.lineTo(rx, ry + 46); g.lineTo(rx - 11, ry); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(rx - 46, ry); g.lineTo(rx, ry - 9); g.lineTo(rx + 46, ry); g.lineTo(rx, ry + 9); g.closePath(); g.fill();
    g.font = '700 26px "Cormorant SC", Georgia, serif';
    g.fillText('N', rx, ry - 62);
    const sc = (200 / (half * 2)) * S;
    g.fillRect(40, S - 92, sc, 5);
    g.font = '600 18px "Barlow Condensed", sans-serif';
    g.fillText('200 m', 40 + sc / 2, S - 108);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.engine.maxAniso;
    return t;
  }

  // ------------------------------------------------------------------ trophées
  async buildTrophies(progress) {
    const s = Save.get();
    const rank = (t) => MEDAL_RANK[t.medal] || 0;
    const big = s.trophies.filter((t) => SPECIES[t.species]).sort((a, b) => rank(b) - rank(a) || (b.score || 0) - (a.score || 0));
    const ducks = s.trophies.filter((t) => DUCKS.has(t.species)).sort((a, b) => rank(b) - rank(a) || (b.weight || 0) - (a.weight || 0));
    const atlas = new LabelAtlas(320, 80, 3);
    const plates = [];
    this.trophyAtlas = atlas;
    const jobs = [];
    // Le cerf du fondateur, au-dessus de la cheminée
    jobs.push(() => {
      const ind = { species: 'cerf', sex: 'm', fur: 'brun', scale: 1.06, trophy: makeTrophy('cerf', 1931, 0.92, 0.95), legendary: false };
      const r = shoulderMount(this.factory, ind, { lookYaw: 0.12, tilt: 0.12 });
      this.wallMount(r, v3(0, 2.62, -5.75), 0, atlas, plates, engrave('Cerf du fondateur', 'Forêt des Hêtres · 1931'), null);
    });
    // Socles : le plus beau trophée de chaque espèce, animal entier
    // [x, z, orientation, longueur, largeur] : les animaux regardent l'entrée, profil vers l'allée
    const plinths = {
      cerf: [-12.6, 0, Math.PI / 2, 2.75, 1.2], daim: [-10.1, -2.8, Math.PI / 2 + 0.3, 2.15, 1.0], sanglier: [-10.1, 2.8, Math.PI / 2 - 0.3, 1.95, 1.0],
      chevreuil: [-7.3, -2.8, Math.PI / 2 + 0.35, 1.55, 0.78], chamois: [-7.3, 2.8, Math.PI / 2 - 0.35, 1.6, 0.8],
    };
    const used = new Set();
    for (const sp in plinths) {
      const best = big.find((t) => t.species === sp && (t.sex === 'm' || sp === 'chamois'));
      if (best) used.add(best);
      jobs.push(() => this.plinth(sp, plinths[sp], best, atlas, plates));
    }
    // Murs : les trophées suivants en cape
    const rest = big.filter((t) => !used.has(t)).slice(0, 8);
    const wallX = [-6.75, -9.0, -11.25, -13.5];
    const slots = [...wallX.map((x) => [x, Z0, 0]), ...wallX.map((x) => [x, Z1, Math.PI])];
    rest.forEach((t, i) => {
      const [x, z, ry] = slots[i];
      jobs.push(() => {
        const ind = { species: t.species, sex: t.sex, fur: t.fur || SPECIES[t.species].furs[0].id, scale: t.scale || 1, trophy: t.trophy || null, legendary: t.legendary };
        const r = shoulderMount(this.factory, ind, { lookYaw: (i % 2 ? -1 : 1) * 0.12, tilt: 0.2 });
        const y = clamp(H - 0.35 - r.top, 1.9, 2.75);
        this.wallMount(r, v3(x, y, z + (ry ? -0.0 : 0.0)), ry, atlas, plates, this.trophyText(t), t);
      });
    });
    // Mur ouest : gibier d'eau en vol de part et d'autre de la fenêtre
    const dslots = [[-2.45, 2.85, 1], [2.45, 2.85, -1], [-3.75, 2.0, 1], [3.75, 2.0, -1], [-2.45, 1.55, 1], [2.45, 1.55, -1]];
    ducks.slice(0, 6).forEach((t, i) => jobs.push(() => this.duckMount(t, dslots[i], atlas, plates)));
    for (let k = 0; k < jobs.length; k++) {
      jobs[k]();
      progress(k / jobs.length);
      await nextFrame();
    }
    atlas.finish(this.engine.maxAniso);
    const pm = new THREE.MeshStandardMaterial({ map: atlas.texture, metalness: 0.6, roughness: 0.38 });
    this.owned.push(atlas.texture, pm);
    for (const p of plates) this.sb.add(pm, p.geo, p.m);
    for (const p of plates) p.geo.dispose();
  }

  trophyText(t) {
    const full = SPECIES[t.species] ? SPECIES[t.species].name : BIRD_NAMES[t.species] || t.species;
    const score = DUCKS.has(t.species) ? fmt.dec(t.weight, 2) + ' kg' : fmt.dec(t.score || 0, 1) + ' pts';
    return engrave(full, `${MEDAL_NAMES[t.medal] || ''} · ${score} · ${new Date(t.date || Date.now()).toLocaleDateString('fr-FR')}`);
  }

  // Écusson + tête en cape + plaque + médaille
  wallMount(r, pos, ry, atlas, plates, draw, t) {
    const W = at(pos.x, pos.y, pos.z, ry);
    const shW = Math.max(0.42, r.cut.w * 1.3 + 0.1), shH = Math.max(0.5, r.cut.h * 1.22 + 0.16);
    const thick = 0.05;
    const sg = shieldGeometry(shW, shH, thick);
    this.sb.add(this.mShield, sg, W.clone().multiply(at(0, -0.04 * shH, thick)));
    sg.dispose();
    const mm = W.clone().multiply(at(0, 0, thick - 0.012));
    this.sb.add(r.mat, r.body, mm);
    r.body.dispose();
    for (const q of r.parts) { this.sb.add(q.antler ? this.mAntler : q.mat, q.geo, mm); q.geo.dispose(); }
    // Plaque gravée
    const cell = atlas.cell(draw);
    const pg = atlas.plate(0.28, 0.07, 0.008, cell);
    plates.push({ geo: pg, m: W.clone().multiply(at(0, -shH * 0.43, thick + 0.002)) });
    if (t && t.medal && t.medal !== 'aucune') this.medal(W.clone().multiply(at(shW * 0.3, -shH * 0.3, thick + 0.004)), t.medal);
    const head = v3(0, r.top * 0.45, r.depth * 0.6).applyMatrix4(W);
    const label = t ? `${SPECIES[t.species].name} · ${MEDAL_NAMES[t.medal]} · ${fmt.dec(t.score || 0, 1)} pts — voir tous vos trophées` : 'Cerf du fondateur (1931) — la salle des trophées est à gauche';
    this.items.push({ id: 'mount', pos: head, r: 5.5, cone: 0.16, label, run: () => this.app.ui.openTrophies() });
  }

  medal(m, medal) {
    const mat = new THREE.MeshStandardMaterial({ color: MEDAL_COLORS[medal] || 0xcccccc, metalness: medal === 'diamant' ? 0.4 : 1, roughness: medal === 'diamant' ? 0.08 : 0.28, emissive: medal === 'diamant' ? 0x1a3a44 : 0x000000 });
    this.owned.push(mat);
    const disc = new THREE.CylinderGeometry(0.034, 0.034, 0.008, 24).rotateX(Math.PI / 2);
    this.sb.add(mat, disc, m);
    disc.dispose();
    const rib = new THREE.MeshStandardMaterial({ color: { bronze: 0x6a3a1a, argent: 0x2a3a6a, or: 0x8a1a1a, diamant: 0x1a4a6a, legendaire: 0x4a1a6a }[medal] || 0x333333, roughness: 0.8 });
    this.owned.push(rib);
    for (const s of [-1, 1]) {
      const b = boxGeo(0.024, 0.07, 0.004, 1);
      this.sb.add(rib, b, m.clone().multiply(at(s * 0.016, -0.05, -0.002, 0, 0, s * 0.25)));
      b.dispose();
    }
  }

  plinth(sp, [x, z, yaw, len, wid], t, atlas, plates) {
    const ph = 0.32;
    const W = at(x, 0, z, yaw);
    const put = (mat, w, h, d, lx, ly, lz, o = {}) => {
      const g = boxGeo(w, h, d, o.tile || 1.2);
      this.sb.add(mat, g, W.clone().multiply(at(lx, ly, lz)));
      g.dispose();
    };
    put(this.mDark, wid, ph - 0.03, len, 0, (ph - 0.03) / 2, 0);
    put(this.mBeam, wid + 0.06, 0.04, len + 0.06, 0, 0.02, 0);
    put(this.mBeam, wid + 0.03, 0.025, len + 0.03, 0, ph - 0.04, 0);
    const top = new THREE.PlaneGeometry(wid - 0.02, len - 0.02).rotateX(-Math.PI / 2);
    this.sb.add(this.mLitter, top, W.clone().multiply(at(0, ph - 0.026, 0)), { uv: 'world', su: 1.2 });
    top.dispose();
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c) * wid / 2 + Math.abs(s) * len / 2, ez = Math.abs(s) * wid / 2 + Math.abs(c) * len / 2;
    this.collider(x - ex, z - ez, x + ex, z + ez);
    const spec = SPECIES[sp];
    // Plaque : sur le flanc qui regarde l'allée centrale (ou devant le museau pour le socle du fond)
    let pm;
    if (Math.abs(z) < 0.1) pm = W.clone().multiply(at(0, 0.16, len / 2 + 0.006));
    else {
      const nWorld = (lx) => v3(lx, 0, 0).applyAxisAngle(v3(0, 1, 0), yaw);
      const towards = v3(0, 0, -Math.sign(z));
      const lx = nWorld(1).dot(towards) > 0 ? 1 : -1;
      pm = W.clone().multiply(at(lx * (wid / 2 + 0.006), 0.16, 0, lx * Math.PI / 2));
    }
    const cell = atlas.cell(t ? this.trophyText(t) : engrave(spec.name, 'Réservé à votre plus beau trophée'));
    plates.push({ geo: atlas.plate(0.34, 0.085, 0.008, cell), m: pm });
    if (!t) return;
    const ind = { species: t.species, sex: t.sex, fur: t.fur || spec.furs[0].id, scale: t.scale || 1, trophy: t.trophy || null, legendary: t.legendary };
    const r = fullMount(this.factory, ind, { alert: true, lookYaw: Math.abs(z) < 0.1 ? 0.2 : (z < 0 ? -0.45 : 0.45) });
    const m = W.clone().multiply(at(0, ph - 0.03, 0));
    this.sb.add(r.mat, r.body, m);
    r.body.dispose();
    for (const q of r.parts) { this.sb.add(q.antler ? this.mAntler : q.mat, q.geo, m); q.geo.dispose(); }
    if (t.medal && t.medal !== 'aucune') this.medal(pm.clone().multiply(at(0.22, 0, 0.004)), t.medal);
    this.items.push({ id: 'mount', pos: v3(x, 1.0 * (t.scale || 1), z), r: 5.5, cone: 0.2, label: `${spec.name} · ${MEDAL_NAMES[t.medal]} · ${fmt.dec(t.score || 0, 1)} pts — voir tous vos trophées`, run: () => this.app.ui.openTrophies() });
  }

  duckMount(t, [dz, y, dir], atlas, plates) {
    const W = at(X0, y, dz, Math.PI / 2);
    const bm = birdMount(t.species, t.sex, dir);
    const ov = ovalGeometry(0.34, 0.24, 0.03);
    this.sb.add(this.mShield, ov, W.clone().multiply(at(0, -0.05, 0.03)));
    ov.dispose();
    const dowel = boxGeo(0.025, 0.025, 0.3, 1);
    this.sb.add(this.mDark, dowel, W.clone().multiply(at(0, 0, 0.15)));
    dowel.dispose();
    this.sb.add(this.mBird, bm.geo, W);
    bm.geo.dispose();
    const cell = atlas.cell(this.trophyText(t));
    plates.push({ geo: atlas.plate(0.24, 0.06, 0.006, cell), m: W.clone().multiply(at(0, -0.15, 0.032)) });
    if (t.medal && t.medal !== 'aucune') this.medal(W.clone().multiply(at(0.13, -0.1, 0.034)), t.medal);
    this.items.push({ id: 'mount', pos: v3(X0 + 0.4, y + 0.1, dz), r: 5, cone: 0.14, label: `${BIRD_NAMES[t.species] || t.species} · ${MEDAL_NAMES[t.medal]} · ${fmt.dec(t.weight, 2)} kg`, run: () => this.app.ui.openTrophies() });
  }

  // ------------------------------------------------------------------ armurerie (mobilier fixe)
  buildArmoryStatic() {
    const m = this.mDark;
    // Râteliers (carabines puis fusils) contre le mur nord
    for (const [a, b, name] of [[5.45, 9.45, 'Carabines'], [9.95, 13.1, 'Fusils']]) {
      const w = b - a, cx = (a + b) / 2;
      this.box(m, w, 0.86, 0.5, cx, 0.43, Z0 + 0.25, { tile: 1.5 });
      for (let k = 0; k < Math.round(w / 0.8); k++) {
        const dx = a + (k + 0.5) * (w / Math.round(w / 0.8));
        this.box(this.mBeam, w / Math.round(w / 0.8) - 0.06, 0.3, 0.02, dx, 0.5, Z0 + 0.505, { tile: 1 });
        this.box(this.mBrass, 0.08, 0.02, 0.02, dx, 0.66, Z0 + 0.52);
      }
      for (const x of [a, b]) this.box(m, 0.05, 2.45, 0.52, x, 1.225, Z0 + 0.26, { tile: 1.5 });
      this.box(m, w + 0.14, 0.12, 0.58, cx, 2.5, Z0 + 0.29, { tile: 1.5 });
      this.box(this.mBeam, w, 0.05, 0.1, cx, 1.93, Z0 + 0.12, { tile: 1 });
      this.collider(a, Z0, b, Z0 + 0.6);
      this.sign(name, v3(cx, 2.86, Z0 + 0.06), 0, 1.3, 0.28);
      this.items.push({ id: 'rack', pos: v3(cx, 1.4, Z0 + 0.3), r: 4.2, cone: 0.42, prio: 0.3, label: `Râtelier des ${name.toLowerCase()} : acheter, équiper`, run: () => this.app.ui.openShop(name === 'Fusils' ? 'shotgun' : 'rifle') });
    }
    // Vitrine des récompenses
    const vx = 9.8, vz = -2.9;
    this.box(m, 2.6, 0.8, 1.0, vx, 0.4, vz, { tile: 1.5 });
    this.geo(this.mVelvet, new THREE.PlaneGeometry(2.5, 0.9).rotateX(-Math.PI / 2), at(vx, 0.802, vz), { cast: false });
    for (const [gw, gh, gd, x, y, z] of [[2.6, 0.3, 0.01, vx, 0.95, vz + 0.5], [2.6, 0.3, 0.01, vx, 0.95, vz - 0.5], [0.01, 0.3, 1.0, vx + 1.3, 0.95, vz], [0.01, 0.3, 1.0, vx - 1.3, 0.95, vz], [2.6, 0.01, 1.0, vx, 1.1, vz]]) {
      this.box(this.mGlass, gw, gh, gd, x, y, z, { cast: false });
    }
    for (const [x, z] of [[-1.3, -0.5], [1.3, -0.5], [-1.3, 0.5], [1.3, 0.5]]) this.box(this.mBrass, 0.02, 0.32, 0.02, vx + x, 0.95, vz + z);
    this.collider(vx - 1.3, vz - 0.5, vx + 1.3, vz + 0.5);
    this.items.push({ id: 'case', pos: v3(vx, 0.95, vz), r: 3.4, cone: 0.5, label: 'Vitrine des récompenses : armes exclusives gagnées par vos trophées', run: () => this.app.ui.openShop('rifle') });
    // Comptoir : munitions, optiques, équipement
    const cx = 9.8, cz = 2.6;
    this.box(m, 2.8, 0.92, 0.7, cx, 0.46, cz, { tile: 1.5 });
    this.box(this.mBeam, 2.92, 0.05, 0.8, cx, 0.945, cz, { tile: 1.2 });
    this.collider(cx - 1.46, cz - 0.4, cx + 1.46, cz + 0.4);
    const boxes = [['#8a1f17', 0.16], ['#1f5a2a', 0.16], ['#1f3a7a', 0.12], ['#c2551a', 0.12], ['#6a6a6a', 0.14]];
    boxes.forEach(([col, w], i) => {
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
      this.owned.push(mat);
      for (let k = 0; k < 2; k++) this.box(mat, w, 0.06, 0.09, cx - 1.2 + i * 0.22, 0.997 + k * 0.061, cz - 0.1 + (k ? 0.01 : 0), { ry: (k - 0.5) * 0.1 });
    });
    for (let k = 0; k < 6; k++) this.geo(this.mBrass, new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10), at(cx - 0.05 + k * 0.025, 1.005, cz + 0.18));
    // Jumelles
    for (const s of [-1, 1]) this.geo(this.mIron, new THREE.CylinderGeometry(0.025, 0.028, 0.15, 16).rotateX(Math.PI / 2), at(cx + 0.55 + s * 0.035, 1.0, cz));
    this.box(this.mIron, 0.04, 0.02, 0.05, cx + 0.55, 1.01, cz - 0.02);
    // Appeaux
    this.geo(this.mDark, new THREE.CylinderGeometry(0.018, 0.024, 0.14, 12).rotateZ(Math.PI / 2), at(cx + 0.95, 0.99, cz - 0.1, 0.3));
    this.geo(this.mBrass, new THREE.CylinderGeometry(0.01, 0.035, 0.22, 16).rotateZ(Math.PI / 2), at(cx + 1.0, 1.0, cz + 0.15, -0.2));
    this.items.push({ id: 'counter', pos: v3(cx, 1.05, cz), r: 3.6, cone: 0.5, label: 'Comptoir : munitions, optiques, jumelles, appeaux, chien', run: () => this.app.ui.openShop('ammo') });
    // Établi (finitions, lunettes) sous la fenêtre est
    const bx = X1 - 0.43;
    this.box(this.mBeam, 0.86, 0.08, 3.0, bx, 0.88, 0, { tile: 1.2 });
    for (const [dx, dz] of [[-0.36, -1.4], [0.36, -1.4], [-0.36, 1.4], [0.36, 1.4]]) this.box(this.mBeam, 0.08, 0.84, 0.08, bx + dx, 0.42, dz, { tile: 1.2 });
    this.box(this.mBeam, 0.8, 0.04, 2.9, bx, 0.25, 0, { tile: 1.2 });
    this.box(this.mIron, 0.18, 0.12, 0.14, bx - 0.25, 0.98, 1.15);
    this.box(this.mIron, 0.04, 0.04, 0.2, bx - 0.25, 1.0, 1.32);
    // Outils
    this.box(this.mDark, 0.03, 0.03, 0.28, bx - 0.2, 0.935, -1.05, { ry: 0.3 });
    this.box(this.mIron, 0.03, 0.06, 0.1, bx - 0.15, 0.95, -0.92, { ry: 0.3 });
    for (let k = 0; k < 3; k++) this.geo(this.mIron, new THREE.CylinderGeometry(0.005, 0.005, 0.2, 8).rotateX(Math.PI / 2), at(bx - 0.05, 0.93, -1.25 + k * 0.05, 0.1 * k));
    this.collider(X1 - 0.9, -1.5, X1, 1.5);
    this.items.push({ id: 'bench', pos: v3(bx, 1.05, 0), r: 3.4, cone: 0.5, label: 'Établi : finitions d\'armes et lunettes', run: () => this.app.ui.openShop('skin') });
    // Socles des mannequins (vestiaire, mur sud)
    for (let i = 0; i < OUTFITS.length; i++) this.geo(this.mDark, new THREE.CylinderGeometry(0.24, 0.26, 0.05, 28), at(5.95 + i * 1.1, 0.025, 5.95));
    this.collider(5.6, 5.6, 14.0, Z1);
    this.sign('Vestiaire', v3(11.9, 3.0, Z1 - 0.06), Math.PI, 1.4, 0.3);
    this.items.push({ id: 'wardrobe', pos: v3(9.8, 1.4, 5.95), r: 4.6, cone: 0.55, prio: 0.3, label: 'Vestiaire : tenues de chasse et camouflages', run: () => this.app.ui.openShop('outfit') });
  }

  // ------------------------------------------------------------------ présentoirs (selon la progression)
  buildDisplays() {
    if (this.displayGroup) {
      this.root.remove(this.displayGroup);
      this.displayGroup.traverse((o) => o.geometry && o.geometry.dispose());
      for (const r of this.displayOwned || []) r.dispose();
    }
    const D = new Batcher();
    const atlas = new LabelAtlas(320, 80, 3);
    const plates = [];
    this.displayItems = [];
    this.displayOwned = [];
    const s = Save.get();
    const status = (it, key = it.id) => {
      const st = Save.itemStatus(it, key);
      if (st === 'owned') return 'Possédé' + (s.loadout.rifle === key || s.loadout.shotgun === key || s.loadout.outfit === key ? ' · équipé' : '');
      if (st === 'buy') return fmt.money(it.price || 0);
      if (st === 'level') return `Niveau ${it.level} · ${fmt.money(it.price || 0)}`;
      if (st === 'reward') return 'Récompense à récupérer !';
      return 'À gagner : ' + (it.unlock ? it.unlock.text : 'trophée d\'exception');
    };
    const gunSkin = (def) => {
      const owned = Save.owns(def.id);
      const sk = owned ? SKINS.find((k) => k.id === (s.skins[def.id] || 'std')) || {} : {};
      const optic = def.kind === 'rifle' && OPTICS[def.optic]?.kind === 'scope' ? (owned && s.scopes[def.id]) || def.optic : def.optic;
      return { wood: sk.wood, metal: sk.metal, engraved: sk.engraved, optic };
    };
    const placeGun = (def, matrix) => {
      const built = this.app.guns.build(def, gunSkin(def));
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(matrix);
      holder.add(built.group);
      D.addObject(holder);
      built.group.traverse((o) => o.geometry && o.geometry.dispose());
      return built;
    };
    // Debout dans les râteliers : profil vers la salle
    const stand = new THREE.Matrix4().makeBasis(v3(0, 0, 1), v3(-1, 0, 0), v3(0, -1, 0));
    const rack = (list, x0) => list.forEach((def, i) => {
      const x = x0 + i * 0.47, z = Z0 + 0.3;
      placeGun(def, stand.clone().setPosition(x, 1.236, z));
      const st = status(def);
      plates.push({ geo: atlas.plate(0.42, 0.085, 0.008, atlas.cell(engrave(def.short, st))), m: at(x, 0.74, Z0 + 0.515) });
      this.displayItems.push({ id: 'gun', pos: v3(x, 1.45, z), r: 3.4, cone: 0.075, label: `${def.name} — ${st}`, run: () => this.app.ui.openShop(def.kind) });
    });
    rack(WEAPONS.filter((w) => w.kind === 'rifle' && !w.exclusive), 5.82);
    rack(WEAPONS.filter((w) => w.kind === 'shotgun' && !w.exclusive), 10.32);
    // Vitrine : couchées sur le velours
    const flat = new THREE.Matrix4().makeBasis(v3(0, 1, 0), v3(0, 0, -1), v3(-1, 0, 0));
    WEAPONS.filter((w) => w.exclusive).forEach((def, i) => {
      const z = -3.2 + i * 0.3;
      placeGun(def, flat.clone().setPosition(9.8 - 0.22, 0.835, z));
      const st = status(def);
      const pm = at(9.8 - 0.85, 0.806, z + 0.02, 0, -Math.PI / 2);
      plates.push({ geo: atlas.plate(0.3, 0.075, 0.006, atlas.cell(engrave(def.short, st))), m: pm });
      this.displayItems.push({ id: 'gun', pos: v3(9.8, 0.9, z), r: 3, cone: 0.09, label: `${def.name} — ${st}`, run: () => this.app.ui.openShop(def.kind) });
    });
    // Établi : la carabine emportée, avec sa finition et sa lunette
    const rdef = WEAPONS.find((w) => w.id === s.loadout.rifle);
    if (rdef) {
      placeGun(rdef, at(X1 - 0.5, 1.08, 0.1));
      for (const dz of [-0.25, 0.3]) this.box(this.mDark, 0.12, 0.08, 0.05, X1 - 0.5, 0.96, dz, { batch: D });
    }
    // Mannequins habillés
    OUTFITS.forEach((o, i) => {
      const x = 5.95 + i * 1.1, z = 5.95;
      this.mannequin(D, o, x, z);
      const st = status(o);
      plates.push({ geo: atlas.plate(0.36, 0.08, 0.008, atlas.cell(engrave(o.name.replace('Camouflage ', 'Camo. '), st))), m: at(x, 0.12, z - 0.3, Math.PI, -0.9) });
      this.displayItems.push({ id: 'outfit', pos: v3(x, 1.25, z), r: 3.6, cone: 0.12, label: `${o.name} — ${st}`, run: () => this.app.ui.openShop('outfit') });
    });
    atlas.finish(this.engine.maxAniso);
    const pm = new THREE.MeshStandardMaterial({ map: atlas.texture, metalness: 0.6, roughness: 0.38 });
    for (const p of plates) { D.add(pm, p.geo, p.m); p.geo.dispose(); }
    this.displayGroup = new THREE.Group();
    D.build(this.displayGroup, 'display');
    this.root.add(this.displayGroup);
    this.displayOwned.push(atlas.texture, pm);
    this.drawRegister();
    this.shadowDirty = true;
  }

  mannequin(D, o, x, z) {
    const fab = this.app.guns.fabric(o);
    const g = new THREE.Group();
    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      m.scale.set(sx, sy, sz);
      g.add(m);
      return m;
    };
    // Jambes, bottes
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.075, 0.62, 4, 12), fab, s * 0.1, 0.5, 0, 0, 0, s * 0.03);
      add(new RoundedBox(0.12, 0.16, 0.27, 0.04), this.mBoot, s * 0.1, 0.13, 0.04);
    }
    // Veste (profil tourné)
    const jacket = new THREE.LatheGeometry([[0.0, 0.84], [0.19, 0.84], [0.2, 0.95], [0.19, 1.12], [0.215, 1.28], [0.2, 1.4], [0.13, 1.47], [0.06, 1.5], [0.0, 1.5]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    add(jacket, fab, 0, 0, 0, 0, 0, 0, 1.08, 1, 0.72);
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.058, 0.5, 4, 10), fab, s * 0.255, 1.13, 0.01, 0, 0, s * 0.1);
      add(new THREE.SphereGeometry(0.045, 10, 8), this.mManne, s * 0.285, 0.82, 0.02);
    }
    // Col, cou, tête
    add(new THREE.TorusGeometry(0.075, 0.03, 8, 16), fab, 0, 1.5, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12), this.mManne, 0, 1.55, 0);
    add(new THREE.SphereGeometry(0.1, 20, 14), this.mManne, 0, 1.68, 0.01, 0, 0, 0, 0.85, 1.1, 0.95);
    // Coiffe selon la tenue
    const hat = o.pattern;
    if (hat === 'loden' || hat === 'tweed') {
      add(new THREE.CylinderGeometry(0.075, 0.095, 0.1, 18), hat === 'tweed' ? fab : this.mFelt, 0, 1.8, 0.0);
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 22), hat === 'tweed' ? fab : this.mFelt, 0, 1.755, 0.0, 0.05);
    } else if (hat === 'orange' || hat === 'leaves' || hat === 'reeds' || hat === 'veneur') {
      add(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat === 'veneur' ? this.mBoot : fab, 0, 1.73, 0.0, 0, 0, 0, 1, 0.9, 1.05);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.008, 16, 1, false, 0, Math.PI), hat === 'veneur' ? this.mBoot : fab, 0, 1.735, 0.08, 0.2, -Math.PI / 2);
    } else if (hat === 'rock') {
      add(new THREE.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), fab, 0, 1.7, 0.0);
    } else if (hat === 'ghillie') {
      add(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), fab, 0, 1.68, -0.01, 0, 0, 0, 1, 1.05, 1.05);
      const r = rng(31);
      const strand = new THREE.BoxGeometry(0.012, 0.11, 0.004);
      for (let k = 0; k < 140; k++) {
        const y = 0.5 + r() * 1.25;
        const a = r() * Math.PI * 2;
        const rad = y > 1.5 ? 0.12 : y > 0.84 ? 0.2 : 0.17;
        add(strand, fab, Math.cos(a) * rad * (y > 0.84 ? 1.08 : 1), y, Math.sin(a) * rad * 0.75, r() - 0.5, a, r() - 0.5);
      }
    }
    g.position.set(x, 0.05, z);
    g.rotation.y = Math.PI;
    D.addObject(g);
    const seen = new Set();
    g.traverse((m) => { if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); } });
  }

  // Registre du domaine : progression du chasseur
  drawRegister() {
    const c = this.regCanvas;
    if (!c) return;
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    const s = Save.get();
    const lp = Save.levelProgress();
    g.fillStyle = '#e9dcc0';
    g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(110,80,40,0.35)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1c0e';
    g.textAlign = 'center';
    g.font = '700 40px "Cormorant SC", Georgia, serif';
    g.fillText('Registre du domaine', w / 2, 58);
    g.fillRect(w / 2 - 150, 74, 300, 2);
    g.textAlign = 'left';
    const counts = { bronze: 0, argent: 0, or: 0, diamant: 0, legendaire: 0 };
    for (const t of s.trophies) if (counts[t.medal] !== undefined) counts[t.medal]++;
    const next = [...WEAPONS, ...OUTFITS].find((it) => it.unlock && !Save.owns(it.id) && Save.itemStatus(it) !== 'reward');
    const lines = [
      ['Chasseur', `niveau ${lp.level} · ${lp.cur} / ${lp.need} XP`],
      ['Fonds', fmt.money(s.money)],
      ['Trophées', `${s.trophies.length} — or ${counts.or} · diamant ${counts.diamant}`],
      ['Tirs éthiques', `${s.stats.ethical} sur ${s.stats.ethical + s.stats.unethical}`],
      ['Plus long tir', s.stats.longest ? Math.round(s.stats.longest) + ' m' : '—'],
      ['À gagner', next ? `${next.name}` : 'Toutes les récompenses !'],
    ];
    lines.forEach(([k, v], i) => {
      const y = 128 + i * 52;
      g.font = 'italic 600 26px "Cormorant Garamond", Georgia, serif';
      g.fillStyle = '#5a3a1a';
      g.fillText(k, 46, y);
      g.font = '600 25px "Alegreya Sans", sans-serif';
      g.fillStyle = '#1f150a';
      let val = v;
      while (g.measureText(val).width > w - 270 && val.length > 4) val = val.slice(0, -2) + '…';
      g.fillText(val, 230, y);
    });
    if (next) {
      g.font = 'italic 20px "Alegreya Sans", sans-serif';
      g.fillStyle = '#6a4a2a';
      let txt = next.unlock.text;
      while (g.measureText(txt).width > w - 260 && txt.length > 4) txt = txt.slice(0, -2) + '…';
      g.fillText(txt, 230, 128 + 5 * 52 + 28);
    }
    this.regTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ lumières
  buildLights() {
    const q = this.engine.q;
    const sun = new THREE.DirectionalLight(0xffdcb8, 3.3);
    sun.position.copy(SUN).multiplyScalar(40);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.hi ? 2048 : 1024, this.hi ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 5, far: 90 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const fire = new THREE.PointLight(0xffa060, 20, 0, 2);
    fire.position.copy(this.firePos);
    fire.castShadow = q.shadowSize >= 1024;
    fire.shadow.mapSize.set(512, 512);
    fire.shadow.camera.near = 0.05;
    fire.shadow.camera.far = 30;
    fire.shadow.bias = -0.004;
    fire.shadow.normalBias = 0.02;
    this.scene.add(fire);
    this.fire = fire;
    this.lampLights = this.lamps.map((p, i) => {
      const l = new THREE.PointLight(0xffc690, LAMP[i], 0, 2);
      l.position.copy(p);
      this.scene.add(l);
      return l;
    });
    this.scene.add(new THREE.HemisphereLight(0xd2dcf0, 0x3a2a1c, 0.45));
    // Éclairage des râteliers et du vestiaire (qualité élevée)
    if (this.hi) {
      for (const [x, z, tz] of [[9.3, -4.3, Z0 + 0.3], [9.8, 4.3, Z1 - 0.5]]) {
        const sp = new THREE.SpotLight(0xffe2bc, 45, 0, 0.95, 0.6, 2);
        sp.position.set(x, 3.7, z);
        sp.target.position.set(x, 1.2, tz);
        this.scene.add(sp, sp.target);
      }
    }
    // Flammes (feu + bougies) : un seul maillage de panneaux orientés vers la caméra
    const n = this.flames.length;
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), ctr = new Float32Array(n * 12), size = new Float32Array(n * 12), idx = [];
    this.flames.forEach(([x, y, z, w, h, s], i) => {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      corners.forEach(([u, v], k) => {
        pos.set([x, y, z], (i * 4 + k) * 3);
        uv.set([u, v], (i * 4 + k) * 2);
        ctr.set([x, y, z], (i * 4 + k) * 3);
        size.set([w, h, s], (i * 4 + k) * 3);
      });
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    fg.setAttribute('aCenter', new THREE.BufferAttribute(ctr, 3));
    fg.setAttribute('aSize', new THREE.BufferAttribute(size, 3));
    fg.setIndex(idx);
    const fm = new THREE.ShaderMaterial({
      uniforms: this.uFire, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    const flames = new THREE.Mesh(fg, fm);
    flames.frustumCulled = false;
    flames.renderOrder = 5;
    this.root.add(flames);
    this.owned.push(fg, fm);
  }

  // Rais de lumière dans la poussière, depuis les fenêtres au soleil
  buildSunRays() {
    const L = SUN.clone().negate();
    const pos = [], ts = [], idx = [];
    for (const w of this.windows) {
      if (w.out.dot(SUN) <= 0.05) continue;
      const m = w.m;
      const cs = [[w.def.x0 + 0.06, w.def.y0 + 0.06], [w.def.x1 - 0.06, w.def.y0 + 0.06], [w.def.x1 - 0.06, w.def.y1 - 0.06], [w.def.x0 + 0.06, w.def.y1 - 0.06]]
        .map(([x, y]) => v3(x, y, WT * 0.6).applyMatrix4(m));
      const len = (w.def.y1 + 0.3) / -L.y;
      for (let e = 0; e < 4; e++) {
        const a = cs[e], b = cs[(e + 1) % 4];
        const base = pos.length / 3;
        for (const [p, t, s] of [[a, 0, 0], [b, 0, 1], [b.clone().addScaledVector(L, len), 1, 1], [a.clone().addScaledVector(L, len), 1, 0]]) {
          pos.push(p.x, p.y, p.z);
          ts.push(t, s);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTS', new THREE.Float32BufferAttribute(ts, 2));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: GU.uTime, uColor: { value: new THREE.Color(1.0, 0.78, 0.5).multiplyScalar(0.05) } },
      vertexShader: RAY_VERT, fragmentShader: RAY_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    const rays = new THREE.Mesh(g, mat);
    rays.frustumCulled = false;
    rays.renderOrder = 4;
    this.root.add(rays);
    this.owned.push(g, mat);
  }

  // Éclairage indirect : capture de la salle elle-même (une fois)
  captureEnv() {
    const r = this.engine.renderer;
    const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.1, 60, rt);
    cam.position.set(0, 1.9, 1.0);
    this.scene.add(cam);
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    cam.update(r, this.scene);
    r.toneMapping = tm;
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromCubemap(rt.texture);
    pm.dispose();
    rt.dispose();
    this.scene.remove(cam);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.6;
    this.shadowDirty = true;
  }

  // ------------------------------------------------------------------ monde (interface du chasseur)
  groundAt() { return 0; }

  collide(pos, r) {
    const b = this.bounds;
    pos.x = clamp(pos.x, b.x0 + r, b.x1 - r);
    pos.z = clamp(pos.z, b.z0 + r, b.z1 - r);
    for (const c of this.colliders) {
      const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-5) {
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        const ex = [c.x0 - r - pos.x, c.x1 + r - pos.x], ez = [c.z0 - r - pos.z, c.z1 + r - pos.z];
        const mx = Math.abs(ex[0]) < Math.abs(ex[1]) ? ex[0] : ex[1];
        const mz = Math.abs(ez[0]) < Math.abs(ez[1]) ? ez[0] : ez[1];
        if (Math.abs(mx) < Math.abs(mz)) pos.x += mx;
        else pos.z += mz;
      }
    }
  }

  refreshDisplays() { this.dirty = true; }

  pickItem() {
    const cam = this.camera;
    const dir = this._dir || (this._dir = new THREE.Vector3());
    dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const to = this._to || (this._to = new THREE.Vector3());
    let best = null, bestS = 1e9;
    for (const list of [this.items, this.displayItems]) {
      for (const it of list) {
        to.copy(it.pos).sub(cam.position);
        const d = to.length();
        if (d > it.r) continue;
        const ang = to.multiplyScalar(1 / Math.max(d, 1e-4)).angleTo(dir);
        const cone = (it.cone ?? 0.45) + Math.max(0, 0.6 - d) * 0.5;
        if (ang > cone) continue;
        const sc = ang / cone + (d / it.r) * 0.35 + (it.prio || 0);
        if (sc < bestS) { bestS = sc; best = it; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ boucle
  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    // Feu : scintillement de la lumière (ombres figées : position fixe)
    if (this.fire) {
      const t = this.t;
      const f = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.3) + 0.05 * Math.sin(t * 23.7);
      this.fire.intensity = 20 * f;
      this.lampLights.forEach((l, i) => (l.intensity = LAMP[i] * (0.96 + 0.04 * Math.sin(t * 9 + i * 2))));
    }
    if (this.uEmber) {
      const r = this.engine.renderer;
      this.uEmber.uPx.value = (r.domElement.height / 2) * this.camera.projectionMatrix.elements[5];
    }
    if (!audio.amb && audio.ready) audio.startAmbience('indoor');
    if (this.hud) this.hud.show(!this.paused);
    audio.ambience(dt, { indoor: true, fire: this.player && this.player.pos.distanceTo(this.firePos) < 9 });
    if (this.paused) return;
    if (this.dirty) {
      this.dirty = false;
      this.buildDisplays();
    }
    const input = this.app.input;
    const ctx = { ads: false, fov: this.camera.fov, weaponSway: 0.3, hasSticks: false, onStep: (surf, k) => audio.step('wood', k * 0.8) };
    this.player.update(dt, input, ctx);
    this.player.applyCamera(this.camera);
    this.camera.fov = Save.get().options.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    audio.updateListener(this.camera);
    const it = this.pickItem();
    this.prompt = it ? it.label : null;
    if (it && input.hit('interact')) {
      audio.ui();
      it.run();
      return;
    }
    if (input.hit('map')) return this.app.ui.openExpedition();
    if (input.hit('journal')) return this.app.ui.openJournal();
    if (input.hit('pause')) return this.app.ui.openLodgeMenu();
    const s = Save.get();
    this.hud.update(this.prompt, `Niveau ${Save.level()} · ${fmt.money(s.money)} · ${s.trophies.length} trophée${s.trophies.length > 1 ? 's' : ''}`);
    if (this.app.touch) this.app.touch.setAction(this.prompt ? shortLabel(this.prompt) : null);
  }

  render(r) {
    r.toneMappingExposure = this.exposure;
    if (this.shadowDirty) {
      r.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    r.render(this.scene, this.camera);
  }

  dispose() {
    const r = this.engine.renderer;
    r.shadowMap.autoUpdate = true;
    if (this.hud) this.hud.dispose();
    if (this.app.touch) this.app.touch.setAction(null);
    this.scene.traverse((o) => {
      if (o.geometry && (o.name === 'static' || o.name === 'display' || o.isInstancedMesh)) o.geometry.dispose();
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    for (const x of this.owned) if (x && x.dispose) x.dispose();
    for (const x of this.displayOwned || []) if (x && x.dispose) x.dispose();
    if (this.envRT) this.envRT.dispose();
    audio.stopAmbience();
  }
}

// Libellé court pour le bouton d'action tactile
function shortLabel(s) {
  const i = s.indexOf(' : ');
  const j = s.indexOf(' — ');
  const k = i > 0 && (j < 0 || i < j) ? i : j;
  return k > 0 ? s.slice(0, k) : s;
}

function mixc(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Pavé à arêtes arrondies (coussins, bottes)
class RoundedBox extends THREE.BufferGeometry {
  constructor(w, h, d, r = 0.05, seg = 3) {
    super();
    const g = new THREE.BoxGeometry(1, 1, 1, seg * 2, seg * 2, seg * 2);
    const p = g.attributes.position;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i) * w, p.getY(i) * h, p.getZ(i) * d);
      c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
      const n = v.clone().sub(c);
      if (n.lengthSq() > 1e-10) n.normalize().multiplyScalar(r);
      v.copy(c).add(n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    this.copy(g);
    g.dispose();
  }
}
