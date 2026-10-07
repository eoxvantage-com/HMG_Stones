import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Production ships only audited runtime assets, never the local private-image sources. */
export function privateSafePublicAssets(): Plugin {
  let publicDir: string;
  return {
    name: 'hmg:private-safe-public-assets',
    apply: 'build',
    config: () => ({build: {copyPublicDir: false}}),
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle() {
      if (!publicDir) throw new Error('HMG public asset directory is required.');
      const emit = (relative: string) => {
        const source = path.join(publicDir, relative);
        const stat = fs.lstatSync(source);
        if (stat.isSymbolicLink()) throw new Error('Symlinks are not allowed in production public assets.');
        if (stat.isDirectory()) {
          for (const entry of fs.readdirSync(source)) emit(`${relative}/${entry}`);
        } else if (stat.isFile()) {
          this.emitFile({type: 'asset', fileName: relative, source: fs.readFileSync(source)});
        }
      };
      // Explicit allowlist: unknown additions require review instead of becoming public.
      emit('favicon.ico');
      emit('hmg-blueprint3d');
    },
  };
}
