// Fabrique d'animaux : géométries partagées (3 niveaux de détail), pelages, matériaux,
// squelette propre à chaque individu, yeux, bois/cornes/défenses.
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { buildRig, boneLayout, surfaceX } from './rig.js';
import { CoatPainter } from './coat.js';
import { buildTrophyGeometry, antlerMaterial } from './trophies.js';
import { Animator } from './animator.js';
import { injectGlobals } from '../gfx/globals.js';

const FUR_NORMAL = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  // Mèches de poils orientées le long de u
  float s = 0.0;
  for ( int i = 0; i < 4; i++ ) {
    float fi = float( i );
    vec2 q = vec2( uv.x * ( 6.0 + fi * 3.0 ), uv.y * ( 40.0 + fi * 25.0 ) );
    s += gn( q + fi * 7.3, vec2( 6.0 + fi * 3.0, 40.0 + fi * 25.0 ) ) * ( 0.5 / ( 1.0 + fi ) );
  }
  float clump = fbm( uv, 4.0, 3 );
  h = 0.5 + 0.5 * s + 0.2 * clump;
  alb = vec3( h ); rough = 1.0;
}`;

// Fourrure en coques : longueur des poils (m), densité (poils par 5 cm), crinière, crête dorsale
export const FUR = {
  cerf: { len: 0.017, dens: 13, mane: 2.6, crest: 0.4 },
  chevreuil: { len: 0.012, dens: 15, mane: 1.1, crest: 0.2 },
  sanglier: { len: 0.03, dens: 8, mane: 1.5, crest: 1.6 },
  chamois: { len: 0.022, dens: 12, mane: 1.4, crest: 1.3 },
  daim: { len: 0.012, dens: 14, mane: 1.5, crest: 0.2 },
};

const SHELL_VERT_PARS = /* glsl */ `
attribute float aRegion;
attribute float aCut;
attribute vec2 uv1;
uniform float uShell; uniform float uShellN; uniform float uFurLen; uniform float uMane; uniform float uCrest;
varying float vShell; varying vec2 vFurUv; varying float vLenK;
`;
// Gonflement le long de la normale ; les poils retombent (gravité dans le plan tangent)
const SHELL_VERT = /* glsl */ `
#ifdef USE_INSTANCING
  float shellK = ( float( gl_InstanceID ) + 1.0 ) / uShellN;
#else
  float shellK = uShell;
#endif
float lenK = aRegion < 0.75 ? mix( 1.0, uMane, smoothstep( 0.25, 0.7, aRegion ) )
  : aRegion < 1.5 ? mix( uMane, 0.4, smoothstep( 1.1, 1.45, aRegion ) )
  : aRegion < 2.5 ? 0.4 : aRegion < 3.5 ? 0.5 : aRegion < 4.5 ? 1.3 : 0.0;
