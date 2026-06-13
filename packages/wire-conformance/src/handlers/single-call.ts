import {
  assertErrorEnvelope,
  expectStatus,
  KNOWN_CODES,
  type ErrorEnvelope,
} from '../error-envelope.js';

import type { Handler } from './context.js';

export const wf01: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/trpc/${ctx.probes.successProcedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { echo: 'hello' } }),
  });
  expectStatus(res.status, 200, 'status');
  const body = (await res.json()) as { result?: { data?: unknown } };
  if (body.result === undefined || body.result.data === undefined) {
    throw new Error(`expected { result: { data } } envelope, got ${JSON.stringify(body)}`);
  }
};

export const wf02: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/trpc/${ctx.probes.notFoundProcedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: null }),
  });
  expectStatus(res.status, 200, 'tRPC errors return HTTP 200');
  const body = (await res.json()) as ErrorEnvelope;
  assertErrorEnvelope(body);
  if (!KNOWN_CODES.has(body.error.code)) {
    throw new Error(`unknown error code: ${body.error.code}`);
  }
};

export const wf03: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/trpc/${ctx.probes.successProcedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = (await res.json()) as ErrorEnvelope;
  assertErrorEnvelope(body);
  if (body.error.code !== 'BAD_REQUEST') {
    throw new Error(`expected BAD_REQUEST, got ${body.error.code}`);
  }
};
