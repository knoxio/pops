/**
 * Confirmation modal for deleting an ingredient.
 *
 * The server returns one of three outcomes:
 *   1. `{ ok: true }` — ingredient gone, dialog closes.
 *   2. `{ ok: false, blockers }` — variants and/or aliases reference the row;
 *      shown as a localised list, the Delete button stays disabled.
 *   3. `TRPCError` with code 'CONFLICT' for FK violations not enumerated by
 *      `getIngredientDeleteBlockers` (recipe_lines, batches, substitutions,
 *      yield_ingredient_id). Surfaced as the generic "other refs" message.
 */
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import type { DeleteBlockerSummary, IngredientRow } from './ingredient-wire-types.js';

interface Props {
  open: boolean;
  ingredient: IngredientRow;
  blockers: DeleteBlockerSummary | null;
  recipeRefCount: number;
  hasOtherFkRefs: boolean;
  isSubmitting: boolean;
  /**
   * True while the blockers + recipeRefs queries are in-flight. We default
   * the counts to zero before they resolve, so the destructive button has
   * to stay disabled during this window — otherwise the user can fire a
   * delete that the server then rejects with a generic CONFLICT.
   */
  isResolvingRefs: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

interface BlockerListProps {
  blockers: DeleteBlockerSummary | null;
  recipeRefCount: number;
  hasOtherFkRefs: boolean;
}

interface BlockerLine {
  key: string;
  text: string;
}

function buildBlockerLines(
  props: BlockerListProps,
  t: (key: string, opts?: Record<string, unknown>) => string
): BlockerLine[] {
  const variants = props.blockers?.variants ?? 0;
  const aliases = props.blockers?.aliases ?? 0;
  const lines: BlockerLine[] = [];
  if (variants > 0) {
    lines.push({
      key: 'variants',
      text: t('data.ingredients.delete.blockers.variants', { count: variants }),
    });
  }
  if (aliases > 0) {
    lines.push({
      key: 'aliases',
      text: t('data.ingredients.delete.blockers.aliases', { count: aliases }),
    });
  }
  if (props.recipeRefCount > 0) {
    lines.push({
      key: 'recipes',
      text: t('data.ingredients.delete.blockers.recipes', { count: props.recipeRefCount }),
    });
  }
  if (props.hasOtherFkRefs) {
    lines.push({ key: 'other', text: t('data.ingredients.delete.blockers.otherRefs') });
  }
  return lines;
}

function BlockerList(props: BlockerListProps) {
  const { t } = useTranslation('food');
  const lines = buildBlockerLines(props, t);
  if (lines.length === 0) return null;
  return (
    <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">{t('data.ingredients.delete.blockers.heading')}</p>
      <ul className="mt-1 list-disc pl-5">
        {lines.map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ul>
    </div>
  );
}

function isDeleteBlocked(props: Pick<Props, 'blockers' | 'recipeRefCount' | 'hasOtherFkRefs'>) {
  return (
    (props.blockers?.variants ?? 0) > 0 ||
    (props.blockers?.aliases ?? 0) > 0 ||
    props.recipeRefCount > 0 ||
    props.hasOtherFkRefs
  );
}

export function DeleteIngredientDialog(props: Props) {
  const { t } = useTranslation('food');
  // Stay disabled while either reference-count query is still in flight —
  // otherwise the user can hit Delete during the window where defaults
  // make `isBlocked === false` even though refs actually exist.
  const confirmDisabled = props.isSubmitting || props.isResolvingRefs || isDeleteBlocked(props);
  return (
    <Dialog open={props.open} onOpenChange={(next) => (next ? null : props.onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('data.ingredients.delete.title')}</DialogTitle>
        </DialogHeader>
        <DeleteBody {...props} />
        <DeleteFooter
          confirmDisabled={confirmDisabled}
          isSubmitting={props.isSubmitting}
          onCancel={props.onCancel}
          onConfirm={props.onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteBody(props: Props) {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {t('data.ingredients.delete.confirmPrompt', { name: props.ingredient.name })}
      </p>
      {props.isResolvingRefs ? (
        <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>
      ) : (
        <BlockerList
          blockers={props.blockers}
          recipeRefCount={props.recipeRefCount}
          hasOtherFkRefs={props.hasOtherFkRefs}
        />
      )}
      {props.errorMessage !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {props.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function DeleteFooter({
  confirmDisabled,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  confirmDisabled: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('data.ingredients.actions.cancel')}
      </Button>
      <Button type="button" variant="destructive" disabled={confirmDisabled} onClick={onConfirm}>
        {isSubmitting
          ? t('data.ingredients.actions.deleting')
          : t('data.ingredients.delete.submit')}
      </Button>
    </DialogFooter>
  );
}
