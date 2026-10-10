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

  // Crée la représentation 3D d'un individu
  create(ind) {
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
      const g = buildTrophyGeometry(ind.trophy, spec, 1);
      if (g) {
        trophyMesh = new THREE.Mesh(g, this.antlerMat);
        trophyMesh.position.set(-hw.x, -hw.y, -hw.z);
        trophyMesh.castShadow = true;
        head.add(trophyMesh);
      }
    }
    const animator = new Animator(sk, spec, ind.scale);
    return { holder, inner, lods, skeleton, bones: sk.byName, worldPos: sk.worldPos, animator, trophyMesh, spec };
  }

  setLod(vis, lod) {
    vis.lods.forEach((m, i) => (m.visible = i === lod));
  }
}
