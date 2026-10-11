// Construit le jeu en un seul fichier HTML autonome.
//   index.html          : document complet (s'ouvre directement depuis le disque)
//   dist/artifact.html  : même page sans squelette <html>/<head>/<body> (publication Claude)
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

const LICENSE = '<!-- Domaine de Hautevallée. Moteur 3D : three.js r170 — MIT License, Copyright © 2010-2024 three.js authors. -->';

function assemble(js) {
  const head = readFileSync('src/page/head.html', 'utf8');
  // Feuille principale puis feuilles propres à chaque écran (src/page/*.css, ordre alphabétique)
  const extra = readdirSync('src/page').filter((f) => f.endsWith('.css') && f !== 'style.css').sort();
  const css = [readFileSync('src/page/style.css', 'utf8'), ...extra.map((f) => readFileSync('src/page/' + f, 'utf8'))].join('\n');
  const body = readFileSync('src/page/body.html', 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const content =
    head.replace('/*__CSS__*/', css) +
    '\n' + body + '\n' + LICENSE + '\n<script>\n' + safeJs + '\n</script>\n';
  const full =
    '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n' +
    content.replace(/(<\/style>)/, '$1\n</head>\n<body>') + '</body>\n</html>\n';
  mkdirSync('dist', { recursive: true });
  writeFileSync('index.html', full);
  writeFileSync('dist/artifact.html', content);
  console.log(`[build] index.html ${(full.length / 1024).toFixed(0)} Ko`);
}

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  minify: !dev,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
};

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{
      name: 'assemble',
      setup(b) {
        b.onEnd((r) => { if (r.outputFiles && r.outputFiles[0]) assemble(r.outputFiles[0].text); });
      },
    }],
  });
  await ctx.watch();
  console.log('[build] surveillance…');
} else {
  const r = await build(options);
  assemble(r.outputFiles[0].text);
}
