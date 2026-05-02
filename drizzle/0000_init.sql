CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folders_name_len" CHECK(length("folders"."name") BETWEEN 1 AND 200),
	CONSTRAINT "folders_no_self_parent" CHECK("folders"."parent_id" IS NULL OR "folders"."parent_id" <> "folders"."id")
);
--> statement-breakpoint
CREATE INDEX `folders_owner_parent` ON `folders` (`owner`,`parent_id`,`name`);--> statement-breakpoint
CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`used_by_user_id` text,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invites_created_by` ON `invites` (`created_by`);--> statement-breakpoint
CREATE INDEX `invites_unused` ON `invites` (`used_at`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`folder_id` text,
	`name` text DEFAULT 'Untitled' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`has_thumb` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "scenes_name_len" CHECK(length("scenes"."name") BETWEEN 1 AND 200),
	CONSTRAINT "scenes_has_thumb_bool" CHECK("scenes"."has_thumb" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `scenes_owner_folder_updated` ON `scenes` (`owner`,`folder_id`,"updated_at" DESC);--> statement-breakpoint
CREATE INDEX `scenes_owner_updated` ON `scenes` (`owner`,"updated_at" DESC);--> statement-breakpoint
CREATE INDEX `scenes_owner_name` ON `scenes` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `shares` (
	`token` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`permission` text NOT NULL,
	`allow_download` integer DEFAULT true NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_accessed_at` integer,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "shares_allow_download_bool" CHECK("shares"."allow_download" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `shares_owner_created` ON `shares` (`owner`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `shares_target` ON `shares` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `taggings` (
	`tag_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tag_id`, `target_type`, `target_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `taggings_target` ON `taggings` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `taggings_owner_tag` ON `taggings` (`owner`,`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tags_name_len" CHECK(length("tags"."name") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name` ON `tags` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_is_admin_bool" CHECK("users"."is_admin" IN (0, 1)),
	CONSTRAINT "users_disabled_bool" CHECK("users"."disabled" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);