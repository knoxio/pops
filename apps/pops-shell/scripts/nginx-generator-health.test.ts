import { afterEach, describe, expect, it } from 'vitest';

import {
  createNginxGeneratorHealth,
  startHealthEndpoint,
  type HealthEndpointHandle,
} from './nginx-generator-health.ts';

describe('createNginxGeneratorHealth', () => {
  it('starts in the ok state with no errors and no successes', () => {
    const health = createNginxGeneratorHealth();
    const snap = health.snapshot();
    expect(snap.status).toBe('ok');
    expect(snap.lastSuccessAt).toBeNull();
    expect(snap.lastError).toBeNull();
    expect(snap.nginx_generator_last_error_at).toBeNull();
  });

  it('records errors with stage + message + epoch-ms timestamp', () => {
    const health = createNginxGeneratorHealth();
    const at = new Date('2026-06-14T01:23:45.000Z');
    health.recordError({ stage: 'validate', message: 'nginx -t failed', at });
    const snap = health.snapshot();
    expect(snap.status).toBe('degraded');
    expect(snap.lastError).toEqual({
      stage: 'validate',
      message: 'nginx -t failed',
      at: at.getTime(),
    });
    expect(snap.nginx_generator_last_error_at).toBe(at.getTime());
  });

  it('clears lastError after recordSuccess (recovery flow)', () => {
    const health = createNginxGeneratorHealth();
    health.recordError({
      stage: 'regenerate',
      message: 'boom',
      at: new Date('2026-06-14T01:00:00.000Z'),
    });
    expect(health.snapshot().status).toBe('degraded');
    health.recordSuccess(new Date('2026-06-14T01:00:05.000Z'));
    const snap = health.snapshot();
    expect(snap.status).toBe('ok');
    expect(snap.lastError).toBeNull();
    expect(snap.nginx_generator_last_error_at).toBeNull();
    expect(snap.lastSuccessAt).toBe(new Date('2026-06-14T01:00:05.000Z').getTime());
  });

  it('keeps lastError pinned to the most recent failure across repeated errors', () => {
    const health = createNginxGeneratorHealth();
    health.recordError({
      stage: 'regenerate',
      message: 'first',
      at: new Date('2026-06-14T01:00:00.000Z'),
    });
    health.recordError({
      stage: 'validate',
      message: 'second',
      at: new Date('2026-06-14T01:00:01.000Z'),
    });
    const snap = health.snapshot();
    expect(snap.lastError?.stage).toBe('validate');
    expect(snap.lastError?.message).toBe('second');
  });
});

describe('startHealthEndpoint', () => {
  const handles: HealthEndpointHandle[] = [];

  afterEach(async () => {
    while (handles.length > 0) {
      const h = handles.pop();
      if (h !== undefined) await h.close();
    }
  });

  it('serves the snapshot as JSON with 200 when healthy', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      lastSuccessAt: null,
      lastError: null,
      nginx_generator_last_error_at: null,
    });
  });

  it('returns 503 + degraded payload after an error is recorded', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const at = new Date('2026-06-14T02:00:00.000Z');
    health.recordError({ stage: 'reload', message: 'kill: not found', at });

    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      status: string;
      nginx_generator_last_error_at: number | null;
      lastError: { stage: string; message: string; at: number } | null;
    };
    expect(body.status).toBe('degraded');
    expect(body.nginx_generator_last_error_at).toBe(at.getTime());
    expect(body.lastError).toEqual({
      stage: 'reload',
      message: 'kill: not found',
      at: at.getTime(),
    });
  });

  it('returns 404 on unknown paths', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('returns 404 on non-GET methods', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/health`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('honours a custom path', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({
      health,
      port: 0,
      host: '127.0.0.1',
      path: '/nginx-generator/health',
    });
    handles.push(endpoint);
    const ok = await fetch(`http://127.0.0.1:${endpoint.port}/nginx-generator/health`);
    expect(ok.status).toBe(200);
    const miss = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(miss.status).toBe(404);
  });

  it('reflects state changes (error then success) in subsequent responses', async () => {
    const health = createNginxGeneratorHealth();
    const endpoint = await startHealthEndpoint({ health, port: 0, host: '127.0.0.1' });
    handles.push(endpoint);

    health.recordError({
      stage: 'validate',
      message: 'syntax',
      at: new Date('2026-06-14T03:00:00.000Z'),
    });
    const degraded = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(degraded.status).toBe(503);

    health.recordSuccess(new Date('2026-06-14T03:00:01.000Z'));
    const recovered = await fetch(`http://127.0.0.1:${endpoint.port}/health`);
    expect(recovered.status).toBe(200);
    const body = (await recovered.json()) as {
      lastError: unknown;
      nginx_generator_last_error_at: unknown;
    };
    expect(body.lastError).toBeNull();
    expect(body.nginx_generator_last_error_at).toBeNull();
  });
});
