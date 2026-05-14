/**
 * Tests for ScopeSuggestionList — renders the "Did you mean" affordance
 * for pending scope reconciliation suggestions (PRD-081 US-07).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

interface ButtonMockProps {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  prefix?: ReactNode;
}

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Button: ({ children, onClick, disabled, 'aria-label': ariaLabel, prefix }: ButtonMockProps) =>
      React.createElement(
        'button',
        { onClick, disabled, 'aria-label': ariaLabel },
        prefix,
        children
      ),
  };
});

import { ScopeSuggestionList } from './ScopeSuggestionList';

const baseSuggestion = {
  original: 'karbon.meetings',
  canonical: 'work.karbon.fedx.meetings',
  confidence: 0.85,
  reason: 'matches longer canonical scope',
};

describe('ScopeSuggestionList', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(
      <ScopeSuggestionList
        suggestions={[]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        pending={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per suggestion with the canonical scope, the original, and the reason', () => {
    render(
      <ScopeSuggestionList
        suggestions={[baseSuggestion]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        pending={false}
      />
    );
    expect(screen.getByText('work.karbon.fedx.meetings')).toBeInTheDocument();
    expect(screen.getByText(/karbon\.meetings/)).toBeInTheDocument();
    expect(screen.getByText(/matches longer canonical scope/)).toBeInTheDocument();
  });

  it('calls onAccept with (original, canonical) when Accept is clicked', async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    render(
      <ScopeSuggestionList
        suggestions={[baseSuggestion]}
        onAccept={onAccept}
        onDismiss={vi.fn()}
        pending={false}
      />
    );
    await user.click(screen.getByLabelText('Accept work.karbon.fedx.meetings'));
    expect(onAccept).toHaveBeenCalledWith('karbon.meetings', 'work.karbon.fedx.meetings');
  });

  it('calls onDismiss with the canonical scope when Dismiss is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <ScopeSuggestionList
        suggestions={[baseSuggestion]}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        pending={false}
      />
    );
    await user.click(screen.getByLabelText('Dismiss work.karbon.fedx.meetings'));
    expect(onDismiss).toHaveBeenCalledWith('work.karbon.fedx.meetings');
  });

  it('disables Accept and Dismiss while a mutation is pending', () => {
    render(
      <ScopeSuggestionList
        suggestions={[baseSuggestion]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        pending
      />
    );
    expect(screen.getByLabelText('Accept work.karbon.fedx.meetings')).toBeDisabled();
    expect(screen.getByLabelText('Dismiss work.karbon.fedx.meetings')).toBeDisabled();
  });
});
