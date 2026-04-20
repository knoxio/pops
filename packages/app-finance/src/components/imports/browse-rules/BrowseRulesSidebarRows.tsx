import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { Badge } from '@pops/ui';

import type { CorrectionRule } from '../RulePicker';

export function BrowseRuleSidebarRowContent(props: { rule: CorrectionRule; hasLocalOp: boolean }) {
  const { rule, hasLocalOp } = props;
  const isPending = rule.id.startsWith('temp:');
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <code className="text-xs truncate max-w-45">{rule.descriptionPattern}</code>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {rule.matchType}
        </Badge>
        {isPending && (
          <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-amber-500">
            pending
          </Badge>
        )}
        {hasLocalOp && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            edited
          </Badge>
        )}
        {!rule.isActive && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            disabled
          </Badge>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground truncate">
        {[rule.entityName, rule.location, rule.transactionType].filter(Boolean).join(' · ') ||
          'no outcome set'}
      </div>
    </div>
  );
}

interface RowProps {
  rule: CorrectionRule;
  selected: boolean;
  hasLocalOp: boolean;
  onSelect: () => void;
}

export function BrowseRuleSidebarRowStatic(props: RowProps) {
  const { rule, selected, hasLocalOp, onSelect } = props;
  return (
    <li
      className={`px-3 py-2 cursor-pointer hover:bg-muted/50 ${selected ? 'bg-muted' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <BrowseRuleSidebarRowContent rule={rule} hasLocalOp={hasLocalOp} />
      </div>
    </li>
  );
}

export function BrowseRuleSidebarRowSortable(props: RowProps) {
  const { rule, selected, hasLocalOp, onSelect } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`px-3 py-2 hover:bg-muted/50 ${selected ? 'bg-muted' : ''}`}
      {...attributes}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Drag to reorder rule: ${rule.descriptionPattern}`}
          onClick={(e) => e.stopPropagation()}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={onSelect}
        >
          <BrowseRuleSidebarRowContent rule={rule} hasLocalOp={hasLocalOp} />
        </button>
      </div>
    </li>
  );
}
