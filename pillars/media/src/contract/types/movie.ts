/**
 * A movie in the media pillar's contract wire shape (camelCase) for
 * downstream consumers (apps, iOS Swift codegen, SDK).
 *
 * `tmdbId` is a string (not a numeric id) so the contract is wire-format
 * agnostic — the TMDB id surface across pillars varies (number on movies,
 * occasionally string on cross-source shows), and string keeps the
 * OpenAPI snapshot stable.
 */
export interface Movie {
  id: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  /** ISO-8601 timestamp. Validated by `MovieSchema` via `.datetime()`. */
  lastEditedTime: string;
}
