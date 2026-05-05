-- 0002_files_rename — rebrand scenes → files.
--
-- This migration:
--   1. Rebuilds the `scenes` table as `files`, with cleanly-named CHECK
--      constraints (`files_name_len`, `files_has_thumb_bool`). SQLite cannot
--      rename CHECK constraints in place, so we copy rows into a freshly-
--      created table with the right names and drop the old one.
--   2. Recreates the three hot-path indexes under their new `files_*` names.
--   3. Updates the polymorphic enum values stored in `taggings.target_type`
--      and `shares.target_type` from `'scene'` to `'file'` so existing tag
--      assignments and share tokens keep resolving after the rename.
--
-- R2 object keys (`scenes/{id}.json`, `thumbs/{id}.svg`) are intentionally
-- unchanged — they are storage-internal and renaming would require copying
-- every blob with no user-visible benefit. The worker's `r2FileKey` helper
-- documents this divergence.
--
-- Foreign-key references from `scenes.folder_id → folders.id` and
-- `scenes.owner → users.id` are recreated against the new `files` table.

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`folder_id` text,
	`name` text DEFAULT 'Untitled' NOT NULL,
	`kind` text DEFAULT 'excalidraw' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`has_thumb` integer DEFAULT false NOT NULL,
	`thumb_updated_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "files_name_len" CHECK(length("name") BETWEEN 1 AND 200),
	CONSTRAINT "files_has_thumb_bool" CHECK("has_thumb" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `files` (
	`id`, `owner`, `folder_id`, `name`, `kind`, `version`,
	`size_bytes`, `has_thumb`, `thumb_updated_at`, `created_at`, `updated_at`
)
SELECT
	`id`, `owner`, `folder_id`, `name`, `kind`, `version`,
	`size_bytes`, `has_thumb`, `thumb_updated_at`, `created_at`, `updated_at`
FROM `scenes`;
--> statement-breakpoint
DROP TABLE `scenes`;
--> statement-breakpoint
CREATE INDEX `files_owner_folder_updated` ON `files` (`owner`,`folder_id`,"updated_at" DESC);
--> statement-breakpoint
CREATE INDEX `files_owner_updated` ON `files` (`owner`,"updated_at" DESC);
--> statement-breakpoint
CREATE INDEX `files_owner_name` ON `files` (`owner`,`name`);
--> statement-breakpoint
UPDATE `taggings` SET `target_type` = 'file' WHERE `target_type` = 'scene';
--> statement-breakpoint
UPDATE `shares` SET `target_type` = 'file' WHERE `target_type` = 'scene';
--> statement-breakpoint
PRAGMA foreign_keys=ON;
