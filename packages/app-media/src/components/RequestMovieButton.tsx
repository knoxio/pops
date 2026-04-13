/**
 * RequestMovieButton — requests a movie via Radarr.
 *
 * Hidden when the movie already exists in Radarr.
 * Disabled when Radarr is not configured.
 * Returns null on query error (service unreachable).
 */
import { Button } from '@pops/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '../lib/trpc';
import { RequestMovieModal } from './RequestMovieModal';

type ButtonVariant = 'standard' | 'compact';

export interface RequestMovieButtonProps {
  tmdbId: number;
  title: string;
  year: number;
  variant?: ButtonVariant;
  onRequest?: (tmdbId: number) => void;
}

export function RequestMovieButton({
  tmdbId,
  title,
  year,
  variant = 'standard',
  onRequest,
}: RequestMovieButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: config?.radarrConfigured === true }
  );

  // Not configured — show disabled button
  if (!config?.radarrConfigured) {
    if (variant === 'compact') {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          disabled
          title="Radarr not configured"
          aria-label="Request movie (Radarr not configured)"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" disabled title="Radarr not configured">
        <Download className="h-4 w-4" />
        Request
      </Button>
    );
  }

  // Loading — show spinner
  if (movieStatus.isLoading) return null;

  // Error — hide entirely (service unreachable)
  if (movieStatus.error) return null;

  // Movie exists in Radarr — hide button
  const status = movieStatus.data?.data?.status;
  if (status && status !== 'not_found') return null;

  const handleClick = () => {
    if (onRequest) {
      onRequest(tmdbId);
    } else {
      setIsModalOpen(true);
    }
  };

  if (variant === 'compact') {
    return (
      <>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={handleClick}
          title="Request in Radarr"
          aria-label="Request in Radarr"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        {!onRequest && (
          <RequestMovieModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            tmdbId={tmdbId}
            title={title}
            year={year}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick}>
        <Download className="h-4 w-4" />
        Request
      </Button>
      {!onRequest && (
        <RequestMovieModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          tmdbId={tmdbId}
          title={title}
          year={year}
        />
      )}
    </>
  );
}
