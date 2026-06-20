/**
 * Integration tests for the `features.*` REST surface (epic 05 / S2), driven
 * through the real Express app via supertest.
 *
 * Feature declarations are sourced from the live registry snapshot — tests
 * register fake pillars via `pillarRegistryService.upsertPillarRegistration`
 * with a manifest `features` slot, exactly as the S1 service test does. No
 * static pillar list, no module enumeration.
 *
 * Coverage:
 *   - `getManifests`: grouped-by-pillar manifests, sorted by registry order.
 *   - `list`: resolved `FeatureStatus` per declared feature.
 *   - `isEnabled`: runtime gate (default / system override / user override);
 *     404 on an unknown key (`FeatureNotFoundError`).
 *   - `setEnabled`: system flag round-trips through the gate; 400 on a
 *     `capability`-scoped target (`FeatureScopeError`).
 *   - `setUserPreference` / `clearUserPreference`: per-user override lifecycle;
 *     400 on a non-user-scoped target.
 *   - Identity: the four user-identity ops (`list`, `isEnabled`,
 *     `setUserPreference`, `clearUserPreference`) require a HUMAN principal —
 *     an anonymous caller AND a scoped service account are both 401. The
 *     system ops (`getManifests`, `setEnabled`) accept a scoped service
 *     account but 401 an anonymous caller.
 *
 * The auth-negative cases force the production identity branch (no dev
 * fallback) so the anonymous path is actually reachable.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openCoreDb,
  pillarRegistryService,
  userSettingsService,
  type OpenedCoreDb,
} from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient, type ClientHeaders } from './test-utils.js';

import type { FeatureManifestDescriptor, ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-features-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

function client(headers?: ClientHeaders) {
  return makeClient(app(), headers);
}

/** Build a minimal valid manifest carrying the given feature descriptors. */
function manifestWith(pillar: string, features: FeatureManifestDescriptor[]): ManifestPayload {
  return {
    pillar,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillar}-contract`,
      version: '0.1.0',
      tag: `contract-${pillar}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...(features.length > 0 ? { features } : {}),
  };
}

/** Register a fake pillar into the live registry snapshot. */
function registerPillar(manifest: ManifestPayload): void {
  pillarRegistryService.upsertPillarRegistration(coreDb.db, {
    baseUrl: `http://${manifest.pillar}-api:4010`,
    manifest,
    origin: 'external',
  });
}

const SYSTEM_FLAG: FeatureManifestDescriptor = {
  key: 'demo.systemFlag',
  label: 'System Flag',
  default: false,
  scope: 'system',
};

const USER_FLAG: FeatureManifestDescriptor = {
  key: 'demo.userFlag',
  label: 'User Flag',
  default: true,
  scope: 'user',
};

const CAPABILITY_FLAG: FeatureManifestDescriptor = {
  key: 'demo.capabilityFlag',
  label: 'Capability Flag',
  default: false,
  scope: 'capability',
  capability: { pillar: 'cerebrum', key: 'vectorSearch' },
};

/**
 * Run `fn` with the env forced into the production identity branch — no dev
 * fallback, Cloudflare team configured but no JWT presented — so the anonymous
 * (401) path is actually reachable. Restores the prior env after.
 */
async function withProdIdentity(fn: () => Promise<void>): Promise<void> {
  const prevNodeEnv = process.env['NODE_ENV'];
  const prevTeam = process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
  process.env['NODE_ENV'] = 'production';
  process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = 'pops-test-team';
  try {
    await fn();
  } finally {
    if (prevNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = prevNodeEnv;
    if (prevTeam === undefined) delete process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
    else process.env['CLOUDFLARE_ACCESS_TEAM_NAME'] = prevTeam;
  }
}

describe('features REST — getManifests', () => {
  it('groups declared features by owning pillar, sorted by registry order', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    registerPillar(manifestWith('other', [USER_FLAG]));

    const { manifests } = await client().features.getManifests();
    expect(manifests.map((m) => m.id)).toEqual(['demo', 'other']);
    expect(manifests[0]?.features.map((f) => f.key)).toEqual(['demo.systemFlag']);
    expect(manifests[1]?.features.map((f) => f.key)).toEqual(['demo.userFlag']);
  });

  it('returns an empty list when no pillar declares features', async () => {
    const { manifests } = await client().features.getManifests();
    expect(manifests).toEqual([]);
  });
});

describe('features REST — list', () => {
  it('resolves a FeatureStatus per declared feature', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG, USER_FLAG]));

    const { features } = await client().features.list();
    const byKey = new Map(features.map((f) => [f.key, f]));
    expect(byKey.get('demo.systemFlag')?.state).toBe('disabled');
    expect(byKey.get('demo.systemFlag')?.enabled).toBe(false);
    expect(byKey.get('demo.userFlag')?.state).toBe('enabled');
    expect(byKey.get('demo.userFlag')?.enabled).toBe(true);
  });

  it('reflects the per-user override of the calling user', async () => {
    registerPillar(manifestWith('demo', [USER_FLAG]));
    // dev-fallback user is dev@example.com; store their override directly.
    userSettingsService.setUserSetting(
      coreDb.db,
      'dev@example.com',
      'feature.demo.userFlag',
      'false'
    );

    const { features } = await client().features.list();
    const flag = features.find((f) => f.key === 'demo.userFlag');
    expect(flag?.enabled).toBe(false);
    expect(flag?.userOverride).toBe(true);
  });
});

