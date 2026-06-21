/**
 * useIngestKeyboard — keyboard shortcut wiring for the capture body editor
 * (PRD-081 US-01 / US-08).
 *
 *   Cmd/Ctrl+Enter         — submit using the current routing
 *   Cmd/Ctrl+Shift+Enter   — force bulk split (US-08)
 *   Esc                    — clear the body and surface an Undo toast
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface UseIngestKeyboardArgs {
  body: string;
  isValid: boolean;
  isSubmitting: boolean;
  handleSubmit: (options?: { forceBulk?: boolean }) => void;
  setBody: (value: string) => void;
}

function isModifierEnter(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey;
}

function isForceBulkEnter(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === 'Enter' && e.shiftKey && (e.metaKey || e.ctrlKey);
}

export function useIngestKeyboard({
  body,
  isValid,
  isSubmitting,
  handleSubmit,
  setBody,
}: UseIngestKeyboardArgs) {
  const { t } = useTranslation('cerebrum');

  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isForceBulkEnter(e) && isValid && !isSubmitting) {
        e.preventDefault();
        handleSubmit({ forceBulk: true });
        return;
      }
      if (isModifierEnter(e) && isValid && !isSubmitting) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 'Escape' && body.length > 0) {
        e.preventDefault();
        const cleared = body;
        setBody('');
        toast(t('ingest.cleared'), {
          action: {
            label: t('ingest.undo'),
            onClick: () => setBody(cleared),
          },
        });
      }
    },
    [body, isValid, isSubmitting, handleSubmit, setBody, t]
  );
}
