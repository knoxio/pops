import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WIRE_ASSERTIONS } from '../assertions.js';
import {
  FIXTURE_API_KEY,
  FIXTURE_PILLAR_ID,
  startFixturePillar,
  type FixturePillar,
} from '../fixture/index.js';
import { runAssertion } from '../runner.js';

import type { ConformanceInput } from '../types.js';

let pillar: FixturePillar;
let input: ConformanceInput;

beforeAll(async () => {
  pillar = await startFixturePillar({ heartbeatMs: 25 });
  input = {
    baseUrl: pillar.baseUrl,
    coreBaseUrl: pillar.baseUrl,
    apiKey: FIXTURE_API_KEY,
    probes: {
      successProcedure: 'fixture.ping',
      notFoundProcedure: 'fixture.notFound',
      subscriptionProcedure: 'fixture.tick',
      idleSubscriptionProcedure: 'fixture.idle',
      errorSubscriptionProcedure: 'fixture.errorStream',
      registrationPillarId: FIXTURE_PILLAR_ID,
    },
  };
});

afterAll(async () => {
  await pillar.close();
});

describe('PRD-231 wire-format v1 conformance', () => {
  for (const id of WIRE_ASSERTIONS) {
    it(id, async () => {
      const result = await runAssertion(id, input);
      if (!result.passed) {
        throw new Error(`${id} failed: ${result.message ?? 'unknown error'}`);
      }
      expect(result.passed).toBe(true);
    });
  }

  it('aggregate runConformance reports all 20 assertions', async () => {
    const { runConformance } = await import('../runner.js');
    const report = await runConformance(input);
    expect(report.total).toBe(20);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(20);
  });
});
