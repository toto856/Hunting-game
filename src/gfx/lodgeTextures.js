// Textures procédurales du pavillon de chasse : parquet de chêne, enduit à la chaux,
// boiseries à panneaux, poutres équarries, maçonnerie de la cheminée, tapis, cuir.
// Convention : le fil du bois suit u (axe x de la texture).

export const OAK_FLOOR = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  const float NB = 12.0;
  float by = floor( uv.y * NB );
  float fy = fract( uv.y * NB );
  float off = h12( vec2( by, 7.0 ) );
  float px = uv.x * 2.0 + off;
  float fx = fract( px );
  float pid = mod( floor( px ), 2.0 );
  vec2 id = vec2( by, pid );
  float tone = h12( id + 3.1 ), tone2 = h12( id + 9.7 );
  // Fil : veines étirées le long de la lame, maillure du chêne
  float w = fbm( vec2( uv.x * 1.0, uv.y * 2.0 + tone * 0.31 ), 4.0, 3 );
  float rings = sin( ( fy * 1.3 + w * 0.9 + tone * 9.0 ) * 6.2831 ) * 0.5 + 0.5;
  float fine = fbm( vec2( uv.x * 1.0, uv.y * 24.0 ), 8.0, 3 ) * 0.5 + 0.5;
  float ray = smoothstep( 0.72, 0.9, fbm( vec2( uv.x * 3.0, uv.y * 24.0 ) + tone, 6.0, 2 ) * 0.5 + 0.5 );
  vec3 c0 = vec3( 0.39, 0.29, 0.2 ), c1 = vec3( 0.52, 0.4, 0.28 );
  alb = mix( c0, c1, tone * 0.45 + rings * 0.17 + fine * 0.38 );
  alb *= mix( 0.9, 1.06, tone2 );
  alb = mix( alb, alb * 1.18, ray * 0.4 );
  // Joints entre lames et aboutages
  float edge = smoothstep( 0.0, 0.035, fy ) * smoothstep( 1.0, 0.965, fy );
  float endj = smoothstep( 0.0, 0.004, fx ) * smoothstep( 1.0, 0.996, fx );
  float gap = edge * endj;
  alb *= 0.32 + 0.68 * gap;
  // Patine : passages plus clairs et mats, bords plus sombres
  float wear = fbm( uv, 3.0, 3 ) * 0.5 + 0.5;
  alb *= mix( 0.92, 1.06, wear );
  h = 0.55 * gap + 0.1 * rings + 0.06 * fine;
  rough = mix( 0.3, 0.62, wear * wear ) + ( 1.0 - gap ) * 0.3;
}`;

export const PLASTER = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n1 = fbm( uv, 3.0, 5 );
  float n2 = fbm( uv + 3.7, 18.0, 4 );
  vec4 v = vor( uv, 9.0 );
  float trowel = smoothstep( 0.0, 0.3, v.y - v.x );
  alb = vec3( 0.84, 0.8, 0.72 ) * ( 0.95 + 0.05 * n1 + 0.025 * n2 );
  alb = mix( alb, vec3( 0.77, 0.72, 0.63 ), smoothstep( 0.15, 0.7, n1 ) * 0.22 );
  h = 0.5 + 0.1 * n2 + 0.06 * trowel + 0.12 * n1;
  rough = 0.93;
}`;

