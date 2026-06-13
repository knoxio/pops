/**
 * Shared response shapes for the debrief surface. Extracted from
 * `service.ts` to keep that file under the max-lines cap after the
 * Theme-13 Wave-5 cerebrum cutover.
 */
export interface DebriefDimension {
  dimensionId: number;
  name: string;
  status: 'pending' | 'complete';
  comparisonId: number | null;
  opponent: {
    id: number;
    title: string;
    posterPath: string | null;
    posterUrl: string | null;
  } | null;
}

export interface DebriefResponse {
  sessionId: number;
  status: 'pending' | 'active' | 'complete';
  movie: {
    mediaType: string;
    mediaId: number;
    title: string;
    posterPath: string | null;
    posterUrl: string | null;
  };
  dimensions: DebriefDimension[];
}

export interface MovieMetaRow {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}
