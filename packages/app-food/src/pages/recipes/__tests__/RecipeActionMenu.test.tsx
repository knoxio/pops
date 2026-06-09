import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { RecipeActionMenu } from '../RecipeActionMenu.js';

function wrap(props?: Partial<Parameters<typeof RecipeActionMenu>[0]>) {
  const onArchive = props?.onArchive ?? vi.fn();
  return {
    onArchive,
    ...render(
      <MemoryRouter>
        <RecipeActionMenu slug="pancakes" draftCount={2} onArchive={onArchive} {...props} />
      </MemoryRouter>
    ),
  };
}

describe('PRD-119-B — RecipeActionMenu', () => {
  it('opens the menu when the trigger is clicked', async () => {
    wrap();
    const trigger = screen.getByRole('button', { name: /actions/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('renders the canonical 119-B order: Edit, Drafts, Archive (without Cook now/Send)', async () => {
    wrap();
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/edit/i);
    expect(items[1]).toHaveTextContent(/drafts/i);
    expect(items[2]).toHaveTextContent(/archive/i);
  });

  it('shows the draft count in the Drafts label', async () => {
    wrap({ draftCount: 7 });
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText(/drafts.*7/i)).toBeInTheDocument();
  });

  it('routes Edit + Drafts to the slug-based paths', async () => {
    wrap();
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByRole('menuitem', { name: /edit/i })).toHaveAttribute(
      'href',
      '/food/recipes/pancakes/edit'
    );
    expect(screen.getByRole('menuitem', { name: /drafts/i })).toHaveAttribute(
      'href',
      '/food/recipes/pancakes/drafts'
    );
  });

  it('fires onArchive when the Archive button is clicked', async () => {
    const { onArchive } = wrap();
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('renders extraItems between Drafts and Archive (forward-compat slot)', async () => {
    wrap({
      extraItems: (
        <button type="button" role="menuitem">
          Cook now…
        </button>
      ),
    });
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveTextContent(/cook now/i);
  });
});