// Boiserie : cadre (montants, traverses) et panneau central en relief avec chanfrein
export const PANEL = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec2 p = abs( uv - 0.5 ) * 2.0;
  float fr = max( step( 0.8, p.x ), step( 0.76, p.y ) );
  float bev = clamp( ( max( p.x / 0.8, p.y / 0.76 ) - 0.72 ) / 0.28, 0.0, 1.0 );
  float moulding = smoothstep( 0.0, 0.02, abs( max( p.x - 0.8, p.y - 0.76 ) ) );
  float grainV = fbm( vec2( uv.x * 3.0, uv.y * 1.0 ), 6.0, 4 );
  float grainH = fbm( vec2( uv.x * 1.0, uv.y * 3.0 ), 6.0, 4 );
  float g = fr > 0.5 && p.y > 0.76 ? grainV : grainH;
  float rings = sin( ( ( fr > 0.5 && p.y > 0.76 ) ? uv.y : uv.x ) * 60.0 + g * 8.0 ) * 0.5 + 0.5;
  alb = mix( vec3( 0.2, 0.12, 0.065 ), vec3( 0.3, 0.19, 0.1 ), rings * 0.6 + ( g * 0.5 + 0.5 ) * 0.4 );
  alb *= fr > 0.5 ? 1.0 : mix( 1.05, 0.9, bev );
  alb *= 0.75 + 0.25 * moulding;
  h = fr > 0.5 ? 0.72 : mix( 0.68, 0.4, bev );
  h += 0.04 * rings;
  rough = 0.48;
}`;

// Poutres équarries à la hache : fil, fentes de séchage, traces d'herminette
export const BEAM = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float g = fbm( vec2( uv.x * 2.0, uv.y * 8.0 ), 4.0, 5 );
  float rings = sin( uv.y * 40.0 + g * 7.0 ) * 0.5 + 0.5;
  float adze = fbm( vec2( uv.x * 14.0, uv.y * 2.0 ), 6.0, 2 );
  float crack = smoothstep( 0.03, 0.0, abs( fbm( vec2( uv.x * 1.0, uv.y * 4.0 ) + 1.3, 3.0, 3 ) ) ) * smoothstep( 0.3, 0.7, fbm( uv + 5.0, 2.0, 2 ) * 0.5 + 0.5 );
  alb = mix( vec3( 0.17, 0.11, 0.07 ), vec3( 0.29, 0.19, 0.11 ), rings * 0.5 + ( g * 0.5 + 0.5 ) * 0.5 );
  alb *= 0.85 + 0.2 * adze;
  alb *= 1.0 - crack * 0.75;
  h = 0.5 + 0.12 * rings + 0.14 * adze - crack * 0.4;
  rough = 0.82;
}`;

// Maçonnerie de moellons : rangs irréguliers, joints de mortier
export const STONE = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  const float ROWS = 6.0;
  float ry = uv.y * ROWS;
  float row = floor( ry );
  float fy = fract( ry );
  float cols = 3.0 + floor( h12( vec2( row, 1.0 ) ) * 2.0 );
  float off = h12( vec2( row, 5.0 ) );
  float rx = uv.x * cols + off;
  float fx = fract( rx );
  vec2 id = vec2( mod( floor( rx ), cols ), row );
  float n = fbm( uv, 12.0, 4 );
  vec2 q = vec2( fx - 0.5, fy - 0.5 ) * vec2( 1.0, 1.0 );
  vec2 sz = vec2( 0.47, 0.42 ) - vec2( 0.04 * h12( id + 2.0 ), 0.05 * h12( id + 4.0 ) );
  float d = length( max( abs( q ) - sz + 0.14, 0.0 ) ) - 0.14 + n * 0.07;
  float stone = smoothstep( 0.015, -0.025, d );
  float tone = h12( id );
  vec3 sc = mix( vec3( 0.40, 0.37, 0.33 ), vec3( 0.6, 0.56, 0.49 ), tone );
  sc = mix( sc, vec3( 0.55, 0.45, 0.34 ), h12( id + 3.0 ) * 0.45 );
  float sn = fbm( uv + tone, 24.0, 3 );
  sc *= 0.82 + 0.28 * ( sn * 0.5 + 0.5 );
  vec3 mortar = vec3( 0.56, 0.53, 0.47 ) * ( 0.88 + 0.12 * n );
  alb = mix( mortar, sc, stone );
  h = stone * ( 0.62 + 0.18 * sn + 0.1 * smoothstep( -0.3, 0.0, -d ) ) + ( 1.0 - stone ) * 0.2;
  rough = mix( 0.96, 0.86, stone );
}`;

// Tapis de laine (image unique : uv de 0 à 1 sur tout le tapis)
export const RUG = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec2 p = uv;
  vec2 e = min( p, 1.0 - p );
  float m = min( e.x, e.y * 1.35 );
  vec3 red = vec3( 0.46, 0.1, 0.07 ), navy = vec3( 0.09, 0.11, 0.2 ), ochre = vec3( 0.72, 0.52, 0.22 ), cream = vec3( 0.82, 0.74, 0.58 ), green = vec3( 0.16, 0.25, 0.16 );
  vec3 c = red;
  if ( m < 0.025 ) c = navy;
  else if ( m < 0.034 ) c = cream;
  else if ( m < 0.095 ) {
    float t = ( e.x * 1.0 < e.y * 1.35 ? p.y * 1.35 : p.x ) * 26.0;
    float k = abs( fract( t ) - 0.5 ) * 2.0;
    float dd = abs( ( m - 0.0645 ) / 0.03 );
    c = ( k + dd < 0.85 ) ? ochre : ( k + dd < 1.05 ? cream : navy );
  } else if ( m < 0.104 ) c = cream;
  else {
    vec2 q = ( p - 0.5 ) * vec2( 7.0, 5.0 );
    vec2 f = fract( q ) - 0.5;
    float dia = abs( f.x ) + abs( f.y );
    if ( dia < 0.44 ) c = mix( red, navy, 0.15 );
    if ( dia < 0.36 ) c = green;
    if ( dia < 0.27 ) c = ochre;
    if ( dia < 0.2 ) c = red;
    if ( dia < 0.07 ) c = cream;
    float cd = abs( ( p.x - 0.5 ) * 1.5 ) + abs( p.y - 0.5 );
    if ( cd < 0.3 ) c = navy;
    if ( cd < 0.27 && cd > 0.235 ) c = ochre;
    if ( cd < 0.2 ) c = mix( red, ochre, step( 0.5, fract( ( p.x + p.y ) * 18.0 ) ) * 0.25 );
    if ( cd < 0.06 ) c = cream;
  }
  float wool = fbm( uv, 96.0, 2 ) * 0.5 + 0.5;
  float abrash = fbm( vec2( uv.x * 2.0, uv.y ), 3.0, 3 );
  float wearR = smoothstep( 0.5, 0.2, length( ( p - 0.5 ) * vec2( 1.0, 1.4 ) ) ) * 0.12;
  alb = c * ( 0.84 + 0.22 * wool ) * ( 1.0 + 0.08 * abrash ) * ( 1.0 - wearR * 0.5 );
  h = 0.5 + 0.25 * wool;
  rough = 0.98;
}`;

