import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    TextInput: ({ value, onChange, placeholder, label, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'div',
        null,
        label ? React.createElement('label', null, label as ReactNode) : null,
        React.createElement('input', {
          type: 'text',
          value: value as string,
          onChange: onChange as () => void,
          placeholder: placeholder as string,
          'aria-label': (rest['aria-label'] as string) ?? (label as string),
        })
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
  };
});

import { TemplateFields } from './TemplateFields';

const decisionFields = {
  decision: { type: 'string', description: 'The decision that was made' },
  alternatives: { type: 'string[]', description: 'Options considered' },
  confidence: { type: 'string', description: 'low | medium | high' },
  priority: { type: 'number', description: 'Priority level' },
  approved: { type: 'boolean', description: 'Whether approved' },
};

describe('TemplateFields', () => {
  let onChange: (fieldName: string, value: unknown) => void;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('renders nothing when fields is empty', () => {
    const { container } = render(<TemplateFields fields={{}} values={{}} onChange={onChange} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a string field as a text input', () => {
    render(
      <TemplateFields
        fields={{ decision: decisionFields.decision }}
        values={{}}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('decision')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The decision that was made')).toBeInTheDocument();
  });

  it('renders an array field as chip input', () => {
    render(
      <TemplateFields
        fields={{ alternatives: decisionFields.alternatives }}
        values={{}}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId('chip-input')).toBeInTheDocument();
  });

  it('renders a number field', () => {
    render(
      <TemplateFields
        fields={{ priority: decisionFields.priority }}
        values={{}}
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('priority');
    expect(input).toHaveAttribute('type', 'number');
  });

  it('renders a boolean field as checkbox', () => {
    render(
      <TemplateFields
        fields={{ approved: decisionFields.approved }}
        values={{}}
        onChange={onChange}
      />
    );
    const checkbox = screen.getByLabelText('approved');
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('calls onChange when a string field changes', async () => {
    const user = userEvent.setup();
    render(
      <TemplateFields
        fields={{ decision: decisionFields.decision }}
        values={{ decision: '' }}
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText('decision');
    await user.type(input, 'Go with option A');
    expect(onChange).toHaveBeenCalled();
    const mockFn = onChange as ReturnType<typeof vi.fn>;
    const lastCall = mockFn.mock.calls.at(-1) as [string, unknown] | undefined;
    expect(lastCall?.[0]).toBe('decision');
  });

  it('calls onChange when boolean field is toggled', async () => {
    const user = userEvent.setup();
    render(
      <TemplateFields
        fields={{ approved: decisionFields.approved }}
        values={{ approved: false }}
        onChange={onChange}
      />
    );
    const checkbox = screen.getByLabelText('approved');
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith('approved', true);
  });

  it('renders the "Template Fields" heading', () => {
    render(
      <TemplateFields
        fields={{ decision: decisionFields.decision }}
        values={{}}
        onChange={onChange}
      />
    );
    expect(screen.getByText('Template Fields')).toBeInTheDocument();
  });

  it('renders all fields from a multi-field template', () => {
    render(<TemplateFields fields={decisionFields} values={{}} onChange={onChange} />);
    expect(screen.getByLabelText('decision')).toBeInTheDocument();
    expect(screen.getByLabelText('confidence')).toBeInTheDocument();
    expect(screen.getByLabelText('priority')).toBeInTheDocument();
    expect(screen.getByLabelText('approved')).toBeInTheDocument();
  });
});
