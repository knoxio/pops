/**
 * PRD-133 — RTL coverage for the read-only prompt viewer.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FOOD_PROMPTS } from '../../ai/prompt-registry.js';
import { PromptViewerPage } from '../PromptViewerPage.js';

describe('PRD-133 — PromptViewerPage', () => {
  it('renders the page header + editing-hint footer text', () => {
    render(<PromptViewerPage />);
    expect(
      screen.getByRole('heading', { name: /prompt templates/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited here/i)).toBeInTheDocument();
  });

  it('renders one article per registry entry with title + PRD + model + version', () => {
    render(<PromptViewerPage />);
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(FOOD_PROMPTS.length);

    for (const entry of FOOD_PROMPTS) {
      const heading = screen.getByRole('heading', { name: entry.title, level: 2 });
      const article = heading.closest('article');
      expect(article).not.toBeNull();
      const scope = within(article as HTMLElement);
      expect(scope.getByText(entry.prd)).toBeInTheDocument();
      expect(scope.getByText(entry.model)).toBeInTheDocument();
      expect(scope.getByText(entry.version)).toBeInTheDocument();
    }
  });

  it('renders the full template inside a <pre> for each entry', () => {
    const { container } = render(<PromptViewerPage />);
    const pres = container.querySelectorAll('pre');
    expect(pres.length).toBe(FOOD_PROMPTS.length);
    for (let i = 0; i < FOOD_PROMPTS.length; i++) {
      expect(pres[i]?.textContent).toContain(FOOD_PROMPTS[i]!.template);
    }
  });
});
