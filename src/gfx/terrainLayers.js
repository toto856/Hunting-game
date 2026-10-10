// Couches de sol procédurales (GLSL) : herbe d'automne, litière de feuilles, terre, roche,
// éboulis, boue, mousse, neige. Chaque couche : layer(uv) -> couleur, rugosité, hauteur.

// Brins vus de dessus (traits effilés orientés)
const STROKES = /* glsl */ `
vec4 strokes( vec2 uv, float scale, float len, float width, float seed, float bend ) {
  vec2 p = uv * scale; vec2 i = floor( p ), f = fract( p );
  float best = 0.0; float bid = 0.0; float bt = 0.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) );
    vec2 c = mod( i + g, vec2( scale ) );
    vec2 o = h22( c + seed );
    float ang = h12( c + seed + 5.1 ) * 6.2831;
    vec2 d = vec2( cos( ang ), sin( ang ) );
    vec2 a = g + o - f;
    float t = clamp( dot( -a, d ) / len, 0.0, 1.0 );
    vec2 nrm = vec2( -d.y, d.x );
    vec2 cl = a + d * len * t + nrm * bend * t * t * ( h12( c + 2.0 ) - 0.5 );
    float dist = length( cl );
    float w = width * ( 1.0 - t * 0.9 );
    float cov = smoothstep( w, w * 0.25, dist );
    if ( cov > best ) { best = cov; bid = h12( c + seed + 9.9 ); bt = t; }
  }
  return vec4( best, bid, bt, 0.0 );
}
`;

