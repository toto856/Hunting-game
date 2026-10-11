// Capture d'écran du jeu dans Chromium (WebGL logiciel) pour vérifier le rendu.
// node tools/shot.mjs "<query>" out.png [largeur] [hauteur] [attente ms] [script JS à évaluer]
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let pw;
try { pw = await import('playwright'); } catch (e) {
  const root = execSync('npm root -g').toString().trim();
  pw = await import(pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href);
}
const { chromium } = pw;

const [query = '', out = '.shots/shot.png', w = '1280', h = '720', wait = '4000', evalJs = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = pathToFileURL(path.resolve('index.html')).href + (query ? '?' + query : '');
const t0 = Date.now();
await page.addInitScript((q) => { window.__still = /still=/.test(q); }, query);
await page.goto(url);
try {
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
} catch (e) {
  logs.push('[timeout] jeu non prêt');
}
const tReady = Date.now() - t0;
if (evalJs) {
  try { logs.push('[eval] ' + JSON.stringify(await page.evaluate(evalJs))); } catch (e) { logs.push('[eval-error] ' + e.message); }
}
await page.waitForTimeout(+wait);
try { await page.waitForFunction(() => !window.__still || window.__game.engine.stopped, null, { timeout: 240000 }); } catch (e) { logs.push('[timeout] images fixes'); }
await page.screenshot({ path: out, timeout: 120000 });
const info = await page.evaluate(() => {
  const g = window.__game;
  if (!g || !g.engine) return null;
  const i = g.engine.renderer.info;
  return { fps: g.engine.fps.toFixed(1), frameMs: (g.engine.lastFrameMs || 0).toFixed(0), calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures };
});
console.log(JSON.stringify({ readyMs: tReady, info }));
console.log(logs.slice(-40).join('\n'));
await browser.close();
