// Textures procédurales de la végétation : écorces et grappes de feuilles/aiguilles (avec alpha).

// --- Écorces : u autour du tronc, v le long
export const BARK = {
  oak: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec2 p = vec2( uv.x, uv.y );
  float fiss = ridge( vec2( p.x * 1.0 + 0.08 * fbm( p, 4.0, 3 ), p.y * 0.35 ), 6.0, 4 );
  float plates = fbm( vec2( p.x, p.y * 0.4 ), 8.0, 4 );
  h = 0.25 + 0.55 * fiss + 0.2 * plates;
  float deep = smoothstep( 0.55, 0.25, fiss );
  alb = mix( vec3( 0.25, 0.22, 0.19 ), vec3( 0.36, 0.33, 0.29 ), plates * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.09, 0.075, 0.06 ), deep * 0.85 );
  float moss = smoothstep( 0.55, 0.75, fbm( uv + 3.0, 3.0, 3 ) * 0.5 + 0.5 ) * smoothstep( 0.4, 0.0, uv.y );
  alb = mix( alb, vec3( 0.2, 0.28, 0.08 ), moss * 0.6 );
  rough = 0.92;
}`,
  beech: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 3.0, 5 );
  float f = fbm( vec2( uv.x * 3.0, uv.y * 0.6 ), 10.0, 3 );
  h = 0.5 + 0.1 * n + 0.05 * f;
  alb = mix( vec3( 0.42, 0.42, 0.4 ), vec3( 0.55, 0.55, 0.52 ), n * 0.5 + 0.5 );
  // Marques horizontales et taches de lichen
  float mark = smoothstep( 0.03, 0.0, abs( fract( uv.y * 6.0 + 0.3 * fbm( uv, 2.0, 2 ) ) - 0.5 ) - 0.46 ) * step( 0.5, fbm( uv + 4.0, 4.0, 2 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.26, 0.26, 0.25 ), mark * 0.6 );
  float lich = smoothstep( 0.6, 0.66, fbm( uv + 1.0, 6.0, 4 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.5, 0.55, 0.42 ), lich * 0.5 );
  float green = smoothstep( 0.55, 0.8, fbm( uv + 7.0, 2.0, 3 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.28, 0.34, 0.2 ), green * 0.35 );
  h -= mark * 0.05;
  rough = 0.75;
}`,
  birch: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 4.0, 4 );
  alb = mix( vec3( 0.78, 0.77, 0.73 ), vec3( 0.9, 0.89, 0.86 ), n * 0.5 + 0.5 );
  h = 0.6 + 0.05 * n;
  // Lenticelles : tirets horizontaux sombres
  vec2 q = vec2( uv.x * 5.0, uv.y * 26.0 );
  vec2 cid = floor( q );
  float r = h12( mod( cid, vec2( 5.0, 26.0 ) ) );
  vec2 f = fract( q );
  float len = 0.3 + 0.6 * r;
  float dash = step( 0.55, r ) * smoothstep( 0.18, 0.08, abs( f.y - 0.5 ) ) * smoothstep( len * 0.5, len * 0.5 - 0.06, abs( f.x - 0.5 ) );
  alb = mix( alb, vec3( 0.12, 0.1, 0.09 ), dash );
  h -= dash * 0.2;
  // Plaques noires crevassées
  float patchy = smoothstep( 0.62, 0.7, fbm( vec2( uv.x, uv.y * 0.5 ), 3.0, 4 ) * 0.5 + 0.5 );
  float fiss = ridge( vec2( uv.x, uv.y * 0.3 ), 7.0, 3 );
  alb = mix( alb, vec3( 0.1, 0.09, 0.08 ) + vec3( 0.12 ) * fiss, patchy );
  h -= patchy * 0.3 * ( 1.0 - fiss );
  // Écorce qui pèle (reflets saumon)
  float peel = smoothstep( 0.7, 0.75, fbm( uv + 5.0, 8.0, 3 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.76, 0.6, 0.5 ), peel * 0.5 );
  rough = 0.6;
}`,
  spruce: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec4 v = vor( vec2( uv.x, uv.y * 0.6 ), 14.0 );
  float scale = smoothstep( 0.0, 0.1, v.y - v.x );
  h = 0.4 + 0.4 * scale * ( 0.6 + 0.4 * v.z ) + 0.1 * fbm( uv, 6.0, 3 );
  alb = mix( vec3( 0.26, 0.17, 0.12 ), vec3( 0.42, 0.3, 0.22 ), v.z );
  alb *= mix( 0.45, 1.0, scale );
  float resin = smoothstep( 0.72, 0.76, fbm( uv + 2.0, 5.0, 3 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.55, 0.45, 0.3 ), resin * 0.4 );
  float lich = smoothstep( 0.62, 0.7, fbm( uv + 6.0, 4.0, 3 ) * 0.5 + 0.5 );
  alb = mix( alb, vec3( 0.45, 0.48, 0.38 ), lich * 0.45 );
  rough = 0.88;
}`,
  pine: /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec4 v = vor( vec2( uv.x * 1.2, uv.y * 0.35 ), 6.0 );
  float plate = smoothstep( 0.0, 0.12, v.y - v.x );
  h = 0.3 + 0.55 * plate * ( 0.7 + 0.3 * v.z ) + 0.1 * fbm( uv, 8.0, 3 );
  vec3 orange = mix( vec3( 0.55, 0.3, 0.17 ), vec3( 0.68, 0.42, 0.25 ), v.w );
  vec3 grey = mix( vec3( 0.3, 0.24, 0.2 ), vec3( 0.42, 0.36, 0.3 ), v.w );
  alb = mix( grey, orange, smoothstep( 0.3, 0.8, fbm( uv + 3.0, 2.0, 3 ) * 0.5 + 0.5 ) );
  alb *= mix( 0.35, 1.0, plate );
  rough = 0.9;
}`,
};

// --- Grappes de feuilles : atlas 2×2 (alpha dans le canal "rough").
// Chaque case = un rameau ramifié portant ~70 petites feuilles qui se chevauchent.
function leafAtlas(shape, palette) {
  return /* glsl */ `
