/**
 * `isStructuredCaption(caption)` returns true when a reel caption already
 * contains a recipe in a parseable shape, letting the pipeline skip the
 * slow `faster-whisper` STT stage.
 *
 * Tuned conservatively: false negatives (running STT unnecessarily) are
 * cheaper than false positives (skipping STT and missing recipe content).
 */
const MIN_LENGTH = 100;
const MIN_BULLET_LINES = 5;
const BULLET_OR_NUMBER_RE = /^[-•*\d]/;
const INGREDIENT_HEADER_RE = /ingredient(s|\b)/i;
const STEP_HEADER_RE = /(method|steps|directions|instructions)/i;
const MEASUREMENT_RE = /\b(g|kg|ml|l|cup|tbsp|tsp|oz|lb)\b/i;

export function isStructuredCaption(caption: string | null | undefined): boolean {
  if (caption == null) return false;
  if (caption.length < MIN_LENGTH) return false;
  const lines = caption.split('\n');
  const bulletCount = lines.filter((l) => BULLET_OR_NUMBER_RE.test(l.trim())).length;
  const hasBulletsOrNumbers = bulletCount >= MIN_BULLET_LINES;
  const hasIngredientsHeader = INGREDIENT_HEADER_RE.test(caption);
  const hasStepsHeader = STEP_HEADER_RE.test(caption);
  const hasMeasurementUnits = MEASUREMENT_RE.test(caption);
  return (hasBulletsOrNumbers && hasMeasurementUnits) || (hasIngredientsHeader && hasStepsHeader);
}
