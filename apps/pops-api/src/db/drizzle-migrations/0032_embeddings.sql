CREATE TABLE `embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`content_preview` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_embeddings_source_chunk` ON `embeddings` (`source_type`,`source_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `idx_embeddings_source_type` ON `embeddings` (`source_type`);--> statement-breakpoint
CREATE INDEX `idx_embeddings_content_hash` ON `embeddings` (`content_hash`);