describe('features REST — isEnabled', () => {
  it('returns the default when nothing overrides it', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    const res = await client().features.isEnabled('demo.systemFlag');
    expect(res.enabled).toBe(false);
  });

  it('reflects a system enable', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    await client().features.setEnabled('demo.systemFlag', true);
    const res = await client().features.isEnabled('demo.systemFlag');
    expect(res.enabled).toBe(true);
  });

  it('a user override beats the system value', async () => {
    registerPillar(manifestWith('demo', [USER_FLAG]));
    await client().features.setUserPreference('demo.userFlag', false);
    const res = await client().features.isEnabled('demo.userFlag');
    expect(res.enabled).toBe(false);
  });

  it('404s an unknown key (FeatureNotFoundError → NotFound)', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    await expect(client().features.isEnabled('demo.nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('features REST — setEnabled', () => {
  it('round-trips a system flag', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    const set = await client().features.setEnabled('demo.systemFlag', true);
    expect(set.enabled).toBe(true);
    expect((await client().features.isEnabled('demo.systemFlag')).enabled).toBe(true);

    const cleared = await client().features.setEnabled('demo.systemFlag', false);
    expect(cleared.enabled).toBe(false);
    expect((await client().features.isEnabled('demo.systemFlag')).enabled).toBe(false);
  });

  it('400s a capability-scoped target (FeatureScopeError)', async () => {
    registerPillar(manifestWith('demo', [CAPABILITY_FLAG]));
    await expect(client().features.setEnabled('demo.capabilityFlag', true)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('404s an unknown key', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    await expect(client().features.setEnabled('demo.nope', true)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('features REST — user preference lifecycle', () => {
  it('set then clear round-trips the per-user override', async () => {
    registerPillar(manifestWith('demo', [USER_FLAG]));

    const set = await client().features.setUserPreference('demo.userFlag', false);
    expect(set.enabled).toBe(false);
    expect(
      userSettingsService.getUserSetting(coreDb.db, 'dev@example.com', 'feature.demo.userFlag')
    ).toBe('false');

    const cleared = await client().features.clearUserPreference('demo.userFlag');
    expect(cleared.cleared).toBe(true);
    expect(
      userSettingsService.getUserSetting(coreDb.db, 'dev@example.com', 'feature.demo.userFlag')
    ).toBeNull();
  });

  it('clear returns false when no override existed', async () => {
    registerPillar(manifestWith('demo', [USER_FLAG]));
    const res = await client().features.clearUserPreference('demo.userFlag');
    expect(res.cleared).toBe(false);
  });

  it('400s setUserPreference on a non-user-scoped feature (FeatureScopeError)', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    await expect(
      client().features.setUserPreference('demo.systemFlag', true)
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('features REST — identity gating', () => {
  it('401s an anonymous caller on every operation', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG, USER_FLAG]));
    await withProdIdentity(async () => {
      await expect(client().features.getManifests()).rejects.toMatchObject({ status: 401 });
      await expect(client().features.list()).rejects.toMatchObject({ status: 401 });
      await expect(client().features.isEnabled('demo.systemFlag')).rejects.toMatchObject({
        status: 401,
      });
      await expect(client().features.setEnabled('demo.systemFlag', true)).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        client().features.setUserPreference('demo.userFlag', true)
      ).rejects.toMatchObject({
        status: 401,
      });
      await expect(client().features.clearUserPreference('demo.userFlag')).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  it('lets a scoped service account drive the system ops but 401s it on the user-identity ops', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG, USER_FLAG]));
    const created = await client().serviceAccounts.create({
      name: 'features-bot',
      scopes: ['core.features'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });

    // System ops: a scoped service account is a valid protected principal.
    expect((await scoped.features.getManifests()).manifests.length).toBeGreaterThan(0);
    expect((await scoped.features.setEnabled('demo.systemFlag', true)).enabled).toBe(true);

    // User-identity ops require a human (no service-account email): 401.
    await expect(scoped.features.list()).rejects.toMatchObject({ status: 401 });
    await expect(scoped.features.isEnabled('demo.systemFlag')).rejects.toMatchObject({
      status: 401,
    });
    await expect(scoped.features.setUserPreference('demo.userFlag', true)).rejects.toMatchObject({
      status: 401,
    });
    await expect(scoped.features.clearUserPreference('demo.userFlag')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('401s a service account whose scopes do not cover core.features on the system ops', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    const created = await client().serviceAccounts.create({
      name: 'scopeless-bot',
      scopes: ['cerebrum.query'],
    });
    const scoped = client({ 'x-api-key': created.plaintextKey });
    await expect(scoped.features.getManifests()).rejects.toMatchObject({ status: 401 });
    await expect(scoped.features.setEnabled('demo.systemFlag', true)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('400s a malformed setEnabled payload (enabled not a boolean)', async () => {
    registerPillar(manifestWith('demo', [SYSTEM_FLAG]));
    const res = await request(app())
      .put('/features/demo.systemFlag/enabled')
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
  });
});
