import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { summary?: string; operationId?: string }>>;
  components?: { schemas?: Record<string, unknown> };
}

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '..', '..', '..', 'openapi', 'food.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/food openapi projection', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the food pillar', () => {
    expect(openapi.info.title).toContain('food');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes at least one REST path', () => {
    expect(Object.keys(openapi.paths).length).toBeGreaterThan(0);
  });

  it('every documented operation has a summary and operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('describes the conversions surface migrated off the pops-api router', () => {
    expect(openapi.paths['/conversions/units']?.['get']).toBeDefined();
    expect(openapi.paths['/conversions/resolve']?.['get']).toBeDefined();
  });
});
