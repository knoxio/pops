#!/usr/bin/env tsx
/**
 * Build a runtime-only registry snapshot for E2E install-set switching
 * (PRD-101 US-11 follow-up, issue #2595).
 *
 * The canonical `pnpm registry:build` emits a TypeScript source file at
 * `packages/module-registry/src/generated.ts` that requires `tsc` to
 * compile. That pipeline is well suited to the single-build, committed-
 * output workflow it was designed for, but the Playwright harness needs
 * to spin up two shell builds in the same `pnpm test:e2e` run with
 * different `POPS_APPS` values without mutating the committed registry.
 *
 * This script bypasses the `generated.ts → tsc` path entirely. It uses
 * the same pure pipeline pieces the registry build does
 * (`discoverManifestSources`, `ALWAYS_INSTALLED_IDS`, `resolveInstalledIds`,
 * `validateManifests`, `project`) to compute the same `MODULES`
 * projection the canonical build would produce, then emits a single
 * plain-JS module file ready to be `resolve.alias`-pointed at by Vite.
 *
 * Output shape mirrors `@pops/module-registry`'s public surface that
 * the shell actually imports (`KNOWN_MODULES`, `MODULES`, `findModule`,
 * `isModuleId`, plus `INSTALLED_MODULES` / `isInstalledModule` from the
 * PRD-218 US-01 runtime shim). Settings sub-exports are intentionally
 * not emitted — the shell does not consume them at runtime; only the
 * API does, and the API does not switch install sets per Playwright
 * project.
 *
 * Usage:
 *   tsx scripts/build-registry-snapshot.ts <output-file>
 *
 * The script reads `POPS_APPS` and `POPS_OVERLAYS` from `process.env`,
 * matching the build-time contract documented in PRD-100.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  ALWAYS_INSTALLED_IDS,
  discoverManifestSources,
} from '../../../packages/module-registry/scripts/known-modules.ts';
import {
  project,
  resolveInstalledIds,
  validateManifests,
  type SerialisableModule,
} from '../../../packages/module-registry/scripts/lib.ts';

function renderSnapshot(
  projected: readonly SerialisableModule[],
  knownIds: readonly string[],
  installedIds: readonly string[]
): string {
  const knownIdsLiteral = JSON.stringify(knownIds);
  const installedIdsLiteral = JSON.stringify(installedIds);
  const modulesLiteral = JSON.stringify(projected, null, 2);
  return `/**
 * GENERATED — E2E install-set snapshot for @pops/module-registry.
 *
 * Emitted by apps/pops-shell/scripts/build-registry-snapshot.ts. Do not
 * commit. The Playwright harness rebuilds this file before each shell
 * server boots so distinct install sets can coexist in one test run.
 */
export const KNOWN_MODULES = Object.freeze(${knownIdsLiteral});

export const MODULES = Object.freeze(${modulesLiteral});

export const INSTALLED_MODULES = Object.freeze(${installedIdsLiteral});

export function findModule(id) {
  return MODULES.find((m) => m.id === id);
}

export function isModuleId(value) {
  return MODULES.some((m) => m.id === value);
}

export function isInstalledModule(value) {
  return INSTALLED_MODULES.includes(value);
}
`;
}

async function main(): Promise<void> {
  const outputArg = process.argv[2];
  if (outputArg === undefined || outputArg.length === 0) {
    process.stderr.write('build-registry-snapshot: missing output path argument\n');
    process.exit(1);
  }
  const outputPath = resolve(outputArg);

  const manifestSources = await discoverManifestSources();
  const knownModuleIds = manifestSources.map((m) => m.id);
  validateManifests(manifestSources);
  const installedIds = resolveInstalledIds(knownModuleIds, process.env, ALWAYS_INSTALLED_IDS);
  const installed = new Set(installedIds);
  const selected = manifestSources.filter((m) => installed.has(m.id));
  const sorted = selected.toSorted((a, b) => a.id.localeCompare(b.id, 'en'));
  const projected = sorted.map(project);
  const installedIdsSorted = [...installedIds].toSorted((a, b) => a.localeCompare(b, 'en'));

  // Emit `KNOWN_MODULES` as the FULL known id list (every module the
  // monorepo can build) rather than just the install set. The shell's
  // catch-all route relies on this distinction to render
  // `NotInstalledPage` for modules that are known-but-excluded by
  // `POPS_APPS`, separate from genuine 404s. The canonical
  // `generated.ts` happens to conflate the two because its default
  // install set is "everything"; this snapshot reflects the router's
  // intended semantic for restricted install sets.
  const knownIdsSorted = [...knownModuleIds].toSorted((a, b) => a.localeCompare(b, 'en'));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    renderSnapshot(projected, knownIdsSorted, installedIdsSorted),
    'utf8'
  );
  process.stdout.write(
    `build-registry-snapshot: wrote ${projected.length} module${
      projected.length === 1 ? '' : 's'
    } → ${outputPath} (POPS_APPS=${process.env.POPS_APPS ?? '<unset>'})\n`
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`build-registry-snapshot failed: ${message}\n`);
  process.exit(1);
});
