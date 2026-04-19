import { ArrowRight, CheckCircle, Clock, Trophy, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

/**
 * SummaryCard — completion summary for a debrief session.
 *
 * Displays compared vs. skipped dimensions, with "Do another" and "Done" CTAs.
 * Extracted from DebriefControls so it can be reused independently.
 */
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

interface DimensionResult {
  dimensionId: number;
  name: string;
  status: 'complete' | 'pending';
  comparisonId: number | null;
}

export interface SummaryCardProps {
  movieTitle: string;
  dimensions: DimensionResult[];
  onDoAnother?: () => void;
}

export function SummaryCard({ movieTitle, dimensions, onDoAnother }: SummaryCardProps) {
  const navigate = useNavigate();

  const completed = dimensions.filter((d) => d.status === 'complete' && d.comparisonId !== null);
  const skipped = dimensions.filter((d) => d.status === 'complete' && d.comparisonId === null);

  return (
    <Card data-testid="completion-summary">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">Debrief Complete</CardTitle>
        </div>
        <p className="text-muted-foreground text-sm">
          Finished debrief for <strong>{movieTitle}</strong>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {dimensions.map((dim) => (
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
            onClick={() => navigate('/media/rankings')}
            data-testid="done-btn"
          >
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
