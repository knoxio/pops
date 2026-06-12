-- Cerebrum pillar baseline for the glia slice (PRD-181 US-01).
--
-- Mirrors the glia_actions / glia_trust_state schema as it stands in the
-- shared pops.db after the safety migration 0047_glia_actions (issue #2330).
-- Column definitions and indexes are copied verbatim so a fresh
-- cerebrum.db matches the shared shape byte-for-byte; the boot-time
-- backfill ATTACHes pops.db and copies rows across without column-rename
-- gymnastics.
--
-- Glia tracks every autonomous-action proposal (prune, consolidate,
-- link, audit) plus a per-action-type trust state that drives the
-- three-phase graduation model (propose → act_report → silent) — see
-- ADR-021 / PRD-086 for the full spec. Action execution and digest
-- generation stay in pops-api; this slice is the persistence layer only.

CREATE TABLE `glia_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`action_type` text NOT NULL,
	`affected_ids` text NOT NULL,
	`rationale` text NOT NULL,
	`payload` text,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`user_decision` text,
	`user_note` text,
	`executed_at` text,
	`decided_at` text,
	`reverted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_glia_actions_action_type` ON `glia_actions` (`action_type`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_status` ON `glia_actions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_phase` ON `glia_actions` (`phase`);--> statement-breakpoint
CREATE INDEX `idx_glia_actions_created_at` ON `glia_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `glia_trust_state` (
	`action_type` text PRIMARY KEY NOT NULL,
	`current_phase` text NOT NULL,
	`approved_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`reverted_count` integer DEFAULT 0 NOT NULL,
	`autonomous_since` text,
	`last_revert_at` text,
	`graduated_at` text,
	`updated_at` text NOT NULL
);
