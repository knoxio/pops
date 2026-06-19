import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const correctionsList = vi.fn();
const correctionsDelete = vi.fn();
const correctionsAdjustConfidence = vi.fn();
const correctionsCreateOrUpdate = vi.fn();
const correctionsUpdate = vi.fn();
const correctionsPreviewMatches = vi.fn();

vi.mock('../finance-api/index.js', () => ({
  correctionsList: (...a: unknown[]) => correctionsList(...a),
  correctionsDelete: (...a: unknown[]) => correctionsDelete(...a),
  correctionsAdjustConfidence: (...a: unknown[]) => correctionsAdjustConfidence(...a),
  correctionsCreateOrUpdate: (...a: unknown[]) => correctionsCreateOrUpdate(...a),
  correctionsUpdate: (...a: unknown[]) => correctionsUpdate(...a),
  correctionsPreviewMatches: (...a: unknown[]) => correctionsPreviewMatches(...a),
}));

// The manual rule-form's entity picker reads `entities.list` over the
// generated core REST client; corrections themselves are now finance REST
// (mocked above). The mock resolves the Hey API `{ data, error }` envelope.
vi.mock('../core-api/index.js', () => ({
  entitiesList: () =>
    Promise.resolve({
      data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
      error: undefined,
    }),
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
      // Only update the ref when the dialog is actually open so a sibling
      // closed Dialog doesn't reset the ref of the open one (RuleFormDialog
      // and DeleteRuleDialog now coexist on the page).
      if (open) {
        dialogCloseRef = () => {
          onOpenChange(false);
        };
      }
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
    formatDate: (dateStr: string) => new Date(dateStr).toLocaleDateString(),
    useDebouncedCallback: <TArgs extends unknown[]>(
      fn: (...args: TArgs) => void,
      delay: number
    ) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (...args: TArgs) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },
    useDebouncedValue: (value: string) => value,
    Label: ({ children }: { children: React.ReactNode }) =>
      React.createElement('label', null, children),
    ChipInput: ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string[];
      onChange?: (next: string[]) => void;
      placeholder?: string;
    }) =>
      React.createElement('input', {
        'data-testid': 'chip-input',
        placeholder,
        value: (value ?? []).join(','),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.(e.target.value ? e.target.value.split(',') : []),
      }),
    CheckboxInput: ({
      checked,
      onCheckedChange,
      label,
    }: {
      checked?: boolean;
      onCheckedChange?: (next: boolean) => void;
      label?: React.ReactNode;
    }) =>
      React.createElement(
        'label',
        null,
        React.createElement('input', {
          type: 'checkbox',
          checked: !!checked,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
          'aria-label': typeof label === 'string' ? label : undefined,
        }),
        label as React.ReactNode
      ),
    NumberInput: ({
      value,
      onChange,
      ...rest
    }: {
      value?: number;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      'aria-label'?: string;
    }) =>
      React.createElement('input', {
        type: 'number',
        value: value ?? 0,
        onChange,
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
    isActive: true,
    priority: 0,
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
    isActive: true,
    priority: 0,
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
    isActive: true,
    priority: 0,
  },
];

const ok = (data: unknown) => ({ data });

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<RulesBrowserPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  correctionsList.mockResolvedValue(
    ok({ data: mockRules, pagination: { total: 3, limit: 50, offset: 0 } })
  );
  correctionsDelete.mockResolvedValue(ok({ message: 'deleted' }));
  correctionsAdjustConfidence.mockResolvedValue(ok({ message: 'adjusted' }));
});

describe('RulesBrowserPage', () => {
  it('renders page title', async () => {
    renderPage();
    expect(await screen.findByText('Categorisation Rules')).toBeInTheDocument();
  });

  it('renders subtitle', async () => {
    renderPage();
    expect(
      await screen.findByText('Browse and manage AI categorisation rules')
    ).toBeInTheDocument();
  });

  it('renders rule patterns in table', async () => {
    renderPage();
    expect(await screen.findByText('WOOLWORTHS*')).toBeInTheDocument();
    expect(screen.getByText('NETFLIX.COM')).toBeInTheDocument();
    expect(screen.getByText('^UBER.*EATS')).toBeInTheDocument();
  });

  it('renders entity names', async () => {
    renderPage();
    expect(await screen.findByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Uber Eats')).toBeInTheDocument();
  });

  it('renders match type badges', async () => {
    renderPage();
    expect(await screen.findByText('contains')).toBeInTheDocument();
    expect(screen.getByText('exact')).toBeInTheDocument();
    expect(screen.getByText('regex')).toBeInTheDocument();
  });

  it('renders confidence sliders', async () => {
    renderPage();
    await screen.findByText('WOOLWORTHS*');
    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(3);
  });

  it('renders times applied', async () => {
    renderPage();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows dash for null entity', async () => {
    renderPage();
    await screen.findByText('WOOLWORTHS*');
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows Never for null lastUsedAt', async () => {
    renderPage();
    expect(await screen.findByText('Never')).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    correctionsList.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    correctionsList.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Failed to load rules')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows empty state when no rules', async () => {
    correctionsList.mockResolvedValue(
      ok({ data: [], pagination: { total: 0, limit: 50, offset: 0 } })
    );
    renderPage();
    expect(await screen.findByText('No categorisation rules found.')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    expect(screen.getByText('Delete Rule')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('cancels delete dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Rule')).not.toBeInTheDocument();
  });

  it('confirms delete calls mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: /delete rule/i });
    await user.click(deleteButtons[0]!);
    await user.click(screen.getByText('Delete'));
    await waitFor(() => expect(correctionsDelete).toHaveBeenCalledWith({ path: { id: 'rule-1' } }));
  });

  it('passes matchType to server query when filter selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('WOOLWORTHS*');
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'exact');
    await waitFor(() => {
      const lastCall = correctionsList.mock.calls.at(-1);
      expect(lastCall![0]).toMatchObject({ query: { matchType: 'exact' } });
    });
  });

  it('renders clear filters button when filter active', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('WOOLWORTHS*');
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'exact');
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('calls adjustConfidence mutation on slider change', async () => {
    renderPage();
    await screen.findByText('WOOLWORTHS*');
    const slider = document.querySelectorAll<HTMLInputElement>('input[type="range"]')[0]!;
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        slider,
        '0.5'
      );
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitFor(() =>
      expect(correctionsAdjustConfidence).toHaveBeenCalledWith({
        path: { id: 'rule-1' },
        body: { delta: expect.closeTo(0.5 - 0.95, 2) },
      })
    );
  });
});
