/**
 * Integration tests for `cerebrum.templates.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db + the bundled template
 * fixtures and exercises list/get + the 404 path through supertest.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-templates-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('GET /templates', () => {
  it('lists the bundled templates sorted by name with bodies stripped', async () => {
    const { templates } = await client().templates.list();
    expect(templates.length).toBeGreaterThan(0);
    const names = templates.map((t) => t.name);
    expect(names).toEqual([...names].toSorted((a, b) => a.localeCompare(b)));
    expect(names).toContain('decision');
    for (const t of templates) {
      expect(t).not.toHaveProperty('body');
    }
  });
});

describe('GET /templates/:name', () => {
  it('returns a single template including its Markdown body', async () => {
    const { template } = await client().templates.get('decision');
    expect(template.name).toBe('decision');
    expect(typeof template.body).toBe('string');
    expect(template.body.length).toBeGreaterThan(0);
  });

  it('404s on an unknown template', async () => {
    await expect(client().templates.get('does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});
