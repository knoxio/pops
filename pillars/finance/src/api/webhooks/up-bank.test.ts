/**
 * Up Bank webhook route tests.
 *
 * Exercises the signature-verification contract end-to-end through Express:
 * missing header → 401, bad (short) signature → 403, bad (same-length)
 * signature → 403 (exercises the `timingSafeEqual` branch, not just the
 * length-mismatch guard), valid signature → 200, the `UP_WEBHOOK_SECRET_FILE`
 * secret source, the missing-secret → 500 path, and the liveness ping. The
 * app under test wires the same path-scoped raw parser the real factory
 * uses, so the Buffer-body assumption is covered too. Ingest is a stub here
 * (POPS-2920): the route's contract is to acknowledge first and hand the
 * event on, and what the event then does is `webhook-ingest.test.ts`.
 */
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestOn } from '../__tests__/test-utils.js';
import {
  __resetWebhookSecretCacheForTests,
  createUpBankWebhookRouter,
  type UpBankWebhookLogger,
} from './up-bank.js';

import type { UpWebhookIngest } from '../modules/up-bank/webhook-ingest.js';

const SECRET = 'test-up-webhook-secret';

const acknowledgeOnly: UpWebhookIngest = async () => ({ kind: 'ignored', reason: 'test stub' });

function buildApp(
  ingest: UpWebhookIngest = acknowledgeOnly,
  logger?: UpBankWebhookLogger
): Express {
  const app = express();
  app.use('/webhooks/up', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(createUpBankWebhookRouter({ ingest, logger }));
  return app;
}

function signedPost(app: Express, body: string = EVENT_BODY) {
  return requestOn(app, (r) =>
    r
      .post('/webhooks/up')
      .set('content-type', 'application/json')
      .set('x-up-authenticity-signature', sign(body))
      .send(body)
  );
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
  __resetWebhookSecretCacheForTests();
});

