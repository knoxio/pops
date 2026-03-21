/**
 * Discovery tRPC router — preference profile queries.
 */
import { router, protectedProcedure } from "../../../trpc.js";
import * as service from "./service.js";

export const discoveryRouter = router({
  /** Get computed preference profile (genre affinities, dimension weights, genre distribution). */
  profile: protectedProcedure.query(() => {
    return { data: service.getPreferenceProfile() };
  }),
});
