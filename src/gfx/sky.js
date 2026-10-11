// Ciel physique (modèle de Preetham), nuages, étoiles, soleil/lune, éclairage et carte d'environnement.
import * as THREE from 'three';
import { GU, GLSL_NOISE } from './globals.js';
import { clamp, lerp, smoothstep, DEG } from '../core/math.js';

const LAT = 46 * DEG;       // latitude du domaine (centre de la France)
const DECL = -7 * DEG;      // déclinaison solaire mi-octobre
const SOLAR_NOON = 13.6;    // heure légale du midi solaire (heure d'été)

// Position du soleil (direction monde, nord = -Z, est = +X)
export function sunDirection(hour, out = new THREE.Vector3()) {
  const H = (hour - SOLAR_NOON) * 15 * DEG;
  const sinE = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const e = Math.asin(sinE);
  const A = Math.atan2(-Math.sin(H), Math.tan(DECL) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H)) + Math.PI;
  return out.set(Math.sin(A) * Math.cos(e), Math.sin(e), -Math.cos(A) * Math.cos(e)).normalize();
}

// ------------------------------------------------------------------ Preetham en JS (couleurs de brume et du soleil)
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

function skyParams(sun, turbidity, rayleigh, mieCoef) {
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(sun.y, -1, 1))) / 1.5)));
  const sunfade = 1 - clamp(1 - Math.exp(sun.y * 4500 / 450000), 0, 1);
  const rc = rayleigh - (1 - sunfade);
  const c = 0.2 * turbidity * 10e-18;
  const betaR = totalRayleigh.map((v) => v * rc);
  const betaM = MieConst.map((v) => 0.434 * c * v * mieCoef);
  return { sunE, sunfade, betaR, betaM };
}

export function skyColorJS(dir, sun, p, g = 0.8) {
  const zen = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - zen / DEG, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g2 = g * g;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const out = [0, 0, 0];
  const up5 = clamp(Math.pow(1 - sun.y, 5), 0, 1);
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(p.betaR[i] * sR + p.betaM[i] * sM));
    const ratio = (p.betaR[i] * rPhase + p.betaM[i] * mPhase) / (p.betaR[i] + p.betaM[i]);
    let Lin = Math.pow(p.sunE * ratio * (1 - Fex), 1.5);
    Lin *= lerp(1, Math.pow(p.sunE * ratio * Fex, 0.5), up5);
    const L0 = 0.1 * Fex;
    const tex = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
    out[i] = Math.pow(tex, 1 / (1.2 + 1.2 * p.sunfade));
  }
  return out;
}

// Transmission atmosphérique vers le soleil (couleur de la lumière directe)
function sunTransmittance(sun, p) {
  const zen = Math.acos(clamp(sun.y, 0.0, 1));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(Math.max(93.885 - zen / DEG, 0.5), -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  return [0, 1, 2].map((i) => Math.exp(-(p.betaR[i] * sR + p.betaM[i] * sM)));
}

// ------------------------------------------------------------------ Shader du ciel
const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uTime;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uSunfade;
uniform float uClouds;      // couverture 0..1
uniform float uOvercast;    // voile gris
uniform float uNight;       // 0 jour, 1 nuit
uniform float uHaze;        // brume à l'horizon
uniform float uExposure;
uniform vec2 uCloudOffset;
varying vec3 vDir;
${GLSL_NOISE}
const float pi = 3.141592653589793;
float rayleighPhase( float c ) { return 0.05968310365946075 * ( 1.0 + c * c ); }
float hgPhase( float c, float g ) { float g2 = g * g; return 0.07957747154594767 * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * g * c + g2, 1.5 ) ); }

