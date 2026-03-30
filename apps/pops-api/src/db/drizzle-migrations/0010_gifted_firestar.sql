CREATE TABLE `sync_job_results` (
	`id` text PRIMARY KEY NOT NULL,
	`job_type` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	`progress` text,
	`result` text,
	`error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_job_results_type_completed` ON `sync_job_results` (`job_type`,`completed_at`);