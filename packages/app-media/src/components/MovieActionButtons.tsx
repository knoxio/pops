import { Ban, Check, Download, ListPlus, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * MovieActionButtons — conditional action buttons for non-library movies.
 *
 * When rotation is enabled: shows "Add to Queue" and "Download" buttons
 * with status badges (In Queue, Excluded).
 * When rotation is disabled: delegates to the existing RequestMovieButton.
 *
 * PRD-072 US-05
 */
import { Button } from '@pops/ui';

import { trpc } from '../lib/trpc';
import { RequestMovieButton } from './RequestMovieButton';
import { RequestMovieModal } from './RequestMovieModal';

type ButtonVariant = 'standard' | 'compact';

export interface MovieActionButtonsProps {
  tmdbId: number;
  title: string;
  year: number;
  posterPath?: string;
  rating?: number;
  variant?: ButtonVariant;
}

export function MovieActionButtons({
  tmdbId,
  title,
  year,
  posterPath,
  rating,
  variant = 'standard',
}: MovieActionButtonsProps) {
  const { data: statusData } = trpc.media.rotation.status.useQuery();
  const rotationEnabled = statusData?.isRunning ?? false;

  if (!rotationEnabled) {
    return <RequestMovieButton tmdbId={tmdbId} title={title} year={year} variant={variant} />;
  }

  return (
    <RotationButtons
      tmdbId={tmdbId}
      title={title}
      year={year}
      posterPath={posterPath}
      rating={rating}
      variant={variant}
    />
  );
}

function RotationButtons({
  tmdbId,
  title,
  year,
  posterPath,
  rating,
  variant,
}: MovieActionButtonsProps & { variant: ButtonVariant }) {
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const radarrConfigured = configData?.data?.radarrConfigured === true;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: radarrConfigured }
  );

  const { data: candidateData, isLoading: candidateLoading } =
    trpc.media.rotation.getCandidateStatus.useQuery({ tmdbId });

  const addToQueueMutation = trpc.media.rotation.addToQueue.useMutation({
    onSuccess: () => {
      toast.success('Added to rotation queue');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to add to queue'),
  });

  const removeFromQueueMutation = trpc.media.rotation.removeFromQueue.useMutation({
    onSuccess: () => {
      toast.success('Removed from queue');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to remove from queue'),
  });

  const removeExclusionMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
      toast.success('Exclusion removed');
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error('Failed to remove exclusion'),
  });

  // Movie already in Radarr — hide buttons
  const radarrStatus = movieStatus.data?.data?.status;
  if (radarrStatus && radarrStatus !== 'not_found') return null;

  // Loading state
  if (candidateLoading || movieStatus.isLoading) return null;

  const inQueue = candidateData?.inQueue ?? false;
  const isExcluded = candidateData?.isExcluded ?? false;

  // Excluded badge
  if (isExcluded) {
    if (variant === 'compact') {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-amber-500 hover:bg-amber-500/20"
          onClick={() => removeExclusionMutation.mutate({ tmdbId })}
          disabled={removeExclusionMutation.isPending}
          title="Excluded — click to un-exclude"
          aria-label="Un-exclude movie"
        >
          {removeExclusionMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Ban className="h-3.5 w-3.5" />
          )}
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-amber-500 border-amber-500/50"
        onClick={() => removeExclusionMutation.mutate({ tmdbId })}
        disabled={removeExclusionMutation.isPending}
      >
        {removeExclusionMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Ban className="h-4 w-4" />
        )}
        Excluded
      </Button>
    );
  }

  // In Queue badge
  if (inQueue) {
    if (variant === 'compact') {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-success hover:bg-destructive/20 hover:text-destructive/80"
          onClick={() => removeFromQueueMutation.mutate({ tmdbId })}
          disabled={removeFromQueueMutation.isPending}
          title="In Queue — click to remove"
          aria-label="Remove from queue"
        >
          {removeFromQueueMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </Button>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="group text-success border-success/50 hover:text-destructive/80 hover:border-destructive/50"
        onClick={() => removeFromQueueMutation.mutate({ tmdbId })}
        disabled={removeFromQueueMutation.isPending}
      >
        {removeFromQueueMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Check className="h-4 w-4 group-hover:hidden" />
            <X className="h-4 w-4 hidden group-hover:inline" />
          </>
        )}
        In Queue
      </Button>
    );
  }

  // Action buttons: Add to Queue + Download
  const handleAddToQueue = () => {
    addToQueueMutation.mutate({ tmdbId, title, year, posterPath, rating });
  };

  if (variant === 'compact') {
    return (
      <>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={handleAddToQueue}
          disabled={addToQueueMutation.isPending}
          title="Add to Rotation Queue"
          aria-label="Add to Rotation Queue"
        >
          {addToQueueMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListPlus className="h-3.5 w-3.5" />
          )}
        </Button>
        {radarrConfigured && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setDownloadModalOpen(true)}
              title="Download Now"
              aria-label="Download Now"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <RequestMovieModal
              open={downloadModalOpen}
              onClose={() => setDownloadModalOpen(false)}
              tmdbId={tmdbId}
              title={title}
              year={year}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddToQueue}
        disabled={addToQueueMutation.isPending}
      >
        {addToQueueMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ListPlus className="h-4 w-4" />
        )}
        Add to Queue
      </Button>
      {radarrConfigured && (
        <>
          <Button variant="outline" size="sm" onClick={() => setDownloadModalOpen(true)}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <RequestMovieModal
            open={downloadModalOpen}
            onClose={() => setDownloadModalOpen(false)}
            tmdbId={tmdbId}
            title={title}
            year={year}
          />
        </>
      )}
    </>
  );
}
