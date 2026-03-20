import { z } from "zod";

/**
 * Database row shape for transaction_corrections table
 */
export interface CorrectionRow {
  id: string;
  description_pattern: string;
  match_type: "exact" | "contains" | "regex";
  entity_id: string | null;
  entity_name: string | null;
  location: string | null;
  tags: string; // JSON array string
  transaction_type: "purchase" | "transfer" | "income" | null;
  confidence: number;
  times_applied: number;
  created_at: string;
  last_used_at: string | null;
}

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
    descriptionPattern: row.description_pattern,
    matchType: row.match_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
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
    transactionType: row.transaction_type,
    confidence: row.confidence,
    timesApplied: row.times_applied,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
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
