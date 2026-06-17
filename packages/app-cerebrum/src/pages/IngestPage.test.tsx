import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const CAPTURE_RESPONSE = {
  id: 'eng_20260514_1700_capture',
  path: 'capture/eng_20260514_1700_capture.md',
  type: 'capture',
  requeued: false,
  scopes: ['personal.captures'],
};

const SUBMIT_RESPONSE = {
  engram: {
    id: 'eng_20260514_1700_advanced',
    filePath: '/cerebrum/engrams/advanced.md',
    type: 'note',
  },
  classification: null,
  entities: [],
  scopeInference: { scopes: [], source: 'fallback', confidence: 0 },
};

const sdk = vi.hoisted(() => ({
  templatesList: vi.fn(),
  scopesList: vi.fn(),
  tagsList: vi.fn(),
  ingestEnrichmentStatus: vi.fn(),
  ingestRetryEnrichment: vi.fn(),
  ingestSubmit: vi.fn(),
  ingestQuickCapture: vi.fn(),
  engramsUpdate: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const { toast: mockToast } = await import('sonner');

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => {
    const React = require('react');
    return React.createElement('a', { href: to }, children);
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
          { value, onChange, 'aria-label': placeholder ?? label ?? 'select' },
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
        })
      ),
    Textarea: ({
      value,
      onChange,
      onKeyDown,
      placeholder,
      rows,
      ...rest
    }: Record<string, unknown>) =>
      React.createElement('textarea', {
        value: value as string,
        onChange: onChange as () => void,
        onKeyDown: onKeyDown as () => void,
        placeholder: placeholder as string,
        rows: rows as number,
        'aria-label': rest['aria-label'] as string,
      }),
    Button: ({ children, onClick, disabled, prefix }: Record<string, unknown>) =>
      React.createElement(
        'button',
        { onClick: onClick as () => void, disabled: disabled as boolean },
        prefix as React.ReactNode,
        children as React.ReactNode
      ),
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement('div', { className }, children),
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', null, children),
    Chip: ({ children, removable, onRemove }: Record<string, unknown>) =>
      React.createElement(
        'span',
        { 'data-testid': 'chip' },
        children as React.ReactNode,
        (removable as boolean) &&
          React.createElement(
            'button',
            { onClick: onRemove as () => void, 'aria-label': `Remove ${String(children)}` },
            '×'
          )
      ),
  };
});

import { IngestPage } from './IngestPage';

// ── Mock data ────────────────────────────────────────────────────────

const mockTemplates = [
  {
    name: 'decision',
    description: 'A decision made with rationale',
    custom_fields: { decision: { type: 'string', description: 'The decision' } },
  },
];

const mockScopes = [
  { scope: 'work.karbon.fedx.meetings', count: 12 },
  { scope: 'personal.journal', count: 5 },
];

function setupDefaultMocks() {
  sdk.templatesList.mockResolvedValue({ data: { templates: mockTemplates } });
  sdk.scopesList.mockResolvedValue({ data: { scopes: mockScopes } });
  sdk.tagsList.mockResolvedValue({ data: { tags: [] } });
  sdk.ingestEnrichmentStatus.mockReturnValue(new Promise(() => undefined));
  sdk.ingestSubmit.mockResolvedValue({ data: SUBMIT_RESPONSE });
  sdk.ingestQuickCapture.mockResolvedValue({ data: CAPTURE_RESPONSE });
}

