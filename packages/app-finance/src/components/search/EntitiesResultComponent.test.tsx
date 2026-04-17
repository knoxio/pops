import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getResultComponent, registerResultComponent } from '@pops/navigation';

import { EntitiesResultComponent } from './EntitiesResultComponent';

describe('EntitiesResultComponent', () => {
  it('renders entity name and type badge', () => {
    render(<EntitiesResultComponent data={{ name: 'Woolworths', type: 'company', aliases: [] }} />);

    expect(screen.getByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('company')).toBeInTheDocument();
  });

  it('renders aliases as secondary text', () => {
    render(
      <EntitiesResultComponent
        data={{
          name: 'Woolworths',
          type: 'company',
          aliases: ['Woolies', 'WOW'],
        }}
      />
    );

    expect(screen.getByText('Woolies, WOW')).toBeInTheDocument();
  });

  it('does not render aliases when empty', () => {
    const { container } = render(
      <EntitiesResultComponent data={{ name: 'Shell', type: 'company', aliases: [] }} />
    );

    expect(container.querySelector('.text-muted-foreground')).not.toBeInTheDocument();
  });

  it('highlights matched portion of name', () => {
    render(
      <EntitiesResultComponent
        data={{
          name: 'Woolworths',
          type: 'company',
          aliases: [],
          query: 'wool',
        }}
      />
    );

    const mark = screen.getByText('Wool');
    expect(mark.tagName).toBe('MARK');
    expect(screen.getByText('worths')).toBeInTheDocument();
  });

  it('renders different type badges with correct text', () => {
    const types = ['company', 'person', 'place', 'brand', 'organisation'];

    for (const type of types) {
      const { unmount } = render(
        <EntitiesResultComponent data={{ name: 'Test', type, aliases: [] }} />
      );

      expect(screen.getByText(type)).toBeInTheDocument();
      unmount();
    }
  });

  it("registers as 'entities' domain result component", () => {
    // Manually register (side-effect import already ran at module load)
    registerResultComponent('entities', EntitiesResultComponent);
    const component = getResultComponent('entities');
    expect(component).toBe(EntitiesResultComponent);
  });
});
