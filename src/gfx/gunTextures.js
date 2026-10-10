// Textures procédurales des armes : bois (noyer, ronce, lamellé), polymère, camouflages,
// métaux (jaspé, damas), gravures ; tissus des tenues ; cuir des gants.

export const WOOD = {
  noyer: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float w = fbm( vec2( uv.x * 0.5, uv.y * 4.0 ), 4.0, 4 );
  float rings = sin( ( uv.y * 40.0 + w * 9.0 + fbm( uv, 3.0, 3 ) * 6.0 ) ) * 0.5 + 0.5;
  float fine = fbm( vec2( uv.x * 2.0, uv.y * 60.0 ), 8.0, 3 ) * 0.5 + 0.5;
  alb = mix( vec3( 0.27, 0.14, 0.07 ), vec3( 0.42, 0.24, 0.12 ), rings * 0.7 + fine * 0.3 );
  alb *= 0.85 + 0.2 * fbm( uv + 3.0, 6.0, 3 );
  h = rings * 0.3 + fine * 0.2;
  rough = 0.42;
}`,
  ronceux: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float burl = 0.0;
  vec2 q = uv;
  for ( int i = 0; i < 3; i++ ) {
    vec4 v = vor( q + float( i ) * 0.37, 6.0 + float( i ) * 4.0 );
    burl += smoothstep( 0.0, 0.25, v.x ) * 0.33;
  }
  float swirl = sin( ( fbm( uv, 3.0, 4 ) * 18.0 + burl * 6.0 ) ) * 0.5 + 0.5;
  alb = mix( vec3( 0.16, 0.075, 0.035 ), vec3( 0.48, 0.27, 0.12 ), swirl * 0.6 + burl * 0.4 );
  alb = mix( alb, vec3( 0.08, 0.04, 0.02 ), smoothstep( 0.82, 0.95, 1.0 - burl ) * 0.6 );
  h = swirl * 0.3;
  rough = 0.3;
}`,
  lamelle: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float band = fract( uv.x * 14.0 + fbm( uv, 2.0, 3 ) * 0.8 );
  float tone = h12( vec2( floor( uv.x * 14.0 + fbm( uv, 2.0, 3 ) * 0.8 ), 3.0 ) );
  alb = mix( vec3( 0.25, 0.25, 0.24 ), vec3( 0.48, 0.47, 0.44 ), tone ) * ( 0.9 + 0.15 * smoothstep( 0.0, 0.1, band ) );
  h = tone * 0.2;
  rough = 0.45;
}`,
  synthetique: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 32.0, 3 );
  alb = vec3( 0.06, 0.062, 0.065 ) * ( 0.9 + 0.2 * n );
  h = 0.5 + 0.3 * n;
  rough = 0.62;
}`,
  camo: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float a = fbm( uv, 3.0, 4 ), b = fbm( uv + 5.0, 5.0, 3 ), c = fbm( uv + 9.0, 8.0, 3 );
  alb = vec3( 0.32, 0.22, 0.12 );
  alb = mix( alb, vec3( 0.52, 0.36, 0.17 ), smoothstep( 0.0, 0.1, a ) );
  alb = mix( alb, vec3( 0.16, 0.13, 0.08 ), smoothstep( 0.15, 0.25, b ) );
  alb = mix( alb, vec3( 0.62, 0.42, 0.2 ), smoothstep( 0.35, 0.42, c ) );
  h = 0.5; rough = 0.6;
}`,
  camo_ros: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float s = 0.0;
  for ( int i = 0; i < 4; i++ ) {
    float fi = float( i );
    float x = uv.x * ( 9.0 + fi * 5.0 ) + fbm( vec2( uv.y * 2.0, fi ), 2.0, 2 ) * 1.5;
    s = max( s, smoothstep( 0.42, 0.5, abs( fract( x + fi * 0.3 ) - 0.5 ) * ( 0.8 + 0.4 * h12( vec2( floor( x ), fi ) ) ) ) );
  }
  alb = mix( vec3( 0.55, 0.48, 0.3 ), vec3( 0.28, 0.25, 0.15 ), s );
  h = 0.5; rough = 0.6;
}`,
};