${shape}
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec2 cell = floor( uv * 2.0 );
  vec2 q = fract( uv * 2.0 );
  float cid = cell.x + cell.y * 2.0;
  float tone = 0.5;
  alb = ${palette} * 0.8; rough = 0.0; h = 0.0;
  float best = 0.0;
  float layerZ = -1.0;
  // 6 rameaux secondaires en éventail depuis la base
  for ( int b = 0; b < 6; b++ ) {
    float fb = float( b );
    vec2 rb = h22( vec2( fb * 3.1, cid * 5.7 + 1.0 ) );
    float bang = ( fb - 2.5 ) * 0.36 + ( rb.x - 0.5 ) * 0.25;
    vec2 bdir = vec2( sin( bang ), cos( bang ) );
    vec2 b0 = vec2( 0.5, 0.06 ) + bdir * 0.08;
    float blen = 0.62 + 0.25 * rb.y - abs( fb - 2.5 ) * 0.05;
    for ( int i = 0; i < 12; i++ ) {
      float fi = float( i );
      float t = ( fi + 0.5 ) / 12.0;
      vec2 r = h22( vec2( fi + fb * 17.0, cid * 7.0 + 3.0 ) );
      vec2 stem = b0 + bdir * blen * t + vec2( -bdir.y, bdir.x ) * sin( t * 3.0 + fb ) * 0.03;
      float side = mod( fi, 2.0 ) * 2.0 - 1.0;
      float ang = bang + side * ( 0.6 + 0.6 * r.x ) + ( r.y - 0.5 ) * 0.6;
      vec2 dir = vec2( sin( ang ), cos( ang ) );
      float len = mix( 0.085, 0.13, r.y ) * ( 1.0 - t * 0.3 );
      vec2 lp = q - stem;
      vec2 lq = vec2( dot( lp, dir ), dot( lp, vec2( -dir.y, dir.x ) ) );
      float m = leafSDF( lq, len, r.x );
      float z = fb * 0.07 + t + r.x * 0.3;
      if ( m > 0.5 && z > layerZ ) {
        layerZ = z;
        best = max( best, m );
        float vein = smoothstep( 0.006, 0.0, abs( lq.y ) ) * step( 0.0, lq.x );
        tone = h12( vec2( fi + fb * 13.0, cid ) );
        vec3 c = ${palette};
        c *= 0.78 + 0.4 * clamp( lq.x / len, 0.0, 1.0 ) - vein * 0.1;
        c *= 0.85 + 0.3 * r.y;
        alb = c; h = 0.45 + 0.4 * m + z * 0.05 - vein * 0.15;
      }
    }
    // Tige du rameau
    vec2 lp = q - b0;
    float along = clamp( dot( lp, bdir ) / blen, 0.0, 1.0 );
    float dst = length( lp - bdir * blen * along );
    float st = smoothstep( 0.008, 0.003, dst ) * ( 1.0 - along * 0.5 );
    if ( st > 0.5 && best < 0.5 ) { alb = vec3( 0.26, 0.19, 0.13 ); best = st; h = 0.5; }
  }
  rough = best;
}`;
}

const BROADLEAF = /* glsl */ `
float leafSDF( vec2 q, float len, float rnd ) {
  float x = q.x / len;
  if ( x < 0.0 || x > 1.0 ) return 0.0;
  float w = len * 0.36 * pow( sin( x * 3.14159 ), 0.8 ) * ( 1.0 - 0.25 * x );
  return smoothstep( w, w * 0.6, abs( q.y ) );
}`;
const OAKLEAF = /* glsl */ `
float leafSDF( vec2 q, float len, float rnd ) {
  float x = q.x / len;
  if ( x < 0.0 || x > 1.0 ) return 0.0;
  float lobes = 0.75 + 0.25 * cos( x * 31.0 );
  float w = len * 0.38 * pow( sin( x * 3.14159 ), 0.7 ) * ( 0.75 + 0.35 * x ) * lobes;
  return smoothstep( w, w * 0.6, abs( q.y ) );
}`;
const BIRCHLEAF = /* glsl */ `
float leafSDF( vec2 q, float len, float rnd ) {
  float x = q.x / ( len * 0.75 );
  if ( x < 0.0 || x > 1.0 ) return 0.0;
  float w = len * 0.42 * pow( sin( x * 3.14159 ), 0.9 ) * ( 1.15 - 0.6 * x );
  float serr = 0.92 + 0.08 * sin( x * 60.0 );
  return smoothstep( w * serr, w * serr * 0.6, abs( q.y ) );
}`;

export const LEAVES = {
  beech: leafAtlas(BROADLEAF, `mix( mix( vec3( 0.62, 0.32, 0.09 ), vec3( 0.72, 0.45, 0.13 ), tone ), vec3( 0.36, 0.38, 0.12 ), step( 2.5, cid ) * 0.65 )`),
  oak: leafAtlas(OAKLEAF, `mix( mix( vec3( 0.42, 0.36, 0.12 ), vec3( 0.55, 0.42, 0.14 ), tone ), vec3( 0.25, 0.32, 0.1 ), step( 1.5, cid ) * 0.6 )`),
  birch: leafAtlas(BIRCHLEAF, `mix( mix( vec3( 0.82, 0.68, 0.14 ), vec3( 0.74, 0.58, 0.1 ), tone ), vec3( 0.55, 0.55, 0.15 ), step( 2.5, cid ) * 0.5 )`),
};

// --- Rameaux de résineux : aiguilles en éventail
function needleAtlas(col, len, dens) {
  return /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec2 cell = floor( uv * 2.0 );
  vec2 q = fract( uv * 2.0 );
  float cid = cell.x + cell.y * 2.0;
  float tone = 0.5;
  alb = ${col} * 0.85; rough = 0.0; h = 0.0;
  float best = 0.0;
  // Rameau : axe central + rameaux secondaires
  for ( int b = 0; b < 5; b++ ) {
    float fb = float( b );
    vec2 a0 = vec2( 0.5, 0.05 + fb * 0.0 );
    float ang = ( fb - 2.0 ) * 0.42 + ( h12( vec2( fb, cid ) ) - 0.5 ) * 0.2;
    vec2 dir = vec2( sin( ang ), cos( ang ) );
    float blen = fb == 2.0 ? 0.88 : 0.55 - abs( fb - 2.0 ) * 0.08;
    vec2 a = a0 + ( fb == 2.0 ? vec2( 0.0 ) : vec2( 0.0, 0.18 + abs( fb - 2.0 ) * 0.1 ) );
    vec2 lp = q - a;
    float t = clamp( dot( lp, dir ) / blen, 0.0, 1.0 );
    vec2 axis = a + dir * blen * t;
    float dax = length( q - axis );
    // Aiguilles : bandes obliques de part et d'autre de l'axe
    float along = dot( lp, dir );
    float across = dot( lp, vec2( -dir.y, dir.x ) );
    float reach = ${len} * ( 1.0 - t * 0.5 );
    float nd = fract( ( along - abs( across ) * 0.55 ) * ${dens} + h12( vec2( fb, cid ) ) );
    float needle = smoothstep( 0.42, 0.18, abs( nd - 0.5 ) ) * step( abs( across ), reach ) * step( 0.0, along ) * step( along, blen + 0.02 );
    float twig = smoothstep( 0.012, 0.004, dax ) * step( 0.0, along ) * step( along, blen );
    float m = max( needle * 0.95, twig );
    if ( m > best ) {
      best = m;
      tone = h12( floor( vec2( along * ${dens}, across * 20.0 ) ) + cid );
      vec3 c = ${col};
      c *= 0.7 + 0.45 * tone;
      c = mix( c, vec3( 0.26, 0.18, 0.11 ), twig );
      alb = c; h = 0.4 + 0.6 * m;
    }
  }
  rough = best;
}`;
}

