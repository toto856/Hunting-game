// Rendu du terrain : grilles instanciées déplacées sur GPU (CDLOD), texturage multicouche
// par hauteur, normales détaillées, anti-répétition et variations à grande échelle.
import * as THREE from 'three';
import { injectGlobals, GLSL_NOISE } from '../gfx/globals.js';
import { LAYERS, LAYER_STRENGTH } from '../gfx/terrainLayers.js';

const CHUNK = 64;

function makeGrid(cells) {
  // Grille de (cells+1)² sommets + jupes (y = -1 marque un sommet de jupe)
  const n = cells + 1;
  const pos = [];
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push((i / cells) * CHUNK, 0, (j / cells) * CHUNK);
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  const edge = (list) => {
    const start = pos.length / 3;
    for (const k of list) pos.push(pos[k * 3], -1, pos[k * 3 + 2]);
    for (let e = 0; e < list.length - 1; e++) {
      const a = list[e], b = list[e + 1], c = start + e, d = start + e + 1;
      idx.push(a, b, c, b, d, c);
      idx.push(a, c, b, b, c, d);
    }
  };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i < n; i++) {
    top.push(i);
    bottom.push((n - 1) * n + i);
    left.push(i * n);
    right.push(i * n + n - 1);
  }
  edge(top); edge(bottom); edge(left); edge(right);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT_HEAD = /* glsl */ `
uniform sampler2D tHeight;
uniform sampler2D tNormalMap;
uniform vec4 uMapInfo; // x: demi-côté, y: pas, z: n, w: inutilisé
uniform vec3 uCamPos;
attribute float aLod;
attribute vec2 aMorph;
varying vec3 vWorld;
varying vec3 vNormalW;
float fetchH( vec2 ij ) {
  ij = clamp( ij, vec2( 0.0 ), vec2( uMapInfo.z - 1.0 ) );
  return texelFetch( tHeight, ivec2( ij ), 0 ).r;
}
float terrainH( vec2 xz ) {
  vec2 f = ( xz + uMapInfo.x ) / uMapInfo.y;
  vec2 i = floor( f ); vec2 t = f - i;
  float a = fetchH( i ), b = fetchH( i + vec2( 1, 0 ) ), c = fetchH( i + vec2( 0, 1 ) ), d = fetchH( i + vec2( 1, 1 ) );
  return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
vec3 terrainN( vec2 xz ) {
  vec2 uv = ( xz + uMapInfo.x ) / ( uMapInfo.y * ( uMapInfo.z - 1.0 ) );
  vec3 n = texture2D( tNormalMap, uv ).xyz * 2.0 - 1.0;
  return normalize( n );
}
`;

const VERT_BODY = /* glsl */ `
  vec3 transformed = vec3( position );
  float skirt = step( transformed.y, -0.5 );
  vec2 origin = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  vec2 wxz = origin + transformed.xz;
  // Morphing vers la grille grossière (évite les sauts de LOD)
  float cell = uMapInfo.y * pow( 2.0, aLod );
  float dcam = distance( wxz, uCamPos.xz );
  float morph = smoothstep( aMorph.x, aMorph.y, dcam );
  vec2 gpos = transformed.xz / cell;
  vec2 frac2 = fract( gpos * 0.5 ) * 2.0;
  transformed.xz -= frac2 * cell * morph;
  wxz = origin + transformed.xz;
  float hh = terrainH( wxz );
  transformed.y = hh - skirt * ( 1.5 + cell * 0.6 );
  vec3 objectNormal = terrainN( wxz );
  vWorld = vec3( wxz.x, hh, wxz.y );
  vNormalW = objectNormal;
`;

