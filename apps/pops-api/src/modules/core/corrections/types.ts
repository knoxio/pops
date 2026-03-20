import { z } from "zod";
import type { TransactionCorrectionRow } from "@pops/db-types";

export type CorrectionRow = TransactionCorrectionRow;

/**
 * API response shape (camelCase)
 */
export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: "exact" | "contains" | "regex";
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: "purchase" | "transfer" | "income" | null;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Map a SQLite row to API response shape
 */
export function toCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: (() => {
      try {
        const parsed = JSON.parse(row.tags) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
        return [];
      } catch {
        return [];
      }
    })(),
    transactionType: row.transactionType,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * Normalize description for pattern matching
 */
export function normalizeDescription(description: string): string {
  return description
    .toUpperCase()
    .replace(/\d+/g, "") // Remove numbers
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Zod schema for creating a correction
 */
export const CreateCorrectionSchema = z.object({
  descriptionPattern: z.string().min(1),
  matchType: z.enum(["exact", "contains", "regex"]).default("exact"),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
});
export type CreateCorrectionInput = z.infer<typeof CreateCorrectionSchema>;

/**
 * Zod schema for updating a correction
 */
export const UpdateCorrectionSchema = z.object({
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  transactionType: z.enum(["purchase", "transfer", "income"]).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type UpdateCorrectionInput = z.infer<typeof UpdateCorrectionSchema>;

/**
 * Zod schema for finding matching correction
 */
export const FindCorrectionSchema = z.object({
  description: z.string().min(1),
  minConfidence: z.number().min(0).max(1).default(0.7),
});
export type FindCorrectionInput = z.infer<typeof FindCorrectionSchema>;