export const NEEDLES = {
  spruce: needleAtlas('vec3( 0.12, 0.2, 0.11 )', '0.075', '46.0'),
  pine: needleAtlas('vec3( 0.2, 0.27, 0.13 )', '0.11', '30.0'),
  larch: needleAtlas('mix( vec3( 0.78, 0.56, 0.12 ), vec3( 0.62, 0.48, 0.12 ), step( 1.5, cid ) )', '0.065', '52.0'),
};

// --- Cartes d'herbe, de roseaux et de fougères (alpha dans le canal "rough")
export const GRASS_CARD = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  alb = vec3( 0.3, 0.33, 0.15 ); rough = 0.0; h = 0.0;
  float best = 0.0;
  for ( int i = 0; i < 70; i++ ) {
    float fi = float( i );
    vec2 r = h22( vec2( fi, 7.0 ) );
    vec2 r2 = h22( vec2( fi, 19.0 ) );
    float x0 = r.x;
    float hh = mix( 0.35, 0.97, r.y * r.y );
    if ( i > 60 ) hh = mix( 0.75, 1.0, r.y );
    float lean = ( r2.x - 0.5 ) * 0.35;
    float t = uv.y / hh;
    if ( t > 1.0 || t < 0.0 ) continue;
    float cx = x0 + lean * t * t;
    float w = mix( 0.012, 0.0015, t ) * ( 0.7 + 0.6 * r2.y );
    float d = abs( uv.x - cx );
    // Raccord horizontal (la carte se répète)
    d = min( d, abs( uv.x + 1.0 - cx ) );
    d = min( d, abs( uv.x - 1.0 - cx ) );
    float m = smoothstep( w, w * 0.4, d );
    if ( m > 0.5 ) {
      float dry = step( 0.62, r2.x ) * 0.8 + step( 0.9, r.x ) * 0.2;
      vec3 base = vec3( 0.14, 0.17, 0.06 );
      vec3 tipG = mix( vec3( 0.36, 0.44, 0.13 ), vec3( 0.44, 0.47, 0.18 ), r.x );
      vec3 tipD = mix( vec3( 0.64, 0.57, 0.33 ), vec3( 0.52, 0.44, 0.26 ), r.x );
      vec3 c = mix( base, mix( tipG, tipD, dry ), smoothstep( 0.0, 0.8, t ) );
      c *= 0.8 + 0.35 * smoothstep( w, 0.0, d - w * 0.3 );
      alb = c; best = 1.0; h = 0.4 + 0.6 * t;
    }
  }
  // Épillets sur quelques tiges
  for ( int i = 0; i < 6; i++ ) {
    float fi = float( i );
    vec2 r = h22( vec2( fi, 41.0 ) );
    vec2 c0 = vec2( r.x, 0.86 + 0.1 * r.y );
    vec2 dd = uv - c0;
    float e = length( dd * vec2( 1.0, 0.35 ) );
    if ( e < 0.012 ) { alb = vec3( 0.55, 0.46, 0.3 ); best = 1.0; h = 1.0; }
  }
  rough = best;
}`;

export const REED_CARD = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  alb = vec3( 0.48, 0.42, 0.25 ); rough = 0.0; h = 0.0;
  float best = 0.0;
  for ( int i = 0; i < 26; i++ ) {
    float fi = float( i );
    vec2 r = h22( vec2( fi, 3.0 ) );
    vec2 r2 = h22( vec2( fi, 11.0 ) );
    float hh = mix( 0.6, 0.98, r.y );
    float t = uv.y / hh;
    if ( t > 1.0 ) continue;
    float lean = ( r2.x - 0.5 ) * 0.12;
    float cx = r.x * 0.9 + 0.05 + lean * t * t;
    float d = abs( uv.x - cx );
    float stem = smoothstep( 0.006, 0.002, d );
    if ( stem > 0.5 ) { alb = mix( vec3( 0.32, 0.3, 0.14 ), vec3( 0.62, 0.52, 0.32 ), t ); best = 1.0; h = 0.6; }
    // Feuilles rubanées obliques
    for ( int k = 0; k < 4; k++ ) {
      float fk = float( k );
      float ty = ( 0.2 + fk * 0.17 ) * hh;
      float side = mod( fk + fi, 2.0 ) * 2.0 - 1.0;
      vec2 a = vec2( cx, ty );
      vec2 b = a + vec2( side * 0.09, 0.14 );
      vec2 pa = uv - a, ba = b - a;
      float hq = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
      float dl = length( pa - ba * hq );
      float lw = 0.009 * ( 1.0 - hq );
      if ( dl < lw ) { alb = mix( vec3( 0.42, 0.38, 0.18 ), vec3( 0.6, 0.5, 0.3 ), hq ) * ( 0.85 + 0.3 * r.x ); best = 1.0; h = 0.7; }
    }
    // Panicule (plumet)
    if ( r2.y > 0.35 ) {
      vec2 pc = vec2( cx + lean * 0.4 + 0.015, hh - 0.04 );
      vec2 dd = ( uv - pc ) * vec2( 1.0, 0.32 );
      float pm = smoothstep( 0.03, 0.022, length( dd ) + 0.008 * fbm( uv * 4.0, 16.0, 2 ) );
      if ( pm > 0.5 ) { alb = mix( vec3( 0.4, 0.3, 0.26 ), vec3( 0.62, 0.52, 0.45 ), fbm( uv, 32.0, 2 ) * 0.5 + 0.5 ); best = 1.0; h = 1.0; }
    }
  }
  rough = best;
}`;

