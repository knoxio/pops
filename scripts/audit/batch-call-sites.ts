/**
 * `batch-call-sites.ts` — PRD-189.
 *
 * Scans every shell + app-package source file for legacy tRPC call sites
 * (`trpc.<pillar>.<...>.useQuery|useMutation|...` plus `useUtils()`
 * derivatives) and reports them grouped by file and pillar namespace.
 *
 * Why this exists (PRD-189, historical): the shell once batched all pillar
 * calls onto a single transport, then a per-pillar dispatch that rejected a
 * batch mixing pillars. This audit enumerated the call sites that lived in
 * the same file across pillar boundaries so the team could decide which to
 * refactor, accept, or defer. The shell has since migrated off tRPC hooks
 * onto core REST; the report should now come back empty.
 *
 * The script is greppy on purpose. A full TypeScript parse would catch
 * aliasing (`const q = trpc.finance.transactions; q.list.useQuery(...)`)
 * but in this codebase the call sites are written out longhand
 * everywhere. The regex form is fast, dependency-free, deterministic,
 * and easy to audit. Both the regex extractor and the `findCallSites`
 * function are exported for the test in
 * `scripts/audit/__tests__/batch-call-sites.test.ts`.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PILLARS, type Pillar } from '../contract/pillar-list.js';

export interface CallSite {
  readonly file: string;
  readonly line: number;
  readonly pillar: Pillar;
  readonly path: string;
  readonly raw: string;
}

export interface FileReport {
  readonly file: string;
  readonly pillars: readonly Pillar[];
  readonly sites: readonly CallSite[];
  readonly crossPillar: boolean;
}

export interface AuditReport {
  readonly files: readonly FileReport[];
  readonly crossPillarFiles: readonly FileReport[];
  readonly perPillarCounts: Readonly<Record<Pillar, number>>;
  readonly totalSites: number;
}

const PILLAR_SET: ReadonlySet<Pillar> = new Set(PILLARS);

function isPillar(name: string): name is Pillar {
  return (PILLAR_SET as ReadonlySet<string>).has(name);
}

const TRPC_PATTERN = /\btrpc\.([a-zA-Z][a-zA-Z0-9_]*)((?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)/g;
const UTILS_PATTERN = /\butils\.([a-zA-Z][a-zA-Z0-9_]*)((?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)/g;

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '__snapshots__',
]);

function isSourceFile(name: string): boolean {
  return /\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name);
}

export function listSourceFiles(roots: readonly string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      const full = resolve(root, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        out.push(...listSourceFiles([full]));
      } else if (stats.isFile() && isSourceFile(entry)) {
        out.push(full);
      }
    }
  }
  return out.toSorted();
}

/**
 * Extracts tRPC call sites from a single file's text. Exported for the
 * unit test. Returns sites in source order.
 */
export function extractCallSites(filePath: string, source: string): CallSite[] {
  const sites: CallSite[] = [];
  const lineOffsets = computeLineOffsets(source);
  const matchers: readonly { pattern: RegExp; rawPrefix: string }[] = [
    { pattern: new RegExp(TRPC_PATTERN.source, 'g'), rawPrefix: 'trpc.' },
    { pattern: new RegExp(UTILS_PATTERN.source, 'g'), rawPrefix: 'utils.' },
  ];
  for (const { pattern, rawPrefix } of matchers) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(source)) !== null) {
      const namespace = m[1];
      const tail = m[2];
      if (namespace === undefined || tail === undefined) continue;
      if (!isPillar(namespace)) continue;
      const path = `${namespace}${tail}`;
      const line = offsetToLine(lineOffsets, m.index);
      sites.push({
        file: filePath,
        line,
        pillar: namespace,
        path,
        raw: `${rawPrefix}${path}`,
      });
    }
  }
  return sites.toSorted((a, b) => a.line - b.line);
}

function computeLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) offsets.push(i + 1);
  }
  return offsets;
}

