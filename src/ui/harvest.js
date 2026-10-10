// Tableau de chasse : présentation de l'animal (studio), vue rayons X du tir
// (squelette, organes, trajectoire de la balle), cotation du trophée, gains.
import * as THREE from 'three';
import { SPECIES } from '../animals/species.js';
import { buildVitals, ORGANS } from '../animals/vitals.js';
import { fmt, clamp } from '../core/math.js';
import { audio } from '../core/audio.js';
import * as Save from '../core/save.js';

const MEDAL_CLASS = { aucune: 'none', bronze: 'bronze', argent: 'silver', or: 'gold', diamant: 'diamond', legendaire: 'legend' };

export class HarvestView {
  constructor(hunt, animal, rec, onClose) {
    this.hunt = hunt;
    this.rec = rec;
    this.onClose = onClose;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d0b);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 100);
    this.xray = false;
    this.yaw = -0.6;
    this.pitch = 0.18;
    this.t = 0;
    const spec = SPECIES[rec.species];
    this.spec = spec;
    // Lumières de studio
    const key = new THREE.DirectionalLight(0xfff2e0, 3.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.6);
    rim.position.set(-4, 3, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0x9aa4b0, 0x2a2418, 0.7));
    this.scene.environment = hunt.scene.environment;
    this.scene.environmentIntensity = 0.5;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1f19, roughness: 0.95 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    // L'animal, debout en pose de présentation
    const vis = hunt.factory.create(rec.ind);
    this.vis = vis;
    vis.holder.position.set(0, 0, 0);
    vis.lods.forEach((m, i) => (m.visible = i === 0));
    vis.animator.update(0.016, { speed: 0 });
    this.scene.add(vis.holder);
    vis.holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.baseMat = vis.lods[0].material;
    this.xrayMat = this.makeXrayMaterial();
    this.inner = new THREE.Group();
    vis.inner.add(this.inner);
    this.buildXray(rec, animal);
    this.inner.visible = false;
    const size = spec.body[9][1] + spec.body[9][2];
    this.focus = new THREE.Vector3(0, size * 0.55 * rec.ind.scale, 0.15);
    this.dist = (spec.body[spec.body.length - 1][0] - spec.body[0][0]) * rec.ind.scale * 2.4;
    this.buildPanel(rec);
    // Rotation à la souris / au doigt
    const cv = document.getElementById('game');
    this._down = (e) => { this.drag = { x: e.clientX, y: e.clientY }; };
    this._move = (e) => {
      if (!this.drag) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.008;
      this.pitch = clamp(this.pitch + (e.clientY - this.drag.y) * 0.004, -0.1, 0.8);
      this.drag = { x: e.clientX, y: e.clientY };
    };
    this._up = () => { this.drag = null; };
    this._wheel = (e) => { this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.08 : 0.92), 1.2, 8); };
    cv.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    cv.addEventListener('wheel', this._wheel, { passive: true });
    if (rec.medal === 'diamant' || rec.medal === 'legendaire') audio.fanfare('diamant');
    else if (rec.medal !== 'aucune') audio.fanfare('honneurs');
  }

  makeXrayMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.4, side: THREE.DoubleSide });
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float fr = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.5 );
        gl_FragColor = vec4( mix( vec3( 0.25, 0.55, 0.85 ), vec3( 0.75, 0.92, 1.0 ), fr ), 0.06 + fr * 0.42 );`);
    };
    return m;
  }

  buildXray(rec, animal) {
    const spec = this.spec;
    const bone = new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.6, emissive: 0x2a2620, emissiveIntensity: 0.4 });
    const hitKeys = new Set(rec.organs);
    // Organes
    for (const o of buildVitals(spec)) {
      if (o.key === 'colonne' || o.key === 'cervicales') continue;
      const def = ORGANS[o.key];
      const hit = hitKeys.has(o.key);
      const mat = new THREE.MeshStandardMaterial({
        color: def.color, roughness: 0.45, transparent: !hit, opacity: hit ? 1 : 0.55,
        emissive: hit ? def.color : 0x000000, emissiveIntensity: hit ? 0.7 : 0,
      });
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
      m.scale.copy(o.r);
      m.position.copy(o.c);
      if (hit) m.userData.pulse = true;
      this.inner.add(m);
    }
    // Squelette simplifié : colonne, côtes, crâne, pattes
    const B = spec.body;
    const spine = [];
    for (let i = 1; i < B.length - 2; i++) spine.push(new THREE.Vector3(0, B[i][1] + (i < spec.neckStart ? B[i][2] * 0.72 : B[i][2] * 0.1), B[i][0]));
    const sc = new THREE.CatmullRomCurve3(spine);
    this.inner.add(new THREE.Mesh(new THREE.TubeGeometry(sc, 60, 0.018, 8), bone));
    for (let i = Math.floor(spec.neckStart * 0.35); i < spec.neckStart - 1; i++) {
      const s = B[i];
      const depth = s[2] + s[3];
      for (const side of [1, -1]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(depth * 0.42, 0.007, 5, 16, Math.PI * 0.9), bone);
        rib.position.set(side * s[4] * 0.2, s[1] + s[2] * 0.2, s[0]);
        rib.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, -Math.PI / 2 - 0.15);
        rib.scale.set(1, s[4] / (depth * 0.42) * 0.85, 1);
        this.inner.add(rib);
      }
    }
    const hs = B[spec.headStart + 1];
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bone);
    const headLen = B[B.length - 1][0] - B[spec.headStart][0];
    skull.scale.set(hs[4] * 0.62, hs[2] * 0.62, headLen * 0.34);
    skull.position.set(0, hs[1] + 0.005, B[spec.headStart][0] + headLen * 0.42);
    this.inner.add(skull);
    for (const side of [1, -1]) {
      for (const def of [spec.front, spec.rear]) {
        const pts = def.pts.map((p) => new THREE.Vector3(p[0] * side * 0.9, p[1], p[2]));
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const len = a.distanceTo(b);
          const c = new THREE.Mesh(new THREE.CylinderGeometry(def.r[i] * 0.28, def.r[i + 1] * 0.28, len, 8), bone);
          c.position.copy(a).lerp(b, 0.5);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          this.inner.add(c);
        }
      }
    }
    // Trajectoires des balles
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false });
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd060, toneMapped: false });
    for (const w of rec.wounds) {
      if (!w.path) continue;
      const [pa, pb] = w.path;
      const dir = pb.clone().sub(pa).normalize();
      const a = pa.clone().addScaledVector(dir, -0.6);
      const b = pb.clone();
      const len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 8), lineMat);
      c.position.copy(a).lerp(b, 0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.inner.add(c);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), dotMat);
      e.position.copy(pa).addScaledVector(dir, 0.04);
      this.inner.add(e);
    }
    void animal;
  }

  buildPanel(rec) {
    const root = document.getElementById('ui');
    const p = document.createElement('div');
    p.className = 'harvest';
    const medalCls = MEDAL_CLASS[rec.medal];
    const unit = rec.trophy ? 'points' : '';
    const organs = [...new Set(rec.organs)].map((k) => ORGANS[k]?.name).filter(Boolean);
    p.innerHTML = `
      <div class="hv-head">
        <div class="hv-kicker">${rec.speciesName}</div>
        <h2>${rec.name}${rec.legendary ? ' <span class="legend-tag">Légendaire</span>' : ''}</h2>
      </div>
      <div class="hv-medal ${medalCls}">
        <div class="medal-disc"><span>${rec.trophy ? fmt.dec(rec.score, 1) : '—'}</span><em>${unit}</em></div>
        <div class="medal-name">${rec.medalName}</div>
        ${rec.summary ? `<div class="medal-sum">${rec.summary}</div>` : ''}
      </div>
      <dl class="hv-facts">
        <div><dt>Poids</dt><dd>${fmt.kg(rec.weight)}</dd></div>
        <div><dt>Pelage</dt><dd>${rec.fur}${rec.rareFur ? ' <b class="rare">rare</b>' : ''}</dd></div>
        <div><dt>Distance de tir</dt><dd>${fmt.dist(rec.dist)}</dd></div>
        <div><dt>Arme</dt><dd>${rec.weapon}</dd></div>
        <div><dt>Tir</dt><dd>${rec.outcomeText}${rec.shots > 1 ? ` (${rec.shots} balles)` : ''}</dd></div>
        <div><dt>Qualité du tir</dt><dd><span class="qbar"><i style="width:${Math.round(rec.quality * 100)}%"></i></span> ${Math.round(rec.quality * 100)} %</dd></div>
      </dl>
      <div class="hv-organs">${organs.length ? 'Organes touchés : ' + organs.join(', ') : 'Aucun organe vital touché'}</div>
      ${rec.notes.length ? `<ul class="hv-notes">${rec.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      <div class="hv-gain"><span>+${fmt.money(rec.money - rec.fine)}</span><span>+${fmt.int(rec.xp)} XP</span></div>
      <div class="hv-hint">${this.spec.vitalHint}</div>
      <div class="hv-actions">
        <button class="btn ghost" data-a="xray">Rayons X</button>
        <button class="btn" data-a="ok">Mettre au tableau</button>
      </div>
      <div class="hv-rewards"></div>`;
    root.appendChild(p);
    this.panel = p;
    p.querySelector('[data-a="xray"]').addEventListener('click', () => this.toggleXray());
    p.querySelector('[data-a="ok"]').addEventListener('click', () => this.validate());
    this.toggleXray(true);
  }

  toggleXray(force) {
    this.xray = force ?? !this.xray;
    this.vis.lods[0].material = this.xray ? this.xrayMat : this.baseMat;
    this.inner.visible = this.xray;
    const b = this.panel.querySelector('[data-a="xray"]');
    b.textContent = this.xray ? 'Vue normale' : 'Rayons X';
    audio.ui();
  }

  validate() {
    if (this.done) {
      this.onClose();
      return;
    }
    this.done = true;
    const rewards = this.hunt.commitHarvest(this.rec);
    const r = this.panel.querySelector('.hv-rewards');
    if (rewards.length) {
      r.innerHTML = rewards.map((x) => `<div class="reward">Récompense débloquée : <b>${x.name}</b> — à récupérer à l'armurerie</div>`).join('');
      audio.fanfare('court');
    }
    const s = Save.get();
    const btn = this.panel.querySelector('[data-a="ok"]');
    btn.textContent = 'Continuer la chasse';
    this.panel.querySelector('.hv-gain').insertAdjacentHTML('beforeend', `<span class="bal">Solde : ${fmt.money(s.money)}</span>`);
    audio.ui('buy');
  }

  update(dt) {
    this.t += dt;
    const c = this.camera;
    const f = this.focus;
    c.position.set(f.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, f.y + Math.sin(this.pitch) * this.dist, f.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(f);
    c.aspect = innerWidth / innerHeight;
    // L'animal reste à gauche du panneau sur grand écran
    c.setViewOffset(innerWidth, innerHeight, innerWidth > 900 ? innerWidth * 0.17 : 0, innerWidth > 900 ? 0 : innerHeight * 0.18, innerWidth, innerHeight);
    c.updateProjectionMatrix();
    for (const o of this.inner.children) if (o.userData.pulse) o.material.emissiveIntensity = 0.5 + 0.4 * Math.sin(this.t * 5);
  }

  render(r) {
    r.render(this.scene, this.camera);
  }

  dispose() {
    this.panel.remove();
    const cv = document.getElementById('game');
    cv.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    cv.removeEventListener('wheel', this._wheel);
  }
}
