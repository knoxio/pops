-- Migrate the global ai.model setting from the deprecated Haiku snapshot id
-- to the family alias (issue #2463 / matches the family-aliasing in #2440 / #2442).
-- Idempotent: only updates when the legacy snapshot value is present.
UPDATE `settings`
   SET `value` = 'claude-haiku-4-5'
 WHERE `key` = 'ai.model'
   AND `value` = 'claude-haiku-4-5-20251001';
