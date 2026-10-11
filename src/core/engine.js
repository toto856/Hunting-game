// Moteur : rendu WebGL2, boucle, redimensionnement, résolution dynamique.
import * as THREE from 'three';
import { GU } from '../gfx/globals.js';
import { getPreset } from './quality.js';
import { clamp } from './math.js';

export class Engine {
  constructor(canvas, qualityName) {
    this.canvas = canvas;
    this.qualityName = qualityName;
    this.q = getPreset(qualityName);
    this.clock = new THREE.Clock();
    this.scene = null; // contrôleur de scène courant
    this.time = 0;
    this.frame = 0;
    this.fps = 60;
    this._ft = [];
    this.drs = 1; // facteur de résolution dynamique
    this._drsT = 0;
    this.listeners = [];
    this.createRenderer();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  }

  createRenderer() {
    const q = this.q;
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: q.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    const tm = new URLSearchParams(location.search).get('tm');
    r.toneMapping = tm === 'aces' ? THREE.ACESFilmicToneMapping : tm === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false;
    this.renderer = r;
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.onContextLost) this.onContextLost();
    });
    this.resize();
  }

  basePixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
  }

  resize() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setPixelRatio(this.basePixelRatio() * this.drs);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    if (this.scene && this.scene.resize) this.scene.resize(this.width, this.height);
  }

  setScene(ctrl) {
    if (this.scene && this.scene.dispose) this.scene.dispose();
    this.scene = ctrl;
    this.drs = 1;
    this.resize();
  }

  start(stillFrames = 0) {
    // stillFrames > 0 : rend quelques images puis s'arrête (captures de test)
    let n = 0;
    const loop = () => {
      if (stillFrames && n >= stillFrames) { this.stopped = true; return; }
      n++;
      requestAnimationFrame(loop);
      const t0 = performance.now();
      this.tick();
      this.lastFrameMs = performance.now() - t0;
    };
    requestAnimationFrame(loop);
  }

  tick() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 1 / 15);
    this.time += dt;
    this.frame++;
    GU.uTime.value = this.time;
    this._measure(rawDt);
    this.renderer.info.reset();
    if (this.scene) {
      this.scene.update(dt, this.time);
      this.scene.render(this.renderer);
    }
    for (const f of this.listeners) f(dt);
  }

  // Résolution dynamique : vise ~55 i/s sur mobile, ~58 sur ordinateur
  _measure(dt) {
    this._ft.push(dt);
    if (this._ft.length > 30) this._ft.shift();
    const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length;
    this.fps = 1 / Math.max(avg, 1e-4);
    this._drsT += dt;
    if (this._drsT < 1.2 || this.scene == null || this.scene.paused) return;
    this._drsT = 0;
    let next = this.drs;
    if (this.fps < 44) next = this.drs - 0.1;
    else if (this.fps > 57 && this.drs < 1) next = this.drs + 0.05;
    next = clamp(next, 0.55, 1);
    if (Math.abs(next - this.drs) > 0.01) {
      this.drs = next;
      this.renderer.setPixelRatio(this.basePixelRatio() * this.drs);
      this.renderer.setSize(this.width, this.height, false);
      if (this.scene && this.scene.resize) this.scene.resize(this.width, this.height);
    }
  }
}
