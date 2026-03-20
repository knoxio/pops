/**
 * Zod validation middleware factory.
 * Validates request body or query against a Zod schema.
 */
import type { Request, Response, NextFunction } from "express";
import type { ZodType, ZodIssue } from "zod";
import { ValidationError } from "./errors.js";

type RequestField = "body" | "query" | "params";

/** Format Zod issues into a readable array of field-level errors. */
function formatIssues(issues: ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Returns Express middleware that validates `req[field]` against the given schema.
 * On success for "body", replaces req.body with the parsed (coerced/defaulted) value.
 * For "query"/"params", validates only — the route handler uses req.query/req.params as normal.
 * On failure, throws a ValidationError caught by the global error handler.
 */
export function validate<T>(schema: ZodType<T>, field: RequestField = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[field]);
    if (!result.success) {
      throw new ValidationError(formatIssues(result.error.issues));
    }
    // Only replace body — query/params have readonly-ish Express types
    if (field === "body") {
      req.body = result.data;
    }
    next();
  };
}
