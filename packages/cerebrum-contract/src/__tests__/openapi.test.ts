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
const openapiPath = resolve(here, '..', '..', 'openapi', 'cerebrum.openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;

describe('@pops/cerebrum-contract openapi snapshot', () => {
  it('declares an OpenAPI 3.x version', () => {
    expect(openapi.openapi).toMatch(/^3\./);
  });

  it('has an info block identifying the contract', () => {
    expect(openapi.info.title).toContain('cerebrum-contract');
    expect(openapi.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes at least one cerebrum procedure path', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.startsWith('/cerebrum/'))).toBe(true);
  });

  it('every documented operation has a summary and operationId', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path} missing summary`).toBeTruthy();
        expect(operation.operationId, `${method} ${path} missing operationId`).toBeTruthy();
      }
    }
  });

  it('references the Engram entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Engram');
  });

  it('references the Nudge entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Nudge');
  });

  it('references the Scope entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('Scope');
  });

  it('includes the canonical nudge status enum', () => {
    const status = openapi.components.schemas['NudgeStatus'] as {
      enum?: readonly string[];
    };
    expect(status).toBeDefined();
    expect(status.enum).toEqual(expect.arrayContaining(['pending', 'sent', 'dismissed']));
  });

  it('describes the engrams list endpoint', () => {
    const op = openapi.paths['/cerebrum/engrams']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('cerebrum.engrams.list');
  });

  it('describes the cerebrum.embeddings.getStatus read endpoint', () => {
    const op = openapi.paths['/cerebrum/embeddings/status']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('cerebrum.embeddings.getStatus');
  });

  it('describes the cerebrum.embeddings.listSourceIdsByType read endpoint', () => {
    const op = openapi.paths['/cerebrum/embeddings/source-ids']?.['get'];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe('cerebrum.embeddings.listSourceIdsByType');
  });

  it('exposes no mutating verb on the embeddings paths (read-only surface)', () => {
    const status = openapi.paths['/cerebrum/embeddings/status'] ?? {};
    const sourceIds = openapi.paths['/cerebrum/embeddings/source-ids'] ?? {};
    for (const method of Object.keys(status)) {
      expect(method).toBe('get');
    }
    for (const method of Object.keys(sourceIds)) {
      expect(method).toBe('get');
    }
  });

  it('references the embeddings input/output schemas under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('EmbeddingsGetStatusInput');
    expect(openapi.components.schemas).toHaveProperty('EmbeddingsGetStatusOutput');
    expect(openapi.components.schemas).toHaveProperty('EmbeddingsListSourceIdsByTypeInput');
    expect(openapi.components.schemas).toHaveProperty('EmbeddingsListSourceIdsByTypeOutput');
  });

  it('references the DebriefSession entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('DebriefSession');
  });

  it('references the DebriefResult entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('DebriefResult');
  });

  it('references the DebriefStatus entity schema under components/schemas', () => {
    expect(openapi.components.schemas).toHaveProperty('DebriefStatus');
  });

  it('includes the debrief session status enum', () => {
    const status = openapi.components.schemas['DebriefSessionStatus'] as {
      enum?: readonly string[];
    };
    expect(status).toBeDefined();
    expect(status.enum).toEqual(expect.arrayContaining(['pending', 'active', 'complete']));
  });

  it('includes the debrief media-type enum', () => {
    const mediaType = openapi.components.schemas['DebriefMediaType'] as {
      enum?: readonly string[];
    };
    expect(mediaType).toBeDefined();
    expect(mediaType.enum).toEqual(expect.arrayContaining(['movie', 'episode']));
  });

  it.each([
    ['/cerebrum/debrief/record', 'post', 'cerebrum.debrief.record'],
    ['/cerebrum/debrief/dismiss', 'post', 'cerebrum.debrief.dismiss'],
    ['/cerebrum/debrief/listPending', 'get', 'cerebrum.debrief.listPending'],
    ['/cerebrum/debrief/create', 'post', 'cerebrum.debrief.create'],
    ['/cerebrum/debrief/get', 'get', 'cerebrum.debrief.get'],
    ['/cerebrum/debrief/getByMedia', 'get', 'cerebrum.debrief.getByMedia'],
    ['/cerebrum/debrief/logWatchCompletion', 'post', 'cerebrum.debrief.logWatchCompletion'],
    ['/cerebrum/debrief/deleteByWatchHistoryId', 'post', 'cerebrum.debrief.deleteByWatchHistoryId'],
  ])('exposes %s %s as %s', (path, method, operationId) => {
    const op = openapi.paths[path]?.[method];
    expect(op).toBeDefined();
    expect(op?.operationId).toBe(operationId);
  });
});
