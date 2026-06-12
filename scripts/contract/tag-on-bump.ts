/**
 * `tag-on-bump.ts` — runs on push to `main`.
 *
 * For every enrolled contract, inspect whether the latest commit on
 * `main` changed `packages/<pillar>-contract/package.json`'s `version`
 * field. If yes and the corresponding `contract-<pillar>@v<version>`
 * tag does not yet exist, create it (annotated) and push it.
 *
 * Idempotent: rerunning on the same revision is a no-op. Tag operations
 * are idempotent; a race with a concurrent push results in a non-fatal
 * "already exists" warning.
 *
 * Usage:
 *   tsx scripts/contract/tag-on-bump.ts            # tag any bumps
 *   tsx scripts/contract/tag-on-bump.ts --dry-run  # report intent only
 *   tsx scripts/contract/tag-on-bump.ts --rev HEAD # explicit rev
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRACTS, type ContractEntry } from './contract-list.js';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(HERE, '..', '..');

interface CliOptions {
  readonly dryRun: boolean;
  readonly rev: string;
  readonly push: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let dryRun = false;
  let rev = 'HEAD';
  let push = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--no-push') push = false;
    else if (arg === '--rev') {
      const next = argv[i + 1];
      if (!next) throw new Error('--rev requires a value');
      rev = next;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { dryRun, rev, push };
}

function git(args: readonly string[], opts: { allowFailure?: boolean } = {}): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    if (opts.allowFailure) return '';
    throw err;
  }
}

function readVersionAt(contract: ContractEntry, rev: string): string | null {
  const path = `${contract.packageDir}/package.json`;
  const raw = git(['show', `${rev}:${path}`], { allowFailure: true });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function readCurrentVersion(contract: ContractEntry): string {
  const path = resolve(REPO_ROOT, contract.packageDir, 'package.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
  if (!parsed.version) {
    throw new Error(`${contract.packageName} has no version field in package.json`);
  }
  return parsed.version;
}

function tagExists(tag: string): boolean {
  const local = git(['tag', '--list', tag], { allowFailure: true });
  if (local) return true;
  const remote = git(['ls-remote', '--tags', 'origin', tag], { allowFailure: true });
  return remote.length > 0;
}

interface TagAction {
  readonly contract: ContractEntry;
  readonly tag: string;
  readonly previousVersion: string | null;
  readonly currentVersion: string;
  readonly action: 'created' | 'skipped-exists' | 'skipped-no-bump' | 'dry-run';
}

export function planTagActions(rev: string): TagAction[] {
  const out: TagAction[] = [];
  for (const contract of CONTRACTS) {
    const currentVersion = readCurrentVersion(contract);
    const parentRev = `${rev}^`;
    const previousVersion = readVersionAt(contract, parentRev);
    const tag = `${contract.tagPrefix}${currentVersion}`;

    if (previousVersion === currentVersion) {
      out.push({ contract, tag, previousVersion, currentVersion, action: 'skipped-no-bump' });
      continue;
    }
    if (tagExists(tag)) {
      out.push({ contract, tag, previousVersion, currentVersion, action: 'skipped-exists' });
      continue;
    }
    out.push({ contract, tag, previousVersion, currentVersion, action: 'created' });
  }
  return out;
}

function applyAction(action: TagAction, options: CliOptions): TagAction {
  if (action.action !== 'created') return action;
  if (options.dryRun) {
    return { ...action, action: 'dry-run' };
  }
  const message = `${action.contract.packageName} v${action.currentVersion}`;
  git(['tag', '-a', action.tag, '-m', message, options.rev]);
  if (options.push) {
    git(['push', 'origin', action.tag]);
  }
  return action;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const plan = planTagActions(options.rev);

  for (const action of plan) {
    const applied = applyAction(action, options);
    process.stdout.write(
      `[tag-on-bump] ${applied.contract.packageName}: ${applied.action} ` +
        `(prev=${applied.previousVersion ?? 'n/a'} → cur=${applied.currentVersion}) ` +
        `tag=${applied.tag}\n`
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
