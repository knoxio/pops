/**
 * Tests for TagPicker — covers prefix-based autocomplete from existing
 * tags (PRD-081 US-01 AC #9), chip add/remove, and keyboard interaction.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Chip: ({
      children,
      removable,
      onRemove,
    }: {
      children?: ReactNode;
      removable?: boolean;
      onRemove?: () => void;
    }) =>
      React.createElement(
        'span',
        { 'data-testid': 'chip' },
        children,
        removable
          ? React.createElement(
              'button',
              { type: 'button', 'aria-label': `remove ${children as string}`, onClick: onRemove },
              'x'
            )
          : null
      ),
  };
});

import { TagPicker } from './TagPicker';

const SUGGESTIONS = [
  { tag: 'react', count: 3 },
  { tag: 'react-router', count: 1 },
  { tag: 'rust', count: 5 },
  { tag: 'typescript', count: 7 },
];

describe('TagPicker', () => {
  it('renders existing tag chips', () => {
    render(
      <TagPicker value={['typescript', 'rust']} suggestions={SUGGESTIONS} onChange={() => {}} />
    );
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('rust')).toBeInTheDocument();
  });

  it('shows prefix-filtered suggestions when typing', async () => {
    const user = userEvent.setup();
    render(<TagPicker value={[]} suggestions={SUGGESTIONS} onChange={() => {}} />);

    await user.type(screen.getByLabelText('Tag input'), 'rea');

    const dropdownButtons = screen.getAllByRole('button');
    const dropdownTexts = dropdownButtons.map((b) => b.textContent ?? '');
    expect(dropdownTexts.some((t) => t.includes('react') && !t.includes('react-router'))).toBe(
      true
    );
    expect(dropdownTexts.some((t) => t.includes('react-router'))).toBe(true);
    expect(dropdownTexts.some((t) => t.includes('rust'))).toBe(false);
  });

  it('hides already-selected tags from the dropdown', async () => {
    const user = userEvent.setup();
    render(<TagPicker value={['react']} suggestions={SUGGESTIONS} onChange={() => {}} />);

    await user.type(screen.getByLabelText('Tag input'), 'rea');

    // Dropdown buttons (excluding the chip remove button which uses aria-label)
    const dropdownButtons = screen
      .getAllByRole('button')
      .filter((b) => !b.getAttribute('aria-label')?.startsWith('remove'));
    const dropdownTexts = dropdownButtons.map((b) => b.textContent ?? '');
    expect(dropdownTexts.some((t) => t.includes('react') && !t.includes('react-router'))).toBe(
      false
    );
    expect(dropdownTexts.some((t) => t.includes('react-router'))).toBe(true);
  });

  it('appends a tag when a suggestion is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={[]} suggestions={SUGGESTIONS} onChange={onChange} />);

    await user.type(screen.getByLabelText('Tag input'), 'rea');
    const reactButton = screen
      .getAllByRole('button')
      .find(
        (b) =>
          (b.textContent ?? '').startsWith('react') &&
          !(b.textContent ?? '').startsWith('react-router')
      );
    expect(reactButton).toBeDefined();
    await user.click(reactButton as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(['react']);
  });

  it('commits a freeform tag when Enter is pressed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={[]} suggestions={SUGGESTIONS} onChange={onChange} />);

    const input = screen.getByLabelText('Tag input');
    await user.type(input, 'brand-new-tag{Enter}');

    expect(onChange).toHaveBeenCalledWith(['brand-new-tag']);
  });

  it('normalises whitespace and case on commit', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={[]} suggestions={SUGGESTIONS} onChange={onChange} />);

    await user.type(screen.getByLabelText('Tag input'), '  Multi Word  {Enter}');

    expect(onChange).toHaveBeenCalledWith(['multi-word']);
  });

  it('rejects duplicates silently', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={['react']} suggestions={SUGGESTIONS} onChange={onChange} />);

    await user.type(screen.getByLabelText('Tag input'), 'react{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last chip on Backspace when input is empty', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagPicker value={['react', 'rust']} suggestions={SUGGESTIONS} onChange={onChange} />);

    const input = screen.getByLabelText('Tag input');
    input.focus();
    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['react']);
  });
});
