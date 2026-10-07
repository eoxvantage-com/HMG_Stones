import { build } from 'esbuild';

await build({
  entryPoints: ['public/hmg-blueprint3d/runtime.js'],
  outfile: 'public/hmg-blueprint3d/runtime.bundle.js',
  bundle: true,
  format: 'iife',
  target: 'es2018',
  minify: true,
  legalComments: 'none',
});
