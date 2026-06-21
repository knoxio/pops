#!/usr/bin/env tsx
/**
 * Generate `apps/pops-shell/nginx.conf` from a single source of truth.
 *
 * Theme 13 PRD-217 + PRD-232. Two render modes share the same template:
 *
 *   - **Static** (default) — reads `PILLARS` from `@pops/pillar-sdk` and
 *     `PILLAR_UPSTREAMS` below. Used at image-build time so the committed
 *     `nginx.conf` is reproducible without a live core-api. The drift
 *     test guards this output.
 *
 *   - **Dynamic** (`--dynamic`) — PRD-232, Wave 6 BE-lego. Reads the
 *     live `pillar_registry` via the SDK's `HttpDiscoveryTransport`,
 *     which currently fetches `GET /core.registry.list` (the route core
 *     mounts today; the canonical `GET /registry/pillars` is introduced
 *     in a later phase and is not live yet), and emits one
 *     `/<pillar>-api/` REST block per registered pillar.
 *     Used at boot-time inside the cluster: an init container (or a future
 *     subscription-bus watcher, PRD-163) runs the script with
 *     `--dynamic` so newly-registered external pillars (PRD-228) pick
 *     up routing without a fresh shell image.
 *
 *     Known core pillars (those in `PILLAR_UPSTREAMS`) keep their
 *     canonical docker `host:port` even when the registry advertises a
 *     different `baseUrl`; this protects the in-cluster routing from
 *     drift if a pillar registers itself with a `localhost`-shaped URL
 *     during development. Unknown pillars fall back to parsing
 *     `host:port` out of their registry `baseUrl`.
 *
 * The drift-detection test renders the static mode in-memory and
 * compares against the committed file. The dynamic mode is exercised
 * with an injected registry fetcher so the test suite never needs a
 * live core-api.
 *
 * Usage:
 *   pnpm gen:nginx                              # static, writes apps/pops-shell/nginx.conf
 *   pnpm gen:nginx:check                        # static, exits 1 on drift
 *   pnpm gen:nginx:dynamic                      # dynamic, renders from live registry
 *   tsx generate-nginx-conf.ts --dynamic --out … --registry-url=http://core-api:3001
 *
 * The event-driven `nginx -s reload` wrapper that re-runs the dynamic
 * mode on each registry subscription event (`GET /registry/subscribe`) is
 * intentionally NOT shipped here; see PRD-163 follow-up.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PILLARS, isKnownPillarId, type KnownPillarId, type PillarId } from '@pops/pillar-sdk';
import {
  HttpDiscoveryTransport,
  type DiscoveredPillar,
  type DiscoveryTransport,
} from '@pops/pillar-sdk/client';

import { parseCliArgs, type CliOptions } from './nginx-cli-args.ts';
import { assertDynamicNotCheck, runDynamic, runStatic } from './nginx-cli-main.ts';
import { NGINX_CONF_ORCHESTRATOR } from './nginx-conf-orchestrator.ts';
import { NGINX_CONF_HEAD, NGINX_CONF_REST_INTRO, NGINX_CONF_TAIL } from './nginx-conf-template.ts';
import { DEFAULT_REGISTRY_URL, resolveRegistryUrl } from './registry-url-env.ts';

/**
 * Internal port assignment for each pillar's API container. Matches every
 * `proxy_pass` in the pre-generator hand-written `nginx.conf`.
 *
 * `Record<KnownPillarId, …>` forces every new pillar added to `PILLARS`
 * (in `@pops/pillar-sdk`) to ship a port here; missing entries fail
 * typecheck.
 */
export const PILLAR_UPSTREAMS: Record<KnownPillarId, { host: string; port: number }> = {
  core: { host: 'core-api', port: 3001 },
  inventory: { host: 'inventory-api', port: 3002 },
  media: { host: 'media-api', port: 3003 },
  finance: { host: 'finance-api', port: 3004 },
  food: { host: 'food-api', port: 3005 },
  lists: { host: 'lists-api', port: 3006 },
  cerebrum: { host: 'cerebrum-api', port: 3007 },
  contacts: { host: 'contacts-api', port: 3010 },
};

/**
 * Stable ordering for the rendered `/<id>-api/` blocks. Matches the
 * order PRD-190 shipped in the hand-written conf so the generator's
 * first run produces a byte-identical (modulo header comment) file.
 */
export const PILLAR_RENDER_ORDER: readonly KnownPillarId[] = [
  'core',
  'inventory',
  'media',
  'finance',
  'food',
  'lists',
  'cerebrum',
  'contacts',
];

export { DEFAULT_REGISTRY_URL };

export interface PillarUpstream {
  readonly pillarId: PillarId;
  readonly host: string;
  readonly port: number;
}

