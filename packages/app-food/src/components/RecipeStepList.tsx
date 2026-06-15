import { useTranslation } from 'react-i18next';

import { RecipeStepBody } from './RecipeStepBody';
import { TempBadge } from './TempBadge';

import type { RecipeLineWithResolved, RecipeStepRow, ResolvedStepBody } from '@pops/app-food-db';

/**
 * Each step row's `body_resolved_json` is parsed into a `ResolvedStepBody`
 * and passed alongside `body_md` to the per-step body renderer for the
 * two-pass substitution. Step-level `duration_minutes` and `temperature_*`
 * surface as separate badges — distinct from inline `@time` /
 * `@temperature` widgets inside the markdown body.
 *
 * A defensive parse fall-back on the JSON column produces an empty body
 * so the markdown still renders.
 */
export interface RecipeStepListProps {
  steps: RecipeStepRow[];
  lines: RecipeLineWithResolved[];
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void;
}

function safeParseResolved(json: string): ResolvedStepBody {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as ResolvedStepBody;
  } catch {
    /* fall through */
  }
  return [];
}

export function RecipeStepList({ steps, lines, onTimerStart }: RecipeStepListProps) {
  const { t } = useTranslation('food');

  if (steps.length === 0) {
    return (
      <section data-testid="recipe-steps-empty">
        <h2 className="text-xl font-semibold">{t('renderer.stepsHeading')}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t('renderer.noSteps')}</p>
      </section>
    );
  }

  const orderedSteps = [...steps].toSorted((a, b) => a.position - b.position);

  return (
    <section data-testid="recipe-steps">
      <h2 className="text-xl font-semibold">{t('renderer.stepsHeading')}</h2>
      <ol className="mt-2 space-y-3">
        {orderedSteps.map((step) => (
          <li
            key={step.id}
            className="text-sm"
            data-testid="recipe-step-row"
            data-step-position={step.position}
          >
            <RecipeStepBody
              bodyMd={step.bodyMd}
              bodyResolved={safeParseResolved(step.bodyResolvedJson)}
              lines={lines}
              stepPosition={step.position}
              onTimerStart={onTimerStart}
            />
            <div className="mt-1 flex flex-wrap gap-2">
              {typeof step.durationMinutes === 'number' ? (
                <span className="text-muted-foreground text-xs" data-testid="step-duration-badge">
                  {t('renderer.stepDurationBadge', { count: step.durationMinutes })}
                </span>
              ) : null}
              {step.temperatureUnit && typeof step.temperatureValue === 'number' ? (
                <TempBadge value={step.temperatureValue} unit={step.temperatureUnit} />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
