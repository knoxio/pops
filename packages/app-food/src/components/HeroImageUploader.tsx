/**
 * Shows the current hero or a drop-zone, accepts drag-drop or click-to-pick,
 * reads the picked file as base64, and calls `food.heroImage.upload`. Errors
 * surface as toasts; the parent gets notified through `onUploaded` /
 * `onRemoved` callbacks so it can refresh its query state.
 */
import { type JSX, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HERO_ALLOWED_MIME_TYPES, heroImageUrl } from '../storage/hero-paths';
import { HeroBody } from './hero-image-uploader/HeroBody';
import { useHeroMutations } from './hero-image-uploader/useHeroMutations';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT_ATTR = HERO_ALLOWED_MIME_TYPES.join(',');

export interface HeroImageUploaderProps {
  recipeId: number;
  /** Existing `recipes.hero_image_path` value, or null if no hero yet. */
  currentPath: string | null;
  /** Fired after the upload mutation succeeds. */
  onUploaded: (path: string) => void;
  /** Fired after the remove mutation succeeds. */
  onRemoved: () => void;
  /** Upper size bound enforced client-side. Defaults to 8 MB. */
  maxBytes?: number;
}

interface DragHandlers {
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
}

function useDragHandlers(
  isBusy: boolean,
  uploadFile: (file: File) => Promise<void>,
  dragOver: boolean,
  setDragOver: (v: boolean) => void
): DragHandlers {
  return {
    onDrop: (e) => {
      e.preventDefault();
      setDragOver(false);
      if (isBusy) return;
      const file = e.dataTransfer.files[0];
      if (file) void uploadFile(file);
    },
    onDragOver: (e) => {
      e.preventDefault();
      if (!dragOver) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
  };
}

export function HeroImageUploader(props: HeroImageUploaderProps): JSX.Element {
  const { recipeId, currentPath, onUploaded, onRemoved } = props;
  const maxBytes = props.maxBytes ?? DEFAULT_MAX_BYTES;
  const { t } = useTranslation('food');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropLabelId = useId();
  const [dragOver, setDragOver] = useState(false);

  const { uploadIsPending, removeIsPending, uploadFile, removeHero } = useHeroMutations({
    recipeId,
    maxBytes,
    onUploaded,
    onRemoved,
    uploadedMsg: t('hero.uploadSuccess', 'Hero image uploaded.'),
    removedMsg: t('hero.removeSuccess', 'Hero image removed.'),
  });
  const isBusy = uploadIsPending || removeIsPending;
  const drag = useDragHandlers(isBusy, uploadFile, dragOver, setDragOver);

  const pick = (): void => {
    if (!isBusy) inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        data-testid="hero-image-uploader-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <HeroBody
        currentPath={currentPath}
        cardUrl={heroImageUrl(currentPath, 'card')}
        originalUrl={heroImageUrl(currentPath, 'original')}
        isBusy={isBusy}
        uploadIsPending={uploadIsPending}
        removeIsPending={removeIsPending}
        dragOver={dragOver}
        dropLabelId={dropLabelId}
        maxBytes={maxBytes}
        t={t}
        onPick={pick}
        onRemove={() => {
          if (!isBusy) removeHero();
        }}
        onDrop={drag.onDrop}
        onDragOver={drag.onDragOver}
        onDragLeave={drag.onDragLeave}
      />
    </div>
  );
}
