/**
 * Side panel rendered inside `RuleFormDialog` showing the live transactions
 * a candidate (pattern, matchType) would match against (#2187).
 */
import { Loader2, Search } from 'lucide-react';

import { Badge, Button, formatDate } from '@pops/ui';

import type { MatchType } from '../types';
import type { RulePreviewResult } from './types';

export interface RulePreviewPanelProps {
  preview: {
    data: RulePreviewResult | undefined;
    isFetching: boolean;
    error: { message: string } | null;
    refetch: () => Promise<unknown>;
    inputPattern: string;
    inputMatchType: MatchType;
    isIdle: boolean;
  };
}

function MatchRow({ match }: { match: RulePreviewResult['matches'][number] }) {
  return (
    <li className="p-2 text-sm" data-testid="preview-match-row">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{match.description}</span>
        <span className="text-muted-foreground tabular-nums">{formatDate(match.date)}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        <span>{match.account}</span>
        {match.entityName && <span>• {match.entityName}</span>}
        {match.tags.length > 0 && (
          <span className="flex gap-1">
            {match.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </span>
        )}
      </div>
    </li>
  );
}

function PreviewBody({ preview }: RulePreviewPanelProps) {
  const { data, isFetching, error, isIdle } = preview;

  if (isIdle) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="preview-empty">
        Enter a pattern to preview matches.
      </p>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }
  if (!data && isFetching) {
    return (
      <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Running preview…
      </p>
    );
  }
  if (!data) return null;

  if (data.matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="preview-no-matches">
        No transactions match this rule.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border" data-testid="preview-matches">
      {data.matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}

function PreviewHeader({ preview }: RulePreviewPanelProps) {
  const { isFetching, refetch, inputPattern, inputMatchType, isIdle } = preview;
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">Preview matches</h3>
        {!isIdle && (
          <p className="text-xs text-muted-foreground">
            Pattern <code className="font-mono">{inputPattern}</code> · {inputMatchType}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void refetch()}
        disabled={isIdle || isFetching}
        data-testid="rule-preview-run"
      >
        {isFetching ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Search className="mr-2 h-3.5 w-3.5" />
        )}
        Run preview
      </Button>
    </div>
  );
}

function PreviewSummary({ preview }: RulePreviewPanelProps) {
  const { data, isIdle } = preview;
  if (isIdle) return null;
  const total = data?.total ?? 0;
  const truncated = data?.truncated ?? false;
  const shownCount = data?.matches.length ?? 0;
  return (
    <p className="text-xs text-muted-foreground" data-testid="rule-preview-count">
      {total} match{total === 1 ? '' : 'es'}
      {truncated ? ` (showing first ${shownCount})` : ''}
    </p>
  );
}

export function RulePreviewPanel({ preview }: RulePreviewPanelProps) {
  return (
    <div className="flex flex-col gap-3 min-w-0" data-testid="rule-preview-panel">
      <PreviewHeader preview={preview} />
      <PreviewSummary preview={preview} />
      <PreviewBody preview={preview} />
    </div>
  );
}
