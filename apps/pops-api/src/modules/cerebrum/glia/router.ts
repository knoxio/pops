/**
 * tRPC router for Glia trust graduation.
 *
 * Thin adapter over GliaActionService and GliaTrustMachine — no business
 * logic lives here. Provides the API surface for the proposal queue,
 * trust state inspection, and audit trail.
 *
 * PRD-086 US-01 (API layer), US-04 (audit trail queries).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  ConflictError,
  HttpError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getGliaServices } from './instance.js';
import { ACTION_STATUSES, ACTION_TYPES, USER_DECISIONS } from './types.js';

const periodSchema = z.enum(['daily', 'weekly']);

import type { ActionType } from './types.js';

const actionTypeSchema = z.enum(ACTION_TYPES);
const statusSchema = z.enum(ACTION_STATUSES);
const decisionSchema = z.enum(USER_DECISIONS);

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    const details = err.details;
    let message: string;
    if (typeof details === 'string') {
      message = details;
    } else if (
      typeof details === 'object' &&
      details !== null &&
      typeof (details as { message?: unknown }).message === 'string'
    ) {
      message = (details as { message: string }).message;
    } else {
      message = err.message;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message, cause: err });
  }
  if (err instanceof ConflictError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
  }
  if (err instanceof HttpError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
  throw err;
}

const actionsRouter = router({
  /** List actions with optional filters (proposal queue + audit trail). */
  list: protectedProcedure
    .input(
      z
        .object({
          actionType: actionTypeSchema.optional(),
          status: statusSchema.optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const { actionService } = getGliaServices();
      return actionService.listActions(input ?? {});
    }),

  /** Get a single action by ID. */
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const { actionService } = getGliaServices();
    const action = actionService.getAction(input.id);
    if (!action) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Action '${input.id}' not found` });
    }
    return { action };
  }),

  /** Record a user decision on a pending action. */
  decide: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        decision: decisionSchema,
        note: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        const { actionService, trustMachine } = getGliaServices();
        const action = actionService.decideAction(input.id, input.decision, input.note);

        // Eagerly evaluate graduation after every decision
        const transition = trustMachine.checkGraduation(action.actionType as ActionType);

        return { action, transition };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /** Execute an approved action. */
  execute: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    try {
      const { actionService } = getGliaServices();
      return { action: actionService.executeAction(input.id) };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Revert an executed action. */
  revert: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    try {
      const { actionService, trustMachine } = getGliaServices();
      const action = actionService.revertAction(input.id);

      // Eagerly evaluate demotion after every revert
      const transition = trustMachine.checkGraduation(action.actionType as ActionType);

      return { action, transition };
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Paginated action history with filters (audit trail). */
  history: protectedProcedure
    .input(
      z.object({
        actionType: actionTypeSchema.optional(),
        status: statusSchema.optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      })
    )
    .query(({ input }) => {
      const { actionService } = getGliaServices();
      return actionService.listActions(input);
    }),
});

const trustStateRouter = router({
  /** Get trust state for a single action type. */
  get: protectedProcedure.input(z.object({ actionType: actionTypeSchema })).query(({ input }) => {
    const { actionService } = getGliaServices();
    const state = actionService.getTrustState(input.actionType);
    if (!state) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Trust state for '${input.actionType}' not found`,
      });
    }
    return { state };
  }),

  /** List all trust states. */
  list: protectedProcedure.query(() => {
    const { actionService } = getGliaServices();
    return { states: actionService.listTrustStates() };
  }),
});

/**
 * `cerebrum.glia.digest` — summarise autonomous actions for the configured
 * period and (optionally) deliver via shell + Moltbot.
 *
 * Suppression rules (PRD-086 US-04 AC #6):
 *   - Action types in `silent` phase do not emit a digest.
 *   - Empty periods are not delivered.
 *
 * The returned payload reflects whatever ran: callers can read
 * `delivery.attempted` and `delivery.suppressedReason` to understand why a
 * notification did or did not fire.
 */
const digestProcedure = protectedProcedure
  .input(
    z
      .object({
        period: periodSchema.optional(),
        actionType: actionTypeSchema.optional(),
        rejectionRateThreshold: z.number().gt(0).lte(1).optional(),
        deliver: z.boolean().optional(),
      })
      .optional()
  )
  .mutation(async ({ input }) => {
    try {
      const { digestService } = getGliaServices();
      return digestService.generate(input ?? {});
    } catch (err) {
      toTrpcError(err);
    }
  });

export const gliaRouter = router({
  actions: actionsRouter,
  trustState: trustStateRouter,
  digest: digestProcedure,
});
