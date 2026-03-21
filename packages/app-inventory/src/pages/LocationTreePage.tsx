/**
 * LocationTreePage — hierarchical tree display of all locations.
 *
 * Uses inventory.locations.tree tRPC query to render an expand/collapse
 * tree with item count badges. Click to select a location and see its
 * path. Responsive: full-width on mobile, side panel on tablet+.
 */
import { useState, useCallback } from "react";
import {
  Badge,
  Skeleton,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@pops/ui";
import { MapPin, ChevronRight, ChevronDown, FolderOpen, Folder } from "lucide-react";
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

interface LocationNodeProps {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function LocationNode({ node, depth, selectedId, onSelect }: LocationNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
          isSelected ? "bg-primary/10 text-primary" : ""
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
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

        <span className="text-sm font-medium truncate">{node.name}</span>

        {hasChildren && (
          <Badge variant="secondary" className="text-xs ml-auto shrink-0">
            {countDescendants(node) + 1}
          </Badge>
        )}
      </div>

      {hasChildren && (
        <CollapsibleContent>
          <div role="group">
            {node.children.map((child) => (
              <LocationNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
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

  const { data, isLoading, error } = trpc.inventory.locations.tree.useQuery();

  const nodeMap = new Map<string, LocationTreeNode>();
  if (data?.data) {
    buildNodeMap(data.data, nodeMap);
  }

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
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
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Locations</h1>
      </div>

      {isLoading ? (
        <TreeSkeleton />
      ) : treeNodes.length === 0 ? (
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
              />
            ))}
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
