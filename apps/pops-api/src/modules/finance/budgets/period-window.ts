/**
 * Period window resolution for budget spend aggregation.
 *
 * - Monthly  → first day of the current month at 00:00:00 UTC.
 * - Yearly   → first day of the current year at 00:00:00 UTC.
 * - null/anything else → null (all-time, no lower bound on transaction date).
 *
 * The cutoff is returned as an ISO `YYYY-MM-DD` string because
 * `transactions.date` is stored as a `YYYY-MM-DD` text column. Inclusive
 * comparisons (`date >= start`) work directly against this lexicographic form.
 *
 * Spend aggregation also clamps the upper bound to today (see
 * {@link periodWindowEnd}) — Monthly = month-to-date, Yearly = year-to-date.
 */
export function periodWindowStart(
  period: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (period === 'Monthly') {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  if (period === 'Yearly') {
    return `${now.getUTCFullYear()}-01-01`;
  }
  return null;
}

/**
 * Inclusive upper bound (`YYYY-MM-DD`) for the spend window. Always clamps to
 * today regardless of period — future-dated transactions never count toward
 * MTD/YTD spend.
 */
export function periodWindowEnd(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
