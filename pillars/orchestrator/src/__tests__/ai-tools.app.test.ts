import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createOrchestratorApp } from '../app.js';

import type { Tool } from '@pops/pillar-sdk';

import type { BuildToolList } from '../ai-tools/index.js';

const SELF_BASE_URL = 'http://localhost:3009';

function makeApp(buildToolList: BuildToolList) {
  return createOrchestratorApp({ version: '1.2.3', selfBaseUrl: SELF_BASE_URL }, { buildToolList });
}

describe('GET /ai/tools', () => {
  it('returns 200 with the aggregated tool list projected from the registry', async () => {
    const projected: Tool[] = [
      {
        name: 'finance.createTransaction',
        description: 'Create a transaction',
        parameters: { amount: 'number' },
        pillar: 'finance',
        pillarStatus: 'healthy',
      },
    ];
    const buildToolList: BuildToolList = vi.fn(async () => projected);

    const res = await request(makeApp(buildToolList)).get('/ai/tools');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tools: projected });
  });

  it('returns 200 with an empty list when no pillar declares ai.tools yet', async () => {
    // No pillar ships ai.tools descriptors
    // (docs/themes/federation/prds/ai-tool-manifest) today, so the SDK
    // projection is empty. The registry is hosted and ready; this asserts
    // the honest empty-but-200 contract, not a faked tool.
    const buildToolList: BuildToolList = vi.fn(async (): Promise<readonly Tool[]> => []);

    const res = await request(makeApp(buildToolList)).get('/ai/tools');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tools: [] });
  });

  it('still returns 200 with an empty list when the registry read fails', async () => {
    const buildToolList: BuildToolList = vi.fn(async (): Promise<readonly Tool[]> => {
      throw new Error('registry unreachable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request(makeApp(buildToolList)).get('/ai/tools');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tools: [] });
    warnSpy.mockRestore();
  });
});
