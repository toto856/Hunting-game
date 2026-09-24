// Joueur : contrôles (souris/clavier/tactile), postures, endurance, souffle, bruit, visibilité.
'use strict';
HG.Player = class Player {
  constructor(camera, canvas, world, opts) {
    const U = HG.util; this.cam = camera; this.canvas = canvas; this.world = world; this.opts = opts;
    this.pos = new THREE.Vector3(0, 0, 0); this.yaw = 0; this.pitch = 0; this.vel = new THREE.Vector3(); this.keys = {}; this.stance = 'stand'; this.onGround = true;
    this.stamina = 1; this.breath = 1; this.holding = false; this.heart = 60; this.noise = 0; this.moving = 0; this.speedNow = 0; this.locked = false; this.dragLook = false; this.touch = null; this.fixed = null; this.inWater = false; this.bob = 0; this.stepT = 0;
    this.eye = { stand: 1.65, crouch: 1.05, prone: 0.42 }; this.wantAim = false; this.aiming = 0; this.sway = new THREE.Vector2(); this.swayT = 0; this.recoil = { p: 0, y: 0 }; this.shake = 0; this.lean = 0; this.dead = false;
    this.pendingActions = []; this.mouseDown = false; this.mouseRight = false;
    this.bindInput();
  }
  bindInput() {
    const c = this.canvas; const self = this;
    document.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'INPUT') return; self.keys[e.code] = true; if (['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (!e.repeat) self.pendingActions.push({ key: e.code, shift: e.shiftKey }); });
    document.addEventListener('keyup', (e) => { self.keys[e.code] = false; });
    document.addEventListener('pointerlockchange', () => { self.locked = document.pointerLockElement === c; if (self.onLockChange) self.onLockChange(self.locked); });
    document.addEventListener('pointerlockerror', () => { self.dragLook = true; self.locked = false; if (self.onLockChange) self.onLockChange(false, true); });
    let dragging = false, lx = 0, ly = 0;
    c.addEventListener('mousedown', (e) => { if (!self.enabled) return; if (e.button === 0) { if (!self.locked && !self.dragLook) { self.requestLock(); return; } self.mouseDown = true; self.pendingActions.push({ key: 'Fire' }); } if (e.button === 2) { self.mouseRight = true; self.wantAim = !self.wantAim && !self.holdAim; if (self.holdAim) self.wantAim = true; } if (self.dragLook && e.button === 0) { dragging = true; lx = e.clientX; ly = e.clientY; } });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) { self.mouseDown = false; dragging = false; } if (e.button === 2) { self.mouseRight = false; if (self.holdAim) self.wantAim = false; } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => { if (!self.enabled) return; let dx = 0, dy = 0; if (self.locked) { dx = e.movementX; dy = e.movementY; } else if (self.dragLook && dragging) { dx = e.clientX - lx; dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; } else return; self.look(dx, dy); });
    c.addEventListener('wheel', (e) => { if (!self.enabled) return; e.preventDefault(); self.pendingActions.push({ key: e.deltaY > 0 ? 'ZoomOut' : 'ZoomIn' }); }, { passive: false });
    // Tactile
    this.touch = { move: new THREE.Vector2(), lookId: null, stickId: null, lx: 0, ly: 0, sx: 0, sy: 0 };
    const isTouch = 'ontouchstart' in window; this.isTouch = isTouch;
    if (isTouch) {
      const T = this.touch; const stick = document.getElementById('stick'), knob = document.getElementById('stick-knob'), look = document.getElementById('look-zone');
      stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; T.stickId = t.identifier; const r = stick.getBoundingClientRect(); T.sx = r.left + r.width / 2; T.sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
      look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; T.lookId = t.identifier; T.lx = t.clientX; T.ly = t.clientY; e.preventDefault(); }, { passive: false });
      document.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === T.stickId) { const dx = t.clientX - T.sx, dy = t.clientY - T.sy; const l = Math.min(1, Math.hypot(dx, dy) / 45); const a = Math.atan2(dy, dx); T.move.set(Math.cos(a) * l, Math.sin(a) * l); knob.style.transform = `translate(${Math.cos(a) * l * 35}px,${Math.sin(a) * l * 35}px)`; } if (t.identifier === T.lookId) { self.look((t.clientX - T.lx) * 2.2, (t.clientY - T.ly) * 2.2); T.lx = t.clientX; T.ly = t.clientY; } } }, { passive: false });
      document.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === T.stickId) { T.stickId = null; T.move.set(0, 0); knob.style.transform = ''; } if (t.identifier === T.lookId) T.lookId = null; } });
      document.querySelectorAll('.tbtn').forEach((b) => { const k = b.dataset.btn; b.addEventListener('touchstart', (e) => { e.preventDefault(); if (k === 'fire') { self.mouseDown = true; self.pendingActions.push({ key: 'Fire' }); } else if (k === 'aim') self.wantAim = !self.wantAim; else if (k === 'run') self.keys.ShiftLeft = true; else self.pendingActions.push({ key: { reload: 'KeyR', crouch: 'KeyC', prone: 'KeyZ', use: 'KeyE', call: 'KeyQ', binoc: 'KeyB', dog: 'KeyF', switch: 'Digit0', pause: 'Escape', map: 'KeyM', breath: 'Breath', zoom: 'ZoomIn' }[k] }); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); if (k === 'fire') self.mouseDown = false; if (k === 'run') self.keys.ShiftLeft = false; }, { passive: false }); });
    }
  }
  requestLock() { if (this.isTouch) { this.dragLook = true; return; } try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { this.dragLook = true; if (this.onLockChange) this.onLockChange(false, true); }); } catch (e) { this.dragLook = true; if (this.onLockChange) this.onLockChange(false, true); } }
  look(dx, dy) { const s = 0.0022 * this.opts.sensitivity * (this.aimZoom ? 1 / Math.sqrt(this.aimZoom) : 1); this.yaw -= dx * s; this.pitch -= dy * s * (this.opts.invertY ? -1 : 1); this.pitch = HG.util.clamp(this.pitch, -1.45, 1.45); }
  setStance(s) { if (this.fixed && s === 'prone') return; this.stance = s; }
  // Bruit émis (0..100) et visibilité (multiplicateur de distance de vue)
  computeSignals(eq) {
    const st = this.stance, mv = this.speedNow;
    let noise = st === 'prone' ? 4 : st === 'crouch' ? 8 : 12; if (mv > 0.3) noise += st === 'crouch' ? 22 : 30; if (mv > 4.5) noise += 45; if (this.inWater && mv > 0.3) noise += 25;
    const surf = this.surface; if (surf === 'leaves' && mv > 0.3) noise *= 1.35; if (surf === 'snow' && mv > 0.3) noise *= 0.8;
    this.noise = noise; this.moving = HG.util.clamp(mv / 3, 0, 1.5);
    let vis = st === 'prone' ? 0.45 : st === 'crouch' ? 0.7 : 1; if (this.fixed) vis *= 0.5; if (eq.vis) vis *= eq.vis; if (mv > 4.5) vis *= 1.4; this.visibility = vis;
  }
  update(dt, ctx) {
    const U = HG.util, W = this.world, k = this.keys; const eq = ctx.eq || {};
    if (this.dead) return;
    // déplacements
    let fx = 0, fz = 0; if (k.KeyW || k.ArrowUp) fz += 1; if (k.KeyS || k.ArrowDown) fz -= 1; if (k.KeyA || k.ArrowLeft) fx -= 1; if (k.KeyD || k.ArrowRight) fx += 1;
    if (this.touch) { fx += this.touch.move.x; fz -= this.touch.move.y; }
    const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const running = (k.ShiftLeft || k.ShiftRight) && this.stance === 'stand' && this.stamina > 0.05 && !this.aiming && fz > 0;
    let speed = this.stance === 'prone' ? 0.8 : this.stance === 'crouch' ? 1.7 : running ? 6.2 : 3.4; if (this.aiming) speed *= 0.55;
    const slope = W.normal(this.pos.x, this.pos.z).y; const uphill = 1 - U.clamp((1 - slope) * 2.2, 0, 0.6); speed *= uphill;
    if (this.inWater && !eq.waders) speed *= 0.5;
    if (this.fixed) { fx = 0; fz = 0; }
    const dirx = Math.sin(this.yaw), dirz = Math.cos(this.yaw); // avant = -z quand yaw=0
    const mx = (-dirx * fz + dirz * fx) * speed, mz = (-dirz * fz - dirx * fx) * speed;
    const wantV = new THREE.Vector3(mx, 0, mz); this.vel.x = U.lerp(this.vel.x, wantV.x, dt * 8); this.vel.z = U.lerp(this.vel.z, wantV.z, dt * 8);
    // saut / gravité
    const groundY = W.height(this.pos.x, this.pos.z); const floorY = this.fixed ? this.fixed.y : Math.max(groundY, this.inWater ? W.waterY - 0.9 : groundY);
    if ((k.Space) && this.onGround && this.stance === 'stand' && !this.fixed && this.stamina > 0.1) { this.vel.y = 4.2; this.onGround = false; this.stamina -= 0.06; k.Space = false; }
    this.vel.y -= 12 * dt; this.pos.y += this.vel.y * dt; if (this.pos.y <= floorY) { this.pos.y = floorY; this.vel.y = 0; this.onGround = true; }
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (!this.fixed) {
      const steep = W.biome === 'montagne' && W.normal(nx, nz).y < 0.42 && W.height(nx, nz) > this.pos.y + 0.3;
      const deep = W.waterDepth(nx, nz) > 1.3;
      if (W.inBounds(nx, nz, 12) && !steep && !deep) { this.pos.x = nx; this.pos.z = nz; } else { this.vel.x *= -0.2; this.vel.z *= -0.2; if (deep) ctx.hint && ctx.hint('Trop profond !'); }
      W.collide(this.pos, 0.45);
    }
    this.inWater = W.isWater(this.pos.x, this.pos.z) && !this.fixed; this.surface = W.surface(this.pos.x, this.pos.z);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    // endurance & cœur
    const stMax = eq.stamina || 1;
    if (running && this.speedNow > 3) this.stamina -= dt * 0.09 * (W.biome === 'montagne' && !eq.mountain ? 1.5 : 1); else this.stamina += dt * (this.speedNow < 0.5 ? 0.07 : 0.035); this.stamina = U.clamp(this.stamina, 0, stMax);
    const targetHeart = 60 + (1 - this.stamina / stMax) * 90 + (this.speedNow > 3 ? 40 : this.speedNow > 0.5 ? 12 : 0) + (this.holding ? 6 : 0) + (ctx.excite || 0);
    this.heart = U.lerp(this.heart, targetHeart, dt * 0.35);
    // souffle (blocage de la respiration en visée)
    this.holding = (k.KeyH || (this.touchBreath)) && this.breath > 0.02 && this.aiming > 0.5;
    if (this.holding) this.breath -= dt * 0.25; else this.breath = Math.min(1, this.breath + dt * 0.18);
    if (this.breath <= 0.02 && (k.KeyH || this.touchBreath)) { this.heart += 0.5; if (!this.gasped) { HG.audio.breathOut(); this.gasped = true; } } else if (this.breath > 0.6) this.gasped = false;
    // visée
    this.aiming = U.lerp(this.aiming, this.wantAim ? 1 : 0, dt * 9);
    // tremblement : posture, cœur, souffle, équipement
    const stab = (this.stance === 'prone' ? 0.25 * (eq.bipod || 1) : this.stance === 'crouch' ? 0.55 : 1 * (eq.sway || 1)) * (this.fixed ? 0.35 : 1);
    const heartF = 0.5 + (this.heart - 60) / 90; const breathF = this.holding && this.breath > 0.1 ? 0.25 : 1;
    const amp = 0.0022 * stab * heartF * breathF * (this.aiming > 0.5 ? 1 : 0.6) * (this.speedNow > 0.5 ? 2.5 : 1);
    this.swayT += dt * (0.9 + heartF * 0.5); this.sway.set(Math.sin(this.swayT * 1.7) * amp + Math.sin(this.swayT * 3.1) * amp * 0.3, Math.cos(this.swayT * 1.1) * amp * 0.7 + Math.sin(this.swayT * 2.7 + 1) * amp * 0.3);
    if (this.holding) this.sway.multiplyScalar(0.35);
    this.swayAmp = amp;
    // recul retour
    this.recoil.p = U.lerp(this.recoil.p, 0, dt * 6); this.recoil.y = U.lerp(this.recoil.y, 0, dt * 6); this.shake = U.lerp(this.shake, 0, dt * 5);
    // marche : balancement + pas
    if (this.speedNow > 0.4 && this.onGround) { this.bob += dt * (running ? 11 : this.stance === 'crouch' ? 6 : 8); this.stepT += dt * this.speedNow; if (this.stepT > (running ? 2.4 : 1.7)) { this.stepT = 0; HG.audio.footstep(this.inWater ? 'water' : this.surface, running ? 1.2 : this.stance === 'stand' ? 0.7 : 0.35); } } else this.bob = U.lerp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, dt * 6);
    this.computeSignals(eq);
    // caméra
    const eye = U.lerp(this.eyeNow == null ? this.eye[this.stance] : this.eyeNow, this.eye[this.stance], dt * 7); this.eyeNow = eye;
    const bobY = Math.abs(Math.sin(this.bob)) * (running ? 0.05 : 0.025) * (1 - this.aiming * 0.7), bobX = Math.sin(this.bob * 0.5) * 0.012 * (1 - this.aiming * 0.7);
    this.cam.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.pos.y + eye + bobY + (this.inWater ? -0.1 : 0), this.pos.z - Math.sin(this.yaw) * bobX);
    const sh = this.shake * 0.01;
    this.cam.rotation.set(0, 0, 0, 'YXZ'); this.cam.rotation.y = this.yaw + this.sway.x + this.recoil.y + (Math.random() - 0.5) * sh; this.cam.rotation.x = this.pitch + this.sway.y + this.recoil.p + (Math.random() - 0.5) * sh; this.cam.rotation.z = Math.sin(this.bob * 0.5) * 0.004 * (1 - this.aiming);
  }
  kick(p, y, shake) { this.recoil.p += p; this.recoil.y += y; this.pitch += p * 0.35; this.shake += shake; }
  forward(out) { out = out || new THREE.Vector3(); this.cam.getWorldDirection(out); return out; }
  consumeActions() { const a = this.pendingActions; this.pendingActions = []; return a; }
};
