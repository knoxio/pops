import { ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical } from 'lucide-react';

import { Badge, CollapsibleTrigger } from '@pops/ui';

import { countDescendants, type LocationTreeNode } from '../../utils';
import { InlineInput } from './InlineInput';
import { NodeActions } from './NodeActions';

interface NodeRowProps {
  node: LocationTreeNode;
  depth: number;
  open: boolean;
  hasChildren: boolean;
  isSelected: boolean;
  isOver: boolean;
  isDragging: boolean;
  renaming: boolean;
  setRenaming: (v: boolean) => void;
  siblingIndex: number;
  siblingCount: number;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
}

function ExpandToggle({ open }: { open: boolean }) {
  return (
    <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="p-0.5 rounded hover:bg-muted"
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </CollapsibleTrigger>
  );
}

function NodeIcon({ hasChildren, open }: { hasChildren: boolean; open: boolean }) {
  if (hasChildren && open) {
    return <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
  return <Folder className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function rowClass(isSelected: boolean, isOver: boolean, isDragging: boolean): string {
  return [
    'group flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-app-accent/10',
    isSelected
      ? 'bg-app-accent/20 text-foreground font-bold border-l-2 border-app-accent rounded-l-none ml-[-2px]'
      : '',
    isOver && !isDragging ? 'ring-2 ring-app-accent/50 bg-app-accent/5' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function DragHandle({
  name,
  attributes,
  listeners,
  setActivatorNodeRef,
}: {
  name: string;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
}) {
  return (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className="p-0.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing hidden [@media(pointer:fine)]:flex opacity-0 group-hover:opacity-100 transition-opacity touch-none"
      aria-label={`Drag ${name}`}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function NodeTitle({
  node,
  renaming,
  setRenaming,
  onRename,
}: {
  node: LocationTreeNode;
  renaming: boolean;
  setRenaming: (v: boolean) => void;
  onRename: (id: string, newName: string) => void;
}) {
  if (renaming) {
    return (
      <InlineInput
        defaultValue={node.name}
        onSave={(name) => {
          setRenaming(false);
          if (name !== node.name) onRename(node.id, name);
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }
  return <span className="text-sm font-medium truncate">{node.name}</span>;
}

export function NodeRow(props: NodeRowProps) {
  const { node, depth, open, hasChildren, isSelected, isOver, isDragging } = props;
  return (
    <div
      className={rowClass(isSelected, isOver, isDragging)}
      style={{ paddingLeft: `calc(${depth} * var(--tree-indent-step) + var(--tree-indent-base))` }}
      onClick={() => props.onSelect(node.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.setRenaming(true);
      }}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? open : undefined}
    >
      <DragHandle
        name={node.name}
        attributes={props.attributes}
        listeners={props.listeners}
        setActivatorNodeRef={props.setActivatorNodeRef}
      />
      {hasChildren ? <ExpandToggle open={open} /> : <span className="w-5.5" />}
      <NodeIcon hasChildren={hasChildren} open={open} />
      <NodeTitle
        node={node}
        renaming={props.renaming}
        setRenaming={props.setRenaming}
        onRename={props.onRename}
      />
      <NodeActions
        node={node}
        siblingIndex={props.siblingIndex}
        siblingCount={props.siblingCount}
        onAddChild={props.onAddChild}
        onMoveStart={props.onMoveStart}
        onReorder={props.onReorder}
        onDelete={props.onDelete}
      />
      {hasChildren && (
        <Badge variant="secondary" className="text-xs shrink-0">
          {countDescendants(node) + 1}
        </Badge>
      )}
    </div>
  );
}
