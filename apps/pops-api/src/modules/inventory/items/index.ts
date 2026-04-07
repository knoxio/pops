export { inventoryRouter } from "./router.js";
export * from "./types.js";
export * as inventoryService from "./service.js";
// Side-effect: auto-registers inventory items search adapter
import "./search-adapter.js";
