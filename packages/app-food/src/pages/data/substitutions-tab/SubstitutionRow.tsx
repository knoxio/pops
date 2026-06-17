import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, TextInput } from '@pops/ui';

import type { HydratedEndpoint, HydratedSubstitutionView } from './substitution-wire-types.js';
import type { UpdateSubstitutionFormInput } from './types';

interface EditState {
  ratio: string;
  contextTags: string;
}

function renderEndpoint(ep: HydratedEndpoint): string {
  if (ep.kind === 'ingredient') return ep.slug || `ingredient #${ep.id}`;
  const parent = ep.parentSlug !== null ? `${ep.parentSlug}:` : '';
  return `${parent}${ep.slug || `variant#${ep.id}`}`;
}

function parseTags(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function ScopeCell({ row }: { row: HydratedSubstitutionView }) {
  const { t } = useTranslation('food');
  if (row.scope === 'global') return <>{t('data.substitutions.scope.global')}</>;
  return <>{`${t('data.substitutions.scope.recipe')} (${row.recipeSlug ?? row.recipeId})`}</>;
}

function EditActions({
  isUpdating,
  onCommit,
  onCancel,
}: {
  isUpdating: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" type="button" disabled={isUpdating} onClick={onCommit}>
        {t('data.substitutions.table.save')}
      </Button>
      <Button variant="outline" size="sm" type="button" onClick={onCancel}>
        {t('data.substitutions.table.cancel')}
      </Button>
    </div>
  );
}

function ViewActions({
  isDeleting,
  onEdit,
  onDelete,
}: {
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex justify-end gap-1">
      <Button variant="outline" size="sm" type="button" onClick={onEdit}>
        {t('data.substitutions.table.edit')}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        type="button"
        disabled={isDeleting}
        onClick={onDelete}
      >
        {t('data.substitutions.table.delete')}
      </Button>
    </div>
  );
}

function RatioCell({
  row,
  editing,
  edit,
  setEdit,
}: {
  row: HydratedSubstitutionView;
  editing: boolean;
  edit: EditState;
  setEdit: (s: EditState) => void;
}) {
  const { t } = useTranslation('food');
  if (!editing) return <>{row.ratio}</>;
  return (
    <TextInput
      aria-label={t('data.substitutions.table.ratioAria', { id: row.id })}
      value={edit.ratio}
      onChange={(e) => setEdit({ ...edit, ratio: e.target.value })}
      inputMode="decimal"
      className="h-7 text-xs"
    />
  );
}

function TagsCell({
  row,
  editing,
  edit,
  setEdit,
}: {
  row: HydratedSubstitutionView;
  editing: boolean;
  edit: EditState;
  setEdit: (s: EditState) => void;
}) {
  const { t } = useTranslation('food');
  if (!editing) return <>{row.contextTags.join(', ') || '—'}</>;
  return (
    <TextInput
      aria-label={t('data.substitutions.table.tagsAria', { id: row.id })}
      value={edit.contextTags}
      onChange={(e) => setEdit({ ...edit, contextTags: e.target.value })}
      className="h-7 text-xs"
    />
  );
}

export function SubstitutionRow({
  row,
  isUpdating,
  isDeleting,
  onUpdate,
  onDelete,
}: {
  row: HydratedSubstitutionView;
  isUpdating: boolean;
  isDeleting: boolean;
  onUpdate: (input: UpdateSubstitutionFormInput) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>({
    ratio: String(row.ratio),
    contextTags: row.contextTags.join(', '),
  });

  function startEdit() {
    setEdit({ ratio: String(row.ratio), contextTags: row.contextTags.join(', ') });
    setEditing(true);
  }

  function commitEdit() {
    const ratio = Number(edit.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    onUpdate({ id: row.id, ratio, contextTags: parseTags(edit.contextTags) });
    setEditing(false);
  }

  return (
    <tr data-testid={`sub-row-${row.id}`} className="border-border border-t">
      <td className="px-3 py-2 text-sm">{renderEndpoint(row.from)}</td>
      <td className="px-3 py-2 text-sm">{renderEndpoint(row.to)}</td>
      <td className="px-3 py-2 text-sm">
        <RatioCell row={row} editing={editing} edit={edit} setEdit={setEdit} />
      </td>
      <td className="px-3 py-2 text-sm">
        <ScopeCell row={row} />
      </td>
      <td className="px-3 py-2 text-sm">
        <TagsCell row={row} editing={editing} edit={edit} setEdit={setEdit} />
      </td>
      <td className="text-muted-foreground px-3 py-2 text-xs">{row.createdAt}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <EditActions
            isUpdating={isUpdating}
            onCommit={commitEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ViewActions
            isDeleting={isDeleting}
            onEdit={startEdit}
            onDelete={() => onDelete(row.id)}
          />
        )}
      </td>
    </tr>
  );
}
