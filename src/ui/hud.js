// Interface en jeu : boussole, munitions, posture, bruit/visibilité, souffle, messages,
// invites d'action, lunette (réticule), jumelles (identification du gibier).
import { fmt, clamp } from '../core/math.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export class HUD {
  constructor(root) {
    this.root = el('div', 'hud');
    root.appendChild(this.root);
    // Boussole
    this.compass = el('div', 'compass');
    this.strip = el('div', 'compass-strip');
    this.compass.appendChild(this.strip);
    this.compass.appendChild(el('div', 'compass-needle'));
    this.marks = el('div', 'compass-marks');
    this.compass.appendChild(this.marks);
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const a = ((d % 360) + 360) % 360;
      const label = a % 45 === 0 ? DIRS[a / 45] : '';
      html += `<span class="tick${label ? ' major' : ''}" style="left:${(d + 360) * 4}px">${label}</span>`;
    }
    this.strip.innerHTML = html;
    this.root.appendChild(this.compass);
    // Heure et météo
    this.clock = el('div', 'hud-clock');
    this.root.appendChild(this.clock);
    // Arme
    this.weapon = el('div', 'hud-weapon');
    this.root.appendChild(this.weapon);
    // Posture / bruit / visibilité / souffle
    this.status = el('div', 'hud-status');
    this.stance = el('div', 'stance');
    this.noise = el('div', 'meter noise', '<span>Bruit</span><b><i></i></b>');
    this.vis = el('div', 'meter vis', '<span>Visibilité</span><b><i></i></b>');
    this.breath = el('div', 'meter breath', '<span>Souffle</span><b><i></i></b>');
    this.status.append(this.stance, this.noise, this.vis, this.breath);
    this.root.appendChild(this.status);
    // Détection (un animal se méfie)
    this.detect = el('div', 'hud-detect', '<div class="eye"></div><i></i>');
    this.root.appendChild(this.detect);
    // Réticule de hanche
    this.cross = el('div', 'hud-cross');
    this.root.appendChild(this.cross);
    // Messages / invites
    this.feed = el('div', 'hud-feed');
    this.root.appendChild(this.feed);
    this.prompt = el('div', 'hud-prompt');
    this.root.appendChild(this.prompt);
    this.center = el('div', 'hud-center');
    this.root.appendChild(this.center);
    // Lunette
    this.scope = el('canvas', 'scope-canvas');
    this.scope.hidden = true;
    root.appendChild(this.scope);
    this.binoc = el('div', 'binoc-overlay', '<canvas class="binoc-mask"></canvas><div class="binoc-read"></div><div class="binoc-id"></div>');
    this.binoc.hidden = true;
    root.appendChild(this.binoc);
    this.vignette = el('div', 'vignette');
    root.appendChild(this.vignette);
    this._scopeKey = '';
    this._centerT = 0;
  }

  show(on) {
    this.root.hidden = !on;
    this.vignette.hidden = !on;
    if (!on) {
      this.scope.hidden = true;
      this.binoc.hidden = true;
    }
  }

  message(text, kind = '') {
    const m = el('div', 'msg ' + kind, text);
    this.feed.appendChild(m);
    setTimeout(() => m.classList.add('out'), 4200);
    setTimeout(() => m.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
  }

  big(text, sub = '', time = 2.5) {
    this.center.innerHTML = `<div class="big">${text}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.center.classList.add('on');
    this._centerT = time;
  }

  update(dt, s) {
    // s : { yaw, hour, weatherName, weapon, ammo, chambered, zoom, scoped, stance, noise, visibility, breath, holding, prompt, marks:[{yaw,label,cls}], detect }
    const deg = ((-s.yaw * 180) / Math.PI + 360) % 360;
    this.strip.style.transform = `translateX(${-(deg + 360) * 4 + 160}px)`;
    let mh = '';
    for (const m of s.marks || []) {
      let d = ((m.bearing - deg + 540) % 360) - 180;
      if (Math.abs(d) > 40) continue;
      mh += `<span class="cmark ${m.cls || ''}" style="left:${160 + d * 4}px" title="${m.label}">${m.icon || '●'}<em>${m.dist ? fmt.dist(m.dist) : ''}</em></span>`;
    }
    this.marks.innerHTML = mh;
    this.clock.innerHTML = `<b>${fmt.time(s.hour)}</b><span>${s.weatherName || ''}</span>`;
    this.weapon.innerHTML = s.weapon
      ? `<div class="wname">${s.weapon}</div><div class="wammo"><b>${s.ammo}</b><span>${s.ammoName || ''}</span></div>${s.zoomText ? `<div class="wzoom">${s.zoomText}</div>` : ''}${s.state ? `<div class="wstate">${s.state}</div>` : ''}`
      : '';
    const st = { stand: 'Debout', crouch: 'Accroupi', prone: 'Couché' }[s.stance] || '';
    this.stance.innerHTML = `<span class="st-${s.stance}"></span>${st}${s.seat ? ' · affût' : ''}${s.sticks ? ' · bâton' : ''}`;
    this.noise.querySelector('i').style.width = clamp(s.noise * 100, 0, 100) + '%';
    this.vis.querySelector('i').style.width = clamp(s.visibility * 100, 0, 100) + '%';
    this.breath.hidden = !s.scoped;
    this.breath.querySelector('i').style.width = clamp(s.breath * 100, 0, 100) + '%';
    this.breath.classList.toggle('hold', !!s.holding);
    this.cross.hidden = !!s.ads || !!s.binoc || !s.crosshair;
    this.prompt.innerHTML = s.prompt ? `<kbd>${s.promptKey || 'E'}</kbd> ${s.prompt}` : '';
    this.prompt.classList.toggle('on', !!s.prompt);
    // Détection
    if (s.detect && s.detect.level > 0.12) {
      this.detect.classList.add('on');
      this.detect.querySelector('i').style.height = clamp(s.detect.level * 100, 0, 100) + '%';
      this.detect.classList.toggle('alarm', s.detect.level > 0.95);
      const d = ((s.detect.bearing - deg + 540) % 360) - 180;
      this.detect.style.transform = `translateX(-50%) rotate(${clamp(d, -90, 90) * 0.5}deg)`;
    } else this.detect.classList.remove('on');
    if (this._centerT > 0) {
      this._centerT -= dt;
      if (this._centerT <= 0) this.center.classList.remove('on');
    }
  }

  // Dessin de la lunette (masque + réticule) à l'échelle de l'écran
  drawScope(on, opt, zoom, sway, illum) {
    this.scope.hidden = !on;
    if (!on) return;
    const c = this.scope;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.46;
    // Ombre de l'oculaire : décalage avec le tremblement
    const ox = w / 2 + sway.x * R * 0.6, oy = h / 2 + sway.y * R * 0.6;
    g.fillStyle = '#000';
    g.beginPath();
    g.rect(0, 0, w, h);
    g.arc(ox, oy, R, 0, Math.PI * 2, true);
    g.fill();
    const grad = g.createRadialGradient(ox, oy, R * 0.82, ox, oy, R * 1.01);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(ox, oy, R * 1.01, 0, Math.PI * 2);
    g.fill();
    // Réticule (second plan focal : taille constante)
    const cx = w / 2, cy = h / 2;
    g.strokeStyle = '#050505';
    g.fillStyle = '#050505';
    const thin = Math.max(1, dpr * 1.1), thick = Math.max(3, dpr * 4.5);
    const kind = opt.reticle || 'duplex';
    const line = (x0, y0, x1, y1, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    if (kind === 'r4') {
      // Réticule allemand n°4 : trois piliers épais, croisée fine
      line(cx - R, cy, cx - R * 0.16, cy, thick);
      line(cx + R * 0.16, cy, cx + R, cy, thick);
      line(cx, cy + R * 0.16, cx, cy + R, thick);
      line(cx - R * 0.16, cy, cx + R * 0.16, cy, thin);
      line(cx, cy - R, cx, cy + R * 0.16, thin);
    } else if (kind === 'mildot') {
      line(cx - R, cy, cx + R, cy, thin);
      line(cx, cy - R, cx, cy + R, thin);
      line(cx - R, cy, cx - R * 0.55, cy, thick);
      line(cx + R * 0.55, cy, cx + R, cy, thick);
      line(cx, cy + R * 0.55, cx, cy + R, thick);
      for (let i = 1; i <= 4; i++) {
        for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) {
          g.beginPath();
          g.arc(cx + dx * R * 0.1, cy + dy * R * 0.1, thin * 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else {
      // Duplex
      line(cx - R, cy, cx - R * 0.3, cy, thick);
      line(cx + R * 0.3, cy, cx + R, cy, thick);
      line(cx, cy - R, cx, cy - R * 0.3, thick);
      line(cx, cy + R * 0.3, cx, cy + R, thick);
      line(cx - R * 0.3, cy, cx + R * 0.3, cy, thin);
      line(cx, cy - R * 0.3, cx, cy + R * 0.3, thin);
    }
    if (opt.illum && illum) {
      g.fillStyle = 'rgba(255,40,30,0.95)';
      g.shadowColor = 'rgba(255,40,30,0.9)';
      g.shadowBlur = 6 * dpr;
      g.beginPath();
      g.arc(cx, cy, 1.8 * dpr, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
    g.fillStyle = 'rgba(230,225,210,0.75)';
    g.font = `${13 * dpr}px "Barlow Condensed", sans-serif`;
    g.textAlign = 'center';
    g.fillText('×' + zoom.toFixed(1).replace('.', ','), cx, cy + R * 0.92);
  }

  drawBinoc(on, info) {
    this.binoc.hidden = !on;
    if (!on) return;
    // Masque : deux oculaires qui se chevauchent (union des deux cercles)
    const c = this.binoc.querySelector('.binoc-mask');
    const w = innerWidth, h = innerHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const r = Math.min(w * 0.3, h * 0.46);
      for (const cx of [w / 2 - r * 0.62, w / 2 + r * 0.62]) {
        const gr = g.createRadialGradient(cx, h / 2, r * 0.86, cx, h / 2, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, h / 2, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    const read = this.binoc.querySelector('.binoc-read');
    const id = this.binoc.querySelector('.binoc-id');
    read.textContent = info && info.range != null ? fmt.dist(info.range) : '';
    if (info && info.animal) {
      const a = info.animal;
      id.innerHTML = `<b>${a.name}</b><span>${a.sex}</span>${a.dist ? `<span>${a.dist}</span>` : ''}${a.stars ? `<span class="stars">${a.stars}</span>` : ''}${a.fur ? `<span class="fur">${a.fur}</span>` : ''}`;
      id.classList.add('on');
    } else id.classList.remove('on');
  }
}
