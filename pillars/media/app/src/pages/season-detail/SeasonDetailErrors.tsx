import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

export function InvalidParamsError() {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Invalid parameters</AlertTitle>
        <AlertDescription>Show ID and season number must be valid numbers.</AlertDescription>
      </Alert>
    </div>
  );
}

export function ShowError({ is404, message }: { is404: boolean; message: string }) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Show not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {is404 ? "This TV show doesn't exist in your library." : message}
        </AlertDescription>
      </Alert>
      <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
        Back to library
      </Link>
    </div>
  );
}

export function SeasonNotFoundError({
  showId,
  showName,
  seasonNum,
}: {
  showId: number;
  showName: string;
  seasonNum: number;
}) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Season not found</AlertTitle>
        <AlertDescription>
          Season {seasonNum} doesn't exist for {showName}.
        </AlertDescription>
      </Alert>
      <Link to={`/media/tv/${showId}`} className="mt-4 inline-block text-sm text-primary underline">
        Back to {showName}
      </Link>
    </div>
  );
}
