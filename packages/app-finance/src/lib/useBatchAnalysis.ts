/**
 * Hook to accumulate user corrections during import review and
 * periodically trigger batch analysis via corrections.generateRules.
 *
 * Debounces requests — waits 3s after last correction before firing.
 * Only triggers when threshold (5+ corrections) is reached.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "./trpc";

export interface CorrectionEntry {
  description: string;
  entityName: string | null;
  amount: number;
  account: string;
  currentTags: string[];
}

export interface ProposedRule {
  descriptionPattern: string;
  matchType: "exact" | "contains" | "regex";
  tags: string[];
  reasoning: string;
}

const BATCH_THRESHOLD = 5;
const DEBOUNCE_MS = 3000;

export function useBatchAnalysis() {
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [proposals, setProposals] = useState<ProposedRule[]>([]);
  const [dismissedPatterns, setDismissedPatterns] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnalyzedCountRef = useRef(0);

  const generateRulesMutation = trpc.core.corrections.generateRules.useMutation({
    onSuccess: (data) => {
      if (data.proposals) {
        setProposals((prev) => {
          // Merge new proposals, avoiding duplicates by pattern
          const existingPatterns = new Set(prev.map((p) => p.descriptionPattern));
          const newOnes = data.proposals.filter(
            (p: ProposedRule) => !existingPatterns.has(p.descriptionPattern)
          );
          return [...prev, ...newOnes];
        });
      }
    },
  });

  const triggerAnalysis = useCallback(
    (batch: CorrectionEntry[]) => {
      if (batch.length === 0) return;
      const capped = batch.slice(0, 50); // API limit
      generateRulesMutation.mutate({ transactions: capped });
      lastAnalyzedCountRef.current = batch.length;
    },
    [generateRulesMutation]
  );

  const addCorrection = useCallback(
    (entry: CorrectionEntry) => {
      setCorrections((prev) => {
        // Deduplicate by description
        if (prev.some((c) => c.description === entry.description)) return prev;
        const updated = [...prev, entry];

        // Check threshold against new corrections since last analysis
        const newSinceLastAnalysis = updated.length - lastAnalyzedCountRef.current;
        if (newSinceLastAnalysis >= BATCH_THRESHOLD) {
          // Clear existing debounce
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            triggerAnalysis(updated);
          }, DEBOUNCE_MS);
        }

        return updated;
      });
    },
    [triggerAnalysis]
  );

  const seedTransactions = useCallback(
    (entries: CorrectionEntry[]) => {
      setCorrections((prev) => {
        const existingDescs = new Set(prev.map((c) => c.description));
        const newEntries = entries.filter((e) => !existingDescs.has(e.description));
        const updated = [...prev, ...newEntries];

        if (updated.length >= BATCH_THRESHOLD && lastAnalyzedCountRef.current === 0) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            triggerAnalysis(updated);
          }, DEBOUNCE_MS);
        }

        return updated;
      });
    },
    [triggerAnalysis]
  );

  const dismissProposal = useCallback((pattern: string) => {
    setDismissedPatterns((prev) => new Set([...prev, pattern]));
    setProposals((prev) => prev.filter((p) => p.descriptionPattern !== pattern));
  }, []);

  const acceptProposal = useCallback((pattern: string) => {
    setProposals((prev) => prev.filter((p) => p.descriptionPattern !== pattern));
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const visibleProposals = proposals.filter((p) => !dismissedPatterns.has(p.descriptionPattern));

  return {
    proposals: visibleProposals,
    isAnalyzing: generateRulesMutation.isPending,
    addCorrection,
    seedTransactions,
    dismissProposal,
    acceptProposal,
    correctionCount: corrections.length,
  };
}
