/**
 * Up Bank webhook route tests.
 *
 * Exercises the signature-verification contract end-to-end through Express:
 * missing header → 401, bad signature → 403, valid signature → 200, the
 * `UP_WEBHOOK_SECRET_FILE` secret source, the missing-secret → 500 path, and
 * the liveness ping. The app under test wires the same path-scoped raw parser
 * the real factory uses, so the Buffer-body assumption is covered too.
 */
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUpBankWebhookRouter } from './up-bank.js';

const SECRET = 'test-up-webhook-secret';

function buildApp(): Express {
  const app = express();
  app.use('/webhooks/up', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(createUpBankWebhookRouter());
  return app;
}

function sign(body: string, secret: string = SECRET): string {
  return createHmac('sha256', secret).update(Buffer.from(body, 'utf-8')).digest('hex');
}

const EVENT_BODY = JSON.stringify({
  data: {
    attributes: { eventType: 'TRANSACTION_CREATED' },
    relationships: { transaction: { data: { id: 'txn-123' } } },
  },
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'up-bank-webhook-test-'));
  process.env['UP_WEBHOOK_SECRET'] = SECRET;
  delete process.env['UP_WEBHOOK_SECRET_FILE'];
});

afterEach(() => {
  delete process.env['UP_WEBHOOK_SECRET'];
  delete process.env['UP_WEBHOOK_SECRET_FILE'];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /webhooks/up', () => {
  it('rejects a request with no signature header (401)', async () => {
    const res = await supertest(buildApp())
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .send(EVENT_BODY);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing signature header' });
  });

  it('rejects a request with an invalid signature (403)', async () => {
    const res = await supertest(buildApp())
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .set('x-up-authenticity-signature', 'not-the-real-hmac')
      .send(EVENT_BODY);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('accepts a correctly signed webhook (200)', async () => {
    const res = await supertest(buildApp())
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .set('x-up-authenticity-signature', sign(EVENT_BODY))
      .send(EVENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies against a secret read from UP_WEBHOOK_SECRET_FILE', async () => {
    const fileSecret = 'secret-from-file';
    const secretPath = join(tmpDir, 'up-secret');
    writeFileSync(secretPath, `${fileSecret}\n`, 'utf-8');
    delete process.env['UP_WEBHOOK_SECRET'];
    process.env['UP_WEBHOOK_SECRET_FILE'] = secretPath;

    const res = await supertest(buildApp())
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .set('x-up-authenticity-signature', sign(EVENT_BODY, fileSecret))
      .send(EVENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('fails closed (500) when no webhook secret is configured', async () => {
    delete process.env['UP_WEBHOOK_SECRET'];
    delete process.env['UP_WEBHOOK_SECRET_FILE'];

    const res = await supertest(buildApp())
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .set('x-up-authenticity-signature', sign(EVENT_BODY))
      .send(EVENT_BODY);

    expect(res.status).toBe(500);
  });
});

describe('POST /webhooks/up/ping', () => {
  it('answers the liveness ping (200)', async () => {
    const res = await supertest(buildApp()).post('/webhooks/up/ping').send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
