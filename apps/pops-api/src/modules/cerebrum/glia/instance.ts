/**
 * Shared Glia runtime wiring.
 *
 * Builds GliaActionService and GliaTrustMachine bound to the current
 * request's Drizzle context. Resolved per-call so env-scoped DB context
 * (AsyncLocalStorage) is honoured like every other module.
 */
import { getDrizzle } from '../../../db.js';
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
  const actionService = new GliaActionService(getDrizzle());
  const trustMachine = new GliaTrustMachine(actionService);
  const digestService = new GliaDigestService(actionService, {
    channels: defaultDigestChannels,
  });

  return { actionService, trustMachine, digestService };
}
