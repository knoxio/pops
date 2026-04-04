export type { SearchAdapter, SearchHit, Query, SearchContext, StructuredFilter } from "./types.js";
export { registerSearchAdapter, getAdapters, resetRegistry } from "./registry.js";
export { searchAll, showMore } from "./engine.js";
export type { SearchSection, SearchAllResult, ShowMoreResult } from "./engine.js";
