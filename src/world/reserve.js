// Scène du domaine de chasse (extérieur).
import * as THREE from 'three';
import { ReserveMap, WORLD } from './reserveMap.js';
import { Terrain } from './terrain.js';
import { SkySystem } from '../gfx/sky.js';
import { GU } from '../gfx/globals.js';
import { Vegetation } from './vegetation.js';
import { GroundCover } from './grass.js';
import { Water } from './water.js';

export class ReserveScene {
  constructor(engine, texgen, opts = {}) {
    this.engine = engine;
    this.texgen = texgen;
    this.opts = opts;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.001); // active USE_FOG (brume personnalisée)
    this.camera = new THREE.PerspectiveCamera(70, engine.width / engine.height, 0.1, 5000);
    this.camera.rotation.order = 'YXZ';
    this.paused = false;
  }

  async load(progress = () => {}) {
    this.map = new ReserveMap();
    await this.map.generate((p) => progress(0.05 + p * 0.45, 'Relief du domaine'));
    progress(0.55, 'Textures du sol');
    await new Promise((r) => setTimeout(r, 0));
    this.terrain = new Terrain(this.map, this.texgen, this.engine.q);
    this.scene.add(this.terrain.group);
    progress(0.62, 'Ciel et lumière');
    this.sky = new SkySystem(this.engine, this.scene);
    this.sky.hour = this.opts.hour ?? 9;
    this.veg = new Vegetation(this.map, this.texgen, this.engine);
    await this.veg.build((p) => progress(0.66 + p * 0.3, 'Forêts et rochers'));
    this.scene.add(this.veg.group);
    this.cover = new GroundCover(this.map, this.engine.q, this.texgen);
    this.scene.add(this.cover.group);
    this.water = new Water(this.map, this.texgen, this.terrain, this.engine);
    this.scene.add(this.water.mesh);
    // La sonde de reflet voit tout le paysage autour de l'étang
    const probeCam = new THREE.PerspectiveCamera(90, 1, 1, 4000);
    this.water.beforeProbe = (p) => {
      probeCam.position.copy(p);
      probeCam.updateMatrixWorld();
      this.terrain.update(probeCam, true);
      this.veg.update(0, probeCam, true, true);
    };
    this.water.afterProbe = () => {
      this.terrain.update(this.camera);
      this.veg.update(0, this.camera, true);
    };
    progress(1, 'Prêt');
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    const cam = this.camera;
    this.engine.cameraPos = cam.position;
    GU.uPlayerPos.value.copy(cam.position);
    this.sky.update(dt, cam.position.clone().setY(this.map.heightAt(cam.position.x, cam.position.z)));
    cam.updateMatrixWorld();
    this.terrain.update(cam);
    this.veg.update(dt, cam);
    this.cover.update(cam.position);
    this.water.update(dt, this.scene, this.sky.hour + (this.sky.envVersion || 0), [this.cover.group]);
    const fc = GU.uFogColor.value;
    this.veg.setAmbient(new THREE.Color(fc.r * 0.55, fc.g * 0.6, fc.b * 0.7), new THREE.Color(0.06, 0.055, 0.04).multiplyScalar(1 + this.sky.sun.intensity * 0.3));
  }

  render(r) {
    r.render(this.scene, this.camera);
  }
}

export { WORLD };
