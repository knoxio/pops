import { z } from "zod";

/**
 * Overall AI usage statistics
 */
export const aiUsageStatsOutputSchema = z.object({
  totalCost: z.number(),
  totalApiCalls: z.number(),
  totalCacheHits: z.number(),
  cacheHitRate: z.number(),
  avgCostPerCall: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  last30Days: z
    .object({
      cost: z.number(),
      apiCalls: z.number(),
      cacheHits: z.number(),
    })
    .optional(),
});

export type AiUsageStatsOutput = z.infer<typeof aiUsageStatsOutputSchema>;

/**
 * Input for getHistory endpoint
 */
export const getHistoryInputSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type GetHistoryInput = z.infer<typeof getHistoryInputSchema>;

/**
 * AI usage history record
 */
export const aiUsageHistoryRecordSchema = z.object({
  date: z.string(),
  apiCalls: z.number(),
  cacheHits: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cost: z.number(),
});

export type AiUsageHistoryRecord = z.infer<typeof aiUsageHistoryRecordSchema>;

/**
 * Output for getHistory endpoint
 */
export const aiUsageHistoryOutputSchema = z.object({
  records: z.array(aiUsageHistoryRecordSchema),
  summary: z.object({
    totalCost: z.number(),
    totalApiCalls: z.number(),
    totalCacheHits: z.number(),
  }),
});

export type AiUsageHistoryOutput = z.infer<typeof aiUsageHistoryOutputSchema>;
