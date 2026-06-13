import { assertErrorEnvelope, expectStatus, type ErrorEnvelope } from '../error-envelope.js';

import type { Handler } from './context.js';

export const wf15: Handler = async (ctx) => {
  const manifestRes = await ctx.fetchImpl(`${ctx.baseUrl}/manifest.json`, { method: 'GET' });
  const manifest = (await manifestRes.json()) as unknown;
  const res = await ctx.fetchImpl(`${ctx.coreBaseUrl}/trpc/core.registry.register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': ctx.apiKey,
    },
    body: JSON.stringify({
      input: {
        pillarId: ctx.probes.registrationPillarId,
        baseUrl: ctx.baseUrl,
        manifest,
        apiKey: ctx.apiKey,
      },
    }),
  });
  expectStatus(res.status, 200, 'status');
  const body = (await res.json()) as { result?: { data?: { ok?: boolean } } };
  if (body.result === undefined || body.result.data === undefined || body.result.data.ok !== true) {
    throw new Error(`expected { result: { data: { ok: true } } }, got ${JSON.stringify(body)}`);
  }
};

export const wf16: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.coreBaseUrl}/trpc/core.registry.register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': 'definitely-not-the-real-key',
    },
    body: JSON.stringify({
      input: {
        pillarId: ctx.probes.registrationPillarId,
        baseUrl: ctx.baseUrl,
        manifest: {},
        apiKey: 'noop',
      },
    }),
  });
  const body = (await res.json()) as ErrorEnvelope;
  assertErrorEnvelope(body);
  if (body.error.code !== 'UNAUTHORIZED') {
    throw new Error(`expected UNAUTHORIZED, got ${body.error.code}`);
  }
};
