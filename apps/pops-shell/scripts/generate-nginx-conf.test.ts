import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PILLARS } from '@pops/pillar-sdk';

import {
  DEFAULT_REGISTRY_URL,
  PILLAR_RENDER_ORDER,
  PILLAR_UPSTREAMS,
  assertRenderOrderCoversAllPillars,
  orderUpstreams,
  parseCliArgsForGenerator,
  renderNginxConf,
  renderNginxConfDynamic,
  renderNginxConfFromUpstreams,
  resolveUpstreamForEntry,
  type PillarUpstream,
} from './generate-nginx-conf.ts';
import {
  parseRegistryListResponse,
  type RegistryFetcher,
  type RegistryListEntry,
  type RegistryListResponse,
} from './nginx-registry-client.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COMMITTED_CONF_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');

function makeFetcher(response: RegistryListResponse): RegistryFetcher {
  return async () => response;
}

describe('generate-nginx-conf', () => {
  describe('drift detection', () => {
    it('committed apps/pops-shell/nginx.conf matches the generator output', async () => {
      const expected = renderNginxConf();
      const actual = await readFile(COMMITTED_CONF_PATH, 'utf8');
      expect(actual).toBe(expected);
    });
  });

  describe('pillar coverage', () => {
    it('PILLAR_UPSTREAMS has an entry for every PILLARS id', () => {
      for (const id of PILLARS) {
        expect(PILLAR_UPSTREAMS[id]).toBeDefined();
      }
    });

    it('PILLAR_RENDER_ORDER covers every PILLARS id with no extras', () => {
      expect(() => assertRenderOrderCoversAllPillars()).not.toThrow();
      expect(new Set(PILLAR_RENDER_ORDER)).toEqual(new Set(PILLARS));
      expect(PILLAR_RENDER_ORDER).toHaveLength(PILLARS.length);
    });

    it('every pillar gets a host:port pair with a non-empty host and a positive port', () => {
      for (const id of PILLARS) {
        const upstream = PILLAR_UPSTREAMS[id];
        expect(upstream.host.length).toBeGreaterThan(0);
        expect(Number.isInteger(upstream.port)).toBe(true);
        expect(upstream.port).toBeGreaterThan(0);
      }
    });

    it('per-pillar ports are unique', () => {
      const ports = PILLARS.map((id) => PILLAR_UPSTREAMS[id].port);
      expect(new Set(ports).size).toBe(ports.length);
    });
  });

  describe('rendered output structure', () => {
    const rendered = renderNginxConf();

    it('emits one /trpc-<id>/ location block per pillar', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`location /trpc-${id}/ {`);
      }
    });

    it('each pillar block rewrites /trpc-<id>/ to /trpc/', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`rewrite ^/trpc-${id}/(.*)$ /trpc/$1 break;`);
      }
    });

    it('each pillar block proxies to the variable-form upstream from PILLAR_UPSTREAMS', () => {
      for (const id of PILLARS) {
        const { host, port } = PILLAR_UPSTREAMS[id];
        expect(rendered).toContain(`set $trpc_${id}_upstream http://${host}:${port};`);
        expect(rendered).toContain(`proxy_pass $trpc_${id}_upstream;`);
      }
    });

    it('each pillar block includes the shared _pillar-proxy.conf partial', () => {
      const perPillarIncludes = rendered.match(
        /proxy_pass \$trpc_\w+_upstream;\n\s*include \/etc\/nginx\/snippets\/_pillar-proxy\.conf;/g
      );
      expect(perPillarIncludes).not.toBeNull();
      expect(perPillarIncludes ?? []).toHaveLength(PILLARS.length);
    });

    it('emits one /<id>-api/ REST block per pillar', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`location /${id}-api/ {`);
      }
    });

    it('each REST block strips the /<id>-api prefix down to /', () => {
      for (const id of PILLARS) {
        expect(rendered).toContain(`rewrite ^/${id}-api/(.*)$ /$1 break;`);
      }
    });

    it('each REST block proxies to the same PILLAR_UPSTREAMS host:port as its tRPC block', () => {
      for (const id of PILLARS) {
        const { host, port } = PILLAR_UPSTREAMS[id];
        expect(rendered).toContain(`set $${id}_api_upstream http://${host}:${port};`);
        expect(rendered).toContain(`proxy_pass $${id}_api_upstream;`);
      }
    });

    it('each REST block includes the shared _pillar-proxy.conf partial (mirrors media)', () => {
      // Known pillar ids carry no hyphens, so their nginx var name == the id.
      const pillarVarAlternation = PILLAR_RENDER_ORDER.map((id) => id.replace(/-/g, '_')).join('|');
      const perPillarRestIncludes = rendered.match(
        new RegExp(
          `proxy_pass \\$(?:${pillarVarAlternation})_api_upstream;\\n\\s*include /etc/nginx/snippets/_pillar-proxy\\.conf;`,
          'g'
        )
      );
      expect(perPillarRestIncludes).not.toBeNull();
      expect(perPillarRestIncludes ?? []).toHaveLength(PILLARS.length);
    });

    it('renders REST blocks in PILLAR_RENDER_ORDER', () => {
      const positions = PILLAR_RENDER_ORDER.map((id) => rendered.indexOf(`location /${id}-api/ {`));
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
        expect(positions[i]!).toBeGreaterThan(-1);
      }
    });

    it('renders every REST block after its matching tRPC block (REST section follows dispatchers)', () => {
      for (const id of PILLARS) {
        const trpcIdx = rendered.indexOf(`location /trpc-${id}/ {`);
        const restIdx = rendered.indexOf(`location /${id}-api/ {`);
        expect(trpcIdx).toBeGreaterThan(-1);
        expect(restIdx).toBeGreaterThan(trpcIdx);
      }
    });

    it('routes /core-api specifically to the core pillar on :3001', () => {
      const { host, port } = PILLAR_UPSTREAMS.core;
      expect(host).toBe('core-api');
      expect(port).toBe(3001);
      expect(rendered).toContain('location /core-api/ {');
      expect(rendered).toContain('set $core_api_upstream http://core-api:3001;');
    });

    it('routes the core /registry/subscribe SSE stream to the core pillar with buffering off', () => {
      expect(rendered).toContain('location ~ ^/registry/subscribe/?$ {');
      expect(rendered).toContain('set $registry_subscribe_upstream http://core-api:3001;');
      expect(rendered).toMatch(
        /location ~ \^\/registry\/subscribe\/\?\$ \{[\s\S]*?proxy_buffering off;/
      );
    });

    it('keeps /pillars on core-api and moves /pillars/health onto core-api too', () => {
      expect(rendered).toMatch(
        /location ~ \^\/pillars\/\?\$ \{[\s\S]*?set \$pillars_upstream http:\/\/core-api:3001;/
      );
      expect(rendered).toMatch(
        /location ~ \^\/pillars\/health\/\?\$ \{[\s\S]*?set \$pillars_health_upstream http:\/\/core-api:3001;/
      );
    });

    it('no longer renders the legacy /trpc → pops-api catch-all (02 decommission)', () => {
      expect(rendered).not.toContain('location /trpc {');
      expect(rendered).not.toMatch(/proxy_pass http:\/\/pops-api:3000/);
    });

    it('routes the relocated raw routes to their new pillars (02 R1/R2)', () => {
      expect(rendered).toMatch(
        /location \/webhooks\/up \{[\s\S]*?set \$up_webhook_upstream http:\/\/finance-api:3004;/
      );
      expect(rendered).toMatch(
        /location ~ \^\/\(api\/inventory\|inventory\/documents\)\/ \{[\s\S]*?set \$inventory_upstream http:\/\/inventory-api:3002;/
      );
    });

    it('keeps the /pillars and /pillars/health registry proxies', () => {
      expect(rendered).toContain('location ~ ^/pillars/?$ {');
      expect(rendered).toContain('location ~ ^/pillars/health/?$ {');
    });

    it('keeps /media/images/, /health, /docs/, and the SPA fallback', () => {
      expect(rendered).toContain('location /media/images/ {');
      expect(rendered).toContain('location /health {');
      expect(rendered).toContain('location /docs/ {');
      expect(rendered).toMatch(/location \/ \{[\s\S]*?try_files \$uri \$uri\/ \/index\.html;/);
    });

    it('declares the docker DNS resolver so variable-form proxy_pass works', () => {
      expect(rendered).toContain('resolver 127.0.0.11');
    });

    it('emits the non-pillar /orchestrator-api/ block to pops-orchestrator:3009', () => {
      expect(rendered).toContain('location /orchestrator-api/ {');
      expect(rendered).toContain('rewrite ^/orchestrator-api/(.*)$ /$1 break;');
      expect(rendered).toContain('set $orchestrator_api_upstream http://pops-orchestrator:3009;');
      expect(rendered).toContain('proxy_pass $orchestrator_api_upstream;');
    });

    it('emits exactly one /orchestrator-api/ block (not per-pillar)', () => {
      const matches = rendered.match(/location \/orchestrator-api\/ \{/g);
      expect(matches).toHaveLength(1);
    });

    it('keeps the orchestrator out of PILLAR_UPSTREAMS (it is not a pillar)', () => {
      expect(PILLARS).not.toContain('orchestrator');
      expect(Object.keys(PILLAR_UPSTREAMS)).not.toContain('orchestrator');
    });

    it('renders the orchestrator block after the pillar REST blocks and before the relocated raw routes', () => {
      const lastRestIdx = Math.max(
        ...PILLAR_RENDER_ORDER.map((id) => rendered.indexOf(`location /${id}-api/ {`))
      );
      const orchestratorIdx = rendered.indexOf('location /orchestrator-api/ {');
      const webhookIdx = rendered.indexOf('location /webhooks/up {');
      expect(orchestratorIdx).toBeGreaterThan(lastRestIdx);
      expect(webhookIdx).toBeGreaterThan(orchestratorIdx);
    });

    it('renders pillar blocks in PILLAR_RENDER_ORDER', () => {
      const positions = PILLAR_RENDER_ORDER.map((id) => ({
        id,
        index: rendered.indexOf(`location /trpc-${id}/ {`),
      }));
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]!.index).toBeGreaterThan(positions[i - 1]!.index);
        expect(positions[i]!.index).toBeGreaterThan(-1);
      }
    });
  });

  describe('determinism', () => {
    it('renderNginxConf() is pure — two calls produce identical output', () => {
      expect(renderNginxConf()).toBe(renderNginxConf());
    });

    it('reordering PILLAR_RENDER_ORDER changes the byte output (proves order is load-bearing)', () => {
      const canonical = renderNginxConf();
      const reversed = renderNginxConf(PILLAR_RENDER_ORDER.toReversed());
      expect(reversed).not.toBe(canonical);
      for (const id of PILLARS) {
        expect(reversed).toContain(`location /trpc-${id}/ {`);
      }
    });
  });

  describe('assertRenderOrderCoversAllPillars (defensive)', () => {
    it('does not throw for the canonical order', () => {
      expect(() => assertRenderOrderCoversAllPillars()).not.toThrow();
    });
  });

  describe('parseRegistryListResponse (PRD-232)', () => {
    it('accepts a minimal well-formed response and drops unrelated fields', () => {
      const parsed = parseRegistryListResponse({
        pillars: [{ pillarId: 'finance', baseUrl: 'http://finance-api:3004', extra: 'ignored' }],
        fetchedAt: '2026-06-13T00:00:00Z',
      });
      expect(parsed.pillars).toHaveLength(1);
      expect(parsed.pillars[0]).toEqual({
        pillarId: 'finance',
        baseUrl: 'http://finance-api:3004',
      });
    });

    it('accepts an empty pillars array (empty registry)', () => {
      const parsed = parseRegistryListResponse({ pillars: [] });
      expect(parsed.pillars).toEqual([]);
    });

    it('rejects payloads that are not objects', () => {
      expect(() => parseRegistryListResponse(null)).toThrow(/not an object/);
      expect(() => parseRegistryListResponse('nope')).toThrow(/not an object/);
    });

    it('rejects payloads missing the pillars array', () => {
      expect(() => parseRegistryListResponse({})).toThrow(/missing `pillars`/);
      expect(() => parseRegistryListResponse({ pillars: 'not-an-array' })).toThrow(
        /missing `pillars`/
      );
    });

    it('rejects entries with missing or empty pillarId / baseUrl', () => {
      expect(() => parseRegistryListResponse({ pillars: [{ baseUrl: 'http://x:1' }] })).toThrow(
        /pillarId/
      );
      expect(() =>
        parseRegistryListResponse({ pillars: [{ pillarId: '', baseUrl: 'http://x:1' }] })
      ).toThrow(/pillarId/);
      expect(() => parseRegistryListResponse({ pillars: [{ pillarId: 'x' }] })).toThrow(/baseUrl/);
      expect(() =>
        parseRegistryListResponse({ pillars: [{ pillarId: 'x', baseUrl: '' }] })
      ).toThrow(/baseUrl/);
    });
  });

  describe('resolveUpstreamForEntry (PRD-232)', () => {
    it('returns the canonical PILLAR_UPSTREAMS host:port for known pillars regardless of baseUrl', () => {
      const entry: RegistryListEntry = {
        pillarId: 'finance',
        baseUrl: 'http://localhost:9999',
      };
      const upstream = resolveUpstreamForEntry(entry);
      expect(upstream).toEqual({
        pillarId: 'finance',
        host: PILLAR_UPSTREAMS.finance.host,
        port: PILLAR_UPSTREAMS.finance.port,
      });
    });

    it('parses host:port from baseUrl for unknown pillars', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-fitness',
        baseUrl: 'http://fitness-api:4200',
      });
      expect(upstream).toEqual({ pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 });
    });

    it('defaults port 80 for plain http baseUrl without explicit port', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-x',
        baseUrl: 'http://x-api',
      });
      expect(upstream.port).toBe(80);
    });

    it('defaults port 443 for https baseUrl without explicit port', () => {
      const upstream = resolveUpstreamForEntry({
        pillarId: 'plugin-y',
        baseUrl: 'https://y-api',
      });
      expect(upstream.port).toBe(443);
    });

    it('throws for malformed baseUrl on unknown pillars', () => {
      expect(() =>
        resolveUpstreamForEntry({ pillarId: 'plugin-bad', baseUrl: 'not a url' })
      ).toThrow(/invalid baseUrl/);
    });
  });

  describe('orderUpstreams (PRD-232)', () => {
    it('places known pillars first in PILLAR_RENDER_ORDER, then unknowns alphabetically', () => {
      const upstreams: PillarUpstream[] = [
        { pillarId: 'plugin-z', host: 'z', port: 1 },
        { pillarId: 'finance', host: 'finance-api', port: 3004 },
        { pillarId: 'plugin-a', host: 'a', port: 1 },
        { pillarId: 'core', host: 'core-api', port: 3001 },
      ];
      const ordered = orderUpstreams(upstreams).map((u) => u.pillarId);
      expect(ordered).toEqual(['core', 'finance', 'plugin-a', 'plugin-z']);
    });
  });

  describe('renderNginxConfFromUpstreams (PRD-232)', () => {
    it('renders zero pillar blocks for an empty registry but keeps head + tail', () => {
      const rendered = renderNginxConfFromUpstreams([]);
      expect(rendered).not.toMatch(/location \/trpc-[a-z]/);
      expect(rendered).toContain('resolver 127.0.0.11');
      expect(rendered).not.toContain('location /trpc {');
      expect(rendered).toContain('location ~ ^/pillars/?$ {');
      expect(rendered).toContain('location /docs/ {');
      expect(rendered).toMatch(/location \/ \{[\s\S]*?try_files \$uri \$uri\/ \/index\.html;/);
    });

    it('handles hyphenated pillar ids by sanitising the nginx variable name', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      expect(rendered).toContain('location /trpc-plugin-fitness/ {');
      expect(rendered).toContain('set $trpc_plugin_fitness_upstream http://fitness-api:4200;');
      expect(rendered).toContain('proxy_pass $trpc_plugin_fitness_upstream;');
    });

    it('emits a /<id>-api/ REST block alongside the tRPC block for each upstream', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      expect(rendered).toContain('location /plugin-fitness-api/ {');
      expect(rendered).toContain('rewrite ^/plugin-fitness-api/(.*)$ /$1 break;');
      expect(rendered).toContain('set $plugin_fitness_api_upstream http://fitness-api:4200;');
      expect(rendered).toContain('proxy_pass $plugin_fitness_api_upstream;');
    });

    it('emits zero pillar REST blocks for an empty registry but keeps the orchestrator block', () => {
      const rendered = renderNginxConfFromUpstreams([]);
      expect(rendered).not.toMatch(
        /location \/(?:core|inventory|media|finance|food|lists|cerebrum)-api\/ \{/
      );
      expect(rendered).toContain('location /orchestrator-api/ {');
    });

    it('emits the orchestrator block alongside pillar blocks for a non-empty registry', () => {
      const rendered = renderNginxConfFromUpstreams([
        { pillarId: 'plugin-fitness', host: 'fitness-api', port: 4200 },
      ]);
      const matches = rendered.match(/location \/orchestrator-api\/ \{/g);
      expect(matches).toHaveLength(1);
      expect(rendered).toContain('set $orchestrator_api_upstream http://pops-orchestrator:3009;');
    });
  });

  describe('renderNginxConfDynamic (PRD-232)', () => {
    it('emits a config that mirrors the static output when the registry advertises every known pillar', async () => {
      const fetcher = makeFetcher({
        pillars: PILLARS.map((id) => ({
          pillarId: id,
          baseUrl: `http://${PILLAR_UPSTREAMS[id].host}:${PILLAR_UPSTREAMS[id].port}`,
        })),
      });
      const rendered = await renderNginxConfDynamic('http://core-api:3001', fetcher);
      expect(rendered).toBe(renderNginxConf());
    });

    it('emits zero pillar blocks for an empty registry (snapshot)', async () => {
      const rendered = await renderNginxConfDynamic(
        'http://core-api:3001',
        makeFetcher({ pillars: [] })
      );
      for (const id of PILLARS) {
        expect(rendered).not.toContain(`location /trpc-${id}/ {`);
      }
      expect(rendered).not.toContain('location /trpc {');
    });

    it('renders a single external pillar with parsed host:port', async () => {
      const fetcher = makeFetcher({
        pillars: [{ pillarId: 'plugin-fitness', baseUrl: 'http://fitness-api:4242' }],
      });
      const rendered = await renderNginxConfDynamic('http://core-api:3001', fetcher);
      expect(rendered).toContain('location /trpc-plugin-fitness/ {');
      expect(rendered).toContain('set $trpc_plugin_fitness_upstream http://fitness-api:4242;');
      expect(rendered).not.toContain('location /trpc-finance/ {');
    });

    it('mixes known + external pillars and orders known first', async () => {
      const fetcher = makeFetcher({
        pillars: [
          { pillarId: 'plugin-fitness', baseUrl: 'http://fitness-api:4242' },
          { pillarId: 'finance', baseUrl: 'http://localhost:9999' },
        ],
      });
      const rendered = await renderNginxConfDynamic('http://core-api:3001', fetcher);
      const financeIdx = rendered.indexOf('location /trpc-finance/ {');
      const fitnessIdx = rendered.indexOf('location /trpc-plugin-fitness/ {');
      expect(financeIdx).toBeGreaterThan(-1);
      expect(fitnessIdx).toBeGreaterThan(-1);
      expect(financeIdx).toBeLessThan(fitnessIdx);
      const { host, port } = PILLAR_UPSTREAMS.finance;
      expect(rendered).toContain(`set $trpc_finance_upstream http://${host}:${port};`);
    });

    it('is deterministic — fetcher returning the same payload yields byte-identical output', async () => {
      const payload: RegistryListResponse = {
        pillars: [
          { pillarId: 'finance', baseUrl: 'http://finance-api:3004' },
          { pillarId: 'plugin-z', baseUrl: 'http://z:1' },
        ],
      };
      const a = await renderNginxConfDynamic('http://core-api:3001', makeFetcher(payload));
      const b = await renderNginxConfDynamic('http://core-api:3001', makeFetcher(payload));
      expect(a).toBe(b);
    });
  });

  describe('parseCliArgs (PRD-232)', () => {
    it('defaults: static mode, default output, default registry url', () => {
      const opts = parseCliArgsForGenerator([]);
      expect(opts.dynamic).toBe(false);
      expect(opts.check).toBe(false);
      expect(opts.registryUrl).toBe(process.env['CORE_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL);
    });

    it('parses --dynamic', () => {
      expect(parseCliArgsForGenerator(['--dynamic']).dynamic).toBe(true);
    });

    it('parses --check', () => {
      expect(parseCliArgsForGenerator(['--check']).check).toBe(true);
    });

    it('parses --registry-url with a separate value', () => {
      const opts = parseCliArgsForGenerator(['--registry-url', 'http://other:9000']);
      expect(opts.registryUrl).toBe('http://other:9000');
    });

    it('parses --registry-url=… inline', () => {
      const opts = parseCliArgsForGenerator(['--registry-url=http://inline:1234']);
      expect(opts.registryUrl).toBe('http://inline:1234');
    });

    it('parses --out with a separate path and --out= inline', () => {
      expect(parseCliArgsForGenerator(['--out', '/tmp/a.conf']).outputPath).toBe('/tmp/a.conf');
      expect(parseCliArgsForGenerator(['--out=/tmp/b.conf']).outputPath).toBe('/tmp/b.conf');
    });

    it('throws on unknown flags', () => {
      expect(() => parseCliArgsForGenerator(['--what'])).toThrow(/unknown argument/);
    });

    it('throws when --registry-url has no value', () => {
      expect(() => parseCliArgsForGenerator(['--registry-url'])).toThrow(/--registry-url/);
      expect(() => parseCliArgsForGenerator(['--registry-url='])).toThrow(/non-empty URL/);
    });
  });
});
