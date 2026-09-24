// Monde : terrain, ciel, lumière, météo, végétation instanciée, eau, structures.
'use strict';
HG.World = class World {
  constructor(scene, mapId, weatherId) {
    const U = HG.util, D = HG.data;
    this.scene = scene; this.map = D.maps[mapId]; this.mapId = mapId; this.biome = this.map.biome;
    this.size = this.map.size; this.half = this.size / 2;
    this.noise = U.makeNoise(this.map.seed); this.rng = U.mulberry32(this.map.seed * 7 + 1);
    this.weather = Object.assign({ id: weatherId }, D.weather[weatherId]);
    this.wind = { dir: this.rng() * Math.PI * 2, speed: U.lerp(this.weather.wind[0], this.weather.wind[1], this.rng()), gust: 0 };
    this.hour = 10; this.time = 0;
    this.colliders = []; this.colGrid = new Map(); this.trees = []; this.treeGrid = new Map();
    this.waterY = this.map.water ? 0 : -999;
    this.snowLine = this.biome === 'montagne' ? 260 : this.biome === 'boreal' ? 120 : 9999;
    this.treeLine = this.biome === 'montagne' ? 200 : 9999;
    this.structures = []; this.interact = []; this.markers = [];
    this.sway = { value: 0 }; this.matsWind = [];
    this.buildTerrain(); this.buildSky(); this.buildLights(); this.buildWater(); this.buildVegetation(); this.buildRocks(); this.buildGrassSystem(); this.buildParticles(); this.buildStructures();
    this.setWeather(this.weather);
  }

  // ================================================================ TERRAIN
  rawHeight(x, z) {
    const n = this.noise, b = this.biome, s = 0.0011;
    let h;
    if (b === 'montagne') {
      const r = n.ridge(x * s * 0.6 + 3, z * s * 0.6 + 3, 5);
      const base = n.fbm(x * s * 0.35, z * s * 0.35, 3);
      h = r * 420 + base * 120 + 40;
      const valley = U_smooth(-60, 220, Math.hypot(x + 300, z + 200)); // vallée de départ
      h = h * (0.25 + 0.75 * valley) - 20 * (1 - valley);
      h += n.fbm(x * 0.02, z * 0.02, 3) * 4;
    } else if (b === 'foret') {
      h = n.fbm(x * s * 1.3, z * s * 1.3, 5) * 34 + n.fbm(x * 0.012, z * 0.012, 2) * 3;
      const pond = Math.hypot(x - 260, z + 180) / 130; h -= 22 * Math.max(0, 1 - pond * pond) * 0.9;
      const pond2 = Math.hypot(x + 420, z - 380) / 90; h -= 14 * Math.max(0, 1 - pond2 * pond2);
      h += 4;
    } else if (b === 'plaine') {
      h = n.fbm(x * s * 0.8, z * s * 0.8, 4) * 14 + n.fbm(x * 0.01, z * 0.01, 2) * 1.2 + 3;
    } else if (b === 'marais') {
      h = n.fbm(x * s * 1.6, z * s * 1.6, 4) * 5.5 + n.fbm(x * 0.02, z * 0.02, 2) * 0.8 + 0.4;
      const isle = Math.hypot(x, z) / 90; h += 2.5 * Math.max(0, 1 - isle * isle);
    } else if (b === 'boreal') {
      h = n.fbm(x * s * 1.1, z * s * 1.1, 5) * 48 + n.fbm(x * 0.015, z * 0.015, 2) * 2 + 8;
      const lake = Math.hypot(x - 350, z - 100) / 220; h -= 40 * Math.max(0, 1 - lake * lake);
      const lake2 = Math.hypot(x + 500, z + 450) / 150; h -= 30 * Math.max(0, 1 - lake2 * lake2);
    } else { // camp
      h = n.fbm(x * s * 1.5, z * s * 1.5, 3) * 6 + 1;
      const flat = U_smooth(120, 260, Math.hypot(x, z)); h *= flat; // aire plate
      h += (1 - flat) * 0.4;
    }
    return h;
    function U_smooth(a, b, v) { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
  }
  buildTerrain() {
    const U = HG.util, seg = 256, size = this.size; this.seg = seg;
    const H = new Float32Array((seg + 1) * (seg + 1)); this.H = H;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) H[j * (seg + 1) + i] = this.rawHeight(i / seg * size - this.half, j / seg * size - this.half);
    const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), blend = new Float32Array(pos.count * 3);
    const n = this.noise, b = this.biome;
    const cGrass = new THREE.Color(b === 'plaine' ? '#7f8a48' : b === 'marais' ? '#6c7a3a' : b === 'boreal' ? '#5e6e3a' : b === 'foret' ? '#5f6d38' : b === 'montagne' ? '#6a7a40' : '#6f8a3e');
    const cDirt = new THREE.Color(b === 'foret' ? '#5a4630' : '#6e5a3c'), cField = new THREE.Color('#a4924e'), tmp = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k); const y = this.height(x, z); pos.setY(k, y);
      const nrm = this.normal(x, z); const slope = 1 - nrm.y;
      const v = n.fbm(x * 0.006 + 9, z * 0.006, 3) * 0.5 + 0.5, v2 = n.fbm(x * 0.03, z * 0.03, 2) * 0.5 + 0.5;
      let rock = U.clamp((slope - 0.28) * 4, 0, 1), snow = 0, dirt = 0;
      if (b === 'montagne') { rock = U.clamp((slope - 0.22) * 3.5 + (y > 150 ? (y - 150) / 300 : 0) * v2, 0, 1); snow = U.clamp((y - this.snowLine + v2 * 40 - 20) / 60, 0, 1) * (1 - rock * 0.5); }
      if (b === 'boreal') snow = U.clamp((y - this.snowLine + v2 * 30) / 50, 0, 1) * 0.8;
      if (b === 'foret') dirt = U.clamp((v - 0.42) * 3, 0, 1) * 0.85;
      if (b === 'plaine') dirt = 0;
      if (y < this.waterY + 0.8) dirt = 1;
      tmp.copy(cGrass).lerp(cDirt, dirt * 0.5);
      if (b === 'plaine') { const f = n.fbm(x * 0.004 + 3, z * 0.004 + 5, 2); if (f > 0.12) tmp.copy(cField); else if (f > 0.05) tmp.lerp(cField, 0.5); }
      const shade = 0.82 + v * 0.36;
      col[k * 3] = tmp.r * shade; col[k * 3 + 1] = tmp.g * shade; col[k * 3 + 2] = tmp.b * shade;
      blend[k * 3] = rock; blend[k * 3 + 1] = snow; blend[k * 3 + 2] = dirt;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('blend', new THREE.BufferAttribute(blend, 3));
    geo.computeVertexNormals();
    const T = HG.tex, gkind = b === 'foret' ? 'forest' : b === 'marais' ? 'marsh' : b === 'boreal' ? 'boreal' : 'grass';
    const map = T.ground(gkind).clone(); map.needsUpdate = true; map.repeat.set(size / 7, size / 7);
    const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.mapRock = { value: T.ground('rock') }; sh.uniforms.mapSnow = { value: T.ground('snow') }; sh.uniforms.mapDirt = { value: T.ground(b === 'plaine' ? 'field' : 'forest') };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 blend; varying vec3 vBlend;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D mapRock, mapSnow, mapDirt; varying vec3 vBlend;')
        .replace('#include <map_fragment>', `vec4 cBase = texture2D(map, vUv); vec4 cR = texture2D(mapRock, vUv*0.7); vec4 cS = texture2D(mapSnow, vUv); vec4 cD = texture2D(mapDirt, vUv);
        vec4 cc = mix(cBase, cD, vBlend.z); cc = mix(cc, cR, vBlend.x); cc = mix(cc, cS, vBlend.y);
        diffuseColor *= cc;`)
        .replace('#include <color_fragment>', '#if defined( USE_COLOR )\n diffuseColor.rgb *= mix(vColor, vec3(1.0), max(vBlend.x*0.85, vBlend.y));\n#endif');
    };
    this.terrain = new THREE.Mesh(geo, mat); this.terrain.receiveShadow = true; this.terrain.castShadow = false; this.terrain.name = 'terrain';
    this.scene.add(this.terrain);
  }
  height(x, z) {
    const seg = this.seg, s = this.size; const fx = (x + this.half) / s * seg, fz = (z + this.half) / s * seg;
    if (fx < 0 || fz < 0 || fx >= seg || fz >= seg) return this.rawHeight(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, w = seg + 1, H = this.H;
    const a = H[j * w + i], b = H[j * w + i + 1], c = H[(j + 1) * w + i], d = H[(j + 1) * w + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  groundY(x, z) { return this.height(x, z); }
  normal(x, z, out) {
    const e = 1.5; const hl = this.height(x - e, z), hr = this.height(x + e, z), hd = this.height(x, z - e), hu = this.height(x, z + e);
    out = out || new THREE.Vector3(); out.set(hl - hr, 2 * e, hd - hu).normalize(); return out;
  }
  isWater(x, z) { return this.height(x, z) < this.waterY; }
  waterDepth(x, z) { return Math.max(0, this.waterY - this.height(x, z)); }
  surface(x, z) {
    const y = this.height(x, z); if (y < this.waterY + 0.05) return 'water';
    const n = this.normal(x, z); if (n.y < 0.72) return 'rock';
    if (y > this.snowLine) return 'snow';
    if (this.biome === 'foret' || this.biome === 'boreal') return this.cover(x, z) > 0.3 ? 'leaves' : 'grass';
    return 'grass';
  }
  inBounds(x, z, m = 30) { return Math.abs(x) < this.half - m && Math.abs(z) < this.half - m; }

  // ================================================================ CIEL & LUMIÈRE
  buildSky() {
    const geo = new THREE.SphereGeometry(4500, 32, 16);
    this.skyUniforms = { sunDir: { value: new THREE.Vector3(0, 1, 0) }, cloud: { value: 0.3 }, time: { value: 0 }, fogAmt: { value: 0.3 }, fogColor: { value: new THREE.Color() } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 sunDir; uniform float cloud, time, fogAmt; uniform vec3 fogColor; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0., a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float el = sunDir.y;
        float day = smoothstep(-0.12, 0.18, el); float dusk = exp(-pow((el-0.02)/0.13, 2.));
        vec3 zenD = vec3(0.14,0.33,0.70), horD = vec3(0.70,0.80,0.90), zenN = vec3(0.008,0.012,0.03), horN = vec3(0.03,0.04,0.07);
        vec3 zen = mix(zenN, zenD, day), hor = mix(horN, horD, day);
        float ov = cloud*0.8; zen = mix(zen, mix(vec3(0.02,0.022,0.03), vec3(0.42,0.45,0.5), day), ov*ov); hor = mix(hor, mix(vec3(0.03,0.032,0.04), vec3(0.6,0.62,0.66), day), ov*ov);
        vec3 duskCol = vec3(0.98,0.50,0.22);
        float h = clamp(d.y, 0., 1.); vec3 col = mix(hor, zen, pow(h, 0.5));
        float sunAmt = max(dot(d, sunDir), 0.);
        col += duskCol * dusk * (1.-ov) * (pow(sunAmt, 3.)*1.3 + 0.3) * (1.-h);
        float disc = smoothstep(0.99935, 0.9997, sunAmt); col += vec3(1.,0.93,0.8)*disc*day*4.*(1.-ov);
        col += vec3(1.,0.85,0.6)*pow(sunAmt, 48.)*0.6*day*(1.-ov*0.7);
        if (d.y > 0.0) { vec2 p = d.xz/(d.y+0.12)*1.6 + vec2(time*0.012, time*0.004); float n = fbm(p*1.3); float c = smoothstep(0.62-cloud*0.42, 0.8-cloud*0.25, n) * smoothstep(0.0, 0.16, d.y);
          vec3 cc = mix(vec3(0.03,0.032,0.04), vec3(1.0), day); float shade = mix(0.55, 1.0, smoothstep(0.4,0.9,n)); cc *= mix(1.0, shade, 0.9); cc = mix(cc, cc*0.55, ov); cc += duskCol*dusk*0.9*(1.-ov)*pow(sunAmt,2.);
          col = mix(col, cc, c*(0.85+0.15*ov)); }
        float night = 1.-day; if (night > 0.02 && d.y > 0.) { float s = hash3(floor(d*420.)); col += vec3(step(0.9965, s))*night*0.9*smoothstep(0.,0.12,d.y)*(1.-ov); }
        vec3 moonDir = normalize(vec3(-sunDir.x*0.6, max(0.25, -sunDir.y), -sunDir.z*0.6)); float m = dot(d, moonDir);
        col += vec3(0.92,0.94,1.0)*smoothstep(0.9990,0.99955,m)*night*1.5*(1.-ov); col += vec3(0.45,0.5,0.7)*pow(max(m,0.),24.)*0.25*night*(1.-ov);
        col = mix(col, fogColor, fogAmt*(1.-smoothstep(0.,0.22,d.y)));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }` });
    this.sky = new THREE.Mesh(geo, mat); this.sky.frustumCulled = false; this.scene.add(this.sky);
  }
  buildLights() {
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 600;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.6; this.sun.shadow.radius = 2;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fb4e0, 0x5a4a33, 0.7); this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8fa0d0, 0); this.scene.add(this.moon);
    this.scene.fog = new THREE.FogExp2(0x9fb3c8, 0.0012);
  }
  sunDirection(hour) {
    const rise = 6.4, set = 19.3, t = (hour - rise) / (set - rise);
    const el = Math.sin(t * Math.PI) * (55 * Math.PI / 180) - (t < 0 || t > 1 ? Math.min(0.5, Math.abs(t < 0 ? t : t - 1) * 1.8) : 0);
    const az = (t - 0.5) * Math.PI; // -90° (est) → +90° (ouest)
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el) * 0.55 + 0.0001);
  }
  setTime(hour) {
    const U = HG.util; this.hour = hour % 24;
    const sd = this.sunDirection(this.hour).normalize(); this.sunDir = sd; this.skyUniforms.sunDir.value.copy(sd);
    const day = U.smoothstep(-0.12, 0.18, sd.y), dusk = Math.exp(-Math.pow((sd.y - 0.02) / 0.13, 2)), ov = this.weather.cloud * 0.8;
    const warm = new THREE.Color(1, 0.55, 0.3), noon = new THREE.Color(1, 0.97, 0.9);
    this.sun.color.copy(noon).lerp(warm, U.clamp(dusk * 1.2, 0, 1));
    this.sun.intensity = day * (1 - ov * ov * 0.85) * 2.6 * U.clamp(sd.y * 3, 0.15, 1);
    this.sun.visible = day > 0.02;
    this.moon.intensity = (1 - day) * 0.22 * (1 - ov * 0.8); this.moon.position.set(-sd.x * 100, Math.max(30, -sd.y * 100), -sd.z * 100);
    const zen = new THREE.Color(0.008, 0.012, 0.03).lerp(new THREE.Color(0.14, 0.33, 0.7), day), hor = new THREE.Color(0.03, 0.04, 0.07).lerp(new THREE.Color(0.7, 0.8, 0.9), day);
    hor.lerp(new THREE.Color(0.03, 0.032, 0.04).lerp(new THREE.Color(0.6, 0.62, 0.66), day), ov * ov);
    hor.r += 0.98 * dusk * 0.3 * (1 - ov); hor.g += 0.5 * dusk * 0.3 * (1 - ov); hor.b += 0.22 * dusk * 0.3 * (1 - ov);
    this.hemi.color.copy(zen).multiplyScalar(1.4).lerp(new THREE.Color(0.5, 0.55, 0.65), ov * 0.5); this.hemi.groundColor.set(0x5a4a33).multiplyScalar(0.6 + day * 0.6);
    this.hemi.intensity = 0.12 + day * (0.75 - ov * 0.2);
    const fogC = hor.clone().multiplyScalar(0.92 + this.weather.fog * 0.08);
    this.scene.fog.color.copy(fogC); this.skyUniforms.fogColor.value.copy(fogC);
    this.dayFactor = day; this.isNight = day < 0.35;
  }
  setWeather(w) {
    this.weather = w; this.skyUniforms.cloud.value = w.cloud;
    const base = this.biome === 'montagne' ? 0.0009 : this.biome === 'boreal' ? 0.0016 : 0.0018;
    this.fogDensity = base * (1 + w.fog * 4.2); this.scene.fog.density = this.fogDensity; this.skyUniforms.fogAmt.value = 0.35 + w.fog * 0.6;
    if (this.rain) this.rain.visible = w.rain > 0; if (this.snow) this.snow.visible = w.snow > 0;
    this.setTime(this.hour);
  }

  // ================================================================ EAU
  buildWater() {
    if (!this.map.water) return;
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1); geo.rotateX(-Math.PI / 2);
    const nm = HG.tex.waterNormal();
    this.waterMat = new THREE.MeshStandardMaterial({ color: this.biome === 'marais' ? 0x3b4a3a : 0x2c3e4a, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, normalMap: nm, normalScale: new THREE.Vector2(0.25, 0.25) });
    this.water = new THREE.Mesh(geo, this.waterMat); this.water.position.y = this.waterY; this.water.receiveShadow = true; this.water.name = 'water'; this.scene.add(this.water);
  }

  // ================================================================ VÉGÉTATION
  windShader(mat, kind) {
    const self = this;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = self.uTime = self.uTime || { value: 0 }; sh.uniforms.uWind = self.uWind = self.uWind || { value: 0.3 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wp0 = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 wp0 = vec3(0.0);
        #endif
        float ph = uTime*1.4 + wp0.x*0.21 + wp0.z*0.17;
        float hf = ${kind === 'grass' ? 'uv.y*uv.y' : kind === 'trunk' ? 'position.y*position.y*0.35' : 'uv.y*0.6+0.4'};
        float sw = (sin(ph) + 0.5*sin(ph*2.3+1.0)) * uWind * ${kind === 'grass' ? '0.22' : kind === 'trunk' ? '0.5' : '0.12'} * hf;
        transformed.x += sw; transformed.z += sw*0.6;`);
      self.matsWind.push(sh);
    };
    mat.customProgramCacheKey = () => 'wind_' + kind;
    return mat;
  }
  depthMat(map) { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 }); return m; }
  cover(x, z) { // densité d'arbres autour (0..1)
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20); const c = this.treeGrid.get(k); return Math.min(1, (c ? c.length : 0) / 5);
  }
  treeDensity(x, z) {
    const n = this.noise, b = this.biome, y = this.height(x, z);
    if (y < this.waterY + 0.6) return 0;
    if (b === 'montagne') { if (y > this.treeLine) return 0; return (n.fbm(x * 0.004, z * 0.004, 3) * 0.5 + 0.55) * (1 - y / this.treeLine) * 0.7; }
    if (b === 'foret') { const v = n.fbm(x * 0.0035 + 7, z * 0.0035 + 2, 3); return HG.util.clamp(0.45 + v * 1.4, 0, 1) * 0.9; }
    if (b === 'boreal') { const v = n.fbm(x * 0.004 + 1, z * 0.004 + 8, 3); return HG.util.clamp(0.55 + v * 1.3, 0, 1) * 0.95; }
    if (b === 'plaine') { const v = n.fbm(x * 0.006 + 4, z * 0.006 + 4, 3); const hedge = Math.abs(Math.sin(x * 0.021) * Math.cos(z * 0.007)) > 0.985 || Math.abs(Math.sin(z * 0.018 + x * 0.002)) > 0.99; return v > 0.28 ? 0.8 : hedge ? 0.9 : 0.02; }
    if (b === 'marais') { const v = n.fbm(x * 0.006, z * 0.006, 3); return v > 0.2 && y > this.waterY + 1 ? 0.6 : 0.03; }
    if (b === 'plaineCamp' || b === 'camp') return 0;
    return 0.3;
  }
  buildVegetation() {
    const U = HG.util, T = HG.tex, b = this.biome, rng = this.rng, autumn = this.map.autumn;
    const area = this.size * this.size; const target = Math.min(3400, Math.floor(area / 650));
    const trees = [];
    const isCamp = this.mapId === 'camp';
    for (let tries = 0; tries < target * 7 && trees.length < target; tries++) {
      const x = (rng() - 0.5) * (this.size - 40), z = (rng() - 0.5) * (this.size - 40);
      if (isCamp && Math.hypot(x, z) < 320) continue; // aire de tir dégagée
      if (isCamp && Math.hypot(x, z) > 430 && rng() < 0.4) continue;
      const d = isCamp ? 0.6 : this.treeDensity(x, z);
      if (rng() > d) continue;
      const y = this.height(x, z);
      let type;
      if (b === 'montagne') type = U.weighted({ spruce: 6, pine: 3, fir: 3 });
      else if (b === 'boreal') type = U.weighted({ spruce: 7, fir: 3, birch: 2, pine: 1 });
      else if (b === 'foret') type = U.weighted({ oak: 5, beech: 3, pine: 3, birch: 1, fir: 1, bush: 3 });
      else if (b === 'plaine') type = U.weighted({ oak: 3, bush: 5, birch: 1, pine: 1 });
      else if (b === 'marais') type = U.weighted({ birch: 3, bush: 5, oak: 1 });
      else type = U.weighted({ pine: 4, oak: 3, birch: 2, bush: 2 });
      const scale = type === 'bush' ? U.lerp(0.5, 1.2, rng()) : U.lerp(0.7, 1.35, rng()) * (b === 'montagne' ? Math.max(0.5, 1 - y / this.treeLine * 0.6) : 1);
      trees.push({ x, y, z, type, scale, rot: rng() * Math.PI * 2, autumn: Math.min(1, autumn * (0.6 + rng() * 0.8)) });
    }
    this.trees = trees;
    for (const t of trees) {
      const r = t.type === 'bush' ? 0 : 0.28 * t.scale * (t.type === 'oak' ? 1.6 : 1);
      if (r > 0) this.addCollider(t.x, t.z, r);
      const k = Math.floor(t.x / 20) + ',' + Math.floor(t.z / 20); if (!this.treeGrid.has(k)) this.treeGrid.set(k, []); this.treeGrid.get(k).push(t);
    }
    // --- Troncs
    const byType = {}; for (const t of trees) (byType[t.type] = byType[t.type] || []).push(t);
    const dummy = new THREE.Object3D(); this.vegMeshes = [];
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 8, 1); trunkGeo.translate(0, 0.5, 0);
    const conifGeo = new THREE.PlaneGeometry(1, 1); conifGeo.translate(0, 0.5, 0); // quad ancré en bas
    const leafGeo = new THREE.PlaneGeometry(1, 1);
    const specs = {
      pine:   { trunkH: 14, trunkR: 0.32, bark: 'pine', tiers: [[0.45, 4.2], [0.58, 3.8], [0.7, 3.2], [0.82, 2.5], [0.93, 1.6]], conif: 'pine', tilt: -0.5 },
      spruce: { trunkH: 15, trunkR: 0.3, bark: 'spruce', tiers: [[0.18, 4.4], [0.3, 4.2], [0.42, 3.8], [0.54, 3.3], [0.66, 2.8], [0.78, 2.2], [0.9, 1.5], [0.98, 0.9]], conif: 'spruce', tilt: -0.7 },
      fir:    { trunkH: 12, trunkR: 0.3, bark: 'spruce', tiers: [[0.2, 3.8], [0.35, 3.6], [0.5, 3.2], [0.65, 2.7], [0.8, 2], [0.93, 1.2]], conif: 'fir', tilt: -0.35 },
      oak:    { trunkH: 7, trunkR: 0.45, bark: 'oak', crown: { y: 0.75, rx: 5.5, ry: 4.2, n: 14, leaf: 'oak', size: 5.2 } },
      beech:  { trunkH: 9, trunkR: 0.35, bark: 'beech', crown: { y: 0.7, rx: 4.5, ry: 4.8, n: 13, leaf: 'beech', size: 4.6 } },
      birch:  { trunkH: 9, trunkR: 0.2, bark: 'birch', crown: { y: 0.65, rx: 2.8, ry: 4, n: 10, leaf: 'birch', size: 3.2 } },
      bush:   { trunkH: 0, crown: { y: 0.3, rx: 1.4, ry: 1.0, n: 6, leaf: 'bush', size: 1.9 } },
    };
    for (const type in byType) {
      const list = byType[type], sp = specs[type];
      if (sp.trunkH > 0) {
        const mat = this.windShader(new THREE.MeshStandardMaterial({ map: T.bark(sp.bark), roughness: 0.95 }), 'trunk');
        const im = new THREE.InstancedMesh(trunkGeo, mat, list.length); im.castShadow = true; im.receiveShadow = true;
        list.forEach((t, i) => { dummy.position.set(t.x, t.y - 0.3, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(sp.trunkR * t.scale * 2, sp.trunkH * t.scale + 0.3, sp.trunkR * t.scale * 2); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        this.scene.add(im); this.vegMeshes.push(im);
      }
      if (sp.tiers) {
        const per = sp.tiers.length * 4; const map = T.conifer(sp.conif);
        const mat = this.windShader(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), 'leaf');
        const im = new THREE.InstancedMesh(conifGeo, mat, list.length * per); im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = this.depthMat(map);
        let i = 0;
        for (const t of list) {
          const H = sp.trunkH * t.scale;
          for (const [f, w] of sp.tiers) for (let q = 0; q < 4; q++) {
            const a = t.rot + q * Math.PI / 2 + (f * 7) % 1; const len = w * t.scale * (0.85 + U.hash2(i, q) * 0.3);
            dummy.position.set(t.x + Math.cos(a) * 0.15, t.y + H * f, t.z + Math.sin(a) * 0.15);
            dummy.rotation.set(0, -a + Math.PI / 2, 0); dummy.rotateX(Math.PI / 2 + sp.tilt * 0.5); // quad couché vers l'extérieur
            dummy.scale.set(len * 0.9, len, 1); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix);
          }
        }
        this.scene.add(im); this.vegMeshes.push(im);
      }
      if (sp.crown) {
        const c = sp.crown, per = c.n;
        const variants = [0, 0.5, 1].map((a) => T.leaves(c.leaf, autumn * a));
        variants.forEach((map, vi) => {
          const sub = list.filter((t, idx) => Math.floor(t.autumn * 2.999) === vi); if (!sub.length) return;
          const mat = this.windShader(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }), 'leaf');
          const im = new THREE.InstancedMesh(leafGeo, mat, sub.length * per); im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = this.depthMat(map);
          let i = 0;
          for (const t of sub) {
            const H = sp.trunkH * t.scale, cy = t.y + H * c.y + (type === 'bush' ? 0.9 * t.scale : 0);
            for (let q = 0; q < per; q++) {
              const u = U.hash2(i * 3 + 1, q), v = U.hash2(i * 5 + 2, q), w = U.hash2(i * 7 + 3, q);
              const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1); const r = c.rx * t.scale * 0.55 * Math.pow(w, 0.4);
              dummy.position.set(t.x + Math.sin(ph) * Math.cos(th) * r, cy + Math.cos(ph) * r * (c.ry / c.rx), t.z + Math.sin(ph) * Math.sin(th) * r);
              dummy.rotation.set((v - 0.5) * 1.6, th, (w - 0.5) * 0.8); const s = c.size * t.scale * (0.75 + u * 0.5); dummy.scale.set(s, s, 1); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix);
            }
          }
          this.scene.add(im); this.vegMeshes.push(im);
        });
      }
    }
  }
  buildRocks() {
    const U = HG.util, rng = this.rng, b = this.biome;
    const n = b === 'montagne' ? 900 : b === 'boreal' ? 250 : b === 'foret' ? 120 : 60;
    const geo = new THREE.DodecahedronGeometry(1, 1); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + U.hash2(i, 3) * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: HG.tex.rock(), roughness: 0.9 });
    const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.receiveShadow = true; const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do { x = (rng() - 0.5) * (this.size - 60); z = (rng() - 0.5) * (this.size - 60); tries++; } while (tries < 20 && ((this.mapId === 'camp' && Math.hypot(x, z) < 330) || this.height(x, z) < this.waterY + 0.5 || (b === 'montagne' && this.normal(x, z).y > 0.9 && rng() < 0.6)));
      const s = U.lerp(0.5, b === 'montagne' ? 5 : 2.2, Math.pow(rng(), 2.2));
      d.position.set(x, this.height(x, z) - s * 0.25, z); d.rotation.set(rng() * 0.5, rng() * 6, rng() * 0.5); d.scale.set(s * (0.8 + rng() * 0.6), s * (0.5 + rng() * 0.5), s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      if (s > 1.4) this.addCollider(x, z, s * 0.8);
    }
    this.scene.add(im); this.rocks = im;
  }
  // Herbe par chunks autour du joueur
  buildGrassSystem() {
    const T = HG.tex, b = this.biome;
    const kind = b === 'plaine' ? 'dry' : b === 'marais' ? 'reed' : b === 'montagne' ? 'dry' : 'green';
    const geo = new THREE.BufferGeometry();
    const w = 0.7, h = b === 'marais' ? 1.6 : b === 'plaine' ? 0.7 : 0.75;
    const verts = [], uvs = [], idx = [];
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2; const o = verts.length / 3; verts.push(-c, 0, -s, c, 0, s, c, h, s, -c, h, -s); uvs.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const p = geo.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, 0, 1, 0); // normales vers le haut : herbe éclairée comme le sol
    this.grassGeo = geo;
    this.grassMat = this.windShader(new THREE.MeshStandardMaterial({ map: T.grassBlade(kind), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), 'grass');
    this.grassChunks = new Map(); this.grassPool = []; this.chunkSize = 30; this.grassRadius = 3; this.grassPer = b === 'montagne' ? 500 : b === 'marais' ? 900 : 800;
  }
  updateGrass(px, pz) {
    const cs = this.chunkSize, ci = Math.floor(px / cs), cj = Math.floor(pz / cs), R = this.grassRadius;
    const want = new Set();
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) want.add((ci + i) + ',' + (cj + j));
    for (const [k, m] of this.grassChunks) if (!want.has(k)) { this.scene.remove(m); this.grassPool.push(m); this.grassChunks.delete(k); }
    const d = new THREE.Object3D(), U = HG.util;
    for (const k of want) {
      if (this.grassChunks.has(k)) continue;
      const [i, j] = k.split(',').map(Number);
      let m = this.grassPool.pop(); if (!m) { m = new THREE.InstancedMesh(this.grassGeo, this.grassMat, this.grassPer); m.receiveShadow = true; m.frustumCulled = false; }
      let c = 0; const seed = (i * 7349 + j * 1531) | 0;
      for (let n = 0; n < this.grassPer; n++) {
        const x = (i + U.hash2(seed, n * 2)) * cs, z = (j + U.hash2(seed + 11, n * 2 + 1)) * cs;
        const y = this.height(x, z); if (y < this.waterY + (this.biome === 'marais' ? -0.3 : 0.2)) continue;
        if (this.mapId === 'camp' && Math.abs(x) < 26 && z > -50 && z < 330 && U.hash2(n, 5) < 0.85) continue; // pas de tir dégagé
        const nrm = this.normal(x, z); if (nrm.y < 0.7 || y > this.snowLine + 10) continue;
        const dens = this.biome === 'foret' ? 1 - this.cover(x, z) * 0.4 : 1; if (U.hash2(n, seed) > dens) continue;
        const s = 0.7 + U.hash2(n, 9) * 0.8; d.position.set(x, y - 0.03, z); d.rotation.set(0, U.hash2(n, 3) * 6.28, 0); d.scale.set(s, s * (0.8 + U.hash2(n, 4) * 0.5), s); d.updateMatrix(); m.setMatrixAt(c++, d.matrix);
      }
      m.count = c; m.instanceMatrix.needsUpdate = true; this.scene.add(m); this.grassChunks.set(k, m);
    }
  }
  // ================================================================ PARTICULES MÉTÉO
  buildParticles() {
    const mk = (n, size, color, op) => { const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = (Math.random() - 0.5) * 60; } g.setAttribute('position', new THREE.BufferAttribute(p, 3)); const m = new THREE.PointsMaterial({ size, color, transparent: true, opacity: op, depthWrite: false, sizeAttenuation: true }); const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; this.scene.add(pts); return pts; };
    this.rain = mk(2500, 0.12, 0xbfd0e0, 0.55); this.snow = mk(1800, 0.22, 0xffffff, 0.9);
    this.leavesFx = this.map.autumn > 0.5 ? mk(120, 0.25, 0xc98a3a, 0.9) : null; if (this.leavesFx) this.leavesFx.visible = true;
  }
  updateParticles(dt, cam) {
    const step = (pts, speed, drift) => { if (!pts || !pts.visible) return; const p = pts.geometry.attributes.position.array, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z; for (let i = 0; i < p.length; i += 3) { p[i + 1] -= speed * dt; p[i] += (Math.cos(this.wind.dir) * this.wind.speed * drift + Math.sin(p[i + 1] * 3) * 0.3) * dt; p[i + 2] += Math.sin(this.wind.dir) * this.wind.speed * drift * dt; if (p[i + 1] < cy - 6) { p[i] = cx + (Math.random() - 0.5) * 60; p[i + 1] = cy + 25 + Math.random() * 12; p[i + 2] = cz + (Math.random() - 0.5) * 60; } else if (Math.abs(p[i] - cx) > 35 || Math.abs(p[i + 2] - cz) > 35) { p[i] = cx + (Math.random() - 0.5) * 60; p[i + 2] = cz + (Math.random() - 0.5) * 60; } } pts.geometry.attributes.position.needsUpdate = true; };
    step(this.rain, 22, 0.5); step(this.snow, 1.6, 0.35); step(this.leavesFx, 0.9, 0.5);
  }
  // ================================================================ COLLISIONS
  addCollider(x, z, r, h = 0) { const c = { x, z, r, h }; this.colliders.push(c); const k = Math.floor(x / 16) + ',' + Math.floor(z / 16); if (!this.colGrid.has(k)) this.colGrid.set(k, []); this.colGrid.get(k).push(c); return c; }
  collide(pos, radius) {
    const ci = Math.floor(pos.x / 16), cj = Math.floor(pos.z / 16);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const l = this.colGrid.get((ci + i) + ',' + (cj + j)); if (!l) continue; for (const c of l) { if (c.h && pos.y > this.height(c.x, c.z) + c.h) continue; const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + radius; if (d < m && d > 0.0001) { pos.x += dx / d * (m - d); pos.z += dz / d * (m - d); } } }
  }
  // ================================================================ STRUCTURES
  box(w, h, d, mat, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; }
  buildMirador(x, z, ry = 0) {
    const wood = new THREE.MeshStandardMaterial({ map: HG.tex.wood(), roughness: 0.9 }); const y = this.height(x, z); const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const add = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); };
    for (const [px, pz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) add(0.14, 4.2, 0.14, px, 2.1, pz);
    add(2.2, 0.1, 2.2, 0, 3.6, 0); add(2.2, 0.9, 0.08, 0, 4.1, -1.06); add(2.2, 0.9, 0.08, 0, 4.1, 1.06); add(0.08, 0.9, 2.2, -1.06, 4.1, 0); add(0.08, 0.9, 2.2, 1.06, 4.1, 0);
    add(2.6, 0.08, 2.6, 0, 5.6, 0); for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) add(0.08, 1.5, 0.08, px, 4.85, pz);
    for (let i = 0; i < 7; i++) add(0.7, 0.05, 0.05, 0, 0.5 + i * 0.5, 1.15); add(0.05, 3.7, 0.05, -0.35, 1.85, 1.15); add(0.05, 3.7, 0.05, 0.35, 1.85, 1.15);
    this.scene.add(g); this.addCollider(x, z, 1.4, 3.4); this.structures.push({ type: 'mirador', x, z, y: y + 3.7, ry, group: g });
    this.interact.push({ type: 'mirador', x, z, y: y + 3.7, label: 'Monter au mirador', r: 3 });
    return g;
  }
  buildHutte(x, z, ry = 0) {
    const y = this.height(x, z) + 0.2; const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 1 }); const reed = new THREE.MeshStandardMaterial({ map: HG.tex.grassBlade('reed'), alphaTest: 0.4, side: THREE.DoubleSide });
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const add = (w, h, d, px, py, pz, m) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); mm.position.set(px, py, pz); mm.castShadow = true; mm.receiveShadow = true; g.add(mm); };
    add(3.2, 1.3, 0.2, 0, 0.65, -1.5); add(0.2, 1.3, 3, -1.6, 0.65, 0); add(0.2, 1.3, 3, 1.6, 0.65, 0); add(3.2, 0.12, 3.2, 0, 1.75, 0); add(1, 1.3, 0.2, -1.1, 0.65, 1.5); add(1, 1.3, 0.2, 1.1, 0.65, 1.5);
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), reed); const a = (i / 30) * Math.PI * 2; m.position.set(Math.cos(a) * 2.1, 0.6 + Math.random() * 0.3, Math.sin(a) * 2.1); m.rotation.y = -a; g.add(m); }
    this.scene.add(g); this.structures.push({ type: 'hutte', x, z, y, ry }); this.interact.push({ type: 'hutte', x, z, y, label: 'Entrer dans la hutte', r: 4 });
  }
  buildDecoys(x, z, n = 12) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3f2c, roughness: 0.8 }), head = new THREE.MeshStandardMaterial({ color: 0x2f6b3a }); const list = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 6 + Math.random() * 14; const dx = x + Math.cos(a) * r, dz = z + Math.sin(a) * r; if (!this.isWater(dx, dz)) continue; const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat); b.scale.set(1.4, 0.6, 1); g.add(b); const h = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), head); h.position.set(0.22, 0.14, 0); g.add(h); g.position.set(dx, this.waterY + 0.03, dz); g.rotation.y = Math.random() * 6.28; this.scene.add(g); list.push(g); }
    this.decoys = list; return list;
  }
  buildBaitSite(x, z) { const y = this.height(x, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xd4a83a, roughness: 1 })); m.position.set(x, y + 0.05, z); m.receiveShadow = true; this.scene.add(m); this.bait = { x, z, y }; this.markers.push({ x, z, label: 'Agrainage', icon: '🌽' }); }
  buildCamp() {
    const T = HG.tex, wood = new THREE.MeshStandardMaterial({ map: T.wood(), roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 }), steel = new THREE.MeshStandardMaterial({ color: 0x777, metalness: 0.7, roughness: 0.4 }), roof = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.95 });
    const h = (x, z) => this.height(x, z);
    // Chalet (armurerie) & chenil
    const cab = (x, z, w, d, label, icon) => { const y = h(x, z); this.box(w, 3, d, wood, x, y + 1.5, z); const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.2, 4), roof); r.position.set(x, y + 4.05, z); r.rotation.y = Math.PI / 4; r.castShadow = true; this.scene.add(r); this.addCollider(x, z, Math.max(w, d) * 0.7); this.interact.push({ type: label, x, z: z + d / 2 + 1.5, y, label: icon + ' ' + label, r: 3.5 }); this.markers.push({ x, z, label, icon }); };
    cab(-40, -45, 9, 7, 'Armurerie', '🔫'); cab(-24, -45, 6, 5, 'Chenil', '🐕'); cab(36, -45, 7, 6, 'Bureau des chasses', '📋');
    // ---- Stand carabine : bancs à z=-10, cibles vers +z
    this.range = { targets: [], gongs: [], x: 0, z: -12 };
    this.box(2.4, 0.08, 0.9, wood, 0, h(0, -12) + 1.05, -12); this.box(0.12, 1.05, 0.9, wood, -1, h(0, -12) + 0.5, -12); this.box(0.12, 1.05, 0.9, wood, 1, h(0, -12) + 0.5, -12);
    this.box(6, 0.15, 5, dark, 0, h(0, -12) + 0.05, -12);
    for (const dist of [50, 100, 150, 200, 300]) {
      const x = (dist === 50 ? -6 : dist === 100 ? -3 : dist === 150 ? 0 : dist === 200 ? 3 : 6), z = -12 + dist, y = h(x, z);
      this.box(0.1, 2.2, 0.1, wood, x - 0.7, y + 1.1, z); this.box(0.1, 2.2, 0.1, wood, x + 0.7, y + 1.1, z);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: T.target(), roughness: 0.9, side: THREE.DoubleSide })); t.position.set(x, y + 1.6, z); t.rotation.y = Math.PI; t.castShadow = true; this.scene.add(t);
      t.userData = { hitType: 'target', dist, center: t.position.clone(), radius: 0.6 }; this.range.targets.push(t);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), this.textMat(dist + ' m')); sign.position.set(x, y + 0.5, z - 0.05); sign.rotation.y = Math.PI; this.scene.add(sign);
      // gong acier
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 20), steel); g.rotation.x = Math.PI / 2; g.position.set(x + 1.8, y + 1.3, z); g.castShadow = true; this.scene.add(g); g.userData = { hitType: 'gong', dist }; this.range.gongs.push(g); this.box(0.05, 1.4, 0.05, steel, x + 1.8, y + 0.7 + 0.5, z + 0.1);
      this.markers.push({ x, z, label: dist + ' m', icon: '🎯' });
    }
    // Sanglier courant (rail à 50 m)
    const bz = -12 + 60; const boar = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshStandardMaterial({ map: T.boarTarget(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })); boar.position.set(-14, h(-14, bz) + 0.75, bz); boar.rotation.y = Math.PI; boar.castShadow = true; this.scene.add(boar); boar.userData = { hitType: 'boar', dist: 60 }; this.range.boar = { mesh: boar, t: 0, dir: 1, x0: -14, x1: 14, z: bz, active: true };
    this.box(30, 0.06, 0.1, steel, 0, h(0, bz) + 0.2, bz); this.markers.push({ x: 0, z: bz, label: 'Sanglier courant', icon: '🐗' });
    this.interact.push({ type: 'Poste carabine', x: 0, z: -12, y: h(0, -12), label: '🎯 Poste de tir carabine', r: 3 });
    // ---- Fosse de trap (à l'ouest) : postes en arc, fosse 15 m devant
    const tx = -120, tz = 0; this.trapField = { x: tx, z: tz, posts: [], trench: { x: tx, z: tz + 15 } };
    for (let i = 0; i < 5; i++) { const px = tx - 6 + i * 3, pz = tz; this.box(1, 0.06, 1, dark, px, h(px, pz) + 0.03, pz); this.trapField.posts.push({ x: px, z: pz, y: h(px, pz) }); }
    this.box(12, 0.8, 1.6, dark, tx, h(tx, tz + 15) + 0.3, tz + 15); this.markers.push({ x: tx, z: tz + 8, label: 'Fosse (Trap)', icon: '🥏' });
    this.interact.push({ type: 'trap', x: tx, z: tz, y: h(tx, tz), label: '🥏 Fosse de trap (entraînement)', r: 4 });
    // ---- Skeet (à l'est) : cabane haute et basse, stations en demi-cercle
    const sx = 120, sz = 0; this.skeetField = { x: sx, z: sz, stations: [] };
    const high = { x: sx - 19, z: sz, y: h(sx - 19, sz) }, low = { x: sx + 19, z: sz, y: h(sx + 19, sz) }; this.skeetField.high = high; this.skeetField.low = low;
    this.box(2, 4, 2, wood, high.x, high.y + 2, high.z); this.box(2, 1.6, 2, wood, low.x, low.y + 0.8, low.z);
    for (let i = 0; i < 7; i++) { const a = Math.PI - i * Math.PI / 6; const px = sx + Math.cos(a) * 19, pz = sz - Math.sin(a) * 19; this.box(1, 0.06, 1, dark, px, h(px, pz) + 0.03, pz); this.skeetField.stations.push({ x: px, z: pz, y: h(px, pz) }); }
    this.skeetField.stations.push({ x: sx, z: sz, y: h(sx, sz) }); this.box(1, 0.06, 1, dark, sx, h(sx, sz) + 0.03, sz);
    this.markers.push({ x: sx, z: sz - 8, label: 'Skeet', icon: '🥏' }); this.interact.push({ type: 'skeet', x: sx, z: sz - 19, y: h(sx, sz - 19), label: '🥏 Skeet (entraînement)', r: 4 });
    // ---- Parcours de chasse (au sud)
    const cx = 0, cz = -150; this.sportingField = { x: cx, z: cz, stands: [] };
    for (let i = 0; i < 3; i++) { const px = cx - 20 + i * 20, pz = cz; this.box(1.2, 0.06, 1.2, dark, px, h(px, pz) + 0.03, pz); this.box(0.1, 1.1, 1.2, wood, px - 0.6, h(px, pz) + 0.55, pz); this.sportingField.stands.push({ x: px, z: pz, y: h(px, pz) }); }
    this.markers.push({ x: cx, z: cz, label: 'Parcours de chasse', icon: '🥏' }); this.interact.push({ type: 'sporting', x: cx, z: cz, y: h(cx, cz), label: '🥏 Parcours de chasse (entraînement)', r: 4 });
    // Barrières & drapeaux
    for (let x = -30; x <= 30; x += 6) this.box(0.08, 1, 0.08, wood, x, h(x, -20) + 0.5, -20);
    this.box(60, 0.06, 0.06, wood, 0, h(0, -20) + 0.95, -20);
  }
  textMat(txt) { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#f4efe0'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#222'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 50); const t = new THREE.CanvasTexture(c); if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }); }
  buildFarm(x, z) {
    const wood = new THREE.MeshStandardMaterial({ map: HG.tex.wood(), roughness: 0.9 }), stone = new THREE.MeshStandardMaterial({ map: HG.tex.rock(), roughness: 1 }), roof = new THREE.MeshStandardMaterial({ color: 0x6b3a2a, roughness: 0.9 });
    const y = this.height(x, z); this.box(14, 5, 8, stone, x, y + 2.5, z); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.5, 3, 4, 1), roof); r.scale.set(1.3, 1, 0.9); r.rotation.y = Math.PI / 4; r.position.set(x, y + 6.4, z); this.scene.add(r);
    this.box(10, 4, 6, wood, x + 16, y + 2, z + 4); this.addCollider(x, z, 9); this.addCollider(x + 16, z + 4, 6.5);
    for (let i = 0; i < 8; i++) { const bx = x - 12 + i * 3, bz = z + 12; this.box(0.9, 0.9, 0.9, new THREE.MeshStandardMaterial({ color: 0xc9a955 }), bx, this.height(bx, bz) + 0.45, bz); }
    this.markers.push({ x, z, label: 'Ferme', icon: '🏚️' });
  }
  buildStructures() {
    const b = this.mapId;
    if (b === 'camp') this.buildCamp();
    if (b === 'foret') { this.buildMirador(120, -40, 0.4); this.buildMirador(-180, 210, 2.2); this.buildMirador(300, 280, 4); this.buildBaitSite(120 + Math.cos(0.4 + Math.PI / 2) * 45, -40 + Math.sin(0.4 + Math.PI / 2) * 45); }
    if (b === 'marais') { let hx = 0, hz = 0; for (let t = 0; t < 200; t++) { const x = (this.rng() - 0.5) * 600, z = (this.rng() - 0.5) * 600; if (!this.isWater(x, z) && this.waterDepth(x + 20, z) > 0.3 && this.waterDepth(x - 20, z) > 0.3) { hx = x; hz = z; break; } } this.buildHutte(hx, hz, 0); this.buildDecoys(hx, hz + 18, 12); this.spawnPoint = { x: hx, z: hz - 6 }; }
    if (b === 'plaine') this.buildFarm(-260, 180);
    if (b === 'boreal') { this.buildMirador(-100, 150, 1); }
    if (b === 'montagne') { this.spawnPoint = { x: -300, z: -200 }; }
  }
  // ================================================================ MAJ
  update(dt, player, cam, tscale) {
    this.time += dt; const U = HG.util;
    // vent : rafales
    this.wind.gust = Math.sin(this.time * 0.7) * 0.5 + Math.sin(this.time * 1.9 + 1) * 0.3 + this.noise.noise2(this.time * 0.2, 0) * 0.6;
    const ws = this.wind.speed * (1 + this.wind.gust * 0.35);
    if (this.uWind) this.uWind.value = 0.12 + ws * 0.09; if (this.uTime) this.uTime.value = this.time;
    this.skyUniforms.time.value = this.time;
    // soleil suit le joueur (ombres)
    const sd = this.sunDir || new THREE.Vector3(0, 1, 0);
    const lx = Math.round(player.x / 8) * 8, lz = Math.round(player.z / 8) * 8;
    this.sun.position.set(lx + sd.x * 260, player.y + sd.y * 260, lz + sd.z * 260); this.sun.target.position.set(lx, player.y, lz); this.sun.target.updateMatrixWorld();
    this.moon.target.position.copy(this.sun.target.position); this.moon.position.set(lx + this.moon.position.x, this.moon.position.y, lz + this.moon.position.z);
    this.sky.position.copy(cam.position);
    if (this.water) { this.waterMat.normalMap.offset.x += dt * 0.012; this.waterMat.normalMap.offset.y += dt * 0.008; }
    if (!this._lastG || Math.hypot(player.x - this._lastG.x, player.z - this._lastG.z) > 8) { this.updateGrass(player.x, player.z); this._lastG = { x: player.x, z: player.z }; }
    this.updateParticles(dt, cam);
    if (this.range && this.range.boar && this.range.boar.active) { const b = this.range.boar; b.t += dt * 0.32 * b.dir; if (b.t > 1 || b.t < 0) { b.dir *= -1; b.t = U.clamp(b.t, 0, 1); } b.mesh.position.x = U.lerp(b.x0, b.x1, b.t); b.mesh.scale.x = b.dir > 0 ? 1 : -1; }
  }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
};