export const GRASS = STROKES + /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 3.0, 4 ) * 0.5 + 0.5;
  vec3 soil = mix( vec3( 0.24, 0.19, 0.12 ), vec3( 0.33, 0.27, 0.17 ), fbm( uv + 3.1, 14.0, 3 ) * 0.5 + 0.5 );
  alb = soil * 0.8; h = 0.05; rough = 0.95;
  vec3 g1 = vec3( 0.30, 0.38, 0.12 ), g2 = vec3( 0.40, 0.43, 0.17 ), g3 = vec3( 0.58, 0.52, 0.30 ), g4 = vec3( 0.46, 0.39, 0.22 );
  for ( int L = 0; L < 5; L++ ) {
    float fl = float( L );
    vec4 s = strokes( uv, 18.0 + fl * 9.0, 0.9 + 0.25 * fl, 0.11, fl * 13.7, 0.6 );
    float dry = smoothstep( 0.45, 0.85, n + ( s.y - 0.5 ) * 0.6 );
    vec3 c = mix( mix( g1, g2, s.y ), mix( g3, g4, s.y ), dry * 0.75 );
    c *= 0.72 + 0.45 * s.z;
    float hh = 0.25 + fl * 0.15 + s.z * 0.15;
    if ( s.x > 0.35 && hh > h ) { alb = mix( alb, c, s.x ); h = mix( h, hh, s.x ); rough = 0.88; }
  }
  // Petites feuilles mortes et fleurs fanées éparses
  vec4 v = vor( uv, 9.0 );
  float leaf = step( 0.95, v.z ) * smoothstep( 0.1, 0.06, v.x );
  alb = mix( alb, vec3( 0.42, 0.24, 0.1 ) * ( 0.8 + 0.4 * v.w ), leaf );
  h = max( h, leaf * 0.8 );
}
`;

export const FOREST = /* glsl */ `
float leafShape( vec2 q, float len, float wid ) {
  float x = q.x / len;
  float halfw = wid * sin( clamp( x, 0.0, 1.0 ) * 3.14159 ) * ( 1.0 - 0.35 * x ) + 0.004;
  float inside = step( 0.0, x ) * step( x, 1.0 );
  return inside * smoothstep( halfw, halfw * 0.7, abs( q.y ) );
}
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 4.0, 4 ) * 0.5 + 0.5;
  alb = mix( vec3( 0.13, 0.09, 0.055 ), vec3( 0.2, 0.14, 0.08 ), fbm( uv, 20.0, 3 ) * 0.5 + 0.5 );
  h = 0.0; rough = 0.9;
  for ( int L = 0; L < 6; L++ ) {
    float fl = float( L );
    float sc = 7.0 + fl * 2.6;
    vec2 p = uv * sc; vec2 i = floor( p ), f = fract( p );
    for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 c = mod( i + g, vec2( sc ) );
      vec2 o = h22( c + fl * 7.7 );
      float ang = h12( c + fl * 3.3 ) * 6.2831;
      vec2 q = rot2( f - g - o, -ang );
      float len = 0.75 + 0.35 * h12( c + 1.7 );
      float m = leafShape( q + vec2( len * 0.5, 0.0 ), len, 0.26 + 0.08 * h12( c + 4.1 ) );
      if ( m > 0.5 ) {
        float id = h12( c + fl * 11.0 );
        vec3 col = id < 0.3 ? vec3( 0.55, 0.3, 0.11 ) : id < 0.55 ? vec3( 0.64, 0.4, 0.14 ) : id < 0.75 ? vec3( 0.46, 0.33, 0.17 ) : id < 0.9 ? vec3( 0.66, 0.52, 0.22 ) : vec3( 0.3, 0.21, 0.13 );
        float vein = smoothstep( 0.02, 0.0, abs( ( q + vec2( len * 0.5, 0.0 ) ).y ) );
        col *= 0.85 + 0.3 * h12( c + 2.2 ) - vein * 0.15;
        col *= mix( 0.7, 1.0, fl / 5.0 );
        alb = col; h = 0.15 + fl * 0.16 - vein * 0.05; rough = 0.78;
      }
    }
  }
  // Brindilles
  vec2 cid; vec4 cl = cellLocal( uv, 5.0, vec2( 3.3 ), cid );
  float ang = h12( cid ) * 6.28;
  vec2 dd = vec2( cos( ang ), sin( ang ) );
  float tw = smoothstep( 0.035, 0.012, sdSeg( cl.xy, -dd * 0.45, dd * 0.45 ) ) * step( 0.55, cl.w );
  alb = mix( alb, vec3( 0.16, 0.11, 0.07 ), tw );
  h = max( h, tw * 1.05 );
  alb *= 0.9 + 0.2 * n;
}
`;

export const DIRT = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 5.0, 5 );
  float n2 = fbm( uv + 4.0, 22.0, 3 );
  alb = mix( vec3( 0.25, 0.19, 0.13 ), vec3( 0.36, 0.28, 0.19 ), n * 0.5 + 0.5 );
  alb *= 0.9 + 0.12 * n2;
  h = 0.4 + 0.25 * n + 0.1 * n2;
  vec4 v = vor( uv, 26.0 );
  float peb = step( 0.7, v.z ) * smoothstep( 0.3, 0.15, v.x );
  alb = mix( alb, vec3( 0.42, 0.4, 0.36 ) * ( 0.75 + 0.4 * v.w ), peb );
  h += peb * 0.35 * ( 1.0 - v.x * 2.0 );
  // Ornières légères
  float rut = smoothstep( 0.1, 0.0, abs( fract( uv.x * 2.0 + 0.1 * n ) - 0.5 ) - 0.32 );
  h -= rut * 0.08;
  rough = 0.92;
}
`;

