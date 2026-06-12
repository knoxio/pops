import {
  errSummary,
  PillarRegistrationFailedError,
  PillarRegistrationRejectedError,
} from './errors.js';
import { RegistryTransportError, type RegistryTransport } from './transport.js';

import type { ManifestPayload } from '../manifest-schema/schema.js';
import type { BootstrapLogger } from './logger.js';

export interface RegisterWithRetryArgs {
  transport: RegistryTransport;
  manifest: ManifestPayload;
  logger: BootstrapLogger;
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  setTimeoutImpl: typeof setTimeout;
}

export async function registerWithRetry(args: RegisterWithRetryArgs): Promise<void> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < args.maxAttempts) {
    attempt += 1;
    try {
      await args.transport.register(args.manifest);
      args.logger.info('[pillar-sdk] registered with registry', {
        pillar: args.manifest.pillar,
        attempt,
      });
      return;
    } catch (err) {
      lastErr = err;
      if (err instanceof RegistryTransportError && !err.retriable) {
        throw new PillarRegistrationRejectedError(err.status, err.issues ?? []);
      }
      if (attempt >= args.maxAttempts) break;
      await waitForRetry(args, attempt, err);
    }
  }

  throw new PillarRegistrationFailedError(attempt, lastErr);
}

async function waitForRetry(
  args: RegisterWithRetryArgs,
  attempt: number,
  err: unknown
): Promise<void> {
  const backoff = Math.min(args.initialBackoffMs * 2 ** (attempt - 1), args.maxBackoffMs);
  args.logger.warn('[pillar-sdk] registration attempt failed, retrying', {
    pillar: args.manifest.pillar,
    attempt,
    nextDelayMs: backoff,
    err: errSummary(err),
  });
  await sleep(backoff, args.setTimeoutImpl);
}

function sleep(ms: number, setTimeoutImpl: typeof setTimeout): Promise<void> {
  return new Promise((resolve) => {
    setTimeoutImpl(resolve, ms);
  });
}
