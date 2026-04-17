import { ChevronLeft, ChevronRight, Package, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * PhotoGallery — Primary display + thumbnail strip with lightbox overlay.
 *
 * Shows the selected photo at full width, a thumbnail strip below (for 2+ photos),
 * and a lightbox overlay on primary click. Click a thumbnail to swap it into primary.
 */
import { Button } from '@pops/ui';

export interface PhotoItem {
  id: number;
  filePath: string;
  caption: string | null;
  sortOrder: number;
}

interface PhotoGalleryProps {
  photos: PhotoItem[];
  onDelete?: (photoId: number) => void;
  /** Base URL prefix for photo file paths (default: "/api/inventory/photos") */
  baseUrl?: string;
}

export function PhotoGallery({
  photos,
  onDelete,
  baseUrl = '/api/inventory/photos',
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sorted = [...photos].toSorted((a, b) => a.sortOrder - b.sortOrder);

  // Reset selected index if photos change and index is out of bounds
  useEffect(() => {
    if (selectedIndex >= sorted.length) {
      setSelectedIndex(0);
    }
  }, [sorted.length, selectedIndex]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % sorted.length : null));
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + sorted.length) % sorted.length : null));
  }, [sorted.length]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  if (photos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-muted-foreground"
        data-testid="photo-placeholder"
      >
        <Package className="h-16 w-16 mb-3 opacity-30" />
        <p className="text-sm">No photos yet</p>
      </div>
    );
  }

  const photoSrc = (filePath: string) => `${baseUrl}/${encodeURIComponent(filePath)}`;

  const primaryPhoto = sorted[selectedIndex]!;
  const currentPhoto = lightboxIndex !== null ? sorted[lightboxIndex] : null;

  return (
    <>
      {/* Primary photo display */}
      <button
        type="button"
        onClick={() => {
          openLightbox(selectedIndex);
        }}
        className="w-full rounded-lg overflow-hidden border bg-muted cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="primary-photo"
        aria-label="View photo in lightbox"
      >
        <img
          src={photoSrc(primaryPhoto.filePath)}
          alt={primaryPhoto.caption ?? 'Primary photo'}
          className="w-full max-h-96 object-contain"
        />
      </button>
      {primaryPhoto.caption && (
        <p className="text-sm text-muted-foreground mt-1">{primaryPhoto.caption}</p>
      )}

      {/* Thumbnail strip (only for 2+ photos) */}
      {sorted.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1" data-testid="thumbnail-strip">
          {sorted.map((photo, index) => (
            <div key={photo.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedIndex(index);
                }}
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
      )}

      {/* Lightbox overlay */}
      {currentPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Previous */}
          {sorted.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          {/* Main image */}
          <div
            className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <img
              src={photoSrc(currentPhoto.filePath)}
              alt={currentPhoto.caption ?? 'Photo'}
              className="max-w-full max-h-[80vh] object-contain rounded-md"
            />
            {currentPhoto.caption && (
              <p className="text-white text-sm text-center">{currentPhoto.caption}</p>
            )}
            <p className="text-white/60 text-xs">
              {lightboxIndex! + 1} / {sorted.length}
            </p>
          </div>

          {/* Next */}
          {sorted.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next photo"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}
        </div>
      )}
    </>
  );
}
