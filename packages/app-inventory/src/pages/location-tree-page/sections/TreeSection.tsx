import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Folder, GripVertical } from 'lucide-react';

import { Badge, Skeleton } from '@pops/ui';

import { countDescendants, type LocationTreeNode } from '../utils';
import { LocationNode } from './LocationNode';

function TreeSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2"
          style={{ paddingLeft: `calc(${i % 3} * var(--tree-indent-step))` }}
        >
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function DragOverlayNode({ node }: { node: LocationTreeNode }) {
  return (
    <div className="flex items-center gap-2 bg-background border rounded-md px-3 py-2 shadow-lg">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <Folder className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{node.name}</span>
      {node.children.length > 0 && (
        <Badge variant="secondary" className="text-xs">
          {countDescendants(node) + 1}
        </Badge>
      )}
    </div>
  );
}

interface TreeSectionProps {
  treeNodes: LocationTreeNode[];
  isLoading: boolean;
  selectedId: string | null;
  addingChildOf: string | null;
  overId: string | null;
  activeId: string | null;
  activeNode: LocationTreeNode | null | undefined;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  onNewChildSave: (name: string) => void;
  onNewChildCancel: () => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

function TreeNodeList({
  treeNodes,
  selectedId,
  addingChildOf,
  overId,
  activeId,
  onSelect,
  onAddChild,
  onRename,
  onMoveStart,
  onReorder,
  onDelete,
  onNewChildSave,
  onNewChildCancel,
}: Pick<
  TreeSectionProps,
  | 'treeNodes'
  | 'selectedId'
  | 'addingChildOf'
  | 'overId'
  | 'activeId'
  | 'onSelect'
  | 'onAddChild'
  | 'onRename'
  | 'onMoveStart'
  | 'onReorder'
  | 'onDelete'
  | 'onNewChildSave'
  | 'onNewChildCancel'
>) {
  return (
    <SortableContext items={treeNodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
      {treeNodes.map((node, i) => (
        <LocationNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onRename={onRename}
          onMoveStart={onMoveStart}
          onReorder={onReorder}
          onDelete={onDelete}
          addingChildOf={addingChildOf}
          onNewChildSave={onNewChildSave}
          onNewChildCancel={onNewChildCancel}
          siblingIndex={i}
          siblingCount={treeNodes.length}
          overId={overId}
          activeId={activeId}
        />
      ))}
    </SortableContext>
  );
}

export function TreeSection(props: TreeSectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  if (props.isLoading) return <TreeSkeleton />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDragEnd={props.onDragEnd}
    >
      <div className="md:w-2/5 border rounded-lg py-2" role="tree" aria-label="Location tree">
        <TreeNodeList {...props} />
      </div>
      <DragOverlay>
        {props.activeNode ? <DragOverlayNode node={props.activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
