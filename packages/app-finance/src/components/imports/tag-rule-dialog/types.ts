import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

export type ProposeOutput =
  inferRouterOutputs<AppRouter>['core']['tagRules']['proposeTagRuleChangeSet'];
export type RejectOutput =
  inferRouterOutputs<AppRouter>['core']['tagRules']['rejectTagRuleChangeSet'];

export interface TagRuleLearnSignal {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  tags: string[];
}

export interface TagRuleProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: TagRuleLearnSignal | null;
  previewTransactions: Array<{
    checksum: string;
    description: string;
    entityId?: string | null;
  }>;
  onApplied?: (
    changeSet: ProposeOutput['changeSet'],
    affected: ProposeOutput['preview']['affected']
  ) => void;
}

export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function collectNewTagNames(proposal: ProposeOutput | undefined): string[] {
  if (!proposal) return [];
  const names = new Set<string>();
  for (const row of proposal.preview.affected) {
    for (const s of row.after.suggestedTags) {
      if (s.isNew) names.add(s.tag);
    }
  }
  return [...names].toSorted((a, b) => a.localeCompare(b));
}
