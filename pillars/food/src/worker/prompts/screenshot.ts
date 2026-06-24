/**
 * Claude vision prompt for the screenshot ingest path.
 *
 * Bump `PROMPT_VERSION_SCREENSHOT` whenever the prompt body changes — the
 * version is recorded in `meta.stages.vision.prompt_version` and reported
 * through `@pops/ai-telemetry` to the ai pillar.
 */

/** Bump on every meaningful change to {@link SCREENSHOT_PROMPT}. */
export const PROMPT_VERSION_SCREENSHOT = 'screenshot-v1.0';

/** Default model for the vision call; overridable via `FOOD_SCREENSHOT_VISION_MODEL`. */
export const SCREENSHOT_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const SCREENSHOT_PROMPT = `You are extracting a recipe from a single image. The image may be a screenshot of a recipe website, a photo of a cookbook page, a photo of a handwritten note, or a screenshot of a recipe shared in a chat app.

Read all text in the image carefully, including any overlays, handwritten annotations, or printed captions.

Extract a recipe as JSON. Use this exact schema:

{
  "title": "string — the recipe name",
  "summary": "string — one or two sentences describing the dish (optional)",
  "servings": number,
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional),
  "yield_slug": "string — kebab-case slug for the produced ingredient (e.g. 'smash-burger'); usually same shape as the recipe title",
  "yield_qty": number,
  "yield_unit": "count | serving | g | ml",
  "tags": ["string", ...] (cuisine, meal type, dietary — short list),
  "ingredients": [
    {
      "qty": number,
      "unit": "string — g, ml, count, cup, tbsp, tsp, oz, lb (any plain-text unit; conversion happens later)",
      "ingredient_slug": "string — kebab-case slug for the ingredient (e.g. 'beef-chuck')",
      "variant_slug": "string (optional) — kebab-case slug for variant (e.g. 'ground', 'fresh', 'canned')",
      "prep_state_slug": "string (optional) — one of: whole, diced, sliced, chopped, shredded, minced, julienned, grated, crushed, zested, juiced, melted, softened, mashed, roughly-chopped",
      "original_text": "string — the ingredient as it appeared in the source",
      "optional": boolean (default false),
      "notes": "string (optional)"
    }
  ],
  "steps": [
    {
      "body": "string — the step instruction; may reference ingredients by slug like @beef-chuck",
      "duration_minutes": number (optional)
    }
  ]
}

Rules:
- If the image is a cookbook page, the layout typically separates ingredients (often in a sidebar or above the steps) from instructions. Preserve the structure.
- If the image is a handwritten note, transcribe what you can read; mark uncertain text in notes.
- If the image contains multiple recipes, extract ONLY the first one and note "Multiple recipes detected; extracting first" in summary.
- Use metric units when both are listed. Drop imperial parentheticals.
- prep_state_slug MUST be one of the listed values. If the source describes a prep that doesn't match (e.g. "spiralised"), put it in notes instead.
- Step bodies may reference ingredients by slug with @-prefix; the system resolves these.
- Output ONLY the JSON. No markdown, no explanation.`;
