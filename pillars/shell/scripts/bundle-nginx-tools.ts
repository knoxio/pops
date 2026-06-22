#!/usr/bin/env tsx
/**
 * Bundle the nginx render + watcher CLIs into standalone ESM so the
 * production `nginx:alpine` image can run them with a bare node binary
 * and **no** `node_modules` (Theme 13 PRD-255 US-02/US-03).
 *
 * The generator (`generate-nginx-conf.ts`) and watcher
 * (`watch-registry-and-reload-cli.ts`) import `@pops/pillar-sdk`, which
 * in turn pulls a slice of the workspace. Rather than ship that whole
 * `node_modules` closure into the runtime image, esbuild inlines every
 * dependency into a single file per entrypoint. The final image then
 * carries only the two bundles + a node runtime — the boot entrypoint
 * runs them directly (`node render-nginx-conf.mjs --dynamic …`).
 *
 * Output lands in `dist-scripts/`:
 *   - `render-nginx-conf.mjs` ← generate-nginx-conf.ts
 *   - `watch-registry-and-reload.mjs` ← watch-registry-and-reload-cli.ts
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(SCRIPT_DIR, '..', 'dist-scripts');

const ENTRYPOINTS: ReadonlyArray<{ readonly source: string; readonly outFile: string }> = [
  { source: 'generate-nginx-conf.ts', outFile: 'render-nginx-conf.mjs' },
  { source: 'watch-registry-and-reload-cli.ts', outFile: 'watch-registry-and-reload.mjs' },
];

async function bundleAll(): Promise<void> {
  await Promise.all(
    ENTRYPOINTS.map(({ source, outFile }) =>
      build({
        entryPoints: [resolve(SCRIPT_DIR, source)],
        outfile: resolve(OUT_DIR, outFile),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        // Inline workspace + npm deps; `node:*` builtins stay external
        // (esbuild leaves them alone on the node platform). The runtime
        // image then needs no `node_modules`.
        packages: 'bundle',
        logLevel: 'info',
      })
    )
  );
}

bundleAll().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`bundle-nginx-tools failed: ${message}\n`);
  process.exit(1);
});
