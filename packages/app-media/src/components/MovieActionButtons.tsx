import { useState } from 'react';

import { trpc } from '@pops/api-client';
/**
 * MovieActionButtons — conditional action buttons for non-library movies.
 *
 * When rotation is enabled: shows "Add to Queue" and "Download" buttons
 * with status badges (In Queue, Excluded).
 * When rotation is disabled: delegates to the existing RequestMovieButton.
 *
 * PRD-072 US-05
 */

import { QueueActionButtons } from './movie-action-buttons/QueueActionButtons';
import { ExcludedButton, InQueueButton } from './movie-action-buttons/StatusButtons';
import { useRotationButtonsModel } from './movie-action-buttons/useRotationButtonsModel';
import { RequestMovieButton } from './RequestMovieButton';

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

function shouldHideRotationButtons(
  movieStatus: ReturnType<typeof useRotationButtonsModel>['movieStatus'],
  candidateLoading: boolean
): boolean {
  const radarrStatus = movieStatus.data?.data?.status;
  if (radarrStatus && radarrStatus !== 'not_found') return true;
  return candidateLoading || movieStatus.isLoading;
}

function RotationButtons(props: MovieActionButtonsProps & { variant: ButtonVariant }) {
  const { tmdbId, title, year, posterPath, rating, variant } = props;
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const model = useRotationButtonsModel(tmdbId);

  if (shouldHideRotationButtons(model.movieStatus, model.candidateLoading)) return null;

  const inQueue = model.candidateData?.inQueue ?? false;
  const isExcluded = model.candidateData?.isExcluded ?? false;

  if (isExcluded) {
    return (
      <ExcludedButton tmdbId={tmdbId} variant={variant} mutation={model.removeExclusionMutation} />
    );
  }
  if (inQueue) {
    return (
      <InQueueButton tmdbId={tmdbId} variant={variant} mutation={model.removeFromQueueMutation} />
    );
  }

  return (
    <QueueActionButtons
      tmdbId={tmdbId}
      title={title}
      year={year}
      variant={variant}
      radarrConfigured={model.radarrConfigured}
      downloadModalOpen={downloadModalOpen}
      setDownloadModalOpen={setDownloadModalOpen}
      onAddToQueue={() => {
        model.addToQueueMutation.mutate({ tmdbId, title, year, posterPath, rating });
      }}
      isAdding={model.addToQueueMutation.isPending}
    />
  );
}
