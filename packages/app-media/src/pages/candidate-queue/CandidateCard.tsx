import { useState } from 'react';

import { Badge } from '@pops/ui';

import { ExcludedActions, PendingActions } from './CandidateActions';
import { useCardMutations } from './useCardMutations';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

export interface Candidate {
  id: number;
  tmdbId: number;
  title: string;
  year: number | null;
  rating: number | null;
  posterPath: string | null;
  discoveredAt: string;
  sourceName: string | null;
  sourcePriority: number | null;
}

interface CandidateCardProps {
  candidate: Candidate;
  actions?: 'pending' | 'excluded' | 'none';
}

function CandidateMeta({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium truncate">{candidate.title}</span>
        {candidate.year && (
          <span className="text-xs text-muted-foreground">({candidate.year})</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
        {candidate.rating != null && (
          <span className="text-warning">{candidate.rating.toFixed(1)}</span>
        )}
        {candidate.sourceName && <span>{candidate.sourceName}</span>}
        {candidate.sourcePriority != null && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            P{candidate.sourcePriority}
          </Badge>
        )}
        <span>{new Date(candidate.discoveredAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function PosterThumb({ candidate }: { candidate: Candidate }) {
  return (
    <div className="h-18 w-12 shrink-0 overflow-hidden rounded bg-muted">
      {candidate.posterPath ? (
        <img
          src={`${TMDB_IMG}${candidate.posterPath}`}
          alt={candidate.title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          N/A
        </div>
      )}
    </div>
  );
}

export function CandidateCard({ candidate, actions = 'none' }: CandidateCardProps) {
  const [excludeReason, setExcludeReason] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { downloadMutation, excludeMutation, unexcludeMutation } = useCardMutations(
    candidate,
    setPopoverOpen
  );

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <PosterThumb candidate={candidate} />
      <CandidateMeta candidate={candidate} />
      <div className="flex items-center gap-1.5 shrink-0">
        {actions === 'pending' && (
          <PendingActions
            candidate={candidate}
            downloadMutation={downloadMutation}
            excludeMutation={excludeMutation}
            popoverOpen={popoverOpen}
            setPopoverOpen={setPopoverOpen}
            excludeReason={excludeReason}
            setExcludeReason={setExcludeReason}
          />
        )}
        {actions === 'excluded' && (
          <ExcludedActions candidate={candidate} unexcludeMutation={unexcludeMutation} />
        )}
      </div>
    </div>
  );
}
