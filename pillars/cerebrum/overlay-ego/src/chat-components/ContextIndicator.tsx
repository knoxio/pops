/**
 * ContextIndicator — shows active scopes and context engram count.
 *
 * Expandable to reveal the list of context engrams with relevance scores.
 */
import { ChevronDown, Database, Tag } from 'lucide-react';
import { useState } from 'react';

import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from '@pops/ui';

export interface ContextEngram {
  engramId: string;
  relevanceScore: number;
}

export interface ContextIndicatorProps {
  activeScopes: string[];
  contextEngrams: ContextEngram[];
  className?: string;
}

export function ContextIndicator({
  activeScopes,
  contextEngrams,
  className,
}: ContextIndicatorProps) {
  const [open, setOpen] = useState(false);

  if (activeScopes.length === 0 && contextEngrams.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50',
            className
          )}
        >
          <ScopeSummary count={activeScopes.length} />
          <EngramSummary count={contextEngrams.length} />
          <ChevronDown
            className={cn('ml-auto h-3 w-3 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ContextDetails activeScopes={activeScopes} contextEngrams={contextEngrams} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScopeSummary({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1.5">
      <Tag className="h-3 w-3" aria-hidden />
      <span>
        {count} scope{count !== 1 ? 's' : ''}
      </span>
    </span>
  );
}

function EngramSummary({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1.5">
      <Database className="h-3 w-3" aria-hidden />
      <span>
        {count} engram{count !== 1 ? 's' : ''} in context
      </span>
    </span>
  );
}

function ContextDetails({
  activeScopes,
  contextEngrams,
}: {
  activeScopes: string[];
  contextEngrams: ContextEngram[];
}) {
  return (
    <div className="mt-1 space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
      {activeScopes.length > 0 && (
        <div>
          <div className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Active Scopes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeScopes.map((scope) => (
              <Badge key={scope} variant="secondary" className="text-2xs">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {contextEngrams.length > 0 && (
        <div>
          <div className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Context Engrams
          </div>
          <ul className="space-y-1" role="list" aria-label="Context engrams">
            {contextEngrams.map((engram) => (
              <li
                key={engram.engramId}
                className="flex items-center justify-between rounded px-2 py-1 text-2xs"
              >
                <span className="font-mono text-foreground">{engram.engramId}</span>
                <span className="text-muted-foreground">
                  {(engram.relevanceScore * 100).toFixed(0)}% relevance
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
