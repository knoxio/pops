import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FoodLandingPage } from '../FoodLandingPage.js';

describe('FoodLandingPage', () => {
  it('renders heading + intro without crashing', () => {
    render(<FoodLandingPage />);
    expect(screen.getByRole('heading', { name: /food/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/recipes, ingredients, meal planning/i)).toBeInTheDocument();
  });

  it('lists the recipes + manage-data tiles as coming-soon', () => {
    render(<FoodLandingPage />);
    expect(screen.getByText(/^Recipes$/)).toBeInTheDocument();
    expect(screen.getByText(/^Manage data$/)).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(2);
  });
});
