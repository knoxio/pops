import { DoorOpen, SkipForward } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
/**
 * Debrief session controls: skip dimension, bail out (done for now),
 * and completion summary.
 *
 * Designed as composable components for integration into the DebriefPage.
 */
import { Button } from '@pops/ui';

import { SummaryCard } from './SummaryCard';

export type { SummaryCardProps } from './SummaryCard';
export { SummaryCard };

// ── Types ──

interface DimensionResult {
  dimensionId: number;
  name: string;
  status: 'complete' | 'pending';
  comparisonId: number | null;
}

interface DebriefSummaryData {
  sessionId: number;
  movieTitle: string;
  dimensions: DimensionResult[];
}

// ── Skip Dimension Button ──

interface SkipDimensionButtonProps {
  sessionId: number;
  dimensionId: number;
  dimensionName: string;
  onSkipped?: () => void;
}

export function SkipDimensionButton({
  sessionId,
  dimensionId,
  dimensionName,
  onSkipped,
}: SkipDimensionButtonProps) {
  const utils = trpc.useUtils();

  const dismissMutation = trpc.media.comparisons.dismissDebriefDimension.useMutation({
    onSuccess: () => {
      toast.success(`Skipped ${dimensionName}`);
      void utils.media.comparisons.getPendingDebriefs.invalidate();
      onSkipped?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={dismissMutation.isPending}
      onClick={() => {
        dismissMutation.mutate({ sessionId, dimensionId });
      }}
      data-testid="skip-dimension-btn"
    >
      <SkipForward className="mr-1 h-4 w-4" />
      {dismissMutation.isPending ? 'Skipping…' : 'Skip this dimension'}
    </Button>
  );
}

// ── Done For Now (Bail Out) Button ──

interface DoneForNowButtonProps {
  onExit?: () => void;
}

export function DoneForNowButton({ onExit }: DoneForNowButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onExit) {
      onExit();
    } else {
      navigate('/media');
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} data-testid="done-for-now-btn">
      <DoorOpen className="mr-1 h-4 w-4" />
      Done for now
    </Button>
  );
}

// ── Completion Summary (legacy alias — prefer SummaryCard) ──

interface CompletionSummaryProps {
  data: DebriefSummaryData;
  onDoAnother?: () => void;
}

export function CompletionSummary({ data, onDoAnother }: CompletionSummaryProps) {
  return <SummaryCard {...data} onDoAnother={onDoAnother} />;
}

// ── Debrief Action Bar ──

interface DebriefActionBarProps {
  sessionId: number;
  currentDimension: { id: number; name: string } | null;
  allComplete: boolean;
  summaryData: DebriefSummaryData | null;
  onDimensionSkipped?: () => void;
  onDoAnother?: () => void;
}

/**
 * Combined action bar for debrief sessions.
 * Shows skip + bail buttons during active session, summary when complete.
 */
export function DebriefActionBar({
  sessionId,
  currentDimension,
  allComplete,
  summaryData,
  onDimensionSkipped,
  onDoAnother,
}: DebriefActionBarProps) {
  if (allComplete && summaryData) {
    return <SummaryCard {...summaryData} onDoAnother={onDoAnother} />;
  }

  return (
    <div className="flex items-center gap-2" data-testid="debrief-action-bar">
      {currentDimension && (
        <SkipDimensionButton
          sessionId={sessionId}
          dimensionId={currentDimension.id}
          dimensionName={currentDimension.name}
          onSkipped={onDimensionSkipped}
        />
      )}
      <DoneForNowButton />
    </div>
  );
}
