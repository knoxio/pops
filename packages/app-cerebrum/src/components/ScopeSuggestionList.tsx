/**
 * ScopeSuggestionList — renders "Did you mean: <canonical>?" affordances
 * for each pending scope reconciliation suggestion (PRD-081 US-07).
 */
import { Check, X } from 'lucide-react';

import { Button } from '@pops/ui';

interface ScopeSuggestion {
  original: string;
  canonical: string;
  confidence: number;
  reason: string;
}

interface ScopeSuggestionListProps {
  suggestions: ScopeSuggestion[];
  onAccept: (original: string, canonical: string) => void;
  onDismiss: (canonical: string) => void;
  pending: boolean;
}

export function ScopeSuggestionList({
  suggestions,
  onAccept,
  onDismiss,
  pending,
}: ScopeSuggestionListProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        Scope suggestions
      </h4>
      <ul className="space-y-2">
        {suggestions.map((s) => (
          <li
            key={`${s.original}→${s.canonical}`}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="text-muted-foreground">Did you mean</span>
            <code className="font-mono text-xs bg-background border border-border rounded px-1.5 py-0.5">
              {s.canonical}
            </code>
            <span className="text-xs text-muted-foreground">
              instead of <code className="font-mono">{s.original}</code> ({s.reason})
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAccept(s.original, s.canonical)}
                disabled={pending}
                prefix={<Check className="h-3.5 w-3.5" />}
                aria-label={`Accept ${s.canonical}`}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s.canonical)}
                disabled={pending}
                prefix={<X className="h-3.5 w-3.5" />}
                aria-label={`Dismiss ${s.canonical}`}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
