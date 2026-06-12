/**
 * Manifest type generator for `@pops/finance-contract` (Theme 13 PRD-155).
 *
 * Emits `src/manifest.generated.ts` from the contract's hand-maintained
 * surface (`types/wish-list-item.ts`, `errors.ts`, `router.ts`) plus the
 * version declared in `package.json`. The output is committed and CI's
 * `verify:manifest` job re-runs this script in-memory to detect drift.
 *
 * Imports below intentionally pull `WishListItem` and `FinanceError` so
 * that running the generator validates that the source modules still
 * expose the symbols the manifest names. A missing or renamed export
 * here makes the codegen fail loudly rather than silently emitting a
 * broken manifest.
 */
import { writeFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

import type { FinanceError } from '../src/errors.js';
import type { WishListItem } from '../src/types/wish-list-item.js';

export type SurfaceAssertion = [WishListItem, FinanceError];

const version = readContractVersion();
const rendered = renderManifest(version);
writeFileSync(MANIFEST_OUTPUT_PATH, rendered);
process.stdout.write(`[finance-contract] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
