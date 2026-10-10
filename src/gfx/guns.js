// Modèles 3D procéduraux des armes (vue à la première personne et vitrines de l'armurerie),
// mains gantées et manches de la tenue.
import * as THREE from 'three';
import { WOOD, METAL, FABRIC, LEATHER, PATTERN_INDEX } from './gunTextures.js';
import { OPTICS } from '../data/catalog.js';

const METAL_DEF = {
  bronze: { color: 0x1c2026, rough: 0.32, metal: 1 },
  inox: { color: 0x9aa0a8, rough: 0.28, metal: 1 },
  noir: { color: 0x141516, rough: 0.55, metal: 0.8 },
  olive: { color: 0x3f4430, rough: 0.6, metal: 0.4 },
  or: { color: 0xd9a84a, rough: 0.24, metal: 1 },
  jaspe: { tex: 'jaspe', rough: 0.3, metal: 1 },
  damas: { tex: 'damas', rough: 0.3, metal: 1 },
};

export class GunFactory {
  constructor(texgen) {
    this.tg = texgen;
    this.mats = new Map();
  }

  wood(id) {
    const k = 'wood:' + id;
    if (this.mats.has(k)) return this.mats.get(k);
    const p = this.tg.pair('gunwood-' + id, WOOD[id] || WOOD.noyer, 512, { normalStrength: 2 });
    for (const t of [p.map, p.normal]) t.repeat.set(4, 4);
    const m = new THREE.MeshPhysicalMaterial({
      map: p.map, normalMap: p.normal, normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: id === 'synthetique' || id.startsWith('camo') ? 0.62 : 0.38,
      clearcoat: id === 'synthetique' || id.startsWith('camo') ? 0 : 0.6, clearcoatRoughness: 0.25,
    });
    this.mats.set(k, m);
    return m;
  }

  metal(id, engraved = false) {
    const k = 'metal:' + id + (engraved ? ':g' : '');
    if (this.mats.has(k)) return this.mats.get(k);
    const d = METAL_DEF[id] || METAL_DEF.bronze;
    const opts = { color: d.color ?? 0xffffff, roughness: d.rough, metalness: d.metal };
    if (d.tex) {
      const p = this.tg.pair('gunmetal-' + d.tex, METAL[d.tex], 512);
      p.map.repeat.set(3, 3);
      opts.map = p.map;
    }
    if (engraved) {
      const g = this.tg.pair('engrave', METAL.gravure, 512, { normalStrength: 5 });
      g.normal.repeat.set(2, 2);
      opts.normalMap = g.normal;
      opts.normalScale = new THREE.Vector2(1, 1);
    }
    const m = new THREE.MeshStandardMaterial(opts);
    this.mats.set(k, m);
    return m;
  }

