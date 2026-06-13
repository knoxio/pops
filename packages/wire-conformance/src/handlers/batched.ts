import { expectStatus } from '../error-envelope.js';

import type { Handler } from './context.js';

export const wf04: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.successProcedure},${ctx.probes.successProcedure}`;
  const res = await ctx.fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 0: { input: { echo: 'a' } }, 1: { input: { echo: 'b' } } }),
  });
  expectStatus(res.status, 200, 'status');
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('batched response must be a JSON array');
  if (body.length !== 2) throw new Error(`expected length 2, got ${body.length}`);
};

export const wf05: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.successProcedure},${ctx.probes.notFoundProcedure}`;
  const res = await ctx.fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 0: { input: { echo: 'first' } }, 1: { input: null } }),
  });
  const body = (await res.json()) as Array<{ result?: { data?: unknown }; error?: unknown }>;
  if (!Array.isArray(body) || body.length !== 2) throw new Error('expected array of length 2');
  const first = body[0];
  const second = body[1];
  if (first === undefined || first.result === undefined) {
    throw new Error('position 0 (success procedure) should be { result }');
  }
  if (second === undefined || second.error === undefined) {
    throw new Error('position 1 (error procedure) should be { error }');
  }
};

export const wf06: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.successProcedure},${ctx.probes.notFoundProcedure},${ctx.probes.successProcedure}`;
  const res = await ctx.fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      0: { input: { echo: 'ok1' } },
      1: { input: null },
      2: { input: { echo: 'ok2' } },
    }),
  });
  expectStatus(res.status, 200, 'partial failure must not fail the batch');
  const body = (await res.json()) as Array<{ result?: unknown; error?: unknown }>;
  if (!Array.isArray(body) || body.length !== 3) throw new Error('expected array of length 3');
  if (body[0]?.result === undefined) throw new Error('position 0 should succeed');
  if (body[1]?.error === undefined) throw new Error('position 1 should error');
  if (body[2]?.result === undefined) throw new Error('position 2 should succeed');
};

export const wf07: Handler = async (ctx) => {
  const url = `${ctx.baseUrl}/trpc/${ctx.probes.successProcedure},${ctx.probes.successProcedure}`;
  const res = await ctx.fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json at all',
  });
  if (res.status !== 400) {
    throw new Error(`expected 400 for malformed body, got ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (Array.isArray(body)) {
    throw new Error('envelope error must not be a JSON array');
  }
};
