import { type Router as ExpressRouter, Router } from "express";
import { getDb } from "../db.js";

const router: ExpressRouter = Router();

const apiVersion =
  process.env.BUILD_VERSION && process.env.BUILD_VERSION !== "dev"
    ? `a${process.env.BUILD_VERSION}`
    : "dev";

router.get("/health", (_req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    if (row?.ok === 1) {
      res.json({ status: "ok", version: apiVersion });
    } else {
      res.status(503).json({ status: "unhealthy", reason: "sqlite check failed" });
    }
  } catch {
    res.status(503).json({ status: "unhealthy", reason: "database unreachable" });
  }
});

export default router;
