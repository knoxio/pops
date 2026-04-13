/**
 * LocationTreePage — hierarchical tree display of all locations.
 *
 * Uses inventory.locations.tree tRPC query to render an expand/collapse
 * tree with item count badges. Supports adding root/child locations,
 * inline renaming, move-to-parent modal, and sibling reordering.
 */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
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
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PageHeader,
  Skeleton,
} from '@pops/ui';
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
  MapPin,
  MoveRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { LocationContentsPanel } from '../components/LocationContentsPanel';
import { trpc } from '../lib/trpc';

interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

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

function buildBreadcrumb(nodeId: string, nodeMap: Map<string, LocationTreeNode>): string[] {
  const path: string[] = [];
  let current = nodeMap.get(nodeId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return path;
}

function buildNodeMap(nodes: LocationTreeNode[], map: Map<string, LocationTreeNode>): void {
  for (const node of nodes) {
    map.set(node.id, node);
    buildNodeMap(node.children, map);
  }
}

function countDescendants(node: LocationTreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

/** Check if targetId is a descendant of nodeId (prevents circular moves). */
function isDescendant(
  nodeId: string,
  targetId: string,
  nodeMap: Map<string, LocationTreeNode>
): boolean {
  const node = nodeMap.get(nodeId);
  if (!node) return false;
  for (const child of node.children) {
    if (child.id === targetId || isDescendant(child.id, targetId, nodeMap)) {
      return true;
    }
  }
  return false;
}

/** Get siblings of a node (including itself). */
function getSiblings(
  nodeId: string,
  treeNodes: LocationTreeNode[],
  nodeMap: Map<string, LocationTreeNode>
): LocationTreeNode[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  if (!node.parentId) return treeNodes;
  const parent = nodeMap.get(node.parentId);
  return parent?.children ?? [];
}

/** Inline text input for creating/renaming locations. */
function InlineInput({
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
      className="text-sm font-medium bg-transparent border-b border-app-accent outline-none px-0.5 py-0 w-full max-w-[200px]"
    />
  );
}

/** Simplified tree picker for the "Move To" dialog. */
function MoveTargetPicker({
  nodes,
  movingId,
  nodeMap,
  onSelect,
  depth = 0,
}: {
  nodes: LocationTreeNode[];
  movingId: string;
  nodeMap: Map<string, LocationTreeNode>;
  onSelect: (parentId: string | null) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes
        .filter((n) => n.id !== movingId)
        .map((node) => {
          const disabled = isDescendant(movingId, node.id, nodeMap);
          return (
            <div key={node.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(node.id)}
                className={`w-full text-left flex items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors ${
                  disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'
                }`}
                style={{
                  paddingLeft: `calc(${depth} * var(--tree-picker-step) + var(--tree-indent-base))`,
                }}
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{node.name}</span>
              </button>
              {node.children.length > 0 && (
                <MoveTargetPicker
                  nodes={node.children}
                  movingId={movingId}
                  nodeMap={nodeMap}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        })}
    </>
  );
}

/** Lightweight node preview shown while dragging. */
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

/** Visual drop indicator line shown between siblings during drag. */
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

interface LocationNodeProps {
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
  /** ID of the node currently being dragged over (for drop indicator). */
  overId: string | null;
  /** ID of the node currently being dragged. */
  activeId: string | null;
}

function LocationNode({
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

  // Show drop indicator line when this node is the drop target during a same-parent reorder
  const showDropLine =
    overId === node.id && activeId !== null && activeId !== node.id && !isDragging;

  // Auto-expand when adding a child
  useEffect(() => {
    if (isAddingChild && !open) setOpen(true);
  }, [isAddingChild, open]);

  return (
    <div ref={setNodeRef} style={sortableStyle}>
      {showDropLine && <DropIndicatorLine depth={depth} />}
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={`group flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-app-accent/10 ${
            isSelected
              ? 'bg-app-accent/20 text-foreground font-bold border-l-2 border-app-accent rounded-l-none ml-[-2px]'
              : ''
          } ${isOver && !isDragging ? 'ring-2 ring-app-accent/50 bg-app-accent/5' : ''}`}
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
          {/* Drag handle — fine pointer only (mouse/trackpad), visible on hover */}
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
            <CollapsibleTrigger
              asChild
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
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
            <span className="w-[22px]" />
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
              to={`/inventory/report?locationId=${node.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-0.5 rounded hover:bg-muted"
              title={`Insurance report for ${node.name}`}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              aria-label={`Delete ${node.name}`}
              title="Delete location"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
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
                    <span className="w-[22px]" />
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

export function LocationTreePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
    stats: {
      childCount: number;
      descendantCount: number;
      itemCount: number;
      totalItemCount: number;
    };
  } | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.inventory.locations.tree.useQuery();

  const createMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      utils.inventory.locations.tree.invalidate();
      setAddingChildOf(null);
      setAddingRoot(false);
    },
    onError: (err) => toast.error(`Failed to create location: ${err.message}`),
  });

  const updateMutation = trpc.inventory.locations.update.useMutation({
    onSuccess: () => {
      toast.success('Location updated');
      utils.inventory.locations.tree.invalidate();
    },
    onError: (err) => toast.error(`Failed to update location: ${err.message}`),
  });

  const deleteMutation = trpc.inventory.locations.delete.useMutation({
    onSuccess: (result) => {
      if ('requiresConfirmation' in result && result.requiresConfirmation && result.stats) {
        // Need user confirmation — show dialog
        const node = deleteConfirm
          ? { id: deleteConfirm.id, name: deleteConfirm.name }
          : pendingDeleteRef.current;
        if (node) {
          setDeleteConfirm({
            id: node.id,
            name: node.name,
            stats: result.stats,
          });
        }
        return;
      }
      toast.success('Location deleted');
      utils.inventory.locations.tree.invalidate();
      if (selectedId === pendingDeleteRef.current?.id) {
        setSelectedId(null);
      }
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
    onError: (err) => {
      toast.error(`Failed to delete: ${err.message}`);
      setDeleteConfirm(null);
      pendingDeleteRef.current = null;
    },
  });

  const pendingDeleteRef = useRef<{ id: string; name: string } | null>(null);

  const treeNodes = data?.data ?? [];
  const nodeMap = useMemo(() => {
    const map = new Map<string, LocationTreeNode>();
    if (data?.data) {
      buildNodeMap(data.data, map);
    }
    return map;
  }, [data?.data]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    setAddingChildOf(parentId);
    setAddingRoot(false);
  }, []);

  const handleRename = useCallback(
    (id: string, newName: string) => {
      updateMutation.mutate({ id, data: { name: newName } });
    },
    [updateMutation]
  );

  const handleNewChildSave = useCallback(
    (name: string) => {
      createMutation.mutate({
        name,
        parentId: addingChildOf,
      });
    },
    [addingChildOf, createMutation]
  );

  const handleNewChildCancel = useCallback(() => {
    setAddingChildOf(null);
  }, []);

  const handleNewRootSave = useCallback(
    (name: string) => {
      createMutation.mutate({ name, parentId: null });
    },
    [createMutation]
  );

  const handleNewRootCancel = useCallback(() => {
    setAddingRoot(false);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const node = nodeMap.get(id);
      if (!node) return;
      pendingDeleteRef.current = { id, name: node.name };
      // Try without force first — server will return requiresConfirmation if non-empty
      deleteMutation.mutate({ id });
    },
    [nodeMap, deleteMutation]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    deleteMutation.mutate({ id: deleteConfirm.id, force: true });
  }, [deleteConfirm, deleteMutation]);

  const handleMoveStart = useCallback((id: string) => {
    setMovingId(id);
  }, []);

  const handleMoveTo = useCallback(
    (newParentId: string | null) => {
      if (!movingId) return;
      updateMutation.mutate(
        { id: movingId, data: { parentId: newParentId } },
        { onSuccess: () => setMovingId(null) }
      );
    },
    [movingId, updateMutation]
  );

  const handleReorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const siblings = getSiblings(id, treeNodes, nodeMap);
      const idx = siblings.findIndex((s) => s.id === id);
      if (idx < 0) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      const current = siblings[idx];
      const swap = siblings[swapIdx];
      if (!current || !swap) return;

      // Swap sort orders
      updateMutation.mutate({
        id: current.id,
        data: { sortOrder: swap.sortOrder },
      });
      updateMutation.mutate({
        id: swap.id,
        data: { sortOrder: current.sortOrder },
      });
    },
    [treeNodes, nodeMap, updateMutation]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over ? (event.over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setOverId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeNode = nodeMap.get(active.id as string);
      const overNode = nodeMap.get(over.id as string);
      if (!activeNode || !overNode) return;

      // Prevent dropping on own descendants
      if (isDescendant(active.id as string, over.id as string, nodeMap)) {
        toast.error('Cannot move a location into its own sub-location');
        return;
      }

      if (activeNode.parentId === overNode.parentId) {
        // Reorder within same parent
        const siblings = getSiblings(active.id as string, treeNodes, nodeMap);
        const oldIndex = siblings.findIndex((s) => s.id === active.id);
        const newIndex = siblings.findIndex((s) => s.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(siblings, oldIndex, newIndex);
        reordered.forEach((n, index) => {
          if (n.sortOrder !== index) {
            updateMutation.mutate({ id: n.id, data: { sortOrder: index } });
          }
        });
      } else {
        // Different parent → reparent: make active a child of over
        updateMutation.mutate({
          id: activeNode.id,
          data: { parentId: overNode.id },
        });
      }
    },
    [nodeMap, treeNodes, updateMutation]
  );

  const activeNode = activeId ? nodeMap.get(activeId) : null;
  const movingNode = movingId ? nodeMap.get(movingId) : null;

  if (error) {
    return (
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Locations" icon={<MapPin className="h-6 w-6 text-muted-foreground" />} />
        <p className="text-destructive">Failed to load locations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Locations"
        icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
        actions={
          <>
            <Link
              to="/inventory/report"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <FileText className="h-4 w-4" />
              Insurance Report
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-app-accent hover:text-app-accent/80"
              prefix={<Plus className="h-4 w-4" />}
              onClick={() => {
                setAddingRoot(true);
                setAddingChildOf(null);
              }}
            >
              Add Root Location
            </Button>
          </>
        }
      />

      {isLoading ? (
        <TreeSkeleton />
      ) : treeNodes.length === 0 && !addingRoot ? (
        <div className="text-center py-16">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            No locations yet. Add your first location to start organising.
          </p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="md:w-2/5 border rounded-lg py-2" role="tree" aria-label="Location tree">
              <SortableContext
                items={treeNodes.map((n) => n.id)}
                strategy={verticalListSortingStrategy}
              >
                {treeNodes.map((node, i) => (
                  <LocationNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    onAddChild={handleAddChild}
                    onRename={handleRename}
                    onMoveStart={handleMoveStart}
                    onReorder={handleReorder}
                    onDelete={handleDelete}
                    addingChildOf={addingChildOf}
                    onNewChildSave={handleNewChildSave}
                    onNewChildCancel={handleNewChildCancel}
                    siblingIndex={i}
                    siblingCount={treeNodes.length}
                    overId={overId}
                    activeId={activeId}
                  />
                ))}
              </SortableContext>
              {addingRoot && (
                <div
                  className="flex items-center gap-1.5 py-1.5 px-2"
                  style={{ paddingLeft: 'var(--tree-indent-base)' }}
                >
                  <span className="w-[22px]" />
                  <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                  <InlineInput
                    onSave={handleNewRootSave}
                    onCancel={handleNewRootCancel}
                    placeholder="Root location name"
                  />
                </div>
              )}
            </div>
            <DragOverlay>{activeNode ? <DragOverlayNode node={activeNode} /> : null}</DragOverlay>
          </DndContext>

          <div className="md:w-3/5">
            {selectedId && nodeMap.get(selectedId) ? (
              <LocationContentsPanel
                locationId={selectedId}
                locationName={nodeMap.get(selectedId)!.name}
                breadcrumb={buildBreadcrumb(selectedId, nodeMap)}
                node={nodeMap.get(selectedId)!}
              />
            ) : (
              <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
                Select a location to see details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move To dialog */}
      <Dialog open={!!movingId} onOpenChange={(open) => !open && setMovingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move &ldquo;{movingNode?.name}&rdquo;</DialogTitle>
            <DialogDescription>
              Select a new parent location, or move to root level.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto border rounded-lg py-2">
            <button
              type="button"
              onClick={() => handleMoveTo(null)}
              className="w-full text-left flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-muted/50"
              style={{ paddingLeft: 'var(--tree-indent-base)' }}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Root level</span>
            </button>
            {movingId && (
              <MoveTargetPicker
                nodes={treeNodes}
                movingId={movingId}
                nodeMap={nodeMap}
                onSelect={handleMoveTo}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteConfirm?.name}&rdquo;?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteConfirm && (
            <div className="space-y-2 text-sm">
              {deleteConfirm.stats.childCount > 0 && (
                <p>
                  This location has <strong>{deleteConfirm.stats.childCount}</strong> direct{' '}
                  {deleteConfirm.stats.childCount === 1 ? 'sub-location' : 'sub-locations'}
                  {deleteConfirm.stats.descendantCount > deleteConfirm.stats.childCount &&
                    ` (${deleteConfirm.stats.descendantCount} total)`}
                  . They will all be deleted.
                </p>
              )}
              {deleteConfirm.stats.totalItemCount > 0 && (
                <p>
                  <strong>{deleteConfirm.stats.totalItemCount}</strong>{' '}
                  {deleteConfirm.stats.totalItemCount === 1 ? 'item' : 'items'} will become
                  unlocated.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
