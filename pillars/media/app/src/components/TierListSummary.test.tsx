import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type ScoreChange, TierListSummary } from './TierListSummary';

const sampleChanges: ScoreChange[] = [
  { movieId: 1, title: 'The Matrix', oldScore: 1200, newScore: 1245 },
  { movieId: 2, title: 'Inception', oldScore: 1300, newScore: 1275 },
  { movieId: 3, title: 'Interstellar', oldScore: 1100, newScore: 1100 },
];

describe('TierListSummary', () => {
  it('renders comparison count and movie count', () => {
    render(
      <TierListSummary
        comparisonsRecorded={28}
        scoreChanges={sampleChanges}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText('28 comparisons from 3 movies')).toBeInTheDocument();
  });

  it('renders per-movie score changes', () => {
    render(
      <TierListSummary
        comparisonsRecorded={28}
        scoreChanges={sampleChanges}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('Interstellar')).toBeInTheDocument();
  });

  it('shows green delta for positive score changes', () => {
    render(
      <TierListSummary
        comparisonsRecorded={1}
        scoreChanges={[sampleChanges[0]!]}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    const delta = screen.getByTestId('delta-1');
    expect(delta).toHaveTextContent('+45');
    expect(delta.className).toContain('success');
  });

  it('shows red delta for negative score changes', () => {
    render(
      <TierListSummary
        comparisonsRecorded={1}
        scoreChanges={[sampleChanges[1]!]}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    const delta = screen.getByTestId('delta-2');
    expect(delta).toHaveTextContent('-25');
    expect(delta.className).toContain('destructive');
  });

  it('shows neutral delta for no change', () => {
    render(
      <TierListSummary
        comparisonsRecorded={1}
        scoreChanges={[sampleChanges[2]!]}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    const delta = screen.getByTestId('delta-3');
    expect(delta).toHaveTextContent('0');
    expect(delta.className).toContain('muted');
  });

  it('calls onDoAnother when Do Another is clicked', async () => {
    const onDoAnother = vi.fn();
    render(
      <TierListSummary
        comparisonsRecorded={28}
        scoreChanges={sampleChanges}
        onDoAnother={onDoAnother}
        onDone={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Do Another'));
    expect(onDoAnother).toHaveBeenCalledOnce();
  });

  it('calls onDone when Done is clicked', async () => {
    const onDone = vi.fn();
    render(
      <TierListSummary
        comparisonsRecorded={28}
        scoreChanges={sampleChanges}
        onDoAnother={vi.fn()}
        onDone={onDone}
      />
    );
    await userEvent.click(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('handles singular comparison text', () => {
    render(
      <TierListSummary
        comparisonsRecorded={1}
        scoreChanges={[sampleChanges[0]!]}
        onDoAnother={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText('1 comparison from 1 movie')).toBeInTheDocument();
  });
});
