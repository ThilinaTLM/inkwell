-- Drop the per-user "Inbox" concept. Folders and scenes become first-class
-- peers at every level, including the root. Migration steps:
--
--   1. Move scenes that lived inside any user's Inbox to the root level
--      (`folder_id = NULL`).
--   2. Reparent folders that lived inside an Inbox so they become roots
--      (`parent_id = NULL`).
--   3. Delete the now-empty Inbox folders themselves.
--   4. Garbage-collect taggings/shares that pointed at those deleted
--      Inbox folders (defensive — they shouldn't normally exist).
--   5. Recreate `folders` without the `is_default` column / its CHECK /
--      its partial unique index. SQLite can't `DROP COLUMN` when a CHECK
--      references the column, so we use the create-copy-drop-rename
--      recipe.

UPDATE `scenes` SET `folder_id` = NULL
  WHERE `folder_id` IN (SELECT `id` FROM `folders` WHERE `is_default` = 1);
--> statement-breakpoint
UPDATE `folders` SET `parent_id` = NULL
  WHERE `parent_id` IN (SELECT `id` FROM `folders` WHERE `is_default` = 1);
--> statement-breakpoint
DELETE FROM `folders` WHERE `is_default` = 1;
--> statement-breakpoint
DELETE FROM `taggings`
  WHERE `target_type` = 'folder'
    AND `target_id` NOT IN (SELECT `id` FROM `folders`);
--> statement-breakpoint
DELETE FROM `shares`
  WHERE `target_type` = 'folder'
    AND `target_id` NOT IN (SELECT `id` FROM `folders`);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folders_name_len" CHECK(length("__new_folders"."name") BETWEEN 1 AND 200),
	CONSTRAINT "folders_no_self_parent" CHECK("__new_folders"."parent_id" IS NULL OR "__new_folders"."parent_id" <> "__new_folders"."id")
);
--> statement-breakpoint
INSERT INTO `__new_folders`("id", "owner", "parent_id", "name", "created_at", "updated_at") SELECT "id", "owner", "parent_id", "name", "created_at", "updated_at" FROM `folders`;--> statement-breakpoint
DROP TABLE `folders`;--> statement-breakpoint
ALTER TABLE `__new_folders` RENAME TO `folders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `folders_owner_parent` ON `folders` (`owner`,`parent_id`,`name`);
