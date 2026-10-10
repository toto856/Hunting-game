// Commandes tactiles (iPhone, iPad, Android).
// - Pouce gauche : joystick qui apparaît sous le doigt (poussez au-delà du cercle pour courir).
// - Pouce droit : glisser n'importe où pour regarder, y compris à la lunette (la lunette ne
//   capte jamais les doigts). Le bouton FEU tire à l'appui et peut ensuite être glissé pour
//   corriger la visée sans relâcher.
// - À la lunette : bouton TIR à gauche (deux pouces : un vise, l'autre tire), SOUFFLE à
//   maintenir pour stabiliser, pincer à deux doigts ou + / − pour le grossissement.
import { clamp } from '../core/math.js';

const R = 56; // rayon du joystick (px)

const BTN = (a, label, cls = '') => `<button class="t-btn ${cls}" data-a="${a}" aria-label="${label}"><span>${label}</span></button>`;

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    const el = (this.el = document.createElement('div'));
    el.className = 'touch';
    el.dataset.mode = 'lodge';
    el.dataset.state = 'lodge';
    el.innerHTML = `
      <div class="t-stick" hidden><div class="t-knob"></div></div>
      <div class="t-top">${BTN('map', 'Carte', 't-map')}${BTN('pause', '☰', 't-menu')}</div>
      <div class="t-right">
        ${BTN('fire', 'FEU', 't-fire')}${BTN('aim', 'VISER', 't-aim')}${BTN('reload', 'Recharger', 't-reload')}
        ${BTN('stance', 'Debout', 't-stance')}${BTN('binoc', 'Jumelles', 't-binoc')}${BTN('swap', 'Arme', 't-swap')}
        ${BTN('call', 'Appeau', 't-call')}${BTN('sticks', 'Bâton', 't-sticks')}
      </div>
      <div class="t-left">${BTN('fire2', 'TIR', 't-fire2')}${BTN('breath', 'Souffle', 't-breath')}
        <div class="t-zoom">${BTN('zoomIn', '+', 't-zin')}${BTN('zoomOut', '−', 't-zout')}</div></div>
      ${BTN('interact', '', 't-act')}
      <div class="t-portrait">Tournez le téléphone pour jouer en paysage</div>`;
    document.getElementById('ui').appendChild(el);
    document.body.classList.add('is-touch');
    this.stick = el.querySelector('.t-stick');
    this.knob = el.querySelector('.t-knob');
    this.act = el.querySelector('.t-act');
    this.stanceBtn = el.querySelector('.t-stance span');
    this.aimBtn = el.querySelector('.t-aim span');
    this.ptr = new Map();
    this.stickPtr = null;
    this.pinch = null;
    this.hidden = false;
    this.state = '';
    this.lastTap = 0;
    this._act = null;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    // Pas de défilement, de zoom de page ni de menu contextuel pendant le jeu
    for (const ev of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(mode) {
    this.el.dataset.mode = mode;
    this.releaseAll();
  }

  hide(on) {
    this.hidden = on;
    this.el.hidden = on;
    if (on) this.releaseAll();
  }

  setAction(label) {
    if (label === this._act) return;
    this._act = label;
    this.act.querySelector('span').textContent = label || '';
    this.act.classList.toggle('on', !!label);
  }

  releaseAll() {
    for (const p of this.ptr.values()) if (p.kind === 'btn') this.press(p.a, false, p);
    this.ptr.clear();
    this.stickPtr = null;
    this.pinch = null;
    this.stick.hidden = true;
    this.input.setMove(0, 0, 0);
    for (const a of ['fire', 'breath', 'zoomIn', 'zoomOut']) this.input.release(a);
    this.el.querySelectorAll('.down').forEach((b) => b.classList.remove('down'));
  }

  down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.input.usingTouch = true;
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ancien navigateur */ }
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 };
    const b = e.target.closest('[data-a]');
    if (b && b.offsetParent !== null) {
      p.kind = 'btn';
      p.a = b.dataset.a;
      p.el = b;
      b.classList.add('down');
      this.press(p.a, true, p);
    } else if (e.clientX < innerWidth * 0.42 && !this.stickPtr) {
      p.kind = 'stick';
      this.stickPtr = p;
      this.stick.hidden = false;
      this.stick.style.transform = `translate(${p.x0 - R}px, ${p.y0 - R}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
    } else {
      p.kind = 'look';
      const other = [...this.ptr.values()].find((q) => q.kind === 'look');
      if (other) this.pinch = { a: other, b: p, d: Math.hypot(other.x - p.x, other.y - p.y) };
    }
    this.ptr.set(e.pointerId, p);
  }

  move(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    // Mouvements intermédiaires (plus fluide sur les écrans 120 Hz)
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const list = evs && evs.length ? evs : [e];
    for (const ev of list) {
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX;
      p.y = ev.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.kind === 'stick') this.updateStick(p);
      else if (p.kind === 'look' || (p.kind === 'btn' && (p.a === 'fire' || p.a === 'aim'))) {
        if (this.pinch && (this.pinch.a === p || this.pinch.b === p)) {
          const d = Math.hypot(this.pinch.a.x - this.pinch.b.x, this.pinch.a.y - this.pinch.b.y);
          if (this.pinch.d > 8) this.input.pinch = (this.input.pinch || 1) * clamp(d / this.pinch.d, 0.8, 1.25);
          this.pinch.d = d;
        } else if (p.kind === 'look' || p.moved > 6) this.input.addLook(dx, dy, true);
      }
    }
  }

  up(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    this.ptr.delete(e.pointerId);
    if (p.kind === 'btn') {
      p.el.classList.remove('down');
      this.press(p.a, false, p);
    } else if (p.kind === 'stick') {
      this.stickPtr = null;
      this.stick.hidden = true;
      this.input.setMove(0, 0, 0);
    } else if (p.kind === 'look') {
      // Double tape sur la zone de regard : épauler / quitter la visée
      const now = performance.now();
      if (now - p.t < 260 && p.moved < 12 && !this.pinch) {
        if (now - this.lastTap < 320 && this.app.mode === 'hunt') {
          this.input.toggle('aim');
          this.lastTap = 0;
        } else this.lastTap = now;
      }
    }
    if (this.pinch && (this.pinch.a === p || this.pinch.b === p)) this.pinch = null;
  }

  updateStick(p) {
    let dx = p.x - p.x0, dy = p.y - p.y0;
    const len = Math.hypot(dx, dy);
    // Au-delà du cercle : on court (la base suit le doigt)
    const run = len > R * 1.3;
    if (len > R * 1.6) {
      const k = (len - R * 1.6) / len;
      p.x0 += dx * k;
      p.y0 += dy * k;
      dx = p.x - p.x0;
      dy = p.y - p.y0;
      this.stick.style.transform = `translate(${p.x0 - R}px, ${p.y0 - R}px)`;
    }
    const l2 = Math.hypot(dx, dy);
    const k = l2 > R ? R / l2 : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const mx = (dx * k) / R, my = (-dy * k) / R;
    const mag = Math.min(1, l2 / R);
    this.input.setMove(mx, my, run ? 1 : Math.min(0.94, mag));
    this.stick.classList.toggle('run', run);
  }

  press(a, down, p) {
    const I = this.input;
    switch (a) {
      case 'fire':
      case 'fire2':
        if (down) I.press('fire');
        else I.release('fire');
        break;
      case 'breath':
      case 'zoomIn':
      case 'zoomOut':
        if (down) I.press(a);
        else I.release(a);
        break;
      case 'aim':
        if (down) I.toggle('aim');
        break;
      case 'stance': {
        if (!down) break;
        const st = this.app.current && this.app.current.player ? this.app.current.player.stance : 'stand';
        I.tap(st === 'stand' ? 'crouch' : 'prone');
        break;
      }
      case 'swap':
        if (down) I.tap('next');
        break;
      default:
        if (down) I.tap(a);
    }
    if (down && navigator.vibrate) navigator.vibrate(6);
    void p;
  }

  // Appelé à chaque image : boutons adaptés à la situation
  frame() {
    if (this.hidden) return;
    const app = this.app, cur = app.current;
    let st = 'lodge';
    if (app.mode === 'hunt' && cur && cur.weapons) {
      const w = cur.weapons;
      st = cur.harvest ? 'harvest' : w.binoc ? 'binoc' : w.scoped ? 'scope' : w.ads ? 'ads' : 'hunt';
      const pl = cur.player;
      const stance = pl ? pl.stance : 'stand';
      if (stance !== this._stance) {
        this._stance = stance;
        this.stanceBtn.textContent = { stand: 'Debout', crouch: 'Accroupi', prone: 'Couché' }[stance];
      }
      const aimTxt = w.ads || w.binoc ? 'Quitter' : 'VISER';
      if (aimTxt !== this._aim) { this._aim = aimTxt; this.aimBtn.textContent = aimTxt; }
      const flags = (w.slots.length > 1 ? 'w' : '') + (cur.hasCall ? 'c' : '') + (cur.hasSticks ? 's' : '');
      if (flags !== this._flags) { this._flags = flags; this.el.dataset.flags = flags; }
    }
    if (st !== this.state) {
      this.state = st;
      this.el.dataset.state = st;
      if (st === 'harvest') this.releaseAll();
    }
  }
}
