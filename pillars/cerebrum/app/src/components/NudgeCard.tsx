/**
 * NudgeCard — single nudge item with dismiss/act actions.
 */
import { Button } from '@pops/ui';

import { PriorityBadge } from './PriorityBadge';

interface NudgeCardProps {
  nudge: {
    id: string;
    type: string;
    title: string;
    body: string;
    priority: string;
    action: { label: string } | null;
  };
  onAct: (id: string) => void;
  onDismiss: (id: string) => void;
  disabled: boolean;
}

export function NudgeCard({ nudge, onAct, onDismiss, disabled }: NudgeCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{nudge.title}</h3>
          <span className="text-xs text-muted-foreground capitalize">{nudge.type}</span>
        </div>
        <PriorityBadge priority={nudge.priority} />
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{nudge.body}</p>
      <div className="flex gap-2 pt-1">
        {nudge.action && (
          <Button size="sm" onClick={() => onAct(nudge.id)} disabled={disabled}>
            {nudge.action.label}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onDismiss(nudge.id)} disabled={disabled}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
