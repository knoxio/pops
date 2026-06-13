import { Link } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

interface MovieGetResult {
  data: { title: string } | null;
}

export function MovieTitle({ mediaId, className }: { mediaId: number; className?: string }) {
  const { data } = usePillarQuery<MovieGetResult>('media', ['movies', 'get'], { id: mediaId });
  const title = data?.data?.title ?? `Movie #${mediaId}`;
  return (
    <Link to={`/media/movies/${mediaId}`} className={className}>
      {title}
    </Link>
  );
}
