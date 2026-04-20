/**
 * ImageGallery — primary photo + thumbnail strip + lightbox overlay with
 * keyboard navigation. Reusable across any domain with image galleries.
 */
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';

export interface ImageGalleryItem {
  id: string;
  src: string;
  caption?: string;
  alt?: string;
}

export interface ImageGalleryProps {
  items: ImageGalleryItem[];
  /** Optional delete callback per item. If provided, renders a delete button. */
  onDelete?: (id: string) => void;
  /** Enable arrow-key navigation in the lightbox. Default `true`. */
  keyboardNav?: boolean;
  className?: string;
}

function useGalleryNav(itemsLength: number) {
  const [activeIndex, setActiveIndex] = useState(0);

  const goPrev = useCallback(
    () => setActiveIndex((i) => (i === 0 ? itemsLength - 1 : i - 1)),
    [itemsLength]
  );
  const goNext = useCallback(
    () => setActiveIndex((i) => (i === itemsLength - 1 ? 0 : i + 1)),
    [itemsLength]
  );

  useEffect(() => {
    if (activeIndex >= itemsLength) setActiveIndex(Math.max(0, itemsLength - 1));
  }, [itemsLength, activeIndex]);

  return { activeIndex, setActiveIndex, goPrev, goNext };
}

function useLightboxKeys(
  enabled: boolean,
  goPrev: () => void,
  goNext: () => void,
  onClose: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, goPrev, goNext, onClose]);
}

function Thumbnails({
  items,
  activeIndex,
  onPick,
}: {
  items: ImageGalleryItem[];
  activeIndex: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Show image ${i + 1}`}
          aria-current={i === activeIndex}
          className={cn(
            'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all',
            i === activeIndex ? 'border-ring' : 'border-transparent opacity-70 hover:opacity-100'
          )}
        >
          <img src={item.src} alt={item.alt ?? ''} className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

interface LightboxProps {
  active: ImageGalleryItem;
  itemsLength: number;
  onDelete?: (id: string) => void;
  goPrev: () => void;
  goNext: () => void;
  onClose: () => void;
}

function Lightbox({ active, itemsLength, onDelete, goPrev, goNext, onClose }: LightboxProps) {
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <img
          src={active.src}
          alt={active.alt ?? active.caption ?? ''}
          className="max-h-[calc(100vh-6rem)] max-w-full object-contain"
        />
        {active.caption ? (
          <div className="mt-2 text-center text-sm text-white/80">{active.caption}</div>
        ) : null}
        <div className="absolute right-2 top-2 flex gap-1">
          {onDelete ? (
            <Button
              size="icon-sm"
              variant="destructive"
              aria-label="Delete image"
              onClick={() => onDelete(active.id)}
            >
              <Trash2 />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="secondary" aria-label="Close gallery" onClick={onClose}>
            <X />
          </Button>
        </div>
        {itemsLength > 1 ? (
          <>
            <Button
              size="icon-sm"
              variant="secondary"
              aria-label="Previous image"
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2"
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              aria-label="Next image"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ImageGallery({
  items,
  onDelete,
  keyboardNav = true,
  className,
}: ImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { activeIndex, setActiveIndex, goPrev, goNext } = useGalleryNav(items.length);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  useLightboxKeys(lightboxOpen && keyboardNav, goPrev, goNext, closeLightbox);

  const active = items[activeIndex];
  if (items.length === 0 || !active) return null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="group relative overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={active.src}
          alt={active.alt ?? active.caption ?? ''}
          className="aspect-video w-full object-contain transition-transform group-hover:scale-[1.01]"
        />
        {active.caption ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-sm text-white">
            {active.caption}
          </div>
        ) : null}
      </button>

      {items.length > 1 ? (
        <Thumbnails items={items} activeIndex={activeIndex} onPick={setActiveIndex} />
      ) : null}

      {lightboxOpen ? (
        <Lightbox
          active={active}
          itemsLength={items.length}
          onDelete={onDelete}
          goPrev={goPrev}
          goNext={goNext}
          onClose={closeLightbox}
        />
      ) : null}
    </div>
  );
}
