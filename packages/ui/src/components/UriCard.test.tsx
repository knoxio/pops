/**
 * Tests for the <UriCard> renderer (PRD-101 US-08).
 *
 * Each test asserts the component renders the right placeholder for the
 * matching `UriResolverResult.kind`. Wires through the consumer-supplied
 * `renderObject` for the success case so per-domain cards can take over
 * once the registry consumer ships.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UriCard } from './UriCard';

import type { UriResolverResult } from '@pops/types';

describe('<UriCard>', () => {
  it('renders module-absent placeholder for an absent module', () => {
    const resolution: UriResolverResult = { kind: 'module-absent', moduleId: 'media' };
    render(<UriCard resolution={resolution} />);
    expect(screen.getByText(/Module not installed/i)).toBeInTheDocument();
    expect(screen.getByText(/media/i)).toBeInTheDocument();
  });

  it('renders not-found placeholder with the typed reference', () => {
    const resolution: UriResolverResult = {
      kind: 'not-found',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
    };
    render(<UriCard resolution={resolution} />);
    expect(screen.getByText(/Not found/i)).toBeInTheDocument();
    expect(screen.getByText('tx-1')).toBeInTheDocument();
  });

  it('renders malformed placeholder with the URI and reason', () => {
    const resolution: UriResolverResult = {
      kind: 'malformed',
      uri: 'not-a-pops-uri',
      reason: "URI must start with 'pops:'",
    };
    render(<UriCard resolution={resolution} />);
    expect(screen.getByText(/Broken link/i)).toBeInTheDocument();
    expect(screen.getByText('not-a-pops-uri')).toBeInTheDocument();
    expect(screen.getByText(/must start with 'pops:'/)).toBeInTheDocument();
  });

  it('renders the default object card when no renderer is supplied', () => {
    const resolution: UriResolverResult = {
      kind: 'object',
      moduleId: 'inventory',
      type: 'item',
      id: 'item-1',
      data: { name: 'Vacuum' },
    };
    render(<UriCard resolution={resolution} />);
    expect(screen.getByText(/inventory · item-1/)).toBeInTheDocument();
  });

  it('uses the consumer-supplied renderObject for the object kind', () => {
    const resolution: UriResolverResult = {
      kind: 'object',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
      data: { description: 'Coffee' },
    };
    render(
      <UriCard
        resolution={resolution}
        renderObject={({ data }) => {
          const desc = (data as { description: string }).description;
          return <div data-testid="custom">{desc}</div>;
        }}
      />
    );
    expect(screen.getByTestId('custom')).toHaveTextContent('Coffee');
  });
});
