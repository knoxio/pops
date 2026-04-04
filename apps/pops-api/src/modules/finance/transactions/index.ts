export { transactionsRouter } from "./router.js";
export * from "./types.js";
export * as transactionsService from "./service.js";

// Side-effect: registers the transactions search adapter
import "./search-adapter.js";