export const ROCK = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float b = fbm( uv, 2.0, 6 );
  float r = ridge( uv + 1.3, 3.0, 5 );
  vec4 v = vor( uv, 5.0 );
  float crack = smoothstep( 0.0, 0.07, v.y - v.x );
  vec4 v2 = vor( uv + 0.37, 13.0 );
  float crack2 = smoothstep( 0.0, 0.05, v2.y - v2.x );
  h = 0.45 + 0.25 * b + 0.3 * r;
  h -= ( 1.0 - crack ) * 0.3 + ( 1.0 - crack2 ) * 0.1;
  vec3 c1 = vec3( 0.38, 0.37, 0.35 ), c2 = vec3( 0.55, 0.53, 0.49 ), c3 = vec3( 0.45, 0.4, 0.33 );
  alb = mix( mix( c1, c2, b * 0.5 + 0.5 ), c3, smoothstep( 0.3, 0.8, fbm( uv + 9.0, 4.0, 3 ) * 0.5 + 0.5 ) * 0.5 );
  alb *= 0.85 + 0.25 * v.w;
  alb *= mix( 0.55, 1.0, crack ) * mix( 0.8, 1.0, crack2 );
  // Lichens
  float lich = smoothstep( 0.62, 0.7, fbm( uv + 2.0, 9.0, 4 ) * 0.5 + 0.5 );
  float lich2 = smoothstep( 0.68, 0.72, fbm( uv + 5.0, 16.0, 3 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.55, 0.56, 0.38 ), lich * 0.7 );
  alb = mix( alb, vec3( 0.72, 0.72, 0.68 ), lich2 * 0.6 );
  rough = 0.82 - lich * 0.05;
}
`;

export const GRAVEL = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  alb = vec3( 0.2, 0.18, 0.16 ); h = 0.0; rough = 0.85;
  for ( int L = 0; L < 3; L++ ) {
    float fl = float( L );
    vec4 v = vor( uv + fl * 0.31, 9.0 + fl * 11.0 );
    float r = 0.42 - fl * 0.04;
    float dome = sqrt( max( 0.0, 1.0 - pow( v.x / r, 2.0 ) ) );
    float edge = smoothstep( 0.0, 0.08, v.y - v.x );
    float hh = dome * edge * ( 0.6 + 0.4 * v.w ) * ( 1.0 - fl * 0.2 ) + fl * 0.05;
    if ( hh > h ) {
      vec3 c = v.z < 0.33 ? vec3( 0.48, 0.46, 0.43 ) : v.z < 0.66 ? vec3( 0.55, 0.5, 0.42 ) : vec3( 0.36, 0.35, 0.34 );
      alb = c * ( 0.7 + 0.45 * dome ) * ( 0.85 + 0.3 * h12( vec2( v.z, v.w ) ) );
      h = hh;
    }
  }
  alb *= 0.9 + 0.15 * fbm( uv, 6.0, 3 );
}
`;

export const MUD = STROKES + /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 3.0, 5 );
  float puddle = smoothstep( 0.12, 0.2, fbm( uv + 7.0, 2.0, 4 ) );
  alb = mix( vec3( 0.15, 0.115, 0.08 ), vec3( 0.24, 0.18, 0.12 ), n * 0.5 + 0.5 );
  h = 0.5 + 0.3 * n + 0.08 * fbm( uv, 30.0, 2 );
  alb = mix( alb, vec3( 0.08, 0.075, 0.06 ), puddle );
  h = mix( h, 0.3, puddle );
  rough = mix( 0.5, 0.08, puddle );
  vec4 s = strokes( uv, 14.0, 1.2, 0.08, 4.4, 0.4 );
  float st = s.x * step( 0.55, s.y ) * ( 1.0 - puddle );
  alb = mix( alb, vec3( 0.4, 0.33, 0.18 ) * ( 0.7 + 0.4 * s.z ), st );
  h = max( h, st * 0.9 );
}
`;

export const MOSS = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 6.0, 5 );
  float f = fbm( uv + 3.0, 40.0, 3 );
  vec4 v = vor( uv, 30.0 );
  h = 0.5 + 0.3 * n + 0.2 * ( 1.0 - v.x );
  alb = mix( vec3( 0.13, 0.22, 0.05 ), vec3( 0.3, 0.38, 0.1 ), n * 0.5 + 0.5 );
  alb *= 0.75 + 0.35 * ( 1.0 - v.x ) + 0.1 * f;
  alb = mix( alb, vec3( 0.28, 0.22, 0.1 ), smoothstep( 0.55, 0.75, fbm( uv + 1.0, 5.0, 3 ) * 0.5 + 0.5 ) * 0.4 );
  rough = 0.96;
}
`;

export const SNOW = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 2.0, 5 );
  float f = fbm( uv + 2.0, 12.0, 4 );
  h = 0.5 + 0.35 * n + 0.15 * f;
  alb = vec3( 0.86, 0.89, 0.93 ) * ( 0.94 + 0.06 * f );
  float sp = step( 0.985, h12( floor( uv * 512.0 ) ) );
  alb += sp * 0.1;
  rough = 0.62 - sp * 0.3;
}
`;

export const LAYERS = [GRASS, FOREST, DIRT, ROCK, GRAVEL, MUD, MOSS, SNOW];
export const LAYER_STRENGTH = [3.5, 5, 4, 6, 7, 3, 4, 2];
