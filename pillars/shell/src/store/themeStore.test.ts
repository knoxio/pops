/**
 * Tests for theme store
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useThemeStore } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useThemeStore.setState({ theme: 'dark' });
  });

  it('should have dark as default theme', () => {
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('should toggle theme from dark to light', () => {
    const { toggleTheme } = useThemeStore.getState();
    toggleTheme();

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });

  it('should toggle theme from light to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    const { toggleTheme } = useThemeStore.getState();
    toggleTheme();

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('should set theme directly to light', () => {
    const { setTheme } = useThemeStore.getState();
    setTheme('light');

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });

  it('should set theme directly to dark', () => {
    useThemeStore.setState({ theme: 'light' });
    const { setTheme } = useThemeStore.getState();
    setTheme('dark');

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('should maintain state across multiple operations', () => {
    const { toggleTheme } = useThemeStore.getState();
    toggleTheme(); // dark -> light
    toggleTheme(); // light -> dark
    toggleTheme(); // dark -> light

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });
});
