import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/animals/trophies.js'], bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const { makeTrophy, MEDALS } = mod;
for (const sp of ['cerf', 'chevreuil', 'sanglier', 'chamois', 'daim']) {
  const lo = makeTrophy(sp, 1, 0, 0).score, hi = makeTrophy(sp, 1, 1, 1).score, leg = makeTrophy(sp, 1, 1, 1, true).score;
  const scores = [];
  const med = {};
  for (let i = 0; i < 4000; i++) {
    const q = Math.min(1, Math.max(0, (Math.random() + Math.random() + Math.random()) / 3 + (Math.random() - 0.5) * 0.25));
    const age = Math.random();
    const t = makeTrophy(sp, i * 7 + 3, q, age);
    scores.push(t.score);
    med[t.medal] = (med[t.medal] || 0) + 1;
  }
  scores.sort((a, b) => a - b);
  const pct = (p) => scores[Math.floor(p * scores.length)].toFixed(1);
  console.log(sp, 'k0', lo.toFixed(1), 'k1', hi.toFixed(1), 'leg', leg.toFixed(1), '| p10', pct(0.1), 'p50', pct(0.5), 'p90', pct(0.9), 'p99', pct(0.99), JSON.stringify(med), JSON.stringify(MEDALS[sp]));
}
