/**
 * @pops/app-food — Food app package
 *
 * Exports the module manifest, route table, and nav config consumed by the
 * shell. Pages and services are added incrementally per the food theme PRDs
 * (`docs/themes/07-food/`).
 */
export { navConfig, routes } from './routes';
export { manifest } from './manifest';

// PRD-121 — DSL Renderer.
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

// PRD-120 — DSL Editor (Part A scaffold + Part C issues prop + Part D chip widgets).
export { DslEditor } from './components/DslEditor';
export type { DslEditorProps } from './components/DslEditor';
export type { CompileEditorIssue, IssueSeverity } from './components/dsl-editor/issues-types';
