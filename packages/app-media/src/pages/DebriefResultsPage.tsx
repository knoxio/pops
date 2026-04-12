/**
 * DebriefResultsPage — route wrapper for /media/debrief/:movieId/results.
 * Parses movieId from URL params and renders DebriefResultsSummary.
 */
import { Button } from '@pops/ui';
import { useNavigate, useParams } from 'react-router';

import { DebriefResultsSummary } from '../components/DebriefResultsSummary';

export function DebriefResultsPage() {
  const { movieId } = useParams<{ movieId: string }>();
  const navigate = useNavigate();
  const id = Number(movieId);

  if (!movieId || isNaN(id)) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center text-muted-foreground">
        <p className="text-lg mb-2">Invalid movie ID</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/media')}>
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <DebriefResultsSummary mediaType="movie" mediaId={id} />
    </div>
  );
}
