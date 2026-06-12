/**
 * `extract-cli.ts` — regenerates committed `.api.json` and `.zod.json`
 * snapshots for a single contract. Intended to be wired into each
 * contract package's `extract:ts` / `extract:zod` / `extract:all` npm
 * scripts so authors can rerun a single command after editing a
 * schema.
 *
 * The CI workflow does NOT run this — it runs `diff-contract.ts` which
 * compares fresh extraction against committed snapshots and fails on
 * drift. CI never mutates the repo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findContract } from './contract-list.js';
import { extractTsSurface, serialiseTsSurface } from './extract-ts.js';
import { extractZodSurface, serialiseZodSurface } from './extract-zod.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

type Kind = 'ts' | 'zod' | 'all';

interface CliOptions {
  readonly pillar: string;
  readonly kind: Kind;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let pillar: string | null = null;
  let kind: Kind = 'all';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pillar') {
      const next = argv[i + 1];
      if (!next) throw new Error('--pillar requires a value');
      pillar = next;
      i += 1;
    } else if (arg === '--kind') {
      const next = argv[i + 1];
      if (!next) throw new Error('--kind requires a value');
      if (next !== 'ts' && next !== 'zod' && next !== 'all') {
        throw new Error(`--kind must be ts|zod|all, got "${next}"`);
      }
      kind = next;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!pillar) throw new Error('--pillar is required');
  return { pillar, kind };
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const contract = findContract(options.pillar);
  if (!contract) {
    throw new Error(`no enrolled contract for pillar "${options.pillar}"`);
  }
  const packageDir = resolve(REPO_ROOT, contract.packageDir);
  const etcDir = resolve(packageDir, 'etc');

  if (options.kind === 'ts' || options.kind === 'all') {
    const tsSurface = extractTsSurface(packageDir);
    const out = resolve(etcDir, `${contract.pillar}-contract.api.json`);
    writeFile(out, serialiseTsSurface(tsSurface));
    process.stdout.write(`[extract-cli] wrote ${out}\n`);
  }
  if (options.kind === 'zod' || options.kind === 'all') {
    const zodSurface = await extractZodSurface(packageDir);
    const out = resolve(etcDir, `${contract.pillar}-contract.zod.json`);
    writeFile(out, serialiseZodSurface(zodSurface));
    process.stdout.write(`[extract-cli] wrote ${out}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
