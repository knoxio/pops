import { z } from 'zod';

export const CreateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']).default('exact'),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  transactionType: z.enum(['purchase', 'transfer', 'income']).nullable().optional(),
  priority: z.number().int().nonnegative().optional(),
});
export type CreateCorrectionInput = z.infer<typeof CreateCorrectionSchema>;

export const CorrectionSignalSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(['exact', 'contains', 'regex']),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: z.enum(['purchase', 'transfer', 'income']).nullable().optional(),
});
export type CorrectionSignal = z.infer<typeof CorrectionSignalSchema>;

export const AdaptedSignalSchema = CorrectionSignalSchema;

export const UpdateCorrectionSchema = z.object({
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: z.enum(['purchase', 'transfer', 'income']).nullable().optional(),
  isActive: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  priority: z.number().int().nonnegative().optional(),
});
export type UpdateCorrectionInput = z.infer<typeof UpdateCorrectionSchema>;

export const FindCorrectionSchema = z.object({
  description: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.7),
});
export type FindCorrectionInput = z.infer<typeof FindCorrectionSchema>;
