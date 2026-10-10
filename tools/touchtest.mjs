// Test tactile (émulation iPhone) : regard au doigt à la lunette, joystick, boutons.
// node tools/touchtest.mjs "<query>" <préfixe>
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let pw;
try { pw = await import('playwright'); } catch (e) {
  const root = execSync('npm root -g').toString().trim();
  pw = await import(pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href);
}
const { chromium, devices } = pw;
const [query = 'test=hunt&q=bas', prefix = '.shots/touch'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(pathToFileURL(path.resolve('index.html')).href + '?' + query);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
const vp = page.viewportSize();
console.log('viewport', JSON.stringify(vp));
const cdp = await ctx.newCDPSession(page);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__game.engine.frame);
  await page.waitForFunction((t) => window.__game.engine.frame >= t, f0 + n, { timeout: 120000 });
};
const state = () => page.evaluate(() => {
  const c = window.__game.app.current, p = c.player, w = c.weapons;
  return { yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), scoped: w ? w.scoped : null, zoom: w && w.slot ? +w.slot.zoom.toFixed(2) : null, tstate: document.querySelector('.touch')?.dataset.state, shots: c.weapons ? c.weapons.shotCount : null };
});
await frames(2);
await page.screenshot({ path: `${prefix}-0.png` });
console.log('départ', JSON.stringify(await state()));
// 1) Épauler avec le bouton VISER
const aim = await page.evaluate(() => { const r = document.querySelector('.t-aim').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await touch('touchStart', [[aim[0], aim[1], 1]]);
await touch('touchEnd', []);
await frames(10);
console.log('après VISER', JSON.stringify(await state()));
await page.screenshot({ path: `${prefix}-1-scope.png` });
// 2) Regard au doigt (côté droit) pendant la visée
const s0 = await state();
const x0 = vp.width * 0.7, y0 = vp.height * 0.4;
await touch('touchStart', [[x0, y0, 2]]);
for (let k = 1; k <= 8; k++) { await touch('touchMove', [[x0 - k * 12, y0 + k * 4, 2]]); await frames(1); }
await touch('touchEnd', []);
await frames(2);
const s1 = await state();
console.log('regard à la lunette', JSON.stringify(s1), 'Δlacet', (s1.yaw - s0.yaw).toFixed(4), 'Δtangage', (s1.pitch - s0.pitch).toFixed(4));
// 3) Pincer pour zoomer
await touch('touchStart', [[vp.width * 0.6, vp.height * 0.5, 3], [vp.width * 0.8, vp.height * 0.5, 4]]);
for (let k = 1; k <= 6; k++) { await touch('touchMove', [[vp.width * 0.6 - k * 10, vp.height * 0.5, 3], [vp.width * 0.8 + k * 10, vp.height * 0.5, 4]]); await frames(1); }
await touch('touchEnd', []);
await frames(2);
console.log('après pincement', JSON.stringify(await state()));
// 4) Tir au bouton TIR (gauche) + glisser sur FEU
const fire2 = await page.evaluate(() => { const r = document.querySelector('.t-fire2').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; });
console.log('bouton TIR visible', fire2[2] > 0);
await touch('touchStart', [[fire2[0], fire2[1], 5]]);
await frames(2);
await touch('touchEnd', []);
await frames(6);
console.log('après TIR', JSON.stringify(await state()));
await page.screenshot({ path: `${prefix}-2-shot.png` });
// 5) Quitter la visée, joystick (avancer)
await touch('touchStart', [[aim[0], aim[1], 6]]);
await touch('touchEnd', []);
await frames(4);
const sj = await state();
await touch('touchStart', [[vp.width * 0.18, vp.height * 0.7, 7]]);
for (let k = 1; k <= 5; k++) { await touch('touchMove', [[vp.width * 0.18, vp.height * 0.7 - k * 10, 7]]); await frames(1); }
await frames(8);
await page.screenshot({ path: `${prefix}-3-walk.png` });
await touch('touchEnd', []);
const sj2 = await state();
console.log('joystick', JSON.stringify(sj), '→', JSON.stringify(sj2));
console.log(logs.filter((l) => !/GPU stall/.test(l)).slice(-20).join('\n'));
await browser.close();
