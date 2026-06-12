/**
 * Registry of contract packages enrolled in the semver CI flow.
 *
 * Adding a contract here opts it into:
 *   - `.api.json` + `.zod.json` snapshot extraction (`extract:ts`,
 *     `extract:zod`).
 *   - `diff:contract` baseline-vs-current classification.
 *   - The CI workflow at `.github/workflows/contract-semver.yml`.
 *   - Tag-on-bump for pushes to `main`.
 *
 * PRD-154 ships `finance` only as the pilot. PRD-154 US-09 rolls the
 * scaffolding out to the remaining pillars once their contract packages
 * exist.
 */
import { PILLARS, type Pillar } from './pillar-list.js';

export interface ContractEntry {
  readonly pillar: Pillar;
  readonly packageName: string;
  readonly packageDir: string;
  readonly tagPrefix: string;
}

const ENROLLED_PILLARS: readonly Pillar[] = ['finance'];

function buildEntry(pillar: Pillar): ContractEntry {
  return {
    pillar,
    packageName: `@pops/${pillar}-contract`,
    packageDir: `packages/${pillar}-contract`,
    tagPrefix: `contract-${pillar}@v`,
  };
}

export const CONTRACTS: readonly ContractEntry[] = ENROLLED_PILLARS.map(buildEntry);

export function isEnrolled(pillar: string): pillar is Pillar {
  return (
    (PILLARS as readonly string[]).includes(pillar) && ENROLLED_PILLARS.includes(pillar as Pillar)
  );
}

export function findContract(pillar: string): ContractEntry | undefined {
  return CONTRACTS.find((c) => c.pillar === pillar);
}
