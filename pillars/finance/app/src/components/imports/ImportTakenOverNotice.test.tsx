import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImportTakenOverNotice } from './ImportTakenOverNotice';

describe('ImportTakenOverNotice', () => {
  it('names when the draft was taken and offers the two ways out', () => {
    const onTakeBack = vi.fn();
    const onLeave = vi.fn();
    const takenAt = '2026-09-10T09:05:00+10:00';
    render(<ImportTakenOverNotice takenAt={takenAt} onTakeBack={onTakeBack} onLeave={onLeave} />);
    // Formatted in the runner's own timezone, same as the component: a
    // hardcoded clock time would pass locally and fail in CI's UTC.
    const at = new Date(takenAt).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByText('This import is open somewhere else now')).toBeDefined();
    expect(
      screen.getByText(
        `Another tab took it over at ${at}. Anything you change here will not be saved. Take it back to keep working here, or leave and let the other tab finish.`
      )
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    expect(onTakeBack).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
