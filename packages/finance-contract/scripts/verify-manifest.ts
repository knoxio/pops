/**
 * Drift check for `src/manifest.generated.ts` (Theme 13 PRD-155).
 *
 * Re-renders the manifest in-memory, byte-compares against the committed
 * file, and exits non-zero on mismatch with a regenerate instruction.
 * Wired into the contract package's `build` script so a stale committed
 * manifest fails CI.
 */
import { readFileSync } from 'node:fs';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

const version = readContractVersion();
const expected = renderManifest(version);

let actual: string;
try {
  actual = readFileSync(MANIFEST_OUTPUT_PATH, 'utf8');
} catch {
  console.error(
    `[finance-contract] ${MANIFEST_OUTPUT_PATH} is missing. Run \`pnpm -F @pops/finance-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

if (actual !== expected) {
  console.error(
    `[finance-contract] ${MANIFEST_OUTPUT_PATH} is out of date. Run \`pnpm -F @pops/finance-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

process.stdout.write(
  `[finance-contract] manifest.generated.ts is up to date (version=${version})\n`
);
