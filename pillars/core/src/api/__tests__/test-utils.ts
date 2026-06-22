/**
 * Supertest-backed REST client for the core pillar integration tests.
 *
 * Preserves a caller-shaped API (`client.settings.set({...})`,
 * `client.features.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` carrying the
 * parsed `{ status, body }` so tests assert on
 * `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { FeatureManifest, FeatureStatus } from '@pops/types';

import type { CreatedServiceAccount, ServiceAccount } from '../modules/service-accounts/types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

/** Per-client extra request headers — used by the auth-gated REST tests to
 * present an `x-api-key` (service-account principal) or a Cloudflare Access
 * header on every request the client issues. */
export type ClientHeaders = Record<string, string>;

function withHeaders(req: supertest.Test, headers: ClientHeaders | undefined): supertest.Test {
  if (!headers) return req;
  let out = req;
  for (const [name, value] of Object.entries(headers)) out = out.set(name, value);
  return out;
}

export function makeClient(app: Express, headers?: ClientHeaders) {
  const base = supertest(app);
  const r = {
    get: (url: string) => withHeaders(base.get(url), headers),
    post: (url: string) => withHeaders(base.post(url), headers),
    put: (url: string) => withHeaders(base.put(url), headers),
    patch: (url: string) => withHeaders(base.patch(url), headers),
    delete: (url: string) => withHeaders(base.delete(url), headers),
  };
  return {
    users: {
      get: (uri: string) => send<{ data: { uri: string } }>(r.get('/users').query({ uri })),
    },
    features: {
      getManifests: () => send<{ manifests: FeatureManifest[] }>(r.get('/features/manifests')),
      list: () => send<{ features: FeatureStatus[] }>(r.get('/features')),
      isEnabled: (key: string) =>
        send<{ enabled: boolean }>(r.get(`/features/${encodeURIComponent(key)}/enabled`)),
      setEnabled: (key: string, enabled: boolean) =>
        send<{ enabled: boolean }>(
          r.put(`/features/${encodeURIComponent(key)}/enabled`).send({ enabled })
        ),
      setUserPreference: (key: string, enabled: boolean) =>
        send<{ enabled: boolean }>(
          r.put(`/features/${encodeURIComponent(key)}/preference`).send({ enabled })
        ),
      clearUserPreference: (key: string) =>
        send<{ cleared: boolean }>(r.delete(`/features/${encodeURIComponent(key)}/preference`)),
    },
    shell: {
      manifest: () => send<{ apps: string[]; overlays: string[] }>(r.get('/shell/manifest')),
    },
    settings: {
      list: () => send<{ data: Array<{ key: string; value: string }> }>(r.get('/settings')),
      aggregate: () =>
        send<{
          pillars: Array<{
            pillarId: string;
            settings: Array<{ key: string; value: string }>;
            error?: 'unreachable' | 'unauthorized';
          }>;
          fetchedAt: string;
        }>(r.get('/settings/aggregate')),
      get: (key: string) =>
        send<{ data: { key: string; value: string } | null }>(
          r.get(`/settings/${encodeURIComponent(key)}`)
        ),
      getMany: (keys: string[]) =>
        send<{ settings: Record<string, string> }>(r.post('/settings/get-many').send({ keys })),
      set: (key: string, value: string) =>
        send<{ data: { key: string; value: string }; message: string }>(
          r.put(`/settings/${encodeURIComponent(key)}`).send({ value })
        ),
      ensure: (key: string, value: string) =>
        send<{ data: { key: string; value: string } }>(
          r.post(`/settings/${encodeURIComponent(key)}/ensure`).send({ value })
        ),
      resetKey: (key: string) =>
        send<{ data: { key: string; value: string }; message: string }>(
          r.post(`/settings/${encodeURIComponent(key)}/reset`).send({})
        ),
      reset: (keys?: string[]) =>
        send<{ reset: string[]; settings: Record<string, string> }>(
          r.post('/settings/reset').send(keys ? { keys } : {})
        ),
      delete: (key: string) =>
        send<{ message: string }>(r.delete(`/settings/${encodeURIComponent(key)}`)),
      setMany: (entries: Array<{ key: string; value: string }>) =>
        send<{ settings: Record<string, string> }>(r.post('/settings/set-many').send({ entries })),
    },
    serviceAccounts: {
      list: () => send<ServiceAccount[]>(r.get('/service-accounts')),
      create: (body: { name: string; scopes: string[] }) =>
        send<CreatedServiceAccount>(r.post('/service-accounts').send(body)),
      revoke: (id: string) =>
        send<{ ok: true }>(r.post(`/service-accounts/${encodeURIComponent(id)}/revoke`).send({})),
    },
  };
}
