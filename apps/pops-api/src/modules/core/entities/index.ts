export { entitiesRouter } from "./router.js";
export * from "./types.js";
export * as entitiesService from "./service.js";

// Side-effect: registers the entities search adapter
import "./search-adapter.js";
