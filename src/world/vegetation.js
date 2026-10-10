// Placement et rendu des arbres et rochers du domaine (instanciation + niveaux de détail).
import * as THREE from 'three';
import { rng, clamp, smoothstep, nextFrame } from '../core/math.js';
import { SPECIES, buildTree, makeTreeMaterials, captureImpostors, makeImpostorMesh } from '../gfx/trees.js';
import { PLACES, pathDistance, STANDS } from './reserveMap.js';
import { makeRockGeometry, makeRockMaterial } from '../gfx/rocks.js';

const CELL = 32;
const VARIANTS = 2;

export class Vegetation {
  constructor(map, texgen, engine) {
    this.map = map;
    this.texgen = texgen;
    this.engine = engine;
    this.q = engine.q;
    this.group = new THREE.Group();
    this.species = Object.keys(SPECIES);
    this.colliders = []; // cercles {x, z, r}
    this._lastPos = new THREE.Vector3(1e9, 0, 0);
    this._t = 0;
  }

  // Essence selon le milieu
  pickSpecies(x, z, h, r) {
    const m = this.map;
    const lake = PLACES.lake;
    const nearWater = Math.hypot((x - lake.x) / (lake.rx * 1.5), (z - lake.z) / (lake.rz * 1.5)) < 1.25 || Math.hypot((x - PLACES.marsh.x) / 200, (z - PLACES.marsh.z) / 150) < 1;
    if (h > 230) return r() < 0.55 ? 'larch' : r() < 0.6 ? 'spruce' : 'pine';
    if (z < -230) return r() < 0.55 ? 'spruce' : r() < 0.6 ? 'larch' : 'beech';
    if (x < -200 && z < -40) return r() < 0.45 ? 'pine' : r() < 0.7 ? 'spruce' : 'birch';
    if (nearWater) return r() < 0.7 ? 'birch' : 'oak';
    if (x > 160) {
      const v = r();
      return v < 0.5 ? 'beech' : v < 0.8 ? 'oak' : v < 0.9 ? 'birch' : 'spruce';
    }
    const v = r();
    return v < 0.55 ? 'oak' : v < 0.75 ? 'beech' : v < 0.9 ? 'birch' : 'pine';
  }

  async build(progress = () => {}) {
    const m = this.map;
    const r = rng(4242);
    // --- Placement par grille perturbée (espacement ~6 m en forêt dense)
    const spacing = 6.2;
    const trees = [];
    const half = m.half - 20;
    for (let z = -half; z < half; z += spacing) {
      for (let x = -half; x < half; x += spacing) {
        const px = x + (r() - 0.5) * spacing * 0.9, pz = z + (r() - 0.5) * spacing * 0.9;
        const f = m.forestAt(px, pz);
        if (f < 0.04) continue;
        if (r() > f * f * 1.05 + 0.012) continue;
        const h = m.heightAt(px, pz);
        if (h < m.water + 0.35) continue;
        if (m.slopeAt(px, pz) > 0.85) continue;
        if (pathDistance(px, pz).d < 2.5) continue;
        if (STANDS.some((s) => Math.hypot(s.x - px, s.z - pz) < 5)) continue;
        const sp = this.pickSpecies(px, pz, h, r);
        trees.push({ x: px, z: pz, y: h, sp, v: r.int(0, VARIANTS - 1), yaw: r() * Math.PI * 2, s: 0.75 + r() * 0.45, tint: r() });
      }
    }
    // Arbres isolés remarquables dans le Grand Pré
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = 0.25 + r() * 0.6;
      const px = PLACES.meadow.x + Math.cos(a) * PLACES.meadow.rx * d, pz = PLACES.meadow.z + Math.sin(a) * PLACES.meadow.rz * d;
      if (pathDistance(px, pz).d < 6) continue;
      trees.push({ x: px, z: pz, y: m.heightAt(px, pz), sp: 'oak', v: r.int(0, 1), yaw: r() * 6.28, s: 1.1 + r() * 0.25, tint: r() });
    }
    this.trees = trees;
    progress(0.1);
    await nextFrame();

