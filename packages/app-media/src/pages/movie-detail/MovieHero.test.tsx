import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MovieHero } from './MovieHero';

vi.mock('./MovieHeroActions', () => ({
  MovieHeroActions: () => null,
}));

vi.mock('./MovieHeroBreadcrumb', () => ({
  MovieHeroBreadcrumb: () => null,
}));

function makeMovie(overrides: Partial<Parameters<typeof MovieHero>[0]['movie']> = {}) {
  return {
    id: 1,
    tmdbId: 278,
    title: 'The Shawshank Redemption',
    tagline: null,
    runtime: 142,
    voteAverage: 9.3,
    posterPath: '/poster.jpg',
    posterUrl: '/media/images/movie/278/poster.jpg',
    backdropUrl: null,
    logoUrl: null,
    rotationStatus: null,
    rotationExpiresAt: null,
    ...overrides,
  };
}

function renderHero(movieOverrides: Partial<Parameters<typeof MovieHero>[0]['movie']> = {}) {
  return render(
    <MovieHero
      movie={makeMovie(movieOverrides)}
      year={1994}
      daysSinceWatch={null}
      staleness={0}
      pendingDebrief={undefined}
    />
  );
}

describe('MovieHero — HeroPoster', () => {
  it('renders poster image when posterUrl is provided', () => {
    renderHero();
    const img = screen.getByAltText('The Shawshank Redemption poster');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/media/images/movie/278/poster.jpg');
  });

  it('renders placeholder div when posterUrl is null', () => {
    renderHero({ posterUrl: null });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to placeholder div when image fires onError', () => {
    renderHero();
    const img = screen.getByAltText('The Shawshank Redemption poster');
    fireEvent.error(img);
    expect(screen.queryByAltText('The Shawshank Redemption poster')).not.toBeInTheDocument();
  });

  it('resets error state when posterUrl prop changes', () => {
    const { rerender } = render(
      <MovieHero
        movie={makeMovie({ posterUrl: '/media/images/movie/278/poster.jpg' })}
        year={1994}
        daysSinceWatch={null}
        staleness={0}
        pendingDebrief={undefined}
      />
    );

    const img = screen.getByAltText('The Shawshank Redemption poster');
    fireEvent.error(img);
    expect(screen.queryByAltText('The Shawshank Redemption poster')).not.toBeInTheDocument();

    rerender(
      <MovieHero
        movie={makeMovie({
          title: 'The Godfather',
          posterUrl: '/media/images/movie/238/poster.jpg',
        })}
        year={1972}
        daysSinceWatch={null}
        staleness={0}
        pendingDebrief={undefined}
      />
    );

    expect(screen.getByAltText('The Godfather poster')).toBeInTheDocument();
  });
});
