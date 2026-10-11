// Rochers procéduraux : icosphère déformée par bruit, base aplatie, mousse au sommet,
// texture de roche en projection triplanaire.
import * as THREE from 'three';
import { makeNoise } from '../core/noise.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROCK, MOSS } from './terrainLayers.js';
import { injectGlobals } from './globals.js';

export function makeRockGeometry(seed, type = 0) {
  const N = makeNoise(seed);
  let g = new THREE.IcosahedronGeometry(1, type === 3 ? 2 : 3);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const sx = [1.0, 1.4, 0.8, 1.2][type], sy = [0.7, 0.55, 0.9, 0.5][type], sz = [0.9, 1.0, 0.85, 1.3][type];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = N.n3(v.x * 1.3, v.y * 1.3, v.z * 1.3);
    const n2 = N.n3(v.x * 3.1 + 5, v.y * 3.1, v.z * 3.1) * 0.35;
    const n3 = Math.abs(N.n3(v.x * 6.5, v.y * 6.5 + 2, v.z * 6.5)) * 0.12;
    let r = 1 + n1 * 0.28 + n2 * 0.3 - n3;
    // Facettes : arrondir puis "tailler" quelques plans de fracture
    const facet = Math.max(0, N.n3(v.x * 0.8 + 9, v.y * 0.8, v.z * 0.8)) * 0.25;
    r -= facet;
    v.multiplyScalar(r);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Mousse / lichen par sommet (dessus = moussu)
  const col = new Float32Array(p.count * 3);
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const up = nrm.getY(i);
    const m = Math.max(0, Math.min(1, (up - 0.55) * 2.2 + N.n3(p.getX(i) * 2, p.getY(i) * 2, p.getZ(i) * 2) * 0.4));
    col[i * 3] = m;
    col[i * 3 + 1] = Math.max(0, Math.min(1, 0.5 + p.getY(i))); // occlusion vers la base
    col[i * 3 + 2] = 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export function makeRockMaterial(texgen, size) {
  const rock = texgen.pair('rock-obj', ROCK, Math.min(1024, size), { normalStrength: 6 });
  const moss = texgen.pair('moss-obj', MOSS, Math.min(512, size), { normalStrength: 4 });
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    injectGlobals(s);
    s.uniforms.tRock = { value: rock.map };
    s.uniforms.tRockN = { value: rock.normal };
    s.uniforms.tMoss = { value: moss.map };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 color;\nvarying vec3 vRockW; varying vec3 vRockN; varying vec3 vRockC;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 rw = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
        vRockW = rw.xyz;
        vRockN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );
        vRockC = color;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tRock; uniform sampler2D tRockN; uniform sampler2D tMoss;
        varying vec3 vRockW; varying vec3 vRockN; varying vec3 vRockC;
        vec4 tri( sampler2D t, vec3 p, vec3 n, float sc ) {
          vec3 w = pow( abs( n ), vec3( 4.0 ) ); w /= w.x + w.y + w.z;
          return texture2D( t, p.yz * sc ) * w.x + texture2D( t, p.xz * sc ) * w.y + texture2D( t, p.xy * sc ) * w.z;
        }
        vec3 triN( sampler2D t, vec3 p, vec3 n, float sc ) {
          vec3 w = pow( abs( n ), vec3( 4.0 ) ); w /= w.x + w.y + w.z;
          vec3 tx = texture2D( t, p.yz * sc ).xyz * 2.0 - 1.0;
          vec3 ty = texture2D( t, p.xz * sc ).xyz * 2.0 - 1.0;
          vec3 tz = texture2D( t, p.xy * sc ).xyz * 2.0 - 1.0;
          // Whiteout blend (normales en espace monde)
          vec3 nx = normalize( vec3( tx.xy + n.zy, abs( tx.z ) * n.x ) ).zyx;
          vec3 ny = normalize( vec3( ty.xy + n.xz, abs( ty.z ) * n.y ) ).xzy;
          vec3 nz = normalize( vec3( tz.xy + n.xy, abs( tz.z ) * n.z ) );
          return normalize( nx * w.x + ny * w.y + nz * w.z );
        }`)
      .replace('#include <map_fragment>', `
        vec3 rn = normalize( vRockN );
        vec4 rc = tri( tRock, vRockW, rn, 0.35 );
        vec4 mc = tri( tMoss, vRockW, rn, 0.5 );
        float mossK = smoothstep( 0.35, 0.65, vRockC.r );
        diffuseColor.rgb = mix( rc.rgb, mc.rgb, mossK ) * ( 0.55 + 0.45 * vRockC.g );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( rc.a, 0.95, mossK );')
      .replace('#include <normal_fragment_maps>', `
        vec3 rwN = triN( tRockN, vRockW, rn, 0.35 );
        normal = normalize( ( viewMatrix * vec4( rwN, 0.0 ) ).xyz );`);
  };
  mat.customProgramCacheKey = () => 'rock';
  return mat;
}
