/**
 * Snapshot assertions for the generated `openapi/lists.openapi.json`.
 *
 * Projected from the ts-rest contract in `src/contract/rest.ts`. The
 * assertions here pin the surface the polyglot codegen consumers (Swift,
 * Rust, openapi-typescript for TS) rely on, plus the structural invariants
 * the drift check in lists-quality.yml will care about.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface SchemaLike {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

interface RequestBodyLike {
  content: { 'application/json': { schema: SchemaLike } };
}

interface OperationLike {
  summary?: string;
  parameters?: { in: string; name: string; required?: boolean; schema?: SchemaLike }[];
  requestBody?: RequestBodyLike;
  responses: Record<string, { content?: { 'application/json'?: { schema: SchemaLike } } }>;
}

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OperationLike>>;
}

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '..', '..', '..', 'openapi', 'lists.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/lists openapi snapshot', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the contract', () => {
    expect(openapi.info.title).toContain('lists');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('every documented operation has a summary', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
      }
    }
  });

  it('exposes the aggregate list-index endpoint', () => {
    expect(openapi.paths['/lists']?.['get']).toBeDefined();
    expect(openapi.paths['/lists']?.['get']?.summary).toMatch(/aggregate/i);
  });

  it('exposes the list-detail endpoint (GET /lists/{id})', () => {
    const op = openapi.paths['/lists/{id}']?.['get'];
    expect(op).toBeDefined();
    expect(op?.parameters?.some((p) => p.name === 'id' && p.in === 'path')).toBe(true);
  });

  it('exposes the list-create endpoint with a JSON body', () => {
    const op = openapi.paths['/lists']?.['post'];
    expect(op).toBeDefined();
    expect(op?.requestBody?.content['application/json'].schema.required).toContain('name');
    expect(op?.requestBody?.content['application/json'].schema.required).toContain('kind');
  });

  it('exposes the item-add endpoint nested under the parent list', () => {
    const op = openapi.paths['/lists/{listId}/items']?.['post'];
    expect(op).toBeDefined();
    expect(op?.requestBody?.content['application/json'].schema.required).toContain('label');
  });

  it('exposes the bulk-add endpoint', () => {
    expect(openapi.paths['/lists/{listId}/items/bulk']?.['post']).toBeDefined();
  });

  it('exposes the check / uncheck endpoints', () => {
    expect(openapi.paths['/items/{id}/check']?.['post']).toBeDefined();
    expect(openapi.paths['/items/{id}/uncheck']?.['post']).toBeDefined();
  });

  it('exposes the reorder + bulk uncheck/remove endpoints', () => {
    expect(openapi.paths['/lists/{listId}/items/reorder']?.['post']).toBeDefined();
    expect(openapi.paths['/lists/{listId}/items/uncheck-all']?.['post']).toBeDefined();
    expect(openapi.paths['/lists/{listId}/items/checked']?.['delete']).toBeDefined();
  });
});
