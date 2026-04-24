/**
 * TagEditor — regression tests for the Popover trigger wiring.
 *
 * These tests exist because the trigger wrapper must forwardRef and spread
 * Radix's injected props to the underlying Button. Without that, clicking
 * the tags cell silently no-ops (onClick and ref never reach the DOM),
 * which is exactly what #2162 caught in E2E. Keeping a fast unit check here
 * prevents a regression from slipping past lint refactors in the future.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagEditor } from './TagEditor';

describe('TagEditor', () => {
  it('opens the popover and shows the tag input when the trigger is clicked', () => {
    render(
      <TagEditor
        currentTags={['Groceries']}
        availableTags={['Groceries', 'Dining']}
        onSave={vi.fn()}
      />
    );

    // Popover content is portaled into document.body only once the trigger
    // flips open state; before the click it must not be in the DOM.
    expect(screen.queryByPlaceholderText(/Type to add a tag/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    expect(screen.getByPlaceholderText(/Type to add a tag/i)).toBeInTheDocument();
    // The existing tag renders as a removable Chip inside the popover.
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();
  });

  it('does not open the popover when disabled', () => {
    render(
      <TagEditor
        currentTags={['Groceries']}
        availableTags={['Groceries']}
        onSave={vi.fn()}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit tags/i }));

    expect(screen.queryByPlaceholderText(/Type to add a tag/i)).toBeNull();
  });
});
