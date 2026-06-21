export { navConfig, routes } from './routes';
export { manifest } from './manifest';

export { RecipeRenderer } from './components/RecipeRenderer';
export type {
  RecipeLineWithResolved,
  RecipeRendererProps,
  RecipeRendererVariant,
  RecipeVersionWithCompiledData,
} from './components/RecipeRenderer';
export { IngredientChip } from './components/IngredientChip';
export type { IngredientChipProps } from './components/IngredientChip';
export { TimerButton } from './components/TimerButton';
export type { TimerButtonProps } from './components/TimerButton';
export { TempBadge } from './components/TempBadge';
export type { TempBadgeProps } from './components/TempBadge';

// PRD-120 — DSL Editor (Part A scaffold + Part B autocomplete + Part C
// issues prop + Part D chip widgets + Part E reorder/renumber). Panel +
// scanner exported so downstream stories / pages can drive them
// deterministically without reaching into the dsl-editor subtree.
export { DslEditor } from './components/DslEditor';
export type { DslEditorProps } from './components/DslEditor';
export type { CompileEditorIssue, IssueSeverity } from './components/dsl-editor/issues-types';
export type {
  DslAutocompleteSources,
  PrepStateSuggestion,
  SlugKind,
  SlugSuggestion,
  VariantSuggestion,
} from './components/dsl-editor/autocomplete-types';
export { useDslAutocompleteSources } from './components/dsl-editor/use-dsl-autocomplete-sources';
export { ReorderIngredientsPanel } from './components/dsl-editor/ReorderIngredientsPanel';
export type { ReorderIngredientsPanelProps } from './components/dsl-editor/ReorderIngredientsPanel';
export { buildRenumberPlan, scanIngredientUsages, RenumberPermutationError } from './dsl/renumber';
export type {
  IngredientDeclaration,
  RenumberChange,
  RenumberPlan,
  ScanResult,
  StepBodyRef,
} from './dsl/renumber';
