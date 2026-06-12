import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAllBoundaryRules, renderRulesFile } from './boundary-rules.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const RULES_FILE = resolve(repoRoot, '.dependency-cruiser.rules.generated.cjs');

function oxfmt(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'boundary-verify-'));
  const path = join(dir, 'rules.cjs');
  writeFileSync(path, content);
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', path], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return readFileSync(path, 'utf8');
}

function main(): void {
  const expected = oxfmt(renderRulesFile(buildAllBoundaryRules()));
  let actual: string;
  try {
    actual = readFileSync(RULES_FILE, 'utf8');
  } catch {
    process.stderr.write(
      `Missing ${RULES_FILE}. Run \`pnpm lint:boundaries:generate\` and commit.\n`
    );
    process.exit(1);
  }
  if (actual !== expected) {
    process.stderr.write(
      `Drift detected in ${RULES_FILE}. Run \`pnpm lint:boundaries:generate\` and commit.\n`
    );
    process.exit(1);
  }
  process.stdout.write('Boundary rules file is up to date.\n');
}

main();
