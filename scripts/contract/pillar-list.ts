import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(here, '..', '..', 'packages');

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
  return Object.freeze([...ids].toSorted());
}

export const PILLARS: readonly string[] = discoverPillars();

export type Pillar = string;
