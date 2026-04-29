import { useEffect, useState } from 'react';

/**
 * usePosterCascade — 3-tier poster image fallback hook.
 *
 * Tier 1: posterUrl (primary, e.g. user override or local cache path)
 * Tier 2: fallbackPosterUrl (secondary, e.g. CDN / API-sourced poster)
 * Tier 3: placeholder (shown when both URLs are absent or fail to load)
 *
 * Pass only `posterUrl` for 2-tier behaviour (URL → placeholder).
 *
 * State resets whenever `posterUrl` changes, allowing the component to
 * display a fresh image when the primary URL is swapped (e.g. navigating
 * between detail pages without unmounting).
 */
export function usePosterCascade(posterUrl?: string | null, fallbackPosterUrl?: string | null) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(
    posterUrl ?? fallbackPosterUrl ?? null
  );
  const [showPlaceholder, setShowPlaceholder] = useState(!posterUrl && !fallbackPosterUrl);

  useEffect(() => {
    setCurrentSrc(posterUrl ?? fallbackPosterUrl ?? null);
    setShowPlaceholder(!posterUrl && !fallbackPosterUrl);
    setImageLoaded(false);
  }, [posterUrl, fallbackPosterUrl]);

  const handleImageError = () => {
    if (currentSrc === posterUrl && fallbackPosterUrl) {
      setCurrentSrc(fallbackPosterUrl);
      setImageLoaded(false);
      return;
    }
    setShowPlaceholder(true);
  };

  return {
    activeSrc: showPlaceholder ? null : currentSrc,
    showPlaceholder,
    imageLoaded,
    setImageLoaded,
    handleImageError,
  };
}
