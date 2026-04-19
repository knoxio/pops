// Shared formatting utilities for currency, dates, bytes, and relative time.

export interface FormatCurrencyOptions {
  locale?: string;
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function formatCurrency(value: number, options: FormatCurrencyOptions = {}): string {
  const {
    locale = 'en-AU',
    currency = 'AUD',
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/** AUD, no decimal places. */
export const formatAUD = (value: number) => formatCurrency(value);

/** USD, no decimal places. */
export const formatUSD = (value: number) =>
  formatCurrency(value, { locale: 'en-US', currency: 'USD' });

// ---------------------------------------------------------------------------

export type DateStyle = 'short' | 'medium' | 'long' | 'datetime';

/**
 * Format a date string or ISO timestamp.
 *
 * - `short`    — "5 Jan 2025"      (en-AU, abbreviated month)
 * - `medium`   — "5 January 2025"  (en-AU, full month name)
 * - `long`     — "Sunday, 5 January" (en-AU, weekday + day + month)
 * - `datetime` — locale date+time string
 */
export function formatDate(dateStr: string, style: DateStyle = 'short'): string {
  const date = new Date(dateStr);
  switch (style) {
    case 'short':
      return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    case 'medium':
      return date.toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'long':
      return date.toLocaleDateString('en-AU', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    case 'datetime':
      return date.toLocaleString('en-AU');
  }
}

// ---------------------------------------------------------------------------

/**
 * Format byte count as a human-readable string.
 * Supports B, KB, MB, GB with configurable decimal precision (default 1).
 */
export function formatBytes(bytes: number, precision = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(precision)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(precision)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(precision)} GB`;
}

// ---------------------------------------------------------------------------

/**
 * Format a date string as a relative time expression.
 * e.g. "just now", "5m ago", "2h ago", "3d ago", "2mo ago".
 */
export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
