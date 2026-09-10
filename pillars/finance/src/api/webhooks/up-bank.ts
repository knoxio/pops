/**
 * Up Bank webhook ingest route for the finance pillar.
 *
 * Raw Express route — deliberately NOT a ts-rest contract route — because Up
 * signs the exact request bytes (`X-Up-Authenticity-Signature` is the
 * HMAC-SHA256 of the raw body), so the handler must read the unparsed Buffer.
 * The app factory registers a path-scoped `express.raw()` ahead of the global
 * `express.json()` for this reason (see `app.ts`).
 *
 * The endpoint bypasses gateway auth by design (Cloudflare Access excludes the
 * Up webhook path); authenticity is established by the signature check alone.
 *
 * Up is acknowledged with `200` the moment the signature checks out, before
 * anything is fetched or written: it retries an unacknowledged delivery and
 * eventually disables the webhook, and ingest failures are the pillar's to
 * log, not Up's to hear about. What the event then does is
 * `makeUpWebhookIngest` (POPS-2920): fetch the transaction back, map it,
 * dedupe it against the ledger and write it into the account mapped to its Up
 * account.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { type Router as ExpressRouter, Router } from 'express';

import type { UpWebhookIngest, UpWebhookOutcome } from '../modules/up-bank/webhook-ingest.js';

// Cached after the first successful resolution — the secret is a Docker
// secret/env var fixed for the process lifetime, so re-reading the file on
// every webhook delivery is a pointless synchronous disk hit.
let cachedWebhookSecret: string | null = null;

function getWebhookSecret(): string {
  if (cachedWebhookSecret !== null) return cachedWebhookSecret;

  const filePath = process.env['UP_WEBHOOK_SECRET_FILE'];
  const secret = filePath
    ? readFileSync(filePath, 'utf-8').trim()
    : process.env['UP_WEBHOOK_SECRET'];
  if (!secret) throw new Error('Missing UP_WEBHOOK_SECRET_FILE or UP_WEBHOOK_SECRET');

  cachedWebhookSecret = secret;
  return secret;
}

/** Test seam: clear the cached secret so a test can swap env/file sources. */
export function __resetWebhookSecretCacheForTests(): void {
  cachedWebhookSecret = null;
}

function verifySignature(body: Buffer, signature: string): boolean {
  const secret = getWebhookSecret();
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export interface UpBankWebhookLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface UpBankWebhookRouterOptions {
  ingest: UpWebhookIngest;
  logger?: UpBankWebhookLogger;
}

interface WebhookPayload {
  data?: {
    attributes?: { eventType?: string };
    relationships?: { transaction?: { data?: { id?: string } } };
  };
}

/**
 * One line per outcome, at the level the operator needs it: an Up account
 * nobody has mapped and a deletion the ledger will not mirror are warnings
 * naming the ids to act on; the rest is information.
 */
function logOutcome(logger: UpBankWebhookLogger, outcome: UpWebhookOutcome): void {
  switch (outcome.kind) {
    case 'unmapped':
      logger.warn('[webhook/up] transaction for an Up account with no import config', {
        upAccountId: outcome.upAccountId,
        transactionId: outcome.transactionId,
      });
      return;
    case 'deleted':
      if (outcome.staged) {
        logger.info('[webhook/up] TRANSACTION_DELETED dropped the row from its pending draft', {
          transactionId: outcome.transactionId,
        });
        return;
      }
      logger.warn('[webhook/up] TRANSACTION_DELETED not applied; the next sync reconciles it', {
        transactionId: outcome.transactionId,
      });
      return;
    case 'settle-refused':
      logger.warn('[webhook/up] settlement would contradict the row type; left held', {
        accountId: outcome.accountId,
        transactionId: outcome.transactionId,
      });
      return;
    default:
      logger.info(`[webhook/up] ${outcome.kind}`, { ...outcome });
  }
}

/**
 * Build the Up Bank webhook router. Two POST routes:
 * - `/webhooks/up` — signature-verified transaction event receiver.
 * - `/webhooks/up/ping` — endpoint liveness probe Up calls on setup.
 */
export function createUpBankWebhookRouter(options: UpBankWebhookRouterOptions): ExpressRouter {
  const router = Router();
  const logger: UpBankWebhookLogger = options.logger ?? {
    info: (msg, meta) => console.warn(msg, meta ?? {}),
    warn: (msg, meta) => console.warn(msg, meta ?? {}),
  };

  router.post('/webhooks/up', (req, res) => {
    const signature = req.headers['x-up-authenticity-signature'];
    if (typeof signature !== 'string') {
      res.status(401).json({ error: 'Missing signature header' });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!verifySignature(rawBody, signature)) {
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as WebhookPayload;
    const event = {
      eventType: payload.data?.attributes?.eventType,
      transactionId: payload.data?.relationships?.transaction?.data?.id,
    };

    res.status(200).json({ received: true });

    options
      .ingest(event)
      .then((outcome) => logOutcome(logger, outcome))
      .catch((err: unknown) => {
        logger.warn('[webhook/up] ingest failed', {
          ...event,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });

  router.post('/webhooks/up/ping', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return router;
}
