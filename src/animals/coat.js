// Pelages : peints sur GPU dans l'espace de texture de l'animal (chaque texel connaît
// sa position sur le corps). Couleur sRGB + rugosité (alpha). Variantes rares incluses.
import * as THREE from 'three';
import { GLSL_NOISE } from '../gfx/globals.js';

const COMMON = /* glsl */ `
${GLSL_NOISE}
varying vec3 vP; varying vec3 vN; varying float vReg; varying vec2 vUv; varying vec2 vUv1;
uniform vec3 uBase; uniform float uSex; uniform float uFur; uniform float uScale; uniform float uSeed;
float sstep( float a, float b, float x ) { return smoothstep( a, b, x ); }
float topK() { return clamp( vN.y * 0.5 + 0.5, 0.0, 1.0 ); }
float fbmS( vec3 p ) { return fbm2( p.xz * 7.0 + p.y * 3.0 + uSeed ); }
// Taches pie (grandes plages blanches)
float pie( vec3 p ) { return smoothstep( 0.52, 0.56, fbm2( p.zy * 3.2 + vec2( p.x * 2.0, 0.0 ) + uSeed * 3.0 ) ); }
`;

// Chaque fonction : vec3 coat() utilise vP (m, échelle 1), vN, vReg, vUv
const COATS = {
  cerf: /* glsl */ `
vec4 coat() {
  vec3 p = vP; float top = topK(); float bot = 1.0 - top;
  vec3 c = uBase;
  float n = fbmS( p );
  c *= 0.92 + 0.16 * n;
  c *= 1.0 - 0.14 * sstep( 0.65, 1.0, top );
  // Ventre plus sombre, intérieur des cuisses plus clair
  c = mix( c, c * vec3( 0.72, 0.7, 0.68 ), sstep( 0.6, 0.95, bot ) * step( vReg, 0.5 ) );
  // Cou et crinière du cerf : brun sombre, fondu progressif vers les épaules
  {
    float neckK = sstep( 0.5, 0.78, p.z ) * ( 1.0 - sstep( 0.98, 1.06, p.z ) );
    float mane = uSex * ( 0.5 + 0.5 * bot ) * neckK;
    c = mix( c, vec3( 0.2, 0.14, 0.095 ) * ( 0.9 + 0.2 * n ), mane * 0.8 );
  }
  // Tête : grise, museau clair, nez noir
  if ( vReg > 1.5 && vReg < 2.5 ) {
    c = mix( c, vec3( 0.44, 0.38, 0.32 ), 0.55 );
    float muzzle = sstep( 1.3, 1.42, p.z );
    c = mix( c, vec3( 0.62, 0.57, 0.5 ), muzzle * sstep( 0.4, 0.9, bot ) );
    float nose = sstep( 1.415, 1.445, p.z ) * sstep( 0.3, 0.6, top + 0.2 );
    c = mix( c, vec3( 0.045, 0.04, 0.04 ), nose );
    // Larmier sombre devant l'œil
    float lar = 1.0 - sstep( 0.0, 0.018, distance( vec3( abs( p.x ), p.y, p.z ), vec3( 0.065, 1.61, 1.165 ) ) );
    c = mix( c, vec3( 0.1, 0.08, 0.07 ), lar * 0.8 );
  }
  // Pattes : plus sombres vers le bas, sabots noirs
  if ( vReg > 2.5 && vReg < 3.5 ) {
    c = mix( c, vec3( 0.27, 0.22, 0.18 ), sstep( 0.55, 0.25, p.y ) );
    c = mix( c, vec3( 0.05, 0.045, 0.04 ), sstep( 0.055, 0.035, p.y ) );
  }
  // Miroir (fesses) crème
  float mir = sstep( -0.7, -0.8, p.z ) * sstep( 0.16, 0.08, abs( p.x ) ) * sstep( 0.78, 0.9, p.y );
  if ( vReg > 3.5 && vReg < 4.5 ) mir = 1.0 - 0.6 * top;
  c = mix( c, vec3( 0.8, 0.68, 0.48 ) * ( 0.95 + 0.1 * n ), mir );
  // Oreilles : intérieur clair
  if ( vReg > 4.5 ) c = mix( c, vec3( 0.72, 0.66, 0.58 ), vUv.x > 0.93 ? 0.7 : 0.0 );
  return vec4( c, vUv.x < 0.72 && p.z > 1.415 ? 0.35 : 0.85 );
}`,
  chevreuil: /* glsl */ `
vec4 coat() {
  vec3 p = vP; float top = topK(); float bot = 1.0 - top;
  vec3 c = uBase;
  float n = fbmS( p );
  c *= 0.93 + 0.14 * n;
  c *= 1.0 - 0.1 * sstep( 0.7, 1.0, top );
  c = mix( c, c * 1.18 + 0.04, sstep( 0.7, 0.95, bot ) * step( vReg, 1.5 ) );
  if ( vReg > 1.5 && vReg < 2.5 ) {
    c = mix( c, uBase * 0.85, 0.5 );
    float nose = sstep( 0.79, 0.81, p.z ) * sstep( 0.2, 0.6, top + 0.25 );
    float must = sstep( 0.74, 0.76, p.z ) * sstep( 0.79, 0.77, p.z ) * sstep( 0.2, 0.6, 1.0 - abs( vN.y ) );
    float chin = sstep( 0.72, 0.78, p.z ) * sstep( 0.6, 0.85, bot );
    c = mix( c, vec3( 0.04 ), max( nose, must * 0.9 ) );
    c = mix( c, vec3( 0.9, 0.88, 0.84 ), chin );
  }
  // Taches blanches de la gorge (pelage d'hiver)
  if ( vReg > 0.5 && vReg < 1.5 ) {
    float g1 = 1.0 - sstep( 0.02, 0.045, distance( vec2( p.z, p.y ), vec2( 0.52, 0.86 ) ) );
    float g2 = 1.0 - sstep( 0.015, 0.035, distance( vec2( p.z, p.y ), vec2( 0.58, 0.97 ) ) );
    c = mix( c, vec3( 0.9, 0.88, 0.84 ), max( g1, g2 ) * sstep( 0.5, 0.8, bot ) );
  }
  if ( vReg > 2.5 && vReg < 3.5 ) {
    c = mix( c, c * 1.12 + 0.03, sstep( 0.4, 0.2, p.y ) );
    c = mix( c, vec3( 0.05, 0.045, 0.04 ), sstep( 0.04, 0.025, p.y ) );
  }
  // Miroir blanc (réniforme chez la chevrette)
  float mx = abs( p.x ) / ( 0.11 + uSex * -0.015 );
  float my = ( p.y - 0.66 ) / 0.13;
  float mir = sstep( -0.36, -0.45, p.z ) * sstep( 1.1, 0.85, length( vec2( mx, my ) ) );
  c = mix( c, vec3( 0.93, 0.91, 0.87 ), mir );
  if ( vReg > 4.5 ) c = mix( c, vec3( 0.12, 0.1, 0.09 ), 0.3 );
  return vec4( c, p.z > 0.79 ? 0.3 : 0.85 );
}`,
  sanglier: /* glsl */ `
vec4 coat() {
  vec3 p = vP; float top = topK(); float bot = 1.0 - top;
  vec3 c = uBase;
  float n = fbmS( p );
  // Soies : pointes claires (poivre et sel)
  float grizz = smoothstep( 0.55, 0.85, vnoise( vUv1 * vec2( 2.0, 6.0 ) * 3.0 + uSeed ) );
  c = mix( c, vec3( 0.46, 0.41, 0.34 ) * ( uFur > 2.5 && uFur < 3.5 ? 1.4 : 1.0 ), grizz * 0.38 * ( 1.0 - sstep( 0.85, 1.0, top ) ) );
  c *= 0.9 + 0.2 * n;
  // Crête dorsale plus sombre
  c *= 1.0 - 0.3 * sstep( 0.8, 1.0, top ) * step( vReg, 1.5 );
  if ( vReg > 1.5 && vReg < 2.5 ) {
    // Joues claires des vieux mâles, groin
    c = mix( c, vec3( 0.4, 0.36, 0.3 ), uSex * 0.4 * sstep( 0.3, 0.8, bot ) * sstep( 0.68, 0.8, p.z ) * sstep( 0.95, 0.85, p.z ) );
    float snout = sstep( 1.035, 1.055, p.z );
    c = mix( c, vec3( 0.42, 0.33, 0.31 ), snout );
  }
  if ( vReg > 2.5 && vReg < 3.5 ) {
    c = mix( c, vec3( 0.07, 0.06, 0.055 ), sstep( 0.35, 0.15, p.y ) );
    c = mix( c, vec3( 0.12, 0.1, 0.09 ), sstep( 0.04, 0.025, p.y ) );
  }
  return vec4( c, p.z > 1.04 ? 0.35 : 0.92 );
}`,
  chamois: /* glsl */ `
vec4 coat() {
  vec3 p = vP; float top = topK(); float bot = 1.0 - top;
  vec3 c = uBase;
  float n = fbmS( p );
  c *= 0.92 + 0.16 * n;
  // Raie dorsale
  c *= 1.0 - 0.35 * sstep( 0.9, 1.0, top ) * step( vReg, 1.5 );
  c = mix( c, c * 1.25 + 0.03, sstep( 0.75, 0.95, bot ) * step( vReg, 0.5 ) );
  if ( vReg > 0.5 && vReg < 1.5 ) {
    // Gorge claire
    c = mix( c, vec3( 0.82, 0.76, 0.62 ), sstep( 0.65, 0.9, bot ) * sstep( 0.5, 0.62, p.z ) );
  }
  if ( vReg > 1.5 && vReg < 2.5 ) {
    // Masque : face crème, bandes sombres de la corne à la commissure
    vec3 face = vec3( 0.86, 0.8, 0.66 );
    float side = abs( p.x );
    vec2 a = vec2( 0.62, 1.07 ), b = vec2( 0.79, 0.97 );
    vec2 q = vec2( p.z, p.y );
    float hq = clamp( dot( q - a, b - a ) / dot( b - a, b - a ), 0.0, 1.0 );
    float dl = length( q - a - ( b - a ) * hq );
    float stripe = ( 1.0 - sstep( 0.012, 0.022, dl ) ) * sstep( 0.025, 0.04, side );
    c = mix( c, face, sstep( 0.62, 0.66, p.z ) );
    c = mix( c, vec3( 0.08, 0.065, 0.055 ), stripe );
    c = mix( c, vec3( 0.06, 0.05, 0.05 ), sstep( 0.825, 0.84, p.z ) * 0.85 );
  }
  if ( vReg > 2.5 && vReg < 3.5 ) {
    c = mix( c, vec3( 0.07, 0.06, 0.05 ), sstep( 0.45, 0.2, p.y ) );
  }
  float mir = sstep( -0.44, -0.5, p.z ) * sstep( 0.09, 0.04, abs( p.x ) ) * sstep( 0.66, 0.74, p.y );
  c = mix( c, vec3( 0.75, 0.7, 0.6 ), mir * 0.8 );
  return vec4( c, p.z > 0.83 ? 0.3 : 0.88 );
}`,
  daim: /* glsl */ `
vec4 coat() {
  vec3 p = vP; float top = topK(); float bot = 1.0 - top;
  vec3 c = uBase;
  float n = fbmS( p );
  c *= 0.93 + 0.14 * n;
  // Raie dorsale sombre
  c = mix( c, c * 0.45, sstep( 0.93, 1.0, top ) * step( vReg, 1.5 ) * sstep( -0.62, -0.4, p.z ) );
  // Ventre blanc
  c = mix( c, vec3( 0.9, 0.87, 0.8 ), sstep( 0.78, 0.95, bot ) * step( vReg, 0.5 ) * ( uFur > 1.5 && uFur < 2.5 ? 0.25 : 1.0 ) );
  // Taches blanches en lignes le long du corps
  if ( vReg < 0.5 ) {
    float ang = atan( p.y - 0.73, p.x ) ;
    vec2 g = vec2( p.z * 22.0, ang * 7.5 );
    vec2 id = floor( g );
    vec2 f = fract( g ) - 0.5 + ( hash22( id + uSeed ) - 0.5 ) * 0.5;
    float spot = 1.0 - sstep( 0.13, 0.24, length( f * vec2( 1.0, 1.25 ) ) );
    spot *= sstep( 0.35, 0.6, top ) * sstep( 0.98, 0.9, top ) * sstep( -0.58, -0.45, p.z ) * sstep( 0.5, 0.35, p.z );
    float line = 1.0 - sstep( 0.006, 0.014, abs( top - 0.42 ) );
    float k = uFur < 0.5 ? 0.75 : uFur < 1.5 ? 0.95 : uFur < 2.5 ? 0.25 : 0.0;
    c = mix( c, vec3( 0.93, 0.9, 0.84 ), max( spot, line * sstep( -0.5, -0.3, p.z ) * sstep( 0.4, 0.2, p.z ) ) * k );
  }
  if ( vReg > 1.5 && vReg < 2.5 ) {
    c = mix( c, c * 1.12, 0.5 );
    c = mix( c, vec3( 0.05 ), sstep( 1.04, 1.055, p.z ) * sstep( 0.2, 0.6, top + 0.2 ) );
  }
  if ( vReg > 2.5 && vReg < 3.5 ) {
    c = mix( c, c * 1.15 + 0.04, sstep( 0.5, 0.2, p.y ) );
    c = mix( c, vec3( 0.06, 0.05, 0.045 ), sstep( 0.045, 0.03, p.y ) );
  }
  // Miroir blanc bordé de noir (fer à cheval), queue noire dessus
  float rx = abs( p.x ) / 0.12, ry = ( p.y - 0.78 ) / 0.13;
  float r = length( vec2( rx, ry ) );
  float back = sstep( -0.55, -0.64, p.z );
  float mir = back * sstep( 1.0, 0.85, r );
  float border = back * sstep( 0.85, 0.95, r ) * sstep( 1.2, 1.05, r ) * step( 0.73, p.y );
  c = mix( c, vec3( 0.93, 0.92, 0.88 ), mir * ( uFur > 2.5 ? 0.0 : 1.0 ) );
  c = mix( c, vec3( 0.06, 0.05, 0.05 ), border * ( uFur > 2.5 ? 0.0 : 1.0 ) );
  if ( vReg > 3.5 && vReg < 4.5 ) c = mix( vec3( 0.93, 0.92, 0.88 ), vec3( 0.07, 0.06, 0.05 ), sstep( 0.4, 0.7, top ) );
  return vec4( c, p.z > 1.045 ? 0.3 : 0.85 );
}`,
};

