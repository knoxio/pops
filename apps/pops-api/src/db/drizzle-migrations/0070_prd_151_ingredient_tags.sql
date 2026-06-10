CREATE TABLE `ingredient_tags` (
	`ingredient_id` integer NOT NULL,
	`tag` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`ingredient_id`, `tag`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Case-insensitive index — the autocomplete picker filters by partial match
-- without forcing the writer to remember the canonical casing.
CREATE INDEX `idx_ingredient_tags_tag` ON `ingredient_tags` (`tag` COLLATE NOCASE);--> statement-breakpoint
-- Expression index over the namespace prefix (segment before the first `:`).
-- PRD-152's generator runs `WHERE tag LIKE 'store-section:%'` per recipe-line;
-- the expression index lets SQLite skip the table scan. `WHERE INSTR(tag, ':')
-- > 0` keeps the index sparse — namespace-less tags don't bloat it.
CREATE INDEX `idx_ingredient_tags_namespace` ON `ingredient_tags` (SUBSTR(`tag`, 1, INSTR(`tag` || ':', ':') - 1)) WHERE INSTR(`tag`, ':') > 0;
