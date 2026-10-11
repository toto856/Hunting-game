// Herbe, roseaux et fougères : touffes instanciées par tuiles autour du joueur,
// vent en vagues, fondu en distance, ombres reçues.
import * as THREE from 'three';
import { injectGlobals, GLSL_NOISE } from '../gfx/globals.js';
import { hash2, smoothstep, clamp } from '../core/math.js';
import { pathDistance, PLACES } from './reserveMap.js';
import { GRASS_CARD, REED_CARD, FERN_FROND } from '../gfx/vegTextures.js';

// ------------------------------------------------------------------ géométries
function bladeClump(blades, segs, seed, opts = {}) {
  const pos = [], nrm = [], aT = [], idx = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < blades; b++) {
    const ang = rnd() * Math.PI * 2;
    const rad = rnd() * (opts.spread || 0.09);
    const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
    const yaw = rnd() * Math.PI * 2;
    const h = (opts.h || 0.42) * (0.55 + rnd() * 0.8);
    const w = (opts.w || 0.016) * (0.7 + rnd() * 0.6);
    const lean = (0.15 + rnd() * 0.35) * h;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const px = -dz, pz = dx;
    const start = pos.length / 3;
    const rr = rnd();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = h * t;
      const off = lean * t * t;
      const cx = bx + dx * off, cz = bz + dz * off;
      const ww = w * (1 - t * 0.92);
      // Normale : face du brin inclinée selon la courbure
      const nx = dx * 0.3 + px * 0, nz = dz * 0.3;
      if (i < segs) {
        pos.push(cx - px * ww, y, cz - pz * ww, cx + px * ww, y, cz + pz * ww);
        nrm.push(-dx, 0.6, -dz, -dx, 0.6, -dz);
        aT.push(t, rr, t, rr);
      } else {
        pos.push(cx, y, cz);
        nrm.push(-dx, 0.6, -dz);
        aT.push(1, rr);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = start + i * 2;
      if (i < segs - 1) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 1, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Étoile de cartes verticales (herbe, roseaux)
function cardStar(n, w, hgt) {
  const pos = [], nrm = [], uv = [], aT = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + 0.3;
    const dx = Math.cos(a) * w * 0.5, dz = Math.sin(a) * w * 0.5;
    const nx = -Math.sin(a), nz = Math.cos(a);
    const b = pos.length / 3;
    const rr = (i * 0.37) % 1;
    for (let k = 0; k < 2; k++) {
      const t = k;
      pos.push(-dx, hgt * t, -dz, dx, hgt * t, dz);
      nrm.push(nx * 0.3, 1, nz * 0.3, nx * 0.3, 1, nz * 0.3);
      uv.push(i * 0.31, t, i * 0.31 + 1, t);
      aT.push(t, rr, t, rr);
    }
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Fougère : frondes arquées rayonnantes
function fernPlant(fronds) {
  const pos = [], nrm = [], uv = [], aT = [], idx = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = 0.7 + ((f * 0.61) % 1) * 0.5;
    const W = 0.32 * L;
    const segs = 4;
    const b = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const r = L * t * 0.95;
      const y = Math.sin(t * 2.4) * L * 0.55 - t * t * 0.18;
      const cx = ca * r, cz = sa * r;
      const px = -sa * W * 0.5, pz = ca * W * 0.5;
      pos.push(cx - px, y, cz - pz, cx + px, y, cz + pz);
      nrm.push(0, 1, 0, 0, 1, 0);
      uv.push(0, t, 1, t);
      aT.push(t, (f * 0.29) % 1, t, (f * 0.29) % 1);
    }
    for (let k = 0; k < segs; k++) {
      const i = b + k * 2;
      idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ matériau
function grassMaterial(kind, map, a2c, nearFade = 0) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, map: map || null, alphaTest: map ? 0.5 : 0, alphaToCoverage: !!(map && a2c) });
  mat.onBeforeCompile = (s) => {
    injectGlobals(s);
    s.uniforms.uRadius = mat.userData.uRadius;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aT;
        uniform float uRadius;
        varying vec2 vT;
        varying vec3 vGW;
        ${GLSL_NOISE}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize( mix( objectNormal, vec3( 0.0, 1.0, 0.0 ), 0.65 ) );`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        vec3 ib = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
        float dcam = distance( ib.xz, cameraPosition.xz );
        float fade = ( 1.0 - smoothstep( uRadius * 0.62, uRadius, dcam ) ) * ${nearFade > 0 ? `smoothstep( ${nearFade.toFixed(1)} * 0.55, ${nearFade.toFixed(1)}, dcam )` : '1.0'};
        transformed.y *= fade;
        // Vent : vagues qui parcourent le pré
        vec2 wd = uWind.xz; float ws = length( wd ) + 0.0001; wd /= ws;
        float wave = vnoise( ib.xz * 0.07 - wd * uTime * ( 0.6 + ws * 0.5 ) );
        float flutter = sin( uTime * 4.0 + aT.y * 30.0 + ib.x * 0.7 ) * 0.25;
        float bend = pow( aT.x, 1.6 ) * ( ( wave * 1.2 + 0.25 + flutter * 0.4 ) * ( 0.3 + ws * 0.9 ) ) * ${kind === 'reed' ? '0.32' : kind === 'fern' ? '0.08' : '0.22'};
        mat3 imG = mat3( instanceMatrix );
        vec3 wo = transpose( imG ) * vec3( wd.x, 0.0, wd.y );
        transformed.xz += normalize( wo.xz + 1e-4 ) * bend * length( position.xz + vec2( 0.0, position.y ) ) * 1.4;
        transformed.y -= bend * bend * 0.4 * aT.x;
        // Écartement autour du joueur
        vec3 wpos = ( instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
        vec2 away = wpos.xz - uPlayerPos.xz;
        float dp = length( away );
        float push = ( 1.0 - smoothstep( 0.2, 0.9, dp ) ) * aT.x * 0.35;
        vec3 pushO = transpose( imG ) * vec3( away.x, 0.0, away.y ) / max( dp, 0.01 );
        transformed.xz += pushO.xz * push;
        vT = aT;
        vGW = wpos;
      `);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vT;
        varying vec3 vGW;
        ${GLSL_NOISE}`)
      .replace('#include <alphatest_fragment>', `
        ${map ? `{
          vec2 dUv = fwidth( vMapUv ) * 512.0;
          float lodA = log2( max( max( dUv.x, dUv.y ), 1.0 ) );
          diffuseColor.a *= 1.0 + min( lodA, 4.0 ) * ${kind === 'reed' ? '0.08' : '0.16'};
        }` : ''}
        #include <alphatest_fragment>`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${map ? '' : 'diffuseColor.rgb = vec3( 1.0 );'}
        {
          float big = fbm2( vGW.xz * 0.012 );
          float dry = smoothstep( 0.35, 0.75, vnoise( vGW.xz * 0.06 ) * 0.6 + big * 0.5 + vT.y * 0.3 );
          ${kind === 'blade' ? `
          vec3 baseC = vec3( 0.2, 0.25, 0.08 );
          vec3 tipG = mix( vec3( 0.36, 0.44, 0.13 ), vec3( 0.45, 0.48, 0.18 ), vT.y );
          vec3 tipD = mix( vec3( 0.62, 0.55, 0.3 ), vec3( 0.5, 0.42, 0.24 ), vT.y );
          diffuseColor.rgb = pow( mix( baseC, mix( tipG, tipD, dry * 0.8 ), smoothstep( 0.0, 0.85, vT.x ) ), vec3( 2.2 ) );` : kind === 'card' ? `
          diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.2, 1.08, 0.82 ), dry * 0.55 );` : ''}
          diffuseColor.rgb *= mix( vec3( 1.06, 1.0, 0.86 ), vec3( 0.9, 1.0, 1.06 ), big );
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Vd = normalize( vGW - cameraPosition );
          float back = pow( max( dot( Vd, uSunDir ), 0.0 ), 4.0 ) * vT.x;
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * 0.6;
        }`)
      .replace('#include <aomap_fragment>', `
        float ambientOcclusion = mix( 0.35, 1.0, smoothstep( 0.0, 0.8, vT.x ) );
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        reflectedLight.directDiffuse *= mix( 0.6, 1.0, ambientOcclusion );
        reflectedLight.indirectSpecular *= 0.15 * ambientOcclusion;
        reflectedLight.directSpecular *= 0.35;`);
  };
  mat.userData.uRadius = { value: 40 };
  mat.customProgramCacheKey = () => 'grass-' + kind;
  return mat;
}

// ------------------------------------------------------------------ couche répartie par tuiles
class ScatterLayer {
  constructor(opts) {
    this.o = opts;
    this.cache = new Map();
    this.meshes = opts.geos.map((g) => {
      const m = new THREE.InstancedMesh(g, opts.material, opts.max);
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.castShadow = !!opts.castShadow;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    });
    this.key = '';
    opts.material.userData.uRadius.value = opts.radius;
  }

  tile(tx, tz) {
    const k = tx + ',' + tz;
    let t = this.cache.get(k);
    if (t) return t;
    const o = this.o;
    const T = o.tile;
    const n = Math.round(T * T * o.density);
    const arr = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const x = tx * T + hash2(tx * 131 + i, tz * 71, 1) * T;
      const z = tz * T + hash2(tx * 37, tz * 113 + i, 2) * T;
      const d = o.densityFn(x, z);
      if (hash2(i, tx * 7 + tz * 13, 3) > d) continue;
      const y = o.map.heightAt(x, z);
      const s = o.scale[0] + (o.scale[1] - o.scale[0]) * hash2(i, tx + tz, 4);
      q.setFromAxisAngle(up, hash2(tx, i, 5) * Math.PI * 2);
      sc.set(s, s * (0.75 + 0.5 * d), s);
      p.set(x, y - 0.02, z);
      m.compose(p, q, sc);
      arr.push(...m.elements);
    }
    t = new Float32Array(arr);
    this.cache.set(k, t);
    if (this.cache.size > 600) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    return t;
  }

  update(cam) {
    const o = this.o;
    const T = o.tile, R = o.radius;
    const ctx = Math.floor(cam.x / T), ctz = Math.floor(cam.z / T);
    const key = ctx + ',' + ctz;
    if (key === this.key) return;
    this.key = key;
    const rt = Math.ceil(R / T);
    const tiles = [];
    for (let dz = -rt; dz <= rt; dz++)
      for (let dx = -rt; dx <= rt; dx++) {
        const cx = (ctx + dx + 0.5) * T, cz = (ctz + dz + 0.5) * T;
        const d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > R + T * 0.71) continue;
        tiles.push({ tx: ctx + dx, tz: ctz + dz, d });
      }
    tiles.sort((a, b) => a.d - b.d);
    const counts = this.meshes.map(() => 0);
    for (const t of tiles) {
      const data = this.tile(t.tx, t.tz);
      const li = this.meshes.length > 1 && t.d > o.nearRadius ? 1 : 0;
      const mesh = this.meshes[li];
      const nInst = data.length / 16;
      const room = o.max - counts[li];
      const take = Math.min(room, nInst);
      if (take <= 0) continue;
      mesh.instanceMatrix.array.set(take === nInst ? data : data.subarray(0, take * 16), counts[li] * 16);
      counts[li] += take;
    }
    this.meshes.forEach((m, i) => {
      m.count = counts[i];
      m.visible = counts[i] > 0;
      m.instanceMatrix.needsUpdate = true;
    });
  }
}

export class GroundCover {
  constructor(map, preset, texgen) {
    this.map = map;
    this.group = new THREE.Group();
    const m = map;
    const R = preset.grassRadius;
    const dens = preset.grassDensity;
    const grassDensity = (x, z) => {
      const meadow = 1 - m.splatAt(x, z, 0) * 0.85;
      const dirt = m.splatAt(x, z, 1);
      const mud = m.splatAt(x, z, 2);
      const grav = m.splatAt(x, z, 3);
      const h = m.heightAt(x, z);
      if (h < m.water + 0.08) return 0;
      const slope = m.slopeAt(x, z);
      let d = meadow * (1 - dirt) * (1 - mud * 0.9) * (1 - grav) * (1 - smoothstep(0.35, 0.55, slope));
      d *= 1 - smoothstep(330, 360, h);
      return clamp(d, 0, 1);
    };
    const reedDensity = (x, z) => {
      const h = m.heightAt(x, z);
      const dw = h - m.water;
      if (dw < -0.45 || dw > 0.5) return 0;
      const mud = m.splatAt(x, z, 2);
      const lake = PLACES.lake;
      const ld = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
      if (Math.hypot(x - PLACES.hut.x, z - PLACES.hut.z) < 7) return 0;
      return clamp(mud * 1.2 * smoothstep(0.5, -0.1, dw) + (ld > 0.92 && ld < 1.12 ? 0.5 : 0), 0, 1) * 0.9;
    };
    const fernDensity = (x, z) => {
      const f = m.splatAt(x, z, 0);
      if (f < 0.4) return 0;
      if (m.heightAt(x, z) > 300 || m.slopeAt(x, z) > 0.6) return 0;
      if (pathDistance(x, z).d < 1.5) return 0;
      return smoothstep(0.4, 0.9, f) * (0.35 + 0.65 * hash2(Math.floor(x / 9), Math.floor(z / 9), 9)) * 0.6;
    };
    const a2c = preset.antialias;
    const T = (name, body, size) => texgen.texture(name, body, size, { mode: 0 });
    const gTex = T('grasscard', GRASS_CARD, 512);
    const rTex = T('reedcard', REED_CARD, 512);
    const fTex = T('fernfrond', FERN_FROND, 256);
    for (const t of [gTex, rTex, fTex]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
    const nearR = Math.min(11, R * 0.4);
    this.bladeMat = grassMaterial('blade', null, a2c);
    this.cardMat = grassMaterial('card', gTex, a2c, nearR * 0.75);
    this.reedMat = grassMaterial('reed', rTex, a2c);
    this.fernMat = grassMaterial('fern', fTex, a2c);
    this.layers = [
      new ScatterLayer({
        map, tile: 6, radius: nearR, nearRadius: 1e9, density: preset.antialias ? 14 : 8, max: Math.round(nearR * nearR * Math.PI * 15),
        geos: [bladeClump(14, 3, 11, { h: 0.3, spread: 0.16 })], material: this.bladeMat, densityFn: grassDensity, scale: [0.7, 1.3],
      }),
      new ScatterLayer({
        map, tile: 8, radius: R, nearRadius: 1e9, density: dens * 1.1, max: Math.round(R * R * Math.PI * dens * 1.1),
        geos: [cardStar(3, 0.7, 0.28)], material: this.cardMat, densityFn: grassDensity, scale: [0.75, 1.35],
      }),
      new ScatterLayer({
        map, tile: 12, radius: Math.min(150, R * 2.8), nearRadius: 1e9, density: 0.9, max: 26000,
        geos: [cardStar(2, 1.0, 2.2)], material: this.reedMat, densityFn: reedDensity, scale: [0.75, 1.25],
      }),
      new ScatterLayer({
        map, tile: 10, radius: Math.min(70, R * 1.6), nearRadius: 1e9, density: 0.45, max: 9000,
        geos: [fernPlant(7)], material: this.fernMat, densityFn: fernDensity, scale: [0.7, 1.35],
      }),
    ];
    for (const l of this.layers) for (const mm of l.meshes) this.group.add(mm);
  }

  update(camPos) {
    for (const l of this.layers) l.update(camPos);
  }
}
