/**
 * Builds the subtitle text for a list page.
 *
 * - When no filter is active (filteredCount === totalCount): returns the "total" key
 *   so the subtitle reads e.g. "16 total transactions".
 * - When a filter is active (filteredCount < totalCount): returns the "filtered" key
 *   so the subtitle reads e.g. "2 of 16 transactions".
 *
 * The caller is responsible for providing the i18n translate function and the
 * appropriate key names — this keeps the helper framework-agnostic and testable.
 */
export interface PageSubtitleArgs {
  t: (key: string, opts?: Record<string, unknown>) => string;
  totalKey: string;
  filteredKey: string;
  total: number;
  filteredCount: number | null;
}

export function buildPageSubtitle({
  t,
  totalKey,
  filteredKey,
  total,
  filteredCount,
}: PageSubtitleArgs): string {
  const isFiltered = filteredCount !== null && filteredCount !== total;
  if (isFiltered) {
    return t(filteredKey, { filtered: filteredCount, total });
  }
  return t(totalKey, { count: total });
}
