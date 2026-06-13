#!/usr/bin/env tsx
/**
 * Generate `apps/pops-shell/nginx.conf` from a single source of truth.
 *
 * Theme 13 PRD-217. Before this script, adding a new pillar required
 * hand-editing the `location /trpc-<pillar>/ { … }` block in `nginx.conf`,
 * which left two registries (the SDK's `PILLARS` constant and the nginx
 * config) free to drift apart. The generator collapses that into one:
 * it reads `PILLARS` from `@pops/pillar-sdk`, pairs each id with its
 * upstream `host:port` from `PILLAR_UPSTREAMS` below, and renders the
 * full server block deterministically.
 *
 * Scope, intentionally narrow (PRD-217 phase 1):
 *   - Same shape as the committed hand-written conf — same `/trpc-<id>/`
 *     dispatchers, same `/trpc` fallback, same `/pillars*`, `/media/images/`,
 *     `/health`, `/docs/`, and SPA fallback blocks.
 *   - Only the canonical seven pillars from `PILLARS` (`core`, `finance`,
 *     `media`, `inventory`, `cerebrum`, `food`, `lists`).
 *   - No external/dynamic pillar registration. That's the follow-up.
 *
 * The drift-detection test (`generate-nginx-conf.test.ts`) renders the
 * config in-memory and compares against the committed file, so any
 * hand-edit to `nginx.conf` that diverges from the generator output
 * fails CI. The generator is the single source of truth.
 *
 * Usage:
 *   pnpm gen:nginx                  # writes apps/pops-shell/nginx.conf
 *   pnpm gen:nginx:check            # exits 1 if the committed file drifts
 *   tsx generate-nginx-conf.ts ...  # equivalent direct invocation
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PILLARS, type KnownPillarId } from '@pops/pillar-sdk';

import { NGINX_CONF_HEAD, NGINX_CONF_TAIL } from './nginx-conf-template.ts';

/**
 * Internal port assignment for each pillar's API container. Matches every
 * `proxy_pass` in the pre-generator hand-written `nginx.conf`.
 *
 * `Record<KnownPillarId, …>` forces every new pillar added to `PILLARS`
 * (in `@pops/pillar-sdk`) to ship a port here; missing entries fail
 * typecheck.
 */
const PILLAR_UPSTREAMS: Record<KnownPillarId, { host: string; port: number }> = {
  core: { host: 'core-api', port: 3001 },
  inventory: { host: 'inventory-api', port: 3002 },
  media: { host: 'media-api', port: 3003 },
  finance: { host: 'finance-api', port: 3004 },
  food: { host: 'food-api', port: 3005 },
  lists: { host: 'lists-api', port: 3006 },
  cerebrum: { host: 'cerebrum-api', port: 3007 },
};

/**
 * Stable ordering for the rendered `/trpc-<id>/` blocks. Matches the
 * order PRD-190 shipped in the hand-written conf so the generator's
 * first run produces a byte-identical (modulo header comment) file.
 */
const PILLAR_RENDER_ORDER: readonly KnownPillarId[] = [
  'core',
  'inventory',
  'media',
  'finance',
  'food',
  'lists',
  'cerebrum',
];

function assertRenderOrderCoversAllPillars(): void {
  const ordered = new Set<KnownPillarId>(PILLAR_RENDER_ORDER);
  const missing = PILLARS.filter((id) => !ordered.has(id));
  if (missing.length > 0) {
    throw new Error(
      `generate-nginx-conf: PILLAR_RENDER_ORDER is missing pillar(s): ${missing.join(', ')}. ` +
        `Add them to PILLAR_RENDER_ORDER (and PILLAR_UPSTREAMS) and re-run.`
    );
  }
  const extra = PILLAR_RENDER_ORDER.filter(
    (id) => !(PILLARS as readonly KnownPillarId[]).includes(id)
  );
  if (extra.length > 0) {
    throw new Error(
      `generate-nginx-conf: PILLAR_RENDER_ORDER contains unknown pillar(s): ${extra.join(', ')}.`
    );
  }
}

function renderPillarBlock(id: KnownPillarId): string {
  const upstream = PILLAR_UPSTREAMS[id];
  return [
    `    location /trpc-${id}/ {`,
    `        rewrite ^/trpc-${id}/(.*)$ /trpc/$1 break;`,
    `        set $trpc_${id}_upstream http://${upstream.host}:${upstream.port};`,
    `        proxy_pass $trpc_${id}_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
  ].join('\n');
}

/**
 * Pure renderer. Takes the ordered pillar list and returns the full
 * `nginx.conf` body. Exported so the drift-detection test can call it
 * without touching the filesystem.
 */
export function renderNginxConf(order: readonly KnownPillarId[] = PILLAR_RENDER_ORDER): string {
  const pillarBlocks = order.map(renderPillarBlock).join('\n\n');
  return `${NGINX_CONF_HEAD}\n${pillarBlocks}\n\n${NGINX_CONF_TAIL}`;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');

interface CliOptions {
  outputPath: string;
  check: boolean;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let outputPath: string = DEFAULT_OUTPUT_PATH;
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
      continue;
    }
    if (arg === '--out') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error('generate-nginx-conf: --out requires a path argument');
      }
      outputPath = resolve(next);
      i += 1;
      continue;
    }
    if (arg !== undefined && !arg.startsWith('--')) {
      outputPath = resolve(arg);
      continue;
    }
    throw new Error(`generate-nginx-conf: unknown argument "${String(arg)}"`);
  }
  return { outputPath, check };
}

async function runCheck(outputPath: string, expected: string): Promise<void> {
  let actual: string;
  try {
    actual = await readFile(outputPath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`generate-nginx-conf --check: cannot read ${outputPath}: ${message}\n`);
    process.exit(1);
    return;
  }
  if (actual !== expected) {
    process.stderr.write(
      `generate-nginx-conf --check: ${outputPath} is out of date.\n` +
        `Run \`pnpm gen:nginx\` and commit the result.\n`
    );
    process.exit(1);
    return;
  }
  process.stdout.write(`generate-nginx-conf --check: ${outputPath} is up to date.\n`);
}

async function main(): Promise<void> {
  assertRenderOrderCoversAllPillars();
  const { outputPath, check } = parseCliArgs(process.argv.slice(2));
  const expected = renderNginxConf();

  if (check) {
    await runCheck(outputPath, expected);
    return;
  }

  await writeFile(outputPath, expected, 'utf8');
  process.stdout.write(
    `generate-nginx-conf: wrote ${PILLAR_RENDER_ORDER.length} pillar block${
      PILLAR_RENDER_ORDER.length === 1 ? '' : 's'
    } → ${outputPath}\n`
  );
}

const invokedAsScript =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`generate-nginx-conf failed: ${message}\n`);
    process.exit(1);
  });
}

export { PILLAR_UPSTREAMS, PILLAR_RENDER_ORDER, assertRenderOrderCoversAllPillars };
