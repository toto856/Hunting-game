// Uniformes partagés par tous les matériaux (temps, soleil, brume, vent, météo)
// et remplacement du brouillard de three.js par une brume atmosphérique en hauteur.
import * as THREE from 'three';

export const GU = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uFogColor: { value: new THREE.Color(0.62, 0.7, 0.78) },
  uFogSunColor: { value: new THREE.Color(1.0, 0.85, 0.65) },
  // x : densité, y : décroissance en hauteur, z : altitude de référence, w : opacité max
  uFogParams: { value: new THREE.Vector4(0.0012, 0.01, 100, 1) },
  uWind: { value: new THREE.Vector3(1, 0, 0.6) }, // xz : direction*force, y : rafales
  uWeather: { value: new THREE.Vector4(0, 0, 0, 0) }, // x : humidité, y : neige, z : nuit, w : pluie
  uPlayerPos: { value: new THREE.Vector3() },
};

// Toute compilation de matériau reçoit les uniformes partagés (par référence)
export function injectGlobals(shader) {
  for (const k in GU) shader.uniforms[k] = GU[k];
}
THREE.Material.prototype.onBeforeCompile = function (shader) {
  injectGlobals(shader);
};

const C = THREE.ShaderChunk;

C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif
`;

C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fogWp = batchingMatrix * fogWp;
  #endif
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  vFogWorld = ( modelMatrix * fogWp ).xyz;
#endif
`;

// Déclarations communes à tous les shaders (via le bloc « common » de three.js)
export const GLOBAL_DECL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFogParams;
uniform vec3 uWind;
uniform vec4 uWeather;
uniform vec3 uPlayerPos;
`;
C.common = GLOBAL_DECL + C.common;

export const FOG_FUNC = /* glsl */ `
vec3 applyAtmosphere( vec3 col, vec3 wp ) {
  vec3 rd = wp - cameraPosition;
  float dist = length( rd );
  rd /= max( dist, 1e-4 );
  float a = uFogParams.x;
  float b = uFogParams.y;
  float h0 = max( cameraPosition.y - uFogParams.z, -40.0 );
  float k = b * rd.y;
  float amount = a * exp( -b * h0 ) * dist;
  if ( abs( k ) > 1e-4 ) amount *= ( 1.0 - exp( -k * dist ) ) / ( k * dist );
  float f = min( 1.0 - exp( -amount ), uFogParams.w );
  float sunAmt = pow( max( dot( rd, uSunDir ), 0.0 ), 6.0 );
  vec3 fc = mix( uFogColor, uFogSunColor, sunAmt );
  return mix( col, fc, f );
}
`;

C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
  ${FOG_FUNC}
#endif
`;

// La brume est appliquée en espace linéaire, AVANT le mappage des tons (comme le ciel)
C.fog_fragment = '';
C.tonemapping_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = applyAtmosphere( gl_FragColor.rgb, vFogWorld );
#endif
` + C.tonemapping_fragment + /* glsl */ `
#if defined( TONE_MAPPING )
  {
    float lumaG = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    gl_FragColor.rgb = max( mix( vec3( lumaG ), gl_FragColor.rgb, 1.2 ), 0.0 );
    // Légère courbe en S (contraste)
    gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * gl_FragColor.rgb * ( 3.0 - 2.0 * gl_FragColor.rgb ), 0.35 );
  }
#endif
`;

// Bruit utilitaire GLSL réutilisé par plusieurs shaders
export const GLSL_NOISE = /* glsl */ `
float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
vec2 hash22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1, 0 ) ), u.x ),
              mix( hash12( i + vec2( 0, 1 ) ), hash12( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm2( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i++ ) { s += a * vnoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;
