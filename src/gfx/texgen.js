// Générateur de textures procédurales sur GPU (bruits périodiques => textures raccordables).
// Chaque générateur produit couleur+rugosité et normale+hauteur, relus en DataTexture.
import * as THREE from 'three';

export const GLSL_TILE = /* glsl */ `
vec2 h22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
float h12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
// Bruit de gradient périodique
float gn( vec2 p, vec2 per ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  vec2 a = h22( mod( i, per ) ) * 2.0 - 1.0;
  vec2 b = h22( mod( i + vec2( 1, 0 ), per ) ) * 2.0 - 1.0;
  vec2 c = h22( mod( i + vec2( 0, 1 ), per ) ) * 2.0 - 1.0;
  vec2 d = h22( mod( i + vec2( 1, 1 ), per ) ) * 2.0 - 1.0;
  return 1.4 * mix( mix( dot( a, f ), dot( b, f - vec2( 1, 0 ) ), u.x ),
                    mix( dot( c, f - vec2( 0, 1 ) ), dot( d, f - vec2( 1, 1 ) ), u.x ), u.y );
}
float fbm( vec2 uv, float scale, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  vec2 per = vec2( scale );
  vec2 p = uv * scale;
  for ( int i = 0; i < 8; i++ ) {
    if ( i >= oct ) break;
    s += a * gn( p + float( i ) * 7.31, per );
    n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
float ridge( vec2 uv, float scale, int oct ) {
  float s = 0.0, a = 0.5, n = 0.0;
  vec2 per = vec2( scale );
  vec2 p = uv * scale;
  for ( int i = 0; i < 8; i++ ) {
    if ( i >= oct ) break;
    float v = 1.0 - abs( gn( p + float( i ) * 3.7, per ) );
    s += a * v * v;
    n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
// Voronoï périodique : x = F1, y = F2, z = id de cellule, w = angle aléatoire
vec4 vor( vec2 uv, float scale ) {
  vec2 p = uv * scale;
  vec2 i = floor( p ), f = fract( p );
  float d1 = 9.0, d2 = 9.0; vec2 idc = vec2( 0 );
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) );
    vec2 c = mod( i + g, vec2( scale ) );
    vec2 o = h22( c );
    vec2 r = g + o - f;
    float d = dot( r, r );
    if ( d < d1 ) { d2 = d1; d1 = d; idc = c; } else if ( d < d2 ) d2 = d;
  }
  return vec4( sqrt( d1 ), sqrt( d2 ), h12( idc ), h12( idc + 13.7 ) );
}
// Cellule : décalage du point local par rapport au centre (pour dessiner des formes orientées)
vec4 cellLocal( vec2 uv, float scale, vec2 jitterSeed, out vec2 cid ) {
  vec2 p = uv * scale;
  vec2 i = floor( p ), f = fract( p );
  float best = 9.0; vec2 bl = vec2( 0 ); cid = vec2( 0 );
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) );
    vec2 c = mod( i + g, vec2( scale ) );
    vec2 o = h22( c + jitterSeed );
    vec2 r = g + o - f;
    float d = dot( r, r );
    if ( d < best ) { best = d; bl = r; cid = c + jitterSeed; }
  }
  return vec4( bl, sqrt( best ), h12( cid ) );
}
vec2 rot2( vec2 v, float a ) { float c = cos( a ), s = sin( a ); return vec2( c * v.x - s * v.y, s * v.x + c * v.y ); }
float sdSeg( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ); }
vec3 srgb( vec3 c ) { return c; }
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

function makeFrag(body) {
  return /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uMode;
uniform float uTexel;
uniform float uSeed;
uniform float uNormalStrength;
${GLSL_TILE}
${body}
void main() {
  vec3 alb; float rough; float h;
  vec2 uv = vUv;
  if ( uMode < 0.5 ) {
    layer( uv, alb, rough, h );
    gl_FragColor = vec4( clamp( alb, 0.0, 1.0 ), clamp( rough, 0.0, 1.0 ) );
  } else {
    vec3 a2; float r2; float hx; float hy; float h0;
    layer( uv, a2, r2, h0 );
    layer( fract( uv + vec2( uTexel, 0.0 ) ), a2, r2, hx );
    layer( fract( uv + vec2( 0.0, uTexel ) ), a2, r2, hy );
    vec3 n = normalize( vec3( ( h0 - hx ) * uNormalStrength, ( h0 - hy ) * uNormalStrength, 1.0 ) );
    gl_FragColor = vec4( n * 0.5 + 0.5, clamp( h0, 0.0, 1.0 ) );
  }
}`;
}

export class TexGen {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.cache = new Map();
  }

  // Rend un générateur et relit les pixels (RGBA 8 bits)
  renderRaw(name, body, size, mode, extra = {}) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: makeFrag(body),
      uniforms: {
        uMode: { value: mode },
        uTexel: { value: 1 / size },
        uSeed: { value: extra.seed || 0 },
        uNormalStrength: { value: (extra.normalStrength || 4) * size / 512 },
        ...(extra.uniforms || {}),
      },
      depthTest: false,
      depthWrite: false,
    });
    mat.onBeforeCompile = () => {};
    this.quad.material = mat;
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: false });
    const prev = this.r.getRenderTarget();
    const tm = this.r.toneMapping;
    this.r.toneMapping = THREE.NoToneMapping;
    this.r.setRenderTarget(rt);
    this.r.render(this.scene, this.cam);
    const buf = new Uint8Array(size * size * 4);
    this.r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    this.r.setRenderTarget(prev);
    this.r.toneMapping = tm;
    rt.dispose();
    mat.dispose();
    return buf;
  }

  // Texture simple (couleur ou normale)
  texture(name, body, size, opts = {}) {
    const key = name + ':' + size + ':' + (opts.mode || 0);
    if (this.cache.has(key)) return this.cache.get(key);
    const data = this.renderRaw(name, body, size, opts.mode || 0, opts);
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = opts.aniso || 4;
    t.colorSpace = opts.mode === 1 ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this.cache.set(key, t);
    return t;
  }

  // Paire couleur/normale
  pair(name, body, size, opts = {}) {
    return {
      map: this.texture(name, body, size, { ...opts, mode: 0 }),
      normal: this.texture(name, body, size, { ...opts, mode: 1 }),
    };
  }

  // Tableau de textures (terrain) : couches empilées
  array(name, bodies, size, mode, opts = {}) {
    const key = 'arr:' + name + ':' + size + ':' + mode;
    if (this.cache.has(key)) return this.cache.get(key);
    const layer = size * size * 4;
    const data = new Uint8Array(layer * bodies.length);
    bodies.forEach((b, i) => {
      data.set(this.renderRaw(name + i, b, size, mode, { ...opts, normalStrength: (opts.strengths || [])[i] || 4 }), i * layer);
    });
    const t = new THREE.DataArrayTexture(data, size, size, bodies.length);
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = opts.aniso || 8;
    t.colorSpace = mode === 1 ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this.cache.set(key, t);
    return t;
  }
}
