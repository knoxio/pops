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
const openapiPath = resolve(here, '..', '..', 'openapi', 'finance.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/finance-contract openapi snapshot', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the contract', () => {
    expect(openapi.info.title).toContain('finance-contract');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes at least one finance procedure path', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.startsWith('/finance/'))).toBe(true);
  });

  it('every documented operation has a summary and operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('references the WishListItem entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('WishListItem');
  });

  it('includes the canonical wishlist priority enum', () => {
    const priority = openapi.components.schemas['WishListPriority'] as {
      enum?: readonly string[];
    };
    expect(priority).toBeDefined();
    expect(priority.enum).toEqual(
      expect.arrayContaining(['Needing', 'Soon', 'One Day', 'Dreaming'])
    );
  });

  it('describes the wishlist list endpoint', () => {
    const op = openapi.paths['/finance/wishlist']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('finance.wishlist.list');
  });
});
