import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PILLARS } from '@pops/pillar-sdk';

import {
  PILLAR_RENDER_ORDER,
  PILLAR_UPSTREAMS,
  assertRenderOrderCoversAllPillars,
  renderNginxConf,
} from './generate-nginx-conf.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COMMITTED_CONF_PATH = resolve(SCRIPT_DIR, '..', 'nginx.conf');

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
      const includes = rendered.match(/include \/etc\/nginx\/snippets\/_pillar-proxy\.conf;/g);
      expect(includes).not.toBeNull();
      expect(includes ?? []).toHaveLength(PILLARS.length);
    });

    it('keeps the legacy /trpc fallback proxying to pops-api', () => {
      expect(rendered).toMatch(
        /location \/trpc \{[\s\S]*?proxy_pass http:\/\/pops-api:3000\/trpc;/
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
});
