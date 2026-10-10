// Scène de contrôle visuel des animaux (développement) : ?test=animals
import * as THREE from 'three';
import { SkySystem } from '../gfx/sky.js';
import { GU } from '../gfx/globals.js';
import { AnimalFactory } from '../animals/factory.js';
import { makeTrophy } from '../animals/trophies.js';
import { SPECIES } from '../animals/species.js';
import { GRASS } from '../gfx/terrainLayers.js';

export class TestAnimalsScene {
  constructor(engine, texgen, params) {
    this.engine = engine;
    this.texgen = texgen;
    this.params = params;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.001);
    this.camera = new THREE.PerspectiveCamera(40, engine.width / engine.height, 0.05, 3000);
    this.paused = false;
  }

  async load() {
    const T0 = performance.now();
    const log = (m) => console.log('[test] ' + m + ' ' + Math.round(performance.now() - T0) + ' ms');
    this.sky = new SkySystem(this.engine, this.scene);
    log('sky');
    this.sky.hour = Number(this.params.get('h') || 10);
    const g = this.texgen.pair('testground', GRASS, 512);
    g.map.repeat.set(60, 60);
    g.normal.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.normal, roughness: 0.95 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    log('ground');
    this.factory = new AnimalFactory(this.engine, this.texgen);
    log('factory');
    const only = this.params.get('sp');
    const list = only ? [only] : Object.keys(SPECIES);
    const anim = this.params.get('anim') || 'stand';
    const furs = (this.params.get('fur') || '').split(',');
    this.animals = [];
    let x = -((list.length - 1) * 2.6) / 2;
    list.forEach((sp, i) => {
      for (const sex of only ? ['m'] : ['m', 'f']) {
        const ind = {
          species: sp, sex, fur: furs[i] || Object.keys({ ...SPECIES[sp].furs.reduce((a, f) => ((a[f.id] = 1), a), {}) })[0],
          scale: sex === 'm' ? (sp === 'chamois' ? 0.9 : 1) : SPECIES[sp].scaleF, trophy: null,
        };
        ind.trophy = makeTrophy(sp, 12345 + i * 7, Number(this.params.get('tq') || 0.8), 0.8, this.params.get('leg') === '1');
        let v;
        try { v = this.factory.create(ind, { detail: true, fur: this.params.get('fur') !== '0' }); } catch (e) { console.error('create ' + sp + ' ' + sex + ': ' + e.stack); throw e; }
        log('create ' + sp + ' ' + sex);
        v.holder.position.set(x, 0, sex === 'm' ? 0 : -2.6);
        v.holder.rotation.y = Number(this.params.get('ry') || -Math.PI / 2);
        this.scene.add(v.holder);
        this.animals.push({ v, ind, anim });
      }
      x += 2.6;
    });
    if (this.params.get('dump')) {
      // Affiche la texture de pelage peinte (contrôle)
      const tex = this.animals[0].v.lods[0].material.map;
      const { width, height, data } = tex.image;
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const si = ((height - 1 - y) * width + x) * 4, di = (y * width + x) * 4;
        img.data[di] = data[si]; img.data[di + 1] = data[si + 1]; img.data[di + 2] = data[si + 2]; img.data[di + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:999;image-rendering:pixelated';
      document.body.appendChild(c);
    }
    // Pré-animation pour une pose stable (mode image fixe)
    const T = Number(this.params.get('t') || 0.4);
    for (let k = 0; k < 120; k++) this.animate(T / 120);
    const cam = this.camera;
    const d = Number(this.params.get('d') || (only ? 4 : 14));
    cam.position.set(Number(this.params.get('cx') || 0), Number(this.params.get('cy') || 1.3), d);
    cam.lookAt(Number(this.params.get('lx') || 0), Number(this.params.get('ly') || 0.8), 0);
  }

  animate(dt) {
    for (const a of this.animals) {
      const sp = a.v.spec;
      const st = { speed: 0, graze: false, alert: false, bed: false, dead: false };
      if (a.anim === 'walk') st.speed = sp.speeds.walk;
      if (a.anim === 'trot') st.speed = sp.speeds.trot;
      if (a.anim === 'run') st.speed = sp.speeds.run;
      if (a.anim === 'graze') st.graze = true;
      if (a.anim === 'alert') st.alert = true;
      if (a.anim === 'bed') st.bed = true;
      if (a.anim === 'dead') st.dead = true;
      a.v.animator.update(dt, st);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.engine.cameraPos = this.camera.position;
    GU.uPlayerPos.value.copy(this.camera.position);
    this.sky.update(dt, new THREE.Vector3(0, 0, 0));
    if (!this.params.get('still')) this.animate(dt);
  }

  render(r) {
    r.render(this.scene, this.camera);
  }
}
