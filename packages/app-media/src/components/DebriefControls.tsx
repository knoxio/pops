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
import {
  Button,
  CompletionSummary as CompletionSummaryCard,
  type CompletionSummaryData,
} from '@pops/ui';

// ── Types ──

export type DebriefSummaryData = CompletionSummaryData;

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
      void navigate('/media');
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} data-testid="done-for-now-btn">
      <DoorOpen className="mr-1 h-4 w-4" />
      Done for now
    </Button>
  );
}

// ── Completion Summary (router-aware wrapper) ──

interface CompletionSummaryProps {
  data: CompletionSummaryData;
  onDoAnother?: () => void;
}

export function CompletionSummary({ data, onDoAnother }: CompletionSummaryProps) {
  const navigate = useNavigate();
  return (
    <CompletionSummaryCard
      data={data}
      onDoAnother={onDoAnother}
      onDone={() => {
        void navigate('/media/rankings');
      }}
    />
  );
}

// ── Debrief Action Bar ──

interface DebriefActionBarProps {
  sessionId: number;
  currentDimension: { id: number; name: string } | null;
  allComplete: boolean;
  summaryData: CompletionSummaryData | null;
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
  const navigate = useNavigate();

  if (allComplete && summaryData) {
    return (
      <CompletionSummaryCard
        data={summaryData}
        onDoAnother={onDoAnother}
        onDone={() => {
          void navigate('/media/rankings');
        }}
      />
    );
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
