/**
 * Modal for renaming an ingredient's canonical slug.
 *
 * Calls `food.ingredients.rename` which atomically updates `ingredients.slug`
 * and `slug_registry.slug` (PRD-106 contract). Existing compiled `recipe_lines`
 * rows stay linked because they FK on `ingredient_id`, but recipe DSL bodies
 * referencing the old slug will fail on next compile — the description warns
 * the user about that.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import { TextFieldRow } from './IngredientFormFields';

interface Props {
  open: boolean;
  currentSlug: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (newSlug: string) => void;
}

export function RenameIngredientDialog(props: Props) {
  const { t } = useTranslation('food');
  const [newSlug, setNewSlug] = useState('');

  useEffect(() => {
    if (props.open) setNewSlug(props.currentSlug);
  }, [props.open, props.currentSlug]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newSlug.trim();
    if (trimmed.length === 0 || trimmed === props.currentSlug) return;
    props.onSubmit(trimmed);
  }

  return (
    <Dialog open={props.open} onOpenChange={(next) => (next ? null : props.onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.rename.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <RenameBody
            currentSlug={props.currentSlug}
            newSlug={newSlug}
            errorMessage={props.errorMessage}
            onChange={setNewSlug}
          />
          <RenameFooter
            isSubmitting={props.isSubmitting}
            newSlug={newSlug}
            currentSlug={props.currentSlug}
            onCancel={props.onCancel}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameBody({
  currentSlug,
  newSlug,
  errorMessage,
  onChange,
}: {
  currentSlug: string;
  newSlug: string;
  errorMessage: string | null;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <>
      <p className="text-muted-foreground text-sm">{t('data.ingredients.rename.description')}</p>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t('data.ingredients.rename.oldSlug')}</span>
        <code className="text-xs font-mono text-muted-foreground">{currentSlug}</code>
      </div>
      <TextFieldRow
        id="ingredient-rename-new-slug"
        labelKey="data.ingredients.rename.newSlug"
        value={newSlug}
        placeholder={currentSlug}
        autoFocus
        onChange={onChange}
      />
      {errorMessage !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}

function RenameFooter({
  isSubmitting,
  newSlug,
  currentSlug,
  onCancel,
}: {
  isSubmitting: boolean;
  newSlug: string;
  currentSlug: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('data.ingredients.actions.cancel')}
      </Button>
      <Button
        type="submit"
        disabled={isSubmitting || newSlug.trim().length === 0 || newSlug.trim() === currentSlug}
      >
        {isSubmitting ? t('data.ingredients.actions.saving') : t('data.ingredients.rename.submit')}
      </Button>
    </DialogFooter>
  );
}
