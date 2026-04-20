import { Link } from 'react-router';

import { trpc } from '@pops/api-client';

export function MovieTitle({ mediaId, className }: { mediaId: number; className?: string }) {
  const { data } = trpc.media.movies.get.useQuery({ id: mediaId });
  const title = data?.data?.title ?? `Movie #${mediaId}`;
  return (
    <Link to={`/media/movies/${mediaId}`} className={className}>
      {title}
    </Link>
  );
}
