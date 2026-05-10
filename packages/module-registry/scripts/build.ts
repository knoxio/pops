#!/usr/bin/env tsx
/**
 * Build the committed module registry (`packages/module-registry/src/generated.ts`).
 *
 * Pipeline:
 *
 *   1. Read the canonical module list from `known-modules.ts`.
 *   2. Resolve the install set from `POPS_APPS` / `POPS_OVERLAYS` (PRD-100
 *      env contract). Unset vars install everything; set vars intersect
 *      with `KNOWN_MODULES`.
 *   3. Validate every selected manifest via `assertModuleManifest()` plus
 *      cross-manifest invariants (duplicate ids, dangling `dependsOn`,
 *      colliding URI handler types, AI tool name collisions).
 *   4. Sort the result deterministically by `id`.
 *   5. Emit `generated.ts` as a TypeScript literal so consumers get an
 *      `as const`-narrowed `MODULES` array (and the exact module-id union
 *      via `(typeof MODULES)[number]['id']`).
 *
 * The output is committed; CI runs `pnpm registry:build` and fails if
 * `git diff --exit-code packages/module-registry/src/generated.ts` is
 * non-zero (drizzle-style guard).
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-02-build-time-registry.md`.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KNOWN_MODULE_IDS, MANIFEST_SOURCES } from './known-modules.js';
import { buildRegistrySource } from './lib.js';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(here, '..');
const OUTPUT_PATH = join(PACKAGE_ROOT, 'src', 'generated.ts');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

/**
 * Run `oxfmt --write` over the generated file as the final step so the
 * committed output is always in the project's canonical format. Without
 * this the CI guard would chase its own tail: `pnpm registry:build`
 * produces a "raw" file, `pnpm format:check` reformats it, and the diff
 * against the committed copy never settles.
 */
async function formatGeneratedFile(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'oxfmt', '--write', OUTPUT_PATH], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`oxfmt exited with code ${code ?? 'null'}`));
    });
  });
}

async function main(): Promise<void> {
  const { source, count } = buildRegistrySource(MANIFEST_SOURCES, KNOWN_MODULE_IDS, process.env);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, source, 'utf8');
  await formatGeneratedFile();
  process.stdout.write(`wrote ${count} module${count === 1 ? '' : 's'} → ${OUTPUT_PATH}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`registry:build failed: ${message}\n`);
  process.exit(1);
});
