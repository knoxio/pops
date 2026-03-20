/**
 * Shared API response types for all pops-api endpoints.
 * Every endpoint returns one of these envelope shapes.
 */

/** Paginated list response. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Single item response. */
export interface ItemResponse<T> {
  data: T;
}

/** Mutation response (create/update). */
export interface MutationResponse<T> {
  data: T;
  message: string;
}

/** Delete response. */
export interface DeleteResponse {
  message: string;
}

/** Error response body. */
export interface ErrorResponse {
  error: string;
  details?: unknown;
}
