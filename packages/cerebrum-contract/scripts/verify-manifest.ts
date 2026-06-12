/**
 * Drift check for `src/manifest.generated.ts` (Theme 13 PRD-155).
 *
 * Re-renders the manifest in-memory, normalises via oxfmt (mirroring
 * what `generate:manifest` does after writing), byte-compares against
 * the committed file, and exits non-zero on mismatch with a regenerate
 * instruction. Wired into the contract package's `build` script so a
 * stale committed manifest fails CI.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MANIFEST_OUTPUT_PATH, readContractVersion, renderManifest } from './render-manifest.js';

function oxfmt(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-verify-'));
  const path = join(dir, 'manifest.generated.ts');
  writeFileSync(path, content);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', path], { stdio: 'ignore' });
  return readFileSync(path, 'utf8');
}

const version = readContractVersion();
const expected = oxfmt(renderManifest(version));

let actual: string;
try {
  actual = readFileSync(MANIFEST_OUTPUT_PATH, 'utf8');
} catch {
  console.error(
    `[cerebrum-contract] ${MANIFEST_OUTPUT_PATH} is missing. Run \`pnpm -F @pops/cerebrum-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

if (actual !== expected) {
  console.error(
    `[cerebrum-contract] ${MANIFEST_OUTPUT_PATH} is out of date. Run \`pnpm -F @pops/cerebrum-contract generate:manifest\` and commit the result.`
  );
  process.exit(1);
}

process.stdout.write(
  `[cerebrum-contract] manifest.generated.ts is up to date (version=${version})\n`
);
