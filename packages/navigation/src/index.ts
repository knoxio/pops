/**
 * @pops/navigation
 *
 * Shared navigation and search-panel utilities accessible to both
 * the shell and all app packages.
 */
export {
  registerResultComponent,
  getResultComponent,
  GenericResultComponent,
  _clearRegistry,
} from "./result-component-registry";
export type { ResultComponent, ResultComponentProps } from "./result-component-registry";
