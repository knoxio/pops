/**
 * ts-rest handlers for `cerebrum.glia.*` (pillars/cerebrum/docs/prds/trust-graduation).
 *
 * Builds a per-request glia services bundle bound to the pillar DB handle, then
 * delegates to it. The services throw the pillar `HttpError` subclasses;
 * `runHttp` maps `NotFoundError` → 404, `ConflictError` → 409, and
 * `ValidationError` → 400.
 *
 * `decide` and `revert` eagerly re-evaluate graduation via the trust machine
 * after the (transactional) state change. `revert` additionally performs the
 * file-level undo through the in-pillar {@link EngramService} — wired here from
 * the same db + engram root + template registry the engrams slice uses, so a
 * prune/consolidate/link revert restores or unlinks the affected engrams.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumGliaContract } from '../../contract/rest-glia.js';
import { type CerebrumDb } from '../../db/index.js';
import { EngramService } from '../modules/engrams/service.js';
import { buildGliaServices } from '../modules/glia/instance.js';
import { executeRevert } from '../modules/glia/revert-operations.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

export interface GliaHandlerDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
  /** Absolute path to `glia.toml` (graduation thresholds). */
  configPath: string;
}

export function makeGliaHandlers(
  deps: GliaHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumGliaContract>> {
  const services = () => buildGliaServices({ db: deps.db, configPath: deps.configPath });
  const engramService = (): EngramService =>
    new EngramService({ root: deps.engramRoot, db: deps.db, templates: deps.templates });

  return server.router(cerebrumGliaContract, {
    actions: {
      list: async ({ body }) => {
        const { actionService } = services();
        return { status: 200, body: actionService.listActions(body) };
      },

      get: async ({ params }) =>
        runHttp(() => {
          const { actionService } = services();
          const action = actionService.getAction(params.id);
          if (!action) throw new NotFoundError('GliaAction', params.id);
          return { status: 200, body: { action } };
        }),

      decide: async ({ params, body }) =>
        runHttp(() => {
          const { actionService, trustMachine } = services();
          const action = actionService.decideAction(params.id, body.decision, body.note);
          const transition = trustMachine.checkGraduation(action.actionType);
          return { status: 200, body: { action, transition } };
        }),

      execute: async ({ params }) =>
        runHttp(() => {
          const { actionService } = services();
          return { status: 200, body: { action: actionService.executeAction(params.id) } };
        }),

      revert: async ({ params }) =>
        runHttp(() => {
          const { actionService, trustMachine } = services();
          const action = actionService.revertAction(params.id);
          const revertResult = executeRevert(action, engramService());
          const transition = trustMachine.checkGraduation(action.actionType);
          return { status: 200, body: { action, transition, revertResult } };
        }),

      history: async ({ body }) => {
        const { actionService } = services();
        return { status: 200, body: actionService.listActions(body) };
      },
    },

    trustState: {
      get: async ({ params }) =>
        runHttp(() => {
          const { actionService } = services();
          const state = actionService.getTrustState(params.actionType);
          if (!state) throw new NotFoundError('GliaTrustState', params.actionType);
          return { status: 200, body: { state } };
        }),

      list: async () => {
        const { actionService } = services();
        return { status: 200, body: { states: actionService.listTrustStates() } };
      },
    },

    digest: async ({ body }) =>
      runHttp(async () => {
        const { digestService } = services();
        return { status: 200, body: await digestService.generate(body) };
      }),
  });
}
