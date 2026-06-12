/**
 * Manifest type generator for `@pops/inventory-contract` (Theme 13 PRD-155).
 *
 * Emits `src/manifest.generated.ts` from the contract's hand-maintained
 * surface (`types/item.ts`, `errors.ts`, `router.ts`) plus the version
 * declared in `package.json`. The output is committed, then piped
 * through `oxfmt` so the committed file matches the workspace formatting
 * rules. CI's `verify:manifest` job re-renders + oxfmts in-memory and
 * byte-compares.
 *
 * Imports below intentionally pull `Item`, `InventoryError`, and
 * `InventoryRouter` so that running the generator validates that the
 * source modules still expose the symbols the manifest names. A missing
 * or renamed export here makes the codegen fail loudly rather than
 * silently emitting a broken manifest.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

import type { InventoryError } from '../src/errors.js';
import type { InventoryRouter } from '../src/router.js';
import type { Item } from '../src/types/item.js';

export type SurfaceAssertion = [Item, InventoryError, InventoryRouter];

const version = readContractVersion();
const rendered = renderManifest(version);
writeFileSync(MANIFEST_OUTPUT_PATH, rendered);
execFileSync('pnpm', ['exec', 'oxfmt', '--write', MANIFEST_OUTPUT_PATH], {
  stdio: 'inherit',
});
process.stdout.write(`[inventory-contract] wrote ${MANIFEST_OUTPUT_PATH} (version=${version})\n`);
