#!/usr/bin/env node
import { runConformance } from './runner.js';

import type { ConformanceReport } from './assertions.js';
import type { ConformanceProbes } from './types.js';

type Format = 'json' | 'tap' | 'human';

type CliArgs = {
  baseUrl: string;
  coreBaseUrl?: string;
  apiKey: string;
  format: Format;
  probes?: ConformanceProbes;
};

/**
 * CLI entry point for the conformance harness.
 *
 * Usage:
 *
 * ```bash
 * pnpm --filter @pops/wire-conformance exec wire-conformance \
 *   --base-url http://my-pillar:3010 \
 *   --core-base-url http://core-api:3000 \
 *   --api-key "$POPS_INTERNAL_API_KEY" \
 *   --report-format human
 * ```
 *
 * Exit code is 0 iff every assertion passes.
 */
export async function main(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const report = await runConformance({
    baseUrl: args.baseUrl,
    coreBaseUrl: args.coreBaseUrl,
    apiKey: args.apiKey,
    ...(args.probes ? { probes: args.probes } : {}),
  });

  emit(report, args.format);
  return report.failed === 0 ? 0 : 1;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = collectFlags(argv);
  const baseUrl = flags['--base-url'];
  if (baseUrl === undefined) throw new Error('--base-url is required');
  const apiKey = flags['--api-key'] ?? process.env['POPS_INTERNAL_API_KEY'];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('--api-key is required (or set POPS_INTERNAL_API_KEY)');
  }
  const format = parseFormat(flags['--report-format'] ?? 'human');
  const args: CliArgs = { baseUrl, apiKey, format };
  if (flags['--core-base-url'] !== undefined) args.coreBaseUrl = flags['--core-base-url'];
  return args;
}

const KNOWN_FLAGS = new Set(['--base-url', '--core-base-url', '--api-key', '--report-format']);

function collectFlags(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (flag === undefined || !KNOWN_FLAGS.has(flag)) {
      throw new Error(`unknown flag: ${flag ?? '(missing)'}`);
    }
    out[flag] = argv[i + 1];
    i += 1;
  }
  return out;
}

function parseFormat(value: string | undefined): Format {
  if (value === 'json' || value === 'tap' || value === 'human') return value;
  throw new Error(`invalid --report-format: ${value ?? '(missing)'}`);
}

function emit(report: ConformanceReport, format: Format): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (format === 'tap') {
    process.stdout.write(`TAP version 13\n1..${report.total}\n`);
    report.results.forEach((r, i) => {
      const status = r.passed ? 'ok' : 'not ok';
      const note = r.message !== undefined ? ` # ${r.message.replace(/\n/g, ' ')}` : '';
      process.stdout.write(`${status} ${i + 1} ${r.id}${note}\n`);
    });
    return;
  }
  process.stdout.write(`wire-format conformance: ${report.baseUrl}\n`);
  for (const r of report.results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    process.stdout.write(
      `  [${mark}] ${r.id}${r.message !== undefined ? ` — ${r.message}` : ''}\n`
    );
  }
  process.stdout.write(`\n${report.passed}/${report.total} passed, ${report.failed} failed\n`);
}

const USAGE = `Usage: wire-conformance --base-url <url> [options]

Options:
  --base-url <url>           Pillar base URL (required)
  --core-base-url <url>      core-api URL (defaults to --base-url)
  --api-key <key>            POPS_INTERNAL_API_KEY (or via env)
  --report-format <fmt>      json | tap | human  (default: human)
  --help                     Show this help
`;

const entry = process.argv[1] ?? '';
if (entry.endsWith('cli.js') || entry.endsWith('cli.ts')) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    }
  );
}
