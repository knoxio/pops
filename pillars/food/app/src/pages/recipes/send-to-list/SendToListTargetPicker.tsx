/**
 * Target-picker section for the send-to-list modal
 * (pillars/food/docs/prds/send-to-list).
 *
 * Renders two radio choices: "Add to existing" (a scrollable list of
 * shopping lists with name + item count + last-updated) and "Create
 * new" (text input prefilled with `Shopping list — YYYY-MM-DD`).
 *
 * The existing radio is disabled when no shopping lists exist; in that
 * case the modal auto-flips to "new" before mounting this component.
 */
import { type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Input, Label } from '@pops/ui';

import { ListChoiceRow } from './ListChoiceRow.js';

import type { FormState } from './types.js';
import type { ShoppingList } from './useSendToListData.js';

interface Props {
  form: FormState;
  setForm: (next: FormState) => void;
  shoppingLists: readonly ShoppingList[];
  alreadySentToListIds: readonly number[];
}

export function SendToListTargetPicker({
  form,
  setForm,
  shoppingLists,
  alreadySentToListIds,
}: Props): ReactElement {
  const { t } = useTranslation('food');
  const hasLists = shoppingLists.length > 0;
  const alreadySentSet = new Set(alreadySentToListIds);
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{t('recipes.detail.sendToList.picker.legend')}</legend>
      <ExistingChoice
        form={form}
        setForm={setForm}
        shoppingLists={shoppingLists}
        alreadySentSet={alreadySentSet}
        hasLists={hasLists}
      />
      <NewChoice form={form} setForm={setForm} />
    </fieldset>
  );
}

interface ExistingProps {
  form: FormState;
  setForm: (next: FormState) => void;
  shoppingLists: readonly ShoppingList[];
  alreadySentSet: ReadonlySet<number>;
  hasLists: boolean;
}

function ExistingChoice({
  form,
  setForm,
  shoppingLists,
  alreadySentSet,
  hasLists,
}: ExistingProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="radio"
          name="send-target-kind"
          value="existing"
          checked={form.kind === 'existing'}
          onChange={() => setForm({ ...form, kind: 'existing' })}
          disabled={!hasLists}
        />
        {t('recipes.detail.sendToList.picker.existing')}
      </label>
      {hasLists ? (
        <ul className="ml-6 mt-2 max-h-40 space-y-1 overflow-y-auto">
          {shoppingLists.map((list) => (
            <ListChoiceRow
              key={list.id}
              list={list}
              selected={form.kind === 'existing' && form.listId === list.id}
              wasSentBefore={alreadySentSet.has(list.id)}
              onSelect={() => setForm({ ...form, kind: 'existing', listId: list.id })}
            />
          ))}
        </ul>
      ) : (
        <p className="ml-6 mt-1 text-xs text-muted-foreground">
          {t('recipes.detail.sendToList.picker.noLists')}
        </p>
      )}
    </div>
  );
}

function NewChoice({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="radio"
          name="send-target-kind"
          value="new"
          checked={form.kind === 'new'}
          onChange={() => setForm({ ...form, kind: 'new' })}
        />
        {t('recipes.detail.sendToList.picker.new')}
      </label>
      <div className="ml-6 mt-2">
        <Label htmlFor="send-to-list-new-name" className="text-xs text-muted-foreground">
          {t('recipes.detail.sendToList.picker.newName')}
        </Label>
        <Input
          id="send-to-list-new-name"
          value={form.newName}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setForm({ ...form, newName: e.target.value })
          }
          disabled={form.kind !== 'new'}
        />
      </div>
    </div>
  );
}