export const FERN_FROND = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  // Fronde : rachis vertical (u = 0.5), pennes de part et d'autre
  alb = vec3( 0.45, 0.33, 0.13 ); rough = 0.0; h = 0.0;
  float t = uv.y;
  float x = uv.x - 0.5;
  float width = 0.48 * sin( clamp( t, 0.0, 1.0 ) * 3.14159 ) * ( 1.0 - 0.3 * t ) + 0.02;
  float rach = smoothstep( 0.012, 0.004, abs( x ) );
  float seg = fract( t * 18.0 );
  float pinna = abs( x ) < width ? 1.0 : 0.0;
  // Pennes légèrement inclinées vers la pointe
  float py = fract( t * 18.0 - abs( x ) * 1.2 );
  float lobe = smoothstep( 0.42, 0.3, abs( py - 0.5 ) ) * pinna;
  // Découpes fines
  float lob2 = smoothstep( 0.2, 0.0, abs( fract( abs( x ) * 30.0 ) - 0.5 ) - 0.25 );
  float m = max( rach, lobe * ( 0.7 + 0.3 * lob2 ) );
  if ( m > 0.5 ) {
    float rust = smoothstep( 0.2, 0.9, t + 0.2 * fbm( uv, 6.0, 2 ) );
    alb = mix( vec3( 0.3, 0.38, 0.1 ), vec3( 0.62, 0.36, 0.13 ), rust * 0.85 ) * ( 0.75 + 0.35 * ( 1.0 - abs( x ) / max( width, 0.01 ) ) );
    alb = mix( alb, vec3( 0.3, 0.22, 0.12 ), rach );
    h = 0.5 + 0.5 * m;
    rough = 1.0;
  }
}`;
