/**
 * Deterministic tag/label coloring based on string hash.
 * Uses OKLCH for perceptually uniform colors that look good in dark mode.
 */
export function hashToColor(input: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    backgroundColor: `oklch(0.3 0.08 ${hue} / 0.4)`,
    color: `oklch(0.85 0.06 ${hue})`,
    borderColor: `oklch(0.85 0.06 ${hue} / 0.2)`,
  };
}
