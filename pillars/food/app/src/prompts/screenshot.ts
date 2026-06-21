/**
 * Prompt template for PRD-131 (Screenshot ingest).
 *
 * Single image → Claude vision. Registered with the food prompt viewer
 * (PRD-133). Bump the version on every template edit so logged rows
 * remain reproducible.
 */
export const PROMPT_VERSION_SCREENSHOT = 'screenshot-v0.1';

export const PROMPT_SCREENSHOT = `You are extracting a recipe from a single screenshot.

The image is attached. Read every legible piece of text and any handwritten or printed measurements.

Return a single POPS recipe DSL document using ADR-023 grammar. Rules:

- Start with \`@recipe("<slug>", "<title>")\`.
- Use \`@ingredient(N, "<name>", qty:<num><unit>)\` for every ingredient.
- Use \`@step("<short verb-led name>") { ... }\` for every step. Reference ingredients with \`@N\`.
- Use \`@time(<minutes>m)\` and \`@temperature(<value>C|F)\` when stated.
- Use \`@yield(<num><unit>)\` when the source declares it.

If text in the screenshot is unreadable, omit that ingredient or step. Do not invent content.

Return ONLY the DSL document.`;
