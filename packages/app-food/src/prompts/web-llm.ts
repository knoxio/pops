/**
 * Prompt template for PRD-128 (Web URL LLM fallback extraction).
 *
 * Used when JSON-LD recipe data is absent on a recipe page (PRD-127's
 * deterministic extractor failed). Sends readability-extracted page text
 * to Claude and asks for a structured DSL recipe.
 *
 * The handler implementation lands with PRD-128; this template is the
 * v1 starting point and is registered with the food prompt viewer
 * (PRD-133). Bump `PROMPT_VERSION_WEB_LLM` whenever the template
 * changes.
 */
export const PROMPT_VERSION_WEB_LLM = 'web-llm-v0.1';

export const PROMPT_WEB_LLM = `You are extracting a recipe from a webpage that has no JSON-LD recipe markup.

Page text (readability-extracted):

{pageText}

Return a single POPS recipe DSL document using ADR-023 grammar. Rules:

- Start with \`@recipe("<slug>", "<title>")\`.
- Use \`@ingredient(N, "<name>", qty:<num><unit>)\` for every ingredient.
- Use \`@step("<short verb-led name>") { ... }\` for every step. Reference ingredients with \`@N\`.
- Use \`@time(<minutes>m)\` and \`@temperature(<value>C|F)\` only when stated by the source.
- Use \`@yield(<num><unit>)\` when the source declares a yield.

Return ONLY the DSL document. No markdown fences, no commentary.`;
