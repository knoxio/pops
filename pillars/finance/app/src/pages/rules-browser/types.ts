export type MatchType = 'exact' | 'contains' | 'regex';

export interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: MatchType;
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
