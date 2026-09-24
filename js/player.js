// Entrées (clavier, souris, tactile) et déplacements du chasseur.
'use strict';

DH.Input = class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;
    this.touch = { active: false, mx: 0, my: 0, fire: false, firePressed: false, aim: false };
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.isTouch) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      }
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.enabled && this.locked) this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* navigateur sans pointer lock */ }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedKeys.has(code); }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
    this.touch.firePressed = false;
    for (const k of Object.keys(this.touch)) if (k.endsWith('Pressed')) this.touch[k] = false;
  }

  // Contrôles tactiles (joystick + zone de visée + boutons)
  setupTouch(root) {
    const t = this.touch;
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick-knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const lookZone = root.querySelector('#look-zone');
    stick.addEventListener('touchstart', (e) => {
      const tt = e.changedTouches[0];
      stickId = tt.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2;
      sy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    lookZone.addEventListener('touchstart', (e) => {
      const tt = e.changedTouches[0];
      lookId = tt.identifier;
      lx = tt.clientX;
      ly = tt.clientY;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier === stickId) {
          const dx = DH.util.clamp((tt.clientX - sx) / 50, -1, 1), dy = DH.util.clamp((tt.clientY - sy) / 50, -1, 1);
          t.mx = dx;
          t.my = dy;
          knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (tt.identifier === lookId) {
          this.mouse.dx += (tt.clientX - lx) * 2.2;
          this.mouse.dy += (tt.clientY - ly) * 2.2;
          lx = tt.clientX;
          ly = tt.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const tt of e.changedTouches) {
        if (tt.identifier === stickId) {
          stickId = null;
          t.mx = t.my = 0;
          knob.style.transform = '';
        }
        if (tt.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    root.querySelectorAll('[data-btn]').forEach((b) => {
      const name = b.dataset.btn;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (name === 'aim' || name === 'crouch') t[name] = !t[name];
        else {
          t[name] = true;
          t[name + 'Pressed'] = true;
        }
        b.classList.toggle('on', !!t[name]);
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (name !== 'aim' && name !== 'crouch') {
          t[name] = false;
          b.classList.remove('on');
        }
      });
    });
  }
};

DH.Player = class Player {
  constructor(game) {
    this.game = game;
    const sp = game.map.spawn;
    this.pos = new THREE.Vector3(sp.x, game.world.groundAt(sp.x, sp.z), sp.z);
    this.vel = new THREE.Vector3();
    this.yaw = sp.yaw;
    this.pitch = 0.08;
    this.crouchT = 0;
    this.crouching = false;
    this.onGround = true;
    this.stamina = 1;
    this.breath = 1;
    this.holding = false;
    this.bobT = 0;
    this.bob = new THREE.Vector2();
    this.stepDist = 0;
    this.recoil = { p: 0, y: 0 };
    this.sway = new THREE.Vector2();
    this.t = 0;
    this.moving = false;
    this.sprinting = false;
    this.frozenMove = false;
    this.speedNow = 0;
  }

  get eyeHeight() {
    return DH.util.lerp(1.66, 1.05, this.crouchT);
  }

  // Distance à laquelle les canards posés vous repèrent
  detectRadius() {
    const g = this.game;
    let r = 34;
    r *= this.crouching ? 0.55 : 1;
    r *= this.moving ? (this.sprinting ? 1.6 : 1.15) : 0.75;
    if (g.hasEquip('camo')) r *= 0.6;
    if (g.world.inBlind(this.pos)) r *= 0.4;
    if (g.time.night) r *= 0.6;
    if (g.weather.fog > 0.015) r *= 0.65;
    return r;
  }

  update(dt, input, opts) {
    this.t += dt;
    const w = this.game.world;
    const opt = DH.save.get().options;
    const tch = input.touch;
    const ads = opts.ads;

    // Regard
    const fovScale = opts.fov / opt.fov;
    const sens = 0.0021 * opt.sensitivity * fovScale;
    this.yaw -= input.mouse.dx * sens;
    this.pitch -= input.mouse.dy * sens * (opt.invertY ? -1 : 1);
    this.pitch = DH.util.clamp(this.pitch, -1.45, 1.5);

    // Accroupi
    if (input.pressed('KeyC') || input.pressed('ControlLeft')) this.crouching = !this.crouching;
    if (input.isTouch) this.crouching = !!tch.crouch;
    this.crouchT = DH.util.lerp(this.crouchT, this.crouching ? 1 : 0, 1 - Math.exp(-10 * dt));

    // Déplacement
    let mx = 0, mz = 0;
    if (!this.frozenMove) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
      mx += tch.mx;
      mz -= tch.my;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    this.sprinting = shift && !ads && mz > 0.3 && !this.crouching && this.stamina > 0.05;
    let speed = this.crouching ? 1.7 : this.sprinting ? 6.3 : 3.6;
    if (ads) speed *= 0.55;
    const depth = -w.heightAt(this.pos.x, this.pos.z);
    const onIce = w.isIce(this.pos.x, this.pos.z);
    const waders = this.game.hasEquip('waders');
    if (depth > 0.15 && !onIce) speed *= waders ? 0.72 : 0.5;
    if (w.snowAmount > 0.5 && !onIce) speed *= 0.9;
    this.stamina = DH.util.clamp(this.stamina + (this.sprinting ? -dt / 6 : dt / 8), 0, 1);

    const wish = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx).multiplyScalar(speed);
    const accel = this.onGround ? (onIce ? 2 : 10) : 1.5;
    this.vel.x = DH.util.lerp(this.vel.x, wish.x, 1 - Math.exp(-accel * dt));
    this.vel.z = DH.util.lerp(this.vel.z, wish.z, 1 - Math.exp(-accel * dt));

    const prev = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // Eau trop profonde / pente trop raide
    const nd = -w.heightAt(this.pos.x, this.pos.z);
    const maxDepth = waders ? 1.5 : 1.1;
    const tooDeep = nd > maxDepth && !w.isIce(this.pos.x, this.pos.z);
    const rise = w.groundAt(this.pos.x, this.pos.z) - w.groundAt(prev.x, prev.z);
    const tooSteep = rise / Math.max(0.001, Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z)) > 1.3;
    if (tooDeep || tooSteep) {
      this.pos.x = prev.x;
      this.pos.z = prev.z;
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }
    w.collide(this.pos, 0.35);

    // Saut / gravité
    const ground = w.groundAt(this.pos.x, this.pos.z);
    if ((input.pressed('Space') || tch.jumpPressed) && this.onGround && !this.crouching && !this.frozenMove) {
      this.vel.y = 4.3;
      this.onGround = false;
    }
    this.vel.y -= 14 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -3) DH.audio.footstep(w.surfaceAt(this.pos.x, this.pos.z));
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }

    // Balancement de la tête + bruits de pas
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = hs;
    this.moving = hs > 0.4;
    if (this.onGround && this.moving) {
      this.bobT += hs * dt * 2.2;
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 1.25 : this.crouching ? 0.6 : 0.8;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        DH.audio.footstep(w.surfaceAt(this.pos.x, this.pos.z));
        if (depth > 0.1 && !onIce && Math.random() < 0.5) this.game.fx.ripple(this.pos, 1.2);
      }
    }
    const bobAmp = Math.min(1, hs / 4) * (ads ? 0.3 : 1);
    this.bob.set(Math.cos(this.bobT) * 0.025 * bobAmp, Math.abs(Math.sin(this.bobT)) * 0.045 * bobAmp);

    // Respiration / tremblement (bloquer la respiration : Maj en visée)
    const wantHold = ads && shift && !this.moving;
    if (wantHold && this.breath > 0) {
      this.holding = true;
      this.breath = Math.max(0, this.breath - dt / 5);
    } else {
      this.holding = false;
      this.breath = Math.min(1, this.breath + dt / 4);
    }
    const wdef = opts.weaponDef;
    let amp = 0.0035 * (wdef ? wdef.sway : 1);
    amp *= ads ? 1 : 1.6;
    amp *= this.crouching ? 0.6 : 1;
    amp *= 1 + (1 - this.stamina) * 1.5;
    if (this.moving) amp *= 2.2;
    if (this.game.weather.id === 'blizzard' || this.game.weather.id === 'gresil') amp *= 1.3;
    if (this.holding) amp *= 0.12;
    else if (this.breath < 0.3) amp *= 2;
    const t = this.t;
    const tx = (Math.sin(t * 0.83) + Math.sin(t * 1.97 + 1) * 0.5 + Math.sin(t * 3.1) * 0.15) * amp;
    const ty = (Math.sin(t * 1.21 + 2) + Math.sin(t * 2.53) * 0.4) * amp * 0.8;
    this.sway.x = DH.util.lerp(this.sway.x, tx, 1 - Math.exp(-6 * dt));
    this.sway.y = DH.util.lerp(this.sway.y, ty, 1 - Math.exp(-6 * dt));

    // Retour du recul
    const k = 1 - Math.exp(-7 * dt);
    this.recoil.p -= this.recoil.p * k;
    this.recoil.y -= this.recoil.y * k;
  }

  kick(amount) {
    this.recoil.p += 0.055 * amount * (this.crouching ? 0.8 : 1);
    this.recoil.y += (Math.random() - 0.5) * 0.03 * amount;
  }

  applyCamera(camera) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    camera.position.set(this.pos.x, this.pos.y + this.eyeHeight + this.bob.y, this.pos.z).addScaledVector(right, this.bob.x);
    camera.rotation.set(this.pitch + this.sway.y + this.recoil.p, this.yaw + this.sway.x + this.recoil.y, 0, 'YXZ');
  }
};
