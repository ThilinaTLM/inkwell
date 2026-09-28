-- 0003_trash_stars — soft delete (Trash), stars, and invite notes.
--
-- Additive only: every statement is an `ALTER TABLE … ADD COLUMN` or a
-- `CREATE INDEX`, so the previous worker build keeps working against a
-- migrated database (it simply ignores the new columns).
--
--   * `deleted_at`  — unix-ms when the row was moved to Trash; NULL = live.
--   * `trashed_via` — id of the top-level item whose trash operation
--                     swept this row along (a folder subtree). NULL on the
--                     top-level trashed item itself, so the Trash listing
--                     is `deleted_at IS NOT NULL AND trashed_via IS NULL`.
--   * `starred_at`  — unix-ms when the owner starred the item; NULL = not
--                     starred. Starred views order by this DESC.
--   * `invites.note` — free-form admin note (≤ 200 chars, app-enforced).

ALTER TABLE `files` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `trashed_via` text;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `starred_at` integer;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `trashed_via` text;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `starred_at` integer;
--> statement-breakpoint
ALTER TABLE `invites` ADD COLUMN `note` text;
--> statement-breakpoint
CREATE INDEX `files_owner_deleted` ON `files` (`owner`,`deleted_at`);
--> statement-breakpoint
CREATE INDEX `folders_owner_deleted` ON `folders` (`owner`,`deleted_at`);
--> statement-breakpoint
CREATE INDEX `files_trashed_via` ON `files` (`trashed_via`);
--> statement-breakpoint
CREATE INDEX `folders_trashed_via` ON `folders` (`trashed_via`);
