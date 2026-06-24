import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeRenderer } from '../RecipeRenderer';
import {
  _resetScaleFactorWarnings,
  buildYieldLabel,
  clampScaleFactor,
  formatQty,
  lineCanonicalQty,
  parseStructuralAnchor,
} from '../RecipeRenderer.helpers';
import { ingredientBanana, makeLine, makeRecipeData, yieldIngredientPancake } from './fixtures';

import type { ResolvedStepBody } from '../recipe-render-types.js';

describe('RecipeRenderer helpers', () => {
  it('clampScaleFactor passes valid scales through', () => {
    expect(clampScaleFactor(undefined)).toBe(1);
    expect(clampScaleFactor(2)).toBe(2);
    expect(clampScaleFactor(0.5)).toBe(0.5);
  });

  it('clampScaleFactor clamps zero / negative / NaN to 1 with a warning', () => {
    _resetScaleFactorWarnings();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(clampScaleFactor(0)).toBe(1);
    expect(clampScaleFactor(-2)).toBe(1);
    expect(clampScaleFactor(Number.NaN)).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it('clampScaleFactor only warns once per unique invalid value (no log spam on re-render)', () => {
    _resetScaleFactorWarnings();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Same bad value, 5 calls — only one warning should fire.
    for (let i = 0; i < 5; i++) clampScaleFactor(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // A different invalid value still emits its own warning.
    clampScaleFactor(-2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('formatQty drops trailing zeros and keeps integers', () => {
    expect(formatQty(250)).toBe('250');
    expect(formatQty(0.5)).toBe('0.5');
    expect(formatQty(1.25)).toBe('1.25');
  });

  it('lineCanonicalQty picks the column matching canonical_unit', () => {
    expect(lineCanonicalQty(makeLine({ canonicalUnit: 'g', qtyG: 250 }))).toBe(250);
    expect(lineCanonicalQty(makeLine({ canonicalUnit: 'ml', qtyG: null, qtyMl: 500 }))).toBe(500);
    expect(lineCanonicalQty(makeLine({ canonicalUnit: 'count', qtyG: null, qtyCount: 3 }))).toBe(3);
    expect(
      lineCanonicalQty(makeLine({ canonicalUnit: 'g', qtyG: null, qtyMl: null, qtyCount: null }))
    ).toBeNull();
  });

  it('parseStructuralAnchor recognises the four anchor namespaces', () => {
    expect(parseStructuralAnchor('#timer')).toEqual({ kind: 'timer' });
    expect(parseStructuralAnchor('#temperature')).toEqual({ kind: 'temperature' });
    expect(parseStructuralAnchor('#line-3')).toEqual({ kind: 'lineRef', index: 3 });
    expect(parseStructuralAnchor('#ingredient-banana')).toEqual({
      kind: 'slugRef',
      slug: 'banana',
    });
    expect(parseStructuralAnchor('#other')).toBeNull();
    expect(parseStructuralAnchor(undefined)).toBeNull();
  });

  it('buildYieldLabel handles all four ingredient / variant / prep combinations', () => {
    const label = buildYieldLabel({
      ingredient: yieldIngredientPancake,
      variant: null,
      prepState: null,
      qty: 4,
      unit: 'count',
      scaleFactor: 1,
    });
    expect(label).toBe('Pancake (4 count)');

    const scaled = buildYieldLabel({
      ingredient: yieldIngredientPancake,
      variant: null,
      prepState: null,
      qty: 4,
      unit: 'count',
      scaleFactor: 2,
    });
    expect(scaled).toBe('Pancake (8 count)');

    const noQty = buildYieldLabel({
      ingredient: yieldIngredientPancake,
      variant: null,
      prepState: null,
      qty: null,
      unit: null,
      scaleFactor: 1,
    });
    expect(noQty).toBe('Pancake');

    const withVariantAndPrep = buildYieldLabel({
      ingredient: { ...ingredientBanana, name: 'Roma tomato' },
      variant: { ...ingredientBanana, name: 'braised' } as never,
      prepState: { id: 1, name: 'shredded', slug: 'shredded' },
      qty: 500,
      unit: 'g',
      scaleFactor: 1,
    });
    expect(withVariantAndPrep).toBe('Roma tomato, braised, shredded (500 g)');

    expect(
      buildYieldLabel({
        ingredient: null,
        variant: null,
        prepState: null,
        qty: 100,
        unit: 'g',
        scaleFactor: 1,
      })
    ).toBeNull();
  });
});

describe('RecipeRenderer detail layout', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header, ingredient list, and steps section', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByRole('heading', { level: 1, name: /banana pancakes/i })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-yield')).toHaveTextContent('Pancake');
    expect(screen.getByTestId('recipe-ingredients')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-steps')).toBeInTheDocument();
  });

  it('renders prep / cook / serving badges only when set', () => {
    const data = makeRecipeData({
      version: {
        ...makeRecipeData().version,
        prepMinutes: null,
        cookMinutes: null,
        servings: null,
      },
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.queryByTestId('recipe-prep')).toBeNull();
    expect(screen.queryByTestId('recipe-cook')).toBeNull();
    expect(screen.queryByTestId('recipe-servings')).toBeNull();
  });

  it('renders the hero image when path is set and swaps to placeholder on error', async () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);
    const heroImg = screen.getByTestId('hero-image');
    expect(heroImg).toBeInstanceOf(HTMLImageElement);
    expect(heroImg.getAttribute('src')).toContain('hero.webp');

    // simulate broken image
    heroImg.dispatchEvent(new Event('error'));
    expect(await screen.findByTestId('hero-placeholder')).toBeInTheDocument();
  });

  it('shows the hero placeholder when path is null', () => {
    const data = makeRecipeData();
    data.recipe.heroImagePath = null;
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('hero-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-image')).toBeNull();
  });

  it('renders the archived banner when recipes.archived_at is set', () => {
    const data = makeRecipeData();
    data.recipe.archivedAt = '2026-06-01T00:00:00Z';
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('archived-banner')).toHaveTextContent(/archived/i);
  });

  it('renders tag chips for every recipe tag', () => {
    const data = makeRecipeData({ tags: ['breakfast', 'quick', 'sweet'] });
    render(<RecipeRenderer recipeVersion={data} />);

    const tagBlock = screen.getByTestId('recipe-tags');
    expect(within(tagBlock).getByText('breakfast')).toBeInTheDocument();
    expect(within(tagBlock).getByText('quick')).toBeInTheDocument();
    expect(within(tagBlock).getByText('sweet')).toBeInTheDocument();
  });

  it('omits ingredients section when lines is empty (technique recipe)', () => {
    const data = makeRecipeData({ lines: [] });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.queryByTestId('recipe-ingredients')).toBeNull();
    expect(screen.getByTestId('recipe-steps')).toBeInTheDocument();
  });

  it('renders empty-state message when there are no steps', () => {
    const data = makeRecipeData({ steps: [] });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('recipe-steps-empty')).toHaveTextContent(/no steps yet/i);
  });
});

