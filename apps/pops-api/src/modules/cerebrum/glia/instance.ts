/**
 * Shared Glia runtime wiring.
 *
 * Builds GliaActionService and GliaTrustMachine bound to the current
 * request's Drizzle context. Resolved per-call so env-scoped DB context
 * (AsyncLocalStorage) is honoured like every other module.
 *
 * PRD-181 PR 3 — both reads and writes now route through
 * `getCerebrumDrizzle()` (`cerebrum.db`). See `GliaActionService`
 * top-of-file JSDoc for the cross-store consistency contract during
 * the cutover window.
 */
import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { GliaActionService } from './action-service.js';
import { defaultDigestChannels } from './digest-channels.js';
import { GliaDigestService } from './digest-service.js';
import { GliaTrustMachine } from './trust-machine.js';

interface GliaServices {
  actionService: GliaActionService;
  trustMachine: GliaTrustMachine;
  digestService: GliaDigestService;
}

/** Build Glia services bound to the current request's drizzle context. */
export function getGliaServices(): GliaServices {
  const actionService = new GliaActionService(getCerebrumDrizzle());
  const trustMachine = new GliaTrustMachine(actionService);
  const digestService = new GliaDigestService(actionService, {
    channels: defaultDigestChannels,
  });

  return { actionService, trustMachine, digestService };
}
