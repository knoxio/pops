import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOrchestratorApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

const SELF_BASE_URL = 'http://localhost:3009';

function makeApp() {
  return createOrchestratorApp({ version: '1.2.3', selfBaseUrl: SELF_BASE_URL });
}

describe('orchestrator app', () => {
  const originalPillars = process.env['POPS_PILLARS'];

  beforeEach(() => {
    __resetPillarRegistryCache();
    delete process.env['POPS_PILLARS'];
  });

  afterEach(() => {
    __resetPillarRegistryCache();
    if (originalPillars === undefined) {
      delete process.env['POPS_PILLARS'];
    } else {
      process.env['POPS_PILLARS'] = originalPillars;
    }
  });

  describe('GET /health', () => {
    it('returns ok with the orchestrator service identity and build version', async () => {
      const res = await request(makeApp()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        status: 'ok',
        service: 'orchestrator',
        version: '1.2.3',
      });
      expect(typeof res.body.ts).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.ts))).toBe(false);
    });
  });

  describe('GET /pillars', () => {
    it('lists the synthetic orchestrator self-entry first when POPS_PILLARS is unset', async () => {
      const res = await request(makeApp()).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([{ id: 'orchestrator', baseUrl: SELF_BASE_URL }]);
    });

    it('federates the parsed POPS_PILLARS entries behind the self-entry', async () => {
      process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004,food:http://food-api:3005';
      __resetPillarRegistryCache();

      const res = await request(makeApp()).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
        { id: 'food', baseUrl: 'http://food-api:3005' },
      ]);
    });

    it('drops a stale orchestrator entry from POPS_PILLARS in favour of the live self-entry', async () => {
      process.env['POPS_PILLARS'] =
        'orchestrator:http://stale:9999,finance:http://finance-api:3004';
      __resetPillarRegistryCache();

      const res = await request(makeApp()).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
      ]);
    });
  });
});
