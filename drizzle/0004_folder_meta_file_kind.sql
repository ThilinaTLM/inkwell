-- 0004_folder_meta_file_kind — project metadata on folders and generic
-- uploaded files ("cloud storage").
--
-- Additive only (`ALTER TABLE … ADD COLUMN`), so the previous worker build
-- keeps working against a migrated database.
--
--   * `folders.icon`        — curated icon key (e.g. "rocket"); NULL = default.
--   * `folders.color`       — curated colour key (e.g. "orange"); NULL = default.
--   * `folders.description` — free text, ≤ 280 chars (app-enforced).
--   * `folders.status`      — "active" | "paused" | "done"; NULL = not set.
--   * `folders.pinned_at`   — unix-ms when pinned to Home; NULL = not pinned.
--   * `files.mime`          — Content-Type of an uploaded `kind = 'file'`
--                             blob; NULL for every other kind. (`files.kind`
--                             is an unconstrained text column, so the new
--                             `file` kind needs no schema change.)

ALTER TABLE `folders` ADD COLUMN `icon` text;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `color` text;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `status` text;
--> statement-breakpoint
ALTER TABLE `folders` ADD COLUMN `pinned_at` integer;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `mime` text;
