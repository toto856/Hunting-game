// Monde : terrain procédural, eau / glace, ciel dynamique, végétation, météo.
'use strict';

DH.World = class World {
  constructor(scene, opts) {
    this.scene = scene;
    this.map = opts.map;
    this.weather = opts.weather;
    this.time = opts.time;
    this.quality = opts.quality || 'high';
    this.clearZones = opts.clearZones || [];
    this.q = { low: 0.35, medium: 0.65, high: 1 }[this.quality] || 1;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.noise = DH.util.makeNoise(this.map.seed);
    this.size = 600;
    this.half = this.size / 2;
    this.seg = this.quality === 'low' ? 150 : 220;
    this.step = this.size / this.seg;
    this.bounds = 185;
    this.frozen = !!this.map.frozen;
    this.holes = this.map.basins.map((b) => ({ x: b.x, z: b.z, r: b.r * 0.42 }));
    this.colliders = [];
    this.colGrid = new Map();
    this.boxes = [];
    this.windAngle = Math.random() * Math.PI * 2;
    this.windSpeed = this.weather.wind;
    this.wind = new THREE.Vector3(Math.cos(this.windAngle), 0, Math.sin(this.windAngle)).multiplyScalar(this.windSpeed);
    this.snowAmount = Math.min(1, this.map.snow + (this.weather.snowAdd || 0) * 0.35);
    this.snowTarget = Math.min(1, this.map.snow + (this.weather.snowAdd || 0));
    this.snowTimer = 0;
    this.clock = 0;
    this.flash = 0;
    this.lightningT = DH.util.rand(6, 14);
    this.swayUniform = { value: 0 };
    this.windUniform = { value: new THREE.Vector2(this.wind.x, this.wind.z) };
    this.disposables = [];

    this.buildHeights();
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildLights();
    this.buildVegetation();
    this.buildBlind();
    this.buildPrecipitation();
  }

  // ======================================================== RELIEF
  rawHeight(x, z) {
    const n = this.noise, m = this.map;
    const { smoothstep, lerp } = DH.util;
    let h;
    switch (m.shape) {
      case 'marsh':
        h = 0.9 + n.fbm(x * 0.008, z * 0.008, 4) * m.amp * 1.6 + n.fbm(x * 0.03 + 50, z * 0.03, 2) * 0.6;
        break;
      case 'lake': {
        const d = Math.hypot(x, z + 60);
        h = 1.4 + n.fbm(x * 0.006, z * 0.006, 4) * 6 + smoothstep(90, 230, d) * m.amp * (0.8 + n.fbm(x * 0.01, z * 0.01, 3));
        break;
      }
      case 'river': {
        const cz = 22 * Math.sin(x * 0.018) + 10 * Math.sin(x * 0.041 + 1);
        const dz = Math.abs(z - cz);
        h = -2.8 + smoothstep(7, 22, dz) * 4 + smoothstep(30, 190, dz) * m.amp + n.fbm(x * 0.01, z * 0.01, 4) * 3 * smoothstep(12, 30, dz);
        break;
      }
      case 'tundra':
        h = 1.3 + n.fbm(x * 0.007, z * 0.007, 5) * m.amp + n.ridged(x * 0.004, z * 0.004, 3) * 2;
        break;
      case 'fjord': {
        const cz = -12 + 14 * Math.sin(x * 0.009);
        const dz = Math.abs(z - cz);
        h = -5 + smoothstep(18, 36, dz) * 6.5 + smoothstep(45, 150, dz) * m.amp * (0.5 + 0.8 * n.ridged(x * 0.008, z * 0.008, 4)) + n.fbm(x * 0.03, z * 0.03, 3) * 1.5 * smoothstep(20, 40, dz);
        break;
      }
      case 'bayou':
        h = 0.35 + n.fbm(x * 0.012, z * 0.012, 4) * m.amp * 1.8;
        break;
      default:
        h = 1;
    }
    for (const b of m.basins) {
      const d = Math.hypot(x - b.x, z - b.z);
      const rr = b.r * (0.85 + 0.3 * (n.noise2(x * 0.025 + b.x, z * 0.025 + b.z) + 0.5));
      if (d < rr) {
        const t = smoothstep(rr * 0.4, rr, d);
        h = Math.min(h, lerp(-b.d, h, t));
      }
    }
    const sp = m.spawn;
    const ds = Math.hypot(x - sp.x, z - sp.z);
    if (ds < 16) h = lerp(Math.max(h, 0.9), h, smoothstep(9, 16, ds));
    for (const c of this.clearZones) {
      if (c.flat) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r) h = lerp(Math.max(h, 0.8), h, smoothstep(c.r * 0.7, c.r, d));
      }
    }
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += smoothstep(205, 290, e) * (22 + n.fbm(x * 0.01, z * 0.01, 3) * 25);
    return Math.max(h, -5);
  }

  buildHeights() {
    const N = this.seg + 1;
    this.heights = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = -this.half + ix * this.step;
        const z = -this.half + iz * this.step;
        this.heights[iz * N + ix] = this.rawHeight(x, z);
      }
    }
  }

  // Hauteur du terrain (interpolation bilinéaire de la grille)
  heightAt(x, z) {
    const N = this.seg + 1;
    const fx = DH.util.clamp((x + this.half) / this.step, 0, this.seg - 0.001);
    const fz = DH.util.clamp((z + this.half) / this.step, 0, this.seg - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h = this.heights;
    const a = h[iz * N + ix], b = h[iz * N + ix + 1];
    const c = h[(iz + 1) * N + ix], d = h[(iz + 1) * N + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  inHole(x, z) {
    for (const h of this.holes) if ((x - h.x) ** 2 + (z - h.z) ** 2 < h.r * h.r) return true;
    return false;
  }

  // Eau libre (où les canards peuvent se poser)
  isOpenWater(x, z, minDepth = 0.35) {
    if (this.heightAt(x, z) > -minDepth) return false;
    return !this.frozen || this.inHole(x, z);
  }

  isIce(x, z) {
    return this.frozen && this.heightAt(x, z) < 0 && !this.inHole(x, z);
  }

  // Sol sur lequel on marche / tombe (la glace porte)
  groundAt(x, z) {
    const h = this.heightAt(x, z);
    if (this.frozen && h < 0 && !this.inHole(x, z)) return 0.02;
    return h;
  }

  surfaceAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < -0.05 && !this.isIce(x, z)) return 'water';
    if (this.snowAmount > 0.4 || this.isIce(x, z)) return 'snow';
    return 'ground';
  }

  randomWaterPoint(cx = 0, cz = 0, radius = 150, minDepth = 0.6) {
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > this.bounds || Math.abs(z) > this.bounds) continue;
      if (this.isOpenWater(x, z, minDepth)) return new THREE.Vector3(x, 0, z);
    }
    if (this.frozen && this.holes.length) {
      const h = DH.util.pick(this.holes);
      return new THREE.Vector3(h.x, 0, h.z);
    }
    return null;
  }

  // ======================================================== TERRAIN
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const N = this.seg + 1;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % N, iz = Math.floor(i / N);
      pos.setY(i, this.heights[iz * N + ix]);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const m = this.map;
    const pal = m.ground.map((c) => new THREE.Color(c));
    const mud = new THREE.Color(m.mud), sand = new THREE.Color(m.sand), rock = new THREE.Color(m.rock);
    const n = this.noise;
    const { smoothstep } = DH.util;
    this.baseColors = new Float32Array(pos.count * 3);
    this.snowMask = new Float32Array(pos.count);
    const c = new THREE.Color(), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ny = nor.getY(i);
      const n1 = n.fbm(x * 0.02, z * 0.02, 3) + 0.5;
      const n2 = n.noise2(x * 0.11 + 100, z * 0.11) + 0.5;
      c.copy(pal[0]).lerp(pal[1 % pal.length], DH.util.clamp(n1, 0, 1));
      c.lerp(pal[2 % pal.length], DH.util.clamp(n2 * 0.6, 0, 1));
      if (pal[3]) c.lerp(pal[3], smoothstep(0.6, 0.9, n.noise2(x * 0.04 - 30, z * 0.04) + 0.5) * 0.6);
      // Berges : sable / vase
      c.lerp(sand, smoothstep(0.9, 0.1, y) * 0.55);
      c.lerp(mud, smoothstep(0.1, -0.6, y));
      if (y < -0.6) c.multiplyScalar(0.7);
      // Roche sur les pentes fortes
      c.lerp(rock, smoothstep(0.82, 0.62, ny));
      tmp.setScalar(0.9 + n2 * 0.2);
      c.multiply(tmp);
      this.baseColors[i * 3] = c.r;
      this.baseColors[i * 3 + 1] = c.g;
      this.baseColors[i * 3 + 2] = c.b;
      let mask = smoothstep(0.55, 0.85, ny) * (0.55 + 0.45 * DH.util.clamp(n1, 0, 1));
      if (m.snowLine) mask = Math.min(1, mask + smoothstep(m.snowLine, m.snowLine + 12, y) * 0.9);
      if (y < -0.2) mask = this.frozen ? mask * 0.9 : 0;
      this.snowMask[i] = mask;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.terrainGeo = geo;
    this.applySnow();

    const detail = DH.util.canvasTexture(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = 200 + Math.random() * 55;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // taches plus larges
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0,0.05)`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, Math.PI * 2);
        g.fill();
      }
    });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(150, 150);
    detail.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
    this.disposables.push(geo, mat, detail);
  }

  applySnow() {
    const col = this.terrainGeo.attributes.color;
    const snow = new THREE.Color('#eef2f8');
    const thr = 1 - this.snowAmount;
    const { smoothstep } = DH.util;
    for (let i = 0; i < col.count; i++) {
      const s = this.snowAmount <= 0.001 ? 0 : smoothstep(thr - 0.12, thr + 0.12, this.snowMask[i]);
      const k = 0.92 + (i * 7919 % 13) / 150;
      col.setXYZ(
        i,
        this.baseColors[i * 3] * (1 - s) + snow.r * s * k,
        this.baseColors[i * 3 + 1] * (1 - s) + snow.g * s * k,
        this.baseColors[i * 3 + 2] * (1 - s) + snow.b * s
      );
    }
    col.needsUpdate = true;
    this.appliedSnow = this.snowAmount;
  }

  // ======================================================== EAU / GLACE
  buildWater() {
    const m = this.map;
    const holes = [];
    for (let i = 0; i < 8; i++) {
      const h = this.holes[i];
      holes.push(h && this.frozen ? new THREE.Vector3(h.x, h.z, h.r) : new THREE.Vector3(0, 0, 0));
    }
    this.waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uSkyColor: { value: new THREE.Color('#9ab') },
        uDeep: { value: new THREE.Color(m.water.deep) },
        uShallow: { value: new THREE.Color(m.water.shallow) },
        uIce: { value: this.frozen ? 1 : 0 },
        uHoles: { value: holes },
        uWind: { value: Math.min(1.5, 0.3 + this.windSpeed / 8) },
        uRain: { value: this.weather.rain ? 1 : 0 },
        uLight: { value: 1 },
      },
    ]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      fog: true,
      vertexShader: `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uIce, uWind, uRain, uLight;
        uniform vec3 uSunDir, uSunColor, uSkyColor, uDeep, uShallow;
        uniform vec3 uHoles[8];
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vWorld.xz;
          float t = uTime;
          // Vagues
          float dx = 0.0, dz = 0.0;
          dx += cos(p.x*0.35 + t*1.3)*0.06 + cos(p.x*0.9 + p.y*0.4 + t*2.1)*0.035 + cos(p.x*2.3 - p.y*1.1 + t*3.3)*0.02;
          dz += cos(p.y*0.31 + t*1.1)*0.06 + cos(p.y*0.8 - p.x*0.5 + t*1.8)*0.035 + cos(p.y*2.7 + p.x*1.3 + t*2.9)*0.02;
          dx += (vn(p*3.0 + t*0.7)-0.5)*0.08*uWind; dz += (vn(p*3.0 - t*0.6 + 7.0)-0.5)*0.08*uWind;
          if (uRain > 0.5) { dx += (vn(p*9.0 + t*6.0)-0.5)*0.25; dz += (vn(p*9.0 - t*5.0)-0.5)*0.25; }
          // Glace
          float open = 0.0;
          for (int i=0;i<8;i++){ vec3 h=uHoles[i]; if(h.z>0.0){ float d=length(p-h.xy); open=max(open, smoothstep(h.z, h.z*0.8, d)); } }
          float ice = uIce * (1.0 - open);
          vec3 n = normalize(vec3(-dx*uWind*(1.0-ice), 1.0, -dz*uWind*(1.0-ice)));
          vec3 view = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
          vec3 base = mix(uShallow, uDeep, 0.6 + 0.4*vn(p*0.05));
          vec3 col = mix(base * uLight, uSkyColor, 0.15 + fres*0.75);
          vec3 r = reflect(-view, n);
          float spec = pow(max(dot(r, uSunDir), 0.0), 180.0);
          col += uSunColor * spec * 1.6;
          // Surface gelée : blanc bleuté avec fissures et neige poudrée
          float crack = smoothstep(0.03, 0.0, abs(vn(p*0.6)-0.5)) * 0.35 + smoothstep(0.02,0.0,abs(vn(p*1.7+3.0)-0.5))*0.2;
          vec3 iceCol = mix(vec3(0.72,0.82,0.9), vec3(0.93,0.96,1.0), vn(p*0.3)*0.8 + vn(p*2.0)*0.2) - crack*vec3(0.25,0.18,0.1);
          iceCol *= uLight;
          iceCol += uSunColor * pow(max(dot(reflect(-view, vec3(0,1,0)), uSunDir),0.0), 40.0) * 0.3;
          col = mix(col, iceCol, ice);
          // Liseré d'eau autour des trous
          col = mix(col, uDeep*0.6*uLight, uIce * open * (1.0-open) * 1.5);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = 0;
    this.water.receiveShadow = false;
    this.group.add(this.water);
    this.disposables.push(geo, mat);
  }

  // ======================================================== CIEL
  buildSky() {
    const t = this.time, w = this.weather;
    const C = (c) => new THREE.Color(c);
    const greyBase = t.night ? C('#151a24') : t.id === 'jour' ? C(w.snow ? '#b4b9c2' : '#9aa1aa') : C('#6d6a72');
    const clouds = w.clouds;
    this.skyTop = C(t.sky.top).lerp(greyBase, clouds * 0.8);
    this.skyHorizon = C(t.sky.horizon).lerp(greyBase.clone().multiplyScalar(1.1), clouds * 0.75);
    if (w.id === 'brouillard' || w.id === 'blizzard') {
      this.skyTop.lerp(this.skyHorizon, 0.7);
    }
    this.fogColor = this.skyHorizon.clone();
    const el = THREE.MathUtils.degToRad(t.sunElev), az = THREE.MathUtils.degToRad(t.sunAz);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    this.skyUniforms = {
      topColor: { value: this.skyTop },
      horizonColor: { value: this.skyHorizon },
      groundColor: { value: this.skyHorizon.clone().multiplyScalar(0.7) },
      sunColor: { value: C(t.sky.sun) },
      sunDir: { value: this.sunDir },
      cloudCover: { value: clouds },
      cloudColor: { value: t.night ? C('#1c2230') : C('#ffffff').lerp(greyBase, 0.25 + clouds * 0.45) },
      uTime: { value: 0 },
      stars: { value: t.night ? 1 - clouds * 0.9 : 0 },
      night: { value: t.night ? 1 : 0 },
      sunSize: { value: t.night ? 0.0009 : 0.0006 },
      fogAmt: { value: DH.util.clamp(w.fog * 25, 0, 1) },
      flash: { value: 0 },
      windDir: { value: new THREE.Vector2(this.wind.x, this.wind.z).normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 topColor, horizonColor, groundColor, sunColor, sunDir, cloudColor;
        uniform float cloudCover, uTime, stars, night, sunSize, fogAmt, flash;
        uniform vec2 windDir;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.55, h), 0.65));
          col = mix(col, groundColor, smoothstep(0.0, -0.2, h));
          float sd = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(sd, 5.0)*0.28 + pow(sd, 48.0)*0.45) * (1.0 - night*0.75);
          float disc = smoothstep(1.0 - sunSize, 1.0 - sunSize*0.5, sd);
          // Étoiles
          if (stars > 0.0 && h > 0.0) {
            vec2 uv = vec2(atan(d.z, d.x), asin(h)) * 180.0;
            vec2 id = floor(uv);
            float r = hash(id);
            float st = step(0.985, r) * smoothstep(0.45, 0.0, length(fract(uv) - 0.5));
            st *= 0.6 + 0.4*sin(uTime*3.0 + r*100.0);
            col += vec3(st) * stars * smoothstep(0.0, 0.25, h);
          }
          // Nuages
          float cov = 0.0;
          if (h > 0.0) {
            vec2 cuv = d.xz / (h + 0.1) * 0.9 + windDir * uTime * 0.006;
            float c = fbm(cuv * 1.3);
            cov = smoothstep(0.72 - 0.58*cloudCover, 0.9 - 0.5*cloudCover, c) * smoothstep(0.0, 0.12, h);
            float lit = 0.75 + 0.35 * fbm(cuv * 2.6 + 3.0) + pow(sd, 6.0)*0.6*(1.0-night);
            vec3 cc = cloudColor * lit;
            cc = mix(cc, sunColor * 0.8 + cloudColor*0.4, pow(sd, 12.0) * 0.5 * (1.0 - night));
            col = mix(col, cc, cov);
          }
          col += sunColor * disc * (night > 0.5 ? 1.2 : 3.0) * (1.0 - cov*0.97);
          col = mix(col, horizonColor, fogAmt * (1.0 - smoothstep(-0.1, 0.5, h)) );
          col += vec3(0.8,0.85,1.0) * flash;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const geo = new THREE.SphereGeometry(900, 32, 16);
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.disposables.push(geo, mat);
    this.scene.fog = new THREE.FogExp2(this.fogColor, w.fog);
    this.scene.background = this.fogColor.clone();
  }

  buildLights() {
    const t = this.time, w = this.weather;
    const dim = 1 - w.clouds * 0.62;
    this.hemi = new THREE.HemisphereLight(this.skyTop.clone().lerp(new THREE.Color('#ffffff'), 0.35), new THREE.Color(this.map.ground[0]).multiplyScalar(0.6), t.hemi * (0.75 + 0.35 * (1 - dim)));
    this.baseHemi = this.hemi.intensity;
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(new THREE.Color(t.sky.sun), t.sunI * dim);
    this.sun.position.copy(this.sunDir).multiplyScalar(150);
    const shadows = this.quality !== 'low';
    this.sun.castShadow = shadows;
    if (shadows) {
      const s = this.quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(s, s);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -70;
      c.right = c.top = 70;
      c.near = 10;
      c.far = 400;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);
    this.amb = new THREE.AmbientLight(0xffffff, t.night ? 0.12 : 0.18);
    this.group.add(this.amb);
    this.waterUniforms.uSunDir.value.copy(this.sunDir);
    this.waterUniforms.uSunColor.value.copy(this.sun.color).multiplyScalar(dim * (t.night ? 0.6 : 1));
    this.waterUniforms.uSkyColor.value.copy(this.skyHorizon).lerp(this.skyTop, 0.4);
    this.waterUniforms.uLight.value = t.night ? 0.3 : 0.6 + 0.4 * dim;
    this.light = t.night ? 0.3 : 0.55 + 0.45 * dim;
  }

  // ======================================================== VÉGÉTATION
  buildVegetation() {
    const { xf, mergeGeometries, rand, pick } = DH.util;
    const m = this.map, q = this.q;
    const snowy = this.snowTarget > 0.45;
    const lambert = (opts) => {
      const mat = new THREE.MeshLambertMaterial(opts);
      this.disposables.push(mat);
      return mat;
    };
    const addInst = (geo, mat, list, { shadow = true, colorFn = null, sway = false } = {}) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const mtx = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler();
      const col = new THREE.Color();
      list.forEach((it, i) => {
        e.set(it.tilt || 0, it.rot, (it.tilt2 || 0));
        qn.setFromEuler(e);
        mtx.compose(new THREE.Vector3(it.x, it.y, it.z), qn, new THREE.Vector3(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sx || 1)));
        mesh.setMatrixAt(i, mtx);
        if (colorFn) {
          colorFn(it, col);
          mesh.setColorAt(i, col);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = shadow && this.quality === 'high';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (sway) this.addSway(mat);
      this.group.add(mesh);
      this.disposables.push(geo);
      return mesh;
    };
    const place = (count, test, opts = {}) => {
      const out = [];
      const target = Math.floor(count * q);
      let tries = 0;
      while (out.length < target && tries < target * 8) {
        tries++;
        const x = rand(-275, 275), z = rand(-275, 275);
        const h = this.heightAt(x, z);
        if (!test(x, z, h)) continue;
        if (opts.clear !== false) {
          const sp = m.spawn;
          const dsp = Math.hypot(x - sp.x, z - sp.z);
          if (dsp < (opts.clear || 10)) continue;
          // couloir de tir dégagé devant l'affût
          if (opts.lane && z < sp.z && Math.abs(x - sp.x) < 4 + (sp.z - z) * 0.25 && dsp < 70) continue;
        }
        let blocked = false;
        for (const c of this.clearZones) if (Math.hypot(x - c.x, z - c.z) < c.r) { blocked = true; break; }
        if (blocked) continue;
        out.push({ x, y: h, z, rot: Math.random() * Math.PI * 2, s: rand(opts.smin || 0.75, opts.smax || 1.3) });
      }
      return out;
    };
    const slope = (x, z) => {
      const a = this.heightAt(x + 1, z) - this.heightAt(x - 1, z);
      const b = this.heightAt(x, z + 1) - this.heightAt(x, z - 1);
      return Math.hypot(a, b) / 2;
    };
    const forest = (x, z, bias = 0) => this.noise.fbm(x * 0.012 + 40, z * 0.012, 3) + bias + Math.random() * 0.3 > 0.1;
    const canopyCols = m.canopy.map((c) => new THREE.Color(c));
    const canopyColor = (it, c) => c.copy(pick(canopyCols)).multiplyScalar(rand(0.85, 1.15));
    const trunkMat = lambert({ color: '#5a4430' });
    const snowMat = lambert({ color: '#f2f5fa' });

    // ---- Pins
    if (m.veg.pine) {
      const list = place(m.veg.pine, (x, z, h) => h > 0.5 && slope(x, z) < 0.9 && forest(x, z, 0.1), { clear: 14, lane: true });
      list.forEach((t) => { t.y -= 0.2; t.sy = rand(0.85, 1.35); this.addCollider(t.x, t.z, 0.3 * t.s); });
      const layers = [[1.7, 2.8, 2.9], [1.35, 2.4, 4.2], [0.95, 2.0, 5.4], [0.5, 1.5, 6.5]];
      const trunk = xf(new THREE.CylinderGeometry(0.12, 0.22, 3, 6), { y: 1.5 });
      const cone = mergeGeometries(layers.map(([r, hh, y]) => xf(new THREE.ConeGeometry(r, hh, 8), { y })));
      addInst(trunk, trunkMat, list);
      addInst(cone, lambert({ vertexColors: true }), list, { colorFn: canopyColor });
      if (snowy) {
        const caps = mergeGeometries(layers.map(([r, hh, y]) => xf(new THREE.ConeGeometry(r * 0.62, hh * 0.52, 8), { y: y + hh * 0.26 + 0.03 })));
        addInst(caps, snowMat, list, { shadow: false });
      }
    }
    // ---- Feuillus
    if (m.veg.deciduous) {
      const list = place(m.veg.deciduous, (x, z, h) => h > 0.5 && slope(x, z) < 0.7 && forest(x, z), { clear: 14, lane: true });
      list.forEach((t) => { t.y -= 0.2; this.addCollider(t.x, t.z, 0.35 * t.s); });
      const trunk = mergeGeometries([
        xf(new THREE.CylinderGeometry(0.16, 0.3, 3.6, 6), { y: 1.8 }),
        xf(new THREE.CylinderGeometry(0.06, 0.1, 1.8, 5), { x: 0.5, y: 3.4, rz: -0.7 }),
        xf(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5), { x: -0.45, y: 3.3, rz: 0.8 }),
      ]);
      const blob = (r, x, y, z) => xf(new THREE.IcosahedronGeometry(r, 1), { x, y, z, sy: 0.85 });
      const canopy = mergeGeometries([blob(2.3, 0, 4.6, 0), blob(1.7, 1.3, 4.0, 0.5), blob(1.6, -1.1, 4.1, -0.6), blob(1.5, 0.2, 5.8, 0.3), blob(1.3, -0.4, 4.3, 1.3)]);
      addInst(trunk, lambert({ vertexColors: true, color: '#5a4430' }), list);
      addInst(canopy, lambert({ vertexColors: true }), list, { colorFn: canopyColor });
    }
    // ---- Bouleaux
    if (m.veg.birch) {
      const list = place(m.veg.birch, (x, z, h) => h > 0.4 && slope(x, z) < 0.8 && forest(x, z, 0.15), { clear: 14, lane: true });
      list.forEach((t) => { t.y -= 0.2; this.addCollider(t.x, t.z, 0.2 * t.s); });
      const trunk = xf(new THREE.CylinderGeometry(0.09, 0.15, 6, 6), { y: 3 });
      const canopy = mergeGeometries([
        xf(new THREE.IcosahedronGeometry(1.3, 1), { y: 5.6, sy: 1.5 }),
        xf(new THREE.IcosahedronGeometry(1.0, 1), { x: 0.6, y: 4.6, sy: 1.3 }),
        xf(new THREE.IcosahedronGeometry(0.9, 1), { x: -0.5, y: 4.8, z: 0.4, sy: 1.3 }),
      ]);
      addInst(trunk, lambert({ color: '#e6e2d8' }), list);
      if (!snowy) {
        const birchCols = m.id === 'foret' ? ['#e8c02a', '#d8a820', '#f0d040'] : ['#7a9a3a', '#8aa848'];
        const bc = birchCols.map((c) => new THREE.Color(c));
        addInst(canopy, lambert({ vertexColors: true }), list, { colorFn: (it, c) => c.copy(pick(bc)).multiplyScalar(rand(0.9, 1.1)) });
      }
    }
    // ---- Arbres nus (hiver)
    if (m.veg.bare) {
      const list = place(m.veg.bare, (x, z, h) => h > 0.4 && slope(x, z) < 0.8 && forest(x, z, 0.05), { clear: 14, lane: true });
      list.forEach((t) => { t.y -= 0.2; this.addCollider(t.x, t.z, 0.3 * t.s); });
      const parts = [xf(new THREE.CylinderGeometry(0.14, 0.26, 4.5, 6), { y: 2.25 })];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const y = 2.6 + (i % 3) * 0.7;
        parts.push(xf(new THREE.CylinderGeometry(0.03, 0.08, 2.4, 4), { x: Math.cos(a) * 0.8, y: y + 0.9, z: Math.sin(a) * 0.8, rz: -Math.cos(a) * 0.75, rx: Math.sin(a) * 0.75 }));
      }
      addInst(mergeGeometries(parts), lambert({ vertexColors: true, color: '#4a4038' }), list);
    }
    // ---- Cyprès chauves (bayou)
    if (m.veg.cypress) {
      const list = place(m.veg.cypress, (x, z, h) => h > -1.6 && h < 1.8 && forest(x, z, 0.3), { clear: 14, lane: true });
      list.forEach((t) => { t.y -= 0.1; this.addCollider(t.x, t.z, 0.6 * t.s); });
      const trunk = mergeGeometries([
        xf(new THREE.CylinderGeometry(0.4, 1.1, 1.6, 8), { y: 0.3 }),
        xf(new THREE.CylinderGeometry(0.28, 0.42, 9, 7), { y: 5.4 }),
        xf(new THREE.CylinderGeometry(0.08, 0.14, 3, 5), { x: 1.2, y: 8.5, rz: -1.0 }),
        xf(new THREE.CylinderGeometry(0.08, 0.14, 3, 5), { x: -1.1, y: 9, rz: 1.1 }),
      ]);
      const blob = (r, x, y, z) => xf(new THREE.IcosahedronGeometry(r, 1), { x, y, z, sy: 0.4 });
      const canopy = mergeGeometries([blob(3.2, 0, 10.4, 0), blob(2.4, 2.3, 9.6, 0.6), blob(2.3, -2.2, 10, -0.5), blob(2, 0.4, 11.2, -1.8)]);
      const moss = [];
      for (let i = 0; i < 9; i++) {
        const a = rand(0, Math.PI * 2), r = rand(0.8, 3.2);
        moss.push(xf(new THREE.ConeGeometry(0.28, rand(1.6, 2.8), 5), { x: Math.cos(a) * r, y: 8.6, z: Math.sin(a) * r, rx: Math.PI }));
      }
      addInst(trunk, lambert({ vertexColors: true, color: '#5c5044' }), list);
      addInst(canopy, lambert({ vertexColors: true }), list, { colorFn: canopyColor });
      addInst(mergeGeometries(moss), lambert({ vertexColors: true, color: '#8f9c80' }), list, { shadow: false });
    }
    // ---- Buissons
    if (m.veg.bush) {
      const list = place(m.veg.bush, (x, z, h) => h > 0.3 && slope(x, z) < 1, { clear: 8, smin: 0.6, smax: 1.4 });
      list.forEach((t) => { t.sy = rand(0.6, 0.9); });
      const geo = mergeGeometries([
        xf(new THREE.IcosahedronGeometry(0.9, 1), { y: 0.5 }),
        xf(new THREE.IcosahedronGeometry(0.7, 1), { x: 0.6, y: 0.4, z: 0.2 }),
        xf(new THREE.IcosahedronGeometry(0.6, 0), { x: -0.5, y: 0.35, z: -0.3 }),
      ]);
      const dark = canopyCols.map((c) => c.clone().multiplyScalar(0.75));
      const bushMat = lambert({ vertexColors: true });
      addInst(geo, bushMat, list, { colorFn: (it, c) => {
        c.copy(pick(dark)).multiplyScalar(rand(0.8, 1.1));
        if (snowy) c.lerp(new THREE.Color('#e8edf4'), 0.55);
      } });
    }
    // ---- Rochers
    if (m.veg.rocks) {
      const list = place(m.veg.rocks, (x, z, h) => h > -0.5, { clear: 10, smin: 0.4, smax: 2.2 });
      list.forEach((t) => { t.y -= 0.3 * t.s; t.sy = rand(0.5, 0.9); t.tilt = rand(-0.3, 0.3); if (t.s > 1.2) this.addCollider(t.x, t.z, 0.8 * t.s); });
      const g = new THREE.DodecahedronGeometry(1, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rand(0.8, 1.2), p.getY(i) * rand(0.8, 1.2), p.getZ(i) * rand(0.8, 1.2));
      g.computeVertexNormals();
      const rc = new THREE.Color(m.rock);
      addInst(g, lambert({ flatShading: true }), list, { colorFn: (it, c) => {
        c.copy(rc).multiplyScalar(rand(0.75, 1.15));
        if (snowy && Math.random() < 0.6) c.lerp(new THREE.Color('#f0f4f8'), 0.5);
      } });
    }
    // ---- Roseaux (bords de l'eau)
    if (m.veg.reeds) {
      const list = place(m.veg.reeds, (x, z, h) => {
        if (h > 0.7 || h < -0.9) return false;
        if (this.frozen && h < 0 && !this.inHole(x, z) && Math.random() < 0.7) return false;
        return this.noise.noise2(x * 0.05, z * 0.05) + Math.random() * 0.5 > -0.05;
      }, { clear: 4, lane: true, smin: 0.7, smax: 1.3 });
      list.forEach((t) => { t.y -= 0.05; });
      const rc = new THREE.Color(m.reed);
      const parts = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(0.05, 0.35);
        const hgt = rand(1.4, 2.3);
        const blade = new THREE.BufferGeometry();
        blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.035, 0, 0, 0.035, 0, 0, 0, hgt, 0], 3));
        blade.computeVertexNormals();
        parts.push({ geo: xf(blade, { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rand(0, 3), rz: rand(-0.15, 0.15), rx: rand(-0.15, 0.15) }), color: rc.clone().multiplyScalar(rand(0.8, 1.15)) });
        if (i % 3 === 0) {
          parts.push({ geo: xf(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 5), { x: Math.cos(a) * r, y: hgt * 0.82, z: Math.sin(a) * r }), color: '#5a3a20' });
        }
      }
      const geo = mergeGeometries(parts);
      addInst(geo, lambert({ vertexColors: true, side: THREE.DoubleSide }), list, {
        shadow: false, sway: true,
        colorFn: (it, c) => { c.setScalar(rand(0.85, 1.12)); if (snowy) c.lerp(new THREE.Color(1.15, 1.1, 1.0), 0.3); },
      });
      this.reedList = list;
    }
    // ---- Herbes
    if (m.veg.grass) {
      const tex = DH.util.canvasTexture(64, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          const x = 4 + Math.random() * 56;
          g.strokeStyle = `rgb(${200 + Math.random() * 55},${200 + Math.random() * 55},${180 + Math.random() * 60})`;
          g.lineWidth = 2 + Math.random() * 2;
          g.beginPath();
          g.moveTo(x, h);
          g.quadraticCurveTo(x + rand(-6, 6), h * 0.5, x + rand(-12, 12), rand(4, 30));
          g.stroke();
        }
      });
      this.disposables.push(tex);
      const quad = (ry) => xf(new THREE.PlaneGeometry(1, 0.6), { y: 0.3, ry });
      const g = mergeGeometries([quad(0), quad(Math.PI / 2)]);
      const list = place(m.veg.grass, (x, z, h) => h > 0.15 && slope(x, z) < 0.8, { clear: 2, smin: 0.7, smax: 1.5 });
      const gc = new THREE.Color(m.grass);
      const mat = lambert({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      addInst(g, mat, list, {
        shadow: false, sway: true,
        colorFn: (it, c) => { c.copy(gc).multiplyScalar(rand(0.75, 1.2)); if (snowy) c.lerp(new THREE.Color('#d8d4c4'), 0.4); },
      });
    }
  }

  // Balancement au vent (injection dans le shader Lambert)
  addSway(mat) {
    const sway = this.swayUniform, wind = this.windUniform;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSway = sway;
      shader.uniforms.uWindV = wind;
      shader.vertexShader = 'uniform float uSway;\nuniform vec2 uWindV;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hh = max(position.y, 0.0);
        float g = sin(uSway*1.6 + ip.x*0.21 + ip.y*0.17)*0.5 + 0.5;
        transformed.xz += (uWindV * 0.025 * (0.4 + g) + vec2(sin(uSway*2.3 + ip.y), cos(uSway*1.9 + ip.x)) * 0.04) * hh * hh * 0.5;`
      );
    };
  }

  // ======================================================== COLLISIONS
  addCollider(x, z, r) {
    const c = { x, z, r };
    const k = Math.floor(x / 10) + ',' + Math.floor(z / 10);
    if (!this.colGrid.has(k)) this.colGrid.set(k, []);
    this.colGrid.get(k).push(c);
  }

  addBox(minX, maxX, minZ, maxZ, maxY = 3) {
    this.boxes.push({ minX, maxX, minZ, maxZ, maxY });
  }

  // Repousse un point (joueur) hors des obstacles
  collide(pos, radius) {
    const cx = Math.floor(pos.x / 10), cz = Math.floor(pos.z / 10);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.colGrid.get(cx + i + ',' + (cz + j));
        if (!list) continue;
        for (const c of list) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz), min = c.r + radius;
          if (d < min && d > 0.0001) {
            pos.x = c.x + (dx / d) * min;
            pos.z = c.z + (dz / d) * min;
          }
        }
      }
    }
    for (const b of this.boxes) {
      const nx = DH.util.clamp(pos.x, b.minX, b.maxX);
      const nz = DH.util.clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx, dz = pos.z - nz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 0.0001) {
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          pos.z = b.maxZ + radius;
        }
      }
    }
    const B = this.bounds;
    pos.x = DH.util.clamp(pos.x, -B, B);
    pos.z = DH.util.clamp(pos.z, -B, B);
  }

  // ======================================================== AFFÛT
  buildBlind() {
    const sp = this.map.spawn;
    const g = new THREE.Group();
    const reedTex = DH.util.canvasTexture(128, 128, (c, w, h) => {
      c.fillStyle = '#8a7a4a';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * w;
        c.strokeStyle = `hsl(${40 + Math.random() * 15},${30 + Math.random() * 20}%,${25 + Math.random() * 30}%)`;
        c.lineWidth = 1 + Math.random() * 2;
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + DH.util.rand(-4, 4), Math.random() * 20);
        c.stroke();
      }
      c.fillStyle = 'rgba(60,40,20,0.8)';
      c.fillRect(0, h * 0.3, w, 4);
      c.fillRect(0, h * 0.75, w, 4);
    });
    reedTex.wrapS = reedTex.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshLambertMaterial({ map: reedTex, color: this.snowTarget > 0.45 ? '#c8c4b8' : '#ffffff' });
    const wood = new THREE.MeshLambertMaterial({ color: '#4a3422' });
    this.disposables.push(reedTex, wallMat, wood);
    const baseY = this.heightAt(sp.x, sp.z);
    const wall = (w, h, d, x, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 1.2, uv.getY(i) * h / 1.2);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, h / 2 - 0.1, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.disposables.push(geo);
    };
    // Mur avant (côté eau) + côtés
    wall(3.6, 1.25, 0.2, 0, -1.6);
    wall(0.2, 1.25, 3.2, -1.8, -0.1);
    wall(0.2, 1.25, 3.2, 1.8, -0.1);
    for (const [x, z] of [[-1.8, -1.7], [1.8, -1.7], [-1.8, 1.5], [1.8, 1.5]]) {
      const geo = new THREE.CylinderGeometry(0.06, 0.07, 2.1, 6);
      const p = new THREE.Mesh(geo, wood);
      p.position.set(x, 0.95, z);
      p.castShadow = true;
      g.add(p);
      this.disposables.push(geo);
    }
    // Banc
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.4), wood);
    bench.position.set(0, 0.45, 1.1);
    g.add(bench);
    // Toit partiel en roseaux
    const roofGeo = new THREE.BoxGeometry(3.8, 0.12, 1.1);
    const roof = new THREE.Mesh(roofGeo, wallMat);
    roof.position.set(0, 2.05, 1.05);
    roof.rotation.x = -0.12;
    roof.castShadow = true;
    g.add(roof);
    this.disposables.push(roofGeo);
    g.position.set(sp.x, baseY, sp.z);
    this.group.add(g);
    this.blind = g;
    this.blindCenter = new THREE.Vector3(sp.x, baseY, sp.z - 0.3);
    // collisions (murs)
    this.addBox(sp.x - 1.9, sp.x + 1.9, sp.z - 1.72, sp.z - 1.48);
    this.addBox(sp.x - 1.92, sp.x - 1.68, sp.z - 1.7, sp.z + 1.5);
    this.addBox(sp.x + 1.68, sp.x + 1.92, sp.z - 1.7, sp.z + 1.5);
  }

  inBlind(pos) {
    const sp = this.map.spawn;
    return Math.abs(pos.x - sp.x) < 1.8 && pos.z > sp.z - 1.6 && pos.z < sp.z + 1.5;
  }

  // Stand de ball-trap : plateforme + fosses de lancement
  buildTrapRange(standPos, traps) {
    const concrete = new THREE.MeshLambertMaterial({ color: '#9a978f' });
    const green = new THREE.MeshLambertMaterial({ color: '#3e5a32' });
    this.disposables.push(concrete, green);
    const padGeo = new THREE.BoxGeometry(3, 0.2, 3);
    const pad = new THREE.Mesh(padGeo, concrete);
    pad.position.set(standPos.x, this.heightAt(standPos.x, standPos.z) + 0.05, standPos.z);
    pad.receiveShadow = true;
    this.group.add(pad);
    this.disposables.push(padGeo);
    const houseGeo = new THREE.BoxGeometry(2.2, 1.0, 1.6);
    for (const t of traps) {
      const hm = new THREE.Mesh(houseGeo, green);
      hm.position.set(t.x, this.heightAt(t.x, t.z) + 0.4, t.z);
      hm.lookAt(standPos.x, hm.position.y, standPos.z);
      hm.castShadow = true;
      this.group.add(hm);
      t.y = hm.position.y + 0.6;
    }
    this.disposables.push(houseGeo);
    // Panneau
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), concrete);
    post.position.set(standPos.x + 2, pad.position.y + 0.7, standPos.z);
    this.group.add(post);
  }

  // ======================================================== PRÉCIPITATIONS
  buildPrecipitation() {
    const w = this.weather;
    this.precip = [];
    const box = new THREE.Vector3(56, 34, 56);
    const q = this.q;
    const light = this.light;
    if (w.snow) {
      const s = w.snow;
      const count = Math.floor(s.count * q);
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = Math.random() * box.x;
        pos[i * 3 + 1] = Math.random() * box.y;
        pos[i * 3 + 2] = Math.random() * box.z;
        seed[i] = Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      const flakeType = { big: 1, sparkle: 2, pellet: 3, wet: 4 }[s.flake] || 0;
      const uniforms = {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: box },
        uWind: { value: this.wind.clone().multiplyScalar(s.wind) }, uFall: { value: s.fall }, uSway: { value: s.sway },
        uSwayF: { value: s.swayFreq }, uSize: { value: s.size }, uScale: { value: 800 }, uOpacity: { value: s.opacity },
        uColor: { value: new THREE.Color(1, 1, 1).multiplyScalar(0.45 + light * 0.6) }, uType: { value: flakeType },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false,
        vertexShader: `
          uniform float uTime, uFall, uSway, uSwayF, uSize, uScale, uOpacity;
          uniform vec3 uCenter, uBox, uWind;
          attribute float seed;
          varying float vAlpha, vRot, vSeed;
          void main(){
            vec3 p = position;
            float t = uTime;
            float fv = uFall * (0.7 + 0.6 * fract(seed * 7.13));
            p.y -= fv * t;
            p.xz += uWind.xz * t * (0.8 + 0.4 * fract(seed*3.7));
            p.x += sin(t * uSwayF + seed * 6.283) * uSway;
            p.z += cos(t * uSwayF * 0.8 + seed * 3.1) * uSway;
            vec3 rel = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
            vec3 wp = uCenter + rel;
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            gl_Position = projectionMatrix * mv;
            float s = uSize * (0.6 + 0.8 * fract(seed * 13.7));
            gl_PointSize = max(s * uScale / -mv.z, 1.2);
            vAlpha = uOpacity * smoothstep(uBox.x * 0.5, uBox.x * 0.3, length(rel.xz)) * smoothstep(0.3, 1.5, -mv.z);
            vRot = seed * 6.283 + t * (fract(seed * 3.3) - 0.5) * 3.0;
            vSeed = seed;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform int uType; uniform float uTime;
          varying float vAlpha, vRot, vSeed;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float cs = cos(vRot), sn = sin(vRot);
            c = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs);
            float r = length(c);
            float a = smoothstep(0.5, 0.12, r);
            vec3 col = uColor;
            if (uType == 1) {
              float ang = atan(c.y, c.x);
              float arms = pow(abs(cos(ang * 3.0)), 6.0);
              a = smoothstep(0.5, 0.0, r) * clamp(arms * 1.2 + smoothstep(0.22, 0.05, r), 0.0, 1.0);
            } else if (uType == 2) {
              a *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 9.0 + vSeed * 80.0), 3.0);
              col *= 1.3;
            } else if (uType == 3) {
              a = smoothstep(0.5, 0.35, r);
              col *= vec3(0.9, 0.95, 1.05);
            } else if (uType == 4) {
              a = smoothstep(0.5, 0.2, r) * 0.7;
            }
            a *= vAlpha;
            if (a < 0.02) discard;
            gl_FragColor = vec4(col, a);
            #include <encodings_fragment>
          }`,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 5;
      this.group.add(pts);
      this.precip.push({ mesh: pts, uniforms });
      this.disposables.push(geo, mat);
    }
    if (w.rain) {
      const r = w.rain;
      const count = Math.floor(r.count * q);
      const pos = new Float32Array(count * 6);
      const seed = new Float32Array(count * 2);
      const tip = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * box.x, y = Math.random() * box.y, z = Math.random() * box.z, s = Math.random();
        pos.set([x, y, z, x, y, z], i * 6);
        seed[i * 2] = seed[i * 2 + 1] = s;
        tip[i * 2] = 0;
        tip[i * 2 + 1] = 1;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      geo.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
      const uniforms = {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: box },
        uWind: { value: this.wind.clone() }, uFall: { value: r.speed }, uLen: { value: r.len },
        uColor: { value: new THREE.Color('#b8c4d0').multiplyScalar(0.5 + light * 0.5) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false,
        vertexShader: `
          uniform float uTime, uFall, uLen; uniform vec3 uCenter, uBox, uWind;
          attribute float seed; attribute float tip;
          varying float vAlpha;
          void main(){
            vec3 vel = vec3(uWind.x, -uFall * (0.85 + 0.3 * seed), uWind.z);
            vec3 p = position + vel * uTime;
            vec3 rel = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
            vec3 wp = uCenter + rel - normalize(vel) * uLen * tip;
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            gl_Position = projectionMatrix * mv;
            vAlpha = 0.45 * smoothstep(uBox.x * 0.5, uBox.x * 0.2, length(rel.xz));
          }`,
        fragmentShader: `
          uniform vec3 uColor; varying float vAlpha;
          void main(){ gl_FragColor = vec4(uColor, vAlpha);
            #include <encodings_fragment>
          }`,
      });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 5;
      this.group.add(lines);
      this.precip.push({ mesh: lines, uniforms });
      this.disposables.push(geo, mat);
    }
  }

  // ======================================================== MISE À JOUR
  update(dt, camera, renderer) {
    this.clock += dt;
    const cp = camera.position;
    this.sky.position.copy(cp);
    this.skyUniforms.uTime.value = this.clock;
    this.waterUniforms.uTime.value = this.clock;
    this.swayUniform.value = this.clock;
    // Ombres centrées sur le joueur (alignées sur les texels pour éviter le scintillement)
    const snap = 1;
    const tx = Math.round(cp.x / snap) * snap, tz = Math.round(cp.z / snap) * snap;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 150, this.sunDir.y * 150, tz + this.sunDir.z * 150);
    const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const p of this.precip) {
      p.uniforms.uTime.value = this.clock;
      p.uniforms.uCenter.value.set(cp.x, cp.y + 6, cp.z);
      if (p.uniforms.uScale) p.uniforms.uScale.value = scale;
    }
    // Accumulation progressive de la neige
    if (this.snowAmount < this.snowTarget) {
      this.snowAmount = Math.min(this.snowTarget, this.snowAmount + dt * 0.0035);
      this.snowTimer += dt;
      if (this.snowTimer > 2 && this.snowAmount - this.appliedSnow > 0.01) {
        this.snowTimer = 0;
        this.applySnow();
      }
    }
    // Éclairs
    if (this.weather.lightning) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = DH.util.rand(7, 18);
        this.flash = 1;
        const dist = DH.util.rand(0.3, 3);
        DH.audio.thunder(dist, 1.3 - dist * 0.25);
      }
      if (this.flash > 0) {
        this.flash = Math.max(0, this.flash - dt * 3.5);
        const f = this.flash * (0.6 + 0.4 * Math.sin(this.clock * 60));
        this.skyUniforms.flash.value = f * 0.8;
        this.hemi.intensity = this.baseHemi + f * 2.5;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose && d.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    if (this.sun.shadow && this.sun.shadow.map) this.sun.shadow.map.dispose();
    this.scene.fog = null;
  }
};
