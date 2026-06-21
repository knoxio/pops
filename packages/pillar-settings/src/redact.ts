import type { SettingRow } from './schema.js';

/**
 * Fixed sentinel a sensitive value reads back as. The shell renders a
 * field holding this sentinel as an empty password input and only sends
 * fields the user actually edited, so a no-op save never persists the
 * sentinel over the real secret.
 */
export const REDACTED = '__redacted__';

/**
 * Masks sensitive values for READ paths only. Returns a new array; rows
 * whose key is in `sensitive` have their value replaced by
 * {@link REDACTED}. Writes are never passed through this — the stored
 * value stays intact, and only outbound reads are masked.
 */
export function redactSensitive(
  rows: readonly SettingRow[],
  sensitive: ReadonlySet<string>
): SettingRow[] {
  return rows.map((row) =>
    sensitive.has(row.key) ? { key: row.key, value: REDACTED } : { key: row.key, value: row.value }
  );
}

/**
 * Redacts the values of a key→value map for READ paths. Returns a new
 * map; keys in `sensitive` map to {@link REDACTED}.
 */
export function redactSensitiveMap(
  settings: Readonly<Record<string, string>>,
  sensitive: ReadonlySet<string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    out[key] = sensitive.has(key) ? REDACTED : value;
  }
  return out;
}
