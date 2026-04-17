import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for Radix UI components (popover, select, etc.)
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
