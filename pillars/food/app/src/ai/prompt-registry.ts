/**
 * PRD-133 — Food prompt registry.
 *
 * Single source of truth for the read-only `/food/prompts` viewer. Each
 * entry pins a prompt template + version + owning PRD. The viewer page
 * renders one card per entry; tests assert every `PROMPT_VERSION_*`
 * constant exported under `pillars/food/app/src/prompts/` is present
 * here (drift catcher).
 *
 * Prompts are defined in code and not editable from the UI. To change
 * one: edit the constant in `../prompts/`, bump the version string,
 * deploy.
 */
import {
  PROMPT_IG_VISION,
  PROMPT_IG_VISION_TEXT_FALLBACK,
  PROMPT_VERSION_IG_VISION,
  PROMPT_VERSION_IG_VISION_TEXT_FALLBACK,
} from '../prompts/ig-vision';
import { PROMPT_SCREENSHOT, PROMPT_VERSION_SCREENSHOT } from '../prompts/screenshot';
import { PROMPT_TEXT, PROMPT_VERSION_TEXT } from '../prompts/text';
import { PROMPT_VERSION_WEB_LLM, PROMPT_WEB_LLM } from '../prompts/web-llm';

export interface FoodPromptEntry {
  id: string;
  title: string;
  description: string;
  prd: string;
  model: string;
  version: string;
  template: string;
}

export const FOOD_PROMPTS = [
  {
    id: 'web-llm',
    title: 'Web URL — LLM Fallback Extraction',
    description: 'Used when JSON-LD recipe markup is absent on a recipe page.',
    prd: 'PRD-128',
    model: 'claude-haiku-4-5-20251001 (configurable via FOOD_WEB_LLM_MODEL)',
    version: PROMPT_VERSION_WEB_LLM,
    template: PROMPT_WEB_LLM,
  },
  {
    id: 'ig-vision',
    title: 'Instagram — Vision + Transcript Extraction',
    description:
      'Combines caption, faster-whisper transcript, and ffmpeg keyframes for Instagram Reels.',
    prd: 'PRD-130',
    model: 'claude-haiku-4-5-20251001 (configurable via FOOD_IG_VISION_MODEL)',
    version: PROMPT_VERSION_IG_VISION,
    template: PROMPT_IG_VISION,
  },
  {
    id: 'ig-vision-text-fallback',
    title: 'Instagram — Text-only Fallback',
    description: 'Used when the vision call fails; relies on caption + transcript only.',
    prd: 'PRD-130',
    model: 'claude-haiku-4-5-20251001 (configurable via FOOD_IG_VISION_MODEL)',
    version: PROMPT_VERSION_IG_VISION_TEXT_FALLBACK,
    template: PROMPT_IG_VISION_TEXT_FALLBACK,
  },
  {
    id: 'screenshot',
    title: 'Screenshot — Single-image Extraction',
    description: 'Single image (jpg/png/webp) → Claude vision.',
    prd: 'PRD-131',
    model: 'claude-haiku-4-5-20251001 (configurable via FOOD_SCREENSHOT_VISION_MODEL)',
    version: PROMPT_VERSION_SCREENSHOT,
    template: PROMPT_SCREENSHOT,
  },
  {
    id: 'text',
    title: 'Text — Paste-to-Recipe',
    description: 'Operator-pasted text. Supports complete recipes and rough-idea elaboration.',
    prd: 'PRD-132',
    model: 'claude-haiku-4-5-20251001 (configurable via FOOD_TEXT_LLM_MODEL)',
    version: PROMPT_VERSION_TEXT,
    template: PROMPT_TEXT,
  },
] as const satisfies readonly FoodPromptEntry[];

export type FoodPromptId = (typeof FOOD_PROMPTS)[number]['id'];
