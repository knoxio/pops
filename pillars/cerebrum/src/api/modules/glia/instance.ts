/**
 * Glia runtime wiring for the cerebrum pillar.
 *
 * Builds the action service, trust machine, and digest service bound to a
 * `CerebrumDb` handle. Unlike the monolith (which resolved an
 * AsyncLocalStorage-scoped Drizzle handle per request), the pillar threads the
 * injected handle straight through — the handlers build a per-request bundle so
 * a `now` clock can be injected in tests.
 *
 * Config-path resolution for `glia.toml` (graduation thresholds) mirrors the
 * reflex slice's TOML resolution and is tolerant of a missing file (falls back
 * to the hardcoded ADR-021 defaults).
 */
import { join } from 'node:path';

import { GliaActionService } from './action-service.js';
import { buildDefaultDigestChannels } from './digest-channels.js';
import { GliaDigestService } from './digest-service.js';
import { makeGliaThresholdReader } from './thresholds.js';
import { GliaTrustMachine } from './trust-machine.js';

import type { CerebrumDb } from '../../../db/index.js';
import type { DigestDeliveryChannels } from './digest-channels.js';

/**
 * Resolve the absolute path to `glia.toml`.
 *
 * Resolution order:
 *   1. `CEREBRUM_GLIA_CONFIG` — explicit path to `glia.toml`.
 *   2. `CEREBRUM_GLIA_CONFIG_DIR` (or `CEREBRUM_ENGRAMS_DIR`) — a directory
 *      whose `.config/glia.toml` is used (parity with the monolith's engram
 *      root layout).
 *   3. A default under the cwd that almost certainly does not exist, yielding
 *      the hardcoded ADR-021 defaults.
 */
export function resolveGliaConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env['CEREBRUM_GLIA_CONFIG'];
  if (explicit && explicit.length > 0) return explicit;

  const dir = env['CEREBRUM_GLIA_CONFIG_DIR'] ?? env['CEREBRUM_ENGRAMS_DIR'];
  if (dir && dir.length > 0) return join(dir, '.config', 'glia.toml');

  return join(process.cwd(), 'data', 'engrams', '.config', 'glia.toml');
}

export interface GliaServices {
  actionService: GliaActionService;
  trustMachine: GliaTrustMachine;
  digestService: GliaDigestService;
}

export interface BuildGliaServicesOptions {
  db: CerebrumDb;
  /** Absolute path to `glia.toml` (graduation thresholds). */
  configPath: string;
  /** Injectable clock — tests pin this for deterministic transitions. */
  now?: () => Date;
  /**
   * Delivery channels for the digest. Defaults to the shell (`nudge_log`) +
   * env-gated Telegram pair bound to `db`. Pass explicit channels in tests.
   */
  channels?: DigestDeliveryChannels;
}

/** Build the glia services bundle bound to `db`. */
export function buildGliaServices(options: BuildGliaServicesOptions): GliaServices {
  const now = options.now ?? (() => new Date());
  const actionService = new GliaActionService(options.db, now);
  const trustMachine = new GliaTrustMachine(
    actionService,
    makeGliaThresholdReader(options.configPath),
    now
  );
  const digestService = new GliaDigestService(actionService, {
    now,
    channels: options.channels ?? buildDefaultDigestChannels(options.db),
  });

  return { actionService, trustMachine, digestService };
}
