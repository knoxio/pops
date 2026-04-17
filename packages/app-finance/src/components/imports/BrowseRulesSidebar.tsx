import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@pops/ui';

import type { LocalOp } from './correction-proposal-shared';
import type { CorrectionRule } from './RulePicker';

function BrowseRuleSidebarRowContent(props: { rule: CorrectionRule; hasLocalOp: boolean }) {
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

function BrowseRuleSidebarRowStatic(props: {
  rule: CorrectionRule;
  selected: boolean;
  hasLocalOp: boolean;
  onSelect: () => void;
}) {
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

function BrowseRuleSidebarRowSortable(props: {
  rule: CorrectionRule;
  selected: boolean;
  hasLocalOp: boolean;
  onSelect: () => void;
}) {
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
          onClick={(e) => {
            e.stopPropagation();
          }}
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

export interface BrowseRulesSidebarProps {
  canDragReorder: boolean;
  orderedMerged: CorrectionRule[];
  orderedFiltered: CorrectionRule[];
  selectedRuleId: string | null;
  localOps: LocalOp[];
  onSelectRule: (id: string) => void;
  onReorderFullList: (reordered: CorrectionRule[]) => void;
}

export function BrowseRulesSidebar(props: BrowseRulesSidebarProps) {
  const {
    canDragReorder,
    orderedMerged,
    orderedFiltered,
    selectedRuleId,
    localOps,
    onSelectRule,
    onReorderFullList,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const dragOverlayRule = useMemo(
    () => orderedMerged.find((r) => r.id === dragActiveId) ?? null,
    [orderedMerged, dragActiveId]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const list = orderedMerged;
      const oldIndex = list.findIndex((r) => r.id === active.id);
      const newIndex = list.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(list, oldIndex, newIndex);
      onReorderFullList(reordered);
    },
    [orderedMerged, onReorderFullList]
  );

  const handleDragCancel = useCallback(() => {
    setDragActiveId(null);
  }, []);

  if (orderedFiltered.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No rules found.</div>;
  }

  if (canDragReorder) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={orderedMerged.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="divide-y" role="list" aria-label="Classification rules">
            {orderedMerged.map((rule) => {
              const selected = rule.id === selectedRuleId;
              const hasLocalOp = localOps.some(
                (o) => o.kind !== 'add' && o.targetRuleId === rule.id
              );
              return (
                <BrowseRuleSidebarRowSortable
                  key={rule.id}
                  rule={rule}
                  selected={selected}
                  hasLocalOp={hasLocalOp}
                  onSelect={() => {
                    onSelectRule(rule.id);
                  }}
                />
              );
            })}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {dragOverlayRule ? (
            <div className="rounded-md border bg-background px-3 py-2 shadow-md">
              <div className="flex items-start gap-2">
                <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <BrowseRuleSidebarRowContent
                  rule={dragOverlayRule}
                  hasLocalOp={localOps.some(
                    (o) => o.kind !== 'add' && o.targetRuleId === dragOverlayRule.id
                  )}
                />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }

  return (
    <ul className="divide-y" role="list" aria-label="Classification rules">
      {orderedFiltered.map((rule) => {
        const selected = rule.id === selectedRuleId;
        const hasLocalOp = localOps.some((o) => o.kind !== 'add' && o.targetRuleId === rule.id);
        return (
          <BrowseRuleSidebarRowStatic
            key={rule.id}
            rule={rule}
            selected={selected}
            hasLocalOp={hasLocalOp}
            onSelect={() => {
              onSelectRule(rule.id);
            }}
          />
        );
      })}
    </ul>
  );
}
