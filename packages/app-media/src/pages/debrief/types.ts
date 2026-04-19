export interface DebriefMovie {
  mediaType: string;
  mediaId: number;
  title: string;
  posterUrl: string | null;
}

export type DebriefDimensionStatus = 'pending' | 'complete';

export interface DebriefDimension {
  dimensionId: number;
  name: string;
  status: DebriefDimensionStatus;
  comparisonId: number | null;
  opponent: {
    id: number;
    title: string;
    posterUrl?: string | null;
  } | null;
}

export interface Debrief {
  sessionId: number;
  movie: DebriefMovie;
  dimensions: DebriefDimension[];
}
