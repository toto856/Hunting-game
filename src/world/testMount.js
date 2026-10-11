// Scène de contrôle des trophées naturalisés (développement) : ?test=mount&sp=cerf&kind=skull|shoulder|tusks|full
import * as THREE from 'three';
import { GU } from '../gfx/globals.js';
import { AnimalFactory } from '../animals/factory.js';
import { makeTrophy, antlerMaterial } from '../animals/trophies.js';
import { SPECIES } from '../animals/species.js';
import { skullMount, tuskPlaque, shoulderMount, fullMount, shieldGeometry, ovalGeometry } from './mounts.js';

export class TestMountScene {
  constructor(engine, texgen, params) {
    this.engine = engine;
    this.texgen = texgen;
    this.params = params;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b2622);
    this.camera = new THREE.PerspectiveCamera(35, engine.width / engine.height, 0.02, 50);
    this.paused = false;
  }

  async load() {
    const P = this.params;
    const sp = P.get('sp') || 'cerf';
    const kind = P.get('kind') || 'skull';
    const q = Number(P.get('tq') || 0.9);
    const spec = SPECIES[sp];
    const ind = { species: sp, sex: 'm', fur: spec.furs[0].id, scale: 1, trophy: makeTrophy(sp, Number(P.get('seed') || 4242), q, 0.95), legendary: false };
    const factory = new AnimalFactory(this.engine, this.texgen);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.95 }));
    wall.position.set(0, 1.5, 0);
    wall.receiveShadow = true;
    this.scene.add(wall);
    const oak = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.45 });
    const ant = antlerMaterial();
    const root = new THREE.Group();
    root.position.set(0, 1.5, 0);
    this.scene.add(root);
    let size = 1;
    if (kind === 'skull') {
      const m = skullMount(ind);
      const sw = Math.max(0.24, m.skull.w * 2.2), sh = Math.max(0.3, m.skull.h * 1.25);
      const shield = new THREE.Mesh(shieldGeometry(sw, sh, 0.03), oak);
      shield.position.set(0, m.skull.cy + 0.02, 0.03);
      root.add(shield);
      const mesh = new THREE.Mesh(m.geo, ant);
      mesh.position.z = 0.03;
      mesh.castShadow = true;
      root.add(mesh);
      size = Math.max(m.span, m.top - m.skull.cy) * 1.3;
      this.focus = new THREE.Vector3(0, 1.5 + (m.top + m.skull.cy) * 0.35, 0);
    } else if (kind === 'tusks') {
      const m = tuskPlaque(ind);
      const ov = new THREE.Mesh(shieldGeometry(m.w * 1.12, m.h * 1.3, 0.025), oak);
      ov.position.set(0, m.cy + m.h * 0.04, 0.025);
      root.add(ov);
      const mesh = new THREE.Mesh(m.geo, ant);
      mesh.position.z = 0.025;
      root.add(mesh);
      size = m.h * 1.6;
      this.focus = new THREE.Vector3(0, 1.5 + m.cy, 0);
    } else if (kind === 'shoulder') {
      const r = shoulderMount(factory, ind, { lookYaw: 0.15, tilt: 0.15 });
      const shield = new THREE.Mesh(shieldGeometry(r.cut.w * 1.3 + 0.1, r.cut.h * 1.22 + 0.16, 0.05), oak);
      shield.position.z = 0.05;
      root.add(shield);
      const body = new THREE.Mesh(r.body, r.mat);
      body.position.z = 0.038;
      body.castShadow = true;
      root.add(body);
      for (const q2 of r.parts) {
        const pm = new THREE.Mesh(q2.geo, q2.antler ? ant : q2.mat);
        pm.position.z = 0.038;
        pm.castShadow = true;
        root.add(pm);
      }
      const c = r.mat.userData.coat;
      const sh = factory.staticShells(r.body, c.species, c.sex, c.fur, 10);
      if (sh) { sh.position.z = 0.038; root.add(sh); }
      size = Math.max(r.top, 0.8) * 1.4;
      this.focus = new THREE.Vector3(0, 1.5 + r.top * 0.3, r.depth * 0.4);
    } else {
      wall.position.z = -1.5;
      const r = fullMount(factory, ind, { alert: true, lookYaw: 0.3 });
      const g = new THREE.Group();
      g.position.set(0, 0.2, 0);
      g.rotation.y = -0.9;
      g.add(new THREE.Mesh(r.body, r.mat));
      for (const q2 of r.parts) g.add(new THREE.Mesh(q2.geo, q2.antler ? ant : q2.mat));
      const c = r.mat.userData.coat;
      const sh = factory.staticShells(r.body, c.species, c.sex, c.fur, 10);
      if (sh) g.add(sh);
      this.scene.add(g);
      size = 2.6;
      this.focus = new THREE.Vector3(0, 1.0, 0);
    }
    // Éclairage de galerie
    const key = new THREE.SpotLight(0xffe6c8, 30, 0, 0.6, 0.5, 2);
    key.position.set(1.2, 3.4, 2.4);
    key.target.position.copy(this.focus);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    this.scene.add(key, key.target);
    this.scene.add(new THREE.HemisphereLight(0xfff2e0, 0x3a2c22, 0.7));
    const fill = new THREE.DirectionalLight(0xcfdcff, 0.6);
    fill.position.set(-2, 1.5, 3);
    this.scene.add(fill);
    const d = Number(P.get('d') || size * 1.9);
    const yaw = Number(P.get('yaw') || 0.35), pitch = Number(P.get('pitch') || 0.1);
    this.camera.position.set(this.focus.x + Math.sin(yaw) * d, this.focus.y + Math.sin(pitch) * d, this.focus.z + Math.cos(yaw) * d);
    this.camera.lookAt(this.focus);
    this.engine.renderer.toneMappingExposure = 1.1;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update() {
    GU.uPlayerPos.value.copy(this.camera.position);
  }

  render(r) {
    r.render(this.scene, this.camera);
  }
}
