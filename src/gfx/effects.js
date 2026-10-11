// Particules : fumée de bouche, poussière d'impact, éclaboussures, éclats d'écorce, plumes.
import * as THREE from 'three';

const MAX = 600;

export class Effects {
  constructor(scene) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // xyz, taille
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // rgb, alpha
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aP', this.aPos);
    geo.setAttribute('aC', this.aCol);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aC; varying vec4 vC; varying vec2 vUv;
        void main() {
          vC = aC; vUv = uv;
          vec4 mv = viewMatrix * vec4( aP.xyz, 1.0 );
          mv.xy += position.xy * aP.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC; varying vec2 vUv;
        void main() {
          float d = length( vUv - 0.5 ) * 2.0;
          float a = smoothstep( 1.0, 0.2, d ) * vC.a;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( vC.rgb, a );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.parts = [];
  }

  emit(p) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push({
      pos: p.pos.clone(), vel: p.vel ? p.vel.clone() : new THREE.Vector3(), life: p.life || 1, t: 0,
      size: p.size || 0.2, grow: p.grow || 0, color: p.color || new THREE.Color(0.8, 0.8, 0.8), alpha: p.alpha ?? 0.6,
      drag: p.drag ?? 1.5, gravity: p.gravity ?? 0,
    });
  }

  smoke(pos, dir) {
    for (let i = 0; i < 8; i++) {
      this.emit({
        pos: pos.clone().addScaledVector(dir, 0.1 + i * 0.05), vel: dir.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4)),
        life: 1.6 + Math.random(), size: 0.12, grow: 0.5, color: new THREE.Color(0.75, 0.75, 0.74), alpha: 0.22, drag: 1.8,
      });
    }
  }

  dust(pos, color = new THREE.Color(0.45, 0.38, 0.28)) {
    for (let i = 0; i < 10; i++) {
      this.emit({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 2), life: 1.1, size: 0.15, grow: 0.35, color, alpha: 0.5, drag: 2.5, gravity: 1.5 });
    }
  }

  splash(pos) {
    for (let i = 0; i < 14; i++) {
      this.emit({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.6), life: 0.9, size: 0.07, grow: 0.05, color: new THREE.Color(0.85, 0.9, 0.95), alpha: 0.7, drag: 0.6, gravity: 9 });
    }
  }

  chips(pos) {
    for (let i = 0; i < 8; i++) {
      this.emit({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.8, size: 0.04, color: new THREE.Color(0.55, 0.42, 0.28), alpha: 0.9, drag: 0.8, gravity: 9 });
    }
  }

  feathers(pos, color = new THREE.Color(0.55, 0.5, 0.42)) {
    for (let i = 0; i < 12; i++) {
      this.emit({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.2) * 2, (Math.random() - 0.5) * 2.5), life: 2.5, size: 0.05, color, alpha: 0.9, drag: 3, gravity: 0.6 });
    }
  }

  hair(pos, color) {
    for (let i = 0; i < 6; i++) {
      this.emit({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2), life: 1.4, size: 0.03, color, alpha: 0.8, drag: 3, gravity: 0.8 });
    }
  }

  update(dt) {
    const P = this.aPos.array, C = this.aCol.array;
    let n = 0;
    for (const p of this.parts) {
      p.t += dt;
      if (p.t > p.life) continue;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.t / p.life;
      P[n * 4] = p.pos.x; P[n * 4 + 1] = p.pos.y; P[n * 4 + 2] = p.pos.z; P[n * 4 + 3] = p.size + p.grow * p.t;
      C[n * 4] = p.color.r; C[n * 4 + 1] = p.color.g; C[n * 4 + 2] = p.color.b; C[n * 4 + 3] = p.alpha * (1 - k) * Math.min(1, p.t * 12);
      n++;
    }
    this.parts = this.parts.filter((p) => p.t <= p.life);
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }
}
