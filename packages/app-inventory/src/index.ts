/**
 * @pops/app-inventory — Inventory app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load inventory pages under /inventory/*.
 */
export { routes, navConfig } from "./routes";

// Side-effect: register search result components
import "./components/search/register";
