/**
 * View model for the Documents page. Owns the form state, preview /
 * generation results and notices, and exposes the validated submit
 * actions. Extracted so the page component stays under the
 * line/complexity limits and so this logic stays unit-testable.
 */
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { emitGenerate, emitPreview } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
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

interface GenerateResult {
  document?: GeneratedDocument | null;
  notice?: string;
}

function useGenerateMutation(
  t: (key: string) => string,
  setDocument: (next: GeneratedDocument | null) => void,
  setNotice: (next: string | null) => void
) {
  return useMutation({
    mutationFn: async (request: ValidatedRequest): Promise<GenerateResult> =>
      unwrap(await emitGenerate({ body: request })),
    onSuccess: (result) => {
      setDocument(result?.document ?? null);
      setNotice(result?.notice ?? null);
    },
    onError: (err: Error) => toast.error(extractMessage(err, t('errors.unknown'))),
  });
}

function usePreviewRunner(
  setPreview: (next: PreviewResult | null) => void,
  t: (key: string) => string
) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const runPreview = async (request: ValidatedRequest) => {
    setIsPreviewing(true);
    try {
      const result = await emitPreview({ body: request });
      setPreview(unwrap(result));
    } catch (err) {
      toast.error(extractMessage(err, t('errors.unknown')));
    } finally {
      setIsPreviewing(false);
    }
  };
  return { runPreview, isPreviewing };
}

export function useDocumentsModel(): DocumentsModel {
  const { t } = useTranslation('cerebrum');
  const [form, setForm] = useState<DocumentsFormState>(DEFAULT_DOCUMENTS_FORM);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const generateMutation = useGenerateMutation(t, setDocument, setNotice);
  const { runPreview, isPreviewing } = usePreviewRunner(setPreview, t);

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