export const CLUB_LEATHER = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  vec4 v = vor( uv, 28.0 );
  float crease = smoothstep( 0.0, 0.07, v.y - v.x );
  float n = fbm( uv, 6.0, 4 ) * 0.5 + 0.5;
  float wear = smoothstep( 0.55, 0.85, fbm( uv + 2.0, 3.0, 4 ) * 0.5 + 0.5 );
  alb = mix( vec3( 0.21, 0.085, 0.05 ), vec3( 0.33, 0.15, 0.08 ), n );
  alb = mix( alb, vec3( 0.45, 0.27, 0.15 ), wear * 0.55 );
  alb *= 0.78 + 0.22 * crease;
  h = 0.5 + 0.15 * crease + 0.1 * n;
  rough = mix( 0.38, 0.62, wear );
}`;

// Cuir de selle (pupitre, ceintures, bretelles)
export const BOOK_CLOTH = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float n = fbm( uv, 16.0, 3 ) * 0.5 + 0.5;
  float weave = sin( uv.x * 600.0 ) * sin( uv.y * 600.0 ) * 0.5 + 0.5;
  alb = vec3( 0.7 + 0.1 * n ) * ( 0.92 + 0.08 * weave );
  h = 0.5 + 0.1 * weave;
  rough = 0.85;
}`;

// Chêne ciré du mobilier (fil droit, vernis)
export const FURN = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float g = fbm( vec2( uv.x * 2.0, uv.y * 10.0 ), 4.0, 4 );
  float rings = sin( uv.y * 70.0 + g * 9.0 + fbm( uv, 3.0, 2 ) * 4.0 ) * 0.5 + 0.5;
  float fine = fbm( vec2( uv.x * 3.0, uv.y * 48.0 ), 8.0, 3 ) * 0.5 + 0.5;
  alb = mix( vec3( 0.27, 0.17, 0.1 ), vec3( 0.42, 0.29, 0.17 ), rings * 0.55 + fine * 0.45 );
  alb *= 0.9 + 0.15 * ( g * 0.5 + 0.5 );
  h = 0.5 + 0.1 * rings + 0.05 * fine;
  rough = 0.4;
}`;
