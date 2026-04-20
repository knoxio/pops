import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@pops/ui';

import type { PhotoItem } from '../PhotoGallery';

interface LightboxProps {
  photo: PhotoItem;
  index: number;
  total: number;
  src: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

function NavButton({
  side,
  onClick,
  ariaLabel,
  children,
}: {
  side: 'left' | 'right';
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`absolute ${side}-4 text-white hover:bg-white/20`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  );
}

function LightboxBody({
  photo,
  index,
  total,
  src,
}: {
  photo: PhotoItem;
  index: number;
  total: number;
  src: string;
}) {
  return (
    <div
      className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={src}
        alt={photo.caption ?? 'Photo'}
        className="max-w-full max-h-[80vh] object-contain rounded-md"
      />
      {photo.caption && <p className="text-white text-sm text-center">{photo.caption}</p>}
      <p className="text-white/60 text-xs">
        {index + 1} / {total}
      </p>
    </div>
  );
}

function useLightboxKeys(onClose: () => void, onNext: () => void, onPrev: () => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);
}

export function Lightbox({ photo, index, total, src, onClose, onNext, onPrev }: LightboxProps) {
  useLightboxKeys(onClose, onNext, onPrev);
  const showNav = total > 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Close lightbox"
      >
        <X className="h-6 w-6" />
      </Button>
      {showNav && (
        <NavButton
          side="left"
          ariaLabel="Previous photo"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
        >
          <ChevronLeft className="h-8 w-8" />
        </NavButton>
      )}
      <LightboxBody photo={photo} index={index} total={total} src={src} />
      {showNav && (
        <NavButton
          side="right"
          ariaLabel="Next photo"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
        >
          <ChevronRight className="h-8 w-8" />
        </NavButton>
      )}
    </div>
  );
}
