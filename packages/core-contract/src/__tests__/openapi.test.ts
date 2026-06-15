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
const openapiPath = resolve(here, '..', '..', 'openapi', 'core.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/core-contract openapi snapshot', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the contract', () => {
    expect(openapi.info.title).toContain('core-contract');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes at least one core procedure path', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.startsWith('/core/'))).toBe(true);
  });

  it('every documented operation has a summary and operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('references the RegistryEntry entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('RegistryEntry');
  });

  it('references the Setting entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Setting');
  });

  it('references the ServiceAccount entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('ServiceAccount');
  });

  it('references the Pillar entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Pillar');
  });

  it('describes the registry list endpoint', () => {
    const op = openapi.paths['/core/registry']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('core.registry.list');
  });

  it.each([
    ['/core/settings/get', 'core.settings.get'],
    ['/core/settings/set', 'core.settings.set'],
    ['/core/settings/ensure', 'core.settings.ensure'],
    ['/core/settings/delete', 'core.settings.delete'],
    ['/core/settings/getMany', 'core.settings.getMany'],
    ['/core/settings/setMany', 'core.settings.setMany'],
  ])('describes the %s endpoint with operationId %s', (path, operationId) => {
    const op = openapi.paths[path]?.['post'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe(operationId);
  });

  it.each([
    'SettingsGetInput',
    'SettingsGetOutput',
    'SettingsSetInput',
    'SettingsSetOutput',
    'SettingsEnsureInput',
    'SettingsEnsureOutput',
    'SettingsDeleteInput',
    'SettingsDeleteOutput',
    'SettingsGetManyInput',
    'SettingsGetManyOutput',
    'SettingsSetManyInput',
    'SettingsSetManyOutput',
  ])('references the %s schema under components/schemas', (name) => {
    expect(openapi.components.schemas).toHaveProperty(name);
  });
});
