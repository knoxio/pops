import { assertErrorEnvelope, type ErrorEnvelope } from '../error-envelope.js';

import type { Handler } from './context.js';

export const wf19: Handler = async (ctx) => {
  const requestId = '4a8b1f10-7c01-4e0d-b8fd-3e9a5d9d5b91';
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/trpc/${ctx.probes.successProcedure}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
    body: JSON.stringify({ input: null }),
  });
  await res.body?.cancel();
  const echoed = res.headers.get('x-request-id');
  if (echoed !== requestId) {
    throw new Error(`expected X-Request-Id echo "${requestId}", got "${echoed ?? ''}"`);
  }
};

export const wf20: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/trpc/${ctx.probes.successProcedure}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pops-Wire-Version': '999',
    },
    body: JSON.stringify({ input: null }),
  });
  const body = (await res.json()) as ErrorEnvelope;
  assertErrorEnvelope(body);
  if (body.error.code !== 'METHOD_NOT_SUPPORTED') {
    throw new Error(`expected METHOD_NOT_SUPPORTED, got ${body.error.code}`);
  }
  const data = body.error.data as { supportedVersions?: unknown };
  if (!Array.isArray(data.supportedVersions) || data.supportedVersions.length === 0) {
    throw new Error('error.data.supportedVersions must be a non-empty array');
  }
};
