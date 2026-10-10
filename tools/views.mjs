// Plusieurs captures du pavillon (ou d'une chasse) dans une seule session de navigateur.
// node tools/views.mjs "<query>" <préfixe> <largeur> <hauteur> '[[x,z,lacet,tangage,"nom"], ...]' [js avant captures]
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let pw;
try { pw = await import('playwright'); } catch (e) {
  const root = execSync('npm root -g').toString().trim();
  pw = await import(pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href);
}
const { chromium, devices } = pw;
const [query = '', prefix = '.shots/v', w = '1280', h = '720', viewsJson = '[]', pre = ''] = process.argv.slice(2);
const views = JSON.parse(viewsJson);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const mobile = process.env.MOBILE === '1';
const ctx = await browser.newContext(mobile
  ? { ...devices['iPhone 13'], viewport: { width: +w, height: +h }, deviceScaleFactor: 1 }
  : { viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = pathToFileURL(path.resolve('index.html')).href + (query ? '?' + query : '');
const t0 = Date.now();
await page.goto(url);
try { await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 }); } catch (e) { logs.push('[timeout] jeu non prêt'); }
console.log('prêt en', Date.now() - t0, 'ms');
if (pre) { try { logs.push('[pre] ' + JSON.stringify(await page.evaluate(pre))); } catch (e) { logs.push('[pre-error] ' + e.message); } }
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__game.engine.frame);
  await page.waitForFunction((t) => window.__game.engine.frame >= t, f0 + n, { timeout: 120000 });
};
if (!views.length) views.push([null, null, null, null, 'vue']);
for (const v of views) {
  if (!Array.isArray(v)) {
    // { js, name, wait } : action dans la page puis capture
    try { logs.push('[js] ' + JSON.stringify(await page.evaluate(v.js))); } catch (e) { logs.push('[js-error] ' + e.message); }
    if (v.wait) await page.waitForTimeout(v.wait);
    await frames(v.frames || 2);
    await page.screenshot({ path: `${prefix}-${v.name}.png`, timeout: 120000 });
    console.log(v.name);
    continue;
  }
  const [x, z, yaw, pitch, name] = v;
  if (x !== null) {
    await page.evaluate(([x, z, yaw, pitch]) => {
      const p = window.__game.app.current.player;
      p.pos.set(x, p.pos.y, z);
      p.yaw = yaw;
      p.pitch = pitch;
    }, [x, z, yaw, pitch]);
  }
  await frames(3);
  await page.screenshot({ path: `${prefix}-${name}.png`, timeout: 120000 });
  const info = await page.evaluate(() => { const i = window.__game.engine.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, ms: window.__game.engine.lastFrameMs | 0 }; });
  console.log(name, JSON.stringify(info));
}
console.log(logs.filter((l) => !/GPU stall/.test(l)).slice(-30).join('\n'));
await browser.close();
