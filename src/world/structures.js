// Constructions du domaine : miradors, hutte de chasse sur l'étang, pavillon (extérieur),
// panneaux. Collisions, impacts et interactions (monter, s'asseoir, entrer).
import * as THREE from 'three';
import { STANDS, PLACES } from './reserveMap.js';

export const PLANKS = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float board = floor( uv.x * 6.0 );
  float fx = fract( uv.x * 6.0 );
  float tone = h12( vec2( board, 3.0 ) );
  float grain = fbm( vec2( uv.x * 6.0, uv.y * 0.6 ) + board, 8.0, 4 );
  alb = mix( vec3( 0.36, 0.3, 0.24 ), vec3( 0.5, 0.43, 0.34 ), tone ) * ( 0.85 + 0.25 * grain );
  alb = mix( alb, vec3( 0.42, 0.42, 0.4 ), 0.35 * smoothstep( 0.2, 0.8, fbm( uv, 3.0, 3 ) * 0.5 + 0.5 ) );
  float gap = smoothstep( 0.0, 0.03, fx ) * smoothstep( 1.0, 0.97, fx );
  alb *= 0.45 + 0.55 * gap;
  float knot = smoothstep( 0.05, 0.0, length( fract( uv * vec2( 6.0, 1.5 ) + h22( vec2( board ) ) ) - 0.5 ) - 0.02 );
  alb = mix( alb, vec3( 0.18, 0.13, 0.09 ), knot * 0.7 );
  h = 0.4 + 0.3 * gap + 0.1 * grain;
  rough = 0.88;
}`;

export const REEDTHATCH = /* glsl */ `
void layer( vec2 uv, out vec3 alb, out float rough, out float h ) {
  float s = 0.0;
  for ( int i = 0; i < 3; i++ ) {
    float fi = float( i );
    float x = uv.x * ( 70.0 + fi * 30.0 ) + fbm( vec2( uv.y * 3.0, fi ), 3.0, 2 ) * 2.0;
    s += smoothstep( 0.3, 0.0, abs( fract( x ) - 0.5 ) - 0.2 ) * 0.33;
  }
  float rows = smoothstep( 0.0, 0.15, fract( uv.y * 5.0 ) );
  alb = mix( vec3( 0.3, 0.25, 0.15 ), vec3( 0.62, 0.53, 0.33 ), s ) * ( 0.6 + 0.4 * rows );
  h = s * 0.6 + rows * 0.3;
  rough = 0.95;
}`;

export class Structures {
  constructor(map, texgen) {
    this.map = map;
    this.group = new THREE.Group();
    const pl = texgen.pair('planks', PLANKS, 512, { normalStrength: 4 });
    const th = texgen.pair('thatch', REEDTHATCH, 512, { normalStrength: 4 });
    this.wood = new THREE.MeshStandardMaterial({ map: pl.map, normalMap: pl.normal, roughness: 0.9 });
    this.thatch = new THREE.MeshStandardMaterial({ map: th.map, normalMap: th.normal, roughness: 0.95 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 0.95 });
    this.boxes = []; // collisions AABB (monde)
    this.floors = []; // planchers {x0,x1,z0,z1,y}
    this.items = []; // interactions
    this.stands = STANDS.map((s) => this.buildStand(s));
    this.hut = this.buildHut();
    this.lodge = this.buildLodge();
  }

  addBox(parent, w, h, d, mat, x, y, z, ry = 0, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    // Échelle des UV sur la taille réelle
    const uv = m.geometry.attributes.uv;
    const s = Math.max(w, h, d);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s * 0.5, uv.getY(i) * s * 0.5);
    parent.add(m);
    if (collide) {
      parent.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m);
      this.boxes.push(b);
    }
    return m;
  }

  buildStand(s) {
    const g = new THREE.Group();
    const y0 = this.map.heightAt(s.x, s.z);
    g.position.set(s.x, y0, s.z);
    g.rotation.y = s.yaw;
    this.group.add(g);
    const H = 3.6;
    // Pieds (légèrement écartés) et contreventement
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, H + 0.4, 8), this.wood);
      leg.position.set(x * 1.08, (H + 0.4) / 2 - 0.2, z * 1.08);
      leg.castShadow = true;
      g.add(leg);
    }
    this.addBox(g, 2.2, 0.08, 2.2, this.wood, 0, H, 0, 0, false);
    // Garde-corps et cabine ouverte vers l'avant (-z local)
    this.addBox(g, 2.2, 0.9, 0.06, this.wood, 0, H + 0.5, 1.07, 0, false);
    this.addBox(g, 0.06, 0.9, 2.2, this.wood, -1.07, H + 0.5, 0, 0, false);
    this.addBox(g, 0.06, 0.9, 2.2, this.wood, 1.07, H + 0.5, 0, 0, false);
    this.addBox(g, 2.2, 0.45, 0.06, this.wood, 0, H + 0.28, -1.07, 0, false);
    // Appui de tir
    this.addBox(g, 2.0, 0.06, 0.18, this.wood, 0, H + 0.98, -1.02, 0, false);
    // Toit
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.6), this.wood);
    roof.position.set(0, H + 2.05, 0.05);
    roof.rotation.x = -0.12;
    roof.castShadow = true;
    g.add(roof);
    for (const [x, z] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.08), this.wood);
      p.position.set(x, H + 1.0, z);
      g.add(p);
    }
    // Échelle à l'arrière
    for (const x of [-0.25, 0.25]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, H + 0.6, 0.06), this.wood);
      r.position.set(x, (H + 0.6) / 2 - 0.15, 1.55);
      r.rotation.x = -0.18;
      g.add(r);
    }
    for (let k = 0; k < 10; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), this.wood);
      r.position.set(0, 0.3 + k * 0.37, 1.58 - k * 0.067);
      g.add(r);
    }
    g.updateMatrixWorld(true);
    const top = new THREE.Vector3(0, H, 0.15).applyMatrix4(g.matrixWorld);
    const foot = new THREE.Vector3(0, 0, 2.1).applyMatrix4(g.matrixWorld);
    // Collisions des pieds
    for (const [x, z] of [[-0.97, -0.97], [0.97, -0.97], [-0.97, 0.97], [0.97, 0.97]]) {
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
      this.boxes.push(new THREE.Box3(new THREE.Vector3(p.x - 0.12, y0 - 1, p.z - 0.12), new THREE.Vector3(p.x + 0.12, y0 + H, p.z + 0.12)));
    }
    const stand = { def: s, g, top, foot, id: s.id };
    this.items.push({
      pos: foot, r: 1.8, stand,
      label: () => 'Monter au mirador',
      run: (hunt) => {
        const p = hunt.player;
        p.seat = { y: top.y, eye: 1.15, rest: 0.4, stand };
        p.pos.set(top.x, top.y, top.z);
        p.yaw = s.yaw;
        p.stance = 'stand';
        hunt.hud.message(s.name + ' : appui de tir stable', '');
      },
    });
    this.items.push({
      pos: top, r: 1.6, seat: stand,
      label: () => 'Descendre du mirador',
      run: (hunt) => {
        const p = hunt.player;
        p.seat = null;
        p.pos.set(foot.x, this.map.heightAt(foot.x, foot.z), foot.z);
      },
    });
    return stand;
  }

  buildHut() {
    const P = PLACES.hut;
    const g = new THREE.Group();
    const y0 = Math.max(this.map.heightAt(P.x, P.z), this.map.water + 0.05);
    g.position.set(P.x, y0, P.z);
    g.rotation.y = P.yaw;
    this.group.add(g);
    // Hutte basse en planches, toit de roseaux, meurtrière vers l'eau (-z local)
    this.addBox(g, 3.2, 0.1, 2.4, this.wood, 0, 0.05, 0, 0, false);
    this.addBox(g, 3.2, 1.0, 0.08, this.wood, 0, 0.55, -1.2, 0, false);
    this.addBox(g, 3.2, 0.32, 0.08, this.wood, 0, 1.62, -1.2, 0, false);
    this.addBox(g, 3.2, 1.8, 0.08, this.wood, 0, 0.9, 1.2, 0, false);
    this.addBox(g, 0.08, 1.8, 2.4, this.wood, -1.6, 0.9, 0, 0, false);
    this.addBox(g, 0.08, 1.8, 2.4, this.wood, 1.6, 0.9, 0, 0, false);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.25, 3.0), this.thatch);
    roof.position.set(0, 1.9, 0.05);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    g.add(roof);
    // Banc
    this.addBox(g, 2.6, 0.08, 0.45, this.wood, 0, 0.45, 0.7, 0, false);
    g.updateMatrixWorld(true);
    const seatPos = new THREE.Vector3(0, 0.1, 0.25).applyMatrix4(g.matrixWorld);
    const door = new THREE.Vector3(1.9, 0, 0.3).applyMatrix4(g.matrixWorld);
    this.floors.push({ g, w: 3.1, d: 2.3, y: y0 + 0.1 });
    const bb = new THREE.Box3().setFromObject(g);
    void bb;
    const hut = { g, seatPos, door, yaw: P.yaw };
    this.items.push({
      pos: door, r: 2.2,
      label: () => 'Entrer dans la hutte',
      run: (hunt) => {
        const p = hunt.player;
        p.seat = { y: seatPos.y, eye: 1.05, rest: 0.55, hut: true };
        p.pos.copy(seatPos);
        p.yaw = P.yaw;
      },
    });
    this.items.push({
      pos: seatPos, r: 1.4, seat: 'hut',
      label: () => 'Sortir de la hutte',
      run: (hunt) => {
        const p = hunt.player;
        p.seat = null;
        p.pos.set(door.x, this.map.heightAt(door.x, door.z), door.z);
      },
    });
    return hut;
  }

  buildLodge() {
    const L = PLACES.lodge;
    const g = new THREE.Group();
    g.position.set(L.x, L.h, L.z);
    this.group.add(g);
    const stone = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.9 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.8 });
    // Soubassement de pierre, étage en bois, grand toit à deux pans
    this.addBox(g, 30, 1.2, 14, stone, 0, 0.6, 0);
    this.addBox(g, 30, 4.4, 14, this.wood, 0, 3.4, 0);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 10.8, 32, 4, 1, false, Math.PI / 4).rotateZ(Math.PI / 2).scale(1, 0.55, 1), roofM);
    roof.position.set(0, 7.3, 0);
    roof.castShadow = true;
    g.add(roof);
    // Porte (côté nord, vers le domaine) et fenêtres
    const doorM = new THREE.MeshStandardMaterial({ color: 0x3b2716, roughness: 0.7 });
    this.addBox(g, 1.6, 2.6, 0.12, doorM, 0, 2.5, -7.05, 0, false);
    const win = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 0.6, roughness: 0.2 });
    for (const x of [-11, -7, -3, 3, 7, 11]) this.addBox(g, 1.4, 1.5, 0.1, win, x, 3.6, -7.04, 0, false);
    // Cheminée
    this.addBox(g, 1.4, 4, 1.4, stone, 9, 9, 2, 0, false);
    g.updateMatrixWorld(true);
    const door = new THREE.Vector3(0, 0, -8.2).applyMatrix4(g.matrixWorld);
    this.items.push({
      pos: door, r: 2.6,
      label: () => 'Rentrer au pavillon',
      run: (hunt) => hunt.app.endHunt(hunt),
    });
    return { g, door };
  }

  standById(id) { return this.stands.find((s) => s.id === id); }

  interactAt(player) {
    for (const it of this.items) {
      const onSeat = player.seat && (it.seat === 'hut' ? player.seat.hut : it.seat && player.seat.stand === it.seat);
      if (it.seat && !onSeat) continue;
      if (!it.seat && player.seat) continue;
      if (it.pos.distanceTo(player.pos) < it.r) return { label: it.label(), run: it.run };
    }
    return null;
  }

  floorAt(x, z) {
    for (const f of this.floors) {
      const p = new THREE.Vector3(x, 0, z);
      f.g.worldToLocal(p);
      if (Math.abs(p.x) < f.w / 2 && Math.abs(p.z) < f.d / 2) return f.y;
    }
    return null;
  }

  collide(pos, r) {
    for (const b of this.boxes) {
      if (pos.y > b.max.y || pos.y + 1.6 < b.min.y) continue;
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) {
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // À l'intérieur : sortie par le côté le plus proche
          const ex = [b.min.x - r - pos.x, b.max.x + r - pos.x], ez = [b.min.z - r - pos.z, b.max.z + r - pos.z];
          const mx = Math.abs(ex[0]) < Math.abs(ex[1]) ? ex[0] : ex[1];
          const mz = Math.abs(ez[0]) < Math.abs(ez[1]) ? ez[0] : ez[1];
          if (Math.abs(mx) < Math.abs(mz)) pos.x += mx;
          else pos.z += mz;
        }
      }
    }
  }

  segmentHit(a, b) {
    const ray = new THREE.Ray(a, b.clone().sub(a).normalize());
    const len = a.distanceTo(b);
    const p = new THREE.Vector3();
    for (const box of this.boxes) {
      if (ray.intersectBox(box, p) && p.distanceTo(a) <= len) return p.clone();
    }
    return null;
  }

  update() {}
}
