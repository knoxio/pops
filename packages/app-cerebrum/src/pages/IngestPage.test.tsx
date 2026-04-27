import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── tRPC mock ────────────────────────────────────────────────────────

const mockTemplatesQuery = vi.fn();
const mockScopesQuery = vi.fn();
const mockInferScopesQuery = vi.fn();
const mockSubmitMutate = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    cerebrum: {
      templates: {
        list: { useQuery: (...args: unknown[]) => mockTemplatesQuery(...args) },
      },
      scopes: {
        list: { useQuery: (...args: unknown[]) => mockScopesQuery(...args) },
      },
      ingest: {
        inferScopes: {
          useQuery: (...args: unknown[]) => mockInferScopesQuery(...args),
        },
        submit: {
          useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
            mutate: (...args: unknown[]) => {
              mockSubmitMutate(...args);
              opts.onSuccess?.({
                engram: {
                  id: 'eng_20260427_1200_test-engram',
                  filePath: '/cerebrum/engrams/test-engram.md',
                  type: 'note',
                },
                classification: null,
                entities: [],
                scopeInference: { scopes: ['test.scope'], source: 'explicit', confidence: 1 },
              });
            },
            isPending: false,
            error: null,
          }),
        },
      },
    },
  },
}));

// ── UI mock ──────────────────────────────────────────────────────────

vi.mock('@pops/ui', async () => {
  const React = await import('react');
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
    Select: ({
      value,
      onChange,
      options,
      label,
      placeholder,
    }: {
      value: string;
      onChange: (e: { target: { value: string } }) => void;
      options: { value: string; label: string }[];
      label?: string;
      placeholder?: string;
    }) =>
      React.createElement(
        'div',
        null,
        label && React.createElement('label', null, label),
        React.createElement(
          'select',
          {
            value,
            onChange,
            'aria-label': placeholder ?? label ?? 'select',
          },
          placeholder && React.createElement('option', { value: '', disabled: true }, placeholder),
          options.map((opt) =>
            React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
          )
        )
      ),
    TextInput: ({ value, onChange, placeholder, label, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'div',
        null,
        label ? React.createElement('label', null, label as string) : null,
        React.createElement('input', {
          type: 'text',
          value: value as string,
          onChange: onChange as () => void,
          placeholder: placeholder as string,
          'aria-label': (rest['aria-label'] as string) ?? (label as string),
          ...rest,
        })
      ),
    Textarea: ({
      value,
      onChange,
      placeholder,
      rows,
      className,
      ...rest
    }: Record<string, unknown>) =>
      React.createElement('textarea', {
        value: value as string,
        onChange: onChange as () => void,
        placeholder: placeholder as string,
        rows: rows as number,
        className: className as string,
        'aria-label': rest['aria-label'] as string,
      }),
    Button: ({ children, onClick, disabled, prefix, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        {
          onClick: onClick as () => void,
          disabled: disabled as boolean,
          ...rest,
        },
        prefix as React.ReactNode,
        children as React.ReactNode
      ),
    Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
      React.createElement('span', { 'data-testid': 'badge', 'data-variant': variant }, children),
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement('div', { className }, children),
    Chip: ({
      children,
      removable,
      onRemove,
    }: {
      children: React.ReactNode;
      size?: string;
      removable?: boolean;
      onRemove?: () => void;
    }) =>
      React.createElement(
        'span',
        { 'data-testid': 'chip' },
        children,
        removable &&
          React.createElement(
            'button',
            { onClick: onRemove, 'aria-label': `Remove ${String(children)}` },
            '×'
          )
      ),
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
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) =>
      open
        ? React.createElement(
            'div',
            {
              role: 'dialog',
              'aria-modal': 'true',
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget) onOpenChange(false);
              },
            },
            children
          )
        : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'dialog-content' }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h3', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement('div', { className: `animate-pulse ${className ?? ''}` }),
  };
});

import { IngestPage } from './IngestPage';

// ── Mock data ────────────────────────────────────────────────────────

const mockTemplates = [
  {
    name: 'decision',
    description: 'A decision made with rationale',
    required_fields: ['decision', 'alternatives'],
    custom_fields: {
      decision: { type: 'string', description: 'The decision that was made' },
      alternatives: { type: 'string[]', description: 'Options considered' },
      confidence: { type: 'string', description: 'low | medium | high' },
    },
  },
  {
    name: 'journal',
    description: 'A journal entry',
    custom_fields: {
      mood: { type: 'string', description: 'Mood word or phrase' },
    },
  },
];

const mockScopes = [
  { scope: 'work.projects', count: 10 },
  { scope: 'personal.journal', count: 5 },
];

