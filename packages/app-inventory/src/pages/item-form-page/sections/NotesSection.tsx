import { Eye, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { Button, Textarea } from '@pops/ui';

import type { UseFormRegister, UseFormWatch } from 'react-hook-form';

import type { ItemFormValues } from '../useItemFormPageModel';

interface NotesSectionProps {
  register: UseFormRegister<ItemFormValues>;
  watch: UseFormWatch<ItemFormValues>;
  notesPreview: boolean;
  onTogglePreview: () => void;
}

export function NotesSection({
  register,
  watch,
  notesPreview,
  onTogglePreview,
}: NotesSectionProps) {
  const { t } = useTranslation('inventory');
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
          Notes
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onTogglePreview}
          className="text-xs text-muted-foreground"
        >
          {notesPreview ? (
            <>
              <PenLine className="h-3.5 w-3.5 mr-1" /> {t('form.editNotes')}
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 mr-1" /> {t('form.previewNotes')}
            </>
          )}
        </Button>
      </div>
      {notesPreview ? (
        <div className="prose prose-sm dark:prose-invert max-w-none min-h-[6.5rem] p-3 rounded-md border bg-muted/30">
          {watch('notes') ? (
            <Markdown rehypePlugins={[rehypeSanitize]}>{watch('notes')}</Markdown>
          ) : (
            <p className="text-muted-foreground italic">{t('form.nothingToPreview')}</p>
          )}
        </div>
      ) : (
        <Textarea
          {...register('notes')}
          rows={4}
          placeholder={t('form.notesPlaceholder')}
          className="w-full bg-transparent"
        />
      )}
    </section>
  );
}
