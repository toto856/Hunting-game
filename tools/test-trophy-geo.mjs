import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/animals/trophies.js'], bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const r2 = await build({ entryPoints: ['src/animals/species.js'], bundle: true, format: 'esm', write: false, platform: 'node' });
const sp = await import('data:text/javascript;base64,' + Buffer.from(r2.outputFiles[0].text).toString('base64'));
for (const s of ['cerf', 'chevreuil', 'sanglier', 'chamois', 'daim']) {
  for (const q of [0.1, 0.5, 0.95]) {
    const t = mod.makeTrophy(s, 12345, q, 0.8);
    try {
      const g = mod.buildTrophyGeometry(t, sp.SPECIES[s], 1);
      console.log(s, q, t.score, t.medal, g.attributes.position.count);
    } catch (e) { console.log('ERR', s, q, e.stack.split('\n').slice(0, 4).join(' | ')); }
  }
}
console.log('--- test scene params');
['cerf', 'chevreuil', 'sanglier', 'chamois', 'daim'].forEach((s, i) => {
  const t = mod.makeTrophy(s, 12345 + i * 7, 0.8, 0.8, false);
  try { const g = mod.buildTrophyGeometry(t, sp.SPECIES[s], 1); console.log(s, t.score, g.attributes.position.count); }
  catch (e) { console.log('ERR', s, JSON.stringify(t), e.stack.split('\n').slice(0, 6).join(' | ')); }
});
