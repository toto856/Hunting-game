// Point d'entrée : moteur, entrées, sauvegarde, enchaînement pavillon <-> chasse.
import * as THREE from 'three';
import './gfx/globals.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { TexGen } from './gfx/texgen.js';
import { GunFactory } from './gfx/guns.js';
import { defaultQuality, hasTouch, isMobile } from './core/quality.js';
import * as Save from './core/save.js';
import { audio } from './core/audio.js';
import { UI } from './ui/screens.js';
import { TouchControls } from './ui/touch.js';
import { Hunt } from './game/hunt.js';
import { Lodge } from './world/lodge.js';
import { TestAnimalsScene } from './world/testScene.js';

const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');
const step = document.getElementById('boot-step');
const progress = (p, label) => {
  fill.style.width = Math.round(p * 100) + '%';
  if (label) step.textContent = label;
};

class App {
  constructor() {
    this.params = new URLSearchParams(location.search);
    Save.load();
    const opt = Save.get().options;
    const q = this.params.get('q') || opt.quality || defaultQuality();
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas, q);
    this.texgen = new TexGen(this.engine.renderer);
    this.guns = new GunFactory(this.texgen);
    this.input = new Input(this.canvas);
    this.input.aimToggle = opt.aimToggle || hasTouch;
    this.ui = new UI(this);
    this.touch = hasTouch ? new TouchControls(this) : null;
    this.mode = null; // 'lodge' | 'hunt'
    audio.setVolume(opt.volume);
    // Échap (sortie du verrouillage de la souris) : pause en chasse, menu au pavillon
    this.input.onLockLost = () => {
      const c = this.current;
      if (!c || c.paused !== false || this.ui.open) return;
      if (this.mode === 'hunt' && !c.harvest) this.ui.openPause(c);
      else if (this.mode === 'lodge') this.ui.openLodgeMenu();
    };
    // Fin d'image : commandes tactiles puis remise à zéro des appuis
    this.engine.listeners.push(() => {
      if (this.touch) this.touch.frame();
      this.input.endFrame();
    });
    this.input.onDragMode = () => this.ui.toast('Souris libre : glissez pour regarder, cliquez pour tirer');
    this.engine.onContextLost = () => this.ui.toast('Le processeur graphique a été réinitialisé : rechargez la page.');
    Save.onChange((why) => { if (why === 'cloud') this.ui.toast('Progression synchronisée depuis vos autres appareils'); });
    window.__game = { app: this, engine: this.engine, THREE };
  }

  async start() {
    const test = this.params.get('test');
    if (this.params.get('demo') === 'trophees') (await import('./dev/demo.js')).fillDemo();
    if (test === 'animals') {
      const s = new TestAnimalsScene(this.engine, this.texgen, this.params);
      await s.load(progress);
      this.engine.setScene(s);
      this.engine.start(Number(this.params.get('still') || 0));
      return this.ready();
    }
    // Synchronisation entre appareils (ouverture depuis Claude)
    Save.initCloud().then((ok) => { if (ok) this.ui.setSync(Save.cloudStatus()); });
    if (test === 'hunt') {
      await this.startHunt({ mode: this.params.get('mode') || 'gros', hour: Number(this.params.get('h') || 8), weather: this.params.get('w') || 'clair', stand: this.params.get('stand') || 'pre' }, true);
    } else {
      await this.enterLodge(true);
    }
    this.engine.start(Number(this.params.get('still') || 0));
    this.ready();
    if (!test && !this.params.get('notitle')) this.ui.showTitle();
  }

  ready() {
    window.__game.ready = true;
    boot.classList.add('done');
    setTimeout(() => (boot.hidden = true), 900);
  }

  async withLoading(label, fn) {
    boot.hidden = false;
    boot.classList.remove('done');
    progress(0.02, label);
    await new Promise((r) => setTimeout(r, 30));
    try {
      await fn(progress);
    } finally {
      boot.classList.add('done');
      setTimeout(() => (boot.hidden = true), 900);
    }
  }

  async enterLodge(first = false) {
    const run = async (prog) => {
      this.disposeCurrent();
      const lodge = new Lodge(this);
      await lodge.load(prog);
      this.current = lodge;
      this.mode = 'lodge';
      this.engine.setScene(lodge);
      this.input.enabled = true;
      if (this.touch) this.touch.setMode('lodge');
      audio.setEnv('indoor');
    };
    if (first) await run(progress);
    else await this.withLoading('Retour au pavillon', run);
  }

  async startHunt(opts, first = false) {
    const s = Save.get();
    s.last = { ...s.last, ...opts };
    Save.write();
    const run = async (prog) => {
      this.disposeCurrent();
      const hunt = new Hunt(this, opts);
      await hunt.load(prog);
      this.current = hunt;
      this.mode = 'hunt';
      this.engine.setScene(hunt);
      this.input.enabled = true;
      if (this.touch) this.touch.setMode('hunt');
    };
    if (first) await run(progress);
    else await this.withLoading('En route vers le domaine', run);
    this.requestPlayLock();
  }

  // Libère la scène courante avant d'en charger une autre (mémoire du téléphone)
  disposeCurrent() {
    const c = this.current;
    this.current = null;
    this.engine.scene = null;
    if (c && c.dispose) c.dispose();
    this.mode = null;
  }

  endHunt(hunt) {
    this.input.exitLock();
    this.ui.showSummary(hunt, () => this.enterLodge());
  }

  requestPlayLock() {
    if (!hasTouch && !isMobile) this.input.requestLock();
    this.input.enabled = true;
  }

  applyQuality(name) {
    const s = Save.get();
    s.options.quality = name;
    Save.write();
    // Les textures procédurales sont liées au contexte : on relance proprement
    location.reload();
  }
}

const app = new App();
const unlock = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
app.start().catch((e) => {
  console.error(e);
  step.textContent = 'Erreur au démarrage : ' + e.message;
});
