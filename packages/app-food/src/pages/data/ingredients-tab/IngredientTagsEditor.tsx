/**
 * PRD-151 — Tags section embedded in PRD-122's ingredient detail panel.
 *
 * Chip list + an "+ Add tag" input wired to `food.ingredients.tags.distinct`
 * for autocomplete. The local draft is committed in one call via
 * `food.ingredients.tags.set` (full-set replacement, transactional). Errors
 * surface inline rather than through a thrown TRPCError — the router's
 * `set` procedure returns `{ ok: false, reason }` so the UI can map to
 * localised copy without a try/catch ladder.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button, Chip, TextInput } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { ingredientTagsDistinct, ingredientTagsList } from '../../../food-api/index.js';
import { useTagsDraft, type TagsDraft } from './useTagsDraft.js';

const DATALIST_ID = 'ingredient-tag-suggestions';

interface Props {
  ingredientId: number;
}

export function IngredientTagsEditor({ ingredientId }: Props) {
  const { t } = useTranslation('food');
  const tagsQuery = useQuery({
    queryKey: ['food', 'ingredients', 'tags', 'list', { ingredientId }],
    queryFn: async () => unwrap(await ingredientTagsList({ query: { ingredientId } })),
  });
  const distinctQuery = useQuery({
    queryKey: ['food', 'ingredients', 'tags', 'distinct', {}],
    queryFn: async () => unwrap(await ingredientTagsDistinct({ query: {} })),
  });
  const draft = useTagsDraft({
    ingredientId,
    remoteTags: tagsQuery.data?.tags ?? null,
  });

  return (
    <section aria-label={t('data.ingredients.tags.heading')} className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide">
        {t('data.ingredients.tags.heading')}
      </h3>
      {tagsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>
      ) : (
        <>
          <TagsChipList draft={draft} />
          <TagsControls draft={draft} suggestions={distinctQuery.data?.tags ?? []} />
          {draft.errorKey !== null ? (
            <p role="alert" className="text-destructive text-sm">
              {t(draft.errorKey)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function TagsChipList({ draft }: { draft: TagsDraft }) {
  const { t } = useTranslation('food');
  return (
    <ul aria-label={t('data.ingredients.tags.currentAriaLabel')} className="flex flex-wrap gap-2">
      {draft.tags.length === 0 ? (
        <li className="text-muted-foreground text-sm">{t('data.ingredients.tags.empty')}</li>
      ) : (
        draft.tags.map((tag) => (
          <li key={tag}>
            <Chip variant="outline" size="sm" removable onRemove={() => draft.remove(tag)}>
              {tag}
            </Chip>
          </li>
        ))
      )}
    </ul>
  );
}

function TagsControls({
  draft,
  suggestions,
}: {
  draft: TagsDraft;
  suggestions: readonly { tag: string }[];
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <datalist id={DATALIST_ID}>
        {suggestions.map((row) => (
          <option key={row.tag} value={row.tag} />
        ))}
      </datalist>
      <TextInput
        type="text"
        list={DATALIST_ID}
        value={draft.pending}
        onChange={(e) => draft.setPending(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            draft.commitPending();
          }
        }}
        placeholder={t('data.ingredients.tags.addPlaceholder')}
        className="max-w-xs"
        aria-label={t('data.ingredients.tags.addAriaLabel')}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={draft.commitPending}
        disabled={draft.pending.trim().length === 0}
      >
        {t('data.ingredients.tags.add')}
      </Button>
      <div className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        onClick={draft.reset}
        disabled={!draft.dirty || draft.isSaving}
      >
        {t('data.ingredients.tags.reset')}
      </Button>
      <Button size="sm" onClick={draft.save} disabled={!draft.dirty || draft.isSaving}>
        {draft.isSaving ? t('data.ingredients.tags.saving') : t('data.ingredients.tags.save')}
      </Button>
    </div>
  );
}
