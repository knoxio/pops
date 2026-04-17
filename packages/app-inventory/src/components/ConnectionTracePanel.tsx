/**
 * ConnectionTracePanel — displays connection chain as an expandable tree.
 *
 * Shows all items connected to the current item (direct and transitive)
 * as a recursive tree. Each node shows item name, AssetIdBadge, and TypeBadge.
 * Click navigates to the item detail page.
 */
import {
  AssetIdBadge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
  TypeBadge,
} from '@pops/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { trpc } from '../lib/trpc';

interface TraceNode {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
  children: TraceNode[];
}

interface TraceNodeRowProps {
  node: TraceNode;
  depth: number;
  currentItemId: string;
}

function TraceNodeRow({ node, depth, currentItemId }: TraceNodeRowProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isCurrent = node.id === currentItemId;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${
          isCurrent
            ? 'bg-app-accent/10 text-foreground font-bold border-l-2 border-app-accent rounded-l-none ml-[-2px]'
            : 'hover:bg-app-accent/5 cursor-pointer'
        }`}
        style={{
          paddingLeft: `calc(${depth} * var(--tree-indent-step) + var(--tree-indent-base))`,
        }}
        onClick={() => {
          if (!isCurrent) navigate(`/inventory/items/${node.id}`);
        }}
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
      >
        {hasChildren ? (
          <CollapsibleTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </CollapsibleTrigger>
        ) : (
          <span className="w-4.5" />
        )}

        <span className={`text-sm truncate ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
          {node.itemName}
          {isCurrent && <span className="text-xs ml-1">(current)</span>}
        </span>

        {node.assetId && <AssetIdBadge assetId={node.assetId} />}
        {node.type && <TypeBadge type={node.type} />}

        {hasChildren && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {node.children.length}
          </span>
        )}
      </div>

      {hasChildren && (
        <CollapsibleContent>
          <div role="group">
            {node.children.map((child) => (
              <TraceNodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                currentItemId={currentItemId}
              />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function TraceSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2"
          style={{
            paddingLeft: `calc(${i % 3} * var(--tree-indent-step) + var(--tree-indent-base))`,
          }}
        >
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

export interface ConnectionTracePanelProps {
  itemId: string;
}

export function ConnectionTracePanel({ itemId }: ConnectionTracePanelProps) {
  const { data, isLoading, error } = trpc.inventory.connections.trace.useQuery(
    { itemId },
    { enabled: !!itemId }
  );

  if (isLoading) return <TraceSkeleton />;

  if (error) {
    return <p className="text-sm text-destructive">Failed to load connection trace.</p>;
  }

  const tree = data?.data;
  if (!tree || tree.children.length === 0) {
    return <p className="text-sm text-muted-foreground">No connection chain found.</p>;
  }

  const totalNodes = countNodes(tree) - 1; // Exclude root

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {totalNodes} connected {totalNodes === 1 ? 'item' : 'items'} in chain
      </p>
      <div className="border rounded-lg py-2" role="tree" aria-label="Connection chain">
        <TraceNodeRow node={tree} depth={0} currentItemId={itemId} />
      </div>
    </div>
  );
}

function countNodes(node: TraceNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}
