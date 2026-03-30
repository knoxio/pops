/**
 * Collapsible panel showing AI-proposed correction rules.
 * Each proposal can be accepted (saved via createOrUpdate) or dismissed.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, Check, X, Loader2 } from "lucide-react";
import { Button, Badge, cn } from "@pops/ui";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import type { ProposedRule } from "../../lib/useBatchAnalysis";

interface BatchProposalsPanelProps {
  proposals: ProposedRule[];
  isAnalyzing: boolean;
  onAccept: (pattern: string) => void;
  onDismiss: (pattern: string) => void;
}

export function BatchProposalsPanel({
  proposals,
  isAnalyzing,
  onAccept,
  onDismiss,
}: BatchProposalsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const createCorrectionMutation = trpc.core.corrections.createOrUpdate.useMutation();

  if (proposals.length === 0 && !isAnalyzing) return null;

  const handleAccept = (proposal: ProposedRule) => {
    createCorrectionMutation.mutate(
      {
        descriptionPattern: proposal.descriptionPattern,
        matchType: proposal.matchType,
        tags: proposal.tags,
      },
      {
        onSuccess: () => {
          toast.success(`Rule saved: "${proposal.descriptionPattern}"`);
          onAccept(proposal.descriptionPattern);
        },
        onError: () => {
          toast.error("Failed to save rule");
        },
      }
    );
  };

  return (
    <div className="border border-border rounded-lg bg-muted/30 mt-4">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-left hover:bg-muted/50 h-auto justify-start rounded-none"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span>
          AI-Suggested Rules
          {proposals.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {proposals.length}
            </Badge>
          )}
        </span>
        {isAnalyzing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
      </Button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {isAnalyzing && proposals.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Analyzing corrections...</p>
          )}

          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.descriptionPattern}
              proposal={proposal}
              onAccept={() => handleAccept(proposal)}
              onDismiss={() => onDismiss(proposal.descriptionPattern)}
              isSaving={createCorrectionMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  onAccept,
  onDismiss,
  isSaving,
}: {
  proposal: ProposedRule;
  onAccept: () => void;
  onDismiss: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-card rounded-md border border-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
            {proposal.descriptionPattern}
          </code>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              proposal.matchType === "exact" && "border-green-500/50 text-green-600",
              proposal.matchType === "contains" && "border-blue-500/50 text-blue-600",
              proposal.matchType === "regex" && "border-purple-500/50 text-purple-600"
            )}
          >
            {proposal.matchType}
          </Badge>
          {proposal.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        {proposal.reasoning && (
          <p className="text-xs text-muted-foreground mt-1">{proposal.reasoning}</p>
        )}
      </div>

      <div className="flex gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={onAccept}
          disabled={isSaving}
          className="h-8 w-8 p-0"
          aria-label="Accept rule"
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="h-8 w-8 p-0"
          aria-label="Dismiss rule"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
