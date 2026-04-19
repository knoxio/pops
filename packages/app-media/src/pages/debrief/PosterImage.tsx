import { ImageOff } from 'lucide-react';
import { useState } from 'react';

interface PosterImageProps {
  src: string | null;
  alt: string;
  className?: string;
}

export function PosterImage({ src, alt, className }: PosterImageProps) {
  const [imgError, setImgError] = useState(false);

  if (!src || imgError) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className ?? ''}`}>
        <ImageOff className="text-muted-foreground h-8 w-8" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={() => setImgError(true)} />;
}
