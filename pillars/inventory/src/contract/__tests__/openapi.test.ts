import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { summary?: string; operationId?: string }>>;
}

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '..', '..', '..', 'openapi', 'inventory.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/inventory openapi projection', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('identifies the inventory contract in the info block', () => {
    expect(openapi.info.title).toContain('inventory');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('serves paths at the root (no /inventory prefix)', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('/items');
    expect(paths.every((p) => !p.startsWith('/inventory/'))).toBe(true);
  });

  it('gives every operation a summary and a concatenated-path operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('names the items list operation by its dotted contract key', () => {
    expect(openapi.paths['/items']?.['get']?.operationId).toBe('items.list');
  });

  it('exposes the nested location tree route', () => {
    expect(openapi.paths['/locations/tree']?.['get']).toBeDefined();
  });

  it('exposes the connection graph traversal route', () => {
    expect(openapi.paths['/items/{itemId}/connections/graph']?.['get']).toBeDefined();
  });
});
