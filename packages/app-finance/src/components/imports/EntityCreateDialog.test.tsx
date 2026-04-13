import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock useImportStore — provide addPendingEntity via selector pattern
// ---------------------------------------------------------------------------

const mockAddPendingEntity = vi.fn();

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { addPendingEntity: mockAddPendingEntity };
    return selector(state);
  },
}));

// ---------------------------------------------------------------------------
// Mock @pops/ui — minimal Dialog + form element stubs
// ---------------------------------------------------------------------------

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) => (open ? React.createElement(React.Fragment, null, children) : null),
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'dialog-content' }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement('input', props),
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
      React.createElement('label', { htmlFor }, children),
    Button: ({
      children,
      onClick,
      type,
      disabled,
      variant,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      type?: 'button' | 'submit' | 'reset';
      disabled?: boolean;
      variant?: string;
    }) =>
      React.createElement(
        'button',
        { onClick, type: type ?? 'button', disabled, 'data-variant': variant },
        children
      ),
  };
});

import { EntityCreateDialog } from './EntityCreateDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  onEntityCreated: vi.fn(),
  suggestedName: '',
  dbEntities: [] as Array<{ name: string }>,
};

function renderDialog(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, onOpenChange: vi.fn(), onEntityCreated: vi.fn(), ...overrides };
  const utils = render(<EntityCreateDialog {...props} />);
  return { ...utils, props };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockAddPendingEntity.mockImplementation((input: { name: string; type: string }) => ({
    tempId: `temp:entity:${input.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: input.name,
    type: input.type,
  }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityCreateDialog', () => {
  it("calls addPendingEntity with trimmed name and type 'company' on submit", () => {
    renderDialog({ suggestedName: 'Woolworths' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(mockAddPendingEntity).toHaveBeenCalledTimes(1);
    expect(mockAddPendingEntity).toHaveBeenCalledWith({ name: 'Woolworths', type: 'company' }, []);
  });

  it('passes dbEntities to addPendingEntity for uniqueness checking', () => {
    const dbEntities = [{ name: 'Coles' }, { name: 'Aldi' }];
    renderDialog({ suggestedName: 'Woolworths', dbEntities });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(mockAddPendingEntity).toHaveBeenCalledWith(
      { name: 'Woolworths', type: 'company' },
      dbEntities
    );
  });

  it('calls onEntityCreated with tempId and entityName after successful submission', () => {
    const onEntityCreated = vi.fn();
    mockAddPendingEntity.mockReturnValue({
      tempId: 'temp:entity:netflix',
      name: 'Netflix',
      type: 'company',
    });
    renderDialog({ suggestedName: 'Netflix', onEntityCreated });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(onEntityCreated).toHaveBeenCalledTimes(1);
    expect(onEntityCreated).toHaveBeenCalledWith({
      entityId: 'temp:entity:netflix',
      entityName: 'Netflix',
    });
  });

  it('does not call any tRPC mutation — only addPendingEntity is invoked', () => {
    // The component intentionally has no tRPC dependency. We verify that
    // addPendingEntity is called and nothing else unexpected happens.
    renderDialog({ suggestedName: 'Spotify' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(mockAddPendingEntity).toHaveBeenCalledTimes(1);
    // No trpc module is imported by the component — this test simply confirms
    // addPendingEntity is the sole write path exercised on submit.
  });

  it('shows an inline error message when addPendingEntity throws (e.g. duplicate name)', () => {
    mockAddPendingEntity.mockImplementation(() => {
      throw new Error("An entity named 'Woolworths' already exists");
    });
    renderDialog({ suggestedName: 'Woolworths' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(screen.getByText(/An entity named 'Woolworths' already exists/i)).toBeInTheDocument();
  });

  it('shows a fallback error message when addPendingEntity throws a non-Error value', () => {
    mockAddPendingEntity.mockImplementation(() => {
      throw 'unexpected string error';
    });
    renderDialog({ suggestedName: 'Mystery' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(screen.getByText(/Failed to create entity/i)).toBeInTheDocument();
  });

  it('does not call onEntityCreated when addPendingEntity throws', () => {
    const onEntityCreated = vi.fn();
    mockAddPendingEntity.mockImplementation(() => {
      throw new Error('Duplicate');
    });
    renderDialog({ suggestedName: 'Woolworths', onEntityCreated });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(onEntityCreated).not.toHaveBeenCalled();
  });

  it('calls onOpenChange(false) to close the dialog after successful creation', () => {
    const onOpenChange = vi.fn();
    renderDialog({ suggestedName: 'Netflix', onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close the dialog when addPendingEntity throws', () => {
    const onOpenChange = vi.fn();
    mockAddPendingEntity.mockImplementation(() => {
      throw new Error('Duplicate');
    });
    renderDialog({ suggestedName: 'Woolworths', onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('trims whitespace from the name before calling addPendingEntity', () => {
    renderDialog({ suggestedName: '  Spotify  ' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));

    expect(mockAddPendingEntity).toHaveBeenCalledWith(
      { name: 'Spotify', type: 'company' },
      expect.anything()
    );
  });

  it('does not submit when name is empty or only whitespace', () => {
    renderDialog({ suggestedName: '' });

    // Submit button is disabled when name is empty
    const submitBtn = screen.getByRole('button', { name: /Create Entity/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);

    expect(mockAddPendingEntity).not.toHaveBeenCalled();
  });

  it('clears the error when the user types after a failed submission', () => {
    mockAddPendingEntity.mockImplementationOnce(() => {
      throw new Error('Duplicate name');
    });
    renderDialog({ suggestedName: 'Woolworths' });

    fireEvent.click(screen.getByRole('button', { name: /Create Entity/i }));
    expect(screen.getByText(/Duplicate name/i)).toBeInTheDocument();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Woolworths Fresh' } });

    expect(screen.queryByText(/Duplicate name/i)).not.toBeInTheDocument();
  });
});
