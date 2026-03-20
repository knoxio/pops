import { readFileSync } from "node:fs";
import type { Request, Response, NextFunction } from "express";

let apiKey: string | null = null;

function getApiKey(): string {
  if (apiKey) return apiKey;

  const filePath = process.env["FINANCE_API_KEY_FILE"];
  if (filePath) {
    apiKey = readFileSync(filePath, "utf-8").trim();
    return apiKey;
  }

  const envKey = process.env["FINANCE_API_KEY"];
  if (envKey) {
    apiKey = envKey;
    return apiKey;
  }

  throw new Error("Missing FINANCE_API_KEY_FILE or FINANCE_API_KEY");
}

/**
 * Validate API key from Authorization header.
 * Skips auth for webhook routes (those use signature verification).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Webhook routes handle their own auth via signature verification
  if (req.path.startsWith("/webhooks/")) {
    next();
    return;
  }

  // Health check is public
  if (req.path === "/health") {
    next();
    return;
  }

  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7);
  if (token !== getApiKey()) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}
