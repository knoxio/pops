/**
 * Modal for changing an ingredient's parent. The server re-validates the
 * parent chain (depth ≤ 3 and acyclic). Self-as-parent is filtered out
 * client-side for clarity even though the service also rejects it.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import { SelectRow } from './IngredientFormFields';

import type { IngredientRow } from './ingredient-wire-types.js';

interface Props {
  open: boolean;
  ingredient: IngredientRow;
  ingredients: readonly IngredientRow[];
  isSubmitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (newParentId: number | null) => void;
}

export function ChangeParentDialog(props: Props) {
  const { t } = useTranslation('food');
  const [parentValue, setParentValue] = useState<string>('');

  useEffect(() => {
    if (props.open) {
      setParentValue(props.ingredient.parentId === null ? '' : String(props.ingredient.parentId));
    }
  }, [props.open, props.ingredient.parentId]);

  const currentValue = props.ingredient.parentId === null ? '' : String(props.ingredient.parentId);
  const isUnchanged = parentValue === currentValue;
  const options = buildParentOptions(props.ingredient.id, props.ingredients, t);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isUnchanged) return;
    props.onSubmit(parentValue.length > 0 ? Number(parentValue) : null);
  }

  return (
    <Dialog open={props.open} onOpenChange={(next) => (next ? null : props.onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.changeParent.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {t('data.ingredients.changeParent.description')}
          </p>
          <SelectRow
            id="ingredient-change-parent"
            labelKey="data.ingredients.changeParent.label"
            value={parentValue}
            options={options}
            onChange={setParentValue}
          />
          {props.errorMessage !== null ? (
            <p role="alert" className="text-destructive text-sm">
              {props.errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              {t('data.ingredients.actions.cancel')}
            </Button>
            <Button type="submit" disabled={props.isSubmitting || isUnchanged}>
              {props.isSubmitting
                ? t('data.ingredients.actions.saving')
                : t('data.ingredients.changeParent.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function buildParentOptions(
  selfId: number,
  ingredients: readonly IngredientRow[],
  t: (key: string) => string
): { value: string; label: string }[] {
  const candidates = ingredients.filter((candidate) => candidate.id !== selfId);
  return [
    { value: '', label: t('data.ingredients.create.noParent') },
    ...candidates.map((row) => ({ value: String(row.id), label: `${row.name} (${row.slug})` })),
  ];
}
