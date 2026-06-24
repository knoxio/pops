/**
 * A movie in the media pillar's contract wire shape (camelCase) for
 * downstream consumers (apps, iOS Swift codegen, SDK).
 *
 * `tmdbId` is typed as a nullable string in this hand-authored consumer
 * interface. The served REST contract (`rest-movies.ts`) models tmdbId as a
 * number — keep that representational difference in mind when reconciling them.
 */
export interface Movie {
  id: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  /** ISO-8601 timestamp. Validated by `MovieSchema` via `.datetime()`. */
  lastEditedTime: string;
}
