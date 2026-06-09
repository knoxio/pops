/**
 * PRD-132 — text-ingest prompt template.
 *
 * Versioned via `PROMPT_VERSION_TEXT`; bump on every prompt change so
 * `ai_inference_log.metadata.prompt_version` + `meta.json.stages.llm_extract.prompt_version`
 * tie back to the exact template that produced an extraction.
 *
 * The JSON schema mirrors PRD-128's (web-LLM fallback) so the same
 * `extractedRecipeSchema` zod validator + `buildDsl` mapper are reused
 * across kinds.
 */
export const PROMPT_VERSION_TEXT = 'text-v1.0';

const PREP_STATE_LIST =
  'whole, diced, sliced, chopped, shredded, minced, julienned, grated, crushed, zested, juiced, melted, softened, mashed, roughly-chopped';

const SCHEMA_BLOCK = `{
  "title": "string — the recipe name",
  "summary": "string — one or two sentences describing the dish (optional)",
  "servings": number,
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional),
  "yield_slug": "string — kebab-case slug for the produced ingredient",
  "yield_qty": number,
  "yield_unit": "count | serving | g | ml",
  "tags": ["string", ...] (cuisine, meal type, dietary — short list),
  "ingredients": [
    {
      "qty": number,
      "unit": "string — g, ml, count, cup, tbsp, tsp, oz, lb (any plain-text unit)",
      "ingredient_slug": "string — kebab-case slug for the ingredient",
      "variant_slug": "string (optional) — kebab-case slug for variant",
      "prep_state_slug": "string (optional) — one of the curated values",
      "original_text": "string — the ingredient as it appeared in the input",
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
}`;

export const TEXT_PROMPT_TEMPLATE = `You are extracting (or elaborating on) a recipe from plain text. The text may be:
- A complete recipe (ingredients + steps)
- A rough recipe idea ("smash burger with caramelised onions") — in which case ELABORATE it into a full recipe, drawing on common cooking knowledge.
- A transcribed recipe (e.g. from a video) — clean it up and structure it.
- A recipe shared in a message format (SMS, chat) — normalise.

INPUT:
{body}

Extract or elaborate a recipe as JSON. Use this exact schema:

${SCHEMA_BLOCK}

Rules:
- For ROUGH IDEAS: invent reasonable quantities and steps; mark \`summary\` with "Generated from rough idea".
- For COMPLETE RECIPES: stick close to the input; don't invent.
- Use metric units when reasonable.
- prep_state_slug MUST be one of: ${PREP_STATE_LIST}.
- Output ONLY the JSON. No markdown, no explanation.
`;

export function renderTextPrompt(body: string): string {
  return TEXT_PROMPT_TEMPLATE.replace('{body}', body);
}
