/**
 * GRAPH_COLORS — design token palette for Canvas 2D graph rendering.
 *
 * Canvas 2D cannot resolve CSS custom properties at paint time, so these
 * colors are intentionally hardcoded hex values rather than CSS variables.
 * Structural colors (edges, labels) should use getComputedStyle at render
 * time to support dark mode.
 */
export const GRAPH_COLORS = {
  types: {
    electronics: '#6366f1', // indigo-500
    furniture: '#f59e0b', // amber-500
    appliance: '#10b981', // emerald-500
    tool: '#ef4444', // red-500
    clothing: '#8b5cf6', // violet-500
    kitchenware: '#ec4899', // pink-500
    sport: '#14b8a6', // teal-500
    vehicle: '#f97316', // orange-500
    other: '#64748b', // slate-500
  } as Record<string, string | undefined>,
  node: {
    default: '#94a3b8', // slate-400
    current: '#3b82f6', // blue-500
    currentBorder: '#1d4ed8', // blue-700 — always high-contrast
    iconText: '#ffffff', // always white on filled node
  },
  fallbacks: {
    edge: '#cbd5e1',
    label: '#334155',
    legendText: '#475569',
  },
} as const;
