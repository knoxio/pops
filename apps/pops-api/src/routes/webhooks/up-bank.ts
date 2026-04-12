import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { type Router as ExpressRouter, Router } from 'express';

const router: ExpressRouter = Router();

function getWebhookSecret(): string {
  const filePath = process.env['UP_WEBHOOK_SECRET_FILE'];
  if (filePath) {
    return readFileSync(filePath, 'utf-8').trim();
  }
  const envVal = process.env['UP_WEBHOOK_SECRET'];
  if (envVal) return envVal;
  throw new Error('Missing UP_WEBHOOK_SECRET_FILE or UP_WEBHOOK_SECRET');
}

/**
 * Verify Up Bank webhook signature.
 * Up sends X-Up-Authenticity-Signature as HMAC-SHA256 of the request body.
 */
function verifySignature(body: Buffer, signature: string): boolean {
  const secret = getWebhookSecret();
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

/**
 * POST /webhooks/up — receive Up Bank transaction webhooks.
 * This route bypasses API key auth (uses signature verification instead).
 */
router.post('/webhooks/up', (req, res) => {
  const signature = req.headers['x-up-authenticity-signature'];
  if (typeof signature !== 'string') {
    res.status(401).json({ error: 'Missing signature header' });
    return;
  }

  // req.body is a Buffer when using express.raw()
  const rawBody = req.body as Buffer;
  if (!verifySignature(rawBody, signature)) {
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  const payload = JSON.parse(rawBody.toString('utf-8')) as {
    data?: {
      attributes?: { eventType?: string };
      relationships?: { transaction?: { data?: { id?: string } } };
    };
  };

  const eventType = payload.data?.attributes?.eventType;
  const transactionId = payload.data?.relationships?.transaction?.data?.id;

  console.warn(`[webhook/up] Event: ${eventType}, Transaction: ${transactionId}`);

  // TODO: Re-fetch transaction from Up API to verify it exists
  // TODO: Run entity matching
  // TODO: Write to SQLite

  // Acknowledge quickly — process async if needed
  res.status(200).json({ received: true });
});

/**
 * POST /webhooks/up/ping — Up sends a ping to verify the endpoint.
 */
router.post('/webhooks/up/ping', (_req, res) => {
  res.status(200).json({ ok: true });
});

export default router;
