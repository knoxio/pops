/**
 * End-to-end drop-in lifecycle test for PRD-228 (US-05).
 *
 * Ties together every BE-lego piece shipped under PRD-228 so a regression
 * in any single user story surfaces as one unambiguous failure here:
 *
 *   - US-01 register endpoint (`POST /core.registry.register`)
 *   - US-02 heartbeat endpoint + hard-eviction ticker
 *   - US-03 nginx generator dynamic mode (PRD-232)
 *   - US-04 deregister endpoint (`POST /core.registry.deregister`)
 *
 * The test boots a throwaway in-process HTTP pillar via the wire-format
 * fixture from `@pops/wire-conformance` so we don't spin up the Rust
 * reference pillar (PRD-233) just to prove the loop. It then drives the
 * full lifecycle:
 *
 *   1. Boot core-api on an ephemeral port with a temp-dir core.db.
 *   2. Spawn the fixture pillar; capture its `baseUrl`.
 *   3. POST register → assert 200, persisted row, `registered` event.
 *   4. Call `renderNginxConfDynamic` against the live registry — assert
 *      the rendered conf contains the new pillar's `location` block.
 *   5. Backdate the heartbeat + flip status to `unavailable` past the
 *      eviction threshold; run one eviction tick — assert DELETE plus
 *      a `deregistered` event with `reason: 'lost-heartbeat'`.
 *   6. POST register again — assert live.
 *   7. POST deregister → assert DELETE + `deregistered` event with
 *      `reason: 'requested'`.
 *
 * Heartbeat / eviction timing is exercised via `runEvictionTick` rather
 * than waiting on the 30s `setInterval`, so the whole test runs in well
 * under a second.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startFixturePillar, type FixturePillar } from '@pops/wire-conformance/fixture';

import { renderNginxConfDynamic } from '../../../../../../../apps/pops-shell/scripts/generate-nginx-conf.ts';
import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../../../db/index.js';
import { createCoreApiApp } from '../../../app.js';
import { registryEventBus, type RegistryEventPayload } from '../event-bus.js';
import { EVICTION_THRESHOLD_MS, runEvictionTick } from '../eviction-ticker.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk';

const PILLAR_ID = 'drop-in';

function dropInManifest(overrides?: Partial<ManifestPayload>): ManifestPayload {
  return {
    pillar: PILLAR_ID,
    version: '0.1.0',
    contract: {
      package: `@pops/${PILLAR_ID}-contract`,
      version: '0.1.0',
      tag: `contract-${PILLAR_ID}@v0.1.0`,
    },
    routes: {
      queries: ['drop.in.ping'],
      mutations: [],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...overrides,
  };
}

let tmpDir: string;
let coreDb: OpenedCoreDb;
let coreApiServer: Server;
let coreApiBaseUrl: string;
let pillar: FixturePillar;
let capturedEvents: RegistryEventPayload[];
let eventListener: (payload: RegistryEventPayload) => void;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-dropin-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  capturedEvents = [];
  eventListener = (payload) => capturedEvents.push(payload);
  registryEventBus.on('registry:event', eventListener);

  const app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:0',
  });
  coreApiServer = createServer(app);
  await new Promise<void>((resolve) => coreApiServer.listen(0, '127.0.0.1', resolve));
  const addr = coreApiServer.address() as AddressInfo;
  coreApiBaseUrl = `http://127.0.0.1:${addr.port}`;

  pillar = await startFixturePillar();
});

afterEach(async () => {
  registryEventBus.off('registry:event', eventListener);
  if (pillar) {
    await pillar.close().catch(() => undefined);
  }
  if (coreApiServer) {
    await new Promise<void>((resolve, reject) =>
      coreApiServer.close((err) => (err ? reject(err) : resolve()))
    ).catch(() => undefined);
  }
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('PRD-228 US-05 — external pillar drop-in lifecycle', () => {
  it('register → render → evict → re-register → deregister proves every BE-lego piece end to end', async () => {
    expect(pillar.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const reg = await request(coreApiBaseUrl).post('/core.registry.register').send({
      pillarId: PILLAR_ID,
      baseUrl: pillar.baseUrl,
      manifest: dropInManifest(),
    });
    expect(reg.status).toBe(200);
    expect(reg.body).toMatchObject({ ok: true, pillarId: PILLAR_ID });

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, PILLAR_ID);
    expect(persisted?.origin).toBe('external');
    expect(persisted?.status).toBe('healthy');
    expect(persisted?.apiKeyHash).toBeNull();
    expect(persisted?.baseUrl).toBe(pillar.baseUrl);
    const firstRegisteredAt = persisted?.registeredAt;

    const registered = capturedEvents.filter((e) => e.event === 'registered');
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ pillarId: PILLAR_ID });

    const renderedConf = await renderNginxConfDynamic(coreApiBaseUrl);
    expect(renderedConf).toContain(`location /trpc-${PILLAR_ID}/`);
    expect(renderedConf).toContain(`rewrite ^/trpc-${PILLAR_ID}/(.*)$ /trpc/$1 break;`);
    const url = new URL(pillar.baseUrl);
    expect(renderedConf).toContain(`http://${url.hostname}:${url.port}`);

    const now = new Date();
    const longAgo = new Date(now.getTime() - (EVICTION_THRESHOLD_MS + 60_000)).toISOString();
    pillarRegistryService.recordHeartbeat(coreDb.db, PILLAR_ID, { now: longAgo });
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      { pillarId: PILLAR_ID, status: 'unavailable', statusUpdatedAt: longAgo },
    ]);
    capturedEvents = [];

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(1);
    expect(evictions[0]).toMatchObject({
      pillarId: PILLAR_ID,
      reason: 'lost-heartbeat',
      evictedAt: now.toISOString(),
    });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, PILLAR_ID)).toBeNull();
    const evictionEvent = capturedEvents.filter((e) => e.event === 'deregistered');
    expect(evictionEvent).toHaveLength(1);
    expect(evictionEvent[0]).toMatchObject({
      pillarId: PILLAR_ID,
      origin: 'external',
      reason: 'lost-heartbeat',
      evictedAt: now.toISOString(),
    });

    const renderedAfterEviction = await renderNginxConfDynamic(coreApiBaseUrl);
    expect(renderedAfterEviction).not.toContain(`location /trpc-${PILLAR_ID}/`);

    capturedEvents = [];

    const reReg = await request(coreApiBaseUrl)
      .post('/core.registry.register')
      .send({
        pillarId: PILLAR_ID,
        baseUrl: pillar.baseUrl,
        manifest: dropInManifest({ version: '0.2.0' }),
      });
    expect(reReg.status).toBe(200);

    const reReged = pillarRegistryService.getPillarRegistration(coreDb.db, PILLAR_ID);
    expect(reReged).not.toBeNull();
    expect(reReged?.status).toBe('healthy');
    expect(reReged?.apiKeyHash).toBeNull();
    expect(reReged?.registeredAt).not.toBe(firstRegisteredAt);
    expect(capturedEvents.filter((e) => e.event === 'registered')).toHaveLength(1);

    capturedEvents = [];
    const dereg = await request(coreApiBaseUrl).post('/core.registry.deregister').send({
      pillarId: PILLAR_ID,
    });
    expect(dereg.status).toBe(200);
    expect(dereg.body).toMatchObject({ ok: true, removed: true });

    expect(pillarRegistryService.getPillarRegistration(coreDb.db, PILLAR_ID)).toBeNull();
    const cleanDereg = capturedEvents.filter((e) => e.event === 'deregistered');
    expect(cleanDereg).toHaveLength(1);
    expect(cleanDereg[0]).toMatchObject({
      pillarId: PILLAR_ID,
      origin: 'external',
      reason: 'requested',
    });

    const renderedAfterDereg = await renderNginxConfDynamic(coreApiBaseUrl);
    expect(renderedAfterDereg).not.toContain(`location /trpc-${PILLAR_ID}/`);
  });

  it('an unknown-pillar baseUrl with a non-127.0.0.1 host still renders correctly through the generator', async () => {
    await request(coreApiBaseUrl).post('/core.registry.register').send({
      pillarId: PILLAR_ID,
      baseUrl: 'http://drop-in-api:4242',
      manifest: dropInManifest(),
    });

    const rendered = await renderNginxConfDynamic(coreApiBaseUrl);
    expect(rendered).toContain(`location /trpc-${PILLAR_ID}/`);
    expect(rendered).toContain('http://drop-in-api:4242');
  });
});
