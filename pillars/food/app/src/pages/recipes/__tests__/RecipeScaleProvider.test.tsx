import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RecipeScaleProvider, useRecipeScale } from '../RecipeScaleProvider.js';

function ScaleProbe() {
  const { scaleFactor, setScaleFactor } = useRecipeScale();
  return (
    <div>
      <span data-testid="scale">{scaleFactor}</span>
      <button type="button" onClick={() => setScaleFactor(scaleFactor * 2)}>
        double
      </button>
    </div>
  );
}

describe('PRD-119-B — RecipeScaleProvider', () => {
  it('defaults scaleFactor to 1', () => {
    render(
      <RecipeScaleProvider>
        <ScaleProbe />
      </RecipeScaleProvider>
    );
    expect(screen.getByTestId('scale')).toHaveTextContent('1');
  });

  it('accepts an initialScaleFactor prop', () => {
    render(
      <RecipeScaleProvider initialScaleFactor={2.5}>
        <ScaleProbe />
      </RecipeScaleProvider>
    );
    expect(screen.getByTestId('scale')).toHaveTextContent('2.5');
  });

  it('exposes a setter to downstream consumers (PRD-142/144 forward-compat)', async () => {
    render(
      <RecipeScaleProvider>
        <ScaleProbe />
      </RecipeScaleProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /double/i }));
    expect(screen.getByTestId('scale')).toHaveTextContent('2');
  });

  it('throws a clear error when used outside the provider', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<ScaleProbe />)).toThrow(/RecipeScaleProvider/i);
    } finally {
      console.error = original;
    }
  });
});
