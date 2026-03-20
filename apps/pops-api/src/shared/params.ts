/**
 * Helpers for extracting typed route parameters from Express requests.
 * Express 5 types params as string | string[] — these helpers normalize to string.
 */
import type { Request } from "express";
import { HttpError } from "./errors.js";

/** Extract a required route param as a single string. Throws 400 if missing or array. */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined) {
    throw new HttpError(400, `Missing required parameter: ${name}`);
  }
  if (Array.isArray(value)) {
    throw new HttpError(400, `Parameter '${name}' must be a single value`);
  }
  return value;
}
