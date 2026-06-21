export interface ShelfItem {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number;
  inLibrary: boolean;
  isWatched?: boolean;
  onWatchlist?: boolean;
  matchPercentage?: number;
  matchReason?: string;
  rotationExpiresAt?: string;
}
