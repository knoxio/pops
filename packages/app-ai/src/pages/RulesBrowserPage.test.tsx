import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListQuery = vi.fn();
const mockDeleteMutate = vi.fn();
const mockAdjustMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    core: {
      corrections: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        delete: {
          useMutation: (opts: { onSuccess?: () => void }) => ({
            mutate: (...args: unknown[]) => {
              mockDeleteMutate(...args);
              opts.onSuccess?.();
            },
            isPending: false,
          }),
        },
        adjustConfidence: {
          useMutation: (opts: { onSuccess?: () => void }) => ({
            mutate: (...args: unknown[]) => {
              mockAdjustMutate(...args);
              // call onSuccess from the second arg if provided
              const callOpts = args[1] as { onSuccess?: () => void } | undefined;
              callOpts?.onSuccess?.();
              opts.onSuccess?.();
            },
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({
      core: {
        corrections: {
          list: { invalidate: mockInvalidate },
        },
      },
    }),
  },
}));

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  // Shared ref so DialogClose can call the Dialog's onOpenChange
  let dialogCloseRef: (() => void) | null = null;
  return {
    PageHeader: ({
      title,
      description,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'page-header' },
        React.createElement('h1', null, title),
        description && React.createElement('p', null, description)
      ),
    DataTable: ({
      columns,
      data,
    }: {
      columns: { id?: string; accessorKey?: string; header: unknown; cell: unknown }[];
      data: unknown[];
    }) => {
      return React.createElement(
        'table',
        { 'data-testid': 'data-table' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            columns.map((col, i) => {
              const key = col.id ?? col.accessorKey ?? `col-${i}`;
              const header =
                typeof col.header === 'function'
                  ? col.header({ column: { getIsSorted: () => false, toggleSorting: vi.fn() } })
                  : col.header;
              return React.createElement('th', { key }, header);
            })
          )
        ),
        React.createElement(
          'tbody',
          null,
          (data as Record<string, unknown>[]).map((row, ri) =>
            React.createElement(
              'tr',
              { key: ri, 'data-testid': `row-${ri}` },
              columns.map((col, ci) => {
                const key = col.id ?? col.accessorKey ?? `cell-${ci}`;
                const cell =
                  typeof col.cell === 'function' ? col.cell({ row: { original: row } }) : null;
                return React.createElement('td', { key }, cell);
              })
            )
          )
        )
      );
    },
    SortableHeader: ({ children }: { children: React.ReactNode; column: unknown }) =>
      React.createElement('span', null, children),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement('div', { className: `animate-pulse ${className ?? ''}` }),
    Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('div', { role: 'alert', 'data-variant': variant }, children),
    Badge: ({ children }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('span', { 'data-testid': 'badge' }, children),
    Button: ({ children, onClick, disabled, variant, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        { onClick: onClick as () => void, disabled, 'data-variant': variant, ...rest },
        children as React.ReactNode
      ),
    TextInput: ({ value, onChange, placeholder, ...rest }: Record<string, unknown>) =>
      React.createElement('input', {
        value: value as string,
        onChange: onChange as () => void,
        placeholder: placeholder as string,
        ...rest,
      }),
    Select: ({
      value,
      onChange,
      options,
      placeholder,
    }: {
      value: string;
      onChange: (e: { target: { value: string } }) => void;
      options: { value: string; label: string }[];
      placeholder?: string;
    }) =>
      React.createElement(
        'select',
        { value, onChange, 'aria-label': placeholder },
        options.map((opt) =>
          React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
        )
      ),
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement('div', { className }, children),
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) => {
      dialogCloseRef = open ? () => onOpenChange(false) : null;
      return open
        ? React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              'data-open': open,
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              },
            },
            children
          )
        : null;
    },
    DialogContent: ({ children }: { children: React.ReactNode; showCloseButton?: boolean }) =>
      React.createElement('div', { 'data-testid': 'dialog-content' }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h3', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
      if (asChild) {
        // Wrap the child element to add an onClick that closes the dialog
        const child = children as React.ReactElement;
        return React.cloneElement(child, {
          onClick: (...args: unknown[]) => {
            dialogCloseRef?.();
            const onClick = (child.props as Record<string, (...a: unknown[]) => void>).onClick;
            onClick?.(...args);
          },
        } as Record<string, unknown>);
      }
      return React.createElement('button', { onClick: () => dialogCloseRef?.() }, children);
    },
    Slider: ({
      value,
      onValueChange,
      min = 0,
      max = 1,
      step = 0.01,
      className,
      ...rest
    }: {
      value?: number[];
      onValueChange?: (values: number[]) => void;
      min?: number;
      max?: number;
      step?: number;
      className?: string;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        type: 'range',
        min,
        max,
        step,
        value: value?.[0] ?? min,
        className,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          onValueChange?.([parseFloat(e.target.value)]);
        },
        ...rest,
      }),
  };
});

