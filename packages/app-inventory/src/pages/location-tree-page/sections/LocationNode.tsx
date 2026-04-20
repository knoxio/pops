import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Collapsible, CollapsibleContent } from '@pops/ui';

import { type LocationTreeNode } from '../utils';
import { DropIndicatorLine } from './location-node/DropIndicatorLine';
import { InlineInput } from './location-node/InlineInput';
import { NodeRow } from './location-node/NodeRow';

export { InlineInput };

export interface LocationNodeProps {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  addingChildOf: string | null;
  onNewChildSave: (name: string) => void;
  onNewChildCancel: () => void;
  siblingIndex: number;
  siblingCount: number;
  overId: string | null;
  activeId: string | null;
}

function NewChildInput({
  depth,
  onSave,
  onCancel,
}: {
  depth: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 py-1.5 px-2"
      style={{
        paddingLeft: `calc(${depth + 1} * var(--tree-indent-step) + var(--tree-indent-base))`,
      }}
    >
      <span className="w-5.5" />
      <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
      <InlineInput onSave={onSave} onCancel={onCancel} placeholder="Location name" />
    </div>
  );
}

function ChildrenList(props: LocationNodeProps) {
  const { node, depth, addingChildOf, onNewChildSave, onNewChildCancel } = props;
  const isAddingChild = addingChildOf === node.id;
  return (
    <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
      <div role="group">
        {node.children.map((child, i) => (
          <LocationNode
            key={child.id}
            {...props}
            node={child}
            depth={depth + 1}
            siblingIndex={i}
            siblingCount={node.children.length}
          />
        ))}
        {isAddingChild && (
          <NewChildInput depth={depth} onSave={onNewChildSave} onCancel={onNewChildCancel} />
        )}
      </div>
    </SortableContext>
  );
}

function useNodeState(node: LocationTreeNode, depth: number, isAddingChild: boolean) {
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  useEffect(() => {
    if (isAddingChild && !open) setOpen(true);
  }, [isAddingChild, open]);
  return { open, setOpen, renaming, setRenaming };
}

export function LocationNode(props: LocationNodeProps) {
  const { node, depth, selectedId, addingChildOf, overId, activeId } = props;
  const isAddingChild = addingChildOf === node.id;
  const { open, setOpen, renaming, setRenaming } = useNodeState(node, depth, isAddingChild);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const sortable = useSortable({ id: node.id });
  const sortableStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };
  const showDropLine =
    overId === node.id && activeId !== null && activeId !== node.id && !sortable.isDragging;

  return (
    <div ref={sortable.setNodeRef} style={sortableStyle}>
      {showDropLine && <DropIndicatorLine depth={depth} />}
      <Collapsible open={open} onOpenChange={setOpen}>
        <NodeRow
          node={node}
          depth={depth}
          open={open}
          hasChildren={hasChildren}
          isSelected={isSelected}
          isOver={sortable.isOver}
          isDragging={sortable.isDragging}
          renaming={renaming}
          setRenaming={setRenaming}
          siblingIndex={props.siblingIndex}
          siblingCount={props.siblingCount}
          attributes={sortable.attributes as unknown as Record<string, unknown>}
          listeners={sortable.listeners as unknown as Record<string, unknown> | undefined}
          setActivatorNodeRef={sortable.setActivatorNodeRef}
          onSelect={props.onSelect}
          onAddChild={props.onAddChild}
          onRename={props.onRename}
          onMoveStart={props.onMoveStart}
          onReorder={props.onReorder}
          onDelete={props.onDelete}
        />
        {(hasChildren || isAddingChild) && (
          <CollapsibleContent forceMount={isAddingChild ? true : undefined}>
            <ChildrenList {...props} />
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}
