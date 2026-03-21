/**
 * PhotoGallery — Thumbnail grid with lightbox overlay.
 *
 * Displays item photos in a responsive grid. Click a thumbnail
 * to open a full-size lightbox with prev/next navigation.
 */
import { useState, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@pops/ui";

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
  baseUrl = "/api/inventory/photos",
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % sorted.length : null,
    );
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + sorted.length) % sorted.length : null,
    );
  }, [sorted.length]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No photos yet.</p>
    );
  }

  const photoSrc = (filePath: string) =>
    `${baseUrl}/${encodeURIComponent(filePath)}`;

  const currentPhoto = lightboxIndex !== null ? sorted[lightboxIndex] : null;

  return (
    <>
      {/* Thumbnail grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {sorted.map((photo, index) => (
          <div key={photo.id} className="group relative">
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className="w-full aspect-square rounded-md overflow-hidden border border-border hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={photoSrc(photo.filePath)}
                alt={photo.caption ?? `Photo ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(photo.id);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                aria-label={`Delete photo ${photo.caption ?? index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

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
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photoSrc(currentPhoto.filePath)}
              alt={currentPhoto.caption ?? "Photo"}
              className="max-w-full max-h-[80vh] object-contain rounded-md"
            />
            {currentPhoto.caption && (
              <p className="text-white text-sm text-center">
                {currentPhoto.caption}
              </p>
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
