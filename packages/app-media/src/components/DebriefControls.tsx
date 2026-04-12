/**
 * Debrief session controls: skip dimension, bail out (done for now),
 * and completion summary.
 *
 * Designed as composable components for integration into the DebriefPage.
 */
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@pops/ui';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  DoorOpen,
  SkipForward,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

// ── Types ──

interface DimensionResult {
  dimensionId: number;
  name: string;
  status: 'complete' | 'pending';
  /** Non-null if a comparison was recorded (not skipped). */
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
      onClick={() => dismissMutation.mutate({ sessionId, dimensionId })}
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

// ── Completion Summary ──

interface CompletionSummaryProps {
  data: DebriefSummaryData;
  onDoAnother?: () => void;
}

export function CompletionSummary({ data, onDoAnother }: CompletionSummaryProps) {
  const navigate = useNavigate();

  const completed = data.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId !== null
  );
  const skipped = data.dimensions.filter((d) => d.status === 'complete' && d.comparisonId === null);

  return (
    <Card data-testid="completion-summary">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-lg">Debrief Complete</CardTitle>
        </div>
        <p className="text-muted-foreground text-sm">
          Finished debrief for <strong>{data.movieTitle}</strong>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {data.dimensions.map((dim) => (
            <div key={dim.dimensionId} className="flex items-center justify-between text-sm">
              <span>{dim.name}</span>
              {dim.status === 'complete' && dim.comparisonId !== null ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Compared
                </Badge>
              ) : dim.status === 'complete' && dim.comparisonId === null ? (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Skipped
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  Pending
                </Badge>
              )}
            </div>
          ))}
        </div>

        <div className="text-muted-foreground border-t pt-3 text-sm">
          {completed.length} compared, {skipped.length} skipped
        </div>

        <div className="flex gap-2 pt-1">
          {onDoAnother && (
            <Button variant="outline" size="sm" onClick={onDoAnother}>
              <ArrowRight className="mr-1 h-4 w-4" />
              Do another
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate('/media/compare/rankings')}
            data-testid="done-btn"
          >
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
    return <CompletionSummary data={summaryData} onDoAnother={onDoAnother} />;
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
