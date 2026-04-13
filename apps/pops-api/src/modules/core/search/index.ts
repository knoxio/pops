export type { SearchAllResult, SearchSection, ShowMoreResult } from './engine.js';
export { searchAll, showMore } from './engine.js';
export { parseQuery } from './query-parser.js';
export { getAdapters, registerSearchAdapter, resetRegistry } from './registry.js';
export type { Query, SearchAdapter, SearchContext, SearchHit, StructuredFilter } from './types.js';