function renderPage() {
  return render(withQueryClient(<IngestPage />));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('IngestPage — capture-first surface (PRD-081 US-01)', () => {
  it('renders page header with capture-first description', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Capture' })).toBeInTheDocument();
  });

  it('shows body, title, and scope inputs as primary affordances', () => {
    renderPage();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Scope input')).toBeInTheDocument();
  });

  it('hides type selector behind the Advanced disclosure', async () => {
    renderPage();
    // The Advanced summary is visible as a clickable element
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    // The type selector exists in the DOM (inside <details>) but won't be
    // 'visible' to the user until expanded — assert it's there as a sanity
    // check on wiring rather than asserting on visibility.
    expect(await screen.findByRole('combobox', { name: /select type/i })).toBeInTheDocument();
  });

  it('disables the capture button when body is empty', () => {
    renderPage();
    const button = screen.getByRole('button', { name: /capture/i });
    expect(button).toBeDisabled();
  });

  it('calls quickCapture (not submit) when the user only fills body and scope', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body');
    await user.type(body, 'A quick thought');

    const scopeInput = screen.getByLabelText('Scope input');
    await user.type(scopeInput, 'work.karbon{Enter}');

    const button = screen.getByRole('button', { name: /capture/i });
    await user.click(button);

    await waitFor(() =>
      expect(sdk.ingestQuickCapture).toHaveBeenCalledWith({
        body: { text: 'A quick thought', source: 'manual', scopes: ['work.karbon'] },
      })
    );
    expect(sdk.ingestSubmit).not.toHaveBeenCalled();
  });

  it('omits scopes from quickCapture when none are provided', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Body'), 'Bare thought');
    await user.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() =>
      expect(sdk.ingestQuickCapture).toHaveBeenCalledWith({
        body: { text: 'Bare thought', source: 'manual', scopes: undefined },
      })
    );
  });

  it('routes through submit when an Advanced field is touched', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Body'), 'A decision I made');

    // Touch an Advanced field (type)
    await user.selectOptions(screen.getByRole('combobox', { name: /select type/i }), 'decision');

    // Button label flips to "Submit Engram" when Advanced is touched
    const submit = screen.getByRole('button', { name: /submit engram/i });
    await user.click(submit);

    await waitFor(() =>
      expect(sdk.ingestSubmit).toHaveBeenCalledWith({
        body: expect.objectContaining({
          body: 'A decision I made',
          type: 'decision',
          source: 'manual',
        }),
      })
    );
    expect(sdk.ingestQuickCapture).not.toHaveBeenCalled();
  });

  it('Cmd+Enter from the body editor submits', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body');
    await user.type(body, 'Quick note');
    await user.type(body, '{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(sdk.ingestQuickCapture).toHaveBeenCalled());
  });

  it('Esc from a non-empty body clears it', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    await user.type(body, 'Drafted then discarded');
    await user.type(body, '{Escape}');

    expect(body.value).toBe('');
  });

  it('Esc shows an Undo toast that restores the cleared body', async () => {
    const user = userEvent.setup();
    renderPage();

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    await user.type(body, 'Worth saving after all');
    await user.type(body, '{Escape}');

    expect(body.value).toBe('');
    const calls = (mockToast as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastCall = calls.at(-1);
    if (!lastCall) throw new Error('expected toast to have been called');
    expect(lastCall[0]).toBe('Body cleared');
    const action = (lastCall[1] as { action: { label: string; onClick: () => void } }).action;
    expect(action.label).toBe('Undo');
    // Firing the undo callback restores the original text once React flushes.
    act(() => action.onClick());
    await waitFor(() => expect(body.value).toBe('Worth saving after all'));
  });

  it('shows the result view after a successful capture', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Body'), 'Captured');
    await user.click(screen.getByRole('button', { name: /capture/i }));

    expect(await screen.findByText('eng_20260514_1700_capture')).toBeInTheDocument();
  });
});

describe('IngestPage — bulk paste (PRD-081 US-08)', () => {
  it('flips the submit button to a count when the body contains separators', async () => {
    const user = userEvent.setup();
    renderPage();
    // userEvent.type doesn't insert raw newlines easily; use fireEvent shape
    // by typing one segment, manually inserting separator + extra segments via paste.
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    await user.click(body);
    await user.paste('one\n---\ntwo\n---\nthree');
    expect(screen.getByRole('button', { name: /capture 3 entries/i })).toBeInTheDocument();
  });

  it('submits one quickCapture per segment when bulk is detected', async () => {
    const user = userEvent.setup();
    renderPage();
    const body = screen.getByLabelText('Body');
    await user.click(body);
    await user.paste('one\n---\ntwo');
    await user.click(screen.getByRole('button', { name: /capture 2 entries/i }));
    await waitFor(() => expect(sdk.ingestQuickCapture).toHaveBeenCalledTimes(2));
    expect(sdk.ingestQuickCapture).toHaveBeenNthCalledWith(1, {
      body: { text: 'one', source: 'manual', scopes: undefined },
    });
    expect(sdk.ingestQuickCapture).toHaveBeenNthCalledWith(2, {
      body: { text: 'two', source: 'manual', scopes: undefined },
    });
  });

  it('renders a per-segment result list after a bulk capture', async () => {
    const user = userEvent.setup();
    renderPage();
    const body = screen.getByLabelText('Body');
    await user.click(body);
    await user.paste('alpha\n---\nbeta');
    await user.click(screen.getByRole('button', { name: /capture 2 entries/i }));
    await waitFor(() => {
      expect(screen.getByText(/Bulk capture/i)).toBeInTheDocument();
      expect(screen.getByText(/2\/2 done/i)).toBeInTheDocument();
    });
  });
});
