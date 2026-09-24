// Effets : plumes, éclaboussures, éclats de plateaux, douilles, fumée, ondes sur l'eau.
'use strict';

DH.FX = class FX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    const { mergeGeometries, xf } = DH.util;

    const featherGeo = new THREE.PlaneGeometry(0.05, 0.13);
    this.feathers = this.makeSystem(featherGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 400);
    this.drops = this.makeSystem(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 600);
    this.frags = this.makeSystem(new THREE.BoxGeometry(0.05, 0.012, 0.035), new THREE.MeshLambertMaterial(), 400);
    const shellGeo = mergeGeometries([
      { geo: xf(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 8), { y: 0.008 }), color: '#b0201a' },
      { geo: xf(new THREE.CylinderGeometry(0.0115, 0.0115, 0.016, 8), { y: -0.025 }), color: '#c8a040' },
    ]);
    this.shells = this.makeSystem(shellGeo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.5 }), 60);

    // Fumée (sprites)
    const smokeTex = DH.util.canvasTexture(64, 64, (g, w, h) => {
      const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,0.8)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.3)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    this.smokeTex = smokeTex;
    this.smoke = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xcccccc, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      s.userData = { life: 0 };
      this.group.add(s);
      this.smoke.push(s);
    }
    // Ondes
    this.ripples = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringGeo = ringGeo;
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xdde6ee, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.userData = { life: 0 };
      this.group.add(m);
      this.ripples.push(m);
    }
  }

  makeSystem(geo, mat, max) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false;
    mesh.count = 0;
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) mesh.setColorAt(i, c);
    this.group.add(mesh);
    return { mesh, list: [], max };
  }

  spawn(sys, p) {
    if (sys.list.length >= sys.max) sys.list.shift();
    sys.list.push(Object.assign({
      vel: new THREE.Vector3(), rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
      life: 2, age: 0, scale: 1, gravity: 9.8, drag: 0.5, color: new THREE.Color(1, 1, 1), landed: false, bounce: 0,
    }, p));
  }

  feathersBurst(pos, colors, n = 12, vel = null) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(DH.util.rand(-2, 2), DH.util.rand(-0.5, 2.5), DH.util.rand(-2, 2));
      if (vel) v.addScaledVector(vel, 0.3);
      this.spawn(this.feathers, {
        pos: pos.clone().add(new THREE.Vector3(DH.util.rand(-0.2, 0.2), DH.util.rand(-0.1, 0.2), DH.util.rand(-0.2, 0.2))),
        vel: v, life: DH.util.rand(3, 6), gravity: 0.9, drag: 2.5, flutter: true, float: true,
        color: new THREE.Color(DH.util.pick(colors)), scale: DH.util.rand(0.7, 1.3),
      });
    }
  }

  splash(pos, size = 1, color = 0xe8f0f4) {
    const n = Math.floor(14 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = DH.util.rand(0.5, 2.2) * size;
      this.spawn(this.drops, {
        pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * s, DH.util.rand(2, 4.5) * Math.sqrt(size), Math.sin(a) * s),
        life: 1.2, gravity: 9.8, drag: 0.3, color: new THREE.Color(color), scale: DH.util.rand(0.6, 1.4) * Math.sqrt(size),
      });
    }
    this.ripple(pos, size * 2.2);
  }

  puff(pos, color) {
    for (let i = 0; i < 4; i++) {
      this.spawn(this.drops, {
        pos: pos.clone(), vel: new THREE.Vector3(DH.util.rand(-0.6, 0.6), DH.util.rand(0.8, 2), DH.util.rand(-0.6, 0.6)),
        life: 0.5, gravity: 6, drag: 1, color: new THREE.Color(color), scale: 0.7,
      });
    }
  }

  ripple(pos, size = 2) {
    const r = this.ripples.find((m) => !m.visible);
    if (!r) return;
    r.visible = true;
    r.position.set(pos.x, 0.03, pos.z);
    r.userData = { life: 1.6, age: 0, size };
  }

  clayBurst(pos, vel) {
    for (let i = 0; i < 18; i++) {
      this.spawn(this.frags, {
        pos: pos.clone(), vel: vel.clone().multiplyScalar(0.4).add(new THREE.Vector3(DH.util.rand(-4, 4), DH.util.rand(-2, 4), DH.util.rand(-4, 4))),
        life: 2.5, gravity: 9.8, drag: 0.4, color: new THREE.Color(Math.random() < 0.7 ? '#ff6a1a' : '#222'), scale: DH.util.rand(0.5, 1.3),
      });
    }
    this.smokePuff(pos, 0.9, 0xff8a40, 0.5);
  }

  ejectShell(pos, dir) {
    this.spawn(this.shells, { pos: pos.clone(), vel: dir, life: 6, gravity: 9.8, drag: 0.2, bounce: 0.3, spin: new THREE.Vector3(12, 3, 8) });
  }

  smokePuff(pos, size = 0.6, color = 0xd0d0d0, opacity = 0.35, vel = null) {
    const s = this.smoke.find((m) => !m.visible);
    if (!s) return;
    s.visible = true;
    s.position.copy(pos);
    s.material.color.set(color);
    s.userData = { life: 1.8, age: 0, size, opacity, vel: vel ? vel.clone() : new THREE.Vector3(0, 0.3, 0) };
    s.scale.setScalar(size);
  }

  update(dt, camera) {
    const w = this.world;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const sys of [this.feathers, this.drops, this.frags, this.shells]) {
      for (const p of sys.list) p.age += dt;
      const list = (sys.list = sys.list.filter((p) => p.age <= p.life));
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.landed) {
          p.vel.y -= p.gravity * dt;
          p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
          if (p.flutter) {
            p.vel.x += Math.sin(p.age * 5 + i) * dt * 1.5;
            p.vel.z += Math.cos(p.age * 4 + i) * dt * 1.5;
          }
          if (p.wind !== false && w) p.pos.addScaledVector(w.wind, dt * (p.flutter ? 0.25 : 0.02));
          p.pos.addScaledVector(p.vel, dt);
          p.rot.x += p.spin.x * dt;
          p.rot.y += p.spin.y * dt;
          p.rot.z += p.spin.z * dt;
          if (w) {
            const g = Math.max(w.groundAt(p.pos.x, p.pos.z), w.isIce(p.pos.x, p.pos.z) ? 0.02 : 0);
            const floor = w.heightAt(p.pos.x, p.pos.z) < 0 && !w.isIce(p.pos.x, p.pos.z) ? 0.01 : g + 0.01;
            if (p.pos.y < floor) {
              if (p.bounce && p.vel.y < -1) {
                p.pos.y = floor;
                p.vel.y *= -p.bounce;
                p.vel.x *= 0.5;
                p.vel.z *= 0.5;
              } else {
                p.pos.y = floor;
                p.landed = true;
                if (sys === this.drops) p.age = p.life;
                p.rot.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
              }
            }
          }
        }
        const fade = Math.min(1, (p.life - p.age) * 2);
        q.setFromEuler(p.rot);
        sc.setScalar(p.scale * (sys === this.drops ? fade : 1));
        m4.compose(p.pos, q, sc);
        sys.mesh.setMatrixAt(i, m4);
        sys.mesh.setColorAt(i, p.color);
      }
      sys.mesh.count = list.length;
      sys.mesh.instanceMatrix.needsUpdate = true;
      if (sys.mesh.instanceColor) sys.mesh.instanceColor.needsUpdate = true;
    }
    for (const s of this.smoke) {
      if (!s.visible) continue;
      const u = s.userData;
      u.age += dt;
      if (u.age > u.life) {
        s.visible = false;
        continue;
      }
      const t = u.age / u.life;
      s.position.addScaledVector(u.vel, dt);
      if (w) s.position.addScaledVector(w.wind, dt * 0.35);
      u.vel.multiplyScalar(1 - dt * 1.5);
      s.scale.setScalar(u.size * (1 + t * 3));
      s.material.opacity = u.opacity * (1 - t);
    }
    for (const r of this.ripples) {
      if (!r.visible) continue;
      const u = r.userData;
      u.age += dt;
      if (u.age > u.life) {
        r.visible = false;
        continue;
      }
      const t = u.age / u.life;
      r.scale.setScalar(0.2 + t * u.size);
      r.material.opacity = 0.5 * (1 - t);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.smokeTex.dispose();
  }
};
