/**
 * Instagram Reel ingest prompts (see pillars/food/docs/prds/instagram-stt-vision).
 *
 * Primary path: ffmpeg keyframes + faster-whisper transcript → Claude
 * vision. The text-only variant (`PROMPT_VERSION_IG_VISION_TEXT_FALLBACK`)
 * covers a failed vision call. Both are registered with the food prompt
 * viewer (pillars/food/docs/prds/ai-usage-prompts).
 *
 * Bump the version constant on any template change so `ai_inference_log`
 * rows stay reproducible.
 */
export const PROMPT_VERSION_IG_VISION = 'ig-vision-v0.1';

export const PROMPT_IG_VISION = `You are extracting a recipe from an Instagram Reel.

Inputs provided:

- Caption: {caption}
- Transcript (faster-whisper, distil-large-v3): {transcript}
- Keyframes: up to {keyframeCount} ffmpeg-extracted stills attached as images.

Combine all three sources to recover the recipe. Resolve disagreements in favour of the transcript when measurements differ; favour the keyframes when ingredient identity is unclear.

Return a single POPS recipe DSL document using ADR-023 grammar. Rules:

- Start with \`@recipe("<slug>", "<title>")\`.
- Use \`@ingredient(N, "<name>", qty:<num><unit>)\` for every ingredient mentioned.
- Use \`@step("<short verb-led name>") { ... }\` for every step. Reference ingredients with \`@N\`.
- Use \`@time(<minutes>m)\` and \`@temperature(<value>C|F)\` when stated.
- Use \`@yield(<num><unit>)\` when the source declares it.

If a measurement is missing from all sources, omit \`qty:\` rather than guess.

Return ONLY the DSL document. No markdown fences, no commentary.`;

export const PROMPT_VERSION_IG_VISION_TEXT_FALLBACK = 'ig-vision-text-fallback-v0.1';

export const PROMPT_IG_VISION_TEXT_FALLBACK = `You are extracting a recipe from an Instagram Reel using text inputs only (vision call failed).

Inputs:

- Caption: {caption}
- Transcript (faster-whisper): {transcript}

Return a single POPS recipe DSL document per ADR-023. If the inputs do not describe a coherent recipe, return exactly this single line and nothing else:

@recipe("partial-draft", "Partial draft")

The operator will triage the partial-draft case.

Return ONLY the DSL document. Do not wrap it in markdown fences.`;
