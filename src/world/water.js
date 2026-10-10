// Eau de l'étang et des mares : reflets (sonde cubique locale + correction de parallaxe),
// absorption selon la profondeur réelle du fond, rides, reflets du soleil, ronds dans l'eau.
import * as THREE from 'three';
import { PLACES } from './reserveMap.js';
import { GLSL_NOISE, GU } from '../gfx/globals.js';

const WATER_NORMAL = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float a = gn( uv * 3.0 + vec2( 0.0, 0.0 ), vec2( 3.0 ) );
  float b = gn( uv * 7.0 + 1.7, vec2( 7.0 ) );
  float c = gn( uv * 15.0 + 3.1, vec2( 15.0 ) );
  float d = gn( uv * 31.0 + 5.3, vec2( 31.0 ) );
  h = 0.5 + 0.28 * a + 0.16 * b + 0.08 * c + 0.035 * d;
  alb = vec3( h ); rough = 1.0;
}`;

const MAX_RIPPLES = 12;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vW = wp.xyz;
  vec3 transformed = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #ifdef USE_FOG
  vFogWorld = wp.xyz;
  #endif
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tHeight;
uniform vec4 uMapInfo;
uniform sampler2D tNormal;
uniform samplerCube tProbe;
uniform vec3 uProbePos;
uniform float uProbeR;
uniform float uLevel;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uExposureRefl;
varying vec3 vW;
${GLSL_NOISE}
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
vec3 nrmTex( vec2 uv ) { vec3 n = texture2D( tNormal, uv ).xyz * 2.0 - 1.0; return vec3( n.x, n.z, n.y ); }
void main() {
  float depth = uLevel - terrainH( vW.xz );
  if ( depth < -0.03 ) discard;
  float dist = distance( cameraPosition, vW );
  float ws = length( uWind.xz );
  float calm = 0.18 + 0.5 * clamp( ws * 0.35, 0.0, 1.0 );
  vec2 wd = uWind.xz / ( ws + 1e-4 );
  vec3 n1 = nrmTex( vW.xz * 0.045 + wd * uTime * 0.012 );
  vec3 n2 = nrmTex( vW.xz * 0.11 + vec2( -wd.y, wd.x ) * uTime * 0.02 );
  vec3 n3 = nrmTex( vW.xz * 0.37 - wd * uTime * 0.035 );
  vec3 N = vec3( 0.0, 1.0, 0.0 );
  float strength = calm * ( 1.0 - smoothstep( 30.0, 400.0, dist ) * 0.85 );
  N.xz += ( n1.xz * 0.5 + n2.xz * 0.35 + n3.xz * 0.25 ) * strength;
  // Ronds dans l'eau
  for ( int i = 0; i < ${MAX_RIPPLES}; i++ ) {
    vec4 rp = uRipples[i];
    if ( rp.w <= 0.0 ) continue;
    float age = uTime - rp.z;
    if ( age < 0.0 || age > 6.0 ) continue;
    vec2 dv = vW.xz - rp.xy;
    float r = length( dv );
    float front = age * 1.4;
    float ring = exp( -pow( ( r - front ) * 3.0, 2.0 ) ) * sin( ( r - front ) * 14.0 );
    float amp = rp.w * exp( -age * 0.7 ) / ( 1.0 + r * 0.6 );
    N.xz += ( dv / max( r, 0.01 ) ) * ring * amp * 0.6;
  }
  // Pluie
  if ( uWeather.w > 0.0 ) {
    vec2 cell = floor( vW.xz * 3.0 );
    float ph = hash12( cell );
    float t = fract( uTime * 0.9 + ph );
    vec2 c = ( cell + 0.5 + ( hash22( cell ) - 0.5 ) * 0.6 ) / 3.0;
    float rr = length( vW.xz - c );
    float rg = sin( ( rr - t * 0.3 ) * 60.0 ) * exp( -rr * 12.0 ) * ( 1.0 - t );
    N.xz += ( vW.xz - c ) / max( rr, 0.001 ) * rg * 0.25 * uWeather.w;
  }
  N = normalize( N );
  vec3 V = normalize( cameraPosition - vW );
  float NdV = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );
  // Reflet : rayon contre une sphère centrée sur la sonde (parallaxe)
  vec3 R = reflect( -V, N );
  R.y = abs( R.y );
  vec3 o = vW - uProbePos;
  float b = dot( o, R );
  float c = dot( o, o ) - uProbeR * uProbeR;
  float tHit = -b + sqrt( max( b * b - c, 0.0 ) );
  vec3 dirP = normalize( o + R * tHit );
  vec3 refl = textureCube( tProbe, dirP ).rgb * uExposureRefl;
  // Absorption et couleur de l'eau (fond visible en bordure)
  float d = max( depth, 0.0 );
  vec3 absorb = mix( uShallow, uDeep, 1.0 - exp( -d * 0.7 ) );
  vec3 skyAmb = uFogColor * 0.6;
  vec3 body = absorb * ( skyAmb + uSunColor * max( uSunDir.y, 0.0 ) * 0.9 );
  float alphaBody = 1.0 - exp( -d * 2.6 );
  // Soleil
  vec3 H = normalize( uSunDir + V );
  float spec = pow( max( dot( N, H ), 0.0 ), 900.0 ) * 40.0 + pow( max( dot( N, H ), 0.0 ), 120.0 ) * 1.2;
  vec3 sun = uSunColor * spec * step( 0.0, uSunDir.y );
  // Écume légère au bord
  float foam = smoothstep( 0.12, 0.0, d ) * smoothstep( 0.45, 0.75, vnoise( vW.xz * 2.5 + uTime * 0.2 ) );
  vec3 col = body * ( 1.0 - F ) * alphaBody + refl * F + sun;
  col += vec3( 0.6 ) * foam * 0.25 * ( skyAmb + uSunColor * 0.5 );
  float a = clamp( max( alphaBody * ( 1.0 - F ), 0.0 ) + F + foam * 0.2, 0.0, 1.0 );
  a *= smoothstep( -0.03, 0.04, depth );
  gl_FragColor = vec4( col / max( a, 0.001 ), a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  constructor(map, texgen, terrain, engine) {
    this.map = map;
    this.engine = engine;
    const nTex = texgen.texture('waternormal', WATER_NORMAL, 512, { mode: 1, normalStrength: 2.2 });
    nTex.anisotropy = 4;
    const lake = PLACES.lake, marsh = PLACES.marsh;
    const x0 = Math.min(lake.x - lake.rx * 1.9, marsh.x - marsh.rx * 1.7);
    const x1 = Math.max(lake.x + lake.rx * 1.9, marsh.x + marsh.rx * 1.7);
    const z0 = Math.min(lake.z - lake.rz * 1.9, marsh.z - marsh.rz * 1.7);
    const z1 = Math.max(lake.z + lake.rz * 1.9, marsh.z + marsh.rz * 1.7);
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2);
    this.probeRes = engine.q.texSize >= 1024 ? 256 : 128;
    this.probeRT = new THREE.WebGLCubeRenderTarget(this.probeRes, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.probePos = new THREE.Vector3(lake.x, map.water + 1.5, lake.z);
    this.probeCam = new THREE.CubeCamera(1, 4000, this.probeRT);
    this.probeCam.position.copy(this.probePos);
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
    this.rippleI = 0;
    this.uniforms = {
      tHeight: terrain.uniforms.tHeight,
      uMapInfo: terrain.uniforms.uMapInfo,
      tNormal: { value: nTex },
      tProbe: { value: this.probeRT.texture },
      uProbePos: { value: this.probePos },
      uProbeR: { value: 260 },
      uLevel: { value: map.water },
      uShallow: { value: new THREE.Color(0.09, 0.085, 0.05) },
      uDeep: { value: new THREE.Color(0.012, 0.03, 0.03) },
      uRipples: { value: this.ripples },
      uExposureRefl: { value: 1 },
      fogColor: { value: new THREE.Color() },
      fogDensity: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set((x0 + x1) / 2, map.water, (z0 + z1) / 2);
    this.mesh.renderOrder = 2;
    this.mesh.layers.enable(0);
    this._probeT = 0;
    this._probeHour = -99;
  }

  ripple(x, z, strength = 1) {
    const r = this.ripples[this.rippleI];
    r.set(x, z, GU.uTime.value, strength);
    this.rippleI = (this.rippleI + 1) % MAX_RIPPLES;
  }

  // Recapture du reflet de l'environnement (forêt, relief, ciel)
  updateProbe(scene, hour, hide = []) {
    const r = this.engine.renderer;
    this.mesh.visible = false;
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    const au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    if (this.beforeProbe) this.beforeProbe(this.probePos);
    this.probeCam.update(r, scene);
    if (this.afterProbe) this.afterProbe();
    r.shadowMap.autoUpdate = au;
    r.toneMapping = tm;
    hide.forEach((o, i) => (o.visible = vis[i]));
    this.mesh.visible = true;
    this._probeHour = hour;
  }

  update(dt, scene, hour, hide) {
    this._probeT -= dt;
    if (this._probeT <= 0 && Math.abs(hour - this._probeHour) > 0.25) {
      this._probeT = 2;
      this.updateProbe(scene, hour, hide);
    }
  }
}
