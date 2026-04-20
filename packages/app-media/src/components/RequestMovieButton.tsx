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

function CompactRequestButton({
  onClick,
  disabled,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-white hover:bg-white/20"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <Download className="h-3.5 w-3.5" />
    </Button>
  );
}

function StandardRequestButton({
  onClick,
  disabled,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled} title={title}>
      <Download className="h-4 w-4" />
      Request
    </Button>
  );
}

function RequestButtonShell({
  variant,
  onClick,
  disabled,
  title,
}: {
  variant: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
}) {
  if (variant === 'compact') {
    return <CompactRequestButton onClick={onClick} disabled={disabled} title={title} />;
  }
  return <StandardRequestButton onClick={onClick} disabled={disabled} title={title} />;
}

function useRequestMovieGate(tmdbId: number) {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;
  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: config?.radarrConfigured === true }
  );
  return { config, movieStatus };
}

export function RequestMovieButton({
  tmdbId,
  title,
  year,
  variant = 'standard',
  onRequest,
}: RequestMovieButtonProps) {
  const { config, movieStatus } = useRequestMovieGate(tmdbId);

  if (!config?.radarrConfigured) {
    return <RequestButtonShell variant={variant} disabled title="Radarr not configured" />;
  }
  if (movieStatus.isLoading || movieStatus.error) return null;
  const status = movieStatus.data?.data?.status;
  if (status && status !== 'not_found') return null;

  if (onRequest) {
    return (
      <RequestButtonShell
        variant={variant}
        onClick={() => onRequest(tmdbId)}
        title="Request in Radarr"
      />
    );
  }

  return (
    <ConditionalModalButton
      show
      trigger={({ onClick }) => (
        <RequestButtonShell variant={variant} onClick={onClick} title="Request in Radarr" />
      )}
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
