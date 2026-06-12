/**
 * Manifest type generator for `@pops/finance-contract` (Theme 13 PRD-155).
 *
 * Emits `src/manifest.generated.ts` from the contract's hand-maintained
 * surface (`types/wish-list-item.ts`, `errors.ts`, `router.ts`) plus the
 * version declared in `package.json`. The output is committed, then
 * piped through `oxfmt` so the committed file matches the workspace
 * formatting rules. CI's `verify:manifest` job re-renders + oxfmts
 * in-memory and byte-compares.
 *
 * Imports below intentionally pull `WishListItem`, `FinanceError`, and
 * `FinanceRouter` so that running the generator validates that the
 * source modules still expose the symbols the manifest names. A missing
 * or renamed export here makes the codegen fail loudly rather than
 * silently emitting a broken manifest.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

import type { FinanceError } from '../src/errors.js';
import type { FinanceRouter } from '../src/router.js';
import type { Budget } from '../src/types/budget.js';
import type { Entity } from '../src/types/entity.js';
import type { Transaction } from '../src/types/transaction.js';
import type { WishListItem } from '../src/types/wish-list-item.js';

export type SurfaceAssertion = [
  Budget,
  Entity,
  Transaction,
  WishListItem,
  FinanceError,
  FinanceRouter,
];

const version = readContractVersion();
const rendered = renderManifest(version);
writeFileSync(MANIFEST_OUTPUT_PATH, rendered);
execFileSync('pnpm', ['exec', 'oxfmt', '--write', MANIFEST_OUTPUT_PATH], {
  stdio: 'inherit',
});
process.stdout.write(`[finance-contract] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
