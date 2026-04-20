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
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  BrowseRuleSidebarRowContent,
  BrowseRuleSidebarRowSortable,
  BrowseRuleSidebarRowStatic,
} from './browse-rules/BrowseRulesSidebarRows';

import type { LocalOp } from './correction-proposal-shared';
import type { CorrectionRule } from './RulePicker';

export interface BrowseRulesSidebarProps {
  canDragReorder: boolean;
  orderedMerged: CorrectionRule[];
  orderedFiltered: CorrectionRule[];
  selectedRuleId: string | null;
  localOps: LocalOp[];
  onSelectRule: (id: string) => void;
  onReorderFullList: (reordered: CorrectionRule[]) => void;
}

function hasLocalOpFor(ruleId: string, localOps: LocalOp[]): boolean {
  return localOps.some((o) => o.kind !== 'add' && o.targetRuleId === ruleId);
}

function StaticList(props: {
  rules: CorrectionRule[];
  selectedRuleId: string | null;
  localOps: LocalOp[];
  onSelectRule: (id: string) => void;
}) {
  return (
    <ul className="divide-y" role="list" aria-label="Classification rules">
      {props.rules.map((rule) => (
        <BrowseRuleSidebarRowStatic
          key={rule.id}
          rule={rule}
          selected={rule.id === props.selectedRuleId}
          hasLocalOp={hasLocalOpFor(rule.id, props.localOps)}
          onSelect={() => props.onSelectRule(rule.id)}
        />
      ))}
    </ul>
  );
}

function SortableList(props: {
  rules: CorrectionRule[];
  selectedRuleId: string | null;
  localOps: LocalOp[];
  onSelectRule: (id: string) => void;
}) {
  return (
    <SortableContext items={props.rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
      <ul className="divide-y" role="list" aria-label="Classification rules">
        {props.rules.map((rule) => (
          <BrowseRuleSidebarRowSortable
            key={rule.id}
            rule={rule}
            selected={rule.id === props.selectedRuleId}
            hasLocalOp={hasLocalOpFor(rule.id, props.localOps)}
            onSelect={() => props.onSelectRule(rule.id)}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function DragPreview({ rule, localOps }: { rule: CorrectionRule | null; localOps: LocalOp[] }) {
  if (!rule) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 shadow-md">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <BrowseRuleSidebarRowContent rule={rule} hasLocalOp={hasLocalOpFor(rule.id, localOps)} />
      </div>
    </div>
  );
}

function useDndReorder(
  orderedMerged: CorrectionRule[],
  onReorderFullList: (r: CorrectionRule[]) => void
) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = orderedMerged.findIndex((r) => r.id === active.id);
      const newIndex = orderedMerged.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorderFullList(arrayMove(orderedMerged, oldIndex, newIndex));
    },
    [orderedMerged, onReorderFullList]
  );

  const handleDragCancel = useCallback(() => setDragActiveId(null), []);

  const dragOverlayRule = useMemo(
    () => orderedMerged.find((r) => r.id === dragActiveId) ?? null,
    [orderedMerged, dragActiveId]
  );

  return { sensors, dragOverlayRule, handleDragStart, handleDragEnd, handleDragCancel };
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

  const dnd = useDndReorder(orderedMerged, onReorderFullList);

  if (orderedFiltered.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No rules found.</div>;
  }

  if (!canDragReorder) {
    return (
      <StaticList
        rules={orderedFiltered}
        selectedRuleId={selectedRuleId}
        localOps={localOps}
        onSelectRule={onSelectRule}
      />
    );
  }

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={closestCenter}
      onDragStart={dnd.handleDragStart}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <SortableList
        rules={orderedMerged}
        selectedRuleId={selectedRuleId}
        localOps={localOps}
        onSelectRule={onSelectRule}
      />
      <DragOverlay dropAnimation={null}>
        <DragPreview rule={dnd.dragOverlayRule} localOps={localOps} />
      </DragOverlay>
    </DndContext>
  );
}