lenK *= 1.0 - aCut;
vec3 nO = normalize( objectNormal );
lenK *= 1.0 + uCrest * smoothstep( 0.55, 0.95, nO.y ) * step( aRegion, 1.5 );
float hh = shellK * uFurLen * lenK;
vec3 grav = vec3( 0.0, -1.0, 0.0 );
vec3 comb = grav - nO * dot( grav, nO );
transformed += nO * hh + comb * hh * shellK * 0.9;
vShell = shellK; vFurUv = uv1; vLenK = lenK;
`;
const SHELL_FRAG_PARS = /* glsl */ `
uniform float uDens;
varying float vShell; varying vec2 vFurUv; varying float vLenK;
float fHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
`;
// Mèches : une par cellule, effilée vers la pointe ; racines plus sombres
const SHELL_FRAG = /* glsl */ `
{
  if ( vLenK < 0.01 ) discard;
  vec2 g = vFurUv * uDens;
  vec2 id = floor( g );
  vec2 f = fract( g );
  float rnd = fHash( id );
  vec2 c = vec2( fHash( id + 7.1 ), fHash( id + 3.7 ) ) * 0.56 + 0.22;
  float strandH = 0.3 + 0.7 * rnd;
  float rad = 0.5 * ( 1.0 - vShell / strandH );
  float d = length( f - c );
  float cov = vShell > strandH ? 0.0 : clamp( ( rad - d ) / max( fwidth( d ), 1e-4 ) + 0.5, 0.0, 1.0 );
  // De loin, les poils deviennent plus fins qu'un pixel : couverture moyenne (duvet) au lieu du motif
  float px = length( fwidth( g ) );
  float covStat = ( 1.0 - smoothstep( 0.25, 1.0, vShell ) ) * 0.7;
  cov = mix( cov, covStat, smoothstep( 0.5, 1.6, px ) );
  // Silhouettes vues en biais : les coques externes s'effacent (pas de voile autour du pelage)
  float ndv = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
  cov *= 1.0 - vShell * 0.85 * ( 1.0 - smoothstep( 0.08, 0.45, ndv ) );
  diffuseColor.a = cov;
  diffuseColor.rgb *= mix( 0.74, 1.06, vShell ) * mix( 0.9 + 0.2 * rnd, 1.0, smoothstep( 0.4, 1.4, px ) );
}
`;

// Soudure des normales aux coutures (même position => même normale)
function weldNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 2e4) + ',' + Math.round(p.getY(i) * 2e4) + ',' + Math.round(p.getZ(i) * 2e4);
    let e = map.get(k);
    if (!e) map.set(k, (e = { x: 0, y: 0, z: 0, ids: [] }));
    e.x += n.getX(i); e.y += n.getY(i); e.z += n.getZ(i);
    e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    const l = Math.hypot(e.x, e.y, e.z) || 1;
    for (const i of e.ids) n.setXYZ(i, e.x / l, e.y / l, e.z / l);
  }
  n.needsUpdate = true;
}

export class AnimalFactory {
  constructor(engine, texgen) {
    this.engine = engine;
    this.texgen = texgen;
    this.rigs = new Map();
    this.mats = new Map();
    this.painter = new CoatPainter(engine.renderer);
    this.furNormal = texgen.texture('furnormal', FUR_NORMAL, 512, { mode: 1, normalStrength: 1.6 });
    this.furNormal.channel = 1;
    this.furNormal.wrapS = this.furNormal.wrapT = THREE.RepeatWrapping;
    this.eyeGeo = new THREE.SphereGeometry(1, 14, 10);
    this.eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.eyeMatAlbino = new THREE.MeshPhysicalMaterial({ color: 0x8a2a2a, roughness: 0.1, clearcoat: 1 });
    this.antlerMat = antlerMaterial();
    this.texSize = engine.q.texSize >= 1024 ? 1024 : 512;
    this.shellMats = new Map();
    // Nombre de coques de fourrure selon la qualité (0 : pas de fourrure)
    const q = engine.q;
    this.shellN = !q.fur ? 0 : q.shadowSize >= 4096 ? 12 : q.shadowSize >= 2048 && q.post ? 10 : 6;
  }

  // Matériau d'une coque de fourrure (k : hauteur relative, ou null pour la version instanciée)
  shellMaterial(species, sex, fur, k, n) {
    const key = species + sex + fur + ':' + (k === null ? 'i' + n : k.toFixed(3));
    let m = this.shellMats.get(key);
    if (m) return m;
    const base = this.material(species, sex, fur);
    const F = FUR[species] || FUR.cerf;
    // Couverture par échantillons (anticrénelage actif) ou transparence stochastique : duvet sans tri
    const a2c = !!this.engine.q.antialias;
    m = new THREE.MeshStandardMaterial({ map: base.map, roughness: 0.95, alphaHash: !a2c, alphaToCoverage: a2c });
    const uni = {
      uShell: { value: k ?? 0 }, uShellN: { value: n }, uFurLen: { value: F.len }, uMane: { value: sex === 'm' ? F.mane : 1 + (F.mane - 1) * 0.3 },
      uCrest: { value: F.crest }, uDens: { value: F.dens },
    };
    m.onBeforeCompile = (s) => {
      injectGlobals(s);
      Object.assign(s.uniforms, uni);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\n' + SHELL_VERT_PARS)
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + SHELL_VERT);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SHELL_FRAG_PARS)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + SHELL_FRAG);
    };
    m.customProgramCacheKey = () => 'furshell' + (k === null ? 'i' : 's');
    m.userData.extraAttrs = ['uv1', 'aRegion', 'aCut'];
    this.shellMats.set(key, m);
    return m;
  }

  // Coques de fourrure d'un animal articulé (partagent le squelette)
  addShells(vis) {
    if (vis.shells || !this.shellN) return;
    const ind = vis.ind;
    vis.shells = [];
    for (let i = 1; i <= this.shellN; i++) {
      const m = new THREE.SkinnedMesh(vis.lods[0].geometry, this.shellMaterial(ind.species, ind.sex, ind.fur, i / this.shellN, this.shellN));
      m.bind(vis.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = true;
      m.visible = vis.lods[0].visible;
      vis.inner.add(m);
      vis.shells.push(m);
    }
  }

  // Coques instanciées pour un maillage figé (trophées du pavillon)
  staticShells(geometry, species, sex, fur, n = this.shellN) {
    if (!n) return null;
    const m = new THREE.InstancedMesh(geometry, this.shellMaterial(species, sex, fur, null, n), n);
    const id = new THREE.Matrix4();
    for (let i = 0; i < n; i++) m.setMatrixAt(i, id);
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }

  rig(species, sex, lod) {
    const k = species + sex + lod;
    let r = this.rigs.get(k);
    if (!r) {
      r = buildRig(SPECIES[species], sex, lod);
      weldNormals(r.geometry);
      this.rigs.set(k, r);
    }
    return r;
  }

  material(species, sex, fur) {
    const k = species + sex + fur;
    let m = this.mats.get(k);
    if (m) return m;
    const rig0 = this.rig(species, sex, 0);
    const map = this.painter.paint(species, sex, fur, rig0.geometry, 1, this.texSize);
    m = new THREE.MeshPhysicalMaterial({
      map, normalMap: this.furNormal, normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.92, metalness: 0, sheen: 0.7, sheenRoughness: 0.5, side: THREE.DoubleSide,
      sheenColor: new THREE.Color(0.55, 0.47, 0.38),
    });
    m.onBeforeCompile = (s) => {
      injectGlobals(s);
      s.fragmentShader = s.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat coatRough = sampledDiffuseColor.a;\ndiffuseColor.a = opacity;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.28, 0.95, smoothstep( 0.3, 0.9, coatRough ) );');
    };
    m.customProgramCacheKey = () => 'animal';
    m.userData.coat = { species, sex, fur };
    m.userData.extraAttrs = ['aRegion', 'aCut'];
    this.mats.set(k, m);
    return m;
  }

  // Squelette neuf pour un individu
  makeBones(spec) {
    const layout = boneLayout(spec);
    const bones = [];
    const byName = {};
    const wp = {};
    for (const [name, parent, p] of layout) {
      const b = new THREE.Bone();
      b.name = name;
      wp[name] = new THREE.Vector3(...p);
      if (parent) {
        b.position.copy(wp[name]).sub(wp[parent]);
        byName[parent].add(b);
      } else b.position.copy(wp[name]);
      byName[name] = b;
      bones.push(b);
    }
    return { bones, byName, worldPos: wp };
  }

  // Crée la représentation 3D d'un individu (detail : bois en haute définition, fourrure)
  create(ind, opts = {}) {
    const spec = SPECIES[ind.species];
    const holder = new THREE.Group();
    const inner = new THREE.Group(); // échelle de l'individu
    inner.scale.setScalar(ind.scale);
    holder.add(inner);
    const sk = this.makeBones(spec);
    inner.add(sk.byName.root);
    sk.byName.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(sk.bones);
    const mat = this.material(ind.species, ind.sex, ind.fur);
    const lods = [0, 1, 2].map((lod) => {
      const r = this.rig(ind.species, ind.sex, lod);
      const m = new THREE.SkinnedMesh(r.geometry, mat);
      m.castShadow = lod < 2;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.bind(skeleton, new THREE.Matrix4());
      m.visible = lod === 0;
      inner.add(m);
      return m;
    });
    // Yeux (enfants de l'os de la tête)
    const head = sk.byName.head;
    const hw = sk.worldPos.head;
    const E = spec.eye;
    if (spec._eyeX === undefined) spec._eyeX = surfaceX(spec, E.pos[2], E.pos[1]);
    for (const side of [1, -1]) {
      const e = new THREE.Mesh(this.eyeGeo, ind.fur === 'albinos' ? this.eyeMatAlbino : this.eyeMat);
      e.scale.set(E.r * 0.7, E.r * 0.95, E.r * 1.15);
      e.position.set((spec._eyeX - E.r * 0.35) * side - hw.x, E.pos[1] - hw.y, E.pos[2] - hw.z);
      head.add(e);
    }
    // Trophée
    let trophyMesh = null;
    if (ind.trophy && (ind.sex === 'm' || ind.species === 'chamois')) {
      const g = buildTrophyGeometry(ind.trophy, spec, 1, { detail: !!opts.detail });
      if (g) {
        trophyMesh = new THREE.Mesh(g, this.antlerMat);
        trophyMesh.position.set(-hw.x, -hw.y, -hw.z);
        trophyMesh.castShadow = true;
        head.add(trophyMesh);
      }
    }
    const animator = new Animator(sk, spec, ind.scale);
    const vis = { holder, inner, lods, skeleton, bones: sk.byName, worldPos: sk.worldPos, animator, trophyMesh, spec, ind, shells: null };
    if (opts.fur) this.addShells(vis);
    return vis;
  }

  // Niveau de détail ; la fourrure n'apparaît que de près (d en mètres)
  setLod(vis, lod, d = 0) {
    vis.lods.forEach((m, i) => (m.visible = i === lod));
    const fur = lod === 0 && d < 38;
    if (fur && !vis.shells) this.addShells(vis);
    if (vis.shells) for (const m of vis.shells) m.visible = fur;
  }

  // Libère ce qui est propre à l'individu (géométrie des bois, texture des os)
  release(vis) {
    if (vis.trophyMesh) vis.trophyMesh.geometry.dispose();
    vis.skeleton.dispose();
  }
}
