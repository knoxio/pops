/**
 * PRD-130 — Instagram vision prompt template + version constant.
 *
 * Surface mirrors PRD-133's prompt-registry expectations: every change to
 * the body MUST bump `PROMPT_VERSION_IG_VISION`. The viewer at
 * `/food/prompts` reads both literals.
 */

export const PROMPT_VERSION_IG_VISION = 'ig-vision-v1.0';

export const IG_VISION_PROMPT = `You are extracting a recipe from an Instagram reel.

The source has three components:
1. CAPTION (the post's text, often contains ingredient lists)
2. TRANSCRIPT (auto-generated from the audio; may be noisy)
3. KEYFRAMES (frames from the video; may contain on-screen text overlays with ingredients and quantities — VERY IMPORTANT, often the only place quantities appear)

CAPTION:
{caption}

TRANSCRIPT:
{transcript}

KEYFRAMES:
{N images attached}

Extract a recipe as JSON. Use this exact schema:

{
  "title": string,
  "summary": string | null,
  "servings": integer | null,
  "prep_time_min": number | null,
  "cook_time_min": number | null,
  "ingredients": [
    {
      "ingredient_slug": string,
      "variant_slug": string | null,
      "prep_state_slug": string | null,
      "qty": number,
      "unit": string,
      "notes": string | null
    }
  ],
  "steps": [
    {
      "body": string,
      "duration_min": number | null,
      "temperature_c": number | null
    }
  ]
}

Rules:
- Read on-screen text in keyframes carefully — recipe reels often display ingredients with quantities as overlays that are NEVER spoken aloud. These overlays are the most reliable source of quantities.
- Prefer caption + on-screen text quantities over transcript quantities (transcript is noisy).
- If caption is structured (has ingredient list + steps), trust it most.
- Use metric units when available.
- If keyframes contradict caption, prefer keyframes for quantities.
- Output ONLY the JSON. No markdown, no explanation.
`;

export function renderIgVisionPrompt(args: {
  caption: string | null;
  transcript: string | null;
  keyframeCount: number;
}): string {
  return IG_VISION_PROMPT.replace('{caption}', args.caption ?? '(none)')
    .replace('{transcript}', args.transcript ?? '(skipped — caption was structured enough)')
    .replace('{N images attached}', `${args.keyframeCount} images attached`);
}
