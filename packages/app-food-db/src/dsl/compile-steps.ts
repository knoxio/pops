import { renderBodyMd, type RenderContext } from './compile-md.js';

/**
 * `recipe_steps` materialiser. Maps a `ResolvedStepBlock` to its INSERT
 * shape. `body_md` is the rewritten markdown; `body_resolved_json` is the
 * raw `ResolvedStepBody` so the cooking-mode UI can render typed timers /
 * ingredient chips. `duration_minutes`, `temperature_value`, and
 * `temperature_unit` hoist the named args out for fast queries.
 */
import type { ResolvedStepBlock } from './resolver-types.js';

export interface StepInsert {
  recipeVersionId: number;
  position: number;
  bodyMd: string;
  bodyResolvedJson: string;
  durationMinutes: number | null;
  temperatureValue: number | null;
  temperatureUnit: 'c' | 'f' | 'gas' | null;
}

export function buildStepInsert(args: {
  block: ResolvedStepBlock;
  position: number;
  recipeVersionId: number;
  render: RenderContext;
}): StepInsert {
  const { block, position, recipeVersionId, render } = args;
  return {
    recipeVersionId,
    position,
    bodyMd: renderBodyMd(block.bodyResolved, render),
    bodyResolvedJson: JSON.stringify(block.bodyResolved),
    durationMinutes: extractDurationMinutes(block),
    temperatureValue: block.temperature?.qty ?? null,
    temperatureUnit: extractTemperatureUnit(block.temperature?.unit ?? null),
  };
}

function extractDurationMinutes(block: ResolvedStepBlock): number | null {
  if (block.duration === null) return null;
  const { qty, unit } = block.duration;
  switch (unit) {
    case 'min':
      return qty;
    case 'h':
    case 'hr':
    case 'hour':
      return qty * 60;
    case 's':
    case 'sec':
      return Math.round(qty / 60);
    default:
      // Unknown unit — keep null; the renderer falls back to body_md.
      return null;
  }
}

function extractTemperatureUnit(unit: string | null): 'c' | 'f' | 'gas' | null {
  if (unit === null) return null;
  if (unit === 'c' || unit === 'f' || unit === 'gas') return unit;
  return null;
}
