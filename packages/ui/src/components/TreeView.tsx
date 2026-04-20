/**
 * TreeView — recursive read-only tree with expand/collapse and keyboard nav.
 *
 * Generic over the node data shape. Consumers pass pre-built `TreeNode<T>`
 * objects via `nodes`, where each node includes its `children`, along with a
 * `renderNode` renderer. Selection and expansion are controlled or
 * uncontrolled via `defaultExpandedIds` / `expandedIds` + `onExpandedChange`.
 */
import { ChevronRight } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useMemo, useState } from 'react';

import { cn } from '../lib/utils';

export interface TreeNode<T> {
  id: string;
  data: T;
  children: TreeNode<T>[];
}

export interface TreeViewProps<T> {
  nodes: TreeNode<T>[];
  renderNode: (
    node: TreeNode<T>,
    state: { level: number; expanded: boolean; selected: boolean }
  ) => ReactNode;
  selectedId?: string | null;
  onSelect?: (node: TreeNode<T>) => void;
  expandedIds?: Set<string>;
  defaultExpandedIds?: Iterable<string>;
  onExpandedChange?: (next: Set<string>) => void;
  className?: string;
}

function flattenTree<T>(nodes: TreeNode<T>[], expanded: Set<string>) {
  const out: { node: TreeNode<T>; level: number }[] = [];
  const walk = (list: TreeNode<T>[], level: number) => {
    for (const n of list) {
      out.push({ node: n, level });
      if (expanded.has(n.id)) walk(n.children, level + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

interface TreeRowProps<T> {
  node: TreeNode<T>;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  toggle: (id: string) => void;
  onSelect?: (node: TreeNode<T>) => void;
  renderNode: TreeViewProps<T>['renderNode'];
}

function TreeRow<T>({
  node,
  level,
  isExpanded,
  isSelected,
  toggle,
  onSelect,
  renderNode,
}: TreeRowProps<T>) {
  const hasChildren = node.children.length > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-1 py-1',
        isSelected && 'bg-accent text-accent-foreground rounded-sm'
      )}
      style={{ paddingLeft: `${level * 14}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.id);
          }}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden
          />
        </button>
      ) : (
        <span className="inline-block w-[18px]" aria-hidden />
      )}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect?.(node)}>
        {renderNode(node, { level, expanded: isExpanded, selected: isSelected })}
      </div>
    </div>
  );
}

function makeKeyHandler<T>(
  flat: { node: TreeNode<T>; level: number }[],
  expanded: Set<string>,
  toggle: (id: string) => void,
  onSelect?: (node: TreeNode<T>) => void
) {
  return (index: number) => (e: KeyboardEvent<HTMLLIElement>) => {
    const entry = flat[index];
    if (!entry) return;
    const { node } = entry;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (node.children.length > 0 && !expanded.has(node.id)) toggle(node.id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (expanded.has(node.id)) toggle(node.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(node);
    }
  };
}

export function TreeView<T>({
  nodes,
  renderNode,
  selectedId = null,
  onSelect,
  expandedIds,
  defaultExpandedIds,
  onExpandedChange,
  className,
}: TreeViewProps<T>) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? [])
  );
  const expanded = expandedIds ?? internalExpanded;

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!expandedIds) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [expanded, expandedIds, onExpandedChange]
  );

  const flat = useMemo(() => flattenTree(nodes, expanded), [nodes, expanded]);
  const handleKeyDown = makeKeyHandler(flat, expanded, toggle, onSelect);

  return (
    <ul role="tree" className={cn('flex flex-col', className)}>
      {flat.map((entry, i) => {
        const { node, level } = entry;
        const isExpanded = expanded.has(node.id);
        const isSelected = node.id === selectedId;
        return (
          <li
            key={node.id}
            role="treeitem"
            aria-expanded={node.children.length > 0 ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-level={level + 1}
            tabIndex={0}
            onKeyDown={handleKeyDown(i)}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <TreeRow
              node={node}
              level={level}
              isExpanded={isExpanded}
              isSelected={isSelected}
              toggle={toggle}
              onSelect={onSelect}
              renderNode={renderNode}
            />
          </li>
        );
      })}
    </ul>
  );
}
