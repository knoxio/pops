/**
 * `diff-contract.ts` — the CI entry point.
 *
 * Usage:
 *   tsx scripts/contract/diff-contract.ts --pillar finance
 *   tsx scripts/contract/diff-contract.ts --pillar finance --json
 *   tsx scripts/contract/diff-contract.ts --all
 *
 * For each enrolled contract this script:
 *   1. Resolves the latest `contract-<pillar>@v*` git tag.
 *   2. Reads the committed `etc/*.api.json` + `etc/*.zod.json` at that
 *      revision and at the current working tree.
 *   3. Builds the current package if needed so `dist/` is populated,
 *      then re-extracts the surfaces from the current tree and checks
 *      for drift against the committed snapshots (drift = "snapshots
 *      stale", a fail).
 *   4. Diffs baseline vs current snapshots, classifies, and emits a
 *      verdict.
 *   5. If the verdict requires a major bump, also runs the CHANGELOG
 *      migration-section guard.
 *
 * Exit code 0 if all enrolled contracts pass; non-zero otherwise. The
 * JSON report is written to stdout when `--json` is passed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBaseline } from './baseline.js';
import { checkMigrationSection } from './changelog.js';
import { CONTRACTS, findContract, type ContractEntry } from './contract-list.js';
import { diffTsSurface } from './diff-ts.js';
import { diffZodSurface } from './diff-zod.js';
import { extractTsSurface, serialiseTsSurface } from './extract-ts.js';
import { extractZodSurface, serialiseZodSurface } from './extract-zod.js';
import { computeVerdict } from './verdict.js';

import type { DiffReport, Verdict } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

interface CliOptions {
  readonly pillars: readonly string[];
  readonly json: boolean;
  readonly writeSnapshots: boolean;
  readonly skipDriftCheck: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let json = false;
  let writeSnapshots = false;
  let skipDriftCheck = false;
  const pillars: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--write-snapshots') writeSnapshots = true;
    else if (arg === '--skip-drift-check') skipDriftCheck = true;
    else if (arg === '--all') {
      for (const c of CONTRACTS) pillars.push(c.pillar);
    } else if (arg === '--pillar') {
      const next = argv[i + 1];
      if (!next) throw new Error('--pillar requires a value');
      pillars.push(next);
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (pillars.length === 0) {
    for (const c of CONTRACTS) pillars.push(c.pillar);
  }
  return { pillars, json, writeSnapshots, skipDriftCheck };
}

function resolveVerdict(
  base: Verdict,
  drift: { reason: string } | undefined,
  migration: { reason: string } | undefined
): Verdict {
  if (drift) return 'fail-snapshot-stale';
  if (migration) return 'fail-migration-section-missing';
  return base;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function writeIfChanged(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const existing = safeRead(path);
    if (existing === content) return false;
  }
  writeFileSync(path, content, 'utf8');
  return true;
}

interface RunResult {
  readonly report: DiffReport;
  readonly migrationFail?: { reason: string };
  readonly snapshotDrift?: { reason: string };
}

async function runOne(contract: ContractEntry, options: CliOptions): Promise<RunResult> {
  const packageDir = resolve(REPO_ROOT, contract.packageDir);
  const apiPath = resolve(packageDir, 'etc', `${contract.pillar}-contract.api.json`);
  const zodPath = resolve(packageDir, 'etc', `${contract.pillar}-contract.zod.json`);

  const freshTs = extractTsSurface(packageDir);
  const freshZod = await extractZodSurface(packageDir);

  const freshTsSerialised = serialiseTsSurface(freshTs);
  const freshZodSerialised = serialiseZodSurface(freshZod);

  if (options.writeSnapshots) {
    writeIfChanged(apiPath, freshTsSerialised);
    writeIfChanged(zodPath, freshZodSerialised);
  }

  let snapshotDrift: RunResult['snapshotDrift'];
  if (!options.skipDriftCheck) {
    const committedTs = existsSync(apiPath) ? safeRead(apiPath) : '';
    const committedZod = existsSync(zodPath) ? safeRead(zodPath) : '';
    if (committedTs !== freshTsSerialised || committedZod !== freshZodSerialised) {
      snapshotDrift = {
        reason:
          `${contract.packageName} snapshots are stale. ` +
          `Run \`pnpm -F ${contract.packageName} extract:ts extract:zod\` and commit etc/.`,
      };
    }
  }

  const baseline = loadBaseline(contract, REPO_ROOT);

  const tsDiff = baseline
    ? diffTsSurface(baseline.tsSurface, freshTs)
    : { kind: 'none' as const, added: [], removed: [], changed: [] };
  const zodDiff = baseline
    ? diffZodSurface(baseline.zodSurface, freshZod)
    : { kind: 'none' as const, added: [], removed: [], changed: [] };

  const verdict = computeVerdict({
    baselineVersion: baseline?.version ?? null,
    currentVersion: freshTs.version,
    tsDiff,
    zodDiff,
  });

  let migrationFail: RunResult['migrationFail'];
  if (verdict.classification === 'major' && baseline) {
    const check = checkMigrationSection({
      packageDir,
      baselineVersion: baseline.version,
      currentVersion: freshTs.version,
    });
    if (!check.ok) migrationFail = { reason: check.reason };
  }

  const report: DiffReport = {
    contract: contract.packageName,
    baselineTag: baseline?.tag ?? null,
    baselineVersion: baseline?.version ?? null,
    currentVersion: freshTs.version,
    tsDiff,
    zodDiff,
    classification: verdict.classification,
    requiredVersion: verdict.requiredVersion,
    verdict: resolveVerdict(verdict.verdict, snapshotDrift, migrationFail),
    reason: snapshotDrift?.reason ?? migrationFail?.reason ?? verdict.reason,
  };

  return { report, migrationFail, snapshotDrift };
}

function isFailureVerdict(verdict: DiffReport['verdict']): boolean {
  return verdict.startsWith('fail-');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const results: RunResult[] = [];
  for (const pillar of options.pillars) {
    const contract = findContract(pillar);
    if (!contract) {
      process.stderr.write(
        `[contract-semver] no enrolled contract for pillar "${pillar}"; skipping\n`
      );
      continue;
    }
    results.push(await runOne(contract, options));
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        results.map((r) => r.report),
        null,
        2
      )}\n`
    );
  } else {
    for (const { report } of results) {
      process.stdout.write(formatReport(report));
    }
  }

  const anyFail = results.some(({ report }) => isFailureVerdict(report.verdict));
  process.exit(anyFail ? 1 : 0);
}

function formatReport(report: DiffReport): string {
  const lines: string[] = [];
  lines.push(`\n=== ${report.contract} ===`);
  lines.push(`  baseline: ${report.baselineTag ?? '(none — initial version)'}`);
  lines.push(`  current:  v${report.currentVersion}`);
  lines.push(
    `  ts:       ${report.tsDiff.kind} (+${report.tsDiff.added.length} -${report.tsDiff.removed.length} ~${report.tsDiff.changed.length})`
  );
  lines.push(
    `  zod:      ${report.zodDiff.kind} (+${report.zodDiff.added.length} -${report.zodDiff.removed.length} ~${report.zodDiff.changed.length})`
  );
  lines.push(`  verdict:  ${report.verdict}`);
  lines.push(`  reason:   ${report.reason}`);
  if (report.tsDiff.removed.length > 0) {
    lines.push(`  ts.removed: ${report.tsDiff.removed.join(', ')}`);
  }
  if (report.tsDiff.changed.length > 0) {
    lines.push(`  ts.changed: ${report.tsDiff.changed.map((c) => c.name).join(', ')}`);
  }
  if (report.zodDiff.changed.length > 0) {
    for (const c of report.zodDiff.changed) {
      lines.push(`  zod.${c.breaking ? 'breaking' : 'additive'} ${c.name}: ${c.reason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
