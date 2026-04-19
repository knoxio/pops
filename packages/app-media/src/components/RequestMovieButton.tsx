import { Download } from 'lucide-react';

import { trpc } from '@pops/api-client';
/**
 * RequestMovieButton — requests a movie via Radarr.
 *
 * Hidden when the movie already exists in Radarr.
 * Disabled when Radarr is not configured.
 * Returns null on query error (service unreachable).
 *
 * Uses ConditionalModalButton to manage the RequestMovieModal open state.
 */
import { Button } from '@pops/ui';

import { ConditionalModalButton } from './ConditionalModalButton';
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

  // Loading — show nothing
  if (movieStatus.isLoading) return null;

  // Error — hide entirely (service unreachable)
  if (movieStatus.error) return null;

  // Movie exists in Radarr — hide button
  const status = movieStatus.data?.data?.status;
  if (status && status !== 'not_found') return null;

  // onRequest override — caller handles the action directly
  if (onRequest) {
    if (variant === 'compact') {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={() => onRequest(tmdbId)}
          title="Request in Radarr"
          aria-label="Request in Radarr"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" onClick={() => onRequest(tmdbId)}>
        <Download className="h-4 w-4" />
        Request
      </Button>
    );
  }

  return (
    <ConditionalModalButton
      show
      trigger={({ onClick }) =>
        variant === 'compact' ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20"
            onClick={onClick}
            title="Request in Radarr"
            aria-label="Request in Radarr"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onClick}>
            <Download className="h-4 w-4" />
            Request
          </Button>
        )
      }
      modal={({ open, onClose }) => (
        <RequestMovieModal
          open={open}
          onClose={onClose}
          tmdbId={tmdbId}
          title={title}
          year={year}
        />
      )}
    />
  );
}
