/**
 * TierListSummary — shows results after submitting a tier list.
 *
 * Displays total comparisons recorded, per-movie score changes with
 * green/red delta badges, and action buttons.
 */
import { Button } from '@pops/ui';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export interface ScoreChange {
  movieId: number;
  title: string;
  oldScore: number;
  newScore: number;
}

interface TierListSummaryProps {
  comparisonsRecorded: number;
  scoreChanges: ScoreChange[];
  onDoAnother: () => void;
  onDone: () => void;
}

export function TierListSummary({
  comparisonsRecorded,
  scoreChanges,
  onDoAnother,
  onDone,
}: TierListSummaryProps) {
  const movieCount = scoreChanges.length;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Tier List Submitted</h2>
        <p className="text-muted-foreground">
          {comparisonsRecorded} comparison{comparisonsRecorded !== 1 ? 's' : ''} from {movieCount}{' '}
          movie{movieCount !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-2">
        {scoreChanges.map((change) => {
          const delta = Math.round((change.newScore - change.oldScore) * 10) / 10;
          const isPositive = delta > 0;
          const isNegative = delta < 0;

          return (
            <div
              key={change.movieId}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="text-sm font-medium truncate">{change.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{Math.round(change.oldScore)}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-sm font-medium">{Math.round(change.newScore)}</span>
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    isPositive
                      ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                      : isNegative
                        ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                        : 'bg-muted text-muted-foreground'
                  }`}
                  data-testid={`delta-${change.movieId}`}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : isNegative ? (
                    <ArrowDownRight className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                  {isPositive ? '+' : ''}
                  {delta}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onDoAnother}>
          Do Another
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