import { RulesBrowserPage } from './RulesBrowserPage';

const mockRules = [
  {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS*',
    matchType: 'contains' as const,
    entityId: 'ent-1',
    entityName: 'Woolworths',
    confidence: 0.95,
    timesApplied: 42,
    lastUsedAt: '2026-03-25T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    location: null,
    tags: [],
    transactionType: null,
  },
  {
    id: 'rule-2',
    descriptionPattern: 'NETFLIX.COM',
    matchType: 'exact' as const,
    entityId: null,
    entityName: null,
    confidence: 0.72,
    timesApplied: 8,
    lastUsedAt: null,
    createdAt: '2026-02-15T00:00:00Z',
    location: null,
    tags: [],
    transactionType: null,
  },
  {
    id: 'rule-3',
    descriptionPattern: '^UBER.*EATS',
    matchType: 'regex' as const,
    entityId: 'ent-3',
    entityName: 'Uber Eats',
    confidence: 0.25,
    timesApplied: 3,
    lastUsedAt: '2026-03-20T00:00:00Z',
    createdAt: '2026-03-01T00:00:00Z',
    location: null,
    tags: [],
    transactionType: null,
  },
];

function renderPage() {
  return render(<RulesBrowserPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListQuery.mockReturnValue({
    data: {
      data: mockRules,
      pagination: { total: 3, limit: 50, offset: 0 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('RulesBrowserPage', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Categorisation Rules')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    renderPage();
    expect(screen.getByText('Browse and manage AI categorisation rules')).toBeInTheDocument();
  });

  it('renders rule patterns in table', () => {
    renderPage();
    expect(screen.getByText('WOOLWORTHS*')).toBeInTheDocument();
    expect(screen.getByText('NETFLIX.COM')).toBeInTheDocument();
    expect(screen.getByText('^UBER.*EATS')).toBeInTheDocument();
  });

  it('renders entity names', () => {
    renderPage();
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Uber Eats')).toBeInTheDocument();
  });

  it('renders match type badges', () => {
    renderPage();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('exact')).toBeInTheDocument();
    expect(screen.getByText('regex')).toBeInTheDocument();
  });

  it('renders confidence sliders', () => {
    renderPage();
    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(3);
  });

  it('renders times applied', () => {
    renderPage();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows dash for null entity', () => {
    renderPage();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows Never for null lastUsedAt', () => {
    renderPage();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    mockListQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({ data: null, isLoading: false, isError: true, refetch });
    renderPage();
    expect(screen.getByText('Failed to load rules')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows empty state when no rules', () => {
    mockListQuery.mockReturnValue({
      data: { data: [], pagination: { total: 0, limit: 50, offset: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No categorisation rules found.')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = screen.getAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    expect(screen.getByText('Delete Rule')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('cancels delete dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = screen.getAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Rule')).not.toBeInTheDocument();
  });

  it('confirms delete calls mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = screen.getAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    await user.click(screen.getByText('Delete'));
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'rule-1' });
  });

  it('passes matchType to server query when filter selected', async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByRole('combobox', { name: /all match types/i });
    await user.selectOptions(select, 'exact');
    // Verify the query was called with matchType param (server-side filter)
    const lastCall = mockListQuery.mock.calls[mockListQuery.mock.calls.length - 1];
    expect(lastCall![0]).toMatchObject({ matchType: 'exact' });
  });

  it('renders clear filters button when filter active', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /all match types/i });
    await user.selectOptions(select, 'exact');
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('calls adjustConfidence mutation on slider change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    const sliders = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
    const slider = sliders[0]!;
    // Simulate changing the slider value
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        slider,
        '0.5'
      );
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Advance past debounce timer
    await act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockAdjustMutate).toHaveBeenCalledWith(
      { id: 'rule-1', delta: expect.closeTo(0.5 - 0.95, 2) },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    vi.useRealTimers();
  });
});
