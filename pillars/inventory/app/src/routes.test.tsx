import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SearchPreservingRedirect } from './routes';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

describe('SearchPreservingRedirect', () => {
  it('redirects /inventory/report to /inventory/reports', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/report']}>
        <Routes>
          <Route
            path="/inventory/report"
            element={<SearchPreservingRedirect to="/inventory/reports" />}
          />
          <Route path="/inventory/reports" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location').textContent).toBe('/inventory/reports');
  });

  it('redirects /inventory/report/insurance to /inventory/reports/insurance', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/report/insurance']}>
        <Routes>
          <Route
            path="/inventory/report/insurance"
            element={<SearchPreservingRedirect to="/inventory/reports/insurance" />}
          />
          <Route path="/inventory/reports/insurance" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location').textContent).toBe('/inventory/reports/insurance');
  });

  it('preserves ?locationId query string when redirecting /inventory/report/insurance', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/report/insurance?locationId=loc-123']}>
        <Routes>
          <Route
            path="/inventory/report/insurance"
            element={<SearchPreservingRedirect to="/inventory/reports/insurance" />}
          />
          <Route path="/inventory/reports/insurance" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location').textContent).toBe(
      '/inventory/reports/insurance?locationId=loc-123'
    );
  });
});
