import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '../../../lib/logger.js';
import { NotFoundError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import { TagRuleChangeSetSchema } from './types.js';

export const tagRulesRouter = router({
  listVocabulary: protectedProcedure.query(() => {
    return { tags: service.listVocabulary() };
  }),

  proposeTagRuleChangeSet: protectedProcedure
    .input(
      z.object({
        signal: z.object({
          descriptionPattern: z.string().min(1),
          matchType: z.enum(['exact', 'contains', 'regex']),
          entityId: z.string().nullable().optional(),
          tags: z.array(z.string()).min(1),
        }),
        transactions: z
          .array(
            z.object({
              transactionId: z.string().min(1),
              description: z.string().min(1),
              entityId: z.string().nullable().optional(),
              userTags: z.array(z.string()).optional(),
            })
          )
          .default([]),
        maxPreviewItems: z.coerce.number().int().positive().max(500).default(200),
      })
    )
    .query(({ input }) => {
      return service.proposeTagRuleChangeSet({
        signal: input.signal,
        transactions: input.transactions,
        maxPreviewItems: input.maxPreviewItems,
      });
    }),

  previewTagRuleChangeSet: protectedProcedure
    .input(
      z.object({
        changeSet: TagRuleChangeSetSchema,
        transactions: z.array(
          z.object({
            transactionId: z.string().min(1),
            description: z.string().min(1),
            entityId: z.string().nullable().optional(),
            userTags: z.array(z.string()).optional(),
          })
        ),
        maxPreviewItems: z.coerce.number().int().positive().max(500).default(200),
      })
    )
    .query(({ input }) => {
      return service.previewTagRuleChangeSet({
        changeSet: input.changeSet,
        transactions: input.transactions,
        maxPreviewItems: input.maxPreviewItems,
      });
    }),

  applyTagRuleChangeSet: protectedProcedure
    .input(
      z.object({
        changeSet: TagRuleChangeSetSchema,
        acceptedNewTags: z.array(z.string()).optional().default([]),
      })
    )
    .mutation(({ input }) => {
      logger.info(
        { opCount: input.changeSet.ops.length, acceptedNewTags: input.acceptedNewTags.length },
        '[TagRules] Apply ChangeSet'
      );

      // Persist newly-accepted tags into vocabulary before applying rules.
      for (const t of input.acceptedNewTags) {
        if (t.trim()) service.upsertVocabularyTag(t.trim(), 'user');
      }

      try {
        const rules = service.applyTagRuleChangeSet(input.changeSet);
        return { rules };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  rejectTagRuleChangeSet: protectedProcedure
    .input(
      z.object({
        changeSet: TagRuleChangeSetSchema,
        feedback: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      logger.info(
        { opCount: input.changeSet.ops.length, feedbackLength: input.feedback.length },
        '[TagRules] Reject ChangeSet'
      );
      // v1: audit persistence can be added later; ensure feedback required and no changes are applied.
      return { message: 'Tag rule ChangeSet rejected' };
    }),
});