afterEach(() => {
  delete process.env['UP_WEBHOOK_SECRET'];
  delete process.env['UP_WEBHOOK_SECRET_FILE'];
  __resetWebhookSecretCacheForTests();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /webhooks/up', () => {
  it('rejects a request with no signature header (401)', async () => {
    const res = await requestOn(buildApp(), (r) =>
      r.post('/webhooks/up').set('content-type', 'application/json').send(EVENT_BODY)
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing signature header' });
  });

  it('rejects a request with an invalid signature (403)', async () => {
    const res = await requestOn(buildApp(), (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', 'not-the-real-hmac')
        .send(EVENT_BODY)
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a same-length signature that differs only in its last character (403)', async () => {
    // Exercises the crypto.timingSafeEqual comparison itself, not just the
    // length-mismatch short-circuit ahead of it.
    const real = sign(EVENT_BODY);
    const tampered = real.slice(0, -1) + (real.at(-1) === '0' ? '1' : '0');

    const res = await requestOn(buildApp(), (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', tampered)
        .send(EVENT_BODY)
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('accepts a correctly signed webhook (200)', async () => {
    const res = await requestOn(buildApp(), (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY))
        .send(EVENT_BODY)
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies against a secret read from UP_WEBHOOK_SECRET_FILE', async () => {
    const fileSecret = 'secret-from-file';
    const secretPath = join(tmpDir, 'up-secret');
    writeFileSync(secretPath, `${fileSecret}\n`, 'utf-8');
    delete process.env['UP_WEBHOOK_SECRET'];
    process.env['UP_WEBHOOK_SECRET_FILE'] = secretPath;

    const res = await requestOn(buildApp(), (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY, fileSecret))
        .send(EVENT_BODY)
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('reuses the cached secret across requests instead of re-reading UP_WEBHOOK_SECRET_FILE (CF083/#3670)', async () => {
    const originalSecret = 'secret-from-file';
    const secretPath = join(tmpDir, 'up-secret');
    writeFileSync(secretPath, `${originalSecret}\n`, 'utf-8');
    delete process.env['UP_WEBHOOK_SECRET'];
    process.env['UP_WEBHOOK_SECRET_FILE'] = secretPath;

    const app = buildApp();
    const first = await requestOn(app, (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY, originalSecret))
        .send(EVENT_BODY)
    );
    expect(first.status).toBe(200);

    // Rewrite the secret file after the first request; a request signed with
    // the ORIGINAL (cached) secret should still verify, and one signed with
    // the new on-disk secret should not — proving the file isn't re-read.
    writeFileSync(secretPath, 'rotated-secret\n', 'utf-8');

    const stillUsesCached = await requestOn(app, (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY, originalSecret))
        .send(EVENT_BODY)
    );
    expect(stillUsesCached.status).toBe(200);

    const rejectsRotated = await requestOn(app, (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY, 'rotated-secret'))
        .send(EVENT_BODY)
    );
    expect(rejectsRotated.status).toBe(403);
  });

  it('fails closed (500) when no webhook secret is configured', async () => {
    delete process.env['UP_WEBHOOK_SECRET'];
    delete process.env['UP_WEBHOOK_SECRET_FILE'];

    const res = await requestOn(buildApp(), (r) =>
      r
        .post('/webhooks/up')
        .set('content-type', 'application/json')
        .set('x-up-authenticity-signature', sign(EVENT_BODY))
        .send(EVENT_BODY)
    );

    expect(res.status).toBe(500);
  });
});

describe('POST /webhooks/up ingest hand-off (POPS-2920)', () => {
  it('hands the event type and transaction id to ingest', async () => {
    const ingest = vi.fn(acknowledgeOnly);
    const res = await signedPost(buildApp(ingest));

    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledWith({
      eventType: 'TRANSACTION_CREATED',
      transactionId: 'txn-123',
    });
  });

  it('acknowledges before ingest finishes, and even when ingest never does', async () => {
    let settle: () => void = () => {};
    const ingest: UpWebhookIngest = () =>
      new Promise((res) => {
        settle = () => res({ kind: 'ignored', reason: 'late' });
      });

    const res = await signedPost(buildApp(ingest));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    settle();
  });

  it('logs an ingest failure at warn and never surfaces it to Up', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const ingest: UpWebhookIngest = () => Promise.reject(new Error('Up API 500 for /transactions'));

    const res = await signedPost(buildApp(ingest, logger));
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(logger.warn).toHaveBeenCalledWith(
      '[webhook/up] ingest failed',
      expect.objectContaining({ transactionId: 'txn-123', error: 'Up API 500 for /transactions' })
    );
  });

  it('warns for an unmapped Up account and for a deletion, informs for the rest', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const outcomes: UpWebhookIngest[] = [
      async () => ({ kind: 'unmapped', upAccountId: 'up-acc-9', transactionId: 'txn-123' }),
      async () => ({ kind: 'deleted', transactionId: 'txn-123', staged: false }),
      async () => ({ kind: 'staged', accountId: 'a1', draftId: 'd1', created: true }),
    ];
    for (const ingest of outcomes) await signedPost(buildApp(ingest, logger));

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(2));
    expect(logger.warn.mock.calls.map(([msg]) => msg)).toEqual([
      '[webhook/up] transaction for an Up account with no import config',
      '[webhook/up] TRANSACTION_DELETED not applied; the next sync reconciles it',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ upAccountId: 'up-acc-9' })
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[webhook/up] staged',
      expect.objectContaining({ draftId: 'd1' })
    );
  });

  it('warns for a settlement the ledger refused, naming the row left held (POPS-2685)', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const ingest: UpWebhookIngest = async () => ({
      kind: 'settle-refused',
      accountId: 'a1',
      transactionId: 't1',
    });

    const res = await signedPost(buildApp(ingest, logger));

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(logger.warn).toHaveBeenCalledWith(
      '[webhook/up] settlement would contradict the row type; left held',
      { accountId: 'a1', transactionId: 't1' }
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('hands undefined fields on for a payload missing them', async () => {
    const ingest = vi.fn(acknowledgeOnly);
    await signedPost(buildApp(ingest), JSON.stringify({ data: {} }));
    expect(ingest).toHaveBeenCalledWith({ eventType: undefined, transactionId: undefined });
  });
});

describe('POST /webhooks/up/ping', () => {
  it('answers the liveness ping (200)', async () => {
    const res = await requestOn(buildApp(), (r) => r.post('/webhooks/up/ping').send());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
