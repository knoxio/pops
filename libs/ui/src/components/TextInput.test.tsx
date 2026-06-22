import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextInput } from './TextInput';

/**
 * Mounts a controlled TextInput where the parent owns the value via React
 * state. Mirrors typical controlled usage where consumers pass `value` and
 * `onChange`.
 */
function ControlledHarness({
  initial = '',
  onChange,
  clearable = false,
}: {
  initial?: string;
  onChange?: (next: string) => void;
  clearable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      placeholder="enter"
      value={value}
      clearable={clearable}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}

describe('TextInput — uncontrolled', () => {
  it('renders the input without a `value` attribute when no `value` prop is supplied', () => {
    render(<TextInput placeholder="search" />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    // React-controlled inputs always set the `value` attribute. Uncontrolled
    // inputs leave it absent so the DOM owns the value.
    expect(input.hasAttribute('value')).toBe(false);
  });

  it('reflects `defaultValue` as the initial DOM value', () => {
    render(<TextInput placeholder="search" defaultValue="hello" />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('fires onChange when the user types, and the DOM value updates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextInput placeholder="search" onChange={onChange} />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('abc');
    expect(onChange).toHaveBeenCalled();
    // Last call should reflect the final character event.
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall?.[0].target.value).toBe('abc');
  });

  it('clear button clears the DOM value AND fires onChange with an empty string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextInput placeholder="search" defaultValue="seed" clearable onChange={onChange} />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    expect(input.value).toBe('seed');

    const clear = screen.getByRole('button', { name: /clear input/i });
    await user.click(clear);

    expect(input.value).toBe('');
    // The native input event dispatched by the clear handler is normalised by
    // React into an onChange call with the cleared value.
    const cleared = onChange.mock.calls.find((c) => c[0].target.value === '');
    expect(cleared).toBeTruthy();
  });

  it('keeps a ref-driven DOM update across re-renders (RHF reset() pattern)', () => {
    /**
     * Simulates how `react-hook-form`'s `register()` writes to the input via
     * the ref on `form.reset()`: directly mutating `inputRef.current.value`.
     * If TextInput rendered React-controlled, the next render would clobber
     * this value back to '' — that's the bug we're guarding against.
     */
    function RefHarness({ trigger }: { trigger: number }) {
      const inputRef = useRef<HTMLInputElement | null>(null);
      useEffect(() => {
        if (inputRef.current && trigger > 0) {
          inputRef.current.value = 'reset-value';
        }
      }, [trigger]);
      return <TextInput placeholder="rhf" ref={inputRef} />;
    }

    const { rerender } = render(<RefHarness trigger={0} />);
    const input = screen.getByPlaceholderText('rhf') as HTMLInputElement;
    expect(input.value).toBe('');

    // Trigger the ref-driven write; mirrors form.reset({ field: 'reset-value' }).
    rerender(<RefHarness trigger={1} />);
    expect(input.value).toBe('reset-value');

    // Force another render with no further ref writes — value MUST persist.
    rerender(<RefHarness trigger={1} />);
    expect(input.value).toBe('reset-value');
  });

  it('clear button visibility tracks user-driven hasValue', async () => {
    const user = userEvent.setup();
    render(<TextInput placeholder="search" clearable />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    // No value yet → no clear button.
    expect(screen.queryByRole('button', { name: /clear input/i })).toBeNull();
    await user.type(input, 'x');
    expect(screen.getByRole('button', { name: /clear input/i })).toBeInTheDocument();
  });
});

describe('TextInput — controlled', () => {
  it('renders the input with the controlled `value` attribute', () => {
    render(<TextInput placeholder="search" value="hi" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    expect(input.value).toBe('hi');
    expect(input.getAttribute('value')).toBe('hi');
  });

  it('re-asserts the controlled value when the parent prop changes', () => {
    /**
     * In controlled mode the value attribute on the rendered element always
     * reflects the parent's prop. Changing the prop on a subsequent render
     * updates the DOM.
     */
    const { rerender } = render(
      <TextInput placeholder="search" value="first" onChange={() => {}} />
    );
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    expect(input.value).toBe('first');
    rerender(<TextInput placeholder="search" value="second" onChange={() => {}} />);
    expect(input.value).toBe('second');
  });

  it('does not update the DOM when typing if the parent does not re-render with the new value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // No state harness — value is locked to 'fixed' regardless of typing.
    render(<TextInput placeholder="search" value="fixed" onChange={onChange} />);
    const input = screen.getByPlaceholderText('search') as HTMLInputElement;
    await user.type(input, 'X');
    // onChange fires once for the keystroke but the controlled value sticks.
    expect(onChange).toHaveBeenCalled();
    expect(input.value).toBe('fixed');
  });

  it('updates when the parent state updates through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness onChange={onChange} />);
    const input = screen.getByPlaceholderText('enter') as HTMLInputElement;
    await user.type(input, 'go');
    expect(input.value).toBe('go');
    expect(onChange).toHaveBeenLastCalledWith('go');
  });

  it('clear button fires onChange with empty string and updates DOM via parent state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledHarness initial="seed" clearable onChange={onChange} />);
    const input = screen.getByPlaceholderText('enter') as HTMLInputElement;
    expect(input.value).toBe('seed');
    const clear = screen.getByRole('button', { name: /clear input/i });
    await user.click(clear);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
  });

  it('clear button visibility tracks the controlled value', () => {
    const { rerender } = render(
      <TextInput placeholder="search" value="" onChange={() => {}} clearable />
    );
    expect(screen.queryByRole('button', { name: /clear input/i })).toBeNull();
    rerender(<TextInput placeholder="search" value="x" onChange={() => {}} clearable />);
    expect(screen.getByRole('button', { name: /clear input/i })).toBeInTheDocument();
  });
});