    // --- Géométries + matériaux
    this.mats = makeTreeMaterials(this.texgen, this.q.texSize, this.q.antialias);
    this.variants = [];
    const rowsInfo = [];
    let vi = 0;
    for (const name of this.species) {
      for (let v = 0; v < VARIANTS; v++) {
        const seed = 1000 + vi * 77;
        const l0 = buildTree(name, seed, 0);
        const l1 = buildTree(name, seed, 1);
        const sp = SPECIES[name];
        const variant = {
          name, v, row: vi, lods: [l0, l1],
          barkMat: this.mats['bark-' + sp.bark], leafMat: this.mats['leaf-' + sp.foliage], leafDepth: this.mats['leafdepth-' + sp.foliage],
          height: l0.height, radius: l0.radius, bark: l0.bark, leaves: l0.leaves,
        };
        this.variants.push(variant);
        rowsInfo.push(variant);
        vi++;
        progress(0.1 + 0.55 * (vi / (this.species.length * VARIANTS)));
        await nextFrame();
      }
    }
    // Compte par variante (capacité des instances)
    const counts = new Map();
    for (const t of trees) {
      const key = t.sp + t.v;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    this.instanced = new Map();
    for (const variant of this.variants) {
      const cap = Math.max(16, counts.get(variant.name + variant.v) || 0);
      const lodMeshes = variant.lods.map((l, lod) => {
        const capL = lod === 0 ? Math.min(cap, 220) : Math.min(cap, 1600);
        const bark = new THREE.InstancedMesh(l.bark, variant.barkMat, capL);
        const leaves = new THREE.InstancedMesh(l.leaves, variant.leafMat, capL);
        for (const mm of [bark, leaves]) {
          mm.count = 0;
          mm.frustumCulled = false;
          mm.castShadow = true;
          mm.receiveShadow = true;
          mm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.group.add(mm);
        }
        leaves.customDepthMaterial = variant.leafDepth;
        leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capL * 3), 3);
        leaves.instanceColor.setUsage(THREE.DynamicDrawUsage);
        return { bark, leaves, cap: capL };
      });
      this.instanced.set(variant.name + variant.v, lodMeshes);
    }
    // Imposteurs
    const fw = this.q.texSize >= 1024 ? 160 : 112, fh = this.q.texSize >= 1024 ? 256 : 176;
    this.atlas = captureImpostors(this.engine.renderer, this.variants, fw, fh);
    this.impostors = makeImpostorMesh(this.atlas, trees.length + 64);
    this.group.add(this.impostors);
    progress(0.75);
    await nextFrame();

    // --- Grille spatiale
    this.cellsPerSide = Math.ceil((m.half * 2) / CELL);
    this.grid = Array.from({ length: this.cellsPerSide * this.cellsPerSide }, () => []);
    trees.forEach((t, i) => {
      const k = this.cellKey(t.x, t.z);
      if (k >= 0) this.grid[k].push(i);
      const sp = SPECIES[t.sp];
      this.colliders.push({ x: t.x, z: t.z, r: sp.trunkR[1] * t.s * 1.1 + 0.15 });
    });

    // --- Rochers
    await this.buildRocks(r);
    progress(1);
  }

  cellKey(x, z) {
    const cx = Math.floor((x + this.map.half) / CELL), cz = Math.floor((z + this.map.half) / CELL);
    if (cx < 0 || cz < 0 || cx >= this.cellsPerSide || cz >= this.cellsPerSide) return -1;
    return cz * this.cellsPerSide + cx;
  }

  async buildRocks(r) {
    const m = this.map;
    this.rockMat = makeRockMaterial(this.texgen, this.q.texSize);
    const geos = [0, 1, 2, 3].map((i) => makeRockGeometry(900 + i * 13, i));
    const rocks = [];
    const half = m.half - 30;
    for (let i = 0; i < 9000; i++) {
      const x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
      const h = m.heightAt(x, z);
      if (h < m.water + 0.1) continue;
      const slope = m.slopeAt(x, z);
      const f = m.forestAt(x, z);
      let p = 0.004 + f * 0.05 + smoothstep(220, 320, h) * 0.5 + smoothstep(0.4, 0.8, slope) * 0.4;
      if (pathDistance(x, z).d < 2) p = 0;
      if (Math.hypot(x - PLACES.lodge.x, z - PLACES.lodge.z) < PLACES.lodge.r + 20) p = 0;
      if (r() > p) continue;
      const big = smoothstep(220, 330, h) * 0.8 + slope * 0.6;
      const s = (0.35 + r() * 0.9) * (1 + big * 2.2 * r());
      rocks.push({ x, z, y: h - s * 0.25, s, g: r.int(0, 3), yaw: r() * 6.28, tilt: (r() - 0.5) * 0.4 });
    }
    this.rocks = rocks;
    this.rockMeshes = geos.map((g) => {
      const mm = new THREE.InstancedMesh(g, this.rockMat, rocks.length + 1);
      mm.count = 0;
      mm.castShadow = true;
      mm.receiveShadow = true;
      mm.frustumCulled = false;
      this.group.add(mm);
      return mm;
    });
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const counts = [0, 0, 0, 0];
    for (const k of rocks) {
      e.set(k.tilt, k.yaw, k.tilt * 0.5);
      q.setFromEuler(e);
      sc.set(k.s * 1.3, k.s * (0.75 + 0.3 * ((k.yaw * 7) % 1)), k.s);
      pos.set(k.x, k.y, k.z);
      mtx.compose(pos, q, sc);
      this.rockMeshes[k.g].setMatrixAt(counts[k.g]++, mtx);
      if (k.s > 0.7) this.colliders.push({ x: k.x, z: k.z, r: k.s * 1.05 });
    }
    this.rockMeshes.forEach((mm, i) => {
      mm.count = counts[i];
      mm.instanceMatrix.needsUpdate = true;
      mm.computeBoundingSphere();
    });
    this.colliderGrid = new Map();
    this.colliders.forEach((c, i) => {
      const k = Math.floor((c.x + 1000) / 16) * 1000 + Math.floor((c.z + 1000) / 16);
      if (!this.colliderGrid.has(k)) this.colliderGrid.set(k, []);
      this.colliderGrid.get(k).push(c);
    });
  }

  // Cercles proches (collisions joueur / animaux)
  nearColliders(x, z) {
    const out = [];
    const cx = Math.floor((x + 1000) / 16), cz = Math.floor((z + 1000) / 16);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const l = this.colliderGrid.get((cx + a) * 1000 + cz + b);
        if (l) out.push(...l);
      }
    return out;
  }

  collide(pos, radius) {
    for (const c of this.nearColliders(pos.x, pos.z)) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  // Tronc touché par un projectile ? (segment 2D contre cercles)
  treeHit(a, b) {
    const minx = Math.min(a.x, b.x) - 2, maxx = Math.max(a.x, b.x) + 2;
    const minz = Math.min(a.z, b.z) - 2, maxz = Math.max(a.z, b.z) + 2;
    let best = null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    for (let x = minx; x <= maxx + 16; x += 16)
      for (let z = minz; z <= maxz + 16; z += 16) {
        const l = this.colliderGrid.get(Math.floor((x + 1000) / 16) * 1000 + Math.floor((z + 1000) / 16));
        if (!l) continue;
        for (const c of l) {
          const t = clamp(((c.x - a.x) * dx + (c.z - a.z) * dz) / len2, 0, 1);
          const px = a.x + dx * t, pz = a.z + dz * t;
          if (Math.hypot(px - c.x, pz - c.z) < c.r * 0.8) {
            const y = a.y + (b.y - a.y) * t;
            const gy = this.map.heightAt(c.x, c.z);
            if (y < gy + 12 && (!best || t < best.t)) best = { t, x: px, y, z: pz };
          }
        }
      }
    return best;
  }

  update(dt, camera, force = false, noCull = false) {
    this._t -= dt;
    const cp = camera.position;
    if (!force && this._t > 0 && cp.distanceToSquared(this._lastPos) < 9) return;
    this._t = 0.25;
    this._lastPos.copy(cp);
    const q = this.q;
    const near = q.treeNear, mid = q.treeMid, far = q.viewDist;
    const counts = new Map();
    for (const [k] of this.instanced) counts.set(k, [0, 0]);
    const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const imp = this.impostors.geometry;
    const iA = imp.attributes.aInst.array, iB = imp.attributes.aInst2.array;
    let ni = 0;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const box = new THREE.Box3();
    const cps = this.cellsPerSide;
    const c0x = Math.max(0, Math.floor((cp.x - far + this.map.half) / CELL)), c1x = Math.min(cps - 1, Math.floor((cp.x + far + this.map.half) / CELL));
    const c0z = Math.max(0, Math.floor((cp.z - far + this.map.half) / CELL)), c1z = Math.min(cps - 1, Math.floor((cp.z + far + this.map.half) / CELL));
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const list = this.grid[cz * cps + cx];
        if (!list.length) continue;
        const x0 = -this.map.half + cx * CELL, z0 = -this.map.half + cz * CELL;
        const dcell = Math.hypot(Math.max(x0 - cp.x, 0, cp.x - x0 - CELL), Math.max(z0 - cp.z, 0, cp.z - z0 - CELL));
        if (dcell > far) continue;
        box.min.set(x0 - 8, cp.y - 400, z0 - 8);
        box.max.set(x0 + CELL + 8, cp.y + 400, z0 + CELL + 8);
        if (!noCull && dcell > 20 && !frustum.intersectsBox(box)) continue;
        for (const i of list) {
          const t = this.trees[i];
          const d = Math.hypot(t.x - cp.x, t.z - cp.z);
          if (d > far) continue;
          const key = t.sp + t.v;
          if (d < mid) {
            const lod = d < near ? 0 : 1;
            const meshes = this.instanced.get(key)[lod];
            const c = counts.get(key);
            if (c[lod] >= meshes.cap) continue;
            quat.setFromAxisAngle(up, t.yaw);
            sc.setScalar(t.s);
            pos.set(t.x, t.y - 0.15, t.z);
            mtx.compose(pos, quat, sc);
            meshes.bark.setMatrixAt(c[lod], mtx);
            meshes.leaves.setMatrixAt(c[lod], mtx);
            const tt = t.tint;
            col.setRGB(0.88 + tt * 0.24, 0.92 + 0.08 * Math.sin(tt * 9), 0.95 - tt * 0.15);
            meshes.leaves.setColorAt(c[lod], col);
            c[lod]++;
          } else {
            const vr = this.variants.find((v) => v.name === t.sp && v.v === t.v);
            iA[ni * 4] = t.x; iA[ni * 4 + 1] = t.y - 0.15; iA[ni * 4 + 2] = t.z; iA[ni * 4 + 3] = t.yaw;
            iB[ni * 4] = t.s; iB[ni * 4 + 1] = vr.row; iB[ni * 4 + 2] = t.tint; iB[ni * 4 + 3] = 0;
            ni++;
          }
        }
      }
    for (const [k, meshes] of this.instanced) {
      const c = counts.get(k);
      meshes.forEach((mm, lod) => {
        for (const x of [mm.bark, mm.leaves]) {
          x.count = c[lod];
          x.visible = c[lod] > 0;
          x.instanceMatrix.needsUpdate = true;
        }
        if (mm.leaves.instanceColor) mm.leaves.instanceColor.needsUpdate = true;
        mm.bark.castShadow = mm.leaves.castShadow = lod === 0 || q.shadowDist > 70;
      });
    }
    imp.instanceCount = ni;
    imp.attributes.aInst.needsUpdate = true;
    imp.attributes.aInst2.needsUpdate = true;
  }

  setAmbient(sky, ground) {
    const u = this.impostors.material.uniforms;
    u.uAmbSky.value.copy(sky);
    u.uAmbGround.value.copy(ground);
  }
}
