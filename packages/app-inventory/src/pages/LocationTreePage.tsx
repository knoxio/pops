/**
 * LocationTreePage — hierarchical tree display of all locations.
 *
 * Uses inventory.locations.tree tRPC query to render an expand/collapse
 * tree with item count badges. Supports adding root/child locations
 * and inline renaming via double-click.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Badge,
  Skeleton,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@pops/ui";
import {
  MapPin,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Plus,
  FolderPlus,
} from "lucide-react";
import { trpc } from "../lib/trpc";

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
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 20}px` }}>
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function buildBreadcrumb(
  nodeId: string,
  nodeMap: Map<string, LocationTreeNode>
): string[] {
  const path: string[] = [];
  let current = nodeMap.get(nodeId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return path;
}

function buildNodeMap(
  nodes: LocationTreeNode[],
  map: Map<string, LocationTreeNode>
): void {
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
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed) onSave(trimmed);
    } else if (e.key === "Escape") {
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
      className="text-sm font-medium bg-transparent border-b border-primary outline-none px-0.5 py-0 w-full max-w-[200px]"
    />
  );
}

interface LocationNodeProps {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, newName: string) => void;
  addingChildOf: string | null;
  onNewChildSave: (name: string) => void;
  onNewChildCancel: () => void;
}

function LocationNode({
  node,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onRename,
  addingChildOf,
  onNewChildSave,
  onNewChildCancel,
}: LocationNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isAddingChild = addingChildOf === node.id;

  // Auto-expand when adding a child
  useEffect(() => {
    if (isAddingChild && !open) setOpen(true);
  }, [isAddingChild, open]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`group flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
          isSelected ? "bg-primary/10 text-primary" : ""
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenaming(true);
        }}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? open : undefined}
      >
        {hasChildren ? (
          <CollapsibleTrigger
            asChild
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <button type="button" className="p-0.5 rounded hover:bg-muted" aria-label={open ? "Collapse" : "Expand"}>
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

        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          aria-label={`Add child to ${node.name}`}
          title="Add child location"
        >
          <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {hasChildren && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {countDescendants(node) + 1}
          </Badge>
        )}
      </div>

      {(hasChildren || isAddingChild) && (
        <CollapsibleContent forceMount={isAddingChild ? true : undefined}>
          <div role="group">
            {node.children.map((child) => (
              <LocationNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onAddChild={onAddChild}
                onRename={onRename}
                addingChildOf={addingChildOf}
                onNewChildSave={onNewChildSave}
                onNewChildCancel={onNewChildCancel}
              />
            ))}
            {isAddingChild && (
              <div
                className="flex items-center gap-1.5 py-1.5 px-2"
                style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
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
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function SelectedLocationPanel({
  nodeId,
  nodeMap,
}: {
  nodeId: string;
  nodeMap: Map<string, LocationTreeNode>;
}) {
  const node = nodeMap.get(nodeId);
  if (!node) return null;

  const breadcrumb = buildBreadcrumb(nodeId, nodeMap);
  const childCount = node.children.length;
  const totalDescendants = countDescendants(node);

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        {breadcrumb.join(" / ")}
      </div>
      <h2 className="text-lg font-semibold">{node.name}</h2>
      <div className="flex gap-4 text-sm text-muted-foreground">
        {childCount > 0 && (
          <span>
            {childCount} direct {childCount === 1 ? "child" : "children"}
          </span>
        )}
        {totalDescendants > childCount && (
          <span>{totalDescendants} total descendants</span>
        )}
        {childCount === 0 && <span>No sub-locations</span>}
      </div>
      {childCount > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Sub-locations</h3>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {node.children.map((child) => (
              <li key={child.id} className="flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5" />
                {child.name}
                {child.children.length > 0 && (
                  <span className="text-xs">({child.children.length})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LocationTreePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.inventory.locations.tree.useQuery();

  const createMutation = trpc.inventory.locations.create.useMutation({
    onSuccess: () => {
      utils.inventory.locations.tree.invalidate();
      setAddingChildOf(null);
      setAddingRoot(false);
    },
  });

  const updateMutation = trpc.inventory.locations.update.useMutation({
    onSuccess: () => {
      utils.inventory.locations.tree.invalidate();
    },
  });

  const nodeMap = new Map<string, LocationTreeNode>();
  if (data?.data) {
    buildNodeMap(data.data, nodeMap);
  }

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

  if (error) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Locations</h1>
        </div>
        <p className="text-destructive">Failed to load locations.</p>
      </div>
    );
  }

  const treeNodes = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Locations</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddingRoot(true);
            setAddingChildOf(null);
          }}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          Add Root Location
        </button>
      </div>

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
          <div className="md:w-2/5 border rounded-lg py-2" role="tree" aria-label="Location tree">
            {treeNodes.map((node) => (
              <LocationNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={handleSelect}
                onAddChild={handleAddChild}
                onRename={handleRename}
                addingChildOf={addingChildOf}
                onNewChildSave={handleNewChildSave}
                onNewChildCancel={handleNewChildCancel}
              />
            ))}
            {addingRoot && (
              <div className="flex items-center gap-1.5 py-1.5 px-2" style={{ paddingLeft: "8px" }}>
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

          <div className="md:w-3/5">
            {selectedId ? (
              <SelectedLocationPanel nodeId={selectedId} nodeMap={nodeMap} />
            ) : (
              <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
                Select a location to see details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
