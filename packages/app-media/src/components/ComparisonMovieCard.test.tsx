import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

import { ComparisonMovieCard, ComparisonMovieCardSkeleton } from './ComparisonMovieCard';

const movie = { id: 42, title: 'The Dark Knight', posterUrl: '/poster.jpg' };

function renderCard(props: Partial<React.ComponentProps<typeof ComparisonMovieCard>> = {}) {
  return render(
    <TooltipProvider>
      <ComparisonMovieCard movie={movie} onPick={vi.fn()} {...props} />
    </TooltipProvider>
  );
}

describe('ComparisonMovieCard', () => {
  describe('poster and title', () => {
    it('renders movie poster with correct alt text', () => {
      renderCard();
      expect(screen.getByAltText('The Dark Knight poster')).toBeInTheDocument();
    });

    it('renders movie title', () => {
      renderCard();
      expect(screen.getByText('The Dark Knight')).toBeInTheDocument();
    });

    it('shows ImageOff placeholder when posterUrl is null', () => {
      renderCard({ movie: { ...movie, posterUrl: null } });
      expect(screen.queryByAltText('The Dark Knight poster')).not.toBeInTheDocument();
    });

    it('applies container test id with movie id', () => {
      renderCard();
      expect(screen.getByTestId('comparison-movie-card-42')).toBeInTheDocument();
    });
  });

  describe('pick button', () => {
    it('calls onPick when poster button clicked', async () => {
      const onPick = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick });

      await user.click(screen.getByLabelText('Pick The Dark Knight'));
      expect(onPick).toHaveBeenCalledTimes(1);
    });

    it('calls onPick when title button clicked', async () => {
      const onPick = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick });

      // Title button is the second button (not the poster pick button)
      const allButtons = screen.getAllByRole('button');
      const titleButton = allButtons.find((b) => b.textContent === 'The Dark Knight');
      expect(titleButton).toBeDefined();
      await user.click(titleButton!);
      expect(onPick).toHaveBeenCalled();
    });

    it('does not call onPick when disabled', () => {
      const onPick = vi.fn();
      renderCard({ onPick, disabled: true });

      fireEvent.click(screen.getByLabelText('Pick The Dark Knight'));
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  describe('watchlist toggle', () => {
    it('renders watchlist button with correct test id', () => {
      renderCard({ onToggleWatchlist: vi.fn() });
      expect(screen.getByTestId('watchlist-button-42')).toBeInTheDocument();
    });

    it('shows "Add to watchlist" label when not on watchlist', () => {
      renderCard({ onToggleWatchlist: vi.fn(), isOnWatchlist: false });
      expect(screen.getByLabelText('Add The Dark Knight to watchlist')).toBeInTheDocument();
    });

    it('shows "Remove from watchlist" label when on watchlist', () => {
      renderCard({ onToggleWatchlist: vi.fn(), isOnWatchlist: true });
      expect(screen.getByLabelText('Remove The Dark Knight from watchlist')).toBeInTheDocument();
    });

    it('calls onToggleWatchlist when clicked', async () => {
      const onToggleWatchlist = vi.fn();
      const user = userEvent.setup();
      renderCard({ onToggleWatchlist });

      await user.click(screen.getByTestId('watchlist-button-42'));
      expect(onToggleWatchlist).toHaveBeenCalledTimes(1);
    });

    it('does not propagate click to onPick', async () => {
      const onPick = vi.fn();
      const onToggleWatchlist = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick, onToggleWatchlist });

      await user.click(screen.getByTestId('watchlist-button-42'));
      expect(onToggleWatchlist).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('disables watchlist button when watchlistPending', () => {
      renderCard({ onToggleWatchlist: vi.fn(), watchlistPending: true });
      expect(screen.getByTestId('watchlist-button-42')).toBeDisabled();
    });

    it('does not render watchlist button when onToggleWatchlist is not provided', () => {
      renderCard();
      expect(screen.queryByTestId('watchlist-button-42')).not.toBeInTheDocument();
    });
  });

  describe('N/A button', () => {
    it('renders N/A button with correct test id', () => {
      renderCard({ onNA: vi.fn() });
      expect(screen.getByTestId('na-button-42')).toBeInTheDocument();
    });

    it('calls onNA when clicked', async () => {
      const onNA = vi.fn();
      const user = userEvent.setup();
      renderCard({ onNA });

      await user.click(screen.getByTestId('na-button-42'));
      expect(onNA).toHaveBeenCalledTimes(1);
    });

    it('does not propagate click to onPick', async () => {
      const onPick = vi.fn();
      const onNA = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick, onNA });

      await user.click(screen.getByTestId('na-button-42'));
      expect(onNA).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('disables N/A button when naPending', () => {
      renderCard({ onNA: vi.fn(), naPending: true });
      expect(screen.getByTestId('na-button-42')).toBeDisabled();
    });

    it('does not render N/A button when onNA not provided', () => {
      renderCard();
      expect(screen.queryByTestId('na-button-42')).not.toBeInTheDocument();
    });
  });

  describe('stale button', () => {
    it('renders stale button with correct test id', () => {
      renderCard({ onMarkStale: vi.fn() });
      expect(screen.getByTestId('stale-button-42')).toBeInTheDocument();
    });

    it('calls onMarkStale when clicked', async () => {
      const onMarkStale = vi.fn();
      const user = userEvent.setup();
      renderCard({ onMarkStale });

      await user.click(screen.getByTestId('stale-button-42'));
      expect(onMarkStale).toHaveBeenCalledTimes(1);
    });

    it('does not propagate click to onPick', async () => {
      const onPick = vi.fn();
      const onMarkStale = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick, onMarkStale });

      await user.click(screen.getByTestId('stale-button-42'));
      expect(onMarkStale).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('disables stale button when stalePending', () => {
      renderCard({ onMarkStale: vi.fn(), stalePending: true });
      expect(screen.getByTestId('stale-button-42')).toBeDisabled();
    });

    it('does not render stale button when onMarkStale not provided', () => {
      renderCard();
      expect(screen.queryByTestId('stale-button-42')).not.toBeInTheDocument();
    });
  });

  describe('blacklist button', () => {
    it('renders blacklist button with correct test id', () => {
      renderCard({ onBlacklist: vi.fn() });
      expect(screen.getByTestId('blacklist-button-42')).toBeInTheDocument();
    });

    it('calls onBlacklist when clicked', async () => {
      const onBlacklist = vi.fn();
      const user = userEvent.setup();
      renderCard({ onBlacklist });

      await user.click(screen.getByTestId('blacklist-button-42'));
      expect(onBlacklist).toHaveBeenCalledTimes(1);
    });

    it('does not propagate click to onPick', async () => {
      const onPick = vi.fn();
      const onBlacklist = vi.fn();
      const user = userEvent.setup();
      renderCard({ onPick, onBlacklist });

      await user.click(screen.getByTestId('blacklist-button-42'));
      expect(onBlacklist).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('disables blacklist button when blacklistPending', () => {
      renderCard({ onBlacklist: vi.fn(), blacklistPending: true });
      expect(screen.getByTestId('blacklist-button-42')).toBeDisabled();
    });

    it('does not render blacklist button when onBlacklist not provided', () => {
      renderCard();
      expect(screen.queryByTestId('blacklist-button-42')).not.toBeInTheDocument();
    });
  });

  describe('score delta badge', () => {
    it('shows positive score delta with + prefix', () => {
      renderCard({ scoreDelta: 24 });
      expect(screen.getByTestId('score-delta-42')).toHaveTextContent('+24');
    });

    it('shows negative score delta without + prefix', () => {
      renderCard({ scoreDelta: -18 });
      expect(screen.getByTestId('score-delta-42')).toHaveTextContent('-18');
    });

    it('does not render score delta badge when scoreDelta is null', () => {
      renderCard({ scoreDelta: null });
      expect(screen.queryByTestId('score-delta-42')).not.toBeInTheDocument();
    });
  });

  describe('winner/loser state', () => {
    it('applies ring-success class when isWinner is true', () => {
      renderCard({ isWinner: true });
      const container = screen.getByTestId('comparison-movie-card-42').firstChild;
      expect(container).toHaveClass('ring-2');
      expect(container).toHaveClass('ring-success');
    });

    it('does not apply ring classes in neutral state', () => {
      renderCard({ isWinner: undefined });
      const container = screen.getByTestId('comparison-movie-card-42').firstChild;
      expect(container).not.toHaveClass('ring-2');
    });
  });
});

describe('ComparisonMovieCardSkeleton', () => {
  it('renders skeleton elements', () => {
    const { container } = render(<ComparisonMovieCardSkeleton />);
    // Should have the wrapper div with gap-2
    expect(container.firstChild).toHaveClass('flex');
    expect(container.firstChild).toHaveClass('flex-col');
  });
});
