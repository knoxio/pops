export { budgetsRouter } from "./router.js";
export * from "./types.js";
export * as budgetsService from "./service.js";
// Side-effect: auto-registers budgets search adapter
import "./search-adapter.js";
