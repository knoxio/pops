import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoveRight,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import { countDescendants, type LocationTreeNode } from '../utils';

export function InlineInput({
  defaultValue,
  onSave,
  onCancel,
  placeholder,
}: {
  defaultValue?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? '');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) onSave(trimmed);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
      placeholder={placeholder}
      className="text-sm font-medium bg-transparent border-b border-app-accent outline-none px-0.5 py-0 w-full max-w-50"
    />
  );
}

function DropIndicatorLine({ depth }: { depth: number }) {
  return (
    <div
      className="relative h-0.5 my-[-1px] z-10"
      style={{
        marginLeft: `calc(${depth} * var(--tree-indent-step) + var(--tree-indent-base))`,
        marginRight: '8px',
      }}
      data-testid="drop-indicator"
    >
      <div className="absolute inset-0 bg-app-accent rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-app-accent -ml-1" />
    </div>
  );
}

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

export function LocationNode({
  node,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onRename,
  onMoveStart,
  onReorder,
  onDelete,
  addingChildOf,
  onNewChildSave,
  onNewChildCancel,
  siblingIndex,
  siblingCount,
  overId,
  activeId,
}: LocationNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isAddingChild = addingChildOf === node.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: node.id });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const showDropLine =
    overId === node.id && activeId !== null && activeId !== node.id && !isDragging;

  useEffect(() => {
    if (isAddingChild && !open) setOpen(true);
  }, [isAddingChild, open]);

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      {showDropLine && <DropIndicatorLine depth={depth} />}
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={`group flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-app-accent/10 ${isSelected ? 'bg-app-accent/20 text-foreground font-bold border-l-2 border-app-accent rounded-l-none ml-[-2px]' : ''} ${isOver && !isDragging ? 'ring-2 ring-app-accent/50 bg-app-accent/5' : ''}`}
          style={{
            paddingLeft: `calc(${depth} * var(--tree-indent-step) + var(--tree-indent-base))`,
          }}
          onClick={() => onSelect(node.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildren ? open : undefined}
        >
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            className="p-0.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing hidden [@media(pointer:fine)]:flex opacity-0 group-hover:opacity-100 transition-opacity touch-none"
            aria-label={`Drag ${node.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {hasChildren ? (
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
          ) : (
            <span className="w-5.5" />
          )}

          {hasChildren && open ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
          )}

          {renaming ? (
            <InlineInput
              defaultValue={node.name}
              onSave={(name) => {
                setRenaming(false);
                if (name !== node.name) onRename(node.id, name);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <span className="text-sm font-medium truncate">{node.name}</span>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0">
            {siblingCount > 1 && siblingIndex > 0 && (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted hidden [@media(pointer:coarse)]:inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(node.id, 'up');
                }}
                aria-label="Move up"
                title="Move up"
              >
                <ArrowUp className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {siblingCount > 1 && siblingIndex < siblingCount - 1 && (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted hidden [@media(pointer:coarse)]:inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(node.id, 'down');
                }}
                aria-label="Move down"
                title="Move down"
              >
                <ArrowDown className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onMoveStart(node.id);
              }}
              aria-label={`Move ${node.name}`}
              title="Move to..."
            >
              <MoveRight className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
              aria-label={`Add child to ${node.name}`}
              title="Add child location"
            >
              <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <Link
              to={`/inventory/report/insurance?locationId=${node.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-0.5 rounded hover:bg-muted"
              title={`Insurance report for ${node.name}`}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              aria-label={`Delete ${node.name}`}
              title="Delete location"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {hasChildren && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {countDescendants(node) + 1}
            </Badge>
          )}
        </div>

        {(hasChildren || isAddingChild) && (
          <CollapsibleContent forceMount={isAddingChild ? true : undefined}>
            <SortableContext
              items={node.children.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div role="group">
                {node.children.map((child, i) => (
                  <LocationNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
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
                    siblingCount={node.children.length}
                    overId={overId}
                    activeId={activeId}
                  />
                ))}
                {isAddingChild && (
                  <div
                    className="flex items-center gap-1.5 py-1.5 px-2"
                    style={{
                      paddingLeft: `calc(${depth + 1} * var(--tree-indent-step) + var(--tree-indent-base))`,
                    }}
                  >
                    <span className="w-5.5" />
                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                    <InlineInput
                      onSave={onNewChildSave}
                      onCancel={onNewChildCancel}
                      placeholder="Location name"
                    />
                  </div>
                )}
              </div>
            </SortableContext>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}