describe('Ingredient list scaling + formatting', () => {
  it('scales canonical quantities and leaves original text alone', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} scaleFactor={2} />);

    const rows = screen.getAllByTestId('recipe-ingredient-row');
    expect(rows[0]).toHaveTextContent('500 g'); // 250 g × 2
    expect(rows[1]).toHaveTextContent('20 g'); // 10 g × 2
  });

  it('renders original-text aside when canonical and original units differ', () => {
    const data = makeRecipeData({
      lines: [
        makeLine({
          id: 1,
          position: 1,
          canonicalUnit: 'g',
          qtyG: 240,
          originalQty: 1,
          originalUnit: 'cup',
          originalText: 'flour',
          ingredientName: 'Flour',
          ingredientSlug: 'flour',
        }),
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);
    expect(screen.getByText(/originally 1 cup/i)).toBeInTheDocument();
  });

  it('shows original text alone when conversion failed (all canonical qty null)', () => {
    const data = makeRecipeData({
      lines: [
        makeLine({
          id: 1,
          position: 1,
          canonicalUnit: 'g',
          qtyG: null,
          qtyMl: null,
          qtyCount: null,
          originalText: 'a pinch of salt',
          originalQty: 1,
          originalUnit: 'pinch',
          ingredientName: 'Salt',
          ingredientSlug: 'salt',
        }),
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('ingredient-original-only')).toHaveTextContent('a pinch of salt');
    expect(screen.queryByTestId('ingredient-canonical-qty')).toBeNull();
  });

  it('renders a link when is_recipe_ref=1 and notes when notes are present', () => {
    const data = makeRecipeData({
      lines: [
        makeLine({
          id: 1,
          position: 1,
          isRecipeRef: true,
          recipeRefId: 5,
          recipeRefSlug: 'smash-patty',
          recipeRefTitle: 'Smash patty',
          ingredientName: 'Smash patty',
          ingredientSlug: 'smash-patty',
          canonicalUnit: 'count',
          qtyCount: 4,
          notes: 'medium-rare',
        }),
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    const link = screen.getByTestId('ingredient-recipe-ref-link');
    expect(link).toHaveAttribute('href', '/food/recipes/smash-patty');
    expect(screen.getByTestId('ingredient-notes')).toHaveTextContent('medium-rare');
  });

  it('marks optional lines with the muted "(optional)" suffix', () => {
    const data = makeRecipeData({
      lines: [
        makeLine({
          id: 1,
          position: 1,
          optional: true,
          ingredientName: 'Salt',
          ingredientSlug: 'salt',
        }),
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);
    expect(screen.getByText(/\(optional\)/i)).toBeInTheDocument();
  });
});

describe('Step body two-pass substitution', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders inline ingredient chips from #line-N anchors (two-pass)', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);

    const chip = screen.getByTestId('ingredient-chip');
    expect(chip).toHaveAttribute('href', '#line-2');
    expect(chip).toHaveTextContent('butter');
    // The raw markdown link is NOT in the document — it was swapped out.
    expect(screen.queryByText('[butter](#line-2)')).toBeNull();
  });

  it('renders the TimerButton from #timer anchor and fires onTimerStart with normalised minutes', async () => {
    const onTimerStart = vi.fn();
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} onTimerStart={onTimerStart} />);

    const button = screen.getByTestId('timer-button');
    expect(button).toHaveTextContent('2 min');
    expect(button).toHaveAttribute('data-step-position', '1');
    expect(button).toHaveAttribute('data-duration-minutes', '2');

    await userEvent.click(button);
    expect(onTimerStart).toHaveBeenCalledWith(2, 1);
  });

  it('renders the TempBadge from #temperature anchor with the right symbol', () => {
    const bodyResolved: ResolvedStepBody = [
      { kind: 'text', value: 'Heat oven to ' },
      { kind: 'temperature', qty: { qty: 180, unit: 'c' } },
      { kind: 'text', value: '.' },
    ];
    const data = makeRecipeData({
      steps: [
        {
          id: 5,
          recipeVersionId: 10,
          position: 1,
          bodyMd: 'Heat oven to [180°c](#temperature).',
          bodyResolvedJson: JSON.stringify(bodyResolved),
          durationMinutes: null,
          temperatureValue: null,
          temperatureUnit: null,
        },
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('temp-badge')).toHaveTextContent('180 °C');
  });

  it('renders ingredient chip with error badge when index has no matching line', () => {
    const bodyResolved: ResolvedStepBody = [
      { kind: 'text', value: 'Add the ' },
      {
        kind: 'ref',
        ingredientIndex: 99,
        ingredientId: null,
        variantId: null,
        prepStateId: null,
      },
      { kind: 'text', value: ' last.' },
    ];
    const data = makeRecipeData({
      steps: [
        {
          id: 6,
          recipeVersionId: 10,
          position: 1,
          bodyMd: 'Add the [banana](#line-99) last.',
          bodyResolvedJson: JSON.stringify(bodyResolved),
          durationMinutes: null,
          temperatureValue: null,
          temperatureUnit: null,
        },
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    const chip = screen.getByTestId('ingredient-chip');
    expect(chip).toHaveAttribute('data-has-error', 'true');
    expect(screen.getByTestId('ingredient-chip-error')).toBeInTheDocument();
  });

  it('normalises seconds and hours to minutes for the callback', async () => {
    const onTimerStart = vi.fn();
    const bodyResolved: ResolvedStepBody = [
      { kind: 'text', value: 'Wait ' },
      { kind: 'time', qty: { qty: 90, unit: 'sec' } },
      { kind: 'text', value: ' then ' },
      { kind: 'time', qty: { qty: 1, unit: 'h' } },
      { kind: 'text', value: '.' },
    ];
    const data = makeRecipeData({
      steps: [
        {
          id: 7,
          recipeVersionId: 10,
          position: 3,
          bodyMd: 'Wait [90 sec](#timer) then [1 h](#timer).',
          bodyResolvedJson: JSON.stringify(bodyResolved),
          durationMinutes: null,
          temperatureValue: null,
          temperatureUnit: null,
        },
      ],
    });
    render(<RecipeRenderer recipeVersion={data} onTimerStart={onTimerStart} />);

    const buttons = screen.getAllByTestId('timer-button');
    await userEvent.click(buttons[0]!);
    await userEvent.click(buttons[1]!);
    expect(onTimerStart).toHaveBeenNthCalledWith(1, 2, 3); // round(90/60) = 2 min at step pos 3
    expect(onTimerStart).toHaveBeenNthCalledWith(2, 60, 3); // 1 h = 60 min
  });

  it('renders step-level duration + temperature badges from hoist columns', () => {
    const bodyResolved: ResolvedStepBody = [{ kind: 'text', value: 'Bake until done.' }];
    const data = makeRecipeData({
      steps: [
        {
          id: 8,
          recipeVersionId: 10,
          position: 1,
          bodyMd: 'Bake until done.',
          bodyResolvedJson: JSON.stringify(bodyResolved),
          durationMinutes: 25,
          temperatureValue: 350,
          temperatureUnit: 'f',
        },
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('step-duration-badge')).toHaveTextContent('25');
    expect(screen.getByTestId('temp-badge')).toHaveTextContent('350 °F');
  });

  it('does NOT scale inline timer values when scaleFactor changes (timers stay literal)', async () => {
    const onTimerStart = vi.fn();
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} onTimerStart={onTimerStart} scaleFactor={3} />);

    await userEvent.click(screen.getByTestId('timer-button'));
    expect(onTimerStart).toHaveBeenCalledWith(2, 1); // 2 min not 6
  });

  it('does not desync the cursor when an anchor kind disagrees with the next resolved part', () => {
    // body_md says "first anchor is a TIMER then a TEMPERATURE" — but the
    // resolved JSON only carries the temperature (a drifted body_md slipped
    // a stray `#timer` link in). The timer anchor must NOT consume the
    // temperature part — the temperature anchor that follows should still
    // bind to it.
    const bodyResolved: ResolvedStepBody = [
      { kind: 'text', value: 'Wait a bit and then heat to ' },
      { kind: 'temperature', qty: { qty: 200, unit: 'c' } },
      { kind: 'text', value: '.' },
    ];
    const data = makeRecipeData({
      steps: [
        {
          id: 11,
          recipeVersionId: 10,
          position: 1,
          bodyMd: 'Wait a bit [stray](#timer) and then heat to [200°c](#temperature).',
          bodyResolvedJson: JSON.stringify(bodyResolved),
          durationMinutes: null,
          temperatureValue: null,
          temperatureUnit: null,
        },
      ],
    });
    render(<RecipeRenderer recipeVersion={data} />);

    // No TimerButton — the stray `#timer` anchor falls back to a plain <a>.
    expect(screen.queryByTestId('timer-button')).toBeNull();
    // Temperature still renders because the cursor never advanced past it.
    expect(screen.getByTestId('temp-badge')).toHaveTextContent('200 °C');
  });
});

describe('Compile-status placeholder', () => {
  it('renders "not yet compiled" placeholder when compile_status != compiled', () => {
    const data = makeRecipeData({
      version: { ...makeRecipeData().version, compileStatus: 'failed' },
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('recipe-uncompiled')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-renderer')).toBeNull();
  });

  it('renders placeholder for uncompiled status too', () => {
    const data = makeRecipeData({
      version: { ...makeRecipeData().version, compileStatus: 'uncompiled' },
    });
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('recipe-uncompiled')).toBeInTheDocument();
  });
});

describe('Compact variant', () => {
  it('renders the compact card with title, time and yield', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} variant="compact" />);

    const card = screen.getByTestId('recipe-renderer');
    expect(card).toHaveAttribute('data-variant', 'compact');
    expect(within(card).getByText('Banana pancakes')).toBeInTheDocument();
    expect(within(card).getByText(/25 min prep/i)).toBeInTheDocument(); // 10 + 15
  });

  it('uses the thumbnail path derived from hero.<ext> → hero-thumb.webp', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} variant="compact" />);

    const img = screen.getByTestId('hero-image');
    expect(img.getAttribute('src')).toContain('hero-thumb.webp');
  });

  it('falls back to placeholder when the thumb image errors', async () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} variant="compact" />);

    const img = screen.getByTestId('hero-image');
    img.dispatchEvent(new Event('error'));
    expect(await screen.findByTestId('hero-placeholder')).toBeInTheDocument();
  });
});

describe('Accessibility surface', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps detail content in an <article> with heading levels', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(2);
  });

  it('gives ingredient chips an aria-label including the ingredient name', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('ingredient-chip').getAttribute('aria-label')).toMatch(/butter/i);
  });

  it('gives timer buttons an aria-label with the duration', () => {
    const data = makeRecipeData();
    render(<RecipeRenderer recipeVersion={data} />);

    expect(screen.getByTestId('timer-button').getAttribute('aria-label')).toMatch(/2 min/i);
  });
});