export class Terrain {
  constructor(map, texgen, preset) {
    this.map = map;
    this.q = preset;
    const n = map.n;
    // Textures de hauteur et de normales
    const hTex = new THREE.DataTexture(map.heights, n, n, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter;
    hTex.needsUpdate = true;
    const nrm = new Uint8Array(n * n * 4);
    const v = new THREE.Vector3();
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -map.half + i * map.res, z = -map.half + j * map.res;
        map.normalAt(x, z, v);
        const o = (j * n + i) * 4;
        nrm[o] = (v.x * 0.5 + 0.5) * 255;
        nrm[o + 1] = (v.y * 0.5 + 0.5) * 255;
        nrm[o + 2] = (v.z * 0.5 + 0.5) * 255;
        nrm[o + 3] = 255;
      }
    const nTex = new THREE.DataTexture(nrm, n, n, THREE.RGBAFormat);
    nTex.minFilter = nTex.magFilter = THREE.LinearFilter;
    nTex.needsUpdate = true;
    const sTex = new THREE.DataTexture(map.splat, n, n, THREE.RGBAFormat);
    sTex.minFilter = sTex.magFilter = THREE.LinearFilter;
    sTex.needsUpdate = true;
    this.hTex = hTex;
    this.nTex = nTex;
    this.sTex = sTex;

    const size = preset.texSize;
    this.alb = texgen.array('terrain', LAYERS, size, 0);
    this.nrm = texgen.array('terrain', LAYERS, size, 1, { strengths: LAYER_STRENGTH });

    this.uniforms = {
      tHeight: { value: hTex },
      tNormalMap: { value: nTex },
      tSplat: { value: sTex },
      tAlb: { value: this.alb },
      tNrm: { value: this.nrm },
      uMapInfo: { value: new THREE.Vector4(map.half, map.res, n, map.water) },
      uSnowLine: { value: 405 },
      uCamPos: { value: new THREE.Vector3() },
    };

    this.material = this.makeMaterial();
    this.depthMaterial = this.makeDepthMaterial();

    // 4 niveaux de détail
    const cellsPerLod = [32, 16, 8, 4];
    const chunksPerSide = (map.half * 2) / CHUNK;
    this.chunksPerSide = chunksPerSide;
    const total = chunksPerSide * chunksPerSide;
    this.meshes = cellsPerLod.map((cells, lod) => {
      const geo = makeGrid(cells);
      geo.setAttribute('aLod', new THREE.InstancedBufferAttribute(new Float32Array(total), 1));
      geo.setAttribute('aMorph', new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2));
      const m = new THREE.InstancedMesh(geo, this.material, total);
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.castShadow = lod <= 1;
      m.customDepthMaterial = this.depthMaterial;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    });
    // Bornes en altitude par bloc (culling)
    this.chunkBounds = new Float32Array(total * 2);
    for (let cz = 0; cz < chunksPerSide; cz++)
      for (let cx = 0; cx < chunksPerSide; cx++) {
        let lo = 1e9, hi = -1e9;
        for (let z = 0; z <= CHUNK; z += map.res * 2)
          for (let x = 0; x <= CHUNK; x += map.res * 2) {
            const h = map.heightAt(-map.half + cx * CHUNK + x, -map.half + cz * CHUNK + z);
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        const k = cz * chunksPerSide + cx;
        this.chunkBounds[k * 2] = lo - 3;
        this.chunkBounds[k * 2 + 1] = hi + 2;
      }
    this.group = new THREE.Group();
    this.meshes.forEach((m) => this.group.add(m));
    this._frustum = new THREE.Frustum();
    this._m4 = new THREE.Matrix4();
    this._box = new THREE.Box3();
  }

