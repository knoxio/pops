import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { PromptViewerPage } from './PromptViewerPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <PromptViewerPage />
    </MemoryRouter>
  );
}

describe('PromptViewerPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Prompt Templates')).toBeInTheDocument();
  });

  it('renders both prompt templates', () => {
    renderPage();
    expect(screen.getByText('Transaction Categorisation')).toBeInTheDocument();
    expect(screen.getByText('Rule Generation')).toBeInTheDocument();
  });

  it('shows model attribution for each prompt', () => {
    renderPage();
    const modelBadges = screen.getAllByText('claude-haiku-4-5-20251001');
    expect(modelBadges).toHaveLength(2);
  });

  it('displays prompt content in code blocks', () => {
    renderPage();
    expect(screen.getByText(/Reply in JSON only/)).toBeInTheDocument();
    expect(screen.getByText(/Return ONLY the JSON array/)).toBeInTheDocument();
  });

  it('is read-only with no edit controls', () => {
    renderPage();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be edited here/)).toBeInTheDocument();
  });
});
