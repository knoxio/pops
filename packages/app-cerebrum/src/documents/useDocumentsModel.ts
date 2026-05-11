/**
 * View model for the Documents page. Owns the form state, preview /
 * generation results and notices, and exposes the validated submit
 * actions. Extracted so the page component stays under the
 * line/complexity limits and so this logic stays unit-testable.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { extractMessage } from '../utils/errors';
import { errorMessageKey, validateForm, type ValidatedRequest } from './form-mapping';
import {
  DEFAULT_DOCUMENTS_FORM,
  type DocumentsFormState,
  type GeneratedDocument,
  type PreviewResult,
} from './types';

export interface DocumentsModel {
  form: DocumentsFormState;
  setForm: (next: DocumentsFormState) => void;
  preview: PreviewResult | null;
  document: GeneratedDocument | null;
  notice: string | null;
  isGenerating: boolean;
  isPreviewing: boolean;
  onPreview: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
}

export function useDocumentsModel(): DocumentsModel {
  const { t } = useTranslation('cerebrum');
  const utils = trpc.useUtils();
  const [form, setForm] = useState<DocumentsFormState>(DEFAULT_DOCUMENTS_FORM);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const generateMutation = trpc.cerebrum.emit.generate.useMutation({
    onSuccess: (result) => {
      setDocument(result?.document ?? null);
      setNotice(result?.notice ?? null);
    },
    onError: (err) => toast.error(extractMessage(err, t('errors.unknown'))),
  });

  const runPreview = async (request: ValidatedRequest) => {
    setIsPreviewing(true);
    try {
      const result = await utils.cerebrum.emit.preview.fetch(request);
      setPreview(result ?? null);
    } catch (err) {
      toast.error(extractMessage(err, t('errors.unknown')));
    } finally {
      setIsPreviewing(false);
    }
  };

  const runValidatedAction = (action: 'preview' | 'generate') => {
    const validated = validateForm(form);
    if (!validated.ok) {
      toast.error(t(errorMessageKey(validated.error)));
      return;
    }
    if (action === 'preview') {
      void runPreview(validated.request);
    } else {
      generateMutation.mutate(validated.request);
    }
  };

  return {
    form,
    setForm,
    preview,
    document,
    notice,
    isGenerating: generateMutation.isPending,
    isPreviewing,
    onPreview: () => runValidatedAction('preview'),
    onGenerate: () => runValidatedAction('generate'),
    onRegenerate: () => runValidatedAction('generate'),
  };
}
