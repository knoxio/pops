import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { RecipeActionMenu, type RecipeActionMenuItem } from '../RecipeActionMenu.js';

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

beforeEach(() => {
  navigateMock.mockReset();
});

describe('recipe-crud-pages — RecipeActionMenu', () => {
  it('opens the menu when the trigger is clicked', async () => {
    const user = userEvent.setup();
    wrap();
    const trigger = screen.getByRole('button', { name: /actions/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the canonical order: Edit, Drafts, Archive (without Cook now/Send)', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: /actions/i }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/edit/i);
    expect(items[1]).toHaveTextContent(/drafts/i);
    expect(items[2]).toHaveTextContent(/archive/i);
  });

  it('shows the draft count in the Drafts label', async () => {
    const user = userEvent.setup();
    wrap({ draftCount: 7 });
    await user.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText(/drafts.*7/i)).toBeInTheDocument();
  });

  it('navigates to the slug-based edit/drafts routes when items are selected', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /edit/i }));
    expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes/edit');

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /drafts/i }));
    expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes/drafts');
  });

  it('fires onArchive when the Archive item is selected', async () => {
    const user = userEvent.setup();
    const { onArchive } = wrap();
    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /archive/i }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('renders extraItems between Drafts and Archive (forward-compat slot)', async () => {
    const user = userEvent.setup();
    const cookSelect = vi.fn();
    const extraItems: RecipeActionMenuItem[] = [
      { label: 'Cook now…', value: 'cook', onSelect: cookSelect },
    ];
    wrap({ extraItems });
    await user.click(screen.getByRole('button', { name: /actions/i }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveTextContent(/cook now/i);
    await user.click(items[2]!);
    expect(cookSelect).toHaveBeenCalledTimes(1);
  });
});
