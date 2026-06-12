import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { summary?: string; operationId?: string }>>;
  components: { schemas: Record<string, unknown> };
}

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '..', '..', 'openapi', 'media.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/media-contract openapi snapshot', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the contract', () => {
    expect(openapi.info.title).toContain('media-contract');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes at least one media procedure path', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.startsWith('/media/'))).toBe(true);
  });

  it('every documented operation has a summary and operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('references the Movie entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Movie');
  });

  it('references the TvShow entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('TvShow');
  });

  it('references the WatchlistItem entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('WatchlistItem');
  });

  it('references the WatchEvent entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('WatchEvent');
  });

  it('references the MediaKind enum under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('MediaKind');
  });

  it('describes the movies list endpoint', () => {
    const op = openapi.paths['/media/movies']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('media.movies.list');
  });
});
