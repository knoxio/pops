import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { MediaCard } from './MediaCard';

function renderCard(props: Partial<React.ComponentProps<typeof MediaCard>> = {}) {
  const defaults: React.ComponentProps<typeof MediaCard> = {
    id: 1,
    type: 'movie',
    title: 'Test Movie',
    year: '2024',
    posterUrl: '/poster.jpg',
    ...props,
  };
  return render(
    <MemoryRouter>
      <MediaCard {...defaults} />
    </MemoryRouter>
  );
}

describe('MediaCard', () => {
  it('renders title and year', () => {
    renderCard({ title: 'The Matrix', year: '1999' });
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('1999')).toBeInTheDocument();
  });

  it('links to the correct movie detail page', () => {
    renderCard({ id: 42, type: 'movie' });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/media/movies/42');
  });

  it('links to the correct TV detail page', () => {
    renderCard({ id: 7, type: 'tv' });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/media/tv/7');
  });

  it('shows type badge by default', () => {
    renderCard({ type: 'movie' });
    expect(screen.getByText('Movie')).toBeInTheDocument();
  });

  it('hides type badge when showTypeBadge is false', () => {
    renderCard({ type: 'movie', showTypeBadge: false });
    expect(screen.queryByText('Movie')).not.toBeInTheDocument();
  });

  it('shows TV badge for TV type', () => {
    renderCard({ type: 'tv' });
    expect(screen.getByText('TV')).toBeInTheDocument();
  });

  it('renders poster image with correct src', () => {
    renderCard({ posterUrl: '/my-poster.jpg' });
    const img = screen.getByAltText('Test Movie poster');
    expect(img).toHaveAttribute('src', '/my-poster.jpg');
  });

  it('shows placeholder when no poster URLs provided', () => {
    renderCard({ posterUrl: null, fallbackPosterUrl: null });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders fallback image when posterUrl is null but fallbackPosterUrl exists', () => {
    renderCard({ posterUrl: null, fallbackPosterUrl: '/cached.jpg' });
    const img = screen.getByAltText('Test Movie poster');
    expect(img).toHaveAttribute('src', '/cached.jpg');
  });

  it('cascades to fallback on poster image error', () => {
    renderCard({ posterUrl: '/broken.jpg', fallbackPosterUrl: '/cached.jpg' });
    const img = screen.getByAltText('Test Movie poster');
    expect(img).toHaveAttribute('src', '/broken.jpg');

    fireEvent.error(img);
    expect(img).toHaveAttribute('src', '/cached.jpg');
  });

  it('shows placeholder when both poster URLs fail', () => {
    renderCard({ posterUrl: '/broken.jpg', fallbackPosterUrl: '/also-broken.jpg' });
    const img = screen.getByAltText('Test Movie poster');

    // First error → fallback
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', '/also-broken.jpg');

    // Second error → placeholder
    fireEvent.error(img);
    expect(screen.queryByAltText('Test Movie poster')).not.toBeInTheDocument();
  });

  it('shows progress bar for TV shows', () => {
    const { container } = renderCard({ type: 'tv', progress: 65 });
    const bar = container.querySelector('[style*="width: 65%"]');
    expect(bar).toBeInTheDocument();
  });

  it('hides progress bar when progress is null', () => {
    const { container } = renderCard({ type: 'tv', progress: null });
    const bar = container.querySelector('[style*="width"]');
    expect(bar).not.toBeInTheDocument();
  });

  it('uses green color for 100% progress', () => {
    const { container } = renderCard({ type: 'tv', progress: 100 });
    const bar = container.querySelector('[style*="width: 100%"]');
    expect(bar?.className).toContain('bg-green-500');
  });

  it('truncates year from full date string', () => {
    renderCard({ year: '1994-09-23' });
    expect(screen.getByText('1994')).toBeInTheDocument();
  });

  it('renders numeric year directly', () => {
    renderCard({ year: 2024 });
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('hides year when null', () => {
    renderCard({ year: null });
    expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    renderCard({ title: 'Inception', type: 'movie' });
    expect(screen.getByLabelText('Inception (Movie)')).toBeInTheDocument();
  });
});
