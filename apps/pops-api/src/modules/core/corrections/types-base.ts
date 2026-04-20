import { parseJsonStringArray } from '../../../shared/json.js';

import type { TransactionCorrectionRow } from '@pops/db-types';

export type CorrectionRow = TransactionCorrectionRow;

export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export type CorrectionMatchStatus = 'matched' | 'uncertain';

export interface CorrectionMatchResult {
  correction: CorrectionRow;
  status: CorrectionMatchStatus;
}

export function classifyCorrectionMatch(correction: CorrectionRow): CorrectionMatchResult {
  return {
    correction,
    status: correction.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'matched' : 'uncertain',
  };
}

export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export function toCorrection(row: CorrectionRow): Correction {
  return {
    id: row.id,
    descriptionPattern: row.descriptionPattern,
    matchType: row.matchType,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    tags: parseJsonStringArray(row.tags),
    transactionType: row.transactionType,
    isActive: Boolean(row.isActive),
    priority: row.priority,
    confidence: row.confidence,
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export function correctionToRow(c: Correction): CorrectionRow {
  return {
    id: c.id,
    descriptionPattern: c.descriptionPattern,
    matchType: c.matchType,
    entityId: c.entityId,
    entityName: c.entityName,
    location: c.location,
    tags: JSON.stringify(c.tags),
    transactionType: c.transactionType,
    isActive: c.isActive,
    confidence: c.confidence,
    priority: c.priority,
    timesApplied: c.timesApplied,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
  };
}

export function normalizeDescription(description: string): string {
  return description.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}

export interface CorrectionMatchSummary {
  matched: boolean;
  status: CorrectionMatchStatus | null;
  ruleId: string | null;
  confidence: number | null;
}

export interface ChangeSetPreviewDiff {
  checksum?: string;
  description: string;
  before: CorrectionMatchSummary;
  after: CorrectionMatchSummary;
  changed: boolean;
}

export interface ChangeSetPreviewSummary {
  total: number;
  newMatches: number;
  removedMatches: number;
  statusChanges: number;
  netMatchedDelta: number;
}