vec3 preetham( vec3 dir ) {
  float zen = acos( max( 0.0, dir.y ) );
  float inv = 1.0 / ( cos( zen ) + 0.15 * pow( 93.885 - ( zen * 180.0 / pi ), -1.253 ) );
  vec3 Fex = exp( -( uBetaR * 8.4e3 * inv + uBetaM * 1.25e3 * inv ) );
  float cosT = dot( dir, uSunDir );
  vec3 bR = uBetaR * rayleighPhase( cosT * 0.5 + 0.5 );
  vec3 bM = uBetaM * hgPhase( cosT, 0.8 );
  vec3 ratio = ( bR + bM ) / ( uBetaR + uBetaM );
  vec3 Lin = pow( uSunE * ratio * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( uSunE * ratio * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - uSunDir.y, 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( 0.99995, 0.99999, cosT );
  L0 += uSunE * 1500.0 * Fex * sundisk * ( 1.0 - uOvercast );
  vec3 c = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  return pow( c, vec3( 1.0 / ( 1.2 + 1.2 * uSunfade ) ) );
}

float cloudDensity( vec2 p ) {
  float n = fbm2( p * 0.9 + uCloudOffset );
  n += 0.35 * vnoise( p * 3.7 - uCloudOffset * 1.7 );
  float cov = mix( 0.95, 0.25, uClouds );
  return smoothstep( cov, cov + 0.32, n * 0.8 );
}

void main() {
  vec3 dir = normalize( vDir );
  vec3 d = dir;
  d.y = max( d.y, 0.0005 );
  vec3 col = preetham( d );

  // Nuit : dégradé bleu profond, lune, étoiles
  vec3 night = mix( vec3( 0.012, 0.018, 0.04 ), vec3( 0.002, 0.004, 0.012 ), smoothstep( 0.0, 0.6, dir.y ) );
  float moon = smoothstep( 0.99925, 0.99945, dot( dir, uMoonDir ) );
  float moonGlow = pow( max( dot( dir, uMoonDir ), 0.0 ), 400.0 ) * 0.4 + pow( max( dot( dir, uMoonDir ), 0.0 ), 12.0 ) * 0.03;
  vec2 sp = vec2( atan( dir.z, dir.x ) * 220.0, asin( clamp( dir.y, -1.0, 1.0 ) ) * 220.0 );
  vec2 cell = floor( sp );
  float star = step( 0.9965, hash12( cell ) ) * smoothstep( 0.42, 0.0, length( fract( sp ) - 0.5 ) );
  star *= 0.6 + 0.4 * sin( uTime * 3.0 + hash12( cell + 7.0 ) * 40.0 );
  night += vec3( 0.9, 0.95, 1.0 ) * ( star * smoothstep( 0.02, 0.3, dir.y ) * ( 1.0 - uOvercast ) * 0.9 + moon * 1.6 ) + vec3( 0.55, 0.62, 0.8 ) * moonGlow;
  col = mix( col, night, uNight );

  // Ciel couvert : voile gris lumineux
  float lum = dot( col, vec3( 0.3, 0.59, 0.11 ) );
  vec3 grey = vec3( lum ) * vec3( 0.95, 0.98, 1.04 ) * 0.9 + uFogColor * 0.25;
  col = mix( col, grey, uOvercast );

  // Nuages (couche plane à haute altitude)
  if ( dir.y > 0.0 ) {
    vec2 cp = dir.xz / ( dir.y + 0.12 ) * 0.9;
    float dens = cloudDensity( cp );
    float densL = cloudDensity( cp + uSunDir.xz * 0.08 );
    float light = clamp( 1.0 - ( densL - dens ) * 2.5, 0.35, 1.25 );
    float sunUp = smoothstep( -0.05, 0.25, uSunDir.y );
    vec3 sunTint = mix( vec3( 1.0, 0.55, 0.32 ), vec3( 1.0, 0.97, 0.92 ), smoothstep( 0.02, 0.35, uSunDir.y ) );
    vec3 cLit = mix( vec3( 0.32, 0.34, 0.38 ), vec3( 0.95, 0.95, 0.97 ) * sunTint, light * 0.75 ) * mix( 0.05, 1.0, sunUp );
    cLit = mix( cLit, vec3( 0.04, 0.05, 0.07 ) + vec3( 0.25, 0.28, 0.35 ) * moonGlow * 4.0, uNight );
    float silver = pow( max( dot( dir, uSunDir ), 0.0 ), 10.0 ) * ( 1.0 - dens ) * 2.0 * sunUp;
    cLit += sunTint * silver * 0.6;
    float fade = smoothstep( 0.0, 0.18, dir.y );
    col = mix( col, cLit * mix( 1.0, 0.75, uOvercast ), dens * fade * 0.92 );
  }

  // Brume d'horizon raccordée au brouillard du terrain
  float sunAmt = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
  vec3 fc = mix( uFogColor, uFogSunColor, sunAmt );
  float h = exp( -max( dir.y, 0.0 ) * mix( 9.0, 3.5, uHaze ) );
  col = mix( col, fc, clamp( h * mix( 0.55, 1.0, uHaze ), 0.0, 1.0 ) );
  if ( dir.y < 0.0 ) col = mix( fc, fc * 0.8, clamp( -dir.y * 3.0, 0.0, 1.0 ) );

  gl_FragColor = vec4( col * uExposure, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkySystem {
  constructor(engine, scene) {
    this.engine = engine;
    this.scene = scene;
    this.hour = 8;
    this.weather = { clouds: 0.3, overcast: 0, haze: 0.12, fog: 1, rain: 0, wet: 0 };
    this.uniforms = {
      uMoonDir: { value: new THREE.Vector3(-0.4, 0.55, 0.6).normalize() },
      uBetaR: { value: new THREE.Vector3() },
      uBetaM: { value: new THREE.Vector3() },
      uSunE: { value: 1 },
      uSunfade: { value: 1 },
      uClouds: { value: 0.3 },
      uOvercast: { value: 0 },
      uNight: { value: 0 },
      uHaze: { value: 0.4 },
      uExposure: { value: 1 },
      uCloudOffset: { value: new THREE.Vector2() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const q = engine.q;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sd = q.shadowDist;
    Object.assign(this.sun.shadow.camera, { left: -sd, right: sd, top: sd, bottom: -sd, near: 1, far: 900 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.0);
    scene.add(this.hemi);

    // Capture de l'environnement (ciel + sol) pour l'éclairage indirect
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.mesh.geometry, this.material);
    this.envSky.frustumCulled = false;
    this.envScene.add(this.envSky);
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x3a3a28, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 32).rotateX(-Math.PI / 2), this.groundMat);
    ground.position.y = -15;
    this.envScene.add(ground);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(1, 5000, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.envRT = null;
    this._envT = 0;
    this._lastEnvHour = -99;
    this._lastEnvWeather = '';
    this.groundAlbedo = new THREE.Color(0.16, 0.15, 0.09);
    this.sunDirV = new THREE.Vector3();
    this.lightningT = 0;
  }

  setWeather(w) {
    Object.assign(this.weather, w);
    this._lastEnvWeather = '';
  }

  update(dt, focus) {
    const hour = this.hour;
    const w = this.weather;
    const sd = sunDirection(hour, this.sunDirV);
    const night = 1 - smoothstep(-0.12, 0.02, sd.y);
    const p = skyParams(sd, lerp(2.2, 6, w.haze), lerp(1.2, 2.2, w.haze * 0.5), lerp(0.004, 0.012, w.haze));
    const u = this.uniforms;
    u.uBetaR.value.set(...p.betaR);
    u.uBetaM.value.set(...p.betaM);
    u.uSunE.value = p.sunE;
    u.uSunfade.value = p.sunfade;
    u.uClouds.value = w.clouds;
    u.uOvercast.value = w.overcast;
    u.uNight.value = night;
    u.uHaze.value = w.haze;
    u.uCloudOffset.value.x += dt * 0.004 * (0.5 + w.clouds);
    u.uCloudOffset.value.y += dt * 0.002;
    GU.uSunDir.value.copy(sd.y > -0.05 ? sd : u.uMoonDir.value);

    // Couleurs de brume = ciel à l'horizon
    const away = new THREE.Vector3(-sd.x, 0.02, -sd.z).normalize();
    const toward = new THREE.Vector3(sd.x, 0.02, sd.z).normalize();
    const ca = skyColorJS(away, sd, p), ct = skyColorJS(toward, sd, p);
    const fogA = new THREE.Color(ca[0], ca[1], ca[2]);
    const fogT = new THREE.Color(ct[0], ct[1], ct[2]);
    // Le halo côté soleil reste mesuré (sinon le relief blanchit à contre-jour)
    const la = fogA.r * 0.3 + fogA.g * 0.59 + fogA.b * 0.11;
    const lt = fogT.r * 0.3 + fogT.g * 0.59 + fogT.b * 0.11;
    if (lt > la * 1.35) fogT.multiplyScalar((la * 1.35) / lt);
    const lumA = fogA.r * 0.3 + fogA.g * 0.59 + fogA.b * 0.11;
    const grey = new THREE.Color(lumA * 0.92, lumA * 0.95, lumA);
    fogA.lerp(grey, w.overcast * 0.85);
    fogT.lerp(grey, w.overcast * 0.8);
    const nightFog = new THREE.Color(0.012, 0.016, 0.03);
    fogA.lerp(nightFog, night);
    fogT.lerp(nightFog, night);
    GU.uFogColor.value.copy(fogA);
    GU.uFogSunColor.value.copy(fogT);
    const dens = (0.00032 + w.haze * 0.0011) * w.fog;
    GU.uFogParams.value.set(dens, w.fogFalloff ?? 0.006, w.fogBase ?? 100, 0.985);

    // Lumière directe : soleil ou lune
    const tr = sunTransmittance(sd, p);
    const sunUp = smoothstep(-0.03, 0.08, sd.y);
    const cloudDim = lerp(1, 0.18, w.overcast) * lerp(1, 0.8, w.clouds * 0.6);
    if (night > 0.95) {
      this.sun.position.copy(u.uMoonDir.value).multiplyScalar(500);
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.12 * (1 - w.overcast * 0.8);
    } else {
      this.sun.position.copy(sd).multiplyScalar(500);
      const m = Math.max(tr[0], tr[1], tr[2]);
      this.sun.color.setRGB(tr[0] / m, tr[1] / m, tr[2] / m);
      this.sun.intensity = 4.4 * sunUp * cloudDim * (0.35 + 0.65 * m);
    }
    GU.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity / 4.4);
    GU.uWeather.value.set(w.wet, 0, night, w.rain);

    if (this.lightningT > 0) {
      this.lightningT -= dt;
      this.sun.intensity += 6 * Math.max(0, Math.sin(this.lightningT * 40));
    }

    // Exposition : on compense la nuit pour garder une image lisible
    this.engine.renderer.toneMappingExposure = lerp(1.0, 2.2, night) * lerp(1, 1.15, w.overcast);
    u.uExposure.value = 1;

    // Ombres centrées sur le joueur, alignées sur les texels (pas de scintillement)
    if (focus) {
      const L = this.sun.position.clone().normalize();
      const sdist = this.engine.q.shadowDist;
      const texel = (sdist * 2) / this.sun.shadow.mapSize.x;
      const f = focus.clone();
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), L.clone().negate(), new THREE.Vector3(0, 1, 0));
      const inv = m.clone().invert();
      f.applyMatrix4(inv);
      f.x = Math.round(f.x / texel) * texel;
      f.y = Math.round(f.y / texel) * texel;
      f.applyMatrix4(m);
      this.sun.target.position.copy(f);
      this.sun.position.copy(f).addScaledVector(L, 450);
      this.sun.target.updateMatrixWorld();
    }
    this.mesh.position.copy(this.engine.cameraPos || new THREE.Vector3());

    // Environnement : recapture quand l'heure ou la météo change
    this._envT -= dt;
    const key = w.clouds.toFixed(2) + w.overcast.toFixed(2) + w.haze.toFixed(2);
    if ((Math.abs(hour - this._lastEnvHour) > 0.12 || key !== this._lastEnvWeather) && this._envT <= 0) {
      this._envT = 0.5;
      this._lastEnvHour = hour;
      this._lastEnvWeather = key;
      this.captureEnv();
    }
  }

  captureEnv() {
    const r = this.engine.renderer;
    const sunI = this.sun.intensity / 4.4;
    const g = this.groundAlbedo.clone().multiply(new THREE.Color().copy(this.sun.color).multiplyScalar(0.35 * sunI + 0.04));
    g.add(GU.uFogColor.value.clone().multiplyScalar(0.12));
    this.groundMat.color.copy(g);
    this.envSky.position.set(0, 0, 0);
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.update(r, this.envScene);
    r.toneMapping = tm;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.envIntensity ?? 0.6;
    if (this.onEnv) this.onEnv(this.envRT.texture);
  }

  dispose() {
    if (this.envRT) this.envRT.dispose();
    this.cubeRT.dispose();
    this.pmrem.dispose();
    this.material.dispose();
  }
}
