ALTER TABLE `scenes` ADD `thumb_updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Backfill: existing thumbnails get a non-zero cache-bust token so the
-- first dashboard load post-migration shows them without forcing a
-- re-upload. New uploads will overwrite this with `now()`.
UPDATE `scenes` SET `thumb_updated_at` = `updated_at` WHERE `has_thumb` = 1;