const VERT = /* glsl */ `
attribute float aRegion;
attribute vec2 uv1;
varying vec3 vP; varying vec3 vN; varying float vReg; varying vec2 vUv; varying vec2 vUv1;
uniform vec2 uOffset;
uniform float uScale;
void main() {
  vP = position / uScale; vN = normal; vReg = aRegion; vUv = uv; vUv1 = uv1;
  gl_Position = vec4( uv * 2.0 - 1.0 + uOffset, 0.0, 1.0 );
}`;

function fragFor(species) {
  return /* glsl */ `
${COMMON}
${COATS[species]}
void main() {
  vec4 c = coat();
  // Variantes : 0..n selon l'espèce ; pie / mélanique / albinos traités ici
  if ( uFur > 9.5 && uFur < 10.5 ) c.rgb = mix( c.rgb, vec3( 0.93, 0.92, 0.88 ), pie( vP ) );
  if ( uFur > 10.5 && uFur < 11.5 ) c.rgb = c.rgb * 0.25 + vec3( 0.03, 0.025, 0.02 );
  if ( uFur > 11.5 ) c.rgb = mix( vec3( 0.92, 0.89, 0.84 ), vec3( 0.86, 0.62, 0.6 ), step( c.r + c.g + c.b, 0.2 ) );
  gl_FragColor = vec4( clamp( c.rgb, 0.0, 1.0 ), c.a );
}`;
}

