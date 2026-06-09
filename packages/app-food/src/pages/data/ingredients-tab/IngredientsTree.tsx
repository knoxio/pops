/**
 * Left column of the ingredients tab. Search box + tree.
 */
import { useTranslation } from 'react-i18next';

import { TextInput } from '@pops/ui';

import { IngredientTreeNodeRow } from './IngredientTreeNode';

import type { IngredientTreeNode } from './buildIngredientTree';

interface Props {
  tree: IngredientTreeNode[];
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  highlightedId: number | null;
  search: string;
  onSearchChange: (next: string) => void;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  isLoading: boolean;
}

export function IngredientsTree({
  tree,
  selectedId,
  expandedIds,
  highlightedId,
  search,
  onSearchChange,
  onSelect,
  onToggle,
  isLoading,
}: Props) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-col gap-2">
      <TextInput
        type="search"
        placeholder={t('data.ingredients.searchPlaceholder')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={t('data.ingredients.searchPlaceholder')}
      />
      <TreeBody
        isLoading={isLoading}
        tree={tree}
        selectedId={selectedId}
        expandedIds={expandedIds}
        highlightedId={highlightedId}
        onSelect={onSelect}
        onToggle={onToggle}
      />
    </div>
  );
}

interface TreeBodyProps {
  isLoading: boolean;
  tree: IngredientTreeNode[];
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  highlightedId: number | null;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}

function TreeBody({
  isLoading,
  tree,
  selectedId,
  expandedIds,
  highlightedId,
  onSelect,
  onToggle,
}: TreeBodyProps) {
  const { t } = useTranslation('food');
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>;
  }
  if (tree.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.empty')}</p>;
  }
  return (
    <ul role="tree" aria-label={t('data.ingredients.treeAriaLabel')} className="list-none">
      {tree.map((node) => (
        <IngredientTreeNodeRow
          key={node.row.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          expandedIds={expandedIds}
          highlightedId={highlightedId}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