function offsetToLine(offsets: readonly number[], offset: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const off = offsets[mid];
    if (off === undefined) break;
    if (off === offset) return mid + 1;
    if (off < offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

export function buildFileReport(file: string, sites: readonly CallSite[]): FileReport {
  const pillarSet = new Set<Pillar>();
  for (const s of sites) pillarSet.add(s.pillar);
  const pillars = PILLARS.filter((p) => pillarSet.has(p));
  return {
    file,
    pillars,
    sites,
    crossPillar: pillars.length > 1,
  };
}

export interface AuditOptions {
  readonly repoRoot: string;
  readonly roots: readonly string[];
}

export function runAudit(options: AuditOptions): AuditReport {
  const sourceFiles = listSourceFiles(options.roots);
  const files: FileReport[] = [];
  const perPillarCounts: Record<Pillar, number> = Object.fromEntries(
    PILLARS.map((p) => [p, 0])
  ) as Record<Pillar, number>;
  let totalSites = 0;
  for (const abs of sourceFiles) {
    const rel = relative(options.repoRoot, abs);
    const source = readFileSync(abs, 'utf8');
    const sites = extractCallSites(rel, source);
    if (sites.length === 0) continue;
    for (const s of sites) {
      perPillarCounts[s.pillar] += 1;
      totalSites += 1;
    }
    files.push(buildFileReport(rel, sites));
  }
  const sortedFiles = files.toSorted((a, b) => a.file.localeCompare(b.file));
  const crossPillarFiles = sortedFiles.filter((f) => f.crossPillar);
  return { files: sortedFiles, crossPillarFiles, perPillarCounts, totalSites };
}

export function renderInventory(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('# PRD-189: Batch call-site inventory');
  lines.push('');
  lines.push(
    '> Generated by `scripts/audit/batch-call-sites.ts`. Do not hand-edit. Regenerate with `pnpm tsx scripts/audit/batch-call-sites.ts > docs/themes/13-pillar-finale/prds/189-batch-call-site-audit/inventory.md`.'
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total tRPC call sites: **${report.totalSites}**`);
  lines.push(`- Files touching at least one pillar: **${report.files.length}**`);
  lines.push(
    `- Files mixing calls from ≥2 pillars (potential cross-pillar batch): **${report.crossPillarFiles.length}**`
  );
  lines.push('');
  lines.push('### Per-pillar call-site count');
  lines.push('');
  lines.push('| Pillar | Sites |');
  lines.push('| --- | ---: |');
  for (const pillar of PILLARS) {
    lines.push(`| ${pillar} | ${report.perPillarCounts[pillar]} |`);
  }
  lines.push('');
  lines.push('## Cross-pillar files (action required)');
  lines.push('');
  if (report.crossPillarFiles.length === 0) {
    lines.push('_None._ Every file resolves to a single pillar.');
  } else {
    lines.push('| File | Pillars | Sites | Resolution |');
    lines.push('| --- | --- | ---: | --- |');
    for (const f of report.crossPillarFiles) {
      lines.push(
        `| \`${f.file}\` | ${f.pillars.join(' + ')} | ${f.sites.length} | _TBD — refactor or document_ |`
      );
    }
  }
  lines.push('');
  lines.push('## Single-pillar files');
  lines.push('');
  const singlePillar = report.files.filter((f) => !f.crossPillar);
  lines.push(`Total: **${singlePillar.length}**.`);
  lines.push('');
  lines.push('<details><summary>Show all single-pillar files</summary>');
  lines.push('');
  lines.push('| File | Pillar | Sites |');
  lines.push('| --- | --- | ---: |');
  for (const f of singlePillar) {
    lines.push(`| \`${f.file}\` | ${f.pillars[0]} | ${f.sites.length} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push('## Detailed cross-pillar call sites');
  lines.push('');
  if (report.crossPillarFiles.length === 0) {
    lines.push('_None._');
  } else {
    for (const f of report.crossPillarFiles) {
      lines.push(`### \`${f.file}\``);
      lines.push('');
      lines.push(`Pillars: ${f.pillars.join(', ')}`);
      lines.push('');
      lines.push('| Line | Pillar | Call |');
      lines.push('| ---: | --- | --- |');
      for (const s of f.sites) {
        lines.push(`| ${s.line} | ${s.pillar} | \`${s.raw}\` |`);
      }
      lines.push('');
    }
  }
  lines.push('');
  return lines.join('\n');
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

interface CliOptions {
  readonly write: string | null;
  readonly check: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let write: string | null = null;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') {
      const next = argv[i + 1];
      if (!next) throw new Error('--write requires a path');
      write = next;
      i += 1;
    } else if (arg === '--check') {
      check = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { write, check };
}

function defaultRoots(repoRoot: string): string[] {
  const roots = [resolve(repoRoot, 'apps/pops-shell/src')];
  const packagesDir = resolve(repoRoot, 'packages');
  let entries: string[] = [];
  try {
    entries = readdirSync(packagesDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.startsWith('app-') || entry.endsWith('-db')) continue;
    const src = resolve(packagesDir, entry, 'src');
    try {
      const stats = statSync(src);
      if (stats.isDirectory()) roots.push(src);
    } catch {
      continue;
    }
  }
  return roots;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..', '..');
  const options = parseArgs(process.argv.slice(2));
  const report = runAudit({ repoRoot, roots: defaultRoots(repoRoot) });
  const rendered = renderInventory(report);
  if (options.write) {
    const out = resolve(repoRoot, options.write);
    if (options.check) {
      const existing = readFileSync(out, 'utf8');
      if (existing !== rendered) {
        process.stderr.write(
          `[batch-call-sites] inventory drift detected at ${options.write}; rerun without --check to regenerate.\n`
        );
        process.exit(1);
      }
      process.stdout.write(`[batch-call-sites] inventory up to date at ${options.write}\n`);
      return;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, rendered, 'utf8');
    process.stdout.write(
      `[batch-call-sites] wrote ${options.write} — ${report.totalSites} call sites across ${report.files.length} files (${report.crossPillarFiles.length} cross-pillar)\n`
    );
    return;
  }
  process.stdout.write(rendered);
}

if (isMain()) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  });
}