  get rubber() {
    return this.mats.get('rubber') || this.mats.set('rubber', new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 })).get('rubber');
  }

  get glass() {
    return this.mats.get('glass') || this.mats.set('glass', new THREE.MeshPhysicalMaterial({ color: 0x15132a, metalness: 0.4, roughness: 0.04, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 })).get('glass');
  }

  get brass() {
    return this.mats.get('brass') || this.mats.set('brass', new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 })).get('brass');
  }

  fabric(outfit) {
    const k = 'fabric:' + outfit.id;
    if (this.mats.has(k)) return this.mats.get(k);
    const c = outfit.colors.map((h) => new THREE.Color(h));
    while (c.length < 4) c.push(c[c.length - 1]);
    const lin = (x) => new THREE.Vector3(x.r, x.g, x.b);
    const toSRGB = (col) => { const o = col.clone(); o.convertLinearToSRGB(); return lin(o); };
    const tex = this.tg.texture('fabric-' + outfit.id, FABRIC, 512, {
      mode: 0, uniforms: { uC0: { value: toSRGB(c[0]) }, uC1: { value: toSRGB(c[1]) }, uC2: { value: toSRGB(c[2]) }, uC3: { value: toSRGB(c[3]) }, uPattern: { value: PATTERN_INDEX[outfit.pattern] || 0 } },
    });
    tex.repeat.set(2, 2);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    this.mats.set(k, m);
    return m;
  }

  get leather() {
    if (this.mats.has('leather')) return this.mats.get('leather');
    const p = this.tg.pair('glove', LEATHER, 256, { normalStrength: 3 });
    const m = new THREE.MeshStandardMaterial({ map: p.map, normalMap: p.normal, roughness: 0.72 });
    this.mats.set('leather', m);
    return m;
  }

  // ------------------------------------------------------------------ arme complète
  build(def, skin = {}) {
    const L = def.look;
    const g = new THREE.Group();
    const woodId = skin.wood || L.wood;
    const metalId = skin.metal || L.metal;
    const engraved = !!(skin.engraved || L.engraved);
    const W = this.wood(woodId), M = this.metal(metalId), Mg = this.metal(metalId, engraved);
    const parts = { muzzle: new THREE.Object3D(), eject: new THREE.Object3D() };
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const cylZ = (r0, r1, len, seg = 20) => new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2);
    const isShot = def.kind === 'shotgun';
    const barrelLen = L.barrel;
    const recvLen = isShot ? 0.1 : def.action === 'semi' ? 0.2 : 0.22;
    const recvFront = -0.16;
    const muzzleZ = recvFront - barrelLen;
    // --- Crosse (profil extrudé)
    this.stock(g, W, L.stock, isShot, def);
    // Plaque de couche
    add(new THREE.BoxGeometry(0.044, isShot ? 0.115 : 0.13, 0.022), this.rubber, 0, isShot ? -0.075 : -0.092, 0.37, -0.1);
    // --- Boîte de culasse / bascule
    if (isShot && (L.ou || L.sxs)) {
      add(new THREE.BoxGeometry(0.042, 0.06, recvLen), Mg, 0, -0.012, recvFront + recvLen / 2 + 0.02);
    } else if (isShot || def.action === 'semi') {
      add(new THREE.BoxGeometry(0.036, 0.052, recvLen), Mg, 0, -0.008, recvFront + recvLen / 2);
    } else if (L.double) {
      add(new THREE.BoxGeometry(0.044, 0.058, 0.1), Mg, 0, -0.012, recvFront + 0.07);
    } else {
      add(cylZ(0.0165, 0.0165, recvLen), Mg, 0, 0, recvFront + recvLen / 2);
      // Culasse mobile + levier
      const bolt = new THREE.Group();
      bolt.position.set(0, 0.006, recvFront + recvLen - 0.04);
      g.add(bolt);
      add(cylZ(0.0085, 0.0085, 0.12), M, 0, 0, -0.03, 0, 0, 0, bolt);
      const handle = new THREE.Group();
      bolt.add(handle);
      add(new THREE.CylinderGeometry(0.0038, 0.0045, 0.055, 8), M, 0.028, -0.012, 0.0, 0, 0, Math.PI / 2 - 0.5, handle);
      add(new THREE.SphereGeometry(0.0095, 14, 10), M, 0.05, -0.026, 0.0, 0, 0, 0, handle);
      parts.bolt = bolt;
      parts.boltHandle = handle;
      // Fenêtre d'éjection
      parts.eject.position.set(0.02, 0.01, recvFront + 0.12);
    }
    // Pontet et queue de détente
    const guard = add(new THREE.TorusGeometry(0.03, 0.0032, 6, 18, Math.PI * 1.1), M, -0.0, -0.058, 0.025, 0, Math.PI / 2, Math.PI * 0.95);
    guard.scale.set(1, 0.55, 1);
    add(new THREE.BoxGeometry(0.004, 0.026, 0.006), M, 0, -0.05, 0.03, 0.3);
    if (!isShot && def.action !== 'double' && def.action !== 'lever') add(new THREE.BoxGeometry(0.03, 0.012, 0.09), M, 0, -0.06, recvFront + 0.12);
    // Levier de sous-garde (carabine à levier)
    if (L.lever) {
      const lev = add(new THREE.TorusGeometry(0.045, 0.0045, 6, 18, Math.PI * 1.3), M, 0, -0.07, 0.05, 0, Math.PI / 2, Math.PI * 0.85);
      lev.scale.set(1.3, 0.7, 1);
      parts.lever = lev;
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 10), M, 0.022, 0.008, -0.08, 0, 0, Math.PI / 2);
    }
    // --- Canons
    if (isShot && L.ou) {
      add(cylZ(0.0098, 0.0108, barrelLen), M, 0, 0.006, recvFront - barrelLen / 2);
      add(cylZ(0.0098, 0.0108, barrelLen), M, 0, -0.016, recvFront - barrelLen / 2);
      add(new THREE.BoxGeometry(0.009, 0.004, barrelLen), M, 0, 0.0175, recvFront - barrelLen / 2);
      add(new THREE.BoxGeometry(0.006, 0.006, barrelLen * 0.98), M, 0, -0.005, recvFront - barrelLen / 2);
    } else if (isShot && L.sxs || L.double) {
      const r = L.double ? 0.0115 : 0.0102;
      add(cylZ(r * 0.92, r, barrelLen), M, 0.0108, 0, recvFront - barrelLen / 2);
      add(cylZ(r * 0.92, r, barrelLen), M, -0.0108, 0, recvFront - barrelLen / 2);
      add(new THREE.BoxGeometry(0.008, 0.006, barrelLen), M, 0, 0.0095, recvFront - barrelLen / 2);
      if (L.drilling) add(cylZ(0.0085, 0.0095, barrelLen), M, 0, -0.019, recvFront - barrelLen / 2);
    } else {
      const r0 = isShot ? 0.0102 : 0.0088, r1 = isShot ? 0.0112 : 0.0118;
      add(cylZ(r0, r1, barrelLen), M, 0, 0, recvFront - barrelLen / 2);
      if (isShot) add(new THREE.BoxGeometry(0.008, 0.004, barrelLen), M, 0, 0.0128, recvFront - barrelLen / 2);
      if (L.pump || L.semi) add(cylZ(0.0085, 0.0085, barrelLen * 0.72), M, 0, -0.021, recvFront - barrelLen * 0.36);
      if (L.brake) add(cylZ(0.0115, 0.0115, 0.055, 12), M, 0, 0, muzzleZ + 0.02);
    }
    // Devant (garde-main) des fusils / pompe
    if (isShot || L.double) {
      const fe = add(new THREE.CapsuleGeometry(0.019, 0.17, 6, 12).rotateX(Math.PI / 2), W, 0, isShot && L.ou ? -0.03 : -0.022, recvFront - 0.13);
      fe.scale.set(1.05, 0.8, 1);
      if (L.pump) parts.pump = fe;
    }
    // Guidon (bille) et hausse
    if (def.optic === 'bead' || def.optic === 'iron') {
      add(new THREE.SphereGeometry(0.0026, 10, 8), def.optic === 'bead' ? this.metal('inox') : M, 0, isShot ? 0.022 : 0.016, muzzleZ + 0.008);
      if (def.optic === 'iron') {
        add(new THREE.BoxGeometry(0.004, 0.012, 0.008), M, 0, 0.011, muzzleZ + 0.012);
        add(new THREE.BoxGeometry(0.02, 0.012, 0.004), M, 0, 0.012, recvFront - 0.12);
      }
    }
    // Battants de bretelle
    if (L.sling) {
      add(new THREE.TorusGeometry(0.009, 0.0018, 6, 12), M, 0, -0.135, 0.28, 0, Math.PI / 2, 0);
      add(new THREE.TorusGeometry(0.009, 0.0018, 6, 12), M, 0, -0.058, -0.4, 0, Math.PI / 2, 0);
    }
    parts.muzzle.position.set(0, 0, muzzleZ);
    g.add(parts.muzzle, parts.eject);
    if (!parts.eject.position.lengthSq()) parts.eject.position.set(0.02, 0.01, recvFront + 0.04);
    // --- Optique
    const opt = OPTICS[skin.optic || def.optic] || OPTICS.iron;
    let sightY = isShot ? 0.021 : 0.017;
    if (opt.kind === 'scope') {
      sightY = 0.048;
      parts.scope = this.scope(g, M, opt, skin.optic || def.optic);
    } else if (opt.kind === 'dot') {
      sightY = 0.04;
      add(cylZ(0.016, 0.016, 0.05, 16), this.metal('noir'), 0, 0.04, recvFront + 0.07);
      add(new THREE.BoxGeometry(0.016, 0.022, 0.03), this.metal('noir'), 0, 0.022, recvFront + 0.07);
      add(new THREE.CircleGeometry(0.013, 16).rotateY(Math.PI), this.glass, 0, 0.04, recvFront + 0.045);
    }
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { group: g, parts, sightY, muzzleZ, length: 0.38 - muzzleZ };
  }

  stock(g, W, style, isShot, def) {
    const s = new THREE.Shape();
    // Profil (x = z de l'arme, y = hauteur), de la plaque de couche vers le devant
    const comb = isShot ? -0.012 : -0.026;
    const pts = style === 'anglais'
      ? [[0.36, comb - 0.008], [0.26, comb], [0.14, comb - 0.012], [0.06, -0.03], [0.04, -0.022], [-0.06, -0.028], [-0.06, -0.06], [0.0, -0.062], [0.08, -0.07], [0.16, -0.088], [0.26, -0.105], [0.36, -0.135]]
      : style === 'droit'
        ? [[0.36, comb - 0.006], [0.25, comb], [0.12, comb - 0.014], [0.06, -0.035], [0.03, -0.025], [-0.16, -0.02], [-0.16, -0.05], [-0.02, -0.06], [0.06, -0.072], [0.14, -0.1], [0.26, -0.115], [0.36, -0.15]]
        : [[0.36, comb - 0.002], [0.3, comb + 0.004], [0.2, comb + 0.006], [0.14, comb - 0.008], [0.08, -0.04], [0.05, -0.024], [-0.16, -0.02], [-0.44, -0.016], [-0.452, -0.034], [-0.44, -0.054], [-0.2, -0.062], [-0.08, -0.068], [0.0, -0.066], [0.075, -0.076], [0.098, -0.134], [0.128, -0.12], [0.22, -0.112], [0.36, -0.162]];
    if (style === 'bavarois') {
      // Joue bavaroise : un peu plus haute, fût court
      pts[1][1] += 0.006;
      pts[2][1] += 0.008;
      pts[7] = [-0.36, -0.016];
      pts[8] = [-0.372, -0.034];
      pts[9] = [-0.36, -0.054];
    }
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.lineTo(pts[0][0], pts[0][1]);
    const depth = isShot ? 0.03 : 0.032;
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.0075, bevelSegments: 4, curveSegments: 4, steps: 1 });
    geo.translate(0, 0, -depth / 2);
    // (x,y,z) -> (épaisseur, hauteur, longueur)
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, W);
    m.castShadow = true;
    g.add(m);
    void def;
  }

  scope(g, M, opt, id) {
    const big = opt.zoom[1] >= 15 ? 0.03 : opt.zoom[1] >= 12 ? 0.027 : 0.023;
    const prof = [
      [0, -0.19], [big, -0.19], [big, -0.165], [big - 0.002, -0.15], [0.0128, -0.095], [0.0128, 0.07], [0.0185, 0.095], [0.0205, 0.11], [0.0205, 0.16], [0.018, 0.165], [0, 0.165],
    ].map(([r, z]) => new THREE.Vector2(r, z));
    const geo = new THREE.LatheGeometry(prof, 28).rotateX(-Math.PI / 2);
    // Après rotation : l'axe y du profil devient -z... on retourne pour garder l'objectif à l'avant
    geo.rotateY(Math.PI);
    const scope = new THREE.Group();
    scope.position.set(0, 0.048, -0.075);
    g.add(scope);
    const body = new THREE.Mesh(geo, this.metal('noir'));
    body.castShadow = true;
    scope.add(body);
    // Tourelles
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 16), this.metal('noir'));
    t1.position.set(0, 0.022, 0.0);
    scope.add(t1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 16), this.metal('noir'));
    t2.rotation.z = Math.PI / 2;
    t2.position.set(0.022, 0, 0.0);
    scope.add(t2);
    if (opt.illum) {
      const t3 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 16), this.metal('noir'));
      t3.rotation.z = Math.PI / 2;
      t3.position.set(-0.018, 0, 0.065);
      scope.add(t3);
    }
    // Colliers et embases
    for (const z of [-0.05, 0.05]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0136, 0.0042, 8, 20), M);
      ring.position.set(0, 0, z);
      scope.add(ring);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.016), M);
      base.position.set(0, -0.026, z);
      scope.add(base);
    }
    // Verres
    const lens = new THREE.Mesh(new THREE.CircleGeometry(big - 0.002, 24), this.glass);
    lens.position.set(0, 0, -0.19 - 0.0005);
    lens.rotation.y = Math.PI;
    scope.add(lens);
    const ocular = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), this.glass);
    ocular.position.set(0, 0, 0.1655);
    scope.add(ocular);
    void id;
    return scope;
  }

  // Mains gantées et manches (vue subjective)
  hands(outfit) {
    const grp = new THREE.Group();
    const glove = this.leather, cloth = this.fabric(outfit);
    const ell = (rx, ry, rz) => new THREE.SphereGeometry(1, 16, 12).scale(rx, ry, rz);
    const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
    // Main droite sur la poignée
    const R = new THREE.Group();
    R.position.set(0.0, -0.085, 0.1);
    grp.add(R);
    const palmR = new THREE.Mesh(ell(0.03, 0.046, 0.042), glove);
    palmR.position.set(0.024, -0.005, 0.01);
    palmR.rotation.set(0.2, 0, -0.15);
    R.add(palmR);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(capsule(0.0095, 0.038), glove);
      f.position.set(-0.006, -0.018 - i * 0.019, -0.02);
      f.rotation.set(0.1, 0, Math.PI / 2 + 0.2);
      R.add(f);
    }
    const index = new THREE.Mesh(capsule(0.0092, 0.042), glove);
    index.position.set(0.004, 0.03, -0.05);
    index.rotation.set(Math.PI / 2 - 0.4, 0, 0.3);
    R.add(index);
    const thumb = new THREE.Mesh(capsule(0.0105, 0.035), glove);
    thumb.position.set(0.012, 0.03, 0.012);
    thumb.rotation.set(0.4, 0, -0.9);
    R.add(thumb);
    const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.42, 14, 1, true).rotateX(Math.PI / 2 - 0.35), cloth);
    sleeveR.position.set(0.05, -0.08, 0.24);
    sleeveR.rotation.y = -0.25;
    R.add(sleeveR);
    const cuffR = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.05, 14).rotateX(Math.PI / 2 - 0.35), glove);
    cuffR.position.set(0.032, -0.03, 0.06);
    cuffR.rotation.y = -0.25;
    R.add(cuffR);
    // Main gauche sous le devant
    const Lh = new THREE.Group();
    Lh.position.set(-0.004, -0.058, -0.33);
    grp.add(Lh);
    const palmL = new THREE.Mesh(ell(0.032, 0.03, 0.05), glove);
    palmL.position.set(-0.006, -0.022, 0);
    Lh.add(palmL);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(capsule(0.009, 0.034), glove);
      f.position.set(0.024, -0.004, -0.028 + i * 0.019);
      f.rotation.set(0, 0, 0.35);
      Lh.add(f);
    }
    const thumbL = new THREE.Mesh(capsule(0.0105, 0.04), glove);
    thumbL.position.set(-0.028, 0.0, -0.01);
    thumbL.rotation.set(Math.PI / 2 + 0.3, 0, -0.2);
    Lh.add(thumbL);
    const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.55, 14, 1, true).rotateX(Math.PI / 2 - 0.55), cloth);
    sleeveL.position.set(-0.07, -0.14, 0.22);
    sleeveL.rotation.y = 0.3;
    Lh.add(sleeveL);
    const cuffL = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.043, 0.05, 14).rotateX(Math.PI / 2 - 0.55), glove);
    cuffL.position.set(-0.025, -0.05, 0.035);
    cuffL.rotation.y = 0.3;
    Lh.add(cuffL);
    grp.userData.right = R;
    grp.userData.left = Lh;
    return grp;
  }

  casing(isShot) {
    const key = isShot ? 'caseShot' : 'caseRifle';
    if (!this.mats.has(key)) {
      const geo = isShot ? new THREE.CylinderGeometry(0.0105, 0.0105, 0.068, 12) : new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10);
      this.mats.set(key, geo);
    }
    const mat = isShot ? (this.mats.get('shellRed') || this.mats.set('shellRed', new THREE.MeshStandardMaterial({ color: 0x8a1c18, roughness: 0.5 })).get('shellRed')) : this.brass;
    return new THREE.Mesh(this.mats.get(key), mat);
  }
}
