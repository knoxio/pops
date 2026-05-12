import { expect, type Page } from '@playwright/test';

import { useRealApi as enableRealApi } from './use-real-api';

export async function bootShellAndAwaitSearch(page: Page): Promise<void> {
  await enableRealApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/finance\/?$/);
  await expect(page.getByRole('textbox', { name: 'Search POPS' })).toBeVisible();
}

export async function unrouteAll(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}
