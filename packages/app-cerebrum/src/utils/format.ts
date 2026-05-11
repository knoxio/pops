/**
 * Shared formatting helpers used across Cerebrum surfaces (Plexus,
 * Reflex, Glia, Engrams). Centralised so the display format stays
 * identical across every table/panel.
 */

/**
 * Render an ISO-8601 timestamp as `YYYY-MM-DD HH:MM` (UTC). Returns
 * an em-dash for nullish input, and the original string when the date
 * cannot be parsed.
 */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 16);
}
