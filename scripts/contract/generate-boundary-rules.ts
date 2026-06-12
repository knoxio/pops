import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAllBoundaryRules, renderRulesFile } from './boundary-rules.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

export const RULES_FILE = resolve(repoRoot, '.dependency-cruiser.rules.generated.cjs');

function main(): void {
  const rules = buildAllBoundaryRules();
  const content = renderRulesFile(rules);
  writeFileSync(RULES_FILE, content);
  process.stdout.write(`Wrote ${rules.length} boundary rules to ${RULES_FILE}\n`);
}

main();
