/**
 * Wraps the hero-image upload + remove mutations and the client-side file
 * validation. Returns a single object so the parent component reads only the
 * four fields it actually needs.
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../food-api-helpers.js';
import { heroImageRemove, heroImageUpload } from '../../food-api/index.js';
import { HERO_ALLOWED_MIME_TYPES } from '../../storage/hero-paths';

import type { HeroImageUploadData } from '../../food-api/types.gen.js';

type HeroImageUploadBody = NonNullable<HeroImageUploadData['body']>;

interface ValidationResult {
  ok: boolean;
  reason?: string;
}

function validateFile(file: File, maxBytes: number): ValidationResult {
  if (!(HERO_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: `Unsupported file type "${file.type || 'unknown'}". Use JPG, PNG, or WebP.`,
    };
  }
  if (file.size > maxBytes) {
    // Round up + clamp to 1 so the toast never tells the user the limit is
    // "0 MB" when the configured cap is sub-1MB.
    const mb = Math.max(1, Math.ceil(maxBytes / (1024 * 1024)));
    return { ok: false, reason: `Image exceeds the ${mb} MB limit.` };
  }
  return { ok: true };
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const reader = new FileReader();
    reader.onerror = () => rejectPromise(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        rejectPromise(new Error('FileReader did not return a string'));
        return;
      }
      // result is "data:<mime>;base64,<payload>" — strip the prefix.
      const commaIdx = result.indexOf(',');
      resolvePromise(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export interface MutationState {
  uploadIsPending: boolean;
  removeIsPending: boolean;
  uploadFile: (file: File) => Promise<void>;
  removeHero: () => void;
}

export interface MutationOptions {
  recipeId: number;
  maxBytes: number;
  onUploaded: (path: string) => void;
  onRemoved: () => void;
  uploadedMsg: string;
  removedMsg: string;
}

export function useHeroMutations(opts: MutationOptions): MutationState {
  const { recipeId, maxBytes, onUploaded, onRemoved, uploadedMsg, removedMsg } = opts;
  const uploadMutation = useMutation({
    mutationFn: async (body: HeroImageUploadBody) =>
      unwrap(await heroImageUpload({ path: { recipeId }, body })),
    onSuccess: (res) => {
      onUploaded(res.data.heroImagePath);
      toast.success(uploadedMsg);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async () => unwrap(await heroImageRemove({ path: { recipeId } })),
    onSuccess: () => {
      onRemoved();
      toast.success(removedMsg);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadFile = useCallback(
    async (file: File) => {
      const validation = validateFile(file, maxBytes);
      if (!validation.ok) {
        toast.error(validation.reason ?? 'File rejected.');
        return;
      }
      try {
        const contentBase64 = await readAsBase64(file);
        uploadMutation.mutate({
          mimeType: file.type as HeroImageUploadBody['mimeType'],
          contentBase64,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not read the selected file.');
      }
    },
    [maxBytes, uploadMutation]
  );

  const removeHero = useCallback(() => {
    removeMutation.mutate();
  }, [removeMutation]);

  return {
    uploadIsPending: uploadMutation.isPending,
    removeIsPending: removeMutation.isPending,
    uploadFile,
    removeHero,
  };
}