function setupDefaultMocks() {
  mockTemplatesQuery.mockReturnValue({
    data: { templates: mockTemplates },
    isLoading: false,
  });
  mockScopesQuery.mockReturnValue({
    data: { scopes: mockScopes },
    isLoading: false,
  });
  mockInferScopesQuery.mockReturnValue({
    data: undefined,
    isFetching: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({
      data: { scopes: ['inferred.scope'], source: 'llm', confidence: 0.8 },
    }),
  });
}

function renderPage() {
  return render(<IngestPage />);
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('IngestPage', () => {
  it('renders page header', () => {
    renderPage();
    expect(screen.getByText('Ingest')).toBeInTheDocument();
    expect(
      screen.getByText('Create a new engram through the ingestion pipeline')
    ).toBeInTheDocument();
  });

  it('renders type selector with template options', () => {
    renderPage();
    const select = screen.getByRole('combobox', { name: /select type/i });
    expect(select).toBeInTheDocument();
    // Verify options include capture + templates
    const options = within(select).getAllByRole('option');
    const values = options.map((o) => o.textContent);
    expect(values).toContain('capture');
    expect(values).toContain('decision');
    expect(values).toContain('journal');
  });

  it('renders title and body inputs', () => {
    renderPage();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('renders scope and tag inputs', () => {
    renderPage();
    expect(screen.getByLabelText('Scope input')).toBeInTheDocument();
    expect(screen.getByTestId('chip-input')).toBeInTheDocument();
  });

  it('shows template-specific fields when a template type is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByRole('combobox', { name: /select type/i });
    await user.selectOptions(select, 'decision');
    expect(screen.getByText('Template Fields')).toBeInTheDocument();
    // Decision template should show its custom fields
    expect(screen.getByLabelText('decision')).toBeInTheDocument();
    expect(screen.getByLabelText('confidence')).toBeInTheDocument();
  });

  it('does not show template fields for capture type', async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByRole('combobox', { name: /select type/i });
    await user.selectOptions(select, 'capture');
    expect(screen.queryByText('Template Fields')).not.toBeInTheDocument();
  });

  it('submit button is disabled when body is empty', () => {
    renderPage();
    const submit = screen.getByRole('button', { name: /submit/i });
    expect(submit).toBeDisabled();
  });

  it('submit button is enabled when body has content', async () => {
    const user = userEvent.setup();
    renderPage();
    const body = screen.getByLabelText('Body');
    await user.type(body, 'Some content here');
    const submit = screen.getByRole('button', { name: /submit/i });
    expect(submit).not.toBeDisabled();
  });

  it('calls submit mutation with form data', async () => {
    const user = userEvent.setup();
    renderPage();

    // Fill in the form
    const titleInput = screen.getByLabelText('Title');
    await user.type(titleInput, 'Test Engram');

    const body = screen.getByLabelText('Body');
    await user.type(body, 'Test body content');

    // Add a scope manually via the input
    const scopeInput = screen.getByLabelText('Scope input');
    await user.type(scopeInput, 'test.scope{Enter}');

    // Submit
    const submit = screen.getByRole('button', { name: /submit/i });
    await user.click(submit);

    expect(mockSubmitMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Test body content',
        title: 'Test Engram',
        source: 'manual',
        scopes: ['test.scope'],
      })
    );
  });

  it('shows result after successful submission', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body');
    await user.type(body, 'Some content');

    const scopeInput = screen.getByLabelText('Scope input');
    await user.type(scopeInput, 'my.scope{Enter}');

    const submit = screen.getByRole('button', { name: /submit/i });
    await user.click(submit);

    // Result banner should appear
    expect(screen.getByText('Engram Created')).toBeInTheDocument();
    expect(screen.getByText('eng_20260427_1200_test-engram')).toBeInTheDocument();
    expect(screen.getByText('/cerebrum/engrams/test-engram.md')).toBeInTheDocument();
  });

  it('shows create another button after submission', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body');
    await user.type(body, 'Some content');

    const scopeInput = screen.getByLabelText('Scope input');
    await user.type(scopeInput, 'x.y{Enter}');

    const submit = screen.getByRole('button', { name: /submit/i });
    await user.click(submit);

    const createAnother = screen.getByRole('button', { name: /create another/i });
    expect(createAnother).toBeInTheDocument();

    // Clicking resets the form
    await user.click(createAnother);
    expect(screen.queryByText('Engram Created')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('shows loading state for templates', () => {
    mockTemplatesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    renderPage();
    expect(screen.getByText('Loading templates…')).toBeInTheDocument();
  });

  it('triggers scope inference when submitting without scopes', async () => {
    const refetchFn = vi.fn().mockResolvedValue({
      data: { scopes: ['inferred.scope'], source: 'llm', confidence: 0.8 },
    });
    mockInferScopesQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: null,
      refetch: refetchFn,
    });

    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body');
    await user.type(body, 'Some text without scopes');

    const submit = screen.getByRole('button', { name: /submit/i });
    await user.click(submit);

    // Scope inference should be triggered
    expect(refetchFn).toHaveBeenCalled();
  });
});
