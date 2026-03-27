import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for Radix UI components (popover, select, etc.)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
