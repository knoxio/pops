import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const packagesDir = resolve(repoRoot, 'packages');
const pillarsDir = resolve(repoRoot, 'pillars');

function discoverPillars(): readonly string[] {
  const contractSuffix = '-contract';
  const ids = new Set<string>();
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const { name } = entry;
    if (!name.endsWith(contractSuffix)) continue;
    if (name.startsWith('app-')) continue;
    const id = name.slice(0, -contractSuffix.length);
    if (id.length === 0) continue;
    ids.add(id);
  }
  if (existsSync(pillarsDir)) {
    for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const contractPkg = resolve(pillarsDir, entry.name, 'contract', 'package.json');
      if (existsSync(contractPkg)) ids.add(entry.name);
    }
  }
  return Object.freeze([...ids].toSorted());
}

export const PILLARS: readonly string[] = discoverPillars();

export type Pillar = string;

/**
 * Filesystem layout for a pillar's owning directories. The boundary
 * rule generator uses this to build the per-pillar allow-list — the
 * three directories that ARE allowed to import `@pops/<pillar>-db`.
 *
 * Two layouts coexist during the pillar-by-pillar colocation move
 * (PRD-253):
 *
 *  - **legacy** — `apps/pops-<id>-api`, `packages/<id>-db`,
 *    `packages/<id>-contract`.
 *  - **colocated** — `pillars/<id>/api`, `pillars/<id>/db`,
 *    `pillars/<id>/contract`.
 *
 * Layout is detected per-pillar from disk: if `pillars/<id>/contract`
 * exists, the pillar uses the colocated layout; otherwise legacy.
 */
export interface PillarLayout {
  readonly id: string;
  readonly apiDir: string;
  readonly runtimeDir: string;
  readonly contractScriptsDir: string;
}

export function getPillarLayout(pillar: string): PillarLayout {
  const colocatedContract = resolve(pillarsDir, pillar, 'contract', 'package.json');
  if (existsSync(colocatedContract)) {
    return {
      id: pillar,
      apiDir: `pillars/${pillar}/api`,
      runtimeDir: `pillars/${pillar}/db`,
      contractScriptsDir: `pillars/${pillar}/contract/scripts`,
    };
  }
  return {
    id: pillar,
    apiDir: `apps/pops-${pillar}-api`,
    runtimeDir: `packages/${pillar}-db`,
    contractScriptsDir: `packages/${pillar}-contract/scripts`,
  };
}
