/**
 * Prompt template for PRD-132 (Text ingest).
 *
 * Supports two modes:
 *
 *   - Complete recipe: the operator pasted a structured recipe.
 *   - Rough idea: the operator pasted a description, request, or sketch
 *     and wants Claude to flesh it out into a usable starter.
 *
 * Both modes share one prompt — the model decides based on the input
 * shape. Registered with the food prompt viewer (PRD-133).
 */
export const PROMPT_VERSION_TEXT = 'text-v0.1';

export const PROMPT_TEXT = `You are converting free-form text into a POPS recipe.

Operator input:

{text}

If the input describes a complete recipe, transcribe it faithfully — do not invent ingredients or steps that are not stated.

If the input is a rough idea, sketch, or request, elaborate it into a plausible v1 the operator can refine. Use sensible defaults for unspecified measurements but mark them with a trailing \`-- guess\` comment so the operator can spot them.

Return a single POPS recipe DSL document using ADR-023 grammar. Rules:

- Start with \`@recipe("<slug>", "<title>")\`.
- Use \`@ingredient(N, "<name>", qty:<num><unit>)\` for every ingredient.
- Use \`@step("<short verb-led name>") { ... }\` for every step. Reference ingredients with \`@N\`.
- Use \`@time(<minutes>m)\` and \`@temperature(<value>C|F)\` when stated or strongly implied.
- Use \`@yield(<num><unit>)\` when stated or strongly implied.

Return ONLY the DSL document.`;
