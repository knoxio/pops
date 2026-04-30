import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { _clearRegistry, getResultComponent, registerResultComponent } from '@pops/navigation';
import { highlightMatch } from '@pops/ui';

import { MovieSearchResult, type MovieHitData } from './MovieSearchResult';

import type { SearchHitMeta } from '@pops/navigation';

beforeEach(() => {
  _clearRegistry();
});

const baseMovie: MovieHitData & SearchHitMeta = {
  title: 'The Dark Knight',
  year: '2008',
  posterUrl: '/media/images/movie/155/poster.jpg',
  voteAverage: 9.0,
  runtime: null,
  _query: 'dark',
  _matchType: 'contains',
};

describe('MovieSearchResult', () => {
  it('renders title, year, and rating', () => {
    render(<MovieSearchResult data={baseMovie} />);
    expect(screen.getByText(/Dark/)).toBeInTheDocument();
    expect(screen.getByText('2008')).toBeInTheDocument();
    expect(screen.getByText('9.0')).toBeInTheDocument();
  });

  it('renders poster image', () => {
    render(<MovieSearchResult data={baseMovie} />);
    const img = screen.getByAltText('The Dark Knight poster');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/media/images/movie/155/poster.jpg');
  });

  it('renders placeholder when no posterUrl', () => {
    const data = { ...baseMovie, posterUrl: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders rating with star icon', () => {
    render(<MovieSearchResult data={baseMovie} />);
    expect(screen.getByTestId('rating')).toBeInTheDocument();
    expect(screen.getByText('9.0')).toBeInTheDocument();
  });

  it('hides rating when null', () => {
    const data = { ...baseMovie, voteAverage: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByTestId('rating')).not.toBeInTheDocument();
  });

  it('hides year when null', () => {
    const data = { ...baseMovie, year: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByText('2008')).not.toBeInTheDocument();
  });

  it('hides separator when year is null', () => {
    const data = { ...baseMovie, year: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('hides separator when rating is null', () => {
    const data = { ...baseMovie, voteAverage: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('renders runtime when present', () => {
    const data = { ...baseMovie, runtime: 152 };
    render(<MovieSearchResult data={data} />);
    expect(screen.getByTestId('runtime')).toHaveTextContent('2h 32m');
  });

  it('renders runtime as minutes-only when under one hour', () => {
    const data = { ...baseMovie, runtime: 45 };
    render(<MovieSearchResult data={data} />);
    expect(screen.getByTestId('runtime')).toHaveTextContent('45m');
  });

  it('hides runtime when null', () => {
    const data = { ...baseMovie, runtime: null };
    render(<MovieSearchResult data={data} />);
    expect(screen.queryByTestId('runtime')).not.toBeInTheDocument();
  });

  describe('registration', () => {
    it('can be registered and retrieved for movies domain', () => {
      registerResultComponent('movies', MovieSearchResult);
      const Component = getResultComponent('movies');
      expect(Component).toBe(MovieSearchResult);
    });
  });
});

describe('highlightMatch', () => {
  it('highlights exact match', () => {
    const { container } = render(
      <span>{highlightMatch('Interstellar', 'Interstellar', 'exact')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('Interstellar');
  });

  it('highlights prefix match', () => {
    const { container } = render(
      <span>{highlightMatch('The Dark Knight', 'The Dark', 'prefix')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('The Dark');
  });

  it('highlights contains match', () => {
    const { container } = render(
      <span>{highlightMatch('The Dark Knight', 'Dark', 'contains')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('Dark');
  });

  it('returns plain text when query is empty', () => {
    const { container } = render(<span>{highlightMatch('Interstellar', '', 'exact')}</span>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Interstellar');
  });

  it('returns plain text when no match found', () => {
    const { container } = render(<span>{highlightMatch('Interstellar', 'XYZ', 'contains')}</span>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Interstellar');
  });
});
