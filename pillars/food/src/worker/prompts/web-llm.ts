/**
 * web-llm prompt template.
 *
 * Versioned: change the template = bump `PROMPT_VERSION_WEB_LLM`. The
 * version flows through `meta.stages.llm_extract.prompt_version`
 * and `ai_inference_log.metadata`, tying an extraction back to the
 * exact template that produced it.
 */
export const PROMPT_VERSION_WEB_LLM = 'web-llm-v1.0';
export const WEB_LLM_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const WEB_LLM_MAX_INPUT_CHARS = 15_000;
export const WEB_LLM_MIN_READABLE_CHARS = 200;
export const WEB_LLM_MAX_OUTPUT_TOKENS = 2_048;

export interface WebLlmPromptInputs {
  title: string;
  url: string;
  bodyText: string;
}

const SCHEMA_BLOCK = `{
  "title": "string — the recipe name",
  "summary": "string — one or two sentences describing the dish (optional)",
  "servings": number,
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional),
  "yield_slug": "string — kebab-case slug for the produced ingredient (e.g. 'smash-burger')",
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
}`;

export function buildWebLlmPrompt(inputs: WebLlmPromptInputs): string {
  return `You are extracting a structured recipe from a webpage. The text below is the readable content of the page after stripping navigation and chrome.

Page title: ${inputs.title}
Page URL: ${inputs.url}

CONTENT:
${inputs.bodyText}

Extract a recipe as JSON. Use this exact schema:

${SCHEMA_BLOCK}

Rules:
- Prefer the actual ingredient slug from the source. If the source says "rocket", use 'rocket'. The system will reconcile aliases later.
- Use metric units when both are listed. Drop the imperial parenthetical.
- prep_state_slug MUST be one of the listed values. If the source describes a prep that doesn't match (e.g. "spiralised"), put it in notes instead.
- Step bodies may reference ingredients by slug with @-prefix; the system resolves these.
- Output ONLY the JSON. No markdown, no explanation.`;
}
