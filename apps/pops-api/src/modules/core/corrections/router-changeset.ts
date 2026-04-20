import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '../../../lib/logger.js';
import { NotFoundError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import {
  PREVIEW_RULES_FETCH_LIMIT,
  previewInput,
  proposeInput,
  rejectInput,
  reviseInput,
} from './router-changeset-schemas.js';
import * as service from './service.js';
import { ChangeSetSchema, toCorrection } from './types.js';

export const changesetRouter = router({
  previewChangeSet: protectedProcedure.input(previewInput).mutation(({ input, ctx }) => {
    const dbRules = service.listCorrections(undefined, PREVIEW_RULES_FETCH_LIMIT, 0).rows;
    const baselineRules =
      input.pendingChangeSets && input.pendingChangeSets.length > 0
        ? input.pendingChangeSets.reduce(
            (acc, pcs) => service.applyChangeSetToRules(acc, pcs.changeSet),
            dbRules
          )
        : dbRules;

    try {
      const result = service.previewChangeSetImpact({
        rules: baselineRules,
        changeSet: input.changeSet,
        transactions: input.transactions,
        minConfidence: input.minConfidence,
      });
      logger.info({
        event: 'corrections.proposal.preview',
        userEmail: ctx.user.email,
        opCount: input.changeSet.ops.length,
        ops: input.changeSet.ops,
        transactionCount: input.transactions.length,
        minConfidence: input.minConfidence,
        impactSummary: result.summary,
      });
      return result;
    } catch (err) {
      logger.error({
        event: 'corrections.proposal.preview',
        userEmail: ctx.user.email,
        opCount: input.changeSet.ops.length,
        ops: input.changeSet.ops,
        transactionCount: input.transactions.length,
        minConfidence: input.minConfidence,
        err,
      });
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  applyChangeSet: protectedProcedure
    .input(z.object({ changeSet: ChangeSetSchema }))
    .mutation(({ input, ctx }) => {
      try {
        const rows = service.applyChangeSet(input.changeSet);
        logger.info({
          event: 'corrections.proposal.apply',
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          outcome: 'approved',
          resultRuleCount: rows.length,
        });
        return { data: rows.map(toCorrection), message: 'ChangeSet applied' };
      } catch (err) {
        logger.error({
          event: 'corrections.proposal.apply',
          userEmail: ctx.user.email,
          opCount: input.changeSet.ops.length,
          ops: input.changeSet.ops,
          outcome: 'apply_failed',
          err,
        });
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  proposeChangeSet: protectedProcedure.input(proposeInput).query(async ({ input }) => {
    try {
      return await service.proposeChangeSetFromCorrectionSignal({
        signal: input.signal,
        minConfidence: input.minConfidence,
        maxPreviewItems: input.maxPreviewItems,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  reviseChangeSet: protectedProcedure.input(reviseInput).mutation(async ({ input, ctx }) => {
    try {
      const result = await service.reviseChangeSet({
        signal: input.signal,
        currentChangeSet: input.currentChangeSet,
        instruction: input.instruction,
        triggeringTransactions: input.triggeringTransactions,
      });
      logger.info({
        event: 'corrections.proposal.revise',
        userEmail: ctx.user.email,
        instructionLength: input.instruction.length,
        inputOpCount: input.currentChangeSet.ops.length,
        outputOpCount: result.changeSet.ops.length,
        triggeringTransactionCount: input.triggeringTransactions.length,
      });
      return result;
    } catch (err) {
      logger.error({
        event: 'corrections.proposal.revise',
        userEmail: ctx.user.email,
        instructionLength: input.instruction.length,
        inputOpCount: input.currentChangeSet.ops.length,
        triggeringTransactionCount: input.triggeringTransactions.length,
        err,
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          err instanceof Error
            ? `Failed to revise ChangeSet: ${err.message}`
            : 'Failed to revise ChangeSet',
        cause: err,
      });
    }
  }),

  rejectChangeSet: protectedProcedure.input(rejectInput).mutation(({ input, ctx }) => {
    try {
      service.persistRejectedChangeSetFeedback({
        signal: input.signal,
        changeSet: input.changeSet,
        feedback: input.feedback,
        impactSummary: input.impactSummary ?? null,
        userEmail: ctx.user.email,
      });
    } catch (err) {
      logger.error({
        event: 'corrections.proposal.reject.persistence_failed',
        userEmail: ctx.user.email,
        opCount: input.changeSet.ops.length,
        ops: input.changeSet.ops,
        err,
      });
    }
    logger.info({
      event: 'corrections.proposal.reject',
      userEmail: ctx.user.email,
      opCount: input.changeSet.ops.length,
      ops: input.changeSet.ops,
      outcome: 'rejected',
      feedback: input.feedback,
      impactSummary: input.impactSummary ?? null,
    });
    return { message: 'ChangeSet rejected' };
  }),
});