// Couleurs de base des pelages (sRGB)
export const FUR_BASE = {
  cerf: { brun: [0.42, 0.31, 0.215], gris: [0.43, 0.38, 0.32], fonce: [0.29, 0.21, 0.15], clair: [0.56, 0.43, 0.29] },
  chevreuil: { gris: [0.44, 0.38, 0.31], roux: [0.6, 0.36, 0.19], fonce: [0.31, 0.26, 0.21] },
  sanglier: { noir: [0.11, 0.095, 0.085], brun: [0.25, 0.21, 0.17], fonce: [0.17, 0.14, 0.12], roux: [0.42, 0.28, 0.17] },
  chamois: { hiver: [0.17, 0.135, 0.11], fonce: [0.26, 0.2, 0.15], clair: [0.56, 0.43, 0.29] },
  daim: { commun: [0.5, 0.33, 0.19], menil: [0.66, 0.5, 0.33], noir: [0.13, 0.11, 0.1], blanc: [0.9, 0.88, 0.82] },
};

const FUR_CODE = { pie: 10, melanique: 11, albinos: 12 };

export class CoatPainter {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new Map();
    this.materials = {};
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  paint(species, sex, fur, geometry, scale, size = 1024) {
    const key = species + sex + fur + size;
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.materials[species]) {
      this.materials[species] = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: fragFor(species),
        uniforms: {
          uBase: { value: new THREE.Color() }, uSex: { value: 1 }, uFur: { value: 0 }, uScale: { value: 1 },
          uSeed: { value: 0 }, uOffset: { value: new THREE.Vector2() },
        },
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      this.materials[species].onBeforeCompile = () => {};
    }
    const mat = this.materials[species];
    const bases = FUR_BASE[species];
    const baseKey = bases[fur] ? fur : Object.keys(bases)[0];
    const b = bases[baseKey];
    mat.uniforms.uBase.value.setRGB(b[0], b[1], b[2]);
    mat.uniforms.uSex.value = sex === 'm' ? 1 : 0;
    const furIndex = FUR_CODE[fur] ?? Object.keys(bases).indexOf(baseKey);
    mat.uniforms.uFur.value = furIndex;
    mat.uniforms.uScale.value = scale;
    mat.uniforms.uSeed.value = (species.length * 13.7) % 7;
    const w = size, h = size / 2;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const prev = this.r.getRenderTarget();
    const tm = this.r.toneMapping;
    this.r.toneMapping = THREE.NoToneMapping;
    this.r.setRenderTarget(rt);
    this.r.setClearColor(0x000000, 0);
    this.r.clear();
    // Bordures dilatées (évite les coutures dans les mip-maps)
    const offs = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2], [1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
    for (const [ox, oy] of offs) {
      mat.uniforms.uOffset.value.set((ox * 2) / w, (oy * 2) / h);
      this.r.render(scene, this.cam);
    }
    const buf = new Uint8Array(w * h * 4);
    this.r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    this.r.setRenderTarget(prev);
    this.r.toneMapping = tm;
    rt.dispose();
    const tex = new THREE.DataTexture(buf, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.cache.set(key, tex);
    return tex;
  }
}