export function assertRenderOrderCoversAllPillars(): void {
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

function nginxVarName(pillarId: PillarId): string {
  return pillarId.replace(/-/g, '_');
}

function upstreamForId(id: KnownPillarId): PillarUpstream {
  const upstream = PILLAR_UPSTREAMS[id];
  return { pillarId: id, host: upstream.host, port: upstream.port };
}

/**
 * REST surface dispatcher (`/<pillar>-api/`) for one pillar. Mirrors the
 * media block byte-for-byte: strip the `/<pillar>-api` prefix down to
 * `/` so the pillar's own router sees its natural paths, then proxy to
 * the variable-form upstream and inherit the shared proxy directives.
 */
function renderPillarRestBlockFromUpstream(upstream: PillarUpstream): string {
  const varName = nginxVarName(upstream.pillarId);
  return [
    `    location /${upstream.pillarId}-api/ {`,
    `        set $${varName}_api_upstream http://${upstream.host}:${upstream.port};`,
    `        rewrite ^/${upstream.pillarId}-api/(.*)$ /$1 break;`,
    `        proxy_pass $${varName}_api_upstream;`,
    `        include /etc/nginx/snippets/_pillar-proxy.conf;`,
    `    }`,
  ].join('\n');
}

function renderPillarRestBlock(id: KnownPillarId): string {
  return renderPillarRestBlockFromUpstream(upstreamForId(id));
}

/**
 * Pure renderer (static mode). Takes the ordered pillar list and returns
 * the full `nginx.conf` body. Exported so the drift-detection test can
 * call it without touching the filesystem.
 */
export function renderNginxConf(order: readonly KnownPillarId[] = PILLAR_RENDER_ORDER): string {
  const restBlocks = order.map(renderPillarRestBlock).join('\n\n');
  return `${NGINX_CONF_HEAD}\n${NGINX_CONF_REST_INTRO}\n${restBlocks}\n\n${NGINX_CONF_ORCHESTRATOR}\n${NGINX_CONF_TAIL}`;
}

/**
 * Pure renderer (dynamic mode). Takes an explicit list of upstreams in
 * the order they should appear in the output. Empty input is valid and
 * produces a config with zero per-pillar `/<pillar>-api/` REST blocks (the
 * monolith catch-all was removed in the 02 decommission).
 */
export function renderNginxConfFromUpstreams(upstreams: readonly PillarUpstream[]): string {
  if (upstreams.length === 0) {
    return `${NGINX_CONF_HEAD}\n${NGINX_CONF_ORCHESTRATOR}\n${NGINX_CONF_TAIL}`;
  }
  const restBlocks = upstreams.map(renderPillarRestBlockFromUpstream).join('\n\n');
  return `${NGINX_CONF_HEAD}\n${NGINX_CONF_REST_INTRO}\n${restBlocks}\n\n${NGINX_CONF_ORCHESTRATOR}\n${NGINX_CONF_TAIL}`;
}

/**
 * Map a registry entry to its `host:port` pair.
 *
 * For known pillars (those baked into `PILLAR_UPSTREAMS`) the canonical
 * in-cluster upstream wins — registering with a localhost URL during
 * development must not break docker-network routing. Unknown pillars
 * fall back to parsing the registry's `baseUrl`.
 */
export function resolveUpstreamForEntry(
  entry: Pick<DiscoveredPillar, 'pillarId' | 'baseUrl'>
): PillarUpstream {
  if (isKnownPillarId(entry.pillarId)) {
    const known = PILLAR_UPSTREAMS[entry.pillarId];
    return { pillarId: entry.pillarId, host: known.host, port: known.port };
  }
  let parsed: URL;
  try {
    parsed = new URL(entry.baseUrl);
  } catch {
    throw new Error(
      `generate-nginx-conf: pillar "${entry.pillarId}" has invalid baseUrl "${entry.baseUrl}"`
    );
  }
  if (parsed.hostname.length === 0) {
    throw new Error(
      `generate-nginx-conf: pillar "${entry.pillarId}" baseUrl "${entry.baseUrl}" has no host`
    );
  }
  const defaultPort = parsed.protocol === 'https:' ? '443' : '80';
  const portString = parsed.port.length > 0 ? parsed.port : defaultPort;
  const port = Number.parseInt(portString, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `generate-nginx-conf: pillar "${entry.pillarId}" baseUrl "${entry.baseUrl}" has invalid port`
    );
  }
  return { pillarId: entry.pillarId, host: parsed.hostname, port };
}

/**
 * Sort entries deterministically for stable rendered output. Known
 * pillars appear first in `PILLAR_RENDER_ORDER`, then any unknown ones
 * in ascending alphabetical order by pillarId.
 */
export function orderUpstreams(upstreams: readonly PillarUpstream[]): readonly PillarUpstream[] {
  const indexOf = new Map<PillarId, number>();
  PILLAR_RENDER_ORDER.forEach((id, i) => indexOf.set(id, i));
  return upstreams.toSorted((a, b) => {
    const ia = indexOf.get(a.pillarId);
    const ib = indexOf.get(b.pillarId);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.pillarId.localeCompare(b.pillarId, 'en');
  });
}

export async function renderNginxConfDynamic(
  registryUrl: string,
  transport: DiscoveryTransport = new HttpDiscoveryTransport({ registryUrl })
): Promise<string> {
  const pillars = await transport.fetchSnapshot();
  const upstreams = pillars.map(resolveUpstreamForEntry);
  const ordered = orderUpstreams(upstreams);
  return renderNginxConfFromUpstreams(ordered);
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');

function cliDefaults(): { outputPath: string; registryUrl: string } {
  return {
    outputPath: DEFAULT_OUTPUT_PATH,
    registryUrl: resolveRegistryUrl(process.env),
  };
}

export function parseCliArgsForGenerator(argv: readonly string[]): CliOptions {
  return parseCliArgs(argv, cliDefaults());
}

async function main(): Promise<void> {
  assertRenderOrderCoversAllPillars();
  const opts = parseCliArgsForGenerator(process.argv.slice(2));
  assertDynamicNotCheck(opts);
  if (opts.dynamic) {
    await runDynamic({
      outputPath: opts.outputPath,
      registryUrl: opts.registryUrl,
      render: renderNginxConfDynamic,
    });
    return;
  }
  await runStatic({
    outputPath: opts.outputPath,
    check: opts.check,
    expected: renderNginxConf(),
    pillarCount: PILLAR_RENDER_ORDER.length,
  });
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