  patchVertex(shader, depth = false) {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD);
    if (depth) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    else shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', VERT_BODY)
      .replace('#include <begin_vertex>', '');
  }

  makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      injectGlobals(shader);
      Object.assign(shader.uniforms, U);
      this.patchVertex(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          precision highp sampler2DArray;
          uniform sampler2DArray tAlb;
          uniform sampler2DArray tNrm;
          uniform sampler2D tSplat;
          uniform vec4 uMapInfo;
          uniform float uSnowLine;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          ${GLSL_NOISE}
          vec4 sampleL( sampler2DArray t, vec2 uv, float layer ) { return texture( t, vec3( uv, layer ) ); }
          // Anti-répétition : deux échantillons décalés mélangés par un bruit
          vec4 sampleAT( sampler2DArray t, vec2 uv, float layer, float k ) {
            vec4 a = texture( t, vec3( uv, layer ) );
            vec2 uv2 = vec2( uv.y * 0.82 + 0.37, -uv.x * 0.82 + 0.71 );
            vec4 b = texture( t, vec3( uv2, layer ) );
            return mix( a, b, k );
          }
          vec3 gTerrainN;
          float gTerrainRough;
          float gTerrainAO;
        `)
        .replace('#include <map_fragment>', `
          vec2 mapUv = ( vWorld.xz + uMapInfo.x ) / ( uMapInfo.y * ( uMapInfo.z - 1.0 ) );
          vec4 sp = texture2D( tSplat, mapUv );
          vec3 Nw = normalize( vNormalW );
          float slope = 1.0 - Nw.y;
          float big = fbm2( vWorld.xz * 0.012 );
          float mid = vnoise( vWorld.xz * 0.06 );
          float kAT = smoothstep( 0.35, 0.65, vnoise( vWorld.xz * 0.11 ) );
          // Poids bruts
          float w[8];
          w[0] = 1.0;
          w[1] = sp.r;
          w[2] = sp.g;
          w[3] = smoothstep( 0.26, 0.42, slope + ( mid - 0.5 ) * 0.12 ) + smoothstep( 330.0, 380.0, vWorld.y + big * 40.0 ) * 0.6;
          w[4] = sp.a;
          w[5] = sp.b;
          w[6] = sp.r * smoothstep( 0.5, 0.75, mid ) * 0.7 + w[3] * smoothstep( 0.6, 0.8, big ) * 0.4;
          w[7] = smoothstep( uSnowLine - 15.0, uSnowLine + 10.0, vWorld.y + big * 30.0 ) * smoothstep( 0.55, 0.25, slope );
          float sc[8];
          sc[0] = 0.33; sc[1] = 0.3; sc[2] = 0.32; sc[3] = 0.16; sc[4] = 0.4; sc[5] = 0.25; sc[6] = 0.33; sc[7] = 0.18;
          vec2 uvb = vWorld.xz;
          // Mélange par hauteur
          vec4 A[8]; vec4 Nn[8];
          float maxv = -10.0;
          float hv[8];
          for ( int i = 0; i < 8; i++ ) {
            hv[i] = -10.0;
            if ( w[i] > 0.02 ) {
              vec2 uv = uvb * sc[i];
              if ( i == 3 ) uv = vec2( uvb.x * sc[i], vWorld.y * sc[i] * ( 0.5 + abs( Nw.z ) ) + uvb.y * sc[i] * abs( Nw.x ) );
              A[i] = ( i < 2 ) ? sampleAT( tAlb, uv, float( i ), kAT ) : sampleL( tAlb, uv, float( i ) );
              Nn[i] = ( i < 2 ) ? sampleAT( tNrm, uv, float( i ), kAT ) : sampleL( tNrm, uv, float( i ) );
              hv[i] = Nn[i].a + w[i] * 1.6;
              maxv = max( maxv, hv[i] );
            }
          }
          float depthB = 0.25;
          vec3 albedo = vec3( 0.0 ); vec3 nrmT = vec3( 0.0 ); float rough = 0.0; float hsum = 0.0; float wsum = 0.0;
          for ( int i = 0; i < 8; i++ ) {
            if ( hv[i] > -5.0 ) {
              float b = max( hv[i] - ( maxv - depthB ), 0.0 );
              albedo += A[i].rgb * b; rough += A[i].a * b; nrmT += ( Nn[i].xyz * 2.0 - 1.0 ) * b; hsum += Nn[i].a * b;
              wsum += b;
            }
          }
          albedo /= wsum; rough /= wsum; nrmT /= wsum; hsum /= wsum;
          // Variations de teinte à grande échelle (herbe plus sèche, plus verte…)
          albedo *= mix( vec3( 1.06, 1.0, 0.86 ), vec3( 0.9, 1.0, 1.06 ), big );
          albedo *= 0.88 + 0.24 * mid;
          // Humidité (pluie, berges) : plus sombre et plus brillant
          float shoreWet = smoothstep( uMapInfo.w + 0.35, uMapInfo.w + 0.02, vWorld.y );
          float wet = max( uWeather.x * ( 1.0 - w[7] ), shoreWet * 0.85 );
          albedo *= 1.0 - wet * 0.35;
          rough = mix( rough, rough * 0.45, wet );
          gTerrainN = nrmT;
          gTerrainRough = rough;
          gTerrainAO = 0.55 + 0.45 * smoothstep( 0.0, 0.6, hsum );
          diffuseColor = vec4( albedo, opacity );
        `)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gTerrainRough;')
        .replace('#include <normal_fragment_begin>', `
          vec3 Nw2 = normalize( vNormalW );
          vec3 T = normalize( vec3( 1.0, 0.0, 0.0 ) - Nw2 * Nw2.x );
          vec3 B = normalize( cross( T, Nw2 ) );
          float fade = 1.0 - smoothstep( 40.0, 220.0, distance( vWorld, cameraPosition ) );
          vec3 nt = normalize( mix( vec3( 0.0, 0.0, 1.0 ), gTerrainN, 0.85 * fade + 0.15 ) );
          vec3 nWorld = normalize( T * nt.x - B * nt.y + Nw2 * nt.z );
          float faceDirection = 1.0;
          vec3 normal = normalize( ( viewMatrix * vec4( nWorld, 0.0 ) ).xyz );
          vec3 nonPerturbedNormal = normal;
        `)
        .replace('#include <normal_fragment_maps>', '')
        .replace('#include <aomap_fragment>', `
          float ambientOcclusion = gTerrainAO;
          reflectedLight.indirectDiffuse *= ambientOcclusion;
          reflectedLight.indirectSpecular *= ambientOcclusion;
        `);
    };
    mat.customProgramCacheKey = () => 'terrain-v1';
    return mat;
  }

  makeDepthMaterial() {
    const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      this.patchVertex(shader, true);
    };
    mat.customProgramCacheKey = () => 'terrain-depth-v1';
    return mat;
  }

  // Choix des niveaux de détail par bloc + élimination hors champ
  update(camera, noCull = false) {
    const cps = this.chunksPerSide;
    const half = this.map.half;
    const lodD = this.q.terrainLod;
    this._m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m4);
    const counts = [0, 0, 0, 0];
    const cp = camera.position;
    this.uniforms.uCamPos.value.copy(cp);
    const m = this._m4;
    for (let cz = 0; cz < cps; cz++)
      for (let cx = 0; cx < cps; cx++) {
        const k = cz * cps + cx;
        const x0 = -half + cx * CHUNK, z0 = -half + cz * CHUNK;
        const lo = this.chunkBounds[k * 2], hi = this.chunkBounds[k * 2 + 1];
        this._box.min.set(x0, lo, z0);
        this._box.max.set(x0 + CHUNK, hi, z0 + CHUNK);
        const dx = Math.max(x0 - cp.x, 0, cp.x - (x0 + CHUNK));
        const dz = Math.max(z0 - cp.z, 0, cp.z - (z0 + CHUNK));
        const dy = Math.max(lo - cp.y, 0, cp.y - hi);
        const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.3);
        if (!noCull && d > 30 && !this._frustum.intersectsBox(this._box)) continue;
        let lod = 3;
        if (d < lodD[0]) lod = 0;
        else if (d < lodD[1]) lod = 1;
        else if (d < lodD[2]) lod = 2;
        const mesh = this.meshes[lod];
        const i = counts[lod]++;
        m.makeTranslation(x0, 0, z0);
        mesh.setMatrixAt(i, m);
        mesh.geometry.attributes.aLod.array[i] = lod;
        const end = lod < 3 ? lodD[lod] + CHUNK * 0.7 : 1e6;
        mesh.geometry.attributes.aMorph.array[i * 2] = lod < 3 ? end * 0.72 : 1e6;
        mesh.geometry.attributes.aMorph.array[i * 2 + 1] = lod < 3 ? end : 1e6 + 1;
      }
    // Le morphing utilise le pas du niveau suivant
    this.meshes.forEach((mesh, lod) => {
      mesh.count = counts[lod];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aLod.needsUpdate = true;
      mesh.geometry.attributes.aMorph.needsUpdate = true;
    });
  }

  dispose() {
    this.meshes.forEach((m) => m.geometry.dispose());
    this.material.dispose();
    this.hTex.dispose();
    this.nTex.dispose();
    this.sTex.dispose();
  }
}
