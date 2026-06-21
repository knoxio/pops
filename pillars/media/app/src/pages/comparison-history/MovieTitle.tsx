import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { unwrap } from '../../media-api-helpers.js';
import { moviesGet } from '../../media-api/index.js';

interface MovieGetResult {
  data: { title: string } | null;
}

export function MovieTitle({ mediaId, className }: { mediaId: number; className?: string }) {
  const { data } = useQuery<MovieGetResult>({
    queryKey: ['media', 'movies', 'get', { id: mediaId }],
    queryFn: async () => unwrap(await moviesGet({ path: { id: mediaId } })),
  });
  const title = data?.data?.title ?? `Movie #${mediaId}`;
  return (
    <Link to={`/media/movies/${mediaId}`} className={className}>
      {title}
    </Link>
  );
}
