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
const openapiPath = resolve(here, '..', '..', '..', 'openapi', 'cerebrum.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/cerebrum openapi projection', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('identifies the cerebrum contract in the info block', () => {
    expect(openapi.info.title).toContain('cerebrum');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('serves paths at the root (no /cerebrum prefix)', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('/templates');
    expect(paths.every((p) => !p.startsWith('/cerebrum/'))).toBe(true);
  });

  it('gives every operation a summary and a concatenated-path operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('names the templates list operation by its dotted contract key', () => {
    expect(openapi.paths['/templates']?.['get']?.operationId).toBe('templates.list');
  });

  it('exposes the single-template route', () => {
    expect(openapi.paths['/templates/{name}']?.['get']).toBeDefined();
  });
});
