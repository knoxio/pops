import { Trash2 } from 'lucide-react';

import { Button } from '@pops/ui';

import type { PhotoItem } from '../PhotoGallery';

interface ThumbnailStripProps {
  photos: PhotoItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete?: (photoId: number) => void;
  photoSrc: (filePath: string) => string;
}

export function ThumbnailStrip({
  photos,
  selectedIndex,
  onSelect,
  onDelete,
  photoSrc,
}: ThumbnailStripProps) {
  return (
    <div className="flex gap-2 mt-3 overflow-x-auto pb-1" data-testid="thumbnail-strip">
      {photos.map((photo, index) => (
        <div key={photo.id} className="group relative shrink-0">
          <button
            type="button"
            onClick={() => onSelect(index)}
            className={`w-16 h-16 rounded-md overflow-hidden border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              index === selectedIndex
                ? 'border-app-accent ring-2 ring-app-accent'
                : 'border-border hover:border-app-accent/50'
            }`}
            aria-label={photo.caption ?? `Photo ${index + 1}`}
            data-testid={`thumbnail-${index}`}
          >
            <img
              src={photoSrc(photo.filePath)}
              alt={photo.caption ?? `Photo ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(photo.id);
              }}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background/80 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
              aria-label={`Delete photo ${photo.caption ?? index + 1}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
