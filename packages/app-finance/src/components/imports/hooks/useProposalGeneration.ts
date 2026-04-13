import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '../../../lib/trpc';
import type { ProcessedTransaction } from '../../../store/importStore';

export interface ProposalSignal {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  tags?: string[];
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}

export interface TriggeringTransaction {
  description: string;
  amount: number;
  date: string;
  account: string;
  location?: string | null;
  previousEntityName?: string | null;
  previousTransactionType?: 'purchase' | 'transfer' | 'income' | null;
}

/**
 * Manages proposal generation, correction analysis, and the proposal/browse
 * dialog state for the ReviewStep.
 */
export function useProposalGeneration() {
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalSignal, setProposalSignal] = useState<ProposalSignal | null>(null);
  const [proposalTriggeringTransaction, setProposalTriggeringTransaction] =
    useState<TriggeringTransaction | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const analyzeCorrectionMutation = trpc.core.corrections.analyzeCorrection.useMutation();

  const computeFallbackPattern = useCallback((description: string) => {
    return description.toUpperCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  }, []);

  const generateProposal = useCallback(
    async (args: {
      /** The triggering transaction in its original (pre-correction) state. */
      triggeringTransaction: ProcessedTransaction;
      /** The user's correction — the entity/type/location they intend to apply. */
      entityId: string | null;
      entityName: string | null;
      location?: string | null;
      transactionType?: 'purchase' | 'transfer' | 'income' | null;
    }) => {
      // The AI must analyse the ORIGINAL description, not the user's
      // correction. Otherwise the rule it learns will only ever match the
      // (already-corrected) value the user entered, defeating the point.
      const originalDescription = args.triggeringTransaction.description;
      const originalAmount = args.triggeringTransaction.amount;
      const fallbackPattern = computeFallbackPattern(originalDescription);

      const triggeringContext: TriggeringTransaction = {
        description: originalDescription,
        amount: originalAmount,
        date: args.triggeringTransaction.date,
        account: args.triggeringTransaction.account,
        location: args.triggeringTransaction.location ?? null,
        previousEntityName: args.triggeringTransaction.entity?.entityName ?? null,
        previousTransactionType: args.triggeringTransaction.transactionType ?? null,
      };

      try {
        const res = await analyzeCorrectionMutation.mutateAsync({
          description: originalDescription,
          entityName: args.entityName ?? 'unknown',
          amount: originalAmount,
        });
        const analysis = res.data;

        const suggestedPattern =
          analysis && analysis.pattern.length >= 3 ? analysis.pattern : fallbackPattern;
        const suggestedMatchType =
          analysis && analysis.pattern.length >= 3 ? analysis.matchType : 'contains';

        setProposalSignal({
          descriptionPattern: suggestedPattern,
          matchType: suggestedMatchType,
          entityId: args.entityId,
          entityName: args.entityName,
          location: args.location ?? null,
          transactionType: args.transactionType ?? null,
          tags: [],
        });
        setProposalTriggeringTransaction(triggeringContext);
        setProposalOpen(true);
        toast.success('Proposal generated — review and approve to learn');
      } catch {
        setProposalSignal({
          descriptionPattern: fallbackPattern,
          matchType: 'contains',
          entityId: args.entityId,
          entityName: args.entityName,
          location: args.location ?? null,
          transactionType: args.transactionType ?? null,
          tags: [],
        });
        setProposalTriggeringTransaction(triggeringContext);
        setProposalOpen(true);
        toast.info('Proposal generated (fallback) — review and approve to learn');
      }
    },
    [analyzeCorrectionMutation, computeFallbackPattern]
  );

  /**
   * Generate a Correction Proposal (ChangeSet) from a correction signal.
   * Rule changes only happen after explicit approval in the proposal dialog.
   */
  const autoSaveRuleAndReEvaluate = useCallback(
    (triggeringTransaction: ProcessedTransaction, entityId: string, entityName: string) => {
      void generateProposal({ triggeringTransaction, entityId, entityName });
    },
    [generateProposal]
  );

  return {
    proposalOpen,
    setProposalOpen,
    proposalSignal,
    proposalTriggeringTransaction,
    browseOpen,
    setBrowseOpen,
    generateProposal,
    autoSaveRuleAndReEvaluate,
  };
}
