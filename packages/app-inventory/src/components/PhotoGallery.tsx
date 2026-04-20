import { Package } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Lightbox } from './photo-gallery/Lightbox';
import { ThumbnailStrip } from './photo-gallery/ThumbnailStrip';

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

function PrimaryPhoto({
  photo,
  onClick,
  src,
}: {
  photo: PhotoItem;
  onClick: () => void;
  src: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg overflow-hidden border bg-muted cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="primary-photo"
        aria-label="View photo in lightbox"
      >
        <img
          src={src}
          alt={photo.caption ?? 'Primary photo'}
          className="w-full max-h-96 object-contain"
        />
      </button>
      {photo.caption && <p className="text-sm text-muted-foreground mt-1">{photo.caption}</p>}
    </>
  );
}

function EmptyState() {
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

export function PhotoGallery({
  photos,
  onDelete,
  baseUrl = '/api/inventory/photos',
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sorted = [...photos].toSorted((a, b) => a.sortOrder - b.sortOrder);
  const photoSrc = useCallback(
    (filePath: string) => `${baseUrl}/${encodeURIComponent(filePath)}`,
    [baseUrl]
  );

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % sorted.length : null));
  }, [sorted.length]);
  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + sorted.length) % sorted.length : null));
  }, [sorted.length]);

  if (photos.length === 0) return <EmptyState />;

  const safeIndex = selectedIndex >= sorted.length ? 0 : selectedIndex;
  const primaryPhoto = sorted[safeIndex];
  const currentPhoto = lightboxIndex !== null ? sorted[lightboxIndex] : null;
  if (!primaryPhoto) return null;

  return (
    <>
      <PrimaryPhoto
        photo={primaryPhoto}
        src={photoSrc(primaryPhoto.filePath)}
        onClick={() => setLightboxIndex(safeIndex)}
      />
      {sorted.length > 1 && (
        <ThumbnailStrip
          photos={sorted}
          selectedIndex={safeIndex}
          onSelect={setSelectedIndex}
          onDelete={onDelete}
          photoSrc={photoSrc}
        />
      )}
      {currentPhoto && lightboxIndex !== null && (
        <Lightbox
          photo={currentPhoto}
          index={lightboxIndex}
          total={sorted.length}
          src={photoSrc(currentPhoto.filePath)}
          onClose={() => setLightboxIndex(null)}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
