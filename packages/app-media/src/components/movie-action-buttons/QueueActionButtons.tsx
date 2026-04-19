import { Download, ListPlus, Loader2 } from 'lucide-react';

import { ActionGroup, Button, ConditionalModalButton } from '@pops/ui';

import { RequestMovieModal } from '../RequestMovieModal';

interface QueueActionButtonsProps {
  tmdbId: number;
  title: string;
  year: number;
  variant: 'standard' | 'compact';
  radarrConfigured: boolean;
  downloadModalOpen: boolean;
  setDownloadModalOpen: (v: boolean) => void;
  onAddToQueue: () => void;
  isAdding: boolean;
}

function CompactQueueButtons({
  onAddToQueue,
  isAdding,
  radarrConfigured,
  setDownloadModalOpen,
}: Pick<
  QueueActionButtonsProps,
  'onAddToQueue' | 'isAdding' | 'radarrConfigured' | 'setDownloadModalOpen'
>) {
  return (
    <ActionGroup>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-white hover:bg-white/20"
        onClick={onAddToQueue}
        disabled={isAdding}
        title="Add to Rotation Queue"
        aria-label="Add to Rotation Queue"
      >
        {isAdding ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ListPlus className="h-3.5 w-3.5" />
        )}
      </Button>
      {radarrConfigured && (
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
      )}
    </ActionGroup>
  );
}

function StandardQueueButtons({
  onAddToQueue,
  isAdding,
  radarrConfigured,
  setDownloadModalOpen,
}: Pick<
  QueueActionButtonsProps,
  'onAddToQueue' | 'isAdding' | 'radarrConfigured' | 'setDownloadModalOpen'
>) {
  return (
    <ActionGroup className="gap-2">
      <Button variant="outline" size="sm" onClick={onAddToQueue} disabled={isAdding}>
        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
        Add to Queue
      </Button>
      {radarrConfigured && (
        <Button variant="outline" size="sm" onClick={() => setDownloadModalOpen(true)}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      )}
    </ActionGroup>
  );
}

export function QueueActionButtons(props: QueueActionButtonsProps) {
  const { tmdbId, title, year, downloadModalOpen, setDownloadModalOpen, variant } = props;
  return (
    <ConditionalModalButton
      modal={
        <RequestMovieModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          tmdbId={tmdbId}
          title={title}
          year={year}
          mode="download"
        />
      }
    >
      {variant === 'compact' ? (
        <CompactQueueButtons {...props} />
      ) : (
        <StandardQueueButtons {...props} />
      )}
    </ConditionalModalButton>
  );
}
