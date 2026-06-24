/**
 * Duration parsing.
 *
 * Recipe JSON-LD declares durations as ISO 8601 strings (`PT5M`, `PT1H30M`,
 * `PT45S`). Real-world sites often violate the spec and emit plain text
 * ("5 minutes", "1 hr 30 min"). We try strict ISO first, then a permissive
 * heuristic. Output is the duration in **minutes** (rounded), which is the
 * unit the DSL header consumes via `@recipe(prep_time=N:min)`.
 *
 * Returns `null` when nothing parses — the caller drops the field from the
 * DSL rather than emitting `0:min`.
 */
const ISO_RE = /^P(?:T)?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i;

export function parseDurationMinutes(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const iso = parseIso(trimmed);
  if (iso !== null) return iso;
  return parseHeuristic(trimmed);
}

function parseIso(input: string): number | null {
  const m = ISO_RE.exec(input);
  if (m === null) return null;
  const [, h, mm, ss] = m;
  if (h === undefined && mm === undefined && ss === undefined) return null;
  const hours = h === undefined ? 0 : Number(h);
  const minutes = mm === undefined ? 0 : Number(mm);
  const seconds = ss === undefined ? 0 : Number(ss);
  const total = hours * 60 + minutes + seconds / 60;
  if (!Number.isFinite(total)) return null;
  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}

const HOUR_TOKEN = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i;
const MINUTE_TOKEN = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i;

function parseHeuristic(input: string): number | null {
  const hourMatch = HOUR_TOKEN.exec(input);
  const minuteMatch = MINUTE_TOKEN.exec(input);
  if (hourMatch === null && minuteMatch === null) {
    const bareNumber = /^(\d+(?:\.\d+)?)$/.exec(input);
    if (bareNumber !== null) {
      const n = Math.round(Number(bareNumber[1]));
      return n > 0 ? n : null;
    }
    return null;
  }
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = hours * 60 + minutes;
  if (!Number.isFinite(total)) return null;
  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}
