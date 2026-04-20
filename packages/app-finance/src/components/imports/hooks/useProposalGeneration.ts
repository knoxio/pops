import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

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

function computeFallbackPattern(description: string): string {
  return description.toUpperCase().replaceAll(/\d+/g, '').replaceAll(/\s+/g, ' ').trim();
}

function buildTriggeringContext(transaction: ProcessedTransaction): TriggeringTransaction {
  return {
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    account: transaction.account,
    location: transaction.location ?? null,
    previousEntityName: transaction.entity?.entityName ?? null,
    previousTransactionType: transaction.transactionType ?? null,
  };
}

interface GenerateArgs {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}

interface GenerateDeps {
  analyzeCorrectionMutation: ReturnType<typeof trpc.core.corrections.analyzeCorrection.useMutation>;
  setProposalSignal: React.Dispatch<React.SetStateAction<ProposalSignal | null>>;
  setProposalTriggeringTransaction: React.Dispatch<
    React.SetStateAction<TriggeringTransaction | null>
  >;
  setProposalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

async function runGenerate(args: GenerateArgs, deps: GenerateDeps): Promise<void> {
  const originalDescription = args.triggeringTransaction.description;
  const originalAmount = args.triggeringTransaction.amount;
  const fallbackPattern = computeFallbackPattern(originalDescription);
  const triggeringContext = buildTriggeringContext(args.triggeringTransaction);
  const baseSignal = {
    entityId: args.entityId,
    entityName: args.entityName,
    location: args.location ?? null,
    transactionType: args.transactionType ?? null,
    tags: [] as string[],
  };
  try {
    const res = await deps.analyzeCorrectionMutation.mutateAsync({
      description: originalDescription,
      entityName: args.entityName ?? 'unknown',
      amount: originalAmount,
    });
    const analysis = res.data;
    const useAi = analysis && analysis.pattern.length >= 3;
    deps.setProposalSignal({
      descriptionPattern: useAi ? analysis.pattern : fallbackPattern,
      matchType: useAi ? analysis.matchType : 'contains',
      ...baseSignal,
    });
    deps.setProposalTriggeringTransaction(triggeringContext);
    deps.setProposalOpen(true);
    toast.success('Proposal generated — review and approve to learn');
  } catch {
    deps.setProposalSignal({
      descriptionPattern: fallbackPattern,
      matchType: 'contains',
      ...baseSignal,
    });
    deps.setProposalTriggeringTransaction(triggeringContext);
    deps.setProposalOpen(true);
    toast.info('Proposal generated (fallback) — review and approve to learn');
  }
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

  const generateProposal = useCallback(
    (args: GenerateArgs) =>
      runGenerate(args, {
        analyzeCorrectionMutation,
        setProposalSignal,
        setProposalTriggeringTransaction,
        setProposalOpen,
      }),
    [analyzeCorrectionMutation]
  );

  const openRuleProposalDialog = useCallback(
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
    openRuleProposalDialog,
  };
}
