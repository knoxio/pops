import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';

import { ListsLandingPage } from '../ListsLandingPage';

describe('PRD-139 — ListsLandingPage', () => {
  it('renders the title and intro', () => {
    render(
      <Suspense fallback={null}>
        <ListsLandingPage />
      </Suspense>
    );
    expect(screen.getByRole('heading', { name: 'Lists' })).toBeInTheDocument();
    expect(screen.getByText(/Shopping, packing, and todo lists/)).toBeInTheDocument();
  });

  it('renders both coming-soon placeholder cards', () => {
    render(
      <Suspense fallback={null}>
        <ListsLandingPage />
      </Suspense>
    );
    expect(screen.getByText('Browse lists')).toBeInTheDocument();
    expect(screen.getByText('New list')).toBeInTheDocument();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });
});
