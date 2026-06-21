/**
 * One row in the ingredients tree. Renders an expand/collapse toggle
 * for nodes with children, the slug + name, and a child list when
 * expanded. Selection state lives in the parent; we only signal
 * intent via callbacks.
 *
 * Carries a `data-ingredient-id` attribute so the deep-link flow
 * (`?focus=<slug>`) can scroll to the row, and applies a 2-second
 * highlight class when the row matches `highlightedId`.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@pops/ui';

import type { IngredientTreeNode } from './buildIngredientTree';

interface Props {
  node: IngredientTreeNode;
  depth: number;
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  highlightedId: number | null;
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

export function IngredientTreeNodeRow(props: Props) {
  const hasChildren = props.node.children.length > 0;
  const isExpanded = props.expandedIds.has(props.node.row.id);
  const isSelected = props.selectedId === props.node.row.id;
  const isHighlighted = props.highlightedId === props.node.row.id;
  return (
    <li>
      <TreeRowItem
        node={props.node}
        depth={props.depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isHighlighted={isHighlighted}
        onSelect={props.onSelect}
        onToggle={props.onToggle}
      />
      {hasChildren && isExpanded ? <ChildNodes parent={props.node} {...props} /> : null}
    </li>
  );
}

interface RowItemProps {
  node: IngredientTreeNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}

function TreeRowItem(props: RowItemProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.isHighlighted || rowRef.current === null) return;
    // jsdom doesn't implement scrollIntoView; guard so RTL tests don't trip.
    if (typeof rowRef.current.scrollIntoView !== 'function') return;
    rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [props.isHighlighted]);
  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-selected={props.isSelected}
      aria-expanded={props.hasChildren ? props.isExpanded : undefined}
      tabIndex={props.isSelected ? 0 : -1}
      data-ingredient-id={props.node.row.id}
      data-ingredient-slug={props.node.row.slug}
      data-highlighted={props.isHighlighted || undefined}
      onClick={() => props.onSelect(props.node.row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelect(props.node.row.id);
        }
      }}
      className={cn(
        'flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm transition-colors',
        props.isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        // The amber ring is the deep-link "you just landed here" cue — show it
        // whether or not the row also happens to be selected, otherwise the
        // 2-second highlight is invisible because `?focus=<slug>` selects the
        // row in the same render.
        props.isHighlighted ? 'ring-2 ring-amber-500 bg-amber-200/70' : null
      )}
      style={{ paddingLeft: `${0.5 + props.depth * 1}rem` }}
    >
      <ExpandToggle
        hasChildren={props.hasChildren}
        isExpanded={props.isExpanded}
        onToggle={() => props.onToggle(props.node.row.id)}
      />
      <span className="truncate">
        <span className="font-medium">{props.node.row.name}</span>{' '}
        <span className="text-muted-foreground text-xs">({props.node.row.slug})</span>
      </span>
    </div>
  );
}

function ChildNodes(props: Props & { parent: IngredientTreeNode }) {
  return (
    <ul role="group" className="list-none">
      {props.parent.children.map((child) => (
        <IngredientTreeNodeRow
          key={child.row.id}
          node={child}
          depth={props.depth + 1}
          selectedId={props.selectedId}
          expandedIds={props.expandedIds}
          highlightedId={props.highlightedId}
          onSelect={props.onSelect}
          onToggle={props.onToggle}
        />
      ))}
    </ul>
  );
}