export const METAL = {
  jaspe: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float a = fbm( uv, 4.0, 5 ), b = fbm( uv + 3.0, 7.0, 4 );
  alb = mix( vec3( 0.12, 0.14, 0.22 ), vec3( 0.5, 0.36, 0.18 ), smoothstep( -0.2, 0.4, a ) );
  alb = mix( alb, vec3( 0.42, 0.18, 0.35 ), smoothstep( 0.2, 0.5, b ) * 0.5 );
  alb = mix( alb, vec3( 0.6, 0.62, 0.66 ), smoothstep( 0.45, 0.6, a * b + 0.3 ) * 0.4 );
  h = 0.5; rough = 0.28;
}`,
  damas: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float w = sin( uv.x * 60.0 + fbm( uv, 4.0, 4 ) * 14.0 + sin( uv.y * 20.0 ) * 2.0 );
  alb = mix( vec3( 0.12, 0.12, 0.13 ), vec3( 0.55, 0.55, 0.57 ), smoothstep( -0.3, 0.3, w ) );
  h = 0.5 + 0.1 * w; rough = 0.32;
}`,
  gravure: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  // Rinceaux : spirales et feuilles stylisées
  vec2 cid; vec4 c = cellLocal( uv, 5.0, vec2( 1.0 ), cid );
  float r = length( c.xy );
  float ang = atan( c.y, c.x );
  float spiral = abs( fract( r * 9.0 - ang / 6.2831 * 2.0 ) - 0.5 );
  float line = smoothstep( 0.1, 0.03, spiral ) * smoothstep( 0.55, 0.2, r );
  vec4 v = vor( uv, 18.0 );
  float dots = smoothstep( 0.08, 0.04, v.x ) * 0.6;
  float m = max( line, dots );
  h = 0.6 - m * 0.5;
  alb = vec3( 0.8 - m * 0.5 );
  rough = 0.3 + m * 0.3;
}`,
};

// Tissus des tenues (motif + couleur) : u, v en mètres approximatifs
export const FABRIC = /* glsl */ `
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uPattern;
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float weave = ( sin( uv.x * 900.0 ) * sin( uv.y * 900.0 ) ) * 0.5 + 0.5;
  float n = fbm( uv, 6.0, 4 );
  alb = uC0;
  if ( uPattern < 0.5 ) { // loden
    alb = mix( uC0, uC1, fbm( uv, 24.0, 3 ) * 0.5 + 0.5 );
  } else if ( uPattern < 1.5 ) { // orange
    alb = uC0 * ( 0.9 + 0.15 * n );
  } else if ( uPattern < 2.5 ) { // feuilles d'automne
    vec2 cid; vec4 c = cellLocal( uv, 9.0, vec2( 2.0 ), cid );
    float leaf = smoothstep( 0.32, 0.25, length( c.xy * vec2( 1.0, 1.8 ) ) );
    float t = h12( cid );
    alb = mix( uC0, t < 0.33 ? uC1 : t < 0.66 ? uC2 : uC3, leaf );
    alb = mix( alb, uC2, smoothstep( 0.1, 0.2, fbm( uv, 4.0, 3 ) ) * 0.4 );
  } else if ( uPattern < 3.5 ) { // roseaux
    float s = smoothstep( 0.4, 0.5, abs( fract( uv.x * 14.0 + n * 1.5 ) - 0.5 ) );
    alb = mix( uC0, uC1, s );
    alb = mix( alb, uC2, smoothstep( 0.2, 0.3, fbm( uv + 4.0, 5.0, 3 ) ) * 0.5 );
  } else if ( uPattern < 4.5 ) { // roche
    alb = mix( uC0, uC1, smoothstep( -0.1, 0.2, n ) );
    alb = mix( alb, uC2, smoothstep( 0.3, 0.45, fbm( uv + 7.0, 10.0, 3 ) ) );
  } else if ( uPattern < 5.5 ) { // ghillie
    alb = mix( uC0, uC1, smoothstep( -0.2, 0.3, n ) );
    alb = mix( alb, uC2, smoothstep( 0.2, 0.5, fbm( uv * 3.0, 20.0, 2 ) ) * 0.6 );
    alb = mix( alb, uC3, smoothstep( 0.4, 0.6, fbm( uv + 2.0, 12.0, 3 ) ) * 0.5 );
  } else if ( uPattern < 6.5 ) { // tweed : chevrons
    float ch = abs( fract( uv.x * 60.0 + abs( fract( uv.y * 60.0 ) - 0.5 ) ) - 0.5 );
    alb = mix( uC0, uC1, smoothstep( 0.2, 0.3, ch ) );
    alb = mix( alb, uC2, step( 0.97, fract( uv.x * 6.0 ) ) * 0.6 );
  } else { // grand veneur : drap vert, galons rouges et or
    alb = uC0 * ( 0.9 + 0.1 * n );
    alb = mix( alb, uC1, step( 0.92, fract( uv.y * 4.0 ) ) );
    alb = mix( alb, uC2, step( 0.97, fract( uv.y * 4.0 + 0.02 ) ) );
  }
  alb *= 0.9 + 0.12 * weave;
  h = 0.5 + 0.3 * weave;
  rough = 0.9;
}`;

export const LEATHER = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec4 v = vor( uv, 40.0 );
  float g = smoothstep( 0.0, 0.08, v.y - v.x );
  float n = fbm( uv, 8.0, 3 );
  alb = mix( vec3( 0.16, 0.11, 0.075 ), vec3( 0.26, 0.18, 0.12 ), n * 0.5 + 0.5 ) * ( 0.85 + 0.15 * g );
  h = 0.5 + 0.2 * g;
  rough = 0.7;
}`;

export const PATTERN_INDEX = { loden: 0, orange: 1, leaves: 2, reeds: 3, rock: 4, ghillie: 5, tweed: 6, veneur: 7 };
