import { ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '@pops/ui';

import type { LocationTreeNode } from './utils';

interface ExpandToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
}

function ExpandToggle({ isExpanded, onToggle }: ExpandToggleProps) {
  return (
    <span
      role="button"
      tabIndex={-1}
      className="shrink-0 p-0.5 rounded hover:bg-accent"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      {isExpanded ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

interface TreeNodeProps {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  visibleIds: Set<string> | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

export function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  visibleIds,
  onToggle,
  onSelect,
}: TreeNodeProps) {
  if (visibleIds && !visibleIds.has(node.id)) return null;

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm',
          'hover:bg-accent/50 transition-colors',
          isSelected && 'bg-accent text-accent-foreground font-medium'
        )}
        style={{
          paddingLeft: `calc(${depth} * var(--tree-picker-step) + var(--tree-indent-base))`,
        }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <ExpandToggle isExpanded={isExpanded} onToggle={() => onToggle(node.id)} />
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              visibleIds={visibleIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
