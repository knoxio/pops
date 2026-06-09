import { HeroDropZone } from './HeroDropZone';
import { HeroPreview } from './HeroPreview';

/**
 * Switches between the preview and the empty-state drop-zone. Lives in its
 * own file so the parent component stays under the max-lines-per-function
 * cap with the input + state plumbing kept inline.
 */
import type { JSX } from 'react';
import type { useTranslation } from 'react-i18next';

export interface HeroBodyProps {
  currentPath: string | null;
  cardUrl: string | null;
  originalUrl: string | null;
  isBusy: boolean;
  uploadIsPending: boolean;
  removeIsPending: boolean;
  dragOver: boolean;
  dropLabelId: string;
  maxBytes: number;
  t: ReturnType<typeof useTranslation>['t'];
  onPick: () => void;
  onRemove: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
}

export function HeroBody(props: HeroBodyProps): JSX.Element {
  if (props.currentPath && props.originalUrl) {
    return (
      <HeroPreview
        cardUrl={props.cardUrl ?? props.originalUrl}
        originalUrl={props.originalUrl}
        alt={props.t('hero.alt', 'Recipe hero image')}
        isBusy={props.isBusy}
        uploadIsPending={props.uploadIsPending}
        removeIsPending={props.removeIsPending}
        onReplace={props.onPick}
        onRemove={props.onRemove}
        labels={{
          replace: props.t('hero.replace', 'Replace'),
          remove: props.t('hero.remove', 'Remove'),
          uploading: props.t('hero.uploading', 'Uploading…'),
          removing: props.t('hero.removing', 'Removing…'),
        }}
      />
    );
  }
  return (
    <HeroDropZone
      dropLabelId={props.dropLabelId}
      isBusy={props.isBusy}
      uploadIsPending={props.uploadIsPending}
      dragOver={props.dragOver}
      maxBytes={props.maxBytes}
      onClick={props.onPick}
      onDrop={props.onDrop}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      labels={{
        dropPrompt: props.t('hero.dropPrompt', 'Drop an image or tap to choose'),
        uploading: props.t('hero.uploading', 'Uploading…'),
        acceptHint: props.t('hero.acceptHint', 'JPG, PNG, or WebP up to {{mb}} MB'),
      }}
    />
  );
}
