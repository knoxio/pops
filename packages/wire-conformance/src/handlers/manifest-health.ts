import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';

import { expectStatus } from '../error-envelope.js';

import type { Handler } from './context.js';

export const wf13: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/manifest.json`, { method: 'GET' });
  expectStatus(res.status, 200, 'status');
  const body = (await res.json()) as unknown;
  const parsed = ManifestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`manifest does not match schema: ${parsed.error.message}`);
  }
};

export const wf14: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/manifest.json`, { method: 'GET' });
  await res.body?.cancel();
  const cc = res.headers.get('cache-control') ?? '';
  if (!/no-store/i.test(cc)) {
    throw new Error(`expected Cache-Control: no-store, got "${cc}"`);
  }
};

export const wf17: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/health`, { method: 'GET' });
  expectStatus(res.status, 200, 'status');
  const body = (await res.json()) as { ok?: unknown; status?: unknown; pillar?: unknown };
  if (body.ok !== true) throw new Error('expected ok: true');
  if (body.status !== 'healthy' && body.status !== 'degraded') {
    throw new Error(`expected status healthy|degraded, got ${String(body.status)}`);
  }
  if (typeof body.pillar !== 'string') throw new Error('pillar must be a string');
};

export const wf18: Handler = async (ctx) => {
  const res = await ctx.fetchImpl(`${ctx.baseUrl}/health?simulate=unhealthy`, { method: 'GET' });
  if (res.status !== 503) throw new Error(`expected 503, got ${res.status}`);
  const body = (await res.json()) as { ok?: unknown; status?: unknown };
  if (body.ok !== false) throw new Error('expected ok: false');
  if (body.status !== 'unhealthy') {
    throw new Error(`expected status unhealthy, got ${String(body.status)}`);
  }
};
