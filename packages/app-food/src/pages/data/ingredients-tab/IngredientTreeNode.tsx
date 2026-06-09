/**
 * One row in the ingredients tree. Renders an expand/collapse toggle
 * for nodes with children, the slug + name, and a child list when
 * expanded. Selection state lives in the parent; we only signal
 * intent via callbacks.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

import type { IngredientTreeNode } from './buildIngredientTree';

interface Props {
  node: IngredientTreeNode;
  depth: number;
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}

function ExpandToggle({
  hasChildren,
  isExpanded,
  onToggle,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('food');
  if (!hasChildren) return <span className="inline-block w-4" aria-hidden />;
  return (
    <button
      type="button"
      aria-label={
        isExpanded ? t('data.ingredients.tree.collapse') : t('data.ingredients.tree.expand')
      }
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="hover:bg-accent rounded p-0.5"
    >
      {isExpanded ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function IngredientTreeNodeRow({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: Props) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.row.id);
  const isSelected = selectedId === node.row.id;

  return (
    <li>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={isSelected ? 0 : -1}
        onClick={() => onSelect(node.row.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.row.id);
          }
        }}
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm',
          isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        )}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
      >
        <ExpandToggle
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggle={() => onToggle(node.row.id)}
        />
        <span className="truncate">
          <span className="font-medium">{node.row.name}</span>{' '}
          <span className="text-muted-foreground text-xs">({node.row.slug})</span>
        </span>
      </div>
      {hasChildren && isExpanded ? (
        <ul role="group" className="list-none">
          {node.children.map((child) => (
            <IngredientTreeNodeRow
              key={child.row.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
