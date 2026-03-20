/**
 * tRPC initialization, context, and base procedures.
 * All tRPC routers extend from the procedures defined here.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { verifyCloudflareJWT } from "./middleware/cloudflare-jwt.js";

/**
 * User context extracted from Cloudflare Access JWT
 */
export interface User {
  email: string;
}

/**
 * tRPC context available in all procedures
 */
export interface Context {
  user: User | null;
}

/**
 * Create tRPC context from Express request.
 * Validates Cloudflare Access JWT and extracts user info.
 * In development, bypasses JWT check for local testing.
 */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  // In development, skip JWT validation and use mock user
  if (process.env["NODE_ENV"] !== "production") {
    return {
      user: {
        email: "dev@example.com",
      },
    };
  }

  const token = req.headers["cf-access-jwt-assertion"];

  if (typeof token === "string") {
    try {
      const payload = await verifyCloudflareJWT(token);
      return {
        user: {
          email: payload.email,
        },
      };
    } catch (error) {
      console.error("[trpc] JWT verification failed:", error);
      return { user: null };
    }
  }

  return { user: null };
}

export type ContextType = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

/** Base router for composing routers. */
export const router = t.router;

/** Base procedure for all endpoints (no auth required). */
export const publicProcedure = t.procedure;

/**
 * Protected procedure that requires valid Cloudflare Access JWT.
 * Use this for all authenticated endpoints.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid Cloudflare Access JWT",
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});
