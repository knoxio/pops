import { Link } from 'react-router';

import { Badge, cn } from '@pops/ui';

export interface RankingRowProps {
  rank: number;
  mediaType: string;
  mediaId: number;
  score: number;
  comparisonCount: number;
  confidence: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

function rankColor(rank: number): string {
  if (rank === 1) return 'text-warning';
  if (rank === 2) return 'text-zinc-400';
  return 'text-amber-700';
}

function confColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-success';
  if (confidence >= 0.4) return 'text-warning';
  return 'text-destructive';
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="w-8 text-right text-sm font-bold text-muted-foreground tabular-nums">
      {rank <= 3 ? <span className={rankColor(rank)}>#{rank}</span> : `#${rank}`}
    </span>
  );
}

function PosterLink({
  href,
  posterUrl,
  title,
}: {
  href: string;
  posterUrl: string | null;
  title: string;
}) {
  return (
    <Link to={href} className="shrink-0">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          className="w-10 aspect-[2/3] rounded object-cover bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="w-10 aspect-[2/3] rounded bg-muted" />
      )}
    </Link>
  );
}

function RankingMeta({
  href,
  title,
  mediaType,
  year,
}: {
  href: string;
  title: string;
  mediaType: string;
  year: number | null;
}) {
  return (
    <div className="flex-1 min-w-0">
      <Link to={href} className="hover:underline">
        <h3 className="text-sm font-medium truncate">{title}</h3>
      </Link>
      <div className="flex items-center gap-2 mt-0.5">
        <Badge variant="secondary" className="text-xs">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </Badge>
        {year && <span className="text-xs text-muted-foreground">{year}</span>}
      </div>
    </div>
  );
}

function ScoreBlock({
  score,
  comparisonCount,
  confidence,
}: {
  score: number;
  comparisonCount: number;
  confidence: number;
}) {
  return (
    <div className="text-right shrink-0">
      <div className="text-sm font-semibold tabular-nums">{score}</div>
      <div className="text-xs text-muted-foreground">
        {comparisonCount} {comparisonCount === 1 ? 'match' : 'matches'}
      </div>
      {comparisonCount > 0 && (
        <div className={cn('text-xs tabular-nums', confColor(confidence))}>
          {Math.round(confidence * 100)}% conf
        </div>
      )}
    </div>
  );
}

export function RankingRow(props: RankingRowProps) {
  const { rank, mediaType, mediaId, title, year, posterUrl, score, comparisonCount, confidence } =
    props;
  const href = mediaType === 'movie' ? `/media/movies/${mediaId}` : `/media/tv/${mediaId}`;
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <RankBadge rank={rank} />
      <PosterLink href={href} posterUrl={posterUrl} title={title} />
      <RankingMeta href={href} title={title} mediaType={mediaType} year={year} />
      <ScoreBlock score={score} comparisonCount={comparisonCount} confidence={confidence} />
    </div>
  );
}
