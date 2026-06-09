import { Button } from '@pops/ui';

/**
 * Hero image preview + Replace/Remove action row. The card-size thumb is
 * shown by default; if it 404s, `onError` swaps in the original URL once.
 * The `img.onerror = null` reset prevents an infinite fallback loop when
 * the original is missing too.
 */
import type { JSX } from 'react';

export interface HeroPreviewProps {
  cardUrl: string;
  originalUrl: string;
  alt: string;
  isBusy: boolean;
  uploadIsPending: boolean;
  removeIsPending: boolean;
  onReplace: () => void;
  onRemove: () => void;
  labels: { replace: string; remove: string; uploading: string; removing: string };
}

export function HeroPreview(props: HeroPreviewProps): JSX.Element {
  return (
    <figure className="space-y-3">
      <img
        src={props.cardUrl}
        alt={props.alt}
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src !== props.originalUrl) {
            img.onerror = null;
            img.src = props.originalUrl;
          }
        }}
        className="w-full rounded-lg object-cover"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={props.onReplace}
          disabled={props.isBusy}
          className="min-h-[44px]"
        >
          {props.uploadIsPending ? props.labels.uploading : props.labels.replace}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={props.onRemove}
          disabled={props.isBusy}
          className="min-h-[44px]"
        >
          {props.removeIsPending ? props.labels.removing : props.labels.remove}
        </Button>
      </div>
    </figure>
  );
}
