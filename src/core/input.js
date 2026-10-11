// Entrées unifiées : clavier + souris (verrouillage du pointeur ou glisser), tactile.
// Le reste du jeu ne lit que des « actions ».

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  KeyC: 'crouch', ControlLeft: 'crouch', KeyX: 'prone', Space: 'jump',
  KeyR: 'reload', KeyE: 'interact', KeyB: 'binoc', KeyF: 'call', KeyT: 'flash',
  KeyJ: 'journal', Tab: 'bag', Escape: 'pause', KeyP: 'pause',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', KeyQ: 'next', KeyV: 'sticks',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut',
  KeyH: 'hud', Enter: 'confirm',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.look = { dx: 0, dy: 0, touch: false };
    this.move = { x: 0, y: 0, touchMag: 0 };
    this.wheel = 0;
    this.enabled = false;        // gameplay en cours (sinon : menus)
    this.locked = false;
    this.dragMode = false;       // souris sans verrouillage
    this.aimToggle = false;
    this.usingTouch = false;
    this._drag = null;
    this.onLockLost = null;

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.clearHeld());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled && this.onLockLost) this.onLockLost();
    });
    document.addEventListener('pointerlockerror', () => this._lockFailed());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.usingTouch) return;
      if (this.locked) {
        // Certains navigateurs envoient des sauts aberrants au verrouillage
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      } else if (this.dragMode && this._drag) {
        const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
        this._drag.x = e.clientX;
        this._drag.y = e.clientY;
        this._drag.moved += Math.abs(dx) + Math.abs(dy);
        this.look.dx += dx * 1.4;
        this.look.dy += dy * 1.4;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.usingTouch) return;
      if (!this.locked && !this.dragMode) {
        this.requestLock();
        return;
      }
      if (this.dragMode) {
        this._drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), button: e.button };
        if (e.button === 2) this._aimDown();
        return;
      }
      if (e.button === 0) this._down('fire');
      if (e.button === 2) this._aimDown();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.usingTouch) return;
      if (this.dragMode && this._drag) {
        const d = this._drag;
        this._drag = null;
        if (d.button === 0 && d.moved < 8 && performance.now() - d.t < 400 && this.enabled) {
          this._down('fire');
          setTimeout(() => this._up('fire'), 60);
        }
        if (e.button === 2) this._aimUp();
        return;
      }
      if (e.button === 0) this._up('fire');
      if (e.button === 2) this._aimUp();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.enabled && !this.usingTouch) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  _key(e, down) {
    let a = KEYMAP[e.code];
    if (e.key === 'm' || e.key === 'M' || e.code === 'Semicolon') a = 'map';
    if (!a) return;
    if (this.enabled && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.usingTouch = false;
    if (down) this._down(a);
    else this._up(a);
  }

  _aimDown() {
    if (this.aimToggle) {
      if (this.held.has('aim')) this._up('aim');
      else this._down('aim');
    } else this._down('aim');
  }

  _aimUp() {
    if (!this.aimToggle) this._up('aim');
  }

  _down(a) {
    if (!this.held.has(a)) this.pressed.add(a);
    this.held.add(a);
  }

  _up(a) {
    if (this.held.has(a)) this.released.add(a);
    this.held.delete(a);
  }

  // API pour les commandes tactiles
  press(a) { this._down(a); }
  release(a) { this._up(a); }
  tap(a) {
    this.pressed.add(a);
  }
  toggle(a) {
    if (this.held.has(a)) this._up(a);
    else this._down(a);
  }
  setMove(x, y, mag = 0) {
    this.move.x = x;
    this.move.y = y;
    this.move.touchMag = mag;
  }
  addLook(dx, dy, touch = true) {
    this.look.dx += dx;
    this.look.dy += dy;
    this.look.touch = touch;
  }

  down(a) { return this.held.has(a); }
  hit(a) { return this.pressed.has(a); }
  up(a) { return this.released.has(a); }

  axes() {
    let x = this.move.x, y = this.move.y;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y += 1;
    if (this.held.has('down')) y -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  requestLock() {
    if (this.usingTouch || this.dragMode) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (!this.canvas.requestPointerLock) this._lockFailed();
      else if (p && p.catch) p.catch(() => this._lockFailed());
    } catch (e) {
      this._lockFailed();
    }
  }

  _lockFailed() {
    if (this.dragMode) return;
    this.dragMode = true;
    if (this.onDragMode) this.onDragMode();
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clearHeld() {
    for (const a of this.held) this.released.add(a);
    this.held.clear();
    this.setMove(0, 0);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.look.dx = this.look.dy = 0;
    this.wheel = 0;
  }
}
